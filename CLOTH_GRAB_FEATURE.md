# Cloth Grab & Drag Interaction Feature

## 개요
옷감을 마우스로 클릭(누른 상태)해서 잡아 이동시키는 기능.
- **시뮬레이션 OFF**: 전체 cloth가 이동 (기존 translateAll 활용)
- **시뮬레이션 ON**: 클릭 지점의 가장 가까운 파티클을 잡아서 임시 고정(pin), 드래그로 이동 → 릴리즈 시 해제. 옷을 잡아 늘리는 느낌.

---

## 핵심 로직

1. 마우스 클릭 시 `screenToRay()`로 레이 생성
2. 레이와 모든 파티클 사이 최소 거리 계산 → 가장 가까운 파티클 인덱스 반환
3. 해당 파티클을 `pinned=true, invMass=0`으로 설정 (솔버가 움직이지 않게)
4. 드래그 중: 마우스 이동량을 카메라 로컬 좌표로 변환 → 파티클 위치 업데이트
5. 릴리즈: 원래 `pinned/invMass` 복원

### 시뮬 OFF 시
- 기존 `translateCloth(dx, dy, dz)` 사용 (전체 이동)
- 카메라 right/up 벡터 기반으로 화면 드래그를 월드 좌표로 변환

---

## 수정할 파일

### C++ (WASM)

**`wasm/src/simulation/ClothSimulation.h/.cpp`** — 파티클 조작 메서드 추가
```cpp
// 레이와 가장 가까운 파티클 찾기 (ray-point distance)
int findNearestParticleToRay(float ox, oy, oz, float dx, dy, dz) const;

// 개별 파티클 grab/release
void grabParticle(int index);      // pinned=true, invMass=0, 원래 상태 저장
void releaseParticle(int index);   // 원래 pinned/invMass 복원
void moveParticle(int index, float x, float y, float z);  // position 직접 설정
```
내부 상태: `int grabbedParticle_ = -1;` + `bool grabbedWasPinned_ = false;`

**`wasm/src/renderer/Renderer.h/.cpp`** — 상위 API
```cpp
int grabClothParticle(float ndcX, float ndcY);    // screenToRay → findNearest → grab
void moveGrabbedParticle(float ndcX, float ndcY);  // 카메라 평면 투영 → moveParticle
void releaseClothParticle();                        // release
```
카메라 right/up 벡터 계산하여 NDC 이동량을 월드 좌표로 변환.

**`wasm/src/main.cpp`** — Emscripten 바인딩 3개 추가
```cpp
int grabClothParticle(float ndcX, float ndcY);
void moveGrabbedParticle(float ndcX, float ndcY);
void releaseClothParticle();
```

### TypeScript

**`src/types/wasm.d.ts`** — 타입 추가
```typescript
grabClothParticle(ndcX: number, ndcY: number): number;
moveGrabbedParticle(ndcX: number, ndcY: number): void;
releaseClothParticle(): void;
```

**`src/components/ModelViewer.tsx`** — 드래그 로직
- 새 ref: `grabbedParticleRef = useRef(-1)`
- `handlePointerDown`: cloth 히트 시 → `grabClothParticle(ndcX, ndcY)`
  - 시뮬 OFF: 전체 이동 모드 진입 (`isDraggingClothRef`)
  - 시뮬 ON: 파티클 잡기 모드 진입 (`grabbedParticleRef`)
- `handlePointerMove`:
  - 전체 이동 모드: `translateCloth(worldDx, worldDy, 0)` (카메라 right/up 기준)
  - 파티클 잡기 모드: `moveGrabbedParticle(ndcX, ndcY)`
- `handlePointerUp`: `releaseClothParticle()`

---

## 파티클 찾기 알고리즘

레이-점 거리 공식 (3D):
```
P = particle position
O = ray origin
D = ray direction (normalized)
t = dot(P - O, D)           // 레이 위의 가장 가까운 점의 t값
if (t < 0) skip;            // 카메라 뒤쪽 제외
closest = O + t * D          // 레이 위의 가장 가까운 점
dist = length(P - closest)   // 파티클과의 거리
```
모든 파티클을 순회하며 최소 dist를 가진 인덱스 반환.

---

## 드래그 중 위치 변환

파티클의 depth(카메라로부터의 거리)를 유지하면서 카메라 평면 상에서 이동:
```cpp
// Renderer::moveGrabbedParticle(ndcX, ndcY)
// 1. 파티클의 현재 위치를 뷰 공간으로 변환 → depth 값 획득
// 2. 새 NDC에서 레이 생성
// 3. 레이 위에서 같은 depth의 점 계산 (O + t*D where t = depth/dot(D, viewForward))
// 4. 그 점으로 파티클 이동
```

---

## GPU 솔버 호환성

GPU 모드에서는 파티클 상태가 GPU 버퍼에 있음.
- grab/release 시 `queue.WriteBuffer()`로 해당 파티클의 positions 버퍼 일부만 업데이트
- `positionsBuffer_`의 `index * 16` 오프셋에 vec4f 하나만 쓰면 됨 (16바이트)
- GpuClothSolver에 `updateSingleParticle(queue, index, position, invMass)` 메서드 추가

---

## 검증

1. `bash scripts/build-wasm.sh` 빌드 성공
2. 시뮬 OFF: cloth 좌클릭+드래그 → 전체 이동, 릴리즈 후 정상
3. 시뮬 ON: cloth 좌클릭 → 파티클 고정, 드래그로 옷 늘리기, 릴리즈 → 파티클 해제되며 물리 반응
4. 시뮬 ON + GPU 모드: 동일하게 동작
5. 시뮬 중 잡은 파티클이 원래 pinned였으면 릴리즈 후에도 pinned 유지
6. 우클릭은 기존 카메라 팬 유지 (간섭 없음)
