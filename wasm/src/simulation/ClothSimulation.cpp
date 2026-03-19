#include "simulation/ClothSimulation.h"
#include <glm/glm.hpp>
#include <cmath>
#include <cstring>
#include <set>
#include <map>
#include <algorithm>

ClothSimulation::ClothSimulation()
    : resX_(0), resY_(0), width_(0.0f), height_(0.0f)
    , gravity_(0.0f, -9.81f, 0.0f)
    , windForce_(0.0f)
    , stiffness_(0.9f)
    , damping_(0.01f)
    , friction_(0.5f)
    , constraintIterations_(15)
    , lastTime_(-1.0)
    , accumulator_(0.0)
    , running_(false)
    , initialized_(false)
{
}

ClothSimulation::~ClothSimulation() {
}

void ClothSimulation::init(float width, float height, int resX, int resY) {
    resX_ = resX;
    resY_ = resY;
    width_ = width;
    height_ = height;

    // Create particles in a grid, centered at origin, elevated above ground
    // Cloth hangs from top edge (y=0 row is at the top)
    particles_.clear();
    particles_.reserve(resX * resY);

    float startX = -width * 0.5f;
    float startY = height;  // Top of cloth at this height
    float stepX = width / static_cast<float>(resX - 1);
    float stepY = height / static_cast<float>(resY - 1);

    for (int y = 0; y < resY; y++) {
        for (int x = 0; x < resX; x++) {
            glm::vec3 pos(
                startX + x * stepX,
                startY - y * stepY,  // y=0 is top, y=resY-1 is bottom
                0.0f
            );
            bool pinned = (y == 0);  // Pin top row
            particles_.emplace_back(pos, pinned);
        }
    }

    // Save initial positions for reset
    initialPositions_.resize(particles_.size());
    for (size_t i = 0; i < particles_.size(); i++) {
        initialPositions_[i] = particles_[i].position;
    }

    // Create springs
    springs_.clear();

    auto idx = [resX](int x, int y) -> int { return y * resX + x; };

    for (int y = 0; y < resY; y++) {
        for (int x = 0; x < resX; x++) {
            // Structural springs
            if (x < resX - 1) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 1, y)].position);
                springs_.emplace_back(idx(x, y), idx(x + 1, y), rest, ClothSpring::STRUCTURAL);
            }
            if (y < resY - 1) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x, y + 1)].position);
                springs_.emplace_back(idx(x, y), idx(x, y + 1), rest, ClothSpring::STRUCTURAL);
            }

            // Shear springs
            if (x < resX - 1 && y < resY - 1) {
                float rest1 = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 1, y + 1)].position);
                springs_.emplace_back(idx(x, y), idx(x + 1, y + 1), rest1, ClothSpring::SHEAR);

                float rest2 = glm::length(particles_[idx(x + 1, y)].position - particles_[idx(x, y + 1)].position);
                springs_.emplace_back(idx(x + 1, y), idx(x, y + 1), rest2, ClothSpring::SHEAR);
            }

            // Bend springs
            if (x < resX - 2) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 2, y)].position);
                springs_.emplace_back(idx(x, y), idx(x + 2, y), rest, ClothSpring::BEND);
            }
            if (y < resY - 2) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x, y + 2)].position);
                springs_.emplace_back(idx(x, y), idx(x, y + 2), rest, ClothSpring::BEND);
            }
        }
    }

    // Preallocate cached mesh data
    // Each quad (resX-1)*(resY-1) produces 2 triangles = 6 indices
    // We use indexed mesh: resX*resY vertices, (resX-1)*(resY-1)*6 indices
    int vertCount = resX * resY;
    int quadCount = (resX - 1) * (resY - 1);
    int indexCount = quadCount * 6;

    cachedMeshData_.vertices.resize(vertCount);
    cachedMeshData_.indices.resize(indexCount);

    // Generate indices (topology never changes)
    int ii = 0;
    for (int y = 0; y < resY - 1; y++) {
        for (int x = 0; x < resX - 1; x++) {
            int topLeft = idx(x, y);
            int topRight = idx(x + 1, y);
            int bottomLeft = idx(x, y + 1);
            int bottomRight = idx(x + 1, y + 1);

            // Triangle 1
            cachedMeshData_.indices[ii++] = topLeft;
            cachedMeshData_.indices[ii++] = bottomLeft;
            cachedMeshData_.indices[ii++] = topRight;

            // Triangle 2
            cachedMeshData_.indices[ii++] = topRight;
            cachedMeshData_.indices[ii++] = bottomLeft;
            cachedMeshData_.indices[ii++] = bottomRight;
        }
    }

    // Fill initial vertex data with UV coordinates
    for (int y = 0; y < resY; y++) {
        for (int x = 0; x < resX; x++) {
            int i = y * resX + x;
            cachedMeshData_.vertices[i].position = particles_[i].position;
            cachedMeshData_.vertices[i].normal = glm::vec3(0.0f, 0.0f, 1.0f);
            cachedMeshData_.vertices[i].texCoord = glm::vec2(
                static_cast<float>(x) / static_cast<float>(resX - 1),
                static_cast<float>(y) / static_cast<float>(resY - 1)
            );
        }
    }

    lastTime_ = -1.0;
    accumulator_ = 0.0;
    initialized_ = true;
    buildNeighborList();
}

