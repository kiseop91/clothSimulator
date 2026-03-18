// ─── IndexedDB: model file storage ─────────────────────────────

const DB_NAME = 'clothsim_db';
const DB_VERSION = 1;
const STORE_NAME = 'models';

export interface SavedModel {
  id: string;
  name: string;
  extension: string;
  data: ArrayBuffer;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveModelToDB(
  id: string,
  name: string,
  extension: string,
  data: ArrayBuffer,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id,
      name,
      extension,
      data,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllModels(): Promise<SavedModel[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function deleteModelFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function clearAllModels(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ─── LocalStorage: scene state ─────────────────────────────────

const SCENE_KEY = 'clothsim_scene_state';

export interface SavedSceneState {
  collisionSpheres: Array<{ x: number; y: number; z: number; radius: number }>;
  clothSettings: {
    gravity: [number, number, number];
    wind: [number, number, number];
    stiffness: number;
    damping: number;
    friction: number;
  };
  meshTransforms: Array<{ name: string; x: number; y: number; z: number; visible: boolean }>;
  material: {
    baseColor: [number, number, number];
    metallic: number;
    roughness: number;
  };
}

export function saveSceneState(state: SavedSceneState): void {
  try {
    localStorage.setItem(SCENE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadSceneState(): SavedSceneState | null {
  try {
    const raw = localStorage.getItem(SCENE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSceneState(): void {
  localStorage.removeItem(SCENE_KEY);
}
