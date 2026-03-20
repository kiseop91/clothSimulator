#pragma once

namespace ComputeShaderSources {

// ─── Pass 1: Apply Forces and Predict ─────────────────────────────────
static const char* applyForcesAndPredict = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> predicted: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4f>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let numParticles = u32(params.simConfig.w);
    if (idx >= numParticles) { return; }

    let invMass = positions[idx].w;
    if (invMass == 0.0) {
        predicted[idx] = vec4f(positions[idx].xyz, 0.0);
        return;
    }

    let dt = params.gravity.w;
    var vel = velocities[idx].xyz;

    // Damping
    vel *= (1.0 - params.simConfig.x);

    // Gravity
    var acc = params.gravity.xyz;

    // Wind with turbulence
    let windMag = length(params.wind.xyz);
    if (windMag > 0.001) {
        let pos = positions[idx].xyz;
        let globalTime = params.wind.w;
        let turbulence = 1.0 + 0.3 * sin(globalTime * 0.003 + pos.x * 2.0 + pos.y * 1.5);
        acc += params.wind.xyz * turbulence;
    }

    vel += acc * dt;
    let pred = positions[idx].xyz + vel * dt;

    velocities[idx] = vec4f(vel, 0.0);
    predicted[idx] = vec4f(pred, invMass);
}
)wgsl";

// ─── Pass 2: Reset Lambdas and Jacobi Accumulators ────────────────────
static const char* resetLambdasAndJacobi = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read_write> lambdas: array<f32>;
@group(0) @binding(1) var<storage, read_write> jacobiDX: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read_write> jacobiDY: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> jacobiDZ: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> jacobiCount: array<atomic<u32>>;
@group(0) @binding(5) var<uniform> params: SimParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let numParticles = u32(params.simConfig.w);
    let numSprings = params.simConfig2.x;

    if (idx < numSprings) {
        lambdas[idx] = 0.0;
    }
    if (idx < numParticles) {
        atomicStore(&jacobiDX[idx], 0);
        atomicStore(&jacobiDY[idx], 0);
        atomicStore(&jacobiDZ[idx], 0);
        atomicStore(&jacobiCount[idx], 0u);
    }
}
)wgsl";

// ─── Pass 3: Solve XPBD Constraints (Jacobi + Atomic Accumulation) ───
static const char* solveConstraints = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

struct Spring {
    particleA: u32,
    particleB: u32,
    restLength: f32,
    springType: u32,
}

@group(0) @binding(0) var<storage, read> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read> predicted: array<vec4f>;
@group(0) @binding(2) var<storage, read> springs: array<Spring>;
@group(0) @binding(3) var<uniform> params: SimParams;

@group(1) @binding(0) var<storage, read_write> lambdas: array<f32>;
@group(1) @binding(1) var<storage, read_write> jacobiDX: array<atomic<i32>>;
@group(1) @binding(2) var<storage, read_write> jacobiDY: array<atomic<i32>>;
@group(1) @binding(3) var<storage, read_write> jacobiDZ: array<atomic<i32>>;
@group(1) @binding(4) var<storage, read_write> jacobiCount: array<atomic<u32>>;