void ClothSimulation::initHorizontal(float width, float depth, int resX, int resZ, float dropHeight) {
    resX_ = resX;
    resY_ = resZ;
    width_ = width;
    height_ = depth;

    // Create particles in XZ plane (horizontal), at given Y height
    particles_.clear();
    particles_.reserve(resX * resZ);

    float startX = -width * 0.5f;
    float startZ = -depth * 0.5f;
    float stepX = width / static_cast<float>(resX - 1);
    float stepZ = depth / static_cast<float>(resZ - 1);

    for (int z = 0; z < resZ; z++) {
        for (int x = 0; x < resX; x++) {
            glm::vec3 pos(
                startX + x * stepX,
                dropHeight,
                startZ + z * stepZ
            );
            bool pinned = false;  // No pins — free fall
            particles_.emplace_back(pos, pinned);
        }
    }

    // Save initial positions for reset
    initialPositions_.resize(particles_.size());
    for (size_t i = 0; i < particles_.size(); i++) {
        initialPositions_[i] = particles_[i].position;
    }

    // Create springs (same logic as init)
    springs_.clear();
    auto idx = [resX](int x, int y) -> int { return y * resX + x; };

    for (int y = 0; y < resZ; y++) {
        for (int x = 0; x < resX; x++) {
            if (x < resX - 1) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 1, y)].position);
                springs_.emplace_back(idx(x, y), idx(x + 1, y), rest, ClothSpring::STRUCTURAL);
            }
            if (y < resZ - 1) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x, y + 1)].position);
                springs_.emplace_back(idx(x, y), idx(x, y + 1), rest, ClothSpring::STRUCTURAL);
            }
            if (x < resX - 1 && y < resZ - 1) {
                float rest1 = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 1, y + 1)].position);
                springs_.emplace_back(idx(x, y), idx(x + 1, y + 1), rest1, ClothSpring::SHEAR);
                float rest2 = glm::length(particles_[idx(x + 1, y)].position - particles_[idx(x, y + 1)].position);
                springs_.emplace_back(idx(x + 1, y), idx(x, y + 1), rest2, ClothSpring::SHEAR);
            }
            if (x < resX - 2) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 2, y)].position);
                springs_.emplace_back(idx(x, y), idx(x + 2, y), rest, ClothSpring::BEND);
            }
            if (y < resZ - 2) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x, y + 2)].position);
                springs_.emplace_back(idx(x, y), idx(x, y + 2), rest, ClothSpring::BEND);
            }
        }
    }

    // Preallocate cached mesh data
    int vertCount = resX * resZ;
    int quadCount = (resX - 1) * (resZ - 1);
    int indexCount = quadCount * 6;

    cachedMeshData_.vertices.resize(vertCount);
    cachedMeshData_.indices.resize(indexCount);

    int ii = 0;
    for (int y = 0; y < resZ - 1; y++) {
        for (int x = 0; x < resX - 1; x++) {
            int topLeft = idx(x, y);
            int topRight = idx(x + 1, y);
            int bottomLeft = idx(x, y + 1);
            int bottomRight = idx(x + 1, y + 1);
            cachedMeshData_.indices[ii++] = topLeft;
            cachedMeshData_.indices[ii++] = bottomLeft;
            cachedMeshData_.indices[ii++] = topRight;
            cachedMeshData_.indices[ii++] = topRight;
            cachedMeshData_.indices[ii++] = bottomLeft;
            cachedMeshData_.indices[ii++] = bottomRight;
        }
    }

    // Fill initial vertex data with upward-facing normal + UV
    for (int z = 0; z < resZ; z++) {
        for (int x = 0; x < resX; x++) {
            int i = z * resX + x;
            cachedMeshData_.vertices[i].position = particles_[i].position;
            cachedMeshData_.vertices[i].normal = glm::vec3(0.0f, 1.0f, 0.0f);
            cachedMeshData_.vertices[i].texCoord = glm::vec2(
                static_cast<float>(x) / static_cast<float>(resX - 1),
                static_cast<float>(z) / static_cast<float>(resZ - 1)
            );
        }
    }

    lastTime_ = -1.0;
    accumulator_ = 0.0;
    initialized_ = true;
    buildNeighborList();
}

