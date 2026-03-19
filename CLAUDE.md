# Project: WebGPU Cloth Simulation

## WASM Build (CRITICAL)

**NEVER run `cmake --build` or `ninja` directly in `wasm/build/`.**
Always use the build script which compiles AND copies output to `public/wasm/`:

```bash
bash scripts/build-wasm.sh
```

Or on Windows:
```cmd
build-and-serve.bat
```

The build script:
1. Runs emcmake + ninja in `wasm/build/`
2. Copies `renderer.js` + `renderer.wasm` → `public/wasm/`

Without step 2, the browser loads stale WASM and changes appear to have no effect.

## Dev Server

```cmd
npx vite
```

## Project Structure

- `wasm/src/` — C++ source (Emscripten/WebGPU)
- `wasm/build/` — CMake build output (NOT served directly)
- `public/wasm/` — Where the web app loads WASM from
- `scripts/build-wasm.sh` — Build + copy script
