#include "mesh/TriangleMeshGenerator.h"

#define ANSI_DECLARATORS
#define REAL double
#define TRILIBRARY
#define VOID int
#include "triangle.h"

#include <cstdio>
#include <cstring>
#include <algorithm>

MeshData TriangleMeshGenerator::generate(const std::vector<glm::vec2>& polygon,
                                          float minAngle,
                                          float maxArea,
                                          float worldScale,
                                          float height) {
    MeshData result;
    int numPoints = static_cast<int>(polygon.size());
    if (numPoints < 3) return result;

    // Compute bounding box
    glm::vec2 bbMin(1e30f), bbMax(-1e30f);
    for (const auto& p : polygon) {
        bbMin = glm::min(bbMin, p);
        bbMax = glm::max(bbMax, p);
    }
    glm::vec2 bbSize = bbMax - bbMin;
    float maxDim = std::max(bbSize.x, bbSize.y);
    if (maxDim < 1e-6f) return result;

    // Normalize polygon to [0, worldScale] centered at origin
    std::vector<REAL> pointList(numPoints * 2);
    for (int i = 0; i < numPoints; i++) {
        float nx = (polygon[i].x - bbMin.x) / maxDim; // 0..1
        float ny = (polygon[i].y - bbMin.y) / maxDim;
        // Center and scale
        pointList[i * 2]     = (nx - 0.5f * bbSize.x / maxDim) * worldScale;
        pointList[i * 2 + 1] = (ny - 0.5f * bbSize.y / maxDim) * worldScale;
    }

    // Build segment list (closed polygon)
    std::vector<int> segmentList(numPoints * 2);
    for (int i = 0; i < numPoints; i++) {
        segmentList[i * 2]     = i;
        segmentList[i * 2 + 1] = (i + 1) % numPoints;
    }

    // Setup Triangle input
    struct triangulateio in, out;
    memset(&in, 0, sizeof(in));
    memset(&out, 0, sizeof(out));

    in.pointlist = pointList.data();
    in.numberofpoints = numPoints;
    in.segmentlist = segmentList.data();
    in.numberofsegments = numPoints;

    // Build switch string: p=PSLG, q=quality, a=area, z=zero-indexed, Q=quiet
    char switches[64];
    snprintf(switches, sizeof(switches), "pq%.1fa%.6fzQ", minAngle, static_cast<double>(maxArea));

    // Run triangulation
    triangulate(switches, &in, &out, nullptr);

    if (out.numberofpoints <= 0 || out.numberoftriangles <= 0) {
        // Cleanup
        if (out.pointlist) trifree(reinterpret_cast<int*>(out.pointlist));
        if (out.trianglelist) trifree(reinterpret_cast<int*>(out.trianglelist));
        return result;
    }

    // Compute normalization bounds for texcoords
    REAL outMinX = 1e30, outMinY = 1e30, outMaxX = -1e30, outMaxY = -1e30;
    for (int i = 0; i < out.numberofpoints; i++) {
        REAL x = out.pointlist[i * 2];
        REAL y = out.pointlist[i * 2 + 1];
        if (x < outMinX) outMinX = x;
        if (x > outMaxX) outMaxX = x;
        if (y < outMinY) outMinY = y;
        if (y > outMaxY) outMaxY = y;
    }
    REAL rangeX = outMaxX - outMinX;
    REAL rangeY = outMaxY - outMinY;
    if (rangeX < 1e-8) rangeX = 1.0;
    if (rangeY < 1e-8) rangeY = 1.0;

    // Convert to MeshData: 2D points -> 3D (XZ plane at given height)
    result.vertices.resize(out.numberofpoints);
    for (int i = 0; i < out.numberofpoints; i++) {
        REAL x = out.pointlist[i * 2];
        REAL z = out.pointlist[i * 2 + 1];
        result.vertices[i].position = glm::vec3(static_cast<float>(x), height, static_cast<float>(z));
        result.vertices[i].normal = glm::vec3(0.0f, 1.0f, 0.0f);
        result.vertices[i].texCoord = glm::vec2(
            static_cast<float>((x - outMinX) / rangeX),
            static_cast<float>((z - outMinY) / rangeY)
        );
    }

    // Convert triangles to indices
    result.indices.resize(out.numberoftriangles * 3);
    for (int i = 0; i < out.numberoftriangles; i++) {
        result.indices[i * 3]     = static_cast<uint32_t>(out.trianglelist[i * 3]);
        result.indices[i * 3 + 1] = static_cast<uint32_t>(out.trianglelist[i * 3 + 1]);
        result.indices[i * 3 + 2] = static_cast<uint32_t>(out.trianglelist[i * 3 + 2]);
    }

    // Free Triangle's allocated memory
    trifree(reinterpret_cast<int*>(out.pointlist));
    trifree(reinterpret_cast<int*>(out.trianglelist));
    if (out.segmentlist) trifree(reinterpret_cast<int*>(out.segmentlist));

    return result;
}
