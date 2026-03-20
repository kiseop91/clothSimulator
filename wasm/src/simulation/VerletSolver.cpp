#include "simulation/VerletSolver.h"
#include "simulation/ClothParticle.h"
#include "simulation/ClothSpring.h"
#include "simulation/CollisionBody.h"
#include "simulation/MeshCollider.h"
#include <cmath>
#include <algorithm>

VerletSolver::VerletSolver() {}

void VerletSolver::prepare(SolverContext& /*ctx*/) {
    // No special preparation needed for Verlet
}

void VerletSolver::step(SolverContext& ctx, float dt) {
    applyForces(ctx);
    verletIntegrate(ctx, dt);
    solveConstraints(ctx);
    handleCollisions(ctx);
    if (ctx.selfCollisionEnabled) {
        handleSelfCollision(ctx);
    }
}

void VerletSolver::applyForces(SolverContext& ctx) {
    for (auto& p : ctx.particles) {
        if (p.pinned) continue;
        p.acceleration = ctx.gravity;
        if (glm::length(ctx.windForce) > 0.001f) {
            float turbulence = 1.0f + 0.3f * std::sin(
                static_cast<float>(ctx.globalTime * 0.003) + p.position.x * 2.0f + p.position.y * 1.5f
            );
            p.acceleration += ctx.windForce * turbulence;
        }
    }
}

void VerletSolver::verletIntegrate(SolverContext& ctx, float dt) {
    for (auto& p : ctx.particles) {
        if (p.pinned) continue;
        glm::vec3 velocity = (p.position - p.prevPosition) * (1.0f - ctx.damping);
        p.prevPosition = p.position;
        p.position = p.position + velocity + p.acceleration * dt * dt;
    }
}