const FIXED_POINT_SCALE: f32 = 65536.0;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let springIdx = id.x;
    let numSprings = params.simConfig2.x;
    if (springIdx >= numSprings) { return; }

    let spring = springs[springIdx];
    let predA = predicted[spring.particleA].xyz;
    let predB = predicted[spring.particleB].xyz;

    let diff = predB - predA;
    let currentLength = length(diff);
    if (currentLength < 1e-7) { return; }

    let C = currentLength - spring.restLength;
    let n_dir = diff / currentLength;

    let wA = positions[spring.particleA].w;
    let wB = positions[spring.particleB].w;
    let wSum = wA + wB;
    if (wSum < 1e-12) { return; }

    // Get compliance based on spring type
    var comp: f32;
    if (spring.springType == 0u) {
        comp = params.compliance.x;  // stretch
    } else if (spring.springType == 1u) {
        comp = params.compliance.y;  // shear
    } else {
        comp = params.compliance.z;  // bend
    }

    let dt = params.gravity.w;
    let dtSq = dt * dt;
    let alphaTilde = comp / dtSq;

    let oldLambda = lambdas[springIdx];
    let deltaLambda = -(C + alphaTilde * oldLambda) / (wSum + alphaTilde);
    lambdas[springIdx] = oldLambda + deltaLambda;

    let corrA = -deltaLambda * wA * n_dir;
    let corrB =  deltaLambda * wB * n_dir;

    // Fixed-point atomic accumulation
    atomicAdd(&jacobiDX[spring.particleA], i32(corrA.x * FIXED_POINT_SCALE));
    atomicAdd(&jacobiDY[spring.particleA], i32(corrA.y * FIXED_POINT_SCALE));
    atomicAdd(&jacobiDZ[spring.particleA], i32(corrA.z * FIXED_POINT_SCALE));
    atomicAdd(&jacobiCount[spring.particleA], 1u);

    atomicAdd(&jacobiDX[spring.particleB], i32(corrB.x * FIXED_POINT_SCALE));
    atomicAdd(&jacobiDY[spring.particleB], i32(corrB.y * FIXED_POINT_SCALE));
    atomicAdd(&jacobiDZ[spring.particleB], i32(corrB.z * FIXED_POINT_SCALE));
    atomicAdd(&jacobiCount[spring.particleB], 1u);
}
)wgsl";

// ─── Pass 4: Apply Jacobi Corrections ─────────────────────────────────
static const char* applyJacobiCorrections = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read_write> predicted: array<vec4f>;
@group(0) @binding(1) var<storage, read> jacobiDX: array<i32>;
@group(0) @binding(2) var<storage, read> jacobiDY: array<i32>;
@group(0) @binding(3) var<storage, read> jacobiDZ: array<i32>;
@group(0) @binding(4) var<storage, read> jacobiCount: array<u32>;
@group(0) @binding(5) var<uniform> params: SimParams;

const INV_FIXED_POINT_SCALE: f32 = 1.0 / 65536.0;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let numParticles = u32(params.simConfig.w);
    if (idx >= numParticles) { return; }

    // Check if pinned (invMass stored in predicted.w)
    let invMass = predicted[idx].w;
    if (invMass == 0.0) { return; }

    let count = jacobiCount[idx];
    if (count == 0u) { return; }

    let dx = f32(jacobiDX[idx]) * INV_FIXED_POINT_SCALE;
    let dy = f32(jacobiDY[idx]) * INV_FIXED_POINT_SCALE;
    let dz = f32(jacobiDZ[idx]) * INV_FIXED_POINT_SCALE;

    let avg = vec3f(dx, dy, dz) / f32(count);

    // SOR (Successive Over-Relaxation): omega stored in groundPlane.x
    // omega > 1.0 accelerates convergence for Jacobi solver
    let omega = params.groundPlane.x;
    predicted[idx] = vec4f(predicted[idx].xyz + avg * omega, invMass);
}
)wgsl";

// ─── Pass 5: Handle Collisions (CCD + Mesh BVH + Ground Plane) ───────
static const char* handleCollisions = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> predicted: array<vec4f>;
@group(0) @binding(2) var<storage, read> colliders: array<vec4f>;
@group(0) @binding(3) var<uniform> params: SimParams;
@group(0) @binding(4) var<storage, read> meshTris: array<vec4f>;
@group(0) @binding(5) var<storage, read> meshBVH: array<vec4f>;

