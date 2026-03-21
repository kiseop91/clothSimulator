import type { Drill } from '../types/drill';

const KEY = 'hockey_drill_studio_drills';

export function saveDrill(drill: Drill): void {
  const drills = loadDrills();
  const idx = drills.findIndex(d => d.id === drill.id);
  if (idx >= 0) {
    drills[idx] = { ...drill, updatedAt: Date.now() };
  } else {
    drills.push(drill);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(drills));
  } catch {
    // storage full
  }
}

export function loadDrills(): Drill[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const drills: Drill[] = JSON.parse(raw);
    // Migrate older drills missing duration field
    for (const d of drills) {
      if (d.duration === undefined) d.duration = 5;
    }
    return drills;
  } catch {
    return [];
  }
}

export function deleteDrill(id: string): void {
  const drills = loadDrills().filter(d => d.id !== id);
  localStorage.setItem(KEY, JSON.stringify(drills));
}

// --- Practice Sessions ---
import type { PracticeSession } from '../types/drill';

const SESSION_KEY = 'hockey_drill_studio_sessions';

export function saveSession(session: PracticeSession): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = { ...session, updatedAt: Date.now() };
  } else {
    sessions.push(session);
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
  } catch {
    // storage full
  }
}

export function loadSessions(): PracticeSession[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PracticeSession[];
  } catch {
    return [];
  }
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter(s => s.id !== id);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
}

export function exportDrillJSON(drill: Drill): string {
  return JSON.stringify(drill, null, 2);
}

export function importDrillJSON(json: string): Drill {
  return JSON.parse(json) as Drill;
}
