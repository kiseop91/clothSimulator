#pragma once

#include <glm/glm.hpp>
#include <vector>
#include "mesh/MeshData.h"

struct BVHNode {
    glm::vec3 aabbMin, aabbMax;
    int leftChild = -1, rightChild = -1;
    int triStart = 0, triCount = 0;
};

class MeshCollider {
public:
    void build(const MeshData& meshData);

    // Returns true if point is within 'thickness' of any triangle.
    // Sets 'correction' (push-out vector) and 'normal' (surface normal at closest point).
    bool pointCollision(const glm::vec3& point, float thickness,
                        glm::vec3& correction, glm::vec3& normal) const;

    bool isBuilt() const { return !nodes_.empty(); }

    // GPU-friendly flat data accessors
    const std::vector<glm::vec4>& getTriangleData() const { return triData_; }
    const std::vector<glm::vec4>& getBVHData() const { return bvhData_; }
    int getTriangleCount() const { return numTriangles_; }
    int getBVHNodeCount() const { return static_cast<int>(nodes_.size()); }

private:
    struct Triangle {
        glm::vec3 v0, v1, v2, normal;
    };

    std::vector<Triangle> triangles_;
    std::vector<BVHNode> nodes_;
    int numTriangles_ = 0;

    // GPU flat data
    std::vector<glm::vec4> triData_;   // 4 vec4 per triangle: v0, v1, v2, normal
    std::vector<glm::vec4> bvhData_;   // 3 vec4 per node: aabbMin+left, aabbMax+right, triRange

    int buildRecursive(std::vector<int>& indices, int start, int end);
    void flattenForGPU();

    // Closest point on triangle to a given point
    static glm::vec3 closestPointOnTriangle(const glm::vec3& p,
                                             const glm::vec3& a,
                                             const glm::vec3& b,
                                             const glm::vec3& c);
};
