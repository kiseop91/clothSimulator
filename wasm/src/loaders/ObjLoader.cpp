#include "loaders/ObjLoader.h"
#define TINYOBJLOADER_IMPLEMENTATION
#include "tiny_obj_loader.h"
#include <sstream>
#include <unordered_map>
#include <emscripten.h>

static glm::vec3 computeFaceNormal(const glm::vec3& v0, const glm::vec3& v1, const glm::vec3& v2) {
    glm::vec3 edge1 = v1 - v0;
    glm::vec3 edge2 = v2 - v0;
    glm::vec3 n = glm::cross(edge1, edge2);
    float len = glm::length(n);
    if (len > 1e-8f) {
        return n / len;
    }
    return glm::vec3(0.0f, 1.0f, 0.0f);
}

LoadResult ObjLoader::load(const uint8_t* data, size_t size) {
    LoadResult result;

    std::string dataStr(reinterpret_cast<const char*>(data), size);
    std::istringstream stream(dataStr);

    tinyobj::ObjReader reader;
    tinyobj::ObjReaderConfig config;
    config.triangulate = true;
    config.vertex_color = false;

    if (!reader.ParseFromString(dataStr, "", config)) {
        if (!reader.Error().empty()) {
            emscripten_log(EM_LOG_ERROR, "OBJ load error: %s", reader.Error().c_str());
        }
        return result;
    }

    if (!reader.Warning().empty()) {
        emscripten_log(EM_LOG_WARN, "OBJ warning: %s", reader.Warning().c_str());
    }

    const auto& attrib = reader.GetAttrib();
    const auto& shapes = reader.GetShapes();
    const auto& materials = reader.GetMaterials();

    for (const auto& shape : shapes) {
        MeshData meshData;
        std::unordered_map<std::string, uint32_t> uniqueVertices;

        // Determine material for this shape (use first face's material)
        int matId = -1;
        if (!shape.mesh.material_ids.empty()) {
            matId = shape.mesh.material_ids[0];
        }

        if (matId >= 0 && matId < (int)materials.size()) {
            const auto& mat = materials[matId];
            meshData.material.name = mat.name;
            meshData.material.baseColor = glm::vec3(mat.diffuse[0], mat.diffuse[1], mat.diffuse[2]);
            meshData.material.metallic = mat.metallic;
            meshData.material.roughness = mat.roughness;
        }

        size_t indexOffset = 0;
        for (size_t f = 0; f < shape.mesh.num_face_vertices.size(); f++) {
            int fv = shape.mesh.num_face_vertices[f]; // should be 3 after triangulation

            // Gather positions for normal computation if needed
            glm::vec3 facePositions[3];
            for (int v = 0; v < fv && v < 3; v++) {
                tinyobj::index_t idx = shape.mesh.indices[indexOffset + v];
                facePositions[v] = glm::vec3(
                    attrib.vertices[3 * idx.vertex_index + 0],
                    attrib.vertices[3 * idx.vertex_index + 1],
                    attrib.vertices[3 * idx.vertex_index + 2]
                );
            }

            glm::vec3 faceNormal = computeFaceNormal(facePositions[0], facePositions[1], facePositions[2]);

            for (int v = 0; v < fv; v++) {
                tinyobj::index_t idx = shape.mesh.indices[indexOffset + v];

                Vertex vertex{};
                vertex.position = glm::vec3(
                    attrib.vertices[3 * idx.vertex_index + 0],
                    attrib.vertices[3 * idx.vertex_index + 1],
                    attrib.vertices[3 * idx.vertex_index + 2]
                );

                if (idx.normal_index >= 0 && static_cast<size_t>(3 * idx.normal_index + 2) < attrib.normals.size()) {
                    vertex.normal = glm::vec3(
                        attrib.normals[3 * idx.normal_index + 0],
                        attrib.normals[3 * idx.normal_index + 1],
                        attrib.normals[3 * idx.normal_index + 2]
                    );
                } else {
                    vertex.normal = faceNormal;
                }

                // UV coordinates
                if (idx.texcoord_index >= 0 && static_cast<size_t>(2 * idx.texcoord_index + 1) < attrib.texcoords.size()) {
                    vertex.texCoord = glm::vec2(
                        attrib.texcoords[2 * idx.texcoord_index + 0],
                        attrib.texcoords[2 * idx.texcoord_index + 1]
                    );
                } else {
                    vertex.texCoord = glm::vec2(0.0f);
                }

                // Create unique key for deduplication
                std::string key = std::to_string(idx.vertex_index) + "/" +
                                  std::to_string(idx.normal_index) + "/" +
                                  std::to_string(idx.texcoord_index);

                auto it = uniqueVertices.find(key);
                if (it == uniqueVertices.end()) {
                    uint32_t newIdx = static_cast<uint32_t>(meshData.vertices.size());
                    uniqueVertices[key] = newIdx;
                    meshData.vertices.push_back(vertex);
                    meshData.indices.push_back(newIdx);
                } else {
                    meshData.indices.push_back(it->second);
                }
            }

            indexOffset += fv;
        }

        if (!meshData.vertices.empty()) {
            result.meshes.push_back(std::move(meshData));
        }
    }

    // If no shapes, try to create a single mesh from all vertices
    if (result.meshes.empty() && !attrib.vertices.empty()) {
        MeshData meshData;
        for (size_t i = 0; i < attrib.vertices.size() / 3; i++) {
            Vertex v{};
            v.position = glm::vec3(
                attrib.vertices[3 * i + 0],
                attrib.vertices[3 * i + 1],
                attrib.vertices[3 * i + 2]
            );
            v.normal = glm::vec3(0, 1, 0);
            meshData.vertices.push_back(v);
            meshData.indices.push_back(static_cast<uint32_t>(i));
        }
        result.meshes.push_back(std::move(meshData));
    }

    emscripten_log(EM_LOG_CONSOLE, "OBJ loaded: %zu mesh(es), %zu material(s)",
                   result.meshes.size(), materials.size());
    return result;
}