// Closest point on triangle (Ericson algorithm)
fn closestPtOnTri(p: vec3f, a: vec3f, b: vec3f, c: vec3f) -> vec3f {
    let ab = b - a; let ac = c - a; let ap = p - a;
    let d1 = dot(ab, ap); let d2 = dot(ac, ap);
    if (d1 <= 0.0 && d2 <= 0.0) { return a; }

    let bp = p - b;
    let d3 = dot(ab, bp); let d4 = dot(ac, bp);
    if (d3 >= 0.0 && d4 <= d3) { return b; }

    let vc = d1 * d4 - d3 * d2;
    if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
        let v = d1 / (d1 - d3);
        return a + v * ab;
    }

    let cp2 = p - c;
    let d5 = dot(ab, cp2); let d6 = dot(ac, cp2);
    if (d6 >= 0.0 && d5 <= d6) { return c; }

    let vb = d5 * d2 - d1 * d6;
    if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
        let w = d2 / (d2 - d6);
        return a + w * ac;
    }

    let va = d3 * d6 - d5 * d4;
    if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return b + w * (c - b);
    }

    let denom = 1.0 / (va + vb + vc);
    let v = vb * denom;
    let w = vc * denom;
    return a + ab * v + ac * w;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let numParticles = u32(params.simConfig.w);
    if (idx >= numParticles) { return; }

    let invMass = predicted[idx].w;
    if (invMass == 0.0) { return; }

    let pos = positions[idx].xyz;
    var pred = predicted[idx].xyz;
    let friction = params.simConfig.y;
    let clothThickness = params.simConfig.z;
    let numSphereColliders = params.simConfig2.z;

    let movement = pred - pos;

    // ── Sphere collisions (existing) ──
    for (var c = 0u; c < numSphereColliders; c++) {
        let collider = colliders[c];
        let center = collider.xyz;
        let radius = collider.w;
        let paddedRadius = radius + clothThickness;

        let oc = pos - center;
        let a = dot(movement, movement);
        let b = 2.0 * dot(oc, movement);
        let cCoeff = dot(oc, oc) - paddedRadius * paddedRadius;

        if (cCoeff < 0.0) {
            let dist = length(oc);
            if (dist > 1e-7) {
                let normal = oc / dist;
                pred = center + normal * (paddedRadius + 0.001);
            } else {
                pred = center + vec3f(0.0, paddedRadius + 0.001, 0.0);
            }
            continue;
        }

        if (a < 1e-12) { continue; }

        let discriminant = b * b - 4.0 * a * cCoeff;
        if (discriminant < 0.0) { continue; }

        let t = (-b - sqrt(discriminant)) / (2.0 * a);
        if (t >= 0.0 && t <= 1.0) {
            let hitPos = pos + t * movement;
            let normal = normalize(hitPos - center);
            let surfacePos = center + normal * (paddedRadius + 0.001);

            let remainingVel = pred - hitPos;
            let vn = normal * dot(remainingVel, normal);
            let vt = remainingVel - vn;
            pred = surfacePos + vt * (1.0 - friction);

            let toP = pred - center;
            let toPLen = length(toP);
            if (toPLen < paddedRadius) {
                pred = center + (toP / max(toPLen, 1e-7)) * (paddedRadius + 0.001);
            }
        }
    }

    // ── Mesh BVH triangle collisions ──
    let numBVHNodes = i32(params.groundPlane.z);
    if (numBVHNodes > 0) {
        var bestDistSq = clothThickness * clothThickness;
        var bestNormal = vec3f(0.0, 1.0, 0.0);
        var bestCorrection = vec3f(0.0);
        var found = false;

        // Iterative BVH traversal
        var stack: array<i32, 32>;
        var stackPtr = 0;
        stack[0] = 0;
        stackPtr = 1;

        while (stackPtr > 0) {
            stackPtr--;
            let nodeIdx = stack[stackPtr];
            let n0 = meshBVH[nodeIdx * 3 + 0];
            let n1 = meshBVH[nodeIdx * 3 + 1];
            let n2 = meshBVH[nodeIdx * 3 + 2];

            let aabbMin = n0.xyz;
            let aabbMax = n1.xyz;

            // AABB test with padding
            if (pred.x < aabbMin.x - clothThickness || pred.x > aabbMax.x + clothThickness ||
                pred.y < aabbMin.y - clothThickness || pred.y > aabbMax.y + clothThickness ||
                pred.z < aabbMin.z - clothThickness || pred.z > aabbMax.z + clothThickness) {
                continue;
            }

            let left = i32(n0.w);
            let right = i32(n1.w);
            let triStart = i32(n2.x);
            let triCount = i32(n2.y);

            if (triCount > 0) {
                // Leaf: test triangles
                for (var t = 0; t < triCount; t++) {
                    let ti = (triStart + t) * 4;
                    let tv0 = meshTris[ti + 0].xyz;
                    let tv1 = meshTris[ti + 1].xyz;
                    let tv2 = meshTris[ti + 2].xyz;
                    let tn  = meshTris[ti + 3].xyz;

                    let closest = closestPtOnTri(pred, tv0, tv1, tv2);
                    let diff = pred - closest;
                    let distSq = dot(diff, diff);
                    if (distSq < bestDistSq) {
                        bestDistSq = distSq;
                        bestNormal = tn;
                        let dist = sqrt(distSq);
                        if (dist < 1e-7) {
                            bestCorrection = tn * clothThickness;
                        } else {
                            var dir = diff / dist;
                            if (dot(dir, tn) < 0.0) { dir = -dir; }
                            bestCorrection = dir * (clothThickness - dist + 0.001);
                        }
                        found = true;
                    }
                }
            } else {
                // Internal: push children
                if (left >= 0 && stackPtr < 31) { stack[stackPtr] = left; stackPtr++; }
                if (right >= 0 && stackPtr < 31) { stack[stackPtr] = right; stackPtr++; }
            }
        }

        if (found) {
            pred += bestCorrection;
            // Friction
            let vel = pred - pos;
            let vnComp = dot(vel, bestNormal);
            let vTangent = vel - bestNormal * vnComp;
            pred = pos + vTangent * (1.0 - friction) + bestCorrection;
        }
    }

    // ── Ground plane collision ──
    let groundY = params.groundPlane.w;
    if (pred.y < groundY) {
        let vel = pred - pos;
        let tangentX = vel.x * (1.0 - friction);
        let tangentZ = vel.z * (1.0 - friction);
        pred = vec3f(pos.x + tangentX, groundY, pos.z + tangentZ);
    }

    predicted[idx] = vec4f(pred, invMass);
}
)wgsl";

