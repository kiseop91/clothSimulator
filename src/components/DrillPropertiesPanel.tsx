import { CameraPreset, RinkLayout, TEAM_COLORS } from '../types/drill';
import type { DrillEditorState, DrillEditorActions } from '../hooks/useDrillEditor';
import type { RendererBridge } from '../hooks/useRendererBridge';

interface DrillPropertiesPanelProps {
  state: DrillEditorState;
  actions: DrillEditorActions;
  bridge: RendererBridge;
}

const rinkLayouts = [
  { value: RinkLayout.FULL_RINK, label: 'Full Rink' },
  { value: RinkLayout.HALF_RINK, label: 'Half Rink' },
  { value: RinkLayout.NEUTRAL_ZONE, label: 'Neutral Zone' },
  { value: RinkLayout.END_ZONE, label: 'End Zone' },
];

const cameraPresets = [
  { value: CameraPreset.TOP_DOWN, label: 'Top Down' },
  { value: CameraPreset.BROADCAST, label: 'Broadcast' },
  { value: CameraPreset.END_ZONE, label: 'End Zone' },
  { value: CameraPreset.FREE, label: 'Free' },
];

export default function DrillPropertiesPanel({ state, actions, bridge }: DrillPropertiesPanelProps) {
  const selectedObj = state.drill.objects.find(o => o.id === state.selectedObjectId);
  const selectedPath = state.drill.paths.find(p => p.id === state.selectedPathId);

  return (
    <div className="w-64 bg-gray-800 border-l border-gray-700 overflow-y-auto p-3 space-y-4 text-sm">
      {/* Drill Name */}
      <div>
        <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Drill Name</label>
        <input
          type="text"
          value={state.drill.name}
          onChange={(e) => actions.setDrillName(e.target.value)}
          className="w-full bg-gray-700 text-white px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
        />
      </div>

      {/* Rink Layout */}
      <div>
        <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Rink Layout</label>
        <div className="grid grid-cols-2 gap-1">
          {rinkLayouts.map(layout => (
            <button
              key={layout.value}
              onClick={() => actions.setRinkLayout(layout.value)}
              className={`px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                state.drill.rinkLayout === layout.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {layout.label}
            </button>
          ))}
        </div>
      </div>

      {/* Camera Presets */}
      <div>
        <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Camera</label>
        <div className="grid grid-cols-2 gap-1">
          {cameraPresets.map(preset => (
            <button
              key={preset.value}
              onClick={() => bridge.setCameraPreset(preset.value)}
              className="px-2 py-1.5 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Object Properties */}
      {selectedObj && (
        <div className="border-t border-gray-700 pt-3">
          <label className="text-gray-400 text-xs uppercase tracking-wide block mb-2">Selected Object</label>
          <div className="space-y-2">
            <div className="flex justify-between text-gray-300">
              <span>Type</span>
              <span className="text-white capitalize">
                {['Player', 'Puck', 'Cone', 'Coach'][selectedObj.type]}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Position</span>
              <span className="text-white font-mono text-xs">
                ({selectedObj.x.toFixed(0)}, {selectedObj.z.toFixed(0)})
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Keyframes</span>
              <span className="text-white">
                {state.drill.keyframes.find(kf => kf.objectId === selectedObj.id)?.waypoints.length ?? 0}
              </span>
            </div>
            <div>
              <span className="text-gray-300 block mb-1">Color</span>
              <div className="flex gap-1">
                {Object.entries(TEAM_COLORS).map(([name, color]) => {
                  const hex = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
                  return (
                    <button
                      key={name}
                      onClick={() => {
                        actions.moveObject(selectedObj.id, selectedObj.x, selectedObj.z);
                        // TODO: update color
                      }}
                      className="w-6 h-6 rounded-full border border-gray-600 cursor-pointer"
                      style={{ backgroundColor: hex }}
                    />
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => actions.removeObject(selectedObj.id)}
              className="w-full py-1.5 bg-red-700/50 hover:bg-red-700 text-red-200 rounded text-xs cursor-pointer"
            >
              Delete Object
            </button>
          </div>
        </div>
      )}

      {/* Selected Path Properties */}
      {selectedPath && (
        <div className="border-t border-gray-700 pt-3">
          <label className="text-gray-400 text-xs uppercase tracking-wide block mb-2">Selected Path</label>
          <div className="space-y-2">
            <div className="flex justify-between text-gray-300">
              <span>Style</span>
              <span className="text-white capitalize">
                {['Solid', 'Dashed', 'Zigzag', 'Dotted', 'Backward'][selectedPath.style]}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Waypoints</span>
              <span className="text-white">{selectedPath.waypoints.length}</span>
            </div>
            <button
              onClick={() => actions.removePath(selectedPath.id)}
              className="w-full py-1.5 bg-red-700/50 hover:bg-red-700 text-red-200 rounded text-xs cursor-pointer"
            >
              Delete Path
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="border-t border-gray-700 pt-3">
        <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Stats</label>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Objects</span>
            <span className="text-gray-200">{state.drill.objects.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Paths</span>
            <span className="text-gray-200">{state.drill.paths.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
