import type { Drill, PracticeSession } from '../types/drill';
import { supabase } from './supabase';
import {
  saveDrill as localSaveDrill,
  loadDrills as localLoadDrills,
  deleteDrill as localDeleteDrill,
  saveSession as localSaveSession,
  loadSessions as localLoadSessions,
  deleteSession as localDeleteSession,
} from './storage';

export interface DrillStore {
  saveDrill(drill: Drill): Promise<void>;
  loadDrills(): Promise<Drill[]>;
  loadDrill(id: string): Promise<Drill | null>;
  deleteDrill(id: string): Promise<void>;
  saveSession(session: PracticeSession): Promise<void>;
  loadSessions(): Promise<PracticeSession[]>;
  deleteSession(id: string): Promise<void>;
}

// --- Local (localStorage) implementation ---

export class LocalDrillStore implements DrillStore {
  async saveDrill(drill: Drill): Promise<void> {
    localSaveDrill(drill);
  }
  async loadDrills(): Promise<Drill[]> {
    return localLoadDrills();
  }
  async loadDrill(id: string): Promise<Drill | null> {
    const drills = localLoadDrills();
    return drills.find(d => d.id === id) ?? null;
  }
  async deleteDrill(id: string): Promise<void> {
    localDeleteDrill(id);
  }
  async saveSession(session: PracticeSession): Promise<void> {
    localSaveSession(session);
  }
  async loadSessions(): Promise<PracticeSession[]> {
    return localLoadSessions();
  }
  async deleteSession(id: string): Promise<void> {
    localDeleteSession(id);
  }
}

// --- Supabase implementation ---

export class SupabaseDrillStore implements DrillStore {
  constructor(private userId: string) {}

  async saveDrill(drill: Drill): Promise<void> {
    const { error } = await supabase
      .from('drills')
      .upsert({
        id: drill.id,
        user_id: this.userId,
        name: drill.name,
        description: drill.description,
        data: drill,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (error) console.error('saveDrill error:', error);
  }

  async loadDrills(): Promise<Drill[]> {
    const { data, error } = await supabase
      .from('drills')
      .select('data')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('loadDrills error:', error);
      return [];
    }
    return (data ?? []).map(row => row.data as Drill);
  }

  async loadDrill(id: string): Promise<Drill | null> {
    const { data, error } = await supabase
      .from('drills')
      .select('data')
      .eq('id', id)
      .eq('user_id', this.userId)
      .single();
    if (error || !data) return null;
    return data.data as Drill;
  }

  async deleteDrill(id: string): Promise<void> {
    const { error } = await supabase
      .from('drills')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);
    if (error) console.error('deleteDrill error:', error);
  }

  async saveSession(session: PracticeSession): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .upsert({
        id: session.id,
        user_id: this.userId,
        name: session.name,
        data: session,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (error) console.error('saveSession error:', error);
  }

  async loadSessions(): Promise<PracticeSession[]> {
    const { data, error } = await supabase
      .from('sessions')
      .select('data')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('loadSessions error:', error);
      return [];
    }
    return (data ?? []).map(row => row.data as PracticeSession);
  }

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);
    if (error) console.error('deleteSession error:', error);
  }
}