// ─── Pass 6: Update Velocities and Commit Positions ───────────────────
static const char* updateVelocitiesAndCommit = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read> predicted: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> prevPositions: array<vec4f>;
@group(0) @binding(4) var<uniform> params: SimParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let numParticles = u32(params.simConfig.w);
    if (idx >= numParticles) { return; }

    let invMass = positions[idx].w;
    if (invMass == 0.0) { return; }

    let dt = params.gravity.w;
    if (dt < 1e-10) { return; }

    let oldPos = positions[idx].xyz;
    let newPos = predicted[idx].xyz;
    let vel = (newPos - oldPos) / dt;

    prevPositions[idx] = vec4f(oldPos, invMass);
    positions[idx] = vec4f(newPos, invMass);
    velocities[idx] = vec4f(vel, 0.0);
}
)wgsl";

// ─── Pass 7a: Reset Normal Accumulators ───────────────────────────────
static const char* resetNormals = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read_write> normalAccumX: array<atomic<i32>>;
@group(0) @binding(1) var<storage, read_write> normalAccumY: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read_write> normalAccumZ: array<atomic<i32>>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let numParticles = u32(params.simConfig.w);
    if (idx >= numParticles) { return; }

    atomicStore(&normalAccumX[idx], 0);
    atomicStore(&normalAccumY[idx], 0);
    atomicStore(&normalAccumZ[idx], 0);
}
)wgsl";

