import type { Drill, DrillObject, DrillKeyframe, DrillPath } from '../types/drill';

export async function generateDrill(prompt: string): Promise<Drill> {
  const res = await fetch('/api/generate-drill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error || `Server error: ${res.status}`);
  }

  const { drill } = await res.json();
  return drill as Drill;
}

export interface AnimationResult {
  keyframes: DrillKeyframe[];
  paths: DrillPath[];
  duration: number;
  warnings: string[];
}

export async function generateAnimation(
  prompt: string,
  objects: DrillObject[],
  selectedObjectIds: string[],
  existingKeyframes: DrillKeyframe[],
  duration: number
): Promise<AnimationResult> {
  const res = await fetch('/api/generate-animation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      objects: objects.map(o => ({ id: o.id, type: o.type, label: o.label, x: o.x, z: o.z })),
      selectedObjectIds,
      existingKeyframes,
      duration,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error || `Server error: ${res.status}`);
  }

  return await res.json() as AnimationResult;
}
