#include "loaders/FbxLoader.h"
#include "ofbx.h"
#include <emscripten.h>
#include <cmath>

static glm::vec3 toGlm(const ofbx::Vec3& v) {
    return glm::vec3(static_cast<float>(v.x), static_cast<float>(v.y), static_cast<float>(v.z));
}

static glm::vec3 computeNormal(const glm::vec3& v0, const glm::vec3& v1, const glm::vec3& v2) {
    glm::vec3 e1 = v1 - v0;
    glm::vec3 e2 = v2 - v0;
    glm::vec3 n = glm::cross(e1, e2);
    float len = glm::length(n);
    return (len > 1e-8f) ? (n / len) : glm::vec3(0.0f, 1.0f, 0.0f);
}

std::vector<MeshData> FbxLoader::load(const uint8_t* data, size_t size) {
    std::vector<MeshData> result;

    ofbx::LoadFlags flags = ofbx::LoadFlags::NONE;

    ofbx::IScene* scene = ofbx::load(data, static_cast<int>(size), static_cast<ofbx::u16>(flags));
    if (!scene) {
        emscripten_log(EM_LOG_ERROR, "FBX load error: %s", ofbx::getError());
        return result;
    }

    int meshCount = scene->getMeshCount();
    for (int mi = 0; mi < meshCount; mi++) {
        const ofbx::Mesh* fbxMesh = scene->getMesh(mi);
        const ofbx::GeometryData& geomData = fbxMesh->getGeometryData();

        ofbx::Vec3Attributes positions = geomData.getPositions();
        ofbx::Vec3Attributes normals = geomData.getNormals();

        if (positions.count == 0) continue;

        // Use partitions for triangulation
        int partCount = geomData.getPartitionCount();

        for (int pi = 0; pi < partCount; pi++) {
            ofbx::GeometryPartition partition = geomData.getPartition(pi);
            MeshData meshData;

            for (int poly = 0; poly < partition.polygon_count; poly++) {
                const ofbx::GeometryPartition::Polygon& p = partition.polygons[poly];

                // Triangulate polygon (fan triangulation)
                for (int tri = 0; tri < p.vertex_count - 2; tri++) {
                    int idx0 = p.from_vertex;
                    int idx1 = p.from_vertex + tri + 1;
                    int idx2 = p.from_vertex + tri + 2;

                    Vertex v0, v1, v2;
                    v0.position = toGlm(positions.get(idx0));
                    v1.position = toGlm(positions.get(idx1));
                    v2.position = toGlm(positions.get(idx2));

                    if (normals.count > 0) {
                        v0.normal = toGlm(normals.get(idx0));
                        v1.normal = toGlm(normals.get(idx1));
                        v2.normal = toGlm(normals.get(idx2));
                    } else {
                        glm::vec3 n = computeNormal(v0.position, v1.position, v2.position);
                        v0.normal = n;
                        v1.normal = n;
                        v2.normal = n;
                    }

                    uint32_t base = static_cast<uint32_t>(meshData.vertices.size());
                    meshData.vertices.push_back(v0);
                    meshData.vertices.push_back(v1);
                    meshData.vertices.push_back(v2);
                    meshData.indices.push_back(base);
                    meshData.indices.push_back(base + 1);
                    meshData.indices.push_back(base + 2);
                }
            }

            if (!meshData.vertices.empty()) {
                result.push_back(std::move(meshData));
            }
        }

        // If no partitions, try direct vertex access
        if (partCount == 0 && positions.count > 0) {
            MeshData meshData;
            meshData.vertices.resize(positions.count);
            for (int i = 0; i < positions.count; i++) {
                meshData.vertices[i].position = toGlm(positions.get(i));
                if (normals.count > 0) {
                    meshData.vertices[i].normal = toGlm(normals.get(i));
                } else {
                    meshData.vertices[i].normal = glm::vec3(0.0f, 1.0f, 0.0f);
                }
            }
            // Generate sequential triangle indices
            for (int i = 0; i + 2 < positions.count; i += 3) {
                meshData.indices.push_back(static_cast<uint32_t>(i));
                meshData.indices.push_back(static_cast<uint32_t>(i + 1));
                meshData.indices.push_back(static_cast<uint32_t>(i + 2));
            }
            // Compute normals if not present
            if (normals.count == 0) {
                for (size_t i = 0; i + 2 < meshData.indices.size(); i += 3) {
                    glm::vec3 n = computeNormal(
                        meshData.vertices[meshData.indices[i]].position,
                        meshData.vertices[meshData.indices[i+1]].position,
                        meshData.vertices[meshData.indices[i+2]].position
                    );
                    meshData.vertices[meshData.indices[i]].normal = n;
                    meshData.vertices[meshData.indices[i+1]].normal = n;
                    meshData.vertices[meshData.indices[i+2]].normal = n;
                }
            }
            if (!meshData.vertices.empty() && !meshData.indices.empty()) {
                result.push_back(std::move(meshData));
            }
        }
    }

    scene->destroy();

    emscripten_log(EM_LOG_CONSOLE, "FBX loaded: %zu mesh(es)", result.size());
    return result;
}
