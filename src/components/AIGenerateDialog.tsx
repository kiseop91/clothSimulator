import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { generateDrill } from '../lib/aiGenerate';
import type { Drill } from '../types/drill';

interface AIGenerateDialogProps {
  onDrillGenerated: (drill: Drill) => void;
  onClose: () => void;
}

const LOADING_MESSAGES = [
  '스케이트 끈을 조이는 중...',
  '화이트보드에 전술을 그리는 중...',
  '코칭스태프와 회의 중...',
  '수비 갭을 분석하는 중...',
  '콘을 세우는 중...',
  'AI 코치가 생각하는 중...',
  '경기 영상을 분석하는 중...',
];

const QUICK_SUGGESTIONS = [
  'Breakout',
  'Power play',
  '2-on-1 rush',
  'Cycling',
  'Penalty kill',
  'Neutral zone regroup',
  'One-timer setup',
  'Dump and chase',
];

export default function AIGenerateDialog({ onDrillGenerated, onClose }: AIGenerateDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle loading messages
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setMessageIndex(i => (i + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setMessageIndex(0);

    try {
      const drill = await generateDrill(prompt.trim());
      onDrillGenerated(drill);
    } catch (err: any) {
      setError(err.message || 'Failed to generate drill');
      setIsGenerating(false);
    }
  }, [prompt, onDrillGenerated]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
      e.preventDefault();
      handleGenerate();
    }
  }, [handleGenerate, isGenerating]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-semibold text-white">AI Drill Generator</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {isGenerating ? (
            /* Loading state */
            <div className="flex flex-col items-center py-8 gap-4">
              {/* Puck pulse animation */}
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-gray-900 animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-purple-500/50 animate-ping" />
              </div>
              <p className="text-gray-300 text-sm text-center animate-fade-in" key={messageIndex}>
                {LOADING_MESSAGES[messageIndex]}
              </p>
            </div>
          ) : (
            /* Input state */
            <div className="space-y-3">
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="예: 3대2 러시 + 원타이머 마무리"
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500 transition-colors"
                autoFocus
              />

              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setPrompt(prev => prev ? `${prev}, ${s.toLowerCase()}` : s)}
                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 rounded-full border border-gray-600 transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
