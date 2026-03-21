import { useState } from 'react';
import {
  MousePointer2, User, Circle, Triangle, UserCheck,
  Minus, Waves, Zap, MoreHorizontal, ArrowLeft, Eraser, Undo2, Redo2, Trash2,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { ToolMode, TEAM_COLORS } from '../types/drill';
import type { DrillEditorState, DrillEditorActions } from '../hooks/useDrillEditor';

interface DrillToolbarProps {
  state: DrillEditorState;
  actions: DrillEditorActions;
}

const tools = [
  { mode: ToolMode.SELECT, icon: MousePointer2, label: 'Select', group: 'general' },
  { mode: ToolMode.PLAYER, icon: User, label: 'Player', group: 'tokens' },
  { mode: ToolMode.PUCK, icon: Circle, label: 'Puck', group: 'tokens' },
  { mode: ToolMode.CONE, icon: Triangle, label: 'Cone', group: 'tokens' },
  { mode: ToolMode.COACH, icon: UserCheck, label: 'Coach', group: 'tokens' },
  { mode: ToolMode.PATH_SKATE, icon: Minus, label: 'Skate', group: 'paths' },
  { mode: ToolMode.PATH_PASS, icon: MoreHorizontal, label: 'Pass', group: 'paths' },
  { mode: ToolMode.PATH_SHOOT, icon: Zap, label: 'Shoot', group: 'paths' },
  { mode: ToolMode.PATH_CARRY, icon: Waves, label: 'Carry', group: 'paths' },
  { mode: ToolMode.PATH_BACKWARD, icon: ArrowLeft, label: 'Back', group: 'paths' },
  { mode: ToolMode.ERASE, icon: Eraser, label: 'Erase', group: 'general' },
];

const colorOptions = Object.entries(TEAM_COLORS);

export default function DrillToolbar({ state, actions }: DrillToolbarProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <div className="hidden md:flex w-16 bg-gray-800 border-r border-gray-700 flex-col items-center py-2 gap-1 overflow-y-auto">
        {tools.map((tool, i) => {
          const isActive = state.tool === tool.mode;
          const prevGroup = i > 0 ? tools[i - 1].group : null;
          return (
            <div key={tool.mode}>
              {prevGroup && prevGroup !== tool.group && (
                <div className="w-8 h-px bg-gray-600 my-1" />
              )}
              <button
                onClick={() => actions.setTool(tool.mode)}
                className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                title={tool.label}
              >
                <tool.icon className="w-5 h-5" />
              </button>
            </div>
          );
        })}

        <div className="w-8 h-px bg-gray-600 my-1" />

        <div className="flex flex-col gap-1">
          {colorOptions.map(([name, color]) => {
            const isActive = state.currentColor[0] === color[0]
              && state.currentColor[1] === color[1]
              && state.currentColor[2] === color[2];
            const hex = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
            return (
              <button
                key={name}
                onClick={() => actions.setCurrentColor(color as [number, number, number])}
                className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer ${
                  isActive ? 'border-white scale-110' : 'border-gray-600 hover:border-gray-400'
                }`}
                style={{ backgroundColor: hex }}
                title={name}
              />
            );
          })}
        </div>

        <div className="w-8 h-px bg-gray-600 my-1" />

        <button
          onClick={actions.undo}
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white rounded-lg cursor-pointer"
          title="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={actions.redo}
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white rounded-lg cursor-pointer"
          title="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={actions.clearAll}
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-red-700 hover:text-white rounded-lg cursor-pointer mt-auto"
          title="Clear All"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile: floating compact toolbar */}
      <div className="md:hidden absolute top-1 left-10 z-20">
        {/* Active tool indicator + expand toggle */}
        <div className="flex items-center gap-0.5 bg-gray-900/90 backdrop-blur-sm rounded-xl shadow-lg p-0.5">
          {/* Quick access: top row of common tools */}
          {(mobileExpanded ? tools : tools.filter(t =>
            t.mode === state.tool ||
            t.mode === ToolMode.SELECT ||
            t.mode === ToolMode.PLAYER ||
            t.mode === ToolMode.PATH_SKATE ||
            t.mode === ToolMode.ERASE
          )).map(tool => {
            const isActive = state.tool === tool.mode;
            return (
              <button
                key={tool.mode}
                onClick={() => actions.setTool(tool.mode)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 active:bg-gray-700'
                }`}
                title={tool.label}
              >
                <tool.icon className="w-3.5 h-3.5" />
              </button>
            );
          })}

          {/* Expand/collapse */}
          <button
            onClick={() => setMobileExpanded(!mobileExpanded)}
            className="w-7 h-7 flex items-center justify-center text-gray-400 cursor-pointer"
          >
            {mobileExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Expanded: colors + undo/redo row */}
        {mobileExpanded && (
          <div className="flex items-center gap-0.5 bg-gray-900/90 backdrop-blur-sm rounded-xl shadow-lg p-0.5 mt-0.5">
            {colorOptions.map(([name, color]) => {
              const isActive = state.currentColor[0] === color[0]
                && state.currentColor[1] === color[1]
                && state.currentColor[2] === color[2];
              const hex = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
              return (
                <button
                  key={name}
                  onClick={() => actions.setCurrentColor(color as [number, number, number])}
                  className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                    isActive ? 'border-white scale-110' : 'border-gray-600'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
            <div className="w-px h-5 bg-gray-600 mx-0.5" />
            <button onClick={actions.undo} className="w-7 h-7 flex items-center justify-center text-gray-300 cursor-pointer">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={actions.redo} className="w-7 h-7 flex items-center justify-center text-gray-300 cursor-pointer">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={actions.clearAll} className="w-7 h-7 flex items-center justify-center text-red-400 cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
