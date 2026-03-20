#pragma once
#include "mesh/MeshData.h"
#include <vector>
#include <glm/glm.hpp>

class TriangleMeshGenerator {
public:
    // 2D polygon outline -> quality triangulation -> 3D MeshData
    // polygon: 2D points (closed polygon, last->first auto-connected)
    // minAngle: minimum triangle angle for quality (default 25 degrees)
    // maxArea: maximum triangle area (smaller = denser mesh)
    // worldScale: map polygon to world coordinates of this size
    // height: Y coordinate for the generated cloth (drop height)
    static MeshData generate(const std::vector<glm::vec2>& polygon,
                              float minAngle = 25.0f,
                              float maxArea = 0.005f,
                              float worldScale = 3.0f,
                              float height = 2.0f);
};
