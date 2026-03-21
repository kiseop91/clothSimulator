import type { Drill, DrillKeyframe, DrillPath } from '../types/drill';

export interface AnimationResult {
  keyframes: DrillKeyframe[];
  paths: DrillPath[];
  duration: number;
  warnings: string[];
}

export function mergeAnimationResult(
  drill: Drill,
  result: AnimationResult
): Drill {
  const newDuration = result.duration;
  const oldDuration = drill.duration;

  // Remap existing keyframes that are NOT being replaced
  const replacedObjectIds = new Set(result.keyframes.map(kf => kf.objectId));

  const remappedExisting: DrillKeyframe[] = drill.keyframes
    .filter(kf => !replacedObjectIds.has(kf.objectId))
    .map(kf => ({
      ...kf,
      waypoints: kf.waypoints.map(wp => ({
        ...wp,
        t: Math.min(1, wp.t * (oldDuration / newDuration)),
      })),
    }));

  // Merge: existing (remapped) + new from AI
  const keyframes = [...remappedExisting, ...result.keyframes];

  // Paths: replace entirely with AI-generated paths
  const paths = result.paths;

  return {
    ...drill,
    keyframes,
    paths,
    duration: newDuration,
    updatedAt: Date.now(),
  };
}
