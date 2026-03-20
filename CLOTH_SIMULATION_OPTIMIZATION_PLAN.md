# 고해상도 Cloth Simulation 성능 최적화 및 터널링 해결

## Context

Resolution=550 설정 시 **302,500개 파티클**, **~2.42M개 스프링** 생성. 현재 구조의 문제점:

1. **극심한 성능 저하**: `solveConstraints()`가 매 substep마다 2.42M 스프링 × 15 iterations = **~36M constraint projections** (CPU 단일 스레드)
2. **터널링**: 이산 충돌 검출(Discrete Collision Detection)만 사용 → 파티클이 구체를 뚫고 지나감
3. **비효율적 알고리즘**: Verlet + Spring 방식은 stiffness-iteration 의존성이 높아 고해상도에서 수렴 느림

**목표**: XPBD 기반 솔버 전환 + GPU Compute Shader 병렬화 + CCD 터널링 방지

---

## Phase 1: XPBD 솔버 전환 (CPU, 즉각적 품질 향상)

### 1.1 Verlet+Spring → XPBD 전환
**파일:** `wasm/src/simulation/ClothSimulation.h`, `ClothSimulation.cpp`

현재 Verlet 적분 + 스프링 기반 제약 해결을 XPBD(Extended Position Based Dynamics)로 전환.

**XPBD 핵심 알고리즘:**
```
for each substep:
    1. predict positions: x* = x + v*dt + a*dt²
    2. for each constraint i: λᵢ = 0  (Lagrange multiplier 초기화)
    3. for each iteration:
       for each constraint C:
           α̃ = α / dt²         (compliance, α = 1/stiffness)
           ΔC = C(x*)           (constraint error)
           Δλ = -(ΔC + α̃·λ) / (∇C·w·∇Cᵀ + α̃)
           Δx = Δλ · w · ∇C    (position correction)
           x* += Δx
           λ += Δλ
    4. v = (x* - x) / dt
    5. x = x*
```

**변경 사항:**
- `ClothParticle.h`: `predictedPosition` 추가
- `ClothSpring.h`: `float lambda = 0.0f` (Lagrange multiplier), `float compliance` (α = 1/stiffness) 추가
- `ClothSimulation.h`:
  - `verletIntegrate()` → `predictPositions(float dt)`
  - `solveConstraints()` → `solveXPBDConstraints(float dt)`
  - `updateVelocities(float dt)` 추가
  - `stiffness_` 대신 타입별 compliance: `stretchCompliance_`, `bendCompliance_`, `shearCompliance_`
- `ClothSimulation.cpp`:
  - `substep()` 순서: `predictPositions() → solveXPBDConstraints() → handleCollisions() → handleSelfCollision() → updateVelocities()`

### 1.2 Small Steps 전략 (Macklin et al. 2019)
**참조:** "Small Steps in Physics Simulation" - Miles Macklin, Matthias Müller

**핵심 인사이트:** n iterations × 1 big step **<** n substeps × 1 iteration

현재: `FIXED_DT_MS=16ms`, `constraintIterations_=15`, max 2 substeps/frame
변경: `numSubsteps_=20`, 1 XPBD iteration per substep, `subDt = FIXED_DT_MS / numSubsteps_`

```cpp
void ClothSimulation::substep(float dt, double globalTime) {
    float subDt = dt / static_cast<float>(numSubsteps_);
    for (int s = 0; s < numSubsteps_; s++) {
        predictPositions(subDt);
        // Reset lambdas
        for (auto& spring : springs_) spring.lambda = 0.0f;
        solveXPBDConstraints(subDt);  // 1 iteration
        handleCollisions();
        if (selfCollisionEnabled_) handleSelfCollision();
        updateVelocities(subDt);
    }
}
```

이점:
- 수렴 속도 대폭 향상 (작은 dt에서 1회 iteration이 큰 dt에서 N회보다 안정적)
- Stiffness가 timestep/iteration 독립적
- 코드 단순화 (iteration 루프 제거)

### 1.3 Constraint 타입별 Compliance 설정

| Constraint | Compliance (α) | 설명 |
|------------|----------------|------|
| Stretch (구조) | 0.0 (매우 stiff) | 늘어남 방지 |
| Shear (전단) | 0.0001 | 약간의 전단 허용 |
| Bend (굽힘) | 0.01 ~ 0.1 | 자연스러운 주름 |

UI에서 `stretchCompliance`, `bendCompliance` 노출.

---

## Phase 2: 터널링 방지

### 2.1 구체 충돌 — CCD (Continuous Collision Detection)
**파일:** `ClothSimulation.cpp` — `handleCollisions()`

현재 이산 충돌만 검출: `if (dist < collider.radius)` → 빠른 파티클이 한 프레임에 구체를 관통.

