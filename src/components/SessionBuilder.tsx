import { useState, useCallback, useRef } from 'react';
import { Plus, ArrowLeft, GripVertical, X, Printer, Trash2 } from 'lucide-react';
import {
  BlockCategory,
  BLOCK_CATEGORY_META,
  type SessionBlock,
  type PracticeSession,
  type Drill,
} from '../types/drill.ts';
import { saveSession, loadSessions, deleteSession } from '../lib/storage.ts';
import { loadDrills } from '../lib/storage.ts';
import SessionPrintView from './SessionPrintView.tsx';

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(): PracticeSession {
  return {
    id: `session_${createId()}`,
    name: 'New Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    targetDurationMinutes: 60,
    blocks: [],
  };
}

function createBlock(): SessionBlock {
  return {
    id: `block_${createId()}`,
    name: 'New Block',
    category: BlockCategory.WARMUP,
    durationMinutes: 10,
    drillId: null,
    notes: '',
  };
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `0:${m.toString().padStart(2, '0')}`;
}

interface Props {
  onLoadDrill: (drill: Drill) => void;
}

export default function SessionBuilder({ onLoadDrill }: Props) {
  const [sessions, setSessions] = useState<PracticeSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  // Drag state
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const active = activeId ? sessions.find(s => s.id === activeId) ?? null : null;

  const persist = useCallback((updated: PracticeSession) => {
    saveSession(updated);
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
  }, []);

  const updateActive = useCallback((fn: (s: PracticeSession) => PracticeSession) => {
    if (!active) return;
    const updated = fn(active);
    persist(updated);
  }, [active, persist]);

  // --- List View ---
  if (!active) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-3 border-b border-gray-700">
          <button
            onClick={() => {
              const s = createSession();
              persist(s);
              setActiveId(s.id);
            }}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" /> New Session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="text-gray-500 text-xs text-center mt-8 px-4">
              No sessions yet. Create one to plan your practice.
            </p>
          )}
          {sessions.map(s => {
            const total = s.blocks.reduce((a, b) => a + b.durationMinutes, 0);
            return (
              <div
                key={s.id}
                className="px-3 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors group"
                onClick={() => setActiveId(s.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-200 font-medium truncate">{s.name}</span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      deleteSession(s.id);
                      setSessions(prev => prev.filter(x => x.id !== s.id));
                    }}
                    className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {s.blocks.length} blocks &middot; {total} min &middot; {new Date(s.updatedAt).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Edit View ---
  const totalMin = active.blocks.reduce((a, b) => a + b.durationMinutes, 0);
  const target = active.targetDurationMinutes;
  const progressPct = Math.min((totalMin / target) * 100, 100);
  const timeColor = totalMin > target ? '#ef4444' : totalMin > target - 5 ? '#eab308' : '#22c55e';

  const drills = loadDrills();
  const drillMap = new Map(drills.map(d => [d.id, d]));

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    const from = dragIdx.current;
    if (from === null || from === idx) { setDragOverIdx(null); return; }
    updateActive(s => {
      const blocks = [...s.blocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(idx, 0, moved);
      return { ...s, blocks };
    });
    setDragOverIdx(null);
    dragIdx.current = null;
  };

  let cumulative = 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setActiveId(null); setExpandedBlockId(null); }}
            className="p-1 text-gray-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            className="flex-1 bg-transparent text-sm text-white font-semibold outline-none border-b border-transparent focus:border-gray-500 min-w-0"
            value={active.name}
            onChange={e => updateActive(s => ({ ...s, name: e.target.value }))}
          />
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ backgroundColor: timeColor + '20', color: timeColor }}
          >
            {totalMin}/{target} min
          </span>
        </div>

        {/* Target duration */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Target:</span>
          <input
            type="number"
            min={10}
            max={180}
            value={active.targetDurationMinutes}
            onChange={e => updateActive(s => ({ ...s, targetDurationMinutes: Math.max(10, parseInt(e.target.value) || 60) }))}
            className="w-14 bg-gray-700 text-gray-200 rounded px-1.5 py-0.5 text-xs outline-none"
          />
          <span>min</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowPrint(true)}
            className="p-1 text-gray-400 hover:text-white cursor-pointer"
            title="Print"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%`, backgroundColor: timeColor }}
          />
        </div>
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto">
        {active.blocks.map((block, idx) => {
          const startMin = cumulative;
          cumulative += block.durationMinutes;
          const endMin = cumulative;
          const meta = BLOCK_CATEGORY_META[block.category];
          const linkedDrill = block.drillId ? drillMap.get(block.drillId) : null;
          const isExpanded = expandedBlockId === block.id;

          return (
            <div
              key={block.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => setDragOverIdx(null)}
              className="relative group"
            >
              {/* Drop indicator */}
              {dragOverIdx === idx && (
                <div className="absolute top-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full z-10" />
              )}

              <div
                className="flex border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors cursor-pointer"
                onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}
              >
                {/* Category color bar */}
                <div className="w-1 shrink-0" style={{ backgroundColor: meta.color }} />

                <div className="flex-1 min-w-0 px-2 py-2">
                  {/* Row 1 */}
                  <div className="flex items-center gap-1.5">
                    <GripVertical className="w-3 h-3 text-gray-600 shrink-0 cursor-grab" />
                    <span className="text-sm text-gray-200 font-medium truncate flex-1">{block.name}</span>
                    <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-700 rounded-full whitespace-nowrap">
                      {block.durationMinutes} min
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        updateActive(s => ({ ...s, blocks: s.blocks.filter(b => b.id !== block.id) }));
                      }}
                      className="p-0.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Row 2 */}
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <span>{linkedDrill ? `Linked: ${linkedDrill.name}` : 'No drill linked'}</span>
                    <span className="ml-auto">{formatTime(startMin)}-{formatTime(endMin)}</span>
                  </div>
                </div>
              </div>

              {/* Expanded inline editor */}
              {isExpanded && (
                <div className="bg-gray-800/50 border-b border-gray-700/50 px-3 py-2.5 space-y-2.5">
                  {/* Block name */}
                  <input
                    className="w-full bg-gray-700 text-sm text-gray-200 rounded px-2 py-1 outline-none"
                    value={block.name}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      const name = e.target.value;
                      updateActive(s => ({
                        ...s,
                        blocks: s.blocks.map(b => b.id === block.id ? { ...b, name } : b),
                      }));
                    }}
                  />

                  {/* Category pills */}
                  <div className="flex flex-wrap gap-1">
                    {Object.values(BlockCategory).map(cat => {
                      const cm = BLOCK_CATEGORY_META[cat];
                      const sel = block.category === cat;
                      return (
                        <button
                          key={cat}
                          onClick={e => {
                            e.stopPropagation();
                            updateActive(s => ({
                              ...s,
                              blocks: s.blocks.map(b => b.id === block.id ? { ...b, category: cat } : b),
                            }));
                          }}
                          className="px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors"
                          style={{
                            backgroundColor: sel ? cm.color + '30' : 'transparent',
                            color: sel ? cm.color : '#9ca3af',
                            border: `1px solid ${sel ? cm.color : '#4b5563'}`,
                          }}
                        >
                          {cm.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Duration */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Duration:</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={block.durationMinutes}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        const dur = Math.max(1, Math.min(30, parseInt(e.target.value) || 1));
                        updateActive(s => ({
                          ...s,
                          blocks: s.blocks.map(b => b.id === block.id ? { ...b, durationMinutes: dur } : b),
                        }));
                      }}
                      className="w-16 bg-gray-700 text-gray-200 text-sm rounded px-2 py-1 outline-none"
                    />
                    <span className="text-xs text-gray-500">min</span>
                  </div>

                  {/* Link Drill */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 shrink-0">Link Drill:</label>
                    <select
                      value={block.drillId || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        const drillId = e.target.value || null;
                        updateActive(s => ({
                          ...s,
                          blocks: s.blocks.map(b => b.id === block.id ? { ...b, drillId } : b),
                        }));
                      }}
                      className="flex-1 bg-gray-700 text-gray-200 text-xs rounded px-2 py-1 outline-none min-w-0"
                    >
                      <option value="">-- None --</option>
                      {drills.filter(d => d.source === 'ai').length > 0 && (
                        <optgroup label="AI Generated">
                          {drills.filter(d => d.source === 'ai').map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {drills.filter(d => d.source === 'preset').length > 0 && (
                        <optgroup label="Presets">
                          {drills.filter(d => d.source === 'preset').map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {drills.filter(d => !d.source || d.source === 'user').length > 0 && (
                        <optgroup label="My Drills">
                          {drills.filter(d => !d.source || d.source === 'user').map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {linkedDrill && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onLoadDrill(linkedDrill);
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer whitespace-nowrap"
                      >
                        Preview
                      </button>
                    )}
                  </div>

                  {/* Notes */}
                  <textarea
                    rows={2}
                    placeholder="Coaching notes..."
                    value={block.notes}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      const notes = e.target.value;
                      updateActive(s => ({
                        ...s,
                        blocks: s.blocks.map(b => b.id === block.id ? { ...b, notes } : b),
                      }));
                    }}
                    className="w-full bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 outline-none resize-none"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Block button */}
      <div className="px-3 py-2 border-t border-gray-700">
        <button
          onClick={() => updateActive(s => ({ ...s, blocks: [...s.blocks, createBlock()] }))}
          className="w-full py-1.5 border border-dashed border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 text-sm rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Block
        </button>
      </div>

      {/* Print modal */}
      {showPrint && (
        <SessionPrintView session={active} drills={drills} onClose={() => setShowPrint(false)} />
      )}
    </div>
  );
}
