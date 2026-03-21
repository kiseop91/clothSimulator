import { Play, Pause, RotateCcw, SkipBack, SkipForward, Repeat } from 'lucide-react';
import type { DrillEditorState, DrillEditorActions } from '../hooks/useDrillEditor';
import type { RendererBridge } from '../hooks/useRendererBridge';

interface PlaybackControlsProps {
  state: DrillEditorState;
  actions: DrillEditorActions;
  bridge: RendererBridge;
}

function formatTime(t: number, duration: number): string {
  const seconds = Math.floor(t * duration);
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function PlaybackControls({ state, actions, bridge }: PlaybackControlsProps) {
  return (
    <>
      {/* Desktop: full bar */}
      <div className="hidden md:flex h-12 shrink-0 bg-gray-800 border-t border-gray-700 items-center px-4 gap-2">
        <button
          onClick={() => {
            actions.stepBackward();
            bridge.setPlaybackTime(Math.max(state.playbackTime - 1 / 30 / state.drill.duration, 0));
          }}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
          title="Step Back"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          onClick={() => actions.setPlaying(!state.isPlaying)}
          className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors cursor-pointer"
          title={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <button
          onClick={() => {
            actions.stepForward();
            bridge.setPlaybackTime(Math.min(state.playbackTime + 1 / 30 / state.drill.duration, 1));
          }}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
          title="Step Forward"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            actions.setPlaybackTime(0);
            actions.setPlaying(false);
            bridge.setPlaybackTime(0);
          }}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
          title="Reset"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(state.playbackTime * 1000)}
          onChange={(e) => {
            const t = parseFloat(e.target.value) / 1000;
            actions.setPlaybackTime(t);
            bridge.setPlaybackTime(t);
          }}
          className="flex-1 h-1.5 accent-blue-500"
        />

        <span className="text-xs text-gray-400 w-20 text-center font-mono whitespace-nowrap">
          {formatTime(state.playbackTime, state.drill.duration)} / {formatTime(1, state.drill.duration)}
        </span>

        <button
          onClick={() => actions.setLooping(!state.isLooping)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
            state.isLooping
              ? 'text-blue-400 bg-blue-900/40'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
          title="Loop"
        >
          <Repeat className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile: slim floating bar at bottom */}
      <div className="md:hidden absolute bottom-1 left-1 right-1 z-20 flex items-center gap-1 px-2 py-1 bg-gray-900/85 backdrop-blur-sm rounded-xl">
        <button
          onClick={() => actions.setPlaying(!state.isPlaying)}
          className="w-8 h-8 shrink-0 flex items-center justify-center bg-blue-600 text-white rounded-full cursor-pointer"
        >
          {state.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(state.playbackTime * 1000)}
          onChange={(e) => {
            const t = parseFloat(e.target.value) / 1000;
            actions.setPlaybackTime(t);
            bridge.setPlaybackTime(t);
          }}
          className="flex-1 h-1 accent-blue-500"
        />

        <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap w-8 text-center">
          {formatTime(state.playbackTime, state.drill.duration)}
        </span>

        <button
          onClick={() => {
            actions.setPlaybackTime(0);
            actions.setPlaying(false);
            bridge.setPlaybackTime(0);
          }}
          className="w-6 h-6 shrink-0 flex items-center justify-center text-gray-400 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    </>
  );
}
