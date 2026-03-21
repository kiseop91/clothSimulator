import { useState, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import type { DrillEditorState } from '../hooks/useDrillEditor';
import type { RendererBridge } from '../hooks/useRendererBridge';
import { exportPng, exportGif, exportWebM } from '../lib/exportVideo';

interface ExportDialogProps {
  state: DrillEditorState;
  bridge: RendererBridge;
  onClose: () => void;
}

type Format = 'png' | 'gif' | 'webm';

const SCALE_OPTIONS = [
  { label: 'Full', value: 1 },
  { label: 'Half', value: 0.5 },
  { label: 'Quarter', value: 0.25 },
];

export default function ExportDialog({ state, bridge, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>('gif');
  const [fps, setFps] = useState(15);
  const [scale, setScale] = useState(0.5);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isExporting = progress !== null && progress < 1;
  const drillName = state.drill.name || 'drill';

  const handleExport = useCallback(async () => {
    setError(null);
    setProgress(0);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      if (format === 'png') {
        await exportPng(bridge, drillName);
        setProgress(1);
      } else if (format === 'gif') {
        await exportGif(bridge, drillName, {
          format: 'gif',
          fps,
          scale,
          duration: state.drill.duration,
          onProgress: setProgress,
          abortSignal: ac.signal,
        });
      } else {
        await exportWebM(bridge, drillName, {
          format: 'webm',
          fps: 30,
          scale,
          duration: state.drill.duration,
          onProgress: setProgress,
          abortSignal: ac.signal,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Export failed');
      setProgress(null);
    }
  }, [format, fps, scale, bridge, state.drill.duration, drillName]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setProgress(null);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl w-80">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">Export</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Format */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Format</label>
            <div className="flex gap-1">
              {(['png', 'gif', 'webm'] as Format[]).map(f => (
                <button
                  key={f}
                  onClick={() => {
                    setFormat(f);
                    if (f === 'gif') setFps(15);
                    if (f === 'webm') setFps(30);
                  }}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors cursor-pointer ${
                    format === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* FPS (gif/webm only) */}
          {format !== 'png' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                FPS {format === 'webm' ? '(fixed 30)' : ''}
              </label>
              <input
                type="number"
                min={5}
                max={60}
                value={format === 'webm' ? 30 : fps}
                disabled={format === 'webm'}
                onChange={(e) => setFps(parseInt(e.target.value) || 15)}
                className="w-full h-8 bg-gray-700 border border-gray-600 rounded px-2 text-sm text-gray-200 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          )}

          {/* Resolution */}
          {format !== 'png' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Resolution</label>
              <div className="flex gap-1">
                {SCALE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setScale(opt.value)}
                    className={`flex-1 py-1.5 text-xs rounded transition-colors cursor-pointer ${
                      scale === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {progress !== null && (
            <div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 mt-1 block">
                {progress >= 1 ? 'Done! File downloaded.' : `${Math.round(progress * 100)}%`}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          {isExporting ? (
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded cursor-pointer"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded cursor-pointer"
              >
                Export {format.toUpperCase()}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
