#pragma once

#include "simulation/IClothSolver.h"
#include <vector>

class XPBDSolver : public IClothSolver {
public:
    XPBDSolver();
    void prepare(SolverContext& ctx) override;
    void step(SolverContext& ctx, float dt) override;

    void setStretchCompliance(float c) override { stretchCompliance_ = glm::max(c, 0.0f); complianceDirty_ = true; }
    void setShearCompliance(float c) override { shearCompliance_ = glm::max(c, 0.0f); complianceDirty_ = true; }
    void setBendCompliance(float c) override { bendCompliance_ = glm::max(c, 0.0f); complianceDirty_ = true; }
    void setConstraintIterations(int n) override { constraintIters_ = glm::clamp(n, 1, 10); }
    int getConstraintIterations() const override { return constraintIters_; }
    void setNumSubsteps(int n) override { numSubsteps_ = glm::clamp(n, 1, 100); }

    float getStretchCompliance() const override { return stretchCompliance_; }
    float getShearCompliance() const override { return shearCompliance_; }
    float getBendCompliance() const override { return bendCompliance_; }
    int getNumSubsteps() const override { return numSubsteps_; }

private:
    void applyForces(SolverContext& ctx);
    void predictPositions(SolverContext& ctx, float dt);
    void solveXPBDConstraints(SolverContext& ctx, float dt);
    void handleCollisionsCCD(SolverContext& ctx);
    void updateVelocities(SolverContext& ctx, float dt);
    void updateSpringCompliance(SolverContext& ctx);
    void buildSpatialHash(SolverContext& ctx);
    void handleSelfCollision(SolverContext& ctx);

    float stretchCompliance_ = 0.0f;
    float shearCompliance_ = 0.0001f;
    float bendCompliance_ = 0.01f;
    bool complianceDirty_ = false;
    int constraintIters_ = 2;  // Jacobi iterations per substep
    int numSubsteps_ = 20;

    // Jacobi solver buffers
    std::vector<glm::vec3> jacobiDeltas_;
    std::vector<int> jacobiCounts_;
};