void VerletSolver::solveConstraints(SolverContext& ctx) {
    for (int iter = 0; iter < constraintIterations_; iter++) {
        for (auto& spring : ctx.springs) {
            ClothParticle& pA = ctx.particles[spring.particleA];
            ClothParticle& pB = ctx.particles[spring.particleB];

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

void VerletSolver::handleCollisions(SolverContext& ctx) {
    for (auto& p : ctx.particles) {
        if (p.pinned) continue;

        for (const auto& collider : ctx.colliders) {
            float paddedRadius = collider.radius + ctx.clothThickness;
            glm::vec3 toParticle = p.position - collider.center;
            float dist = glm::length(toParticle);

            if (dist < paddedRadius && dist > 1e-7f) {
                glm::vec3 normal = glm::normalize(toParticle);
                glm::vec3 newPos = collider.center + normal * (paddedRadius + 0.001f);

                glm::vec3 velocity = p.position - p.prevPosition;
                glm::vec3 vTangent = velocity - normal * glm::dot(velocity, normal);
                glm::vec3 frictionVelocity = vTangent * (1.0f - ctx.friction);

                p.position = newPos;
                // Dampen post-collision velocity to reduce bouncing
                p.prevPosition = newPos - frictionVelocity * 0.5f;
            }
        }

        // Mesh triangle collisions
        for (const auto& meshCol : ctx.meshColliders) {
            glm::vec3 correction, triNormal;
            if (meshCol.pointCollision(p.position, ctx.clothThickness, correction, triNormal)) {
                p.position += correction;
                glm::vec3 velocity = p.position - p.prevPosition;
                float vn = glm::dot(velocity, triNormal);
                glm::vec3 vTangent = velocity - triNormal * vn;
                p.prevPosition = p.position - vTangent * (1.0f - ctx.friction);
            }
        }

        // Ground plane
        constexpr float groundEpsilon = 0.005f;
        if (p.position.y < groundEpsilon) {
            glm::vec3 velocity = p.position - p.prevPosition;
            glm::vec3 tangentVel(velocity.x * (1.0f - ctx.friction), 0.0f, velocity.z * (1.0f - ctx.friction));
            p.position.y = groundEpsilon;
            p.prevPosition = p.position - tangentVel;
        }
    }
}

void VerletSolver::buildSpatialHash(SolverContext& ctx) {
    int n = static_cast<int>(ctx.particles.size());
    float cellSize = 2.0f * ctx.clothThickness;
    float invCell = 1.0f / cellSize;

    std::fill(ctx.hashCellStart.begin(), ctx.hashCellStart.end(), 0);

    for (int i = 0; i < n; i++) {
        const glm::vec3& p = ctx.particles[i].position;
        int cx = static_cast<int>(std::floor(p.x * invCell));
        int cy = static_cast<int>(std::floor(p.y * invCell));
        int cz = static_cast<int>(std::floor(p.z * invCell));
        int32_t h = ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & (ctx.hashTableSize - 1);
        ctx.hashCellStart[h]++;
    }

    int32_t sum = 0;
    for (int32_t i = 0; i < ctx.hashTableSize; i++) {
        int32_t count = ctx.hashCellStart[i];
        ctx.hashCellStart[i] = sum;
        sum += count;
    }
    ctx.hashCellStart[ctx.hashTableSize] = sum;

    std::vector<int32_t> cursor(ctx.hashCellStart.begin(), ctx.hashCellStart.begin() + ctx.hashTableSize);
    for (int i = 0; i < n; i++) {
        const glm::vec3& p = ctx.particles[i].position;
        int cx = static_cast<int>(std::floor(p.x * invCell));
        int cy = static_cast<int>(std::floor(p.y * invCell));
        int cz = static_cast<int>(std::floor(p.z * invCell));
        int32_t h = ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & (ctx.hashTableSize - 1);
        ctx.hashCellEntries[cursor[h]++] = i;
    }
}

void VerletSolver::handleSelfCollision(SolverContext& ctx) {
    int n = static_cast<int>(ctx.particles.size());
    if (n == 0) return;

    buildSpatialHash(ctx);

    float cellSize = 2.0f * ctx.clothThickness;
    float invCell = 1.0f / cellSize;
    float minDist = 2.0f * ctx.clothThickness;
    float minDist2 = minDist * minDist;

    auto isNeighbor = [&](int i, int j) -> bool {
        auto begin = ctx.neighborList.begin() + ctx.neighborOffset[i];
        auto end = ctx.neighborList.begin() + ctx.neighborOffset[i + 1];
        return std::binary_search(begin, end, j);
    };

    for (int i = 0; i < n; i++) {
        if (ctx.particles[i].pinned) continue;
        const glm::vec3& pi = ctx.particles[i].position;
        int cx = static_cast<int>(std::floor(pi.x * invCell));
        int cy = static_cast<int>(std::floor(pi.y * invCell));
        int cz = static_cast<int>(std::floor(pi.z * invCell));

        for (int dz = -1; dz <= 1; dz++) {
            for (int dy = -1; dy <= 1; dy++) {
                for (int dx = -1; dx <= 1; dx++) {
                    int32_t h = (((cx+dx)*73856093) ^ ((cy+dy)*19349663) ^ ((cz+dz)*83492791)) & (ctx.hashTableSize - 1);
                    for (int32_t k = ctx.hashCellStart[h]; k < ctx.hashCellStart[h+1]; k++) {
                        int j = ctx.hashCellEntries[k];
                        if (j <= i) continue;
                        if (ctx.particles[j].pinned) continue;
                        if (isNeighbor(i, j)) continue;

                        glm::vec3 diff = ctx.particles[j].position - ctx.particles[i].position;
                        float dist2 = glm::dot(diff, diff);
                        if (dist2 < minDist2 && dist2 > 1e-12f) {
                            float dist = std::sqrt(dist2);
                            glm::vec3 normal = diff / dist;
                            float penetration = minDist - dist;
                            float totalInvMass = ctx.particles[i].invMass + ctx.particles[j].invMass;
                            if (totalInvMass < 1e-7f) continue;
                            float wi = ctx.particles[i].invMass / totalInvMass;
                            float wj = ctx.particles[j].invMass / totalInvMass;
                            glm::vec3 correction = normal * penetration;
                            ctx.particles[i].position -= correction * wi;
                            ctx.particles[j].position += correction * wj;
                        }
                    }
                }
            }
        }
    }
}