void ClothSimulation::initFromMesh(const MeshData& meshData, int pinMode) {
    int vertCount = static_cast<int>(meshData.vertices.size());
    if (vertCount == 0) return;

    // 1. Vertices → Particles
    particles_.clear();
    particles_.reserve(vertCount);

    float maxY = -1e30f;
    for (const auto& v : meshData.vertices) {
        if (v.position.y > maxY) maxY = v.position.y;
    }

    for (const auto& v : meshData.vertices) {
        bool pinned = false;
        if (pinMode == 1) {
            pinned = (v.position.y > maxY - 0.05f);
        }
        particles_.emplace_back(v.position, pinned);
    }

    // 2. Extract edges from triangle indices → structural springs
    std::set<std::pair<int,int>> edgeSet;
    for (size_t i = 0; i + 2 < meshData.indices.size(); i += 3) {
        int a = meshData.indices[i];
        int b = meshData.indices[i + 1];
        int c = meshData.indices[i + 2];
        auto addEdge = [&](int u, int v) {
            edgeSet.insert({std::min(u, v), std::max(u, v)});
        };
        addEdge(a, b);
        addEdge(b, c);
        addEdge(a, c);
    }

    springs_.clear();
    for (const auto& edge : edgeSet) {
        float rest = glm::length(particles_[edge.first].position - particles_[edge.second].position);
        springs_.emplace_back(edge.first, edge.second, rest, ClothSpring::STRUCTURAL);
    }

    // 3. Bend springs: connect opposite vertices of adjacent triangles sharing an edge
    std::map<std::pair<int,int>, std::vector<int>> edgeToOpposite;
    for (size_t i = 0; i + 2 < meshData.indices.size(); i += 3) {
        int tri[3] = {
            static_cast<int>(meshData.indices[i]),
            static_cast<int>(meshData.indices[i + 1]),
            static_cast<int>(meshData.indices[i + 2])
        };
        for (int j = 0; j < 3; j++) {
            int u = tri[j], v = tri[(j + 1) % 3], opp = tri[(j + 2) % 3];
            auto key = std::make_pair(std::min(u, v), std::max(u, v));
            edgeToOpposite[key].push_back(opp);
        }
    }
    for (const auto& pair : edgeToOpposite) {
        const auto& opposites = pair.second;
        if (opposites.size() == 2 && opposites[0] != opposites[1]) {
            float rest = glm::length(particles_[opposites[0]].position - particles_[opposites[1]].position);
            springs_.emplace_back(opposites[0], opposites[1], rest, ClothSpring::BEND);
        }
    }

    // 4. Save initial positions
    initialPositions_.resize(vertCount);
    for (int i = 0; i < vertCount; i++) {
        initialPositions_[i] = particles_[i].position;
    }

    // 5. Cache mesh data (preserve original topology)
    cachedMeshData_ = meshData;
    resX_ = vertCount;
    resY_ = 1;
    width_ = height_ = 0.0f;

    lastTime_ = -1.0;
    accumulator_ = 0.0;
    initialized_ = true;
    buildNeighborList();
}

