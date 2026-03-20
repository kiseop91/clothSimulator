#include "simulation/MeshCollider.h"
#include <algorithm>
#include <numeric>
#include <cmath>
#include <emscripten.h>

// ─── Closest point on triangle (Ericson, Real-Time Collision Detection) ──

glm::vec3 MeshCollider::closestPointOnTriangle(const glm::vec3& p,
                                                const glm::vec3& a,
                                                const glm::vec3& b,
                                                const glm::vec3& c) {
    glm::vec3 ab = b - a, ac = c - a, ap = p - a;
    float d1 = glm::dot(ab, ap), d2 = glm::dot(ac, ap);
    if (d1 <= 0.0f && d2 <= 0.0f) return a;

    glm::vec3 bp = p - b;
    float d3 = glm::dot(ab, bp), d4 = glm::dot(ac, bp);
    if (d3 >= 0.0f && d4 <= d3) return b;

    float vc = d1 * d4 - d3 * d2;
    if (vc <= 0.0f && d1 >= 0.0f && d3 <= 0.0f) {
        float v = d1 / (d1 - d3);
        return a + v * ab;
    }

    glm::vec3 cp = p - c;
    float d5 = glm::dot(ab, cp), d6 = glm::dot(ac, cp);
    if (d6 >= 0.0f && d5 <= d6) return c;

    float vb = d5 * d2 - d1 * d6;
    if (vb <= 0.0f && d2 >= 0.0f && d6 <= 0.0f) {
        float w = d2 / (d2 - d6);
        return a + w * ac;
    }

    float va = d3 * d6 - d5 * d4;
    if (va <= 0.0f && (d4 - d3) >= 0.0f && (d5 - d6) >= 0.0f) {
        float w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return b + w * (c - b);
    }

    float denom = 1.0f / (va + vb + vc);
    float v = vb * denom;
    float w = vc * denom;
    return a + ab * v + ac * w;
}

// ─── BVH Build ──────────────────────────────────────────────────────────

void MeshCollider::build(const MeshData& meshData) {
    triangles_.clear();
    nodes_.clear();
    triData_.clear();
    bvhData_.clear();
    numTriangles_ = 0;

    if (meshData.indices.size() < 3) return;

    // Build triangle list
    numTriangles_ = static_cast<int>(meshData.indices.size()) / 3;
    triangles_.resize(numTriangles_);

    for (int i = 0; i < numTriangles_; i++) {
        auto& tri = triangles_[i];
        tri.v0 = meshData.vertices[meshData.indices[i * 3 + 0]].position;
        tri.v1 = meshData.vertices[meshData.indices[i * 3 + 1]].position;
        tri.v2 = meshData.vertices[meshData.indices[i * 3 + 2]].position;
        glm::vec3 e1 = tri.v1 - tri.v0;
        glm::vec3 e2 = tri.v2 - tri.v0;
        glm::vec3 n = glm::cross(e1, e2);
        float len = glm::length(n);
        tri.normal = (len > 1e-8f) ? (n / len) : glm::vec3(0.0f, 1.0f, 0.0f);
    }

    // Build BVH
    std::vector<int> indices(numTriangles_);
    std::iota(indices.begin(), indices.end(), 0);
    nodes_.reserve(numTriangles_ * 2);
    buildRecursive(indices, 0, numTriangles_);

    // Reorder triangles_ to match BVH leaf ordering
    // (indices was rearranged by nth_element during BVH build)
    std::vector<Triangle> reordered(numTriangles_);
    for (int i = 0; i < numTriangles_; i++) {
        reordered[i] = triangles_[indices[i]];
    }
    triangles_ = std::move(reordered);

    // Flatten for GPU
    flattenForGPU();

    emscripten_log(EM_LOG_CONSOLE, "MeshCollider built: %d triangles, %zu BVH nodes",
                   numTriangles_, nodes_.size());
}

