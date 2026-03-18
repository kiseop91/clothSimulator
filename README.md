# Cloth Simulator

WebGL2 기반 3D 모델 뷰어 + 실시간 Cloth 시뮬레이션 프로젝트.
C++/Emscripten WASM 렌더러와 React/TypeScript 프론트엔드로 구성.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 8 |
| Renderer | C++, Emscripten (WASM), WebGL2, GLM |
| 3D Formats | OBJ, FBX (OpenFBX), glTF |
| Physics | Verlet Integration, Position-Based Dynamics |

## 프로젝트 구조

```
├── src/                          # React 프론트엔드
│   ├── components/
│   │   ├── ModelViewer.tsx        # 3D 캔버스 + 카메라 컨트롤
│   │   └── PropertiesPanel.tsx    # 속성 패널 (Transform, Material, Simulation)
│   ├── hooks/
│   │   ├── useWasmModule.ts       # WASM 모듈 로딩
│   │   └── useRendererBridge.ts   # React ↔ WASM 브릿지
│   ├── context/
│   │   └── RendererContext.tsx     # 렌더러 Context Provider
│   └── types/
│       └── wasm.d.ts              # WASM 모듈 TypeScript 타입
├── wasm/                          # C++ WASM 렌더러
│   ├── src/
│   │   ├── main.cpp               # Emscripten 바인딩 (JS ↔ C++)
│   │   ├── renderer/
│   │   │   ├── Renderer.cpp/h     # WebGL2 렌더링 파이프라인
│   │   │   ├── Shader.cpp/h       # PBR + Wireframe 셰이더
│   │   │   └── ShaderSources.h    # GLSL 소스
│   │   ├── simulation/
│   │   │   ├── ClothSimulation.cpp/h  # Cloth 물리 시뮬레이션
│   │   │   ├── ClothParticle.h    # 입자 구조체
│   │   │   ├── ClothSpring.h      # 스프링 구조체
│   │   │   └── CollisionBody.h    # 충돌체 구조체
│   │   ├── scene/
│   │   │   ├── Scene.cpp/h        # 씬 관리
│   │   │   ├── Camera.cpp/h       # 궤도 카메라
│   │   │   └── Grid.cpp/h         # 그리드 렌더링
│   │   ├── mesh/
│   │   │   ├── Mesh.cpp/h         # GPU 메시 (per-mesh transform)
│   │   │   └── MeshData.h         # 정점/인덱스 데이터
│   │   └── loaders/
│   │       └── ModelLoader.cpp/h  # OBJ/FBX/glTF 로더
│   └── CMakeLists.txt
├── scripts/
│   └── build-wasm.sh              # WASM 빌드 스크립트
├── public/                        # 정적 파일
├── index.html
├── vite.config.ts
└── package.json
```

## 사전 요구사항

- **Node.js** 18+
- **Emscripten SDK (emsdk)** — [설치 가이드](https://emscripten.org/docs/getting_started/downloads.html)
- **Ninja** build system (`pip install ninja`)

## 빌드 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. WASM 빌드

```bash
# emsdk 경로를 환경변수로 설정
export EMSDK="/path/to/emsdk"

# WASM 빌드
npm run build:wasm
```

Windows에서:
```bash
EMSDK="/c/Users/user/emsdk" npm run build:wasm
```

### 3. 개발 서버 실행

```bash
npm run dev
```

외부 접속 허용:
```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

### 4. 프로덕션 빌드

```bash
npm run build
```

## 주요 기능

### 3D 모델 뷰어
- OBJ, FBX, glTF 파일 업로드 및 렌더링
- PBR 머테리얼 (Base Color, Metallic, Roughness)
- 궤도 카메라 (좌클릭 회전, 우클릭 팬, 휠 줌)
- 개별 메시 선택, 위치 변경, 가시성 토글, 삭제

### Cloth 시뮬레이션
- **Hang 모드**: 상단 고정 수직 옷감
- **Drop 모드**: 수평 자유 낙하 옷감
- **Mesh to Cloth**: 업로드된 3D 모델을 cloth로 변환
- 실시간 물리 파라미터 조정:
  - Gravity, Wind Force
  - Stiffness, Damping, Friction
- 옷감 크기/해상도 조정

### 충돌 시스템
- 충돌 구체 추가/삭제/위치 변경
- 구체 선택 하이라이트 (ray-sphere intersection)
- 바닥 평면 충돌
- 마찰력 (접선 속도 감쇠)

### 오브젝트 관리
- 로드된 메시 리스트 관리 (선택, 위치 변경, 가시성, 삭제)
- 충돌 구체 리스트 관리
- 캔버스 클릭으로 오브젝트 선택 (ray casting)
