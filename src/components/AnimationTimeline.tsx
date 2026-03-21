import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DrillEditorState, DrillEditorActions } from '../hooks/useDrillEditor';
import type { RendererBridge } from '../hooks/useRendererBridge';
import { TokenType } from '../types/drill';

interface AnimationTimelineProps {
  state: DrillEditorState;
  actions: DrillEditorActions;
  bridge: RendererBridge;
}

function getTokenIcon(type: TokenType): string {
  switch (type) {
    case TokenType.PLAYER: return 'P';
    case TokenType.PUCK: return '●';
    case TokenType.CONE: return '▲';
    case TokenType.COACH: return 'X';
  }
}

const SPEED_CYCLE = [0.5, 1, 2];

export default function AnimationTimeline({ state, actions, bridge }: AnimationTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragKeyframeRef = useRef<{ objectId: string; waypointIndex: number } | null>(null);
  const isScrubbing = useRef(false);

  const keyframesWithObjects = state.drill.keyframes
    .map(kf => ({
      ...kf,
      object: state.drill.objects.find(o => o.id === kf.objectId),
    }))
    .filter(kf => kf.object && kf.waypoints.length > 0);

  const scrubToPosition = useCallback((clientX: number, rect: DOMRect) => {
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    actions.setPlaybackTime(t);
    actions.setPlaying(false);
    bridge.setPlaybackTime(t);
  }, [actions, bridge]);

  const rulerRef = useRef<HTMLDivElement>(null);

  const handleRulerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isScrubbing.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    scrubToPosition(e.clientX, rect);
  }, [scrubToPosition]);

  // Window-level mousemove/mouseup for ruler drag scrub
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isScrubbing.current || !rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      scrubToPosition(e.clientX, rect);
    };
    const handleUp = () => {
      isScrubbing.current = false;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [scrubToPosition]);

  const handleKeyframeDragStart = useCallback((objectId: string, waypointIndex: number) => {
    dragKeyframeRef.current = { objectId, waypointIndex };
  }, []);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragKeyframeRef.current || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    actions.updateKeyframeTime(dragKeyframeRef.current.objectId, dragKeyframeRef.current.waypointIndex, t);
  }, [actions]);

  const handleTimelineMouseUp = useCallback(() => {
    dragKeyframeRef.current = null;
  }, []);

  const handleKeyframeDelete = useCallback((objectId: string, waypointIndex: number) => {
    actions.removeKeyframe(objectId, waypointIndex);
  }, [actions]);

  const handleSpeedCycle = () => {
    const idx = SPEED_CYCLE.indexOf(state.playbackSpeed);
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
    actions.setPlaybackSpeed(next);
  };

  const duration = state.drill.duration;
  const hasKeyframes = keyframesWithObjects.length > 0;

  // Generate tick marks
  const ticks: number[] = [];
  const tickInterval = duration <= 10 ? 1 : duration <= 30 ? 5 : 10;
  for (let s = 0; s <= duration; s += tickInterval) {
    ticks.push(s);
  }

  return (
    <div className="bg-gray-800 border-t border-gray-700">
      {/* Header with controls */}
      <div className="flex items-center justify-between px-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
        >
          <span>Timeline {hasKeyframes ? `(${keyframesWithObjects.length} tracks)` : ''}</span>
          {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>

        <div className="flex items-center gap-2">
          {/* Speed */}
          <button
            onClick={handleSpeedCycle}
            className="px-2 py-0.5 text-xs text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors cursor-pointer font-mono min-w-[3rem]"
            title="Playback Speed"
          >
            {state.playbackSpeed}x
          </button>

          {/* Duration */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={120}
              value={duration}
              onChange={(e) => actions.setDrillDuration(parseFloat(e.target.value) || 5)}
              className="w-12 h-6 bg-gray-700 border border-gray-600 rounded text-xs text-center text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title="Duration (seconds)"
            />
            <span className="text-xs text-gray-500">s</span>
          </div>
        </div>
      </div>

      {!collapsed && (
        <div
          ref={timelineRef}
          className="relative select-none flex flex-col"
          onMouseMove={handleTimelineMouseMove}
          onMouseUp={handleTimelineMouseUp}
          onMouseLeave={handleTimelineMouseUp}
        >
          {/* Ruler — always visible */}
          <div
            ref={rulerRef}
            className="h-6 shrink-0 border-b border-gray-600 relative cursor-pointer"
            style={{ backgroundColor: '#2a2d35' }}
            onMouseDown={handleRulerMouseDown}
          >
            {ticks.map(s => {
              const pct = (s / duration) * 100;
              return (
                <div key={s} className="absolute top-0 h-full" style={{ left: `${pct}%` }}>
                  <div className="w-px h-3 bg-gray-500" />
                  <span className="absolute top-3 text-[9px] text-gray-500 -translate-x-1/2">
                    {s}s
                  </span>
                </div>
              );
            })}

            {/* Playback cursor */}
            <div
              className="absolute top-0 h-full w-0.5 bg-blue-400 z-10 pointer-events-none"
              style={{ left: `${state.playbackTime * 100}%` }}
            >
              <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 bg-blue-400 rotate-45" />
            </div>
          </div>

          {/* Scrollable tracks area */}
          <div className="overflow-y-auto" style={{ maxHeight: 112 }}>
            {!hasKeyframes ? (
              <div className="flex items-center justify-center h-7 text-xs text-gray-500">
                Drag tokens on the rink to create keyframes
              </div>
            ) : (
              keyframesWithObjects.map(kf => {
                const obj = kf.object!;
                const colorHex = `rgb(${Math.round(obj.color[0] * 255)},${Math.round(obj.color[1] * 255)},${Math.round(obj.color[2] * 255)})`;

                return (
                  <div key={kf.objectId} className="flex h-7 border-b border-gray-700/50">
                    {/* Label */}
                    <div className="w-16 shrink-0 flex items-center gap-1 px-2 bg-gray-800 border-r border-gray-700">
                      <span
                        className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: colorHex }}
                      >
                        {getTokenIcon(obj.type)}
                      </span>
                      <span className="text-[10px] text-gray-400 truncate">
                        {obj.label || obj.id.slice(-4)}
                      </span>
                    </div>

                    {/* Track */}
                    <div className="flex-1 relative" style={{ backgroundColor: '#1e2028' }}>
                      {/* Keyframe diamonds */}
                      {kf.waypoints.map((wp, i) => {
                        const pct = wp.t * 100;
                        return (
                          <div
                            key={i}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-ew-resize group"
                            style={{ left: `${pct}%` }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleKeyframeDragStart(kf.objectId, i);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              handleKeyframeDelete(kf.objectId, i);
                            }}
                            title={`t=${(wp.t * duration).toFixed(2)}s (right-click to delete)`}
                          >
                            <div
                              className="w-3 h-3 rotate-45 border border-gray-500 group-hover:border-yellow-400 transition-colors"
                              style={{ backgroundColor: colorHex }}
                            />
                          </div>
                        );
                      })}

                      {/* Playback cursor line */}
                      <div
                        className="absolute top-0 h-full w-px bg-blue-400/30 pointer-events-none"
                        style={{ left: `${state.playbackTime * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