// ─── Pass 7b: Accumulate Face Normals ─────────────────────────────────
static const char* accumulateFaceNormals = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> normalAccumX: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read_write> normalAccumY: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> normalAccumZ: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read> indices: array<u32>;
@group(0) @binding(5) var<uniform> params: SimParams;

const NORMAL_SCALE: f32 = 32768.0;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let triIdx = id.x;
    let numTriangles = params.simConfig2.y;
    if (triIdx >= numTriangles) { return; }

    let base = triIdx * 3u;
    let i0 = indices[base + 0u];
    let i1 = indices[base + 1u];
    let i2 = indices[base + 2u];

    let v0 = positions[i0].xyz;
    let v1 = positions[i1].xyz;
    let v2 = positions[i2].xyz;

    // Area-weighted face normal (not normalized)
    let faceNormal = cross(v1 - v0, v2 - v0);

    // Accumulate to all 3 vertices using fixed-point atomics
    let fnx = i32(faceNormal.x * NORMAL_SCALE);
    let fny = i32(faceNormal.y * NORMAL_SCALE);
    let fnz = i32(faceNormal.z * NORMAL_SCALE);

    atomicAdd(&normalAccumX[i0], fnx);
    atomicAdd(&normalAccumY[i0], fny);
    atomicAdd(&normalAccumZ[i0], fnz);

    atomicAdd(&normalAccumX[i1], fnx);
    atomicAdd(&normalAccumY[i1], fny);
    atomicAdd(&normalAccumZ[i1], fnz);

    atomicAdd(&normalAccumX[i2], fnx);
    atomicAdd(&normalAccumY[i2], fny);
    atomicAdd(&normalAccumZ[i2], fnz);
}
)wgsl";

// ─── Pass 7c: Assemble Vertex Buffer ──────────────────────────────────
static const char* assembleVertexBuffer = R"wgsl(
struct SimParams {
    gravity: vec4f,
    wind: vec4f,
    simConfig: vec4f,
    simConfig2: vec4u,
    groundPlane: vec4f,
    compliance: vec4f,
}

@group(0) @binding(0) var<storage, read> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read> normalAccumX: array<i32>;
@group(0) @binding(2) var<storage, read> normalAccumY: array<i32>;
@group(0) @binding(3) var<storage, read> normalAccumZ: array<i32>;
@group(0) @binding(4) var<storage, read> texCoords: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> vertexOutput: array<f32>;
@group(0) @binding(6) var<uniform> params: SimParams;

const INV_NORMAL_SCALE: f32 = 1.0 / 32768.0;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let numParticles = u32(params.simConfig.w);
    if (idx >= numParticles) { return; }

    let pos = positions[idx].xyz;

    // Decode and normalize the accumulated normal
    var nx = f32(normalAccumX[idx]) * INV_NORMAL_SCALE;
    var ny = f32(normalAccumY[idx]) * INV_NORMAL_SCALE;
    var nz = f32(normalAccumZ[idx]) * INV_NORMAL_SCALE;

    let nLen = sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen > 1e-7) {
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;
    } else {
        nx = 0.0;
        ny = 0.0;
        nz = 1.0;
    }

    let tc = texCoords[idx];

    // Write interleaved vertex data (matches CPU Vertex struct: 32 bytes)
    // position(12) + normal(12) + texCoord(8)
    let base = idx * 8u;
    vertexOutput[base + 0u] = pos.x;
    vertexOutput[base + 1u] = pos.y;
    vertexOutput[base + 2u] = pos.z;
    vertexOutput[base + 3u] = nx;
    vertexOutput[base + 4u] = ny;
    vertexOutput[base + 5u] = nz;
    vertexOutput[base + 6u] = tc.x;
    vertexOutput[base + 7u] = tc.y;
}
)wgsl";

} // namespace ComputeShaderSources
