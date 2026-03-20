#pragma once

#include "simulation/IClothSolver.h"

class VerletSolver : public IClothSolver {
public:
    VerletSolver();
    void prepare(SolverContext& ctx) override;
    void step(SolverContext& ctx, float dt) override;

    void setStiffness(float s) override { stiffness_ = glm::clamp(s, 0.0f, 1.0f); }
    void setConstraintIterations(int n) override { constraintIterations_ = glm::clamp(n, 1, 100); }
    float getStiffness() const override { return stiffness_; }
    int getConstraintIterations() const override { return constraintIterations_; }

private:
    void applyForces(SolverContext& ctx);
    void verletIntegrate(SolverContext& ctx, float dt);
    void solveConstraints(SolverContext& ctx);
    void handleCollisions(SolverContext& ctx);
    void buildSpatialHash(SolverContext& ctx);
    void handleSelfCollision(SolverContext& ctx);

    float stiffness_ = 0.9f;
    int constraintIterations_ = 15;
};