**해결: Ray-Sphere CCD**
```cpp
void ClothSimulation::handleCollisionsCCD() {
    for (auto& p : particles_) {
        if (p.pinned) continue;

        glm::vec3 movement = p.predictedPosition - p.position;  // 이번 substep 이동

        for (const auto& collider : colliders_) {
            float paddedRadius = collider.radius + clothThickness_;

            // Ray-sphere intersection: |p.position + t*movement - center|² = paddedRadius²
            glm::vec3 oc = p.position - collider.center;
            float a = glm::dot(movement, movement);
            float b = 2.0f * glm::dot(oc, movement);
            float c = glm::dot(oc, oc) - paddedRadius * paddedRadius;

            // 이미 내부에 있는 경우 (discrete fallback)
            if (c < 0.0f) {
                float dist = glm::length(oc);
                if (dist > 1e-7f) {
                    glm::vec3 normal = oc / dist;
                    p.predictedPosition = collider.center + normal * (paddedRadius + 0.001f);
                }
                continue;
            }

            float discriminant = b * b - 4.0f * a * c;
            if (discriminant < 0.0f || a < 1e-12f) continue;

            float t = (-b - std::sqrt(discriminant)) / (2.0f * a);
            if (t >= 0.0f && t <= 1.0f) {
                // 충돌 지점으로 되돌리고 표면에 투영
                glm::vec3 hitPos = p.position + t * movement;
                glm::vec3 normal = glm::normalize(hitPos - collider.center);
                p.predictedPosition = collider.center + normal * (paddedRadius + 0.001f);

                // Friction
                glm::vec3 vel = p.predictedPosition - p.position;
                glm::vec3 vn = normal * glm::dot(vel, normal);
                glm::vec3 vt = vel - vn;
                p.predictedPosition = p.position + vt * (1.0f - friction_);
                // 표면 위에 있도록 보장
                glm::vec3 toP = p.predictedPosition - collider.center;
                if (glm::length(toP) < paddedRadius) {
                    p.predictedPosition = collider.center + glm::normalize(toP) * (paddedRadius + 0.001f);
                }
            }
        }
    }
}
```

### 2.2 파티클 속도 제한 (안전장치)
substep 내 이동 거리를 제한하여 극단적 터널링 방지:
```cpp
void ClothSimulation::limitParticleMovement(float maxDist) {
    for (auto& p : particles_) {
        if (p.pinned) continue;
        glm::vec3 disp = p.predictedPosition - p.position;
        float dist = glm::length(disp);
        if (dist > maxDist) {
            p.predictedPosition = p.position + disp * (maxDist / dist);
        }
    }
}
```
`maxDist`는 가장 작은 충돌체 반지름의 절반 또는 스프링 rest length 기준으로 설정.

### 2.3 Self-Collision 개선
기존 `handleSelfCollision()` 로직은 유지하되, predicted position 기반으로 동작하도록 수정.

---

## Phase 3: CPU 성능 최적화 (GPU 전환 전 단계)

### 3.1 Spatial Locality 최적화
**파일:** `ClothSimulation.cpp`

스프링 배열을 파티클 인덱스 기준으로 정렬하여 캐시 히트율 향상:
```cpp
void ClothSimulation::sortSpringsForCacheLocality() {
    std::sort(springs_.begin(), springs_.end(), [](const ClothSpring& a, const ClothSpring& b) {
        int minA = std::min(a.particleA, a.particleB);
        int minB = std::min(b.particleA, b.particleB);
        return minA < minB;
    });
}
```

### 3.2 Self-Collision 최적화
- `hashTableSize_`를 파티클 수에 비례하게 확대: `hashTableSize_ = nextPowerOf2(n / 4)`
- `isNeighbor()` binary search를 비트마스크 또는 flat set으로 대체 (고해상도에서 병목)

### 3.3 Constraint 순회 최적화
XPBD Jacobi 방식 적용 (GPU 전환 준비):
```cpp
void ClothSimulation::solveXPBDConstraintsJacobi(float dt) {
    float dtSq = dt * dt;

    // Accumulate corrections (Jacobi-style)
    std::vector<glm::vec3> deltas(particles_.size(), glm::vec3(0.0f));
    std::vector<int> counts(particles_.size(), 0);

    for (auto& spring : springs_) {
        // ... compute XPBD correction ...
        deltas[spring.particleA] += corrA;
        deltas[spring.particleB] += corrB;
        counts[spring.particleA]++;
        counts[spring.particleB]++;
    }

    // Apply averaged corrections
    for (size_t i = 0; i < particles_.size(); i++) {
        if (!particles_[i].pinned && counts[i] > 0) {
            particles_[i].predictedPosition += deltas[i] / static_cast<float>(counts[i]);
        }
    }
}
```

Jacobi 방식은 수렴이 느리지만 **완전 병렬화 가능** → GPU 전환의 전제 조건.

---