void ClothSimulation::translateAll(float dx, float dy, float dz) {
    if (!initialized_) return;
    glm::vec3 delta(dx, dy, dz);
    for (size_t i = 0; i < particles_.size(); i++) {
        particles_[i].position += delta;
        particles_[i].prevPosition += delta;
        initialPositions_[i] += delta;
    }
}

void ClothSimulation::step(double currentTimeMs) {
    if (!initialized_ || !running_) return;

    if (lastTime_ < 0.0) {
        lastTime_ = currentTimeMs;
        return;
    }

    double frameDt = currentTimeMs - lastTime_;
    lastTime_ = currentTimeMs;

    // Clamp to prevent spiral of death
    if (frameDt > MAX_FRAME_DT_MS) {
        frameDt = MAX_FRAME_DT_MS;
    }

    accumulator_ += frameDt;

    // Max 2 substeps per frame to prevent excessive computation
    int steps = 0;
    while (accumulator_ >= FIXED_DT_MS && steps < 2) {
        substep(static_cast<float>(FIXED_DT_MS / 1000.0), currentTimeMs);
        accumulator_ -= FIXED_DT_MS;
        steps++;
    }

    // If still excess, discard
    if (accumulator_ > FIXED_DT_MS * 2.0) {
        accumulator_ = 0.0;
    }
}

void ClothSimulation::substep(float dt, double globalTime) {
    applyForces(globalTime);
    verletIntegrate(dt);
    solveConstraints();
    handleCollisions();
    if (selfCollisionEnabled_) {
        handleSelfCollision();
    }
}

void ClothSimulation::applyForces(double globalTime) {
    for (auto& p : particles_) {
        if (p.pinned) continue;

        // Gravity
        p.acceleration = gravity_;

        // Wind with slight turbulence
        if (glm::length(windForce_) > 0.001f) {
            float turbulence = 1.0f + 0.3f * std::sin(
                static_cast<float>(globalTime * 0.003) + p.position.x * 2.0f + p.position.y * 1.5f
            );
            p.acceleration += windForce_ * turbulence;
        }
    }
}

void ClothSimulation::verletIntegrate(float dt) {
    for (auto& p : particles_) {
        if (p.pinned) continue;

        glm::vec3 velocity = (p.position - p.prevPosition) * (1.0f - damping_);
        p.prevPosition = p.position;
        p.position = p.position + velocity + p.acceleration * dt * dt;
    }
}

void ClothSimulation::solveConstraints() {
    for (int iter = 0; iter < constraintIterations_; iter++) {
        for (auto& spring : springs_) {
            ClothParticle& pA = particles_[spring.particleA];
            ClothParticle& pB = particles_[spring.particleB];

            glm::vec3 delta = pB.position - pA.position;
            float currentLength = glm::length(delta);

            if (currentLength < 1e-7f) continue;

            float diff = (currentLength - spring.restLength) / currentLength;
            glm::vec3 correction = delta * 0.5f * diff * stiffness_;

            if (!pA.pinned) pA.position += correction;
            if (!pB.pinned) pB.position -= correction;
        }
    }
}

void ClothSimulation::handleCollisions() {
    for (auto& p : particles_) {
        if (p.pinned) continue;

        for (const auto& collider : colliders_) {
            glm::vec3 toParticle = p.position - collider.center;
            float dist = glm::length(toParticle);

            if (dist < collider.radius && dist > 1e-7f) {
                glm::vec3 normal = glm::normalize(toParticle);
                glm::vec3 newPos = collider.center + normal * (collider.radius + 0.01f);

                // Friction: decompose velocity into normal and tangent components
                glm::vec3 velocity = p.position - p.prevPosition;
                glm::vec3 vTangent = velocity - normal * glm::dot(velocity, normal);

                // Apply friction to tangent velocity
                glm::vec3 frictionVelocity = vTangent * (1.0f - friction_);

                p.position = newPos;
                p.prevPosition = newPos - frictionVelocity;
            }
        }

        // Ground plane collision (y = 0) with friction
        // Use small epsilon to prevent z-fighting with grid at y=0
        constexpr float groundEpsilon = 0.005f;
        if (p.position.y < groundEpsilon) {
            glm::vec3 velocity = p.position - p.prevPosition;
            glm::vec3 tangentVel(velocity.x * (1.0f - friction_), 0.0f, velocity.z * (1.0f - friction_));

            p.position.y = groundEpsilon;
            p.prevPosition = p.position - tangentVel;
        }
    }
}

