#include "simulation/XPBDSolver.h"
#include "simulation/ClothParticle.h"
#include "simulation/ClothSpring.h"
#include "simulation/CollisionBody.h"
#include "simulation/MeshCollider.h"
#include <cmath>
#include <algorithm>

XPBDSolver::XPBDSolver() {}

void XPBDSolver::prepare(SolverContext& ctx) {
    size_t n = ctx.particles.size();
    jacobiDeltas_.resize(n, glm::vec3(0.0f));
    jacobiCounts_.resize(n, 0);
    updateSpringCompliance(ctx);
}

void XPBDSolver::updateSpringCompliance(SolverContext& ctx) {
    for (auto& s : ctx.springs) {
        switch (s.type) {
            case ClothSpring::STRUCTURAL: s.compliance = stretchCompliance_; break;
            case ClothSpring::SHEAR:      s.compliance = shearCompliance_;   break;
            case ClothSpring::BEND:       s.compliance = bendCompliance_;    break;
        }
    }
}

void XPBDSolver::step(SolverContext& ctx, float dt) {
    if (complianceDirty_) {
        updateSpringCompliance(ctx);
        complianceDirty_ = false;
    }
    float subDt = dt / static_cast<float>(numSubsteps_);

    for (int s = 0; s < numSubsteps_; s++) {
        applyForces(ctx);
        predictPositions(ctx, subDt);

        // Reset Lagrange multipliers each substep
        for (auto& spring : ctx.springs) spring.lambda = 0.0f;

        // Multiple Jacobi iterations per substep for better convergence
        for (int iter = 0; iter < constraintIters_; iter++) {
            solveXPBDConstraints(ctx, subDt);
        }
        handleCollisionsCCD(ctx);
        if (ctx.selfCollisionEnabled) {
            handleSelfCollision(ctx);
        }
        updateVelocities(ctx, subDt);
    }
}

