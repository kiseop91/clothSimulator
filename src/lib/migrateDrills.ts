import type { DrillStore } from './drillStorage';
import { loadDrills as localLoadDrills, loadSessions as localLoadSessions } from './storage';

const MIGRATION_KEY = 'hockey_drill_studio_migrated';

export async function migrateLocalToCloud(store: DrillStore): Promise<{ drills: number; sessions: number }> {
  if (localStorage.getItem(MIGRATION_KEY)) {
    return { drills: 0, sessions: 0 };
  }

  const localDrills = localLoadDrills();
  const localSessions = localLoadSessions();

  let drillCount = 0;
  let sessionCount = 0;

  for (const drill of localDrills) {
    try {
      await store.saveDrill(drill);
      drillCount++;
    } catch (e) {
      console.error('Migration: failed to save drill', drill.id, e);
    }
  }

  for (const session of localSessions) {
    try {
      await store.saveSession(session);
      sessionCount++;
    } catch (e) {
      console.error('Migration: failed to save session', session.id, e);
    }
  }

  if (drillCount > 0 || sessionCount > 0) {
    localStorage.setItem(MIGRATION_KEY, Date.now().toString());
  }

  return { drills: drillCount, sessions: sessionCount };
}
