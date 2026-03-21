import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Download, Upload, FileText, BookOpen, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { Drill } from '../types/drill';
import { createEmptyDrill } from '../types/drill';
import { loadDrills, saveDrill, deleteDrill, exportDrillJSON, importDrillJSON } from '../lib/storage';

interface DrillLibraryProps {
  currentDrillId: string;
  onSelect: (drill: Drill) => void;
  onNew: (drill: Drill) => void;
}

const PRESET_DRILLS = [
  { file: 'drill.json', name: '코너→코치 패스→순회→슛' },
  { file: 'drill-weave.json', name: '3인 크로스 위브 러시' },
  { file: 'drill-powerplay.json', name: '파워플레이 엄브렐라' },
  { file: 'drill-2on1.json', name: '2대1 러시' },
  { file: 'drill-breakout.json', name: '디펜스맨 브레이크아웃' },
  { file: 'drill-cycling.json', name: '오펜시브 존 사이클링' },
  { file: 'drill-neutral-regroup.json', name: '뉴트럴 존 리그룹' },
  { file: 'drill-shootout.json', name: '슛아웃 1v0' },
  { file: 'drill-pk-box.json', name: '페널티킬 박스' },
  { file: 'drill-one-timer.json', name: '크로스아이스 원타이머' },
  { file: 'drill-3on2.json', name: '3대2 러시' },
  { file: 'drill-dump-chase.json', name: '덤프 앤 체이스' },
];

const PRESET_NAMES = new Set(PRESET_DRILLS.map(p => p.name));

function isPresetDrill(drill: Drill): boolean {
  return drill.source === 'preset' || PRESET_NAMES.has(drill.name);
}

function isAIDrill(drill: Drill): boolean {
  return drill.source === 'ai';
}

