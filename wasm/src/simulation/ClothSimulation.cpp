#include "simulation/ClothSimulation.h"
#include "simulation/VerletSolver.h"
#include "simulation/XPBDSolver.h"
#include <glm/glm.hpp>
#include <emscripten.h>
#include <cmath>
#include <cstring>
#include <set>
#include <map>
#include <algorithm>

ClothSimulation::ClothSimulation()
    : resX_(0), resY_(0), width_(0.0f), height_(0.0f)
    , gravity_(0.0f, -9.81f, 0.0f)
    , windForce_(0.0f)
    , damping_(0.01f)
    , friction_(0.5f)
    , lastTime_(-1.0)
    , accumulator_(0.0)
    , running_(false)
    , initialized_(false)
    , solverMode_(SolverMode::XPBD)
{
    solver_ = std::make_unique<XPBDSolver>();
}

ClothSimulation::~ClothSimulation() {
}

// ─── Solver Mode Switching ───────────────────────────────────────────────

void ClothSimulation::setSolverMode(SolverMode mode) {
    if (mode == solverMode_ && solver_) return;

    SolverMode oldMode = solverMode_;
    solverMode_ = mode;

    // Save solver-specific params before switching
    float oldStiffness = solver_ ? solver_->getStiffness() : 0.9f;
    int oldIterations = solver_ ? solver_->getConstraintIterations() : 15;
    float oldStretch = solver_ ? solver_->getStretchCompliance() : 0.0f;
    float oldShear = solver_ ? solver_->getShearCompliance() : 0.0001f;
    float oldBend = solver_ ? solver_->getBendCompliance() : 0.01f;
    int oldSubsteps = solver_ ? solver_->getNumSubsteps() : 20;

    if (mode == SolverMode::VERLET) {
        solver_ = std::make_unique<VerletSolver>();
        solver_->setStiffness(oldStiffness);
        solver_->setConstraintIterations(oldIterations);

        // XPBD→Verlet state transfer: compute prevPosition from velocity
        if (oldMode == SolverMode::XPBD && initialized_) {
            float dt = static_cast<float>(FIXED_DT_MS / 1000.0);
            for (auto& p : particles_) {
                p.prevPosition = p.position - p.velocity * dt;
                p.velocity = glm::vec3(0.0f);
                p.predictedPosition = p.position;
            }
            for (auto& s : springs_) s.lambda = 0.0f;
        }
    } else {
        solver_ = std::make_unique<XPBDSolver>();
        solver_->setStretchCompliance(oldStretch);
        solver_->setShearCompliance(oldShear);
        solver_->setBendCompliance(oldBend);
        solver_->setNumSubsteps(oldSubsteps);

        // Verlet→XPBD state transfer: compute velocity from prevPosition
        if (oldMode == SolverMode::VERLET && initialized_) {
            float dt = static_cast<float>(FIXED_DT_MS / 1000.0);
            for (auto& p : particles_) {
                p.velocity = (p.position - p.prevPosition) / dt;
                p.predictedPosition = p.position;
            }
            for (auto& s : springs_) s.lambda = 0.0f;
        }
    }

    if (initialized_) {
        auto ctx = makeSolverContext(0.0);
        solver_->prepare(ctx);
    }

    emscripten_log(EM_LOG_CONSOLE, "Solver mode: %s",
        mode == SolverMode::VERLET ? "Verlet (Classic)" : "XPBD (Modern)");
}

// ─── SolverContext builder ───────────────────────────────────────────────

SolverContext ClothSimulation::makeSolverContext(double globalTime) {
    return SolverContext{
        particles_, springs_, colliders_,
        gravity_, windForce_,
        damping_, friction_, clothThickness_,
        selfCollisionEnabled_,
        neighborList_, neighborOffset_,
        hashCellStart_, hashCellEntries_, hashTableSize_,
        globalTime
    };
}

// ─── Sort springs for cache locality ─────────────────────────────────────

void ClothSimulation::sortSpringsForCacheLocality() {
    std::sort(springs_.begin(), springs_.end(), [](const ClothSpring& a, const ClothSpring& b) {
        int minA = std::min(a.particleA, a.particleB);
        int minB = std::min(b.particleA, b.particleB);
        return minA < minB;
    });
}

// ─── Init ────────────────────────────────────────────────────────────────

