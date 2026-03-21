import { useState, useCallback, useRef } from 'react';
import { Sparkles, Play, RotateCcw, X, Check, Loader2 } from 'lucide-react';
import type { DrillEditorState, DrillEditorActions } from '../hooks/useDrillEditor';
import type { RendererBridge } from '../hooks/useRendererBridge';
import type { Drill, DrillObject, DrillKeyframe } from '../types/drill';
import { generateAnimation } from '../lib/aiGenerate';
import { mergeAnimationResult } from '../lib/mergeAnimation';

// Interpolate object positions at a given playback time using existing keyframes
function getInterpolatedObjects(
  objects: DrillObject[],
  keyframes: DrillKeyframe[],
  playbackTime: number
): DrillObject[] {
  return objects.map(obj => {
    const kf = keyframes.find(k => k.objectId === obj.id);
    if (!kf || kf.waypoints.length === 0) return obj;

    const t = playbackTime;
    const wps = kf.waypoints;

    let x = obj.x, z = obj.z;
    if (wps.length === 1) {
      x = wps[0].x; z = wps[0].z;
    } else if (t <= wps[0].t) {
      x = wps[0].x; z = wps[0].z;
    } else if (t >= wps[wps.length - 1].t) {
      x = wps[wps.length - 1].x; z = wps[wps.length - 1].z;
    } else {
      for (let i = 0; i < wps.length - 1; i++) {
        if (t >= wps[i].t && t <= wps[i + 1].t) {
          const segT = (t - wps[i].t) / (wps[i + 1].t - wps[i].t);
          x = wps[i].x + (wps[i + 1].x - wps[i].x) * segT;
          z = wps[i].z + (wps[i + 1].z - wps[i].z) * segT;
          break;
        }
      }
    }

    return { ...obj, x, z };
  });
}

interface AIAnimateBarProps {
  state: DrillEditorState;
  actions: DrillEditorActions;
  bridge: RendererBridge;
  aiSelectedIds: string[];
  onClose: () => void;
}

type BarPhase = 'input' | 'loading' | 'preview';

const LOADING_MESSAGES = [
  'AI 코치가 애니메이션을 짜는 중...',
  '경로를 계산하는 중...',
  '타이밍을 조정하는 중...',
  '전술 보드를 분석하는 중...',
];

export default function AIAnimateBar({ state, actions, bridge, aiSelectedIds, onClose }: AIAnimateBarProps) {
  const [phase, setPhase] = useState<BarPhase>('input');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);

  // Store original drill for cancel/regenerate
  const originalDrillRef = useRef<Drill | null>(null);
  const lastPromptRef = useRef('');
  const msgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedLabels = aiSelectedIds.length > 0
    ? aiSelectedIds.map(id => {
        const obj = state.drill.objects.find(o => o.id === id);
        return obj?.label || obj?.id.slice(0, 6) || id;
      }).join(', ')
    : '전체 토큰';

  const startLoading = useCallback(() => {
    setMsgIndex(0);
    if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
    msgIntervalRef.current = setInterval(() => {
      setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length);
    }, 2500);
  }, []);

  const stopLoading = useCallback(() => {
    if (msgIntervalRef.current) {
      clearInterval(msgIntervalRef.current);
      msgIntervalRef.current = null;
    }
  }, []);

  const handleGenerate = useCallback(async (promptText?: string) => {
    const text = promptText || prompt;
    if (!text.trim()) return;

    // Save original drill for cancel
    originalDrillRef.current = JSON.parse(JSON.stringify(state.drill));
    lastPromptRef.current = text;

    setPhase('loading');
    setError(null);
    setWarnings([]);
    startLoading();

    // Stop playback
    actions.setPlaying(false);

    try {
      // Use interpolated positions at current playback time, not base positions
      const currentObjects = getInterpolatedObjects(
        state.drill.objects,
        state.drill.keyframes,
        state.playbackTime
      );

      const result = await generateAnimation(
        text.trim(),
        currentObjects,
        aiSelectedIds,
        state.drill.keyframes,
        state.drill.duration
      );

      stopLoading();

      // Apply preview
      const previewDrill = mergeAnimationResult(
        originalDrillRef.current!,
        result
      );

      actions.setDrill(previewDrill);
      setWarnings(result.warnings);
      setPreviewDuration(result.duration);
      setPhase('preview');

      // Auto-play preview
      actions.setPlaybackTime(0);
      bridge.setPlaybackTime(0);
      setTimeout(() => actions.setPlaying(true), 200);
    } catch (err: any) {
      stopLoading();
      setError(err.message || 'Failed to generate animation');
      setPhase('input');
    }
  }, [prompt, state.drill, aiSelectedIds, actions, bridge, startLoading, stopLoading]);

  const handleApply = useCallback(() => {
    // Current drill state IS the preview — just clear original ref
    originalDrillRef.current = null;
    setAppliedCount(c => c + 1);
    setPhase('input');
    setPrompt('');
    setWarnings([]);
    actions.setPlaying(false);
  }, [actions]);

  const handleRegenerate = useCallback(() => {
    // Restore original
    if (originalDrillRef.current) {
      actions.setDrill(originalDrillRef.current);
    }
    actions.setPlaying(false);
    // Re-run with same prompt
    handleGenerate(lastPromptRef.current);
  }, [actions, handleGenerate]);

  const handleCancel = useCallback(() => {
    // Restore original drill
    if (originalDrillRef.current) {
      actions.setDrill(originalDrillRef.current);
      originalDrillRef.current = null;
    }
    actions.setPlaying(false);
    setPhase('input');
    setWarnings([]);
  }, [actions]);

  const handleClose = useCallback(() => {
    // If in preview, restore original first
    if (phase === 'preview' && originalDrillRef.current) {
      actions.setDrill(originalDrillRef.current);
      originalDrillRef.current = null;
    }
    stopLoading();
    actions.setPlaying(false);
    onClose();
  }, [phase, actions, onClose, stopLoading]);

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          {phase === 'loading' && (
            <span className="text-gray-300 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {LOADING_MESSAGES[msgIndex]}
            </span>
          )}
          {phase === 'preview' && (
            <span className="text-gray-300">
              미리보기 <span className="text-gray-500 ml-1">{previewDuration.toFixed(1)}s</span>
            </span>
          )}
          {phase === 'input' && (
            <span className="text-gray-400">
              [{selectedLabels}]
              {appliedCount > 0 && <span className="text-green-400 ml-2">{appliedCount}개 적용됨</span>}
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="p-1 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
          title="Done"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded px-2 py-1">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* Input phase */}
      {phase === 'input' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="퍽을 가지고 블루라인까지 빠르게 이동..."
            className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
            autoFocus
          />
          <button
            onClick={() => handleGenerate()}
            disabled={!prompt.trim()}
            className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Play className="w-3 h-3" />
            생성
          </button>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* Preview phase */}
      {phase === 'preview' && (
        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Check className="w-3 h-3" />
            적용
          </button>
          <button
            onClick={handleRegenerate}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            다시 생성
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
            취소
          </button>
        </div>
      )}
    </div>
  );
}
