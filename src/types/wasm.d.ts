export interface WasmModule {
  // Renderer lifecycle
  initRenderer(canvasId: string): boolean;
  resizeViewport(width: number, height: number): void;
  destroyRenderer(): void;

  // Camera
  cameraRotate(dx: number, dy: number): void;
  cameraZoom(delta: number): void;
  cameraPan(dx: number, dy: number): void;
  cameraResetView(): void;
  setCameraPreset(preset: number): void;

  // Rink
  setRinkLayout(layout: number): void;

  // Drill tokens
  addDrillToken(type: number, x: number, z: number, r: number, g: number, b: number): number;
  setTokenPosition(idx: number, x: number, z: number): void;
  setTokenColor(idx: number, r: number, g: number, b: number): void;
  removeToken(idx: number): void;
  clearAllTokens(): void;

  // Paths (via WASM heap pointer)
  setDrillPaths(ptr: number, floatCount: number): void;
  clearDrillPaths(): void;

  // Animation
  setAnimationData(ptr: number, count: number): void;
  setPlaybackTime(t: number): void;
  clearAnimation(): void;

  // Misc
  exportScreenshot(): string;
  setWireframeMode(enabled: boolean): void;
  getFrameTimeMs(): number;

  // Material
  setBaseColor(r: number, g: number, b: number): void;
  setMetallic(v: number): void;
  setRoughness(v: number): void;

  // Lighting
  setLightPosition(x: number, y: number, z: number): void;
  setLightColor(r: number, g: number, b: number): void;
  setLightIntensity(v: number): void;
  setAmbientTop(r: number, g: number, b: number): void;
  setAmbientBottom(r: number, g: number, b: number): void;

  // WASM heap access
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
}

export type WasmFactory = (config?: object) => Promise<WasmModule>;
