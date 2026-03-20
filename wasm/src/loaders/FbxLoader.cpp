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

LoadResult FbxLoader::load(const uint8_t* data, size_t size) {
    LoadResult result;

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
        ofbx::Vec2Attributes uvs = geomData.getUVs();

        if (positions.count == 0) continue;

        // Extract material from FBX mesh
        MaterialData fbxMaterial;
        if (fbxMesh->getMaterialCount() > 0) {
            const ofbx::Material* mat = fbxMesh->getMaterial(0);
            if (mat) {
                ofbx::Color diffuse = mat->getDiffuseColor();
                fbxMaterial.baseColor = glm::vec3(diffuse.r, diffuse.g, diffuse.b);
            }
        }

        // Use partitions for triangulation
        int partCount = geomData.getPartitionCount();

        for (int pi = 0; pi < partCount; pi++) {
            ofbx::GeometryPartition partition = geomData.getPartition(pi);
            MeshData meshData;
            meshData.material = fbxMaterial;

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

                    if (uvs.count > 0) {
                        ofbx::Vec2 uv0 = uvs.get(idx0);
                        ofbx::Vec2 uv1 = uvs.get(idx1);
                        ofbx::Vec2 uv2 = uvs.get(idx2);
                        v0.texCoord = glm::vec2(static_cast<float>(uv0.x), static_cast<float>(uv0.y));
                        v1.texCoord = glm::vec2(static_cast<float>(uv1.x), static_cast<float>(uv1.y));
                        v2.texCoord = glm::vec2(static_cast<float>(uv2.x), static_cast<float>(uv2.y));
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
                result.meshes.push_back(std::move(meshData));
            }
        }

        // If no partitions, try direct vertex access
        if (partCount == 0 && positions.count > 0) {
            MeshData meshData;
            meshData.material = fbxMaterial;
            meshData.vertices.resize(positions.count);
            for (int i = 0; i < positions.count; i++) {
                meshData.vertices[i].position = toGlm(positions.get(i));
                if (normals.count > 0) {
                    meshData.vertices[i].normal = toGlm(normals.get(i));
                } else {
                    meshData.vertices[i].normal = glm::vec3(0.0f, 1.0f, 0.0f);
                }
                if (uvs.count > 0) {
                    ofbx::Vec2 uv = uvs.get(i);
                    meshData.vertices[i].texCoord = glm::vec2(static_cast<float>(uv.x), static_cast<float>(uv.y));
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
                result.meshes.push_back(std::move(meshData));
            }
        }
    }

    scene->destroy();

    emscripten_log(EM_LOG_CONSOLE, "FBX loaded: %zu mesh(es)", result.meshes.size());
    return result;
}