void ClothSimulation::init(float width, float height, int resX, int resY) {
    resX_ = resX;
    resY_ = resY;
    width_ = width;
    height_ = height;

    particles_.clear();
    particles_.reserve(resX * resY);

    float startX = -width * 0.5f;
    float startY = height;
    float stepX = width / static_cast<float>(resX - 1);
    float stepY = height / static_cast<float>(resY - 1);

    for (int y = 0; y < resY; y++) {
        for (int x = 0; x < resX; x++) {
            glm::vec3 pos(startX + x * stepX, startY - y * stepY, 0.0f);
            bool pinned = (y == 0);
            particles_.emplace_back(pos, pinned);
        }
    }

    initialPositions_.resize(particles_.size());
    for (size_t i = 0; i < particles_.size(); i++)
        initialPositions_[i] = particles_[i].position;

    // Create springs
    springs_.clear();
    auto idx = [resX](int x, int y) -> int { return y * resX + x; };

    for (int y = 0; y < resY; y++) {
        for (int x = 0; x < resX; x++) {
            if (x < resX - 1) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 1, y)].position);
                springs_.emplace_back(idx(x, y), idx(x + 1, y), rest, ClothSpring::STRUCTURAL);
            }
            if (y < resY - 1) {
                float rest = glm::length(particles_[idx(x, y)].position - particles_[idx(x, y + 1)].position);
                springs_.emplace_back(idx(x, y), idx(x, y + 1), rest, ClothSpring::STRUCTURAL);
            }
            if (x < resX - 1 && y < resY - 1) {
                float rest1 = glm::length(particles_[idx(x, y)].position - particles_[idx(x + 1, y + 1)].position);
                springs_.emplace_back(idx(x, y), idx(x + 1, y + 1), rest1, ClothSpring::SHEAR);
                float rest2 = glm::length(particles_[idx(x + 1, y)].position - particles_[idx(x, y + 1)].position);
                springs_.emplace_back(idx(x + 1, y), idx(x, y + 1), rest2, ClothSpring::SHEAR);
            }
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

    // Mesh data
    int vertCount = resX * resY;
    int quadCount = (resX - 1) * (resY - 1);
    cachedMeshData_.vertices.resize(vertCount);
    cachedMeshData_.indices.resize(quadCount * 6);

    int ii = 0;
    for (int y = 0; y < resY - 1; y++) {
        for (int x = 0; x < resX - 1; x++) {
            int tl = idx(x, y), tr = idx(x+1, y), bl = idx(x, y+1), br = idx(x+1, y+1);
            cachedMeshData_.indices[ii++] = tl; cachedMeshData_.indices[ii++] = bl; cachedMeshData_.indices[ii++] = tr;
            cachedMeshData_.indices[ii++] = tr; cachedMeshData_.indices[ii++] = bl; cachedMeshData_.indices[ii++] = br;
        }
    }

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
    sortSpringsForCacheLocality();

    auto ctx = makeSolverContext(0.0);
    solver_->prepare(ctx);
}

void ClothSimulation::initHorizontal(float width, float depth, int resX, int resZ, float dropHeight) {
    resX_ = resX;
    resY_ = resZ;
    width_ = width;
    height_ = depth;

    particles_.clear();
    particles_.reserve(resX * resZ);

    float startX = -width * 0.5f;
    float startZ = -depth * 0.5f;
    float stepX = width / static_cast<float>(resX - 1);
    float stepZ = depth / static_cast<float>(resZ - 1);

    for (int z = 0; z < resZ; z++) {
        for (int x = 0; x < resX; x++) {
            glm::vec3 pos(startX + x * stepX, dropHeight, startZ + z * stepZ);
            particles_.emplace_back(pos, false);
        }
    }

    initialPositions_.resize(particles_.size());
    for (size_t i = 0; i < particles_.size(); i++)
        initialPositions_[i] = particles_[i].position;

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

    int vertCount = resX * resZ;
    int quadCount = (resX - 1) * (resZ - 1);
    cachedMeshData_.vertices.resize(vertCount);
    cachedMeshData_.indices.resize(quadCount * 6);

    int ii = 0;
    for (int y = 0; y < resZ - 1; y++) {
        for (int x = 0; x < resX - 1; x++) {
            int tl = idx(x, y), tr = idx(x+1, y), bl = idx(x, y+1), br = idx(x+1, y+1);
            cachedMeshData_.indices[ii++] = tl; cachedMeshData_.indices[ii++] = bl; cachedMeshData_.indices[ii++] = tr;
            cachedMeshData_.indices[ii++] = tr; cachedMeshData_.indices[ii++] = bl; cachedMeshData_.indices[ii++] = br;
        }
    }

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
    sortSpringsForCacheLocality();

    auto ctx = makeSolverContext(0.0);
    solver_->prepare(ctx);
}

