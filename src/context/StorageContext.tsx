import { createContext, useContext, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { LocalDrillStore, SupabaseDrillStore, type DrillStore } from '../lib/drillStorage';
import { migrateLocalToCloud } from '../lib/migrateDrills';

const StorageContext = createContext<DrillStore | null>(null);

export function StorageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const migrated = useRef(false);

  const store = useMemo<DrillStore>(() => {
    if (user) return new SupabaseDrillStore(user.id);
    return new LocalDrillStore();
  }, [user]);

  useEffect(() => {
    if (user && !migrated.current) {
      migrated.current = true;
      migrateLocalToCloud(store).then(({ drills, sessions }) => {
        if (drills > 0 || sessions > 0) {
          console.log(`Migrated ${drills} drills and ${sessions} sessions to cloud`);
        }
      });
    }
  }, [user, store]);

  return (
    <StorageContext.Provider value={store}>
      {children}
    </StorageContext.Provider>
  );
}

export function useDrillStore(): DrillStore {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error('useDrillStore must be used within StorageProvider');
  return ctx;
}
