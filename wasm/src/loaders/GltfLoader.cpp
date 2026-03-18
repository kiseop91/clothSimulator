#include "loaders/GltfLoader.h"
#define TINYGLTF_IMPLEMENTATION
#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "tiny_gltf.h"
#include <emscripten.h>

static glm::vec3 computeTriNormal(const glm::vec3& v0, const glm::vec3& v1, const glm::vec3& v2) {
    glm::vec3 e1 = v1 - v0;
    glm::vec3 e2 = v2 - v0;
    glm::vec3 n = glm::cross(e1, e2);
    float len = glm::length(n);
    return (len > 1e-8f) ? (n / len) : glm::vec3(0.0f, 1.0f, 0.0f);
}

static void processPrimitive(const tinygltf::Model& model,
                             const tinygltf::Primitive& prim,
                             std::vector<MeshData>& result) {
    MeshData meshData;

    // Get position accessor
    auto posIt = prim.attributes.find("POSITION");
    if (posIt == prim.attributes.end()) return;

    const tinygltf::Accessor& posAccessor = model.accessors[posIt->second];
    const tinygltf::BufferView& posView = model.bufferViews[posAccessor.bufferView];
    const tinygltf::Buffer& posBuffer = model.buffers[posView.buffer];
    const float* posData = reinterpret_cast<const float*>(
        posBuffer.data.data() + posView.byteOffset + posAccessor.byteOffset);
    size_t posStride = posView.byteStride ? posView.byteStride / sizeof(float) : 3;

    // Get normal accessor (optional)
    const float* normData = nullptr;
    size_t normStride = 3;
    auto normIt = prim.attributes.find("NORMAL");
    if (normIt != prim.attributes.end()) {
        const tinygltf::Accessor& normAccessor = model.accessors[normIt->second];
        const tinygltf::BufferView& normView = model.bufferViews[normAccessor.bufferView];
        const tinygltf::Buffer& normBuffer = model.buffers[normView.buffer];
        normData = reinterpret_cast<const float*>(
            normBuffer.data.data() + normView.byteOffset + normAccessor.byteOffset);
        normStride = normView.byteStride ? normView.byteStride / sizeof(float) : 3;
    }

    // Build vertices
    size_t vertexCount = posAccessor.count;
    meshData.vertices.resize(vertexCount);
    for (size_t i = 0; i < vertexCount; i++) {
        meshData.vertices[i].position = glm::vec3(
            posData[i * posStride + 0],
            posData[i * posStride + 1],
            posData[i * posStride + 2]
        );
        if (normData) {
            meshData.vertices[i].normal = glm::vec3(
                normData[i * normStride + 0],
                normData[i * normStride + 1],
                normData[i * normStride + 2]
            );
        } else {
            meshData.vertices[i].normal = glm::vec3(0.0f, 1.0f, 0.0f);
        }
    }

    // Get indices
    if (prim.indices >= 0) {
        const tinygltf::Accessor& idxAccessor = model.accessors[prim.indices];
        const tinygltf::BufferView& idxView = model.bufferViews[idxAccessor.bufferView];
        const tinygltf::Buffer& idxBuffer = model.buffers[idxView.buffer];
        const uint8_t* idxData = idxBuffer.data.data() + idxView.byteOffset + idxAccessor.byteOffset;

        meshData.indices.resize(idxAccessor.count);

        if (idxAccessor.componentType == TINYGLTF_COMPONENT_TYPE_UNSIGNED_SHORT) {
            const uint16_t* ptr = reinterpret_cast<const uint16_t*>(idxData);
            for (size_t i = 0; i < idxAccessor.count; i++) {
                meshData.indices[i] = static_cast<uint32_t>(ptr[i]);
            }
        } else if (idxAccessor.componentType == TINYGLTF_COMPONENT_TYPE_UNSIGNED_INT) {
            const uint32_t* ptr = reinterpret_cast<const uint32_t*>(idxData);
            for (size_t i = 0; i < idxAccessor.count; i++) {
                meshData.indices[i] = ptr[i];
            }
        } else if (idxAccessor.componentType == TINYGLTF_COMPONENT_TYPE_UNSIGNED_BYTE) {
            for (size_t i = 0; i < idxAccessor.count; i++) {
                meshData.indices[i] = static_cast<uint32_t>(idxData[i]);
            }
        }
    } else {
        // Non-indexed: generate sequential indices
        meshData.indices.resize(vertexCount);
        for (size_t i = 0; i < vertexCount; i++) {
            meshData.indices[i] = static_cast<uint32_t>(i);
        }
    }

    // Generate normals if not provided
    if (!normData && meshData.indices.size() >= 3) {
        // Compute per-face normals and accumulate
        for (size_t i = 0; i + 2 < meshData.indices.size(); i += 3) {
            uint32_t i0 = meshData.indices[i + 0];
            uint32_t i1 = meshData.indices[i + 1];
            uint32_t i2 = meshData.indices[i + 2];
            glm::vec3 n = computeTriNormal(
                meshData.vertices[i0].position,
                meshData.vertices[i1].position,
                meshData.vertices[i2].position
            );
            meshData.vertices[i0].normal = n;
            meshData.vertices[i1].normal = n;
            meshData.vertices[i2].normal = n;
        }
    }

    if (!meshData.vertices.empty() && !meshData.indices.empty()) {
        result.push_back(std::move(meshData));
    }
}

std::vector<MeshData> GltfLoader::load(const uint8_t* data, size_t size, const std::string& ext) {
    std::vector<MeshData> result;

    tinygltf::Model model;
    tinygltf::TinyGLTF loader;
    std::string err, warn;

    bool ok = false;
    bool isBinary = (ext.find("glb") != std::string::npos);

    if (isBinary) {
        ok = loader.LoadBinaryFromMemory(&model, &err, &warn, data, static_cast<unsigned int>(size));
    } else {
        std::string dataStr(reinterpret_cast<const char*>(data), size);
        ok = loader.LoadASCIIFromString(&model, &err, &warn, dataStr.c_str(),
                                        static_cast<unsigned int>(dataStr.size()), "");
    }

    if (!warn.empty()) {
        emscripten_log(EM_LOG_WARN, "glTF warning: %s", warn.c_str());
    }
    if (!err.empty()) {
        emscripten_log(EM_LOG_ERROR, "glTF error: %s", err.c_str());
    }
    if (!ok) {
        emscripten_log(EM_LOG_ERROR, "Failed to parse glTF");
        return result;
    }

    // Process all meshes and their primitives
    for (const auto& mesh : model.meshes) {
        for (const auto& prim : mesh.primitives) {
            if (prim.mode == TINYGLTF_MODE_TRIANGLES || prim.mode == -1) {
                processPrimitive(model, prim, result);
            }
        }
    }

    emscripten_log(EM_LOG_CONSOLE, "glTF loaded: %zu mesh(es)", result.size());
    return result;
}
