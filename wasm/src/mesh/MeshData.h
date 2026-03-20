#pragma once

#include <glm/glm.hpp>
#include <vector>
#include <string>
#include <cstdint>

struct Vertex {
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec2 texCoord;
};

struct TextureData {
    std::vector<uint8_t> pixels;  // RGBA
    int width = 0;
    int height = 0;
    std::string name;
};

struct MaterialData {
    glm::vec3 baseColor = glm::vec3(0.8f);
    float metallic = 0.0f;
    float roughness = 0.5f;
    int diffuseTextureIndex = -1;  // index into LoadResult::textures
    std::string name;
};

struct MeshData {
    std::vector<Vertex> vertices;
    std::vector<uint32_t> indices;
    MaterialData material;
};

struct LoadResult {
    std::vector<MeshData> meshes;
    std::vector<TextureData> textures;
};
