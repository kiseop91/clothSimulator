#pragma once

#include <glm/glm.hpp>
#include <vector>
#include <cstdint>

struct ClothParticle;
struct ClothSpring;
struct CollisionBody;

// Data passed from ClothSimulation to the active solver
struct SolverContext {
    std::vector<ClothParticle>& particles;
    std::vector<ClothSpring>& springs;
    const std::vector<CollisionBody>& colliders;

    glm::vec3 gravity;
    glm::vec3 windForce;
    float damping;
    float friction;
    float clothThickness;
    bool selfCollisionEnabled;

    // Self-collision support (owned by ClothSimulation)
    const std::vector<int>& neighborList;
    const std::vector<int>& neighborOffset;
    std::vector<int32_t>& hashCellStart;
    std::vector<int32_t>& hashCellEntries;
    int32_t hashTableSize;

    double globalTime;
};

enum class SolverMode { VERLET = 0, XPBD = 1 };

class IClothSolver {
public:
    virtual ~IClothSolver() = default;

    // Called when solver is activated or cloth is re-initialized
    virtual void prepare(SolverContext& ctx) = 0;

    // Called each fixed timestep (~16ms)
    virtual void step(SolverContext& ctx, float dt) = 0;

    // Solver-specific parameter setters (no-ops by default)
    virtual void setStiffness(float) {}
    virtual void setConstraintIterations(int) {}
    virtual void setStretchCompliance(float) {}
    virtual void setShearCompliance(float) {}
    virtual void setBendCompliance(float) {}
    virtual void setNumSubsteps(int) {}

    virtual float getStiffness() const { return 0.9f; }
    virtual int getConstraintIterations() const { return 15; }
    virtual float getStretchCompliance() const { return 0.0f; }
    virtual float getShearCompliance() const { return 0.0001f; }
    virtual float getBendCompliance() const { return 0.01f; }
    virtual int getNumSubsteps() const { return 20; }
};
