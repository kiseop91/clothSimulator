import { useState, useCallback, useRef } from "react";
import type { WasmModule } from "../types/wasm.d.ts";

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface Material {
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
}

export interface MeshInfo {
  vertices: number;
  faces: number;
  triangles: number;
}

export interface Layer {
  name: string;
  visible: boolean;
}

export interface CollisionSphere {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface LoadedMesh {
  name: string;
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export interface SimulationState {
  running: boolean;
  gravity: [number, number, number];
  wind: [number, number, number];
  stiffness: number;
  damping: number;
  friction: number;
  clothAdded: boolean;
  collisionSpheres: CollisionSphere[];
  selectedObjectType: 'none' | 'sphere' | 'cloth';
  selectedObjectIndex: number;
}

export interface RendererBridge {
  transform: Transform;
  material: Material;
  meshInfo: MeshInfo;
  layers: Layer[];
  simulation: SimulationState;
  loadedMeshes: LoadedMesh[];
  selectedMeshIndex: number;
  setPosition: (x: number, y: number, z: number) => void;
  setRotation: (x: number, y: number, z: number) => void;
  setScale: (x: number, y: number, z: number) => void;
  setBaseColor: (r: number, g: number, b: number) => void;
  setMetallic: (value: number) => void;
  setRoughness: (value: number) => void;
  setLayerVisible: (name: string, visible: boolean) => void;
  loadModel: (data: ArrayBuffer, extension: string) => boolean;
  refreshMeshInfo: () => void;
  addClothMesh: (width: number, height: number, resX: number, resY: number) => void;
  addClothMeshHorizontal: (width: number, depth: number, resX: number, resZ: number, dropHeight: number) => void;
  toggleSimulation: (running: boolean) => void;
  resetCloth: () => void;
  setGravity: (x: number, y: number, z: number) => void;
  setWindForce: (x: number, y: number, z: number) => void;
  setClothStiffness: (value: number) => void;
  setClothDamping: (value: number) => void;
  setClothFriction: (value: number) => void;
  selectCloth: () => void;
  convertMeshToCloth: (meshIndex: number, pinMode: number) => void;
  getLoadedMeshCount: () => number;
  getLoadedMeshName: (index: number) => string;
  setMeshPosition: (index: number, x: number, y: number, z: number) => void;
  removeLoadedMesh: (index: number) => void;
  setMeshVisible: (index: number, visible: boolean) => void;
  selectMesh: (index: number) => void;
  deselectMesh: () => void;
  addCollisionSphere: (x: number, y: number, z: number, radius: number) => void;
  removeCollisionSphere: (index: number) => void;
  pickObject: (ndcX: number, ndcY: number) => number;
  selectSphere: (index: number) => void;
  deselectAll: () => void;
  setCollisionSpherePosition: (index: number, x: number, y: number, z: number) => void;
  translateCloth: (dx: number, dy: number, dz: number) => void;
}

export function useRendererBridge(module: WasmModule | null): RendererBridge {
  const [transform, setTransform] = useState<Transform>({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });

  const [material, setMaterial] = useState<Material>({
    baseColor: [0.8, 0.8, 0.8],
    metallic: 0.0,
    roughness: 0.5,
  });

  const [meshInfo, setMeshInfo] = useState<MeshInfo>({
    vertices: 0,
    faces: 0,
    triangles: 0,
  });

  const [layers, setLayers] = useState<Layer[]>([]);
  const [loadedMeshes, setLoadedMeshes] = useState<LoadedMesh[]>([]);
  const [selectedMeshIndex, setSelectedMeshIndex] = useState(-1);

  const [simulation, setSimulation] = useState<SimulationState>({
    running: false,
    gravity: [0, -9.81, 0],
    wind: [0, 0, 0],
    stiffness: 0.9,
    damping: 0.01,
    friction: 0.5,
    clothAdded: false,
    collisionSpheres: [],
    selectedObjectType: 'none',
    selectedObjectIndex: -1,
  });

  const moduleRef = useRef(module);
  moduleRef.current = module;

  const setPosition = useCallback((x: number, y: number, z: number) => {
    setTransform((prev) => ({ ...prev, position: [x, y, z] }));
    moduleRef.current?.setPosition(x, y, z);
  }, []);

  const setRotation = useCallback((x: number, y: number, z: number) => {
    setTransform((prev) => ({ ...prev, rotation: [x, y, z] }));
    moduleRef.current?.setRotation(x, y, z);
  }, []);

  const setScale = useCallback((x: number, y: number, z: number) => {
    setTransform((prev) => ({ ...prev, scale: [x, y, z] }));
    moduleRef.current?.setScale(x, y, z);
  }, []);

  const setBaseColor = useCallback((r: number, g: number, b: number) => {
    setMaterial((prev) => ({ ...prev, baseColor: [r, g, b] }));
    moduleRef.current?.setBaseColor(r, g, b);
  }, []);

  const setMetallic = useCallback((value: number) => {
    setMaterial((prev) => ({ ...prev, metallic: value }));
    moduleRef.current?.setMetallic(value);
  }, []);

  const setRoughness = useCallback((value: number) => {
    setMaterial((prev) => ({ ...prev, roughness: value }));
    moduleRef.current?.setRoughness(value);
  }, []);

  const setLayerVisible = useCallback((name: string, visible: boolean) => {
    setLayers((prev) =>
      prev.map((l) => (l.name === name ? { ...l, visible } : l))
    );
    moduleRef.current?.setLayerVisible(name, visible);
  }, []);

  const refreshMeshInfo = useCallback(() => {
    if (!moduleRef.current) return;
    setMeshInfo({
      vertices: moduleRef.current.getVertexCount(),
      faces: moduleRef.current.getFaceCount(),
      triangles: moduleRef.current.getTriangleCount(),
    });
  }, []);

  const loadModel = useCallback(
    (data: ArrayBuffer, extension: string): boolean => {
      if (!moduleRef.current) return false;
      const uint8 = new Uint8Array(data);
      const success = moduleRef.current.loadModel(uint8, uint8.length, extension);
      if (success) {
        refreshMeshInfo();
        setTransform({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
        setMaterial({ baseColor: [0.8, 0.8, 0.8], metallic: 0.0, roughness: 0.5 });
        setLayers([]);
        // Populate loaded meshes list
        const count = moduleRef.current.getLoadedMeshCount();
        const meshes: LoadedMesh[] = [];
        for (let i = 0; i < count; i++) {
          meshes.push({
            name: moduleRef.current.getLoadedMeshName(i) || `mesh_${i}`,
            x: 0, y: 0, z: 0, visible: true,
          });
        }
        setLoadedMeshes(meshes);
        setSelectedMeshIndex(-1);
      }
      return success;
    },
    [refreshMeshInfo]
  );

  const addClothMesh = useCallback(
    (width: number, height: number, resX: number, resY: number) => {
      moduleRef.current?.addClothMesh(width, height, resX, resY);
      setSimulation((prev) => ({ ...prev, clothAdded: true, running: false }));
    },
    []
  );

  const addClothMeshHorizontal = useCallback(
    (width: number, depth: number, resX: number, resZ: number, dropHeight: number) => {
      moduleRef.current?.addClothMeshHorizontal(width, depth, resX, resZ, dropHeight);
      setSimulation((prev) => ({ ...prev, clothAdded: true, running: false }));
    },
    []
  );

  const toggleSimulation = useCallback((running: boolean) => {
    moduleRef.current?.toggleSimulation(running);
    setSimulation((prev) => ({ ...prev, running }));
  }, []);

  const resetCloth = useCallback(() => {
    moduleRef.current?.resetCloth();
    setSimulation((prev) => ({ ...prev, running: false }));
  }, []);

  const setGravity = useCallback((x: number, y: number, z: number) => {
    setSimulation((prev) => ({ ...prev, gravity: [x, y, z] }));
    moduleRef.current?.setGravity(x, y, z);
  }, []);

  const setWindForce = useCallback((x: number, y: number, z: number) => {
    setSimulation((prev) => ({ ...prev, wind: [x, y, z] }));
    moduleRef.current?.setWindForce(x, y, z);
  }, []);

  const setClothStiffness = useCallback((value: number) => {
    setSimulation((prev) => ({ ...prev, stiffness: value }));
    moduleRef.current?.setClothStiffness(value);
  }, []);

  const setClothDamping = useCallback((value: number) => {
    setSimulation((prev) => ({ ...prev, damping: value }));
    moduleRef.current?.setClothDamping(value);
  }, []);

  const setClothFriction = useCallback((value: number) => {
    setSimulation((prev) => ({ ...prev, friction: value }));
    moduleRef.current?.setClothFriction(value);
  }, []);

  const selectCloth = useCallback(() => {
    moduleRef.current?.setSelectedSphere(-1);
    setSimulation((prev) => ({
      ...prev,
      selectedObjectType: 'cloth',
      selectedObjectIndex: 0,
    }));
  }, []);

  const convertMeshToCloth = useCallback((meshIndex: number, pinMode: number) => {
    moduleRef.current?.convertMeshToCloth(meshIndex, pinMode);
    setSimulation((prev) => ({ ...prev, clothAdded: true, running: false }));
  }, []);

  const getLoadedMeshCount = useCallback((): number => {
    return moduleRef.current?.getLoadedMeshCount() ?? 0;
  }, []);

  const getLoadedMeshName = useCallback((index: number): string => {
    return moduleRef.current?.getLoadedMeshName(index) ?? '';
  }, []);

  const setMeshPositionBridge = useCallback(
    (index: number, x: number, y: number, z: number) => {
      moduleRef.current?.setMeshPosition(index, x, y, z);
      setLoadedMeshes((prev) => prev.map((m, i) => i === index ? { ...m, x, y, z } : m));
    }, []
  );

  const removeLoadedMeshBridge = useCallback((index: number) => {
    moduleRef.current?.removeLoadedMesh(index);
    setLoadedMeshes((prev) => prev.filter((_, i) => i !== index));
    setSelectedMeshIndex((prev) => prev === index ? -1 : prev > index ? prev - 1 : prev);
  }, []);

  const setMeshVisibleBridge = useCallback((index: number, visible: boolean) => {
    moduleRef.current?.setMeshVisible(index, visible);
    setLoadedMeshes((prev) => prev.map((m, i) => i === index ? { ...m, visible } : m));
  }, []);

  const selectMesh = useCallback((index: number) => {
    setSelectedMeshIndex(index);
  }, []);

  const deselectMesh = useCallback(() => {
    setSelectedMeshIndex(-1);
  }, []);

  const addCollisionSphere = useCallback(
    (x: number, y: number, z: number, radius: number) => {
      moduleRef.current?.addCollisionSphere(x, y, z, radius);
      setSimulation((prev) => ({
        ...prev,
        collisionSpheres: [...prev.collisionSpheres, { x, y, z, radius }],
      }));
    },
    []
  );

  const removeCollisionSphere = useCallback((index: number) => {
    moduleRef.current?.removeCollisionSphere(index);
    setSimulation((prev) => ({
      ...prev,
      collisionSpheres: prev.collisionSpheres.filter((_, i) => i !== index),
      // Deselect if removed sphere was selected
      selectedObjectType: prev.selectedObjectType === 'sphere' && prev.selectedObjectIndex === index ? 'none' : prev.selectedObjectType,
      selectedObjectIndex: prev.selectedObjectType === 'sphere' && prev.selectedObjectIndex === index ? -1
        : prev.selectedObjectType === 'sphere' && prev.selectedObjectIndex > index ? prev.selectedObjectIndex - 1
        : prev.selectedObjectIndex,
    }));
  }, []);

  const pickObject = useCallback((ndcX: number, ndcY: number): number => {
    if (!moduleRef.current) return -1;
    const index = moduleRef.current.pickObject(ndcX, ndcY);
    if (index >= 0) {
      // Sphere selected
      moduleRef.current.setSelectedSphere(index);
      setSimulation((prev) => ({
        ...prev,
        selectedObjectType: 'sphere',
        selectedObjectIndex: index,
      }));
    } else if (index === -2) {
      // Cloth selected
      moduleRef.current.setSelectedSphere(-1);
      setSimulation((prev) => ({
        ...prev,
        selectedObjectType: 'cloth',
        selectedObjectIndex: 0,
      }));
    } else {
      // Nothing
      moduleRef.current.setSelectedSphere(-1);
      setSimulation((prev) => ({
        ...prev,
        selectedObjectType: 'none',
        selectedObjectIndex: -1,
      }));
    }
    return index;
  }, []);

  const selectSphere = useCallback((index: number) => {
    moduleRef.current?.setSelectedSphere(index);
    setSimulation((prev) => ({
      ...prev,
      selectedObjectType: 'sphere',
      selectedObjectIndex: index,
    }));
  }, []);

  const deselectAll = useCallback(() => {
    moduleRef.current?.setSelectedSphere(-1);
    setSimulation((prev) => ({
      ...prev,
      selectedObjectType: 'none',
      selectedObjectIndex: -1,
    }));
  }, []);

  const setCollisionSpherePosition = useCallback(
    (index: number, x: number, y: number, z: number) => {
      moduleRef.current?.setCollisionSpherePosition(index, x, y, z);
      setSimulation((prev) => ({
        ...prev,
        collisionSpheres: prev.collisionSpheres.map((s, i) =>
          i === index ? { ...s, x, y, z } : s
        ),
      }));
    },
    []
  );

  const translateCloth = useCallback((dx: number, dy: number, dz: number) => {
    moduleRef.current?.translateCloth(dx, dy, dz);
  }, []);

  return {
    transform,
    material,
    meshInfo,
    layers,
    simulation,
    loadedMeshes,
    selectedMeshIndex,
    setPosition,
    setRotation,
    setScale,
    setBaseColor,
    setMetallic,
    setRoughness,
    setLayerVisible,
    loadModel,
    refreshMeshInfo,
    addClothMesh,
    addClothMeshHorizontal,
    toggleSimulation,
    resetCloth,
    setGravity,
    setWindForce,
    setClothStiffness,
    setClothDamping,
    setClothFriction,
    selectCloth,
    convertMeshToCloth,
    getLoadedMeshCount,
    getLoadedMeshName,
    setMeshPosition: setMeshPositionBridge,
    removeLoadedMesh: removeLoadedMeshBridge,
    setMeshVisible: setMeshVisibleBridge,
    selectMesh,
    deselectMesh,
    addCollisionSphere,
    removeCollisionSphere,
    pickObject,
    selectSphere,
    deselectAll,
    setCollisionSpherePosition,
    translateCloth,
  };
}