void ClothSimulation::initFromMesh(const MeshData& meshData, int pinMode) {
    int vertCount = static_cast<int>(meshData.vertices.size());
    if (vertCount == 0) return;

    particles_.clear();
    particles_.reserve(vertCount);

    float maxY = -1e30f;
    for (const auto& v : meshData.vertices)
        if (v.position.y > maxY) maxY = v.position.y;

    for (const auto& v : meshData.vertices) {
        bool pinned = (pinMode == 1) && (v.position.y > maxY - 0.05f);
        particles_.emplace_back(v.position, pinned);
    }

    std::set<std::pair<int,int>> edgeSet;
    for (size_t i = 0; i + 2 < meshData.indices.size(); i += 3) {
        int a = meshData.indices[i], b = meshData.indices[i+1], c = meshData.indices[i+2];
        auto addEdge = [&](int u, int v) { edgeSet.insert({std::min(u,v), std::max(u,v)}); };
        addEdge(a, b); addEdge(b, c); addEdge(a, c);
    }

    springs_.clear();
    for (const auto& edge : edgeSet) {
        float rest = glm::length(particles_[edge.first].position - particles_[edge.second].position);
        springs_.emplace_back(edge.first, edge.second, rest, ClothSpring::STRUCTURAL);
    }

    std::map<std::pair<int,int>, std::vector<int>> edgeToOpposite;
    for (size_t i = 0; i + 2 < meshData.indices.size(); i += 3) {
        int tri[3] = { (int)meshData.indices[i], (int)meshData.indices[i+1], (int)meshData.indices[i+2] };
        for (int j = 0; j < 3; j++) {
            int u = tri[j], v = tri[(j+1)%3], opp = tri[(j+2)%3];
            edgeToOpposite[{std::min(u,v), std::max(u,v)}].push_back(opp);
        }
    }
    for (const auto& pair : edgeToOpposite) {
        const auto& opposites = pair.second;
        if (opposites.size() == 2 && opposites[0] != opposites[1]) {
            float rest = glm::length(particles_[opposites[0]].position - particles_[opposites[1]].position);
            springs_.emplace_back(opposites[0], opposites[1], rest, ClothSpring::BEND);
        }
    }

    initialPositions_.resize(vertCount);
    for (int i = 0; i < vertCount; i++)
        initialPositions_[i] = particles_[i].position;

    cachedMeshData_ = meshData;
    resX_ = vertCount;
    resY_ = 1;
    width_ = height_ = 0.0f;

    lastTime_ = -1.0;
    accumulator_ = 0.0;
    initialized_ = true;
    buildNeighborList();
    sortSpringsForCacheLocality();

    auto ctx = makeSolverContext(0.0);
    solver_->prepare(ctx);
}

// ─── Simulation Step (delegates to solver) ───────────────────────────────

void ClothSimulation::step(double currentTimeMs) {
    if (!initialized_ || !running_ || !solver_) return;

    if (lastTime_ < 0.0) {
        lastTime_ = currentTimeMs;
        return;
    }

    double frameDt = currentTimeMs - lastTime_;
    lastTime_ = currentTimeMs;
    if (frameDt > MAX_FRAME_DT_MS) frameDt = MAX_FRAME_DT_MS;

    accumulator_ += frameDt;

    int steps = 0;
    while (accumulator_ >= FIXED_DT_MS && steps < 2) {
        auto ctx = makeSolverContext(currentTimeMs);
        solver_->step(ctx, static_cast<float>(FIXED_DT_MS / 1000.0));
        accumulator_ -= FIXED_DT_MS;
        steps++;
    }

    if (accumulator_ > FIXED_DT_MS * 2.0)
        accumulator_ = 0.0;
}

// ─── Utility ─────────────────────────────────────────────────────────────

void ClothSimulation::translateAll(float dx, float dy, float dz) {
    if (!initialized_) return;
    glm::vec3 delta(dx, dy, dz);
    for (size_t i = 0; i < particles_.size(); i++) {
        particles_[i].position += delta;
        particles_[i].prevPosition += delta;
        particles_[i].predictedPosition += delta;
        initialPositions_[i] += delta;
    }
}

// ─── Grab Interaction ────────────────────────────────────────────────────

int ClothSimulation::findNearestParticleToRay(float ox, float oy, float oz,
                                               float dx, float dy, float dz) const {
    if (!initialized_ || particles_.empty()) return -1;
    glm::vec3 origin(ox, oy, oz);
    glm::vec3 dir = glm::normalize(glm::vec3(dx, dy, dz));

    int bestIdx = -1;
    float bestDist = 0.5f; // threshold — ignore particles farther than this

    for (int i = 0; i < (int)particles_.size(); i++) {
        glm::vec3 op = particles_[i].position - origin;
        float t = glm::dot(op, dir);
        if (t < 0.0f) continue; // behind camera
        glm::vec3 closest = origin + t * dir;
        float dist = glm::length(particles_[i].position - closest);
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
        }
    }
    return bestIdx;
}