void ClothSimulation::getAABB(glm::vec3& aabbMin, glm::vec3& aabbMax) const {
    if (particles_.empty()) {
        aabbMin = aabbMax = glm::vec3(0.0f);
        return;
    }
    aabbMin = aabbMax = particles_[0].position;
    for (size_t i = 1; i < particles_.size(); i++) {
        aabbMin = glm::min(aabbMin, particles_[i].position);
        aabbMax = glm::max(aabbMax, particles_[i].position);
    }
}

void ClothSimulation::reset() {
    if (!initialized_) return;

    for (size_t i = 0; i < particles_.size(); i++) {
        particles_[i].position = initialPositions_[i];
        particles_[i].prevPosition = initialPositions_[i];
        particles_[i].acceleration = glm::vec3(0.0f);
    }

    lastTime_ = -1.0;
    accumulator_ = 0.0;
    running_ = false;
}

const MeshData& ClothSimulation::generateMeshData() {
    int vertCount = resX_ * resY_;

    // Update positions from particles
    for (int i = 0; i < vertCount; i++) {
        cachedMeshData_.vertices[i].position = particles_[i].position;
        cachedMeshData_.vertices[i].normal = glm::vec3(0.0f);  // Reset normals
    }

    // Recalculate normals from faces
    recalculateNormals();

    return cachedMeshData_;
}

void ClothSimulation::buildNeighborList() {
    int n = static_cast<int>(particles_.size());
    if (n == 0) return;

    // Count neighbors per particle
    std::vector<int> count(n, 0);
    for (const auto& s : springs_) {
        count[s.particleA]++;
        count[s.particleB]++;
    }

    // Build offset array (prefix sum)
    neighborOffset_.resize(n + 1);
    neighborOffset_[0] = 0;
    for (int i = 0; i < n; i++) {
        neighborOffset_[i + 1] = neighborOffset_[i] + count[i];
    }

    // Fill neighbor list
    neighborList_.resize(neighborOffset_[n]);
    std::vector<int> writePos(n, 0);
    for (const auto& s : springs_) {
        int a = s.particleA;
        int b = s.particleB;
        neighborList_[neighborOffset_[a] + writePos[a]++] = b;
        neighborList_[neighborOffset_[b] + writePos[b]++] = a;
    }

    // Sort each particle's neighbor sub-range for binary search
    for (int i = 0; i < n; i++) {
        std::sort(neighborList_.begin() + neighborOffset_[i],
                  neighborList_.begin() + neighborOffset_[i + 1]);
    }

    // Size spatial hash table
    hashTableSize_ = (n > 2000) ? 8192 : 2048;
    hashCellStart_.resize(hashTableSize_ + 1);
    hashCellEntries_.resize(n);
}

bool ClothSimulation::isNeighbor(int i, int j) const {
    auto begin = neighborList_.begin() + neighborOffset_[i];
    auto end = neighborList_.begin() + neighborOffset_[i + 1];
    return std::binary_search(begin, end, j);
}

void ClothSimulation::buildSpatialHash() {
    int n = static_cast<int>(particles_.size());
    float cellSize = 2.0f * clothThickness_;
    float invCell = 1.0f / cellSize;

    // Clear counts
    std::fill(hashCellStart_.begin(), hashCellStart_.end(), 0);

    // Count particles per cell
    for (int i = 0; i < n; i++) {
        const glm::vec3& p = particles_[i].position;
        int cx = static_cast<int>(std::floor(p.x * invCell));
        int cy = static_cast<int>(std::floor(p.y * invCell));
        int cz = static_cast<int>(std::floor(p.z * invCell));
        int32_t h = ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & (hashTableSize_ - 1);
        hashCellStart_[h]++;
    }

    // Prefix sum
    int32_t sum = 0;
    for (int32_t i = 0; i < hashTableSize_; i++) {
        int32_t count = hashCellStart_[i];
        hashCellStart_[i] = sum;
        sum += count;
    }
    hashCellStart_[hashTableSize_] = sum;

    // Scatter particle indices (use a copy of starts as write cursors)
    std::vector<int32_t> cursor(hashCellStart_.begin(), hashCellStart_.begin() + hashTableSize_);
    for (int i = 0; i < n; i++) {
        const glm::vec3& p = particles_[i].position;
        int cx = static_cast<int>(std::floor(p.x * invCell));
        int cy = static_cast<int>(std::floor(p.y * invCell));
        int cz = static_cast<int>(std::floor(p.z * invCell));
        int32_t h = ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & (hashTableSize_ - 1);
        hashCellEntries_[cursor[h]++] = i;
    }
}

