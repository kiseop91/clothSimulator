#pragma once

#include <glm/glm.hpp>
#include <vector>
#include "simulation/ClothParticle.h"
#include "simulation/ClothSpring.h"
#include "simulation/CollisionBody.h"
#include "mesh/MeshData.h"

class ClothSimulation {
public:
    ClothSimulation();
    ~ClothSimulation();

    void init(float width, float height, int resX, int resY);
    void initHorizontal(float width, float depth, int resX, int resZ, float dropHeight);
    void initFromMesh(const MeshData& meshData, int pinMode);
    void step(double currentTimeMs);
    void reset();

    const MeshData& generateMeshData();

    // State
    void setRunning(bool r) { running_ = r; }
    bool isRunning() const { return running_; }
    bool isInitialized() const { return initialized_; }

    // Parameters
    void setGravity(float x, float y, float z) { gravity_ = glm::vec3(x, y, z); }
    void setWindForce(float x, float y, float z) { windForce_ = glm::vec3(x, y, z); }
    void setStiffness(float s) { stiffness_ = glm::clamp(s, 0.0f, 1.0f); }
    void setDamping(float d) { damping_ = glm::clamp(d, 0.0f, 0.1f); }
    void setFriction(float f) { friction_ = glm::clamp(f, 0.0f, 1.0f); }
    void setSelfCollision(bool enabled) { selfCollisionEnabled_ = enabled; }
    bool getSelfCollision() const { return selfCollisionEnabled_; }
    void setClothThickness(float t) { clothThickness_ = glm::clamp(t, 0.005f, 0.2f); }
    float getClothThickness() const { return clothThickness_; }

    const glm::vec3& getGravity() const { return gravity_; }
    const glm::vec3& getWindForce() const { return windForce_; }
    float getStiffness() const { return stiffness_; }
    float getDamping() const { return damping_; }
    float getFriction() const { return friction_; }

    // Collision
    void clearColliders() { colliders_.clear(); }
    void addCollider(const CollisionBody& body) { colliders_.push_back(body); }

    // Translation (move all particles)
    void translateAll(float dx, float dy, float dz);

    // AABB for picking
    void getAABB(glm::vec3& aabbMin, glm::vec3& aabbMax) const;

    int getResX() const { return resX_; }
    int getResY() const { return resY_; }

private:
    void substep(float dt, double globalTime);
    void applyForces(double globalTime);
    void verletIntegrate(float dt);
    void solveConstraints();
    void handleCollisions();
    void buildNeighborList();
    void buildSpatialHash();
    void handleSelfCollision();
    bool isNeighbor(int i, int j) const;
    void recalculateNormals();

    // Grid dimensions
    int resX_, resY_;
    float width_, height_;

    // Particles and springs
    std::vector<ClothParticle> particles_;
    std::vector<ClothSpring> springs_;
    std::vector<CollisionBody> colliders_;

    // Initial positions for reset
    std::vector<glm::vec3> initialPositions_;

    // Cached mesh data (preallocated, rewritten each frame)
    MeshData cachedMeshData_;

    // Simulation parameters
    glm::vec3 gravity_;
    glm::vec3 windForce_;
    float stiffness_;
    float damping_;
    float friction_;
    int constraintIterations_;

    // Timing
    double lastTime_;
    double accumulator_;
    static constexpr double FIXED_DT_MS = 16.0;
    static constexpr double MAX_FRAME_DT_MS = 33.0;

    // State
    bool running_;
    bool initialized_;

    // Self-collision
    bool selfCollisionEnabled_ = false;
    float clothThickness_ = 0.05f;

    // Neighbor exclusion (built once at init)
    std::vector<int> neighborList_;
    std::vector<int> neighborOffset_;

    // Spatial hash (rebuilt each frame)
    std::vector<int32_t> hashCellStart_;
    std::vector<int32_t> hashCellEntries_;
    int32_t hashTableSize_ = 2048;
};
