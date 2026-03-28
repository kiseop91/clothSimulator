/**
 * Animation Serializer — converts Drill state to lightweight JSON v1 format
 * for the standalone SVG player at /share/:uuid.
 *
 * Input:  Drill (from src/types/drill.ts)
 * Output: DrillSharePayload (JSON v1)
 *
 * Data flow:
 *   DrillEditor (React) → serialize(drill) → POST /api/drill-shares → DB
 *   GET /api/drill-shares/:uuid → drill_json → SVG Player (Vanilla JS)
 */

import type { Drill, DrillObject, DrillPath, DrillKeyframe, TokenType, PathStyle } from '../types/drill';

// --- Serialized format (v1) ---

export interface ShareToken {
  id: string;
  type: number; // TokenType enum value
  label: string;
  color: [number, number, number];
  x: number; // initial rink X (feet)
  y: number; // initial rink Z mapped to Y
  keyframes: Array<{ t: number; x: number; y: number }>; // t in ms
}

export interface SharePath {
  id: string;
  style: number; // PathStyle enum value
  color: [number, number, number];
  hasArrow: boolean;
  points: Array<{ x: number; y: number }>;
}

export interface DrillSharePayload {
  version: 1;
  rink: { width: number; height: number };
  duration_ms: number;
  title: string;
  tokens: ShareToken[];
  paths: SharePath[];
}

const MAX_PAYLOAD_BYTES = 500 * 1024; // 500KB

/**
 * Serialize a Drill into the lightweight v1 format for the SVG player.
 * Returns null if the payload exceeds 500KB.
 */
export function serializeDrill(drill: Drill): { payload: DrillSharePayload; sizeBytes: number } | { error: string } {
  const tokens: ShareToken[] = drill.objects.map((obj: DrillObject) => {
    // Find keyframes for this object
    const kf = drill.keyframes.find((k: DrillKeyframe) => k.objectId === obj.id);
    const keyframes: Array<{ t: number; x: number; y: number }> = kf
      ? kf.waypoints.map(wp => ({
          t: Math.round(wp.t * drill.duration * 1000), // t: 0..1 → ms
          x: clampRinkX(wp.x),
          y: clampRinkY(wp.z),
        }))
      : [];

    return {
      id: obj.id,
      type: obj.type as number,
      label: obj.label || '',
      color: obj.color,
      x: clampRinkX(obj.x),
      y: clampRinkY(obj.z),
      keyframes,
    };
  });

  const paths: SharePath[] = drill.paths.map((path: DrillPath) => ({
    id: path.id,
    style: path.style as number,
    color: path.color,
    hasArrow: path.hasArrow,
    points: path.waypoints.map(wp => ({
      x: clampRinkX(wp.x),
      y: clampRinkY(wp.z),
    })),
  }));

  const payload: DrillSharePayload = {
    version: 1,
    rink: { width: 200, height: 85 },
    title: drill.name,
    duration_ms: drill.duration * 1000,
    tokens,
    paths,
  };

  const json = JSON.stringify(payload);
  const sizeBytes = new TextEncoder().encode(json).length;

  if (sizeBytes > MAX_PAYLOAD_BYTES) {
    return { error: `드릴 데이터가 너무 큽니다 (${Math.round(sizeBytes / 1024)}KB / 최대 500KB)` };
  }

  return { payload, sizeBytes };
}

// NHL rink: 200ft x 85ft
function clampRinkX(x: number): number {
  return Math.max(0, Math.min(200, x));
}

function clampRinkY(z: number): number {
  return Math.max(0, Math.min(85, z));
}
