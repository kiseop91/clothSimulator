#pragma once

#include "mesh/MeshData.h"
#include <string>
#include <cstdint>

class GltfLoader {
public:
    static LoadResult load(const uint8_t* data, size_t size, const std::string& ext);
};
