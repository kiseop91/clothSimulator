// Drill data model

export enum TokenType {
  PLAYER = 0,
  PUCK = 1,
  CONE = 2,
  COACH = 3,
}

export enum PathStyle {
  SOLID = 0,
  DASHED = 1,
  ZIGZAG = 2,
  DOTTED = 3,
  BACKWARD = 4,
}

export enum RinkLayout {
  FULL_RINK = 0,
  HALF_RINK = 1,
  NEUTRAL_ZONE = 2,
  END_ZONE = 3,
}

export enum CameraPreset {
  TOP_DOWN = 0,
  BROADCAST = 1,
  END_ZONE = 2,
  FREE = 3,
}

export enum ToolMode {
  SELECT = 'select',
  PLAYER = 'player',
  PUCK = 'puck',
  CONE = 'cone',
  COACH = 'coach',
  PATH_SKATE = 'path_skate',
  PATH_PASS = 'path_pass',
  PATH_SHOOT = 'path_shoot',
  PATH_CARRY = 'path_carry',
  PATH_BACKWARD = 'path_backward',
  ERASE = 'erase',
}

export interface DrillObject {
  id: string;
  type: TokenType;
  x: number; // rink X coordinate (feet)
  z: number; // rink Z coordinate (feet)
  color: [number, number, number]; // RGB 0..1
  label?: string;
  meshIndex?: number; // WASM mesh index
}

export interface DrillPath {
  id: string;
  style: PathStyle;
  color: [number, number, number];
  hasArrow: boolean;
  waypoints: Array<{ x: number; z: number }>;
  smooth?: boolean;  // true → Catmull-Rom curve, false/undefined → linear
}

export interface DrillKeyframe {
  objectId: string;
  waypoints: Array<{ x: number; z: number; t: number }>; // t: 0..1
  smooth?: boolean;  // true → Catmull-Rom curve, false/undefined → linear
}

export interface Drill {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  rinkLayout: RinkLayout;
  objects: DrillObject[];
  paths: DrillPath[];
  keyframes: DrillKeyframe[];
  duration: number; // seconds
  source?: 'preset' | 'ai' | 'user';
}

export function createEmptyDrill(name: string = 'Untitled Drill'): Drill {
  return {
    id: `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rinkLayout: RinkLayout.FULL_RINK,
    objects: [],
    paths: [],
    keyframes: [],
    duration: 5,
  };
}

// --- Practice Session types ---

export enum BlockCategory {
  WARMUP = 'warmup',
  SKATING = 'skating',
  SKILLS = 'skills',
  TACTICAL = 'tactical',
  SCRIMMAGE = 'scrimmage',
  CONDITIONING = 'conditioning',
  COOLDOWN = 'cooldown',
  TRANSITION = 'transition',
}

export const BLOCK_CATEGORY_META: Record<BlockCategory, { label: string; color: string }> = {
  [BlockCategory.WARMUP]:       { label: 'Warmup',       color: '#f59e0b' },
  [BlockCategory.SKATING]:      { label: 'Skating',      color: '#3b82f6' },
  [BlockCategory.SKILLS]:       { label: 'Skills',       color: '#10b981' },
  [BlockCategory.TACTICAL]:     { label: 'Tactical',     color: '#8b5cf6' },
  [BlockCategory.SCRIMMAGE]:    { label: 'Scrimmage',    color: '#ef4444' },
  [BlockCategory.CONDITIONING]: { label: 'Conditioning', color: '#f97316' },
  [BlockCategory.COOLDOWN]:     { label: 'Cooldown',     color: '#06b6d4' },
  [BlockCategory.TRANSITION]:   { label: 'Transition',   color: '#6b7280' },
};

export interface SessionBlock {
  id: string;
  name: string;
  category: BlockCategory;
  durationMinutes: number;
  drillId: string | null;
  notes: string;
}

export interface PracticeSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  targetDurationMinutes: number;
  blocks: SessionBlock[];
}

// Default team colors
export const TEAM_COLORS = {
  red: [0.8, 0.15, 0.15] as [number, number, number],
  blue: [0.15, 0.3, 0.8] as [number, number, number],
  black: [0.2, 0.2, 0.2] as [number, number, number],
  green: [0.1, 0.6, 0.2] as [number, number, number],
  yellow: [0.9, 0.8, 0.1] as [number, number, number],
  white: [0.9, 0.9, 0.9] as [number, number, number],
};
