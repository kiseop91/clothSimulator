import type { Drill, DrillObject, DrillKeyframe, DrillPath } from '../types/drill';
import { supabase } from './supabase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function generateDrill(prompt: string): Promise<Drill> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/generate-drill', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    if (res.status === 403 && body.upgrade) {
      throw new Error('일일 AI 사용 한도 초과. Pro로 업그레이드하세요.');
    }
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
  const headers = await getAuthHeaders();
  const res = await fetch('/api/generate-animation', {
    method: 'POST',
    headers,
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
    if (res.status === 403 && body.upgrade) {
      throw new Error('일일 AI 사용 한도 초과. Pro로 업그레이드하세요.');
    }
    throw new Error(body.error || `Server error: ${res.status}`);
  }

  return await res.json() as AnimationResult;
}