## Phase 4: GPU Compute Shader (WebGPU) — 대규모 성능 점프

> **이 Phase는 Phase 1~3 완료 후 별도 작업으로 진행. 설계만 기술.**

### 4.1 아키텍처
시뮬레이션 전체를 WebGPU Compute Shader로 이전:

```
[CPU] init → upload buffers → [GPU] simulate N substeps → [CPU] read back for render
```

### 4.2 GPU 버퍼 레이아웃
```
positions:     float4[] × numParticles  (xyz + invMass)
prevPositions: float4[] × numParticles
velocities:    float4[] × numParticles
springs:       uint2[]  × numSprings    (particleA, particleB)
springParams:  float2[] × numSprings    (restLength, compliance)
lambdas:       float[]  × numSprings
deltas:        float4[] × numParticles  (Jacobi accumulation)
counts:        uint[]   × numParticles  (Jacobi count)
```

### 4.3 Compute Shader 파이프라인 (per substep)
1. **predict_positions.wgsl** — `@workgroup_size(256)`: 위치 예측
2. **reset_lambdas.wgsl** — 람다/델타 초기화
3. **solve_constraints.wgsl** — `@workgroup_size(256)`: Jacobi XPBD (스프링당 1 스레드)
4. **apply_deltas.wgsl** — 평균 적용 (파티클당 1 스레드)
5. **handle_collisions.wgsl** — CCD 충돌 (파티클당 1 스레드)
6. **update_velocities.wgsl** — 속도 업데이트

### 4.4 예상 성능
- 논문 기준: WebGPU에서 640K 노드 @ 60fps 달성 가능
- 302K 파티클(550×550)은 충분히 실시간 가능한 범위

---

## 구현 순서 및 파일 변경 목록

### 즉시 구현 (Phase 1-3, CPU)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `wasm/src/simulation/ClothParticle.h` | `predictedPosition` 필드 추가 |
| 2 | `wasm/src/simulation/ClothSpring.h` | `lambda`, `compliance` 필드 추가 |
| 3 | `wasm/src/simulation/ClothSimulation.h` | XPBD 메서드 시그니처, compliance 파라미터, `numSubsteps_` 추가 |
| 4 | `wasm/src/simulation/ClothSimulation.cpp` | XPBD 솔버, CCD 충돌, small steps, Jacobi 방식 구현 |
| 5 | `wasm/src/main.cpp` | 새 파라미터 바인딩 (compliance, substeps) |
| 6 | `src/types/wasm.d.ts` | TypeScript 타입 업데이트 |
| 7 | `src/components/PropertiesPanel.tsx` | UI 컨트롤 추가 (compliance, substeps) |

### 향후 구현 (Phase 4, GPU)
별도 계획으로 분리 — WebGPU compute shader 파이프라인 전체 구현

---

## 검증

1. `bash scripts/build-wasm.sh` 빌드 성공 확인
2. Resolution=30 (기본)에서 기존과 동일한 시뮬레이션 품질 확인
3. Resolution=100에서 stiff cloth 동작 확인 (늘어남 없이 자연스러운 주름)
4. 구체 충돌 시 터널링 없음 확인 (빠르게 떨어지는 cloth가 구체를 뚫지 않음)
5. Resolution=550에서 시뮬레이션 실행 가능 여부 확인 (CPU 한계 내)
6. 브라우저 콘솔에 에러 없음 확인

---

## 참조 자료

- [Real-Time Cloth Simulation Using WebGPU (arxiv)](https://arxiv.org/html/2507.11794v1) — WebGPU 640K 노드 @ 60fps
- [Small Steps in Physics Simulation (Macklin et al.)](https://mmacklin.com/smallsteps.pdf) — n substeps × 1 iter > 1 step × n iter
- [XPBD Paper (Macklin, Müller)](https://matthias-research.github.io/pages/publications/XPBD.pdf) — Compliance 기반 제약 해결
- [Velvet CUDA XPBD Engine](https://github.com/vitalight/Velvet) — Jacobi solver, SDF collision, atomic 최적화
- [WebGPU XPBD Cloth (jspdown)](https://github.com/jspdown/cloth) — Parallel Gauss-Seidel with graph coloring
- [WebGPU XPBD Cloth (ccincotti3)](https://github.com/ccincotti3/webgpu_cloth_simulator) — Small steps XPBD
- [Robust Collisions (Bridson et al.)](https://graphics.stanford.edu/papers/cloth-sig02/cloth.pdf) — CCD + repulsion forces
- [Ten Minute Physics XPBD](https://matthias-research.github.io/pages/tenMinutePhysics/09-xpbd.pdf) — XPBD 튜토리얼
- [GPU Simulation (Matthias Müller)](https://matthias-research.github.io/pages/tenMinutePhysics/16-GPUSimulation.pdf) — GPU Jacobi solver
