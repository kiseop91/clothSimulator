import type { Drill } from '../types/drill';

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
