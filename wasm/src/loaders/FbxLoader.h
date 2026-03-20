#pragma once

#include "mesh/MeshData.h"
#include <cstdint>

class FbxLoader {
public:
    static LoadResult load(const uint8_t* data, size_t size);
};