void ClothSimulation::grabParticle(int index) {
    if (index < 0 || index >= (int)particles_.size()) return;
    grabbedParticle_ = index;
    grabbedWasPinned_ = particles_[index].pinned;
    grabbedOrigInvMass_ = particles_[index].invMass;
    particles_[index].pinned = true;
    particles_[index].invMass = 0.0f;
}

void ClothSimulation::releaseParticle() {
    if (grabbedParticle_ < 0 || grabbedParticle_ >= (int)particles_.size()) {
        grabbedParticle_ = -1;
        return;
    }
    particles_[grabbedParticle_].pinned = grabbedWasPinned_;
    particles_[grabbedParticle_].invMass = grabbedOrigInvMass_;
    grabbedParticle_ = -1;
}

void ClothSimulation::moveParticle(int index, float x, float y, float z) {
    if (index < 0 || index >= (int)particles_.size()) return;
    glm::vec3 pos(x, y, z);
    particles_[index].position = pos;
    particles_[index].prevPosition = pos;
    particles_[index].predictedPosition = pos;
    particles_[index].velocity = glm::vec3(0.0f);
}

void ClothSimulation::getAABB(glm::vec3& aabbMin, glm::vec3& aabbMax) const {
    if (particles_.empty()) { aabbMin = aabbMax = glm::vec3(0.0f); return; }
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
        particles_[i].predictedPosition = initialPositions_[i];
        particles_[i].velocity = glm::vec3(0.0f);
        particles_[i].acceleration = glm::vec3(0.0f);
    }
    lastTime_ = -1.0;
    accumulator_ = 0.0;
    running_ = false;
    if (solver_) {
        auto ctx = makeSolverContext(0.0);
        solver_->prepare(ctx);
    }
}

const MeshData& ClothSimulation::generateMeshData() {
    int vertCount = resX_ * resY_;
    for (int i = 0; i < vertCount; i++) {
        cachedMeshData_.vertices[i].position = particles_[i].position;
        cachedMeshData_.vertices[i].normal = glm::vec3(0.0f);
    }
    recalculateNormals();
    return cachedMeshData_;
}

// ─── Neighbor list (shared with solvers via SolverContext) ────────────────

void ClothSimulation::buildNeighborList() {
    int n = static_cast<int>(particles_.size());
    if (n == 0) return;

    std::vector<int> count(n, 0);
    for (const auto& s : springs_) { count[s.particleA]++; count[s.particleB]++; }

    neighborOffset_.resize(n + 1);
    neighborOffset_[0] = 0;
    for (int i = 0; i < n; i++) neighborOffset_[i + 1] = neighborOffset_[i] + count[i];

    neighborList_.resize(neighborOffset_[n]);
    std::vector<int> writePos(n, 0);
    for (const auto& s : springs_) {
        neighborList_[neighborOffset_[s.particleA] + writePos[s.particleA]++] = s.particleB;
        neighborList_[neighborOffset_[s.particleB] + writePos[s.particleB]++] = s.particleA;
    }
    for (int i = 0; i < n; i++)
        std::sort(neighborList_.begin() + neighborOffset_[i], neighborList_.begin() + neighborOffset_[i + 1]);

    int32_t desiredSize = 1, target = n / 4;
    while (desiredSize < target && desiredSize < 65536) desiredSize <<= 1;
    hashTableSize_ = glm::max(desiredSize, static_cast<int32_t>(2048));
    hashCellStart_.resize(hashTableSize_ + 1);
    hashCellEntries_.resize(n);
}

void ClothSimulation::recalculateNormals() {
    for (auto& v : cachedMeshData_.vertices) v.normal = glm::vec3(0.0f);

    for (size_t i = 0; i < cachedMeshData_.indices.size(); i += 3) {
        uint32_t i0 = cachedMeshData_.indices[i];
        uint32_t i1 = cachedMeshData_.indices[i + 1];
        uint32_t i2 = cachedMeshData_.indices[i + 2];

        glm::vec3 faceNormal = glm::cross(
            cachedMeshData_.vertices[i1].position - cachedMeshData_.vertices[i0].position,
            cachedMeshData_.vertices[i2].position - cachedMeshData_.vertices[i0].position
        );
        cachedMeshData_.vertices[i0].normal += faceNormal;
        cachedMeshData_.vertices[i1].normal += faceNormal;
        cachedMeshData_.vertices[i2].normal += faceNormal;
    }

    for (auto& v : cachedMeshData_.vertices) {
        float len = glm::length(v.normal);
        v.normal = (len > 1e-7f) ? v.normal / len : glm::vec3(0.0f, 0.0f, 1.0f);
    }
}