export default function DrillLibrary({ currentDrillId, onSelect, onNew }: DrillLibraryProps) {
  const [drills, setDrills] = useState<Drill[]>(() => loadDrills());
  const [presetsOpen, setPresetsOpen] = useState(false);

  const refreshDrills = useCallback(() => {
    setDrills(loadDrills());
  }, []);

  // Refresh when currentDrillId changes (catches external saves like AI generation)
  useEffect(() => {
    refreshDrills();
  }, [currentDrillId, refreshDrills]);

  // Auto-load all presets into storage on first visit
  useEffect(() => {
    const saved = loadDrills();
    const alreadyLoaded = saved.some(d => isPresetDrill(d));
    if (alreadyLoaded) return;

    (async () => {
      for (const preset of PRESET_DRILLS) {
        try {
          const res = await fetch(`/drills/${preset.file}`);
          if (!res.ok) continue;
          const text = await res.text();
          const drill = importDrillJSON(text);
          drill.id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          drill.source = 'preset';
          drill.createdAt = Date.now();
          drill.updatedAt = Date.now();
          saveDrill(drill);
        } catch { /* skip failed */ }
      }
      refreshDrills();
    })();
  }, [refreshDrills]);

  const handleNew = useCallback(() => {
    const drill = createEmptyDrill();
    drill.source = 'user';
    onNew(drill);
    setTimeout(refreshDrills, 100);
  }, [onNew, refreshDrills]);

  const handleDelete = useCallback((id: string) => {
    deleteDrill(id);
    refreshDrills();
  }, [refreshDrills]);

  const handleExport = useCallback((drill: Drill) => {
    const json = exportDrillJSON(drill);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${drill.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const drill = importDrillJSON(text);
        drill.source = 'user';
        onNew(drill);
        setTimeout(refreshDrills, 100);
      } catch {
        alert('Invalid drill file');
      }
    };
    input.click();
  }, [onNew, refreshDrills]);

  const handleLoadPreset = useCallback(async (preset: typeof PRESET_DRILLS[0]) => {
    const existing = drills.find(d => d.name === preset.name);
    if (existing) {
      onSelect(existing);
      return;
    }
    try {
      const res = await fetch(`/drills/${preset.file}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const text = await res.text();
      const drill = importDrillJSON(text);
      drill.id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      drill.source = 'preset';
      drill.createdAt = Date.now();
      drill.updatedAt = Date.now();
      onNew(drill);
      setTimeout(refreshDrills, 100);
    } catch {
      alert('Failed to load preset');
    }
  }, [drills, onNew, onSelect, refreshDrills]);

  // Categorize drills
  const presetDrills = drills.filter(d => isPresetDrill(d));
  const aiDrills = drills.filter(d => isAIDrill(d)).sort((a, b) => b.createdAt - a.createdAt);
  const userDrills = drills.filter(d => !isPresetDrill(d) && !isAIDrill(d)).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">Drill Library</span>
        <div className="flex gap-1">
          <button
            onClick={handleImport}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded cursor-pointer"
            title="Import"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={handleNew}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded cursor-pointer"
            title="New Drill"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* My Drills section */}
        {userDrills.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              My Drills
            </div>
            {userDrills.map(drill => (
              <DrillRow
                key={drill.id}
                drill={drill}
                isCurrent={drill.id === currentDrillId}
                onSelect={onSelect}
                onExport={handleExport}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* AI Generated section */}
        {aiDrills.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI Generated
            </div>
            {aiDrills.map(drill => (
              <DrillRow
                key={drill.id}
                drill={drill}
                isCurrent={drill.id === currentDrillId}
                icon={<Sparkles className="w-4 h-4 text-purple-400 shrink-0" />}
                onSelect={onSelect}
                onExport={handleExport}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Sample Presets — collapsible */}
        <div>
          <button
            onClick={() => setPresetsOpen(!presetsOpen)}
            className="w-full px-3 py-1.5 flex items-center gap-1 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider hover:bg-gray-700/30 cursor-pointer transition-colors"
          >
            {presetsOpen
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            }
            <BookOpen className="w-3 h-3" />
            Sample Presets
            <span className="text-gray-500 font-normal normal-case ml-1">({presetDrills.length})</span>
          </button>
          {presetsOpen && (
            presetDrills.length > 0
              ? presetDrills.map(drill => (
                  <DrillRow
                    key={drill.id}
                    drill={drill}
                    isCurrent={drill.id === currentDrillId}
                    icon={<BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />}
                    badge={<span className="text-[9px] px-1 py-0.5 bg-cyan-900/50 text-cyan-300 rounded shrink-0">sample</span>}
                    onSelect={onSelect}
                    onExport={handleExport}
                    onDelete={handleDelete}
                  />
                ))
              : PRESET_DRILLS.map(preset => (
                  <div
                    key={preset.file}
                    onClick={() => handleLoadPreset(preset)}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-gray-700/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-200 transition-colors"
                  >
                    <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-sm truncate">{preset.name}</span>
                  </div>
                ))
          )}
        </div>

        {/* Empty state */}
        {drills.length === 0 && (
          <div className="p-4 text-center text-gray-500 text-xs">
            Loading sample drills...
          </div>
        )}
      </div>
    </div>
  );
}

interface DrillRowProps {
  drill: Drill;
  isCurrent: boolean;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  onSelect: (drill: Drill) => void;
  onExport: (drill: Drill) => void;
  onDelete: (id: string) => void;
}

function DrillRow({ drill, isCurrent, icon, badge, onSelect, onExport, onDelete }: DrillRowProps) {
  return (
    <div
      onClick={() => onSelect(drill)}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-gray-700/50 transition-colors ${
        isCurrent
          ? 'bg-blue-600/20 text-white'
          : 'text-gray-300 hover:bg-gray-700/50'
      }`}
    >
      {icon || <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate flex items-center gap-1.5">
          {drill.name}
          {badge}
        </div>
        <div className="text-[10px] text-gray-500">
          {drill.objects.length} objects, {drill.paths.length} paths
        </div>
      </div>
      <div className="flex gap-0.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onExport(drill); }}
          className="p-1 text-gray-500 hover:text-blue-400 cursor-pointer"
          title="Export"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(drill.id); }}
          className="p-1 text-gray-500 hover:text-red-400 cursor-pointer"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