int MeshCollider::buildRecursive(std::vector<int>& indices, int start, int end) {
    int nodeIdx = static_cast<int>(nodes_.size());
    nodes_.push_back(BVHNode{});
    BVHNode& node = nodes_[nodeIdx];

    // Compute AABB
    node.aabbMin = glm::vec3(1e30f);
    node.aabbMax = glm::vec3(-1e30f);
    for (int i = start; i < end; i++) {
        const auto& tri = triangles_[indices[i]];
        node.aabbMin = glm::min(node.aabbMin, glm::min(tri.v0, glm::min(tri.v1, tri.v2)));
        node.aabbMax = glm::max(node.aabbMax, glm::max(tri.v0, glm::max(tri.v1, tri.v2)));
    }

    int count = end - start;
    constexpr int LEAF_SIZE = 8;

    if (count <= LEAF_SIZE) {
        // Leaf node — reorder triangles to be contiguous
        node.triStart = start;
        node.triCount = count;
        return nodeIdx;
    }

    // Find longest axis
    glm::vec3 extent = node.aabbMax - node.aabbMin;
    int axis = 0;
    if (extent.y > extent.x) axis = 1;
    if (extent.z > extent[axis]) axis = 2;

    // Sort by centroid along axis
    int mid = (start + end) / 2;
    std::nth_element(indices.begin() + start, indices.begin() + mid, indices.begin() + end,
        [&](int a, int b) {
            float ca = (triangles_[a].v0[axis] + triangles_[a].v1[axis] + triangles_[a].v2[axis]) / 3.0f;
            float cb = (triangles_[b].v0[axis] + triangles_[b].v1[axis] + triangles_[b].v2[axis]) / 3.0f;
            return ca < cb;
        });

    // Recurse
    node.leftChild = buildRecursive(indices, start, mid);
    // Re-fetch node reference since vector may have reallocated
    nodes_[nodeIdx].rightChild = buildRecursive(indices, mid, end);

    return nodeIdx;
}

void MeshCollider::flattenForGPU() {
    // Triangle data: 4 vec4 per triangle (v0, v1, v2, normal)
    triData_.resize(numTriangles_ * 4);
    for (int i = 0; i < numTriangles_; i++) {
        const auto& tri = triangles_[i];
        triData_[i * 4 + 0] = glm::vec4(tri.v0, 0.0f);
        triData_[i * 4 + 1] = glm::vec4(tri.v1, 0.0f);
        triData_[i * 4 + 2] = glm::vec4(tri.v2, 0.0f);
        triData_[i * 4 + 3] = glm::vec4(tri.normal, 0.0f);
    }

    // BVH data: 3 vec4 per node
    bvhData_.resize(nodes_.size() * 3);
    for (size_t i = 0; i < nodes_.size(); i++) {
        const auto& n = nodes_[i];
        bvhData_[i * 3 + 0] = glm::vec4(n.aabbMin, static_cast<float>(n.leftChild));
        bvhData_[i * 3 + 1] = glm::vec4(n.aabbMax, static_cast<float>(n.rightChild));
        bvhData_[i * 3 + 2] = glm::vec4(
            static_cast<float>(n.triStart),
            static_cast<float>(n.triCount),
            0.0f, 0.0f
        );
    }
}

// ─── Point Collision ────────────────────────────────────────────────────

bool MeshCollider::pointCollision(const glm::vec3& point, float thickness,
                                   glm::vec3& correction, glm::vec3& normal) const {
    if (nodes_.empty()) return false;

    float bestDistSq = thickness * thickness;
    glm::vec3 bestNormal(0.0f, 1.0f, 0.0f);
    glm::vec3 bestClosest = point;
    bool found = false;

    // Iterative BVH traversal with stack
    int stack[64];
    int stackPtr = 0;
    stack[stackPtr++] = 0; // root

    while (stackPtr > 0) {
        int nodeIdx = stack[--stackPtr];
        const auto& node = nodes_[nodeIdx];

        // AABB test with padding
        if (point.x < node.aabbMin.x - thickness || point.x > node.aabbMax.x + thickness ||
            point.y < node.aabbMin.y - thickness || point.y > node.aabbMax.y + thickness ||
            point.z < node.aabbMin.z - thickness || point.z > node.aabbMax.z + thickness) {
            continue;
        }

        if (node.triCount > 0) {
            // Leaf: test triangles
            for (int t = node.triStart; t < node.triStart + node.triCount; t++) {
                const auto& tri = triangles_[t];
                glm::vec3 closest = closestPointOnTriangle(point, tri.v0, tri.v1, tri.v2);
                glm::vec3 diff = point - closest;
                float distSq = glm::dot(diff, diff);
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    bestClosest = closest;
                    bestNormal = tri.normal;
                    found = true;
                }
            }
        } else {
            // Internal: push children
            if (node.leftChild >= 0 && stackPtr < 63) stack[stackPtr++] = node.leftChild;
            if (node.rightChild >= 0 && stackPtr < 63) stack[stackPtr++] = node.rightChild;
        }
    }

    if (!found) return false;

    float dist = std::sqrt(bestDistSq);
    if (dist < 1e-7f) {
        // Point exactly on surface — push along triangle normal
        correction = bestNormal * thickness;
    } else {
        glm::vec3 dir = (point - bestClosest) / dist;
        // Ensure we push in the direction of the triangle normal
        if (glm::dot(dir, bestNormal) < 0.0f) dir = -dir;
        correction = dir * (thickness - dist + 0.001f);
    }
    normal = bestNormal;
    return true;
}
