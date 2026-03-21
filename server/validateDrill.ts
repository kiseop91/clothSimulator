interface DrillObject {
  id: string;
  type: number;
  x: number;
  z: number;
  color: [number, number, number];
  label?: string;
}

interface DrillPath {
  id: string;
  style: number;
  color: [number, number, number];
  hasArrow: boolean;
  waypoints: Array<{ x: number; z: number }>;
}

interface DrillKeyframe {
  objectId: string;
  waypoints: Array<{ x: number; z: number; t: number }>;
}

interface Drill {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  rinkLayout: number;
  duration: number;
  objects: DrillObject[];
  paths: DrillPath[];
  keyframes: DrillKeyframe[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function validateAndSanitize(raw: string): Drill {
  // Strip markdown code fences
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try to extract JSON object if there's extra text
  if (!cleaned.startsWith('{')) {
    const start = cleaned.indexOf('{');
    if (start === -1) throw new Error('No JSON object found in response');
    cleaned = cleaned.slice(start);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Try to find the last closing brace
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > 0) {
      try {
        parsed = JSON.parse(cleaned.slice(0, lastBrace + 1));
      } catch {
        throw new Error('Failed to parse JSON from LLM response');
      }
    } else {
      throw new Error('Failed to parse JSON from LLM response');
    }
  }

  // Validate required fields
  if (!parsed.name || typeof parsed.name !== 'string') {
    parsed.name = 'AI Generated Drill';
  }
  if (!Array.isArray(parsed.objects)) {
    throw new Error('Missing or invalid "objects" array');
  }
  if (!Array.isArray(parsed.paths)) {
    parsed.paths = [];
  }
  if (!Array.isArray(parsed.keyframes)) {
    parsed.keyframes = [];
  }

  // Fresh ID
  parsed.id = `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  parsed.createdAt = Date.now();
  parsed.updatedAt = Date.now();

  // Defaults
  if (typeof parsed.rinkLayout !== 'number' || parsed.rinkLayout < 0 || parsed.rinkLayout > 3) {
    parsed.rinkLayout = 0;
  }
  if (typeof parsed.duration !== 'number' || parsed.duration <= 0) {
    parsed.duration = 5;
  }
  if (!parsed.description) {
    parsed.description = '';
  }

  // Clamp object coordinates
  for (const obj of parsed.objects) {
    if (!obj.id) obj.id = `obj_${Math.random().toString(36).slice(2, 8)}`;
    obj.x = clamp(Number(obj.x) || 0, -100, 100);
    obj.z = clamp(Number(obj.z) || 0, -42.5, 42.5);
    if (!Array.isArray(obj.color) || obj.color.length < 3) {
      obj.color = [0.5, 0.5, 0.5];
    }
    obj.type = clamp(Math.floor(Number(obj.type) || 0), 0, 3);
  }

  // Clamp path waypoints
  for (const path of parsed.paths) {
    if (!path.id) path.id = `path_${Math.random().toString(36).slice(2, 8)}`;
    path.style = clamp(Math.floor(Number(path.style) || 0), 0, 4);
    if (!Array.isArray(path.color) || path.color.length < 3) {
      path.color = [0.5, 0.5, 0.5];
    }
    if (typeof path.hasArrow !== 'boolean') path.hasArrow = true;
    if (Array.isArray(path.waypoints)) {
      for (const wp of path.waypoints) {
        wp.x = clamp(Number(wp.x) || 0, -100, 100);
        wp.z = clamp(Number(wp.z) || 0, -42.5, 42.5);
      }
    } else {
      path.waypoints = [];
    }
  }

  // Clamp keyframe waypoints
  for (const kf of parsed.keyframes) {
    if (Array.isArray(kf.waypoints)) {
      for (const wp of kf.waypoints) {
        wp.x = clamp(Number(wp.x) || 0, -100, 100);
        wp.z = clamp(Number(wp.z) || 0, -42.5, 42.5);
        wp.t = clamp(Number(wp.t) || 0, 0, 1);
      }
    } else {
      kf.waypoints = [];
    }
  }

  return parsed as Drill;
}
