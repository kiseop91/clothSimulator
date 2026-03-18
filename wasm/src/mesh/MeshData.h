#pragma once

#include <glm/glm.hpp>
#include <vector>
#include <cstdint>

struct Vertex {
    glm::vec3 position;
    glm::vec3 normal;
};

struct MeshData {
    std::vector<Vertex> vertices;
    std::vector<uint32_t> indices;
};