void XPBDSolver::applyForces(SolverContext& ctx) {
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

void XPBDSolver::predictPositions(SolverContext& ctx, float dt) {
    for (auto& p : ctx.particles) {
        if (p.pinned) {
            p.predictedPosition = p.position;
            continue;
        }
        p.velocity *= (1.0f - ctx.damping);
        p.velocity += p.acceleration * dt;
        p.predictedPosition = p.position + p.velocity * dt;
    }
}

void XPBDSolver::solveXPBDConstraints(SolverContext& ctx, float dt) {
    float dtSq = dt * dt;
    if (dtSq < 1e-14f) return;

    int n = static_cast<int>(ctx.particles.size());

    std::fill(jacobiDeltas_.begin(), jacobiDeltas_.begin() + n, glm::vec3(0.0f));
    std::fill(jacobiCounts_.begin(), jacobiCounts_.begin() + n, 0);

    for (auto& spring : ctx.springs) {
        ClothParticle& pA = ctx.particles[spring.particleA];
        ClothParticle& pB = ctx.particles[spring.particleB];

        glm::vec3 diff = pB.predictedPosition - pA.predictedPosition;
        float currentLength = glm::length(diff);
        if (currentLength < 1e-7f) continue;

        float C = currentLength - spring.restLength;
        glm::vec3 n_dir = diff / currentLength;

        float wA = pA.invMass;
        float wB = pB.invMass;
        float wSum = wA + wB;
        if (wSum < 1e-12f) continue;

        float alphaTilde = spring.compliance / dtSq;
        float deltaLambda = -(C + alphaTilde * spring.lambda) / (wSum + alphaTilde);
        spring.lambda += deltaLambda;

        glm::vec3 corrA = -deltaLambda * wA * n_dir;
        glm::vec3 corrB =  deltaLambda * wB * n_dir;

        jacobiDeltas_[spring.particleA] += corrA;
        jacobiDeltas_[spring.particleB] += corrB;
        jacobiCounts_[spring.particleA]++;
        jacobiCounts_[spring.particleB]++;
    }

    for (int i = 0; i < n; i++) {
        if (!ctx.particles[i].pinned && jacobiCounts_[i] > 0) {
            ctx.particles[i].predictedPosition += jacobiDeltas_[i] / static_cast<float>(jacobiCounts_[i]);
        }
    }
}

void XPBDSolver::handleCollisionsCCD(SolverContext& ctx) {
    for (auto& p : ctx.particles) {
        if (p.pinned) continue;

        glm::vec3 movement = p.predictedPosition - p.position;

        for (const auto& collider : ctx.colliders) {
            float paddedRadius = collider.radius + ctx.clothThickness;

            glm::vec3 oc = p.position - collider.center;
            float a = glm::dot(movement, movement);
            float b = 2.0f * glm::dot(oc, movement);
            float c = glm::dot(oc, oc) - paddedRadius * paddedRadius;

            if (c < 0.0f) {
                float dist = glm::length(oc);
                if (dist > 1e-7f) {
                    glm::vec3 normal = oc / dist;
                    p.predictedPosition = collider.center + normal * (paddedRadius + 0.001f);
                } else {
                    p.predictedPosition = collider.center + glm::vec3(0.0f, paddedRadius + 0.001f, 0.0f);
                }
                continue;
            }

            if (a < 1e-12f) continue;

            float discriminant = b * b - 4.0f * a * c;
            if (discriminant < 0.0f) continue;

            float t = (-b - std::sqrt(discriminant)) / (2.0f * a);
            if (t >= 0.0f && t <= 1.0f) {
                glm::vec3 hitPos = p.position + t * movement;
                glm::vec3 normal = glm::normalize(hitPos - collider.center);
                glm::vec3 surfacePos = collider.center + normal * (paddedRadius + 0.001f);

                glm::vec3 remainingVel = p.predictedPosition - hitPos;
                glm::vec3 vn = normal * glm::dot(remainingVel, normal);
                glm::vec3 vt = remainingVel - vn;

                // Dampen tangential velocity on collision to reduce bouncing
                p.predictedPosition = surfacePos + vt * (1.0f - ctx.friction) * 0.5f;

                glm::vec3 toP = p.predictedPosition - collider.center;
                float toPLen = glm::length(toP);
                if (toPLen < paddedRadius) {
                    p.predictedPosition = collider.center + (toP / glm::max(toPLen, 1e-7f)) * (paddedRadius + 0.001f);
                }
            }
        }

        // Mesh triangle collisions
        for (const auto& meshCol : ctx.meshColliders) {
            glm::vec3 correction, triNormal;
            if (meshCol.pointCollision(p.predictedPosition, ctx.clothThickness, correction, triNormal)) {
                p.predictedPosition += correction;
                // Apply friction along surface
                glm::vec3 vel = p.predictedPosition - p.position;
                float vn = glm::dot(vel, triNormal);
                glm::vec3 vTangent = vel - triNormal * vn;
                p.predictedPosition = p.position + vTangent * (1.0f - ctx.friction) + correction;
            }
        }

        constexpr float groundEpsilon = 0.005f;
        if (p.predictedPosition.y < groundEpsilon) {
            glm::vec3 vel = p.predictedPosition - p.position;
            glm::vec3 tangentVel(vel.x * (1.0f - ctx.friction), 0.0f, vel.z * (1.0f - ctx.friction));
            p.predictedPosition.y = groundEpsilon;
            p.predictedPosition.x = p.position.x + tangentVel.x;
            p.predictedPosition.z = p.position.z + tangentVel.z;
        }
    }
}

void XPBDSolver::updateVelocities(SolverContext& ctx, float dt) {
    if (dt < 1e-10f) return;
    float invDt = 1.0f / dt;

    for (auto& p : ctx.particles) {
        if (p.pinned) continue;
        p.velocity = (p.predictedPosition - p.position) * invDt;
        p.prevPosition = p.position;
        p.position = p.predictedPosition;
    }
}

void XPBDSolver::buildSpatialHash(SolverContext& ctx) {
    int n = static_cast<int>(ctx.particles.size());
    float cellSize = 2.0f * ctx.clothThickness;
    float invCell = 1.0f / cellSize;

    std::fill(ctx.hashCellStart.begin(), ctx.hashCellStart.end(), 0);
    for (int i = 0; i < n; i++) {
        const glm::vec3& p = ctx.particles[i].position;
        int cx = static_cast<int>(std::floor(p.x * invCell));
        int cy = static_cast<int>(std::floor(p.y * invCell));
        int cz = static_cast<int>(std::floor(p.z * invCell));
        int32_t h = ((cx*73856093) ^ (cy*19349663) ^ (cz*83492791)) & (ctx.hashTableSize - 1);
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
        int32_t h = ((cx*73856093) ^ (cy*19349663) ^ (cz*83492791)) & (ctx.hashTableSize - 1);
        ctx.hashCellEntries[cursor[h]++] = i;
    }
}

void XPBDSolver::handleSelfCollision(SolverContext& ctx) {
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
