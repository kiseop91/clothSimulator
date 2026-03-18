export interface WasmModule {
  initRenderer(canvasId: string): boolean;
  resizeViewport(width: number, height: number): void;
  destroyRenderer(): void;
  loadModel(data: Uint8Array, size: number, ext: string): boolean;
  cameraRotate(dx: number, dy: number): void;
  cameraZoom(delta: number): void;
  cameraPan(dx: number, dy: number): void;
  cameraResetView(): void;
  setPosition(x: number, y: number, z: number): void;
  setRotation(x: number, y: number, z: number): void;
  setScale(x: number, y: number, z: number): void;
  setBaseColor(r: number, g: number, b: number): void;
  setMetallic(value: number): void;
  setRoughness(value: number): void;
  setLayerVisible(layerName: string, visible: boolean): void;
  getVertexCount(): number;
  getFaceCount(): number;
  getTriangleCount(): number;
  exportScreenshot(): string;

  // Cloth simulation
  addClothMesh(width: number, height: number, resX: number, resY: number): void;
  addClothMeshHorizontal(width: number, depth: number, resX: number, resZ: number, dropHeight: number): void;
  toggleSimulation(running: boolean): void;
  resetCloth(): void;
  setGravity(x: number, y: number, z: number): void;
  setWindForce(x: number, y: number, z: number): void;
  setClothStiffness(value: number): void;
  setClothDamping(value: number): void;
  setClothFriction(value: number): void;
  isSimulationRunning(): boolean;
  convertMeshToCloth(meshIndex: number, pinMode: number): void;
  getLoadedMeshCount(): number;
  getLoadedMeshName(index: number): string;

  // Per-mesh transforms
  setMeshPosition(index: number, x: number, y: number, z: number): void;
  setMeshRotation(index: number, x: number, y: number, z: number): void;
  setMeshScale(index: number, x: number, y: number, z: number): void;
  getMeshPositionX(index: number): number;
  getMeshPositionY(index: number): number;
  getMeshPositionZ(index: number): number;
  removeLoadedMesh(index: number): void;
  setMeshVisible(index: number, visible: boolean): void;

  // Light control
  setLightPosition(x: number, y: number, z: number): void;
  setLightColor(r: number, g: number, b: number): void;
  setLightIntensity(v: number): void;
  setAmbientTop(r: number, g: number, b: number): void;
  setAmbientBottom(r: number, g: number, b: number): void;
  getLightPositionX(): number;
  getLightPositionY(): number;
  getLightPositionZ(): number;

  // UV control
  setUVOffset(u: number, v: number): void;
  setUVTiling(u: number, v: number): void;

  // Rendering modes
  setWireframeMode(enabled: boolean): void;
  loadDiffuseTexture(data: Uint8Array, size: number): void;
  clearDiffuseTexture(): void;

  // Collision spheres
  addCollisionSphere(x: number, y: number, z: number, radius: number): void;
  removeCollisionSphere(index: number): void;
  getCollisionSphereCount(): number;

  // Object selection and manipulation
  pickObject(ndcX: number, ndcY: number): number;
  setCollisionSpherePosition(index: number, x: number, y: number, z: number): void;
  translateCloth(dx: number, dy: number, dz: number): void;
  setSelectedSphere(index: number): void;
  getCollisionSphereX(index: number): number;
  getCollisionSphereY(index: number): number;
  getCollisionSphereZ(index: number): number;
}

export type WasmFactory = (config?: object) => Promise<WasmModule>;