void ClothSimulation::handleSelfCollision() {
    int n = static_cast<int>(particles_.size());
    if (n == 0) return;

    buildSpatialHash();

    float cellSize = 2.0f * clothThickness_;
    float invCell = 1.0f / cellSize;
    float minDist = 2.0f * clothThickness_;
    float minDist2 = minDist * minDist;

    for (int i = 0; i < n; i++) {
        if (particles_[i].pinned) continue;

        const glm::vec3& pi = particles_[i].position;
        int cx = static_cast<int>(std::floor(pi.x * invCell));
        int cy = static_cast<int>(std::floor(pi.y * invCell));
        int cz = static_cast<int>(std::floor(pi.z * invCell));

        // Query 27 neighboring cells
        for (int dz = -1; dz <= 1; dz++) {
            for (int dy = -1; dy <= 1; dy++) {
                for (int dx = -1; dx <= 1; dx++) {
                    int32_t h = (((cx + dx) * 73856093) ^ ((cy + dy) * 19349663) ^ ((cz + dz) * 83492791)) & (hashTableSize_ - 1);

                    for (int32_t k = hashCellStart_[h]; k < hashCellStart_[h + 1]; k++) {
                        int j = hashCellEntries_[k];
                        if (j <= i) continue;  // avoid duplicate pairs
                        if (particles_[j].pinned) continue;
                        if (isNeighbor(i, j)) continue;

                        glm::vec3 diff = particles_[j].position - particles_[i].position;
                        float dist2 = glm::dot(diff, diff);

                        if (dist2 < minDist2 && dist2 > 1e-12f) {
                            float dist = std::sqrt(dist2);
                            glm::vec3 normal = diff / dist;
                            float penetration = minDist - dist;

                            float totalInvMass = particles_[i].invMass + particles_[j].invMass;
                            if (totalInvMass < 1e-7f) continue;

                            float wi = particles_[i].invMass / totalInvMass;
                            float wj = particles_[j].invMass / totalInvMass;

                            glm::vec3 correction = normal * penetration;
                            particles_[i].position -= correction * wi;
                            particles_[j].position += correction * wj;
                        }
                    }
                }
            }
        }
    }
}

void ClothSimulation::recalculateNormals() {
    // Zero out normals
    for (auto& v : cachedMeshData_.vertices) {
        v.normal = glm::vec3(0.0f);
    }

    // Accumulate face normals
    for (size_t i = 0; i < cachedMeshData_.indices.size(); i += 3) {
        uint32_t i0 = cachedMeshData_.indices[i];
        uint32_t i1 = cachedMeshData_.indices[i + 1];
        uint32_t i2 = cachedMeshData_.indices[i + 2];

        glm::vec3 v0 = cachedMeshData_.vertices[i0].position;
        glm::vec3 v1 = cachedMeshData_.vertices[i1].position;
        glm::vec3 v2 = cachedMeshData_.vertices[i2].position;

        glm::vec3 faceNormal = glm::cross(v1 - v0, v2 - v0);
        // Don't normalize yet - area-weighted accumulation

        cachedMeshData_.vertices[i0].normal += faceNormal;
        cachedMeshData_.vertices[i1].normal += faceNormal;
        cachedMeshData_.vertices[i2].normal += faceNormal;
    }

    // Normalize
    for (auto& v : cachedMeshData_.vertices) {
        float len = glm::length(v.normal);
        if (len > 1e-7f) {
            v.normal /= len;
        } else {
            v.normal = glm::vec3(0.0f, 0.0f, 1.0f);
        }
    }
}
