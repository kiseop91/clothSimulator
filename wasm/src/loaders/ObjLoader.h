#pragma once

#include "mesh/MeshData.h"
#include <vector>
#include <cstdint>

class ObjLoader {
public:
    static std::vector<MeshData> load(const uint8_t* data, size_t size);
};
