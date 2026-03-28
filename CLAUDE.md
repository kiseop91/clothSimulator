# Project: Hockey Drill Studio (WebGL2)

## WASM Build (CRITICAL)

**NEVER run `cmake --build` or `ninja` directly in `wasm/build/`.**
Always use the build script which compiles AND copies output to `public/wasm/`:

```bash
export EMSDK="/c/Users/$USER/emsdk" && bash scripts/build-wasm.sh
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

- `wasm/src/renderer/` — Core WebGL2 renderer (PBR, shadows)
- `wasm/src/rink/` — Ice rink, drill tokens, path renderer
- `wasm/src/animation/` — Drill animation system
- `wasm/src/scene/` — Scene graph, camera, grid
- `wasm/src/mesh/` — GPU mesh management
- `wasm/src/material/` — PBR material
- `wasm/build/` — CMake build output (NOT served directly)
- `public/wasm/` — Where the web app loads WASM from
- `scripts/build-wasm.sh` — Build + copy script
- `src/` — React/TypeScript frontend
- `src/components/` — DrillEditor, DrillToolbar, RinkViewer, etc.
- `src/hooks/` — useDrillEditor, useRendererBridge, useWasmModule
- `src/types/drill.ts` — Drill data model
- `src/lib/storage.ts` — localStorage persistence

## Architecture

- **2D editing**: SVG overlay (DrillEditor.tsx) for drag/drop tokens and draw paths
- **3D preview**: WebGL2/WASM renderer (RinkViewer.tsx) for 3D rink visualization
- **Data flow**: React state → WASM commands (tokens, paths, animation)
- **Rink**: NHL regulation (200×85 ft), procedurally generated in C++
- **Tokens**: Player, Puck, Cone, Coach — PBR rendered 3D meshes
- **Paths**: Skate/Pass/Shoot/Carry/Backward styles, GL_LINES

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro, /investigate, /document-release, /codex, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade
