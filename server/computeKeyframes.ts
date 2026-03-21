interface ObjectInfo {
  id: string;
  type: number;
  x: number;
  z: number;
  label?: string;
}

interface MoveAction {
  type: 'skate' | 'pass' | 'shoot' | 'backward';
  to?: [number, number];
  targetId?: string;
  speed?: 'fast' | 'normal' | 'slow';
  group: number;
}

interface Move {
  objectId: string;
  actions: MoveAction[];
}

interface ExistingKeyframe {
  objectId: string;
  waypoints: Array<{ x: number; z: number; t: number }>;
  smooth?: boolean;
}

interface ComputedKeyframe {
  objectId: string;
  waypoints: Array<{ x: number; z: number; t: number }>;
  smooth?: boolean;
}

interface ComputedPath {
  id: string;
  style: number; // 0=SOLID, 1=DASHED, 2=ZIGZAG, 3=DOTTED, 4=BACKWARD
  color: [number, number, number];
  hasArrow: boolean;
  waypoints: Array<{ x: number; z: number }>;
  smooth?: boolean;
}

export interface ComputeResult {
  keyframes: ComputedKeyframe[];
  paths: ComputedPath[];
  duration: number;
}

const SPEED: Record<string, number> = {
  fast: 40,
  normal: 25,
  slow: 15,
  backward: 17,
  pass: 100,
  shoot: 130,
};

const PATH_STYLE: Record<string, number> = {
  skate: 0,    // SOLID
  pass: 1,     // DASHED
  shoot: 2,    // ZIGZAG
  backward: 4, // BACKWARD
};

function distance(x1: number, z1: number, x2: number, z2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeKeyframes(
  moves: Move[],
  objects: ObjectInfo[],
  existingKeyframes: ExistingKeyframe[],
  existingDuration: number
): ComputeResult {
  const objectMap = new Map(objects.map(o => [o.id, o]));

  // Collect all groups and their actions
  const groupActions: Map<number, Array<{ objectId: string; action: MoveAction; fromX: number; fromZ: number; toX: number; toZ: number }>> = new Map();

  // Track current position per object (starts from board position)
  const currentPos: Map<string, { x: number; z: number }> = new Map();
  for (const obj of objects) {
    currentPos.set(obj.id, { x: obj.x, z: obj.z });
  }

  // Flatten moves into group-indexed actions
  for (const move of moves) {
    const obj = objectMap.get(move.objectId);
    if (!obj) continue;

    for (const action of move.actions) {
      const group = action.group || 1;
      if (!groupActions.has(group)) groupActions.set(group, []);

      let fromPos = currentPos.get(move.objectId) || { x: obj.x, z: obj.z };
      let toX: number, toZ: number;

      if (action.type === 'pass' || action.type === 'shoot') {
        // Target is another object's position
        const target = action.targetId ? objectMap.get(action.targetId) : null;
        if (target) {
          const targetPos = currentPos.get(action.targetId!) || { x: target.x, z: target.z };
          toX = targetPos.x;
          toZ = targetPos.z;
        } else {
          continue; // skip invalid target
        }
      } else if (action.to) {
        toX = clamp(action.to[0], -100, 100);
        toZ = clamp(action.to[1], -42.5, 42.5);
      } else {
        continue; // no destination
      }

      groupActions.get(group)!.push({
        objectId: move.objectId,
        action,
        fromX: fromPos.x,
        fromZ: fromPos.z,
        toX,
        toZ,
      });

      // Update current position for sequential actions
      if (action.type === 'skate' || action.type === 'backward') {
        currentPos.set(move.objectId, { x: toX, z: toZ });
      }
    }
  }

  // Sort groups
  const sortedGroups = Array.from(groupActions.keys()).sort((a, b) => a - b);

  // Compute timing per group
  const groupTimings: Array<{ group: number; startTime: number; duration: number }> = [];
  let cumulativeTime = 0;

  for (const group of sortedGroups) {
    const actions = groupActions.get(group)!;
    let maxDuration = 0;

    for (const act of actions) {
      const dist = distance(act.fromX, act.fromZ, act.toX, act.toZ);
      let speed: number;

      if (act.action.type === 'pass') {
        speed = SPEED.pass;
      } else if (act.action.type === 'shoot') {
        speed = SPEED.shoot;
      } else if (act.action.type === 'backward') {
        speed = SPEED.backward;
      } else {
        speed = SPEED[act.action.speed || 'normal'] || SPEED.normal;
      }

      const time = dist / speed;
      maxDuration = Math.max(maxDuration, time);
    }

    // Minimum group duration
    maxDuration = Math.max(maxDuration, 0.3);

    groupTimings.push({ group, startTime: cumulativeTime, duration: maxDuration });
    cumulativeTime += maxDuration;
  }

  // Total duration (ceil to integer, minimum 2s)
  const totalDuration = Math.max(2, Math.ceil(cumulativeTime));

  // Build keyframes per object
  const keyframeMap: Map<string, Array<{ x: number; z: number; t: number }>> = new Map();
  const paths: ComputedPath[] = [];

  // Initialize with starting positions at t=0
  const involvedObjects = new Set<string>();
  for (const [, actions] of groupActions) {
    for (const act of actions) {
      involvedObjects.add(act.objectId);
    }
  }

  for (const objId of involvedObjects) {
    const obj = objectMap.get(objId);
    if (!obj) continue;
    keyframeMap.set(objId, [{ x: obj.x, z: obj.z, t: 0 }]);
  }

  // Process each group
  for (const timing of groupTimings) {
    const actions = groupActions.get(timing.group)!;

    for (const act of actions) {
      const waypoints = keyframeMap.get(act.objectId);
      if (!waypoints) continue;

      const startT = timing.startTime / totalDuration;
      const endT = (timing.startTime + timing.duration) / totalDuration;

      // Add endpoint
      waypoints.push({ x: act.toX, z: act.toZ, t: clamp(endT, 0, 1) });

      // Generate path
      const pathStyle = PATH_STYLE[act.action.type] ?? 0;
      const isSkateType = act.action.type === 'skate' || act.action.type === 'backward';
      const obj = objectMap.get(act.objectId);
      const pathColor: [number, number, number] = act.action.type === 'pass' || act.action.type === 'shoot'
        ? [0.9, 0.8, 0.1] // yellow for pass/shoot
        : (obj?.type === 1 ? [0.2, 0.2, 0.2] : [0.5, 0.5, 0.5]); // default

      paths.push({
        id: `anim_path_${act.objectId}_g${timing.group}_${Math.random().toString(36).slice(2, 6)}`,
        style: pathStyle,
        color: pathColor,
        hasArrow: true,
        waypoints: [
          { x: act.fromX, z: act.fromZ },
          { x: act.toX, z: act.toZ },
        ],
        smooth: isSkateType,
      });
    }
  }

  // Convert keyframe map to array, ensure sorted and t=0 start, t<=1 end
  const keyframes: ComputedKeyframe[] = [];
  for (const [objectId, waypoints] of keyframeMap) {
    // Sort by t
    waypoints.sort((a, b) => a.t - b.t);

    // Ensure starts at t=0
    if (waypoints.length > 0 && waypoints[0].t > 0.001) {
      const obj = objectMap.get(objectId);
      if (obj) {
        waypoints.unshift({ x: obj.x, z: obj.z, t: 0 });
      }
    }

    // Ensure ends at t=1 (hold position)
    if (waypoints.length > 0 && waypoints[waypoints.length - 1].t < 0.999) {
      const last = waypoints[waypoints.length - 1];
      waypoints.push({ x: last.x, z: last.z, t: 1 });
    }

    // Deduplicate very close t values
    const deduped: Array<{ x: number; z: number; t: number }> = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i++) {
      if (Math.abs(waypoints[i].t - deduped[deduped.length - 1].t) > 0.005) {
        deduped.push(waypoints[i]);
      }
    }

    keyframes.push({
      objectId,
      waypoints: deduped,
      smooth: true,
    });
  }

  return { keyframes, paths, duration: totalDuration };
}
