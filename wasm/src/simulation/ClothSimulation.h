#pragma once

#include <glm/glm.hpp>
#include <vector>
#include <memory>
#include "simulation/ClothParticle.h"
#include "simulation/ClothSpring.h"
#include "simulation/CollisionBody.h"
#include "simulation/IClothSolver.h"
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

    // Solver mode
    void setSolverMode(SolverMode mode);
    SolverMode getSolverMode() const { return solverMode_; }

    // State
    void setRunning(bool r) { running_ = r; }
    bool isRunning() const { return running_; }
    bool isInitialized() const { return initialized_; }

    // Shared parameters
    void setGravity(float x, float y, float z) { gravity_ = glm::vec3(x, y, z); }
    void setWindForce(float x, float y, float z) { windForce_ = glm::vec3(x, y, z); }
    void setDamping(float d) { damping_ = glm::clamp(d, 0.0f, 0.1f); }
    void setFriction(float f) { friction_ = glm::clamp(f, 0.0f, 1.0f); }
    void setSelfCollision(bool enabled) { selfCollisionEnabled_ = enabled; }
    bool getSelfCollision() const { return selfCollisionEnabled_; }
    void setClothThickness(float t) { clothThickness_ = glm::clamp(t, 0.005f, 0.2f); }
    float getClothThickness() const { return clothThickness_; }

    const glm::vec3& getGravity() const { return gravity_; }
    const glm::vec3& getWindForce() const { return windForce_; }
    float getDamping() const { return damping_; }
    float getFriction() const { return friction_; }

    // Solver-delegated parameters
    void setStiffness(float s) { if (solver_) solver_->setStiffness(s); }
    float getStiffness() const { return solver_ ? solver_->getStiffness() : 0.9f; }
    void setConstraintIterations(int n) { if (solver_) solver_->setConstraintIterations(n); }
    int getConstraintIterations() const { return solver_ ? solver_->getConstraintIterations() : 15; }
    void setStretchCompliance(float c) { if (solver_) solver_->setStretchCompliance(c); }
    void setShearCompliance(float c) { if (solver_) solver_->setShearCompliance(c); }
    void setBendCompliance(float c) { if (solver_) solver_->setBendCompliance(c); }
    float getStretchCompliance() const { return solver_ ? solver_->getStretchCompliance() : 0.0f; }
    float getShearCompliance() const { return solver_ ? solver_->getShearCompliance() : 0.0001f; }
    float getBendCompliance() const { return solver_ ? solver_->getBendCompliance() : 0.01f; }
    void setNumSubsteps(int n) { if (solver_) solver_->setNumSubsteps(n); }
    int getNumSubsteps() const { return solver_ ? solver_->getNumSubsteps() : 20; }

    // Collision
    void clearColliders() { colliders_.clear(); }
    void addCollider(const CollisionBody& body) { colliders_.push_back(body); }

    // Translation
    void translateAll(float dx, float dy, float dz);

    // Grab interaction
    int findNearestParticleToRay(float ox, float oy, float oz,
                                  float dx, float dy, float dz) const;
    void grabParticle(int index);
    void releaseParticle();
    void moveParticle(int index, float x, float y, float z);
    int getGrabbedParticle() const { return grabbedParticle_; }

    // AABB for picking
    void getAABB(glm::vec3& aabbMin, glm::vec3& aabbMax) const;

    int getResX() const { return resX_; }
    int getResY() const { return resY_; }

    // Accessors for GPU solver
    const std::vector<ClothParticle>& getParticles() const { return particles_; }
    const std::vector<ClothSpring>& getSprings() const { return springs_; }
    const MeshData& getCachedMeshData() const { return cachedMeshData_; }

private:
    SolverContext makeSolverContext(double globalTime);
    void buildNeighborList();
    void sortSpringsForCacheLocality();
    void recalculateNormals();

    // Solver
    std::unique_ptr<IClothSolver> solver_;
    SolverMode solverMode_ = SolverMode::XPBD;

    // Grid dimensions
    int resX_, resY_;
    float width_, height_;

    // Particles and springs
    std::vector<ClothParticle> particles_;
    std::vector<ClothSpring> springs_;
    std::vector<CollisionBody> colliders_;

    // Initial positions for reset
    std::vector<glm::vec3> initialPositions_;

    // Cached mesh data
    MeshData cachedMeshData_;

    // Shared simulation parameters
    glm::vec3 gravity_;
    glm::vec3 windForce_;
    float damping_;
    float friction_;

    // Timing
    double lastTime_;
    double accumulator_;
    static constexpr double FIXED_DT_MS = 16.0;
    static constexpr double MAX_FRAME_DT_MS = 33.0;

    // State
    bool running_;
    bool initialized_;

    // Grab state
    int grabbedParticle_ = -1;
    bool grabbedWasPinned_ = false;
    float grabbedOrigInvMass_ = 1.0f;

    // Self-collision
    bool selfCollisionEnabled_ = false;
    float clothThickness_ = 0.05f;

    // Neighbor exclusion (built once at init, shared with solvers)
    std::vector<int> neighborList_;
    std::vector<int> neighborOffset_;

    // Spatial hash (rebuilt each frame by solver)
    std::vector<int32_t> hashCellStart_;
    std::vector<int32_t> hashCellEntries_;
    int32_t hashTableSize_ = 2048;
};
