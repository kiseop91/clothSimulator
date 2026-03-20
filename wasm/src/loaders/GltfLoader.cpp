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

// Extract textures from glTF model into LoadResult
static void extractTextures(const tinygltf::Model& model, LoadResult& result) {
    for (const auto& image : model.images) {
        TextureData tex;
        tex.name = image.name.empty() ? image.uri : image.name;
        tex.width = image.width;
        tex.height = image.height;

        if (image.component == 4) {
            // Already RGBA
            tex.pixels = image.image;
        } else if (image.component == 3) {
            // Convert RGB → RGBA
            tex.pixels.resize(image.width * image.height * 4);
            for (int i = 0; i < image.width * image.height; i++) {
                tex.pixels[i * 4 + 0] = image.image[i * 3 + 0];
                tex.pixels[i * 4 + 1] = image.image[i * 3 + 1];
                tex.pixels[i * 4 + 2] = image.image[i * 3 + 2];
                tex.pixels[i * 4 + 3] = 255;
            }
        } else {
            continue; // unsupported channel count
        }

        if (!tex.pixels.empty()) {
            result.textures.push_back(std::move(tex));
        }
    }
}

// Map glTF material texture index → LoadResult texture index
static int resolveTextureIndex(const tinygltf::Model& model, int gltfTextureIndex) {
    if (gltfTextureIndex < 0 || gltfTextureIndex >= (int)model.textures.size()) return -1;
    int source = model.textures[gltfTextureIndex].source;
    if (source < 0 || source >= (int)model.images.size()) return -1;
    return source; // images are stored 1:1 in result.textures
}

static void processPrimitive(const tinygltf::Model& model,
                             const tinygltf::Primitive& prim,
                             LoadResult& result) {
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

    // Get texcoord accessor (optional)
    const float* uvData = nullptr;
    size_t uvStride = 2;
    auto uvIt = prim.attributes.find("TEXCOORD_0");
    if (uvIt != prim.attributes.end()) {
        const tinygltf::Accessor& uvAccessor = model.accessors[uvIt->second];
        const tinygltf::BufferView& uvView = model.bufferViews[uvAccessor.bufferView];
        const tinygltf::Buffer& uvBuffer = model.buffers[uvView.buffer];
        uvData = reinterpret_cast<const float*>(
            uvBuffer.data.data() + uvView.byteOffset + uvAccessor.byteOffset);
        uvStride = uvView.byteStride ? uvView.byteStride / sizeof(float) : 2;
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
        if (uvData) {
            meshData.vertices[i].texCoord = glm::vec2(
                uvData[i * uvStride + 0],
                uvData[i * uvStride + 1]
            );
        } else {
            meshData.vertices[i].texCoord = glm::vec2(0.0f);
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

    // Parse material
    if (prim.material >= 0 && prim.material < (int)model.materials.size()) {
        const auto& mat = model.materials[prim.material];
        meshData.material.name = mat.name;

        const auto& pbr = mat.pbrMetallicRoughness;

        if (pbr.baseColorFactor.size() >= 3) {
            meshData.material.baseColor = glm::vec3(
                static_cast<float>(pbr.baseColorFactor[0]),
                static_cast<float>(pbr.baseColorFactor[1]),
                static_cast<float>(pbr.baseColorFactor[2])
            );
        }
        meshData.material.metallic = static_cast<float>(pbr.metallicFactor);
        meshData.material.roughness = static_cast<float>(pbr.roughnessFactor);

        // Diffuse texture
        if (pbr.baseColorTexture.index >= 0) {
            meshData.material.diffuseTextureIndex = resolveTextureIndex(model, pbr.baseColorTexture.index);
        }
    }

    if (!meshData.vertices.empty() && !meshData.indices.empty()) {
        result.meshes.push_back(std::move(meshData));
    }
}

LoadResult GltfLoader::load(const uint8_t* data, size_t size, const std::string& ext) {
    LoadResult result;

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

    // Debug: log raw image info from tinygltf
    emscripten_log(EM_LOG_CONSOLE, "glTF images: %zu, textures: %zu, materials: %zu",
                   model.images.size(), model.textures.size(), model.materials.size());
    for (size_t i = 0; i < model.images.size(); i++) {
        const auto& img = model.images[i];
        emscripten_log(EM_LOG_CONSOLE, "  image[%zu]: %dx%d, component=%d, bits=%d, pixel_type=%d, size=%zu, name='%s', uri='%s'",
                       i, img.width, img.height, img.component, img.bits, img.pixel_type,
                       img.image.size(), img.name.c_str(), img.uri.c_str());
    }
    for (size_t i = 0; i < model.materials.size(); i++) {
        const auto& mat = model.materials[i];
        const auto& pbr = mat.pbrMetallicRoughness;
        emscripten_log(EM_LOG_CONSOLE, "  material[%zu]: name='%s', baseColorTex=%d, baseColor=(%.2f,%.2f,%.2f)",
                       i, mat.name.c_str(), pbr.baseColorTexture.index,
                       pbr.baseColorFactor.size() >= 3 ? pbr.baseColorFactor[0] : -1.0,
                       pbr.baseColorFactor.size() >= 3 ? pbr.baseColorFactor[1] : -1.0,
                       pbr.baseColorFactor.size() >= 3 ? pbr.baseColorFactor[2] : -1.0);
    }

    // Extract embedded textures first
    extractTextures(model, result);

    // Process all meshes and their primitives
    for (const auto& mesh : model.meshes) {
        for (const auto& prim : mesh.primitives) {
            if (prim.mode == TINYGLTF_MODE_TRIANGLES || prim.mode == -1) {
                processPrimitive(model, prim, result);
            }
        }
    }

    emscripten_log(EM_LOG_CONSOLE, "glTF loaded: %zu mesh(es), %zu texture(s), %zu material(s)",
                   result.meshes.size(), result.textures.size(), model.materials.size());
    return result;
}
