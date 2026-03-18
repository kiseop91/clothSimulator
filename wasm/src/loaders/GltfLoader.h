#pragma once

#include "mesh/MeshData.h"
#include <vector>
#include <string>
#include <cstdint>

class GltfLoader {
public:
    static std::vector<MeshData> load(const uint8_t* data, size_t size, const std::string& ext);
};
