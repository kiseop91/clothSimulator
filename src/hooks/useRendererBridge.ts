import { useCallback, useRef } from 'react';
import type { WasmModule } from '../types/wasm.d.ts';
import type { DrillObject, DrillPath, DrillKeyframe } from '../types/drill';
import { PathStyle } from '../types/drill';

export interface RendererBridge {
  // Tokens
  syncTokens: (objects: DrillObject[]) => void;
  addToken: (obj: DrillObject) => number;
  updateTokenPosition: (idx: number, x: number, z: number) => void;
  removeToken: (idx: number) => void;
  clearTokens: () => void;

  // Paths
  syncPaths: (paths: DrillPath[]) => void;
  clearPaths: () => void;

  // Animation
  syncAnimation: (keyframes: DrillKeyframe[], objects: DrillObject[]) => void;
  setPlaybackTime: (t: number) => void;
  clearAnimation: () => void;

  // Camera
  setCameraPreset: (preset: number) => void;

  // Rink
  setRinkLayout: (layout: number) => void;

  // Screenshot
  exportScreenshot: () => string | null;

  // Canvas access for video export
  getCanvas: () => HTMLCanvasElement | null;
}

export function useRendererBridge(module: WasmModule | null): RendererBridge {
  const moduleRef = useRef(module);
  moduleRef.current = module;

  // Maps objectId → mesh index assigned by WASM
  const meshIndexMapRef = useRef<Map<string, number>>(new Map());

  const syncTokens = useCallback((objects: DrillObject[]) => {
    const m = moduleRef.current;
    if (!m) return;
    m.clearAllTokens();
    const newMap = new Map<string, number>();
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      m.addDrillToken(obj.type, obj.x, obj.z, obj.color[0], obj.color[1], obj.color[2]);
      newMap.set(obj.id, i);
    }
    meshIndexMapRef.current = newMap;
  }, []);

  const addToken = useCallback((obj: DrillObject): number => {
    const m = moduleRef.current;
    if (!m) return -1;
    return m.addDrillToken(obj.type, obj.x, obj.z, obj.color[0], obj.color[1], obj.color[2]);
  }, []);

  const updateTokenPosition = useCallback((idx: number, x: number, z: number) => {
    moduleRef.current?.setTokenPosition(idx, x, z);
  }, []);

  const removeToken = useCallback((idx: number) => {
    moduleRef.current?.removeToken(idx);
  }, []);

  const clearTokens = useCallback(() => {
    moduleRef.current?.clearAllTokens();
  }, []);

  const syncPaths = useCallback((paths: DrillPath[]) => {
    const m = moduleRef.current;
    if (!m || typeof m._malloc !== 'function') return;

    if (paths.length === 0) {
      m.clearDrillPaths();
      return;
    }

    // Build flat float array: [style, r,g,b, hasArrow, N, x1,z1, x2,z2, ...] per path
    const floats: number[] = [];
    for (const path of paths) {
      floats.push(path.style);
      floats.push(path.color[0], path.color[1], path.color[2]);
      floats.push(path.hasArrow ? 1 : 0);
      floats.push(path.waypoints.length);
      for (const wp of path.waypoints) {
        floats.push(wp.x, wp.z);
      }
    }

    // Allocate on WASM heap
    const byteSize = floats.length * 4;
    const ptr = m._malloc(byteSize);
    const f32 = new Float32Array(m.HEAPF32.buffer, ptr, floats.length);
    f32.set(floats);
    m.setDrillPaths(ptr, floats.length);
    m._free(ptr);
  }, []);

  const clearPaths = useCallback(() => {
    moduleRef.current?.clearDrillPaths();
  }, []);

  const syncAnimation = useCallback((keyframes: DrillKeyframe[], objects: DrillObject[]) => {
    const m = moduleRef.current;
    if (!m || typeof m._malloc !== 'function') return;

    if (keyframes.length === 0) {
      m.clearAnimation();
      return;
    }

    // Build objectId → mesh index map from current objects (fallback if syncTokens hasn't run)
    const map = meshIndexMapRef.current;

    // Build flat array: [meshIdx, numWP, x1,z1,t1, x2,z2,t2, ...] per keyframe
    const floats: number[] = [];
    for (const kf of keyframes) {
      const meshIdx = map.get(kf.objectId);
      if (meshIdx === undefined) continue; // skip keyframes for removed objects
      floats.push(meshIdx);
      floats.push(kf.waypoints.length);
      for (const wp of kf.waypoints) {
        floats.push(wp.x, wp.z, wp.t);
      }
    }

    if (floats.length === 0) {
      console.log('[Bridge] syncAnimation: no floats after processing, clearing');
      m.clearAnimation();
      return;
    }

    console.log('[Bridge] syncAnimation:', keyframes.length, 'keyframes,', floats.length, 'floats');
    console.log('[Bridge] floats:', floats.slice(0, 20));
    console.log('[Bridge] meshIndexMap:', Object.fromEntries(map.entries()));

    try {
      const byteSize = floats.length * 4;
      const ptr = m._malloc(byteSize);
      const f32 = new Float32Array(m.HEAPF32.buffer, ptr, floats.length);
      f32.set(floats);
      m.setAnimationData(ptr, floats.length);
      m._free(ptr);
    } catch (e) {
      console.warn('syncAnimation WASM error:', e);
    }
  }, []);

  const setPlaybackTime = useCallback((t: number) => {
    moduleRef.current?.setPlaybackTime(t);
  }, []);

  const clearAnimation = useCallback(() => {
    moduleRef.current?.clearAnimation();
  }, []);

  const setCameraPreset = useCallback((preset: number) => {
    moduleRef.current?.setCameraPreset(preset);
  }, []);

  const setRinkLayout = useCallback((layout: number) => {
    moduleRef.current?.setRinkLayout(layout);
  }, []);

  const exportScreenshot = useCallback((): string | null => {
    return moduleRef.current?.exportScreenshot() ?? null;
  }, []);

  const getCanvas = useCallback((): HTMLCanvasElement | null => {
    return document.getElementById('wasm-canvas') as HTMLCanvasElement | null;
  }, []);

  return {
    syncTokens,
    addToken,
    updateTokenPosition,
    removeToken,
    clearTokens,
    syncPaths,
    clearPaths,
    syncAnimation,
    setPlaybackTime,
    clearAnimation,
    setCameraPreset,
    setRinkLayout,
    exportScreenshot,
    getCanvas,
  };
}
