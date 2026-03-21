import { useEffect, useCallback, useRef, useState } from 'react';
import { Layout, Monitor, PanelRightOpen, PanelRightClose, X, RotateCcw, BookOpen, Sparkles, SmartphoneIcon } from 'lucide-react';
import { useRenderer } from './context/RendererContext.tsx';
import { useDrillEditor } from './hooks/useDrillEditor.ts';
import { createEmptyDrill, type Drill } from './types/drill.ts';
import { saveDrill, loadDrills } from './lib/storage.ts';
import { generateDrill } from './lib/aiGenerate.ts';
import RinkViewer from './components/RinkViewer.tsx';
import DrillEditor from './components/DrillEditor.tsx';
import DrillToolbar from './components/DrillToolbar.tsx';
import DrillPropertiesPanel from './components/DrillPropertiesPanel.tsx';
import PlaybackControls from './components/PlaybackControls.tsx';
import DrillLibrary from './components/DrillLibrary.tsx';
import AnimationTimeline from './components/AnimationTimeline.tsx';
import ExportDialog from './components/ExportDialog.tsx';
import AIGenerateDialog from './components/AIGenerateDialog.tsx';

function useIsPortraitMobile() {
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(mobile && portrait);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isPortrait;
}

export default function App() {
  const { bridge } = useRenderer();
  const [showExport, setShowExport] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const isPortraitMobile = useIsPortraitMobile();

  // Welcome screen / AI-first flow states (shared by mobile + PC)
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomePhase, setWelcomePhase] = useState<'input' | 'loading' | 'rotate'>('input');
  const [pendingDrill, setPendingDrill] = useState<Drill | null>(null);
  const [welcomePrompt, setWelcomePrompt] = useState('');
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  const [welcomeMsgIndex, setWelcomeMsgIndex] = useState(0);

  // Load the most recent drill or create a new one
  const initialDrillRef = useRef<Drill | null>(null);
  if (!initialDrillRef.current) {
    const drills = loadDrills();
    initialDrillRef.current = drills.length > 0 ? drills[drills.length - 1] : createEmptyDrill();
  }

  const { state, actions } = useDrillEditor(initialDrillRef.current);

  // Auto-save debounced
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveDrill(state.drill);
    }, 500);
    return () => clearTimeout(timeout);
  }, [state.drill]);

  // Playback animation loop
  useEffect(() => {
    if (!state.isPlaying) return;
    let raf: number;
    const startTime = performance.now();
    const startT = state.playbackTime;
    const durationMs = (state.drill.duration || 5) * 1000;
    const speed = state.playbackSpeed;
    const looping = state.isLooping;

    let logCount = 0;
    const tick = () => {
      const elapsed = performance.now() - startTime;
      let t = startT + (elapsed * speed) / durationMs;

      if (t >= 1.0) {
        if (looping) {
          t = t % 1.0;
        } else {
          t = 1.0;
        }
      }

      if (logCount++ < 10) {
        console.log('[Playback] t=', t.toFixed(3), 'elapsed=', elapsed.toFixed(0), 'ms');
      }

      actions.setPlaybackTime(t);
      bridge.setPlaybackTime(t);

      if (t < 1.0 || looping) {
        raf = requestAnimationFrame(tick);
      } else {
        actions.setPlaying(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.isPlaying]);

  // Sync tokens/paths/rink to WASM (must run in App so it works in both 2D and 3D)
  useEffect(() => {
    bridge.syncTokens(state.drill.objects);
  }, [state.drill.objects, bridge]);

  useEffect(() => {
    bridge.syncPaths(state.drill.paths);
  }, [state.drill.paths, bridge]);

  useEffect(() => {
    bridge.setRinkLayout(state.drill.rinkLayout);
  }, [state.drill.rinkLayout, bridge]);

  // Sync animation data to WASM when keyframes change
  useEffect(() => {
    try {
      bridge.syncAnimation(state.drill.keyframes, state.drill.objects);
    } catch (e) {
      console.warn('Failed to sync animation:', e);
    }
  }, [state.drill.keyframes, state.drill.objects, bridge]);

  // Welcome loading message cycling
  const WELCOME_LOADING_MESSAGES = [
    '스케이트 끈을 조이는 중...',
    '화이트보드에 전술을 그리는 중...',
    '코칭스태프와 회의 중...',
    '수비 갭을 분석하는 중...',
    '콘을 세우는 중...',
    'AI 코치가 생각하는 중...',
    '경기 영상을 분석하는 중...',
  ];

  useEffect(() => {
    if (welcomePhase !== 'loading') return;
    const interval = setInterval(() => {
      setWelcomeMsgIndex(i => (i + 1) % WELCOME_LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [welcomePhase]);

  // Track if user was ever on mobile portrait (to detect mobile→landscape rotation)
  const wasMobilePortraitRef = useRef(false);
  if (isPortraitMobile) wasMobilePortraitRef.current = true;

  // When mobile user rotates to landscape: load pending drill or just dismiss welcome
  useEffect(() => {
    if (isPortraitMobile || !wasMobilePortraitRef.current) return;

    if (pendingDrill) {
      // AI drill ready → load + autoplay
      saveDrill(pendingDrill);
      actions.setDrill(pendingDrill);
      actions.setPlaybackTime(0);
      bridge.setPlaybackTime(0);
      setTimeout(() => actions.setPlaying(true), 300);
      if (pendingDrill.description) setShowDescription(true);
      setPendingDrill(null);
    }

    // Always dismiss welcome on mobile landscape
    setShowWelcome(false);
    setWelcomePhase('input');
    setWelcomePrompt('');

    try {
      (screen.orientation as any)?.lock?.('landscape').catch(() => {});
    } catch {}
  }, [isPortraitMobile, pendingDrill]);

  // Welcome AI generate handler (mobile + PC)
  const handleWelcomeGenerate = useCallback(async () => {
    if (!welcomePrompt.trim()) return;
    setWelcomePhase('loading');
    setWelcomeError(null);
    setWelcomeMsgIndex(0);
    try {
      const drill = await generateDrill(welcomePrompt.trim());
      drill.source = 'ai';
      if (isPortraitMobile) {
        // Mobile: store pending drill → rotate phase
        setPendingDrill(drill);
        setWelcomePhase('rotate');
      } else {
        // PC: load immediately + autoplay
        saveDrill(drill);
        actions.setDrill(drill);
        actions.setPlaybackTime(0);
        bridge.setPlaybackTime(0);
        setTimeout(() => actions.setPlaying(true), 300);
        setShowWelcome(false);
        if (drill.description) setShowDescription(true);
      }
    } catch (err: any) {
      setWelcomeError(err.message || 'Failed to generate drill');
      setWelcomePhase('input');
    }
  }, [welcomePrompt, isPortraitMobile, actions, bridge]);

  const WELCOME_SUGGESTIONS = [
    'Breakout',
    'Power play',
    '2-on-1 rush',
    'Cycling',
    'Penalty kill',
    'Neutral zone regroup',
    'One-timer setup',
    'Dump and chase',
  ];

  const handleSelectDrill = useCallback((drill: Drill) => {
    actions.setDrill(drill);
    setShowSidebar(false);
  }, [actions]);

  const handleNewDrill = useCallback((drill: Drill) => {
    saveDrill(drill);
    actions.setDrill(drill);
  }, [actions]);

  const handleAIDrillGenerated = useCallback((drill: Drill) => {
    drill.source = 'ai';
    saveDrill(drill);
    actions.setDrill(drill);
    setShowAIGenerate(false);
    // Auto-play
    actions.setPlaybackTime(0);
    bridge.setPlaybackTime(0);
    setTimeout(() => actions.setPlaying(true), 300);
    if (drill.description) setShowDescription(true);
  }, [actions, bridge]);

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 text-gray-200">
      {/* Portrait mobile: AI-first flow overlay */}
      {isPortraitMobile && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center text-center">
          {/* Branding header */}
          <div className="pt-12 pb-6 flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <HockeyIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white font-bold text-xl">Hockey Drill Studio</h1>
            <p className="text-gray-500 text-xs">AI-powered drill designer</p>
          </div>

          {/* Phase content */}
          <div className="flex-1 w-full px-6 flex flex-col">
            {welcomePhase === 'input' && (
              <div className="flex-1 flex flex-col gap-4">
                <p className="text-gray-400 text-sm">어떤 드릴을 만들까요?</p>
                <textarea
                  value={welcomePrompt}
                  onChange={e => setWelcomePrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleWelcomeGenerate();
                    }
                  }}
                  placeholder="예: 3대2 러시 + 원타이머 마무리"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500 transition-colors"
                  autoFocus
                />

                {/* Quick suggestions */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {WELCOME_SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => setWelcomePrompt(prev => prev ? `${prev}, ${s.toLowerCase()}` : s)}
                      className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-full border border-gray-700 transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Error */}
                {welcomeError && (
                  <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                    {welcomeError}
                  </p>
                )}

                {/* Generate button */}
                <div className="mt-auto pb-8">
                  <button
                    onClick={handleWelcomeGenerate}
                    disabled={!welcomePrompt.trim()}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-purple-500/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Drill
                  </button>
                </div>
              </div>
            )}

            {welcomePhase === 'loading' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                {/* Puck pulse animation */}
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-gray-900 animate-pulse" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/50 animate-ping" />
                </div>
                <p className="text-gray-300 text-sm animate-fade-in" key={welcomeMsgIndex}>
                  {WELCOME_LOADING_MESSAGES[welcomeMsgIndex]}
                </p>
              </div>
            )}

            {welcomePhase === 'rotate' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div className="relative">
                  <SmartphoneIcon className="w-16 h-16 text-blue-400 animate-bounce" style={{ transform: 'rotate(90deg)' }} />
                </div>
                <div className="space-y-2">
                  <p className="text-white text-lg font-semibold">드릴이 준비되었습니다!</p>
                  <p className="text-gray-400 text-sm">
                    기기를 가로로 돌려주세요<br />
                    자동으로 재생이 시작됩니다
                  </p>
                </div>
                {/* Success indicator */}
                <div className="flex items-center gap-2 text-green-400 text-xs bg-green-900/20 border border-green-800/30 rounded-full px-4 py-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  AI 드릴 생성 완료
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PC welcome overlay */}
      {showWelcome && !isPortraitMobile && (
        <div className="fixed inset-0 z-50 bg-gray-900/95 backdrop-blur-sm flex items-center justify-center">
          <div className="w-full max-w-lg px-6">
            {/* Branding */}
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <HockeyIcon className="w-9 h-9 text-white" />
              </div>
              <h1 className="text-white font-bold text-2xl">Hockey Drill Studio</h1>
              <p className="text-gray-500 text-sm">AI-powered drill designer</p>
            </div>

            {welcomePhase === 'input' && (
              <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
                <p className="text-gray-400 text-sm text-center">어떤 드릴을 만들까요?</p>
                <textarea
                  value={welcomePrompt}
                  onChange={e => setWelcomePrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleWelcomeGenerate();
                    }
                  }}
                  placeholder="예: 3대2 러시 + 원타이머 마무리"
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500 transition-colors"
                  autoFocus
                />

                {/* Quick suggestions */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {WELCOME_SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => setWelcomePrompt(prev => prev ? `${prev}, ${s.toLowerCase()}` : s)}
                      className="px-3 py-1.5 text-xs bg-gray-900 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-full border border-gray-600 transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Error */}
                {welcomeError && (
                  <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                    {welcomeError}
                  </p>
                )}

                {/* Generate button */}
                <button
                  onClick={handleWelcomeGenerate}
                  disabled={!welcomePrompt.trim()}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-purple-500/20"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Drill
                </button>
              </div>
            )}

            {welcomePhase === 'loading' && (
              <div className="flex flex-col items-center justify-center gap-6 py-16">
                {/* Puck pulse animation */}
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-gray-900 animate-pulse" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/50 animate-ping" />
                </div>
                <p className="text-gray-300 text-sm animate-fade-in" key={welcomeMsgIndex}>
                  {WELCOME_LOADING_MESSAGES[welcomeMsgIndex]}
                </p>
              </div>
            )}

            {/* Skip link */}
            {welcomePhase === 'input' && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setShowWelcome(false)}
                  className="text-gray-500 hover:text-gray-300 text-sm transition-colors cursor-pointer"
                >
                  빈 드릴로 시작하기 &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top bar — hidden on mobile */}
      <div className="hidden md:flex bg-gray-800 border-b border-gray-700 px-4 py-2 items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
            <HockeyIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-white font-semibold text-lg hidden sm:block">Hockey Drill Studio</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={actions.save}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors cursor-pointer"
          >
            Save
          </button>
          <button
            onClick={() => setShowAIGenerate(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-md text-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Generate
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors cursor-pointer"
          >
            Export
          </button>
          {/* Sidebar toggle */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            title="Toggle Panel"
          >
            {showSidebar ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile floating top-right: Drills + 2D/3D grouped */}
      <div className="md:hidden fixed top-1 right-1 z-30 flex items-center gap-1">
        <button
          onClick={() => setShowAIGenerate(true)}
          className="relative flex items-center gap-1 px-2 py-1.5 bg-gradient-to-r from-purple-600/90 to-blue-600/90 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg shadow-lg cursor-pointer text-xs font-medium backdrop-blur-sm"
        >
          <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 animate-mobile-pulse" />
          <Sparkles className="w-3 h-3 relative z-10" />
          <span className="relative z-10">AI</span>
        </button>
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="relative flex items-center gap-1 px-2 py-1.5 bg-cyan-600/90 hover:bg-cyan-500 text-white rounded-lg shadow-lg cursor-pointer text-xs font-medium backdrop-blur-sm"
        >
          <span className="absolute inset-0 rounded-lg bg-cyan-500 animate-mobile-pulse" style={{ animationDelay: '1.5s' }} />
          <BookOpen className="w-3.5 h-3.5 relative z-10" />
          <span className="relative z-10">Drills</span>
        </button>
        <div className="flex bg-gray-700/90 backdrop-blur-sm rounded-lg overflow-hidden shadow-lg">
          <button
            onClick={() => { if (!state.is2D) actions.toggle2D(); }}
            className={`px-2 py-1.5 text-xs flex items-center gap-0.5 cursor-pointer ${
              state.is2D ? 'bg-blue-600 text-white' : 'text-gray-300'
            }`}
          >
            <Layout className="w-3 h-3" /> 2D
          </button>
          <button
            onClick={() => { if (state.is2D) actions.toggle2D(); }}
            className={`px-2 py-1.5 text-xs flex items-center gap-0.5 cursor-pointer ${
              !state.is2D ? 'bg-blue-600 text-white' : 'text-gray-300'
            }`}
          >
            <Monitor className="w-3 h-3" /> 3D
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Toolbar (desktop=sidebar, mobile=floating) */}
        <DrillToolbar state={state} actions={actions} />

        {/* Center: Rink view */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          <div className="flex-1 relative min-h-0">
            {/* 3D WebGL always rendered underneath */}
            <div className={`absolute inset-0 ${state.is2D ? 'opacity-0 pointer-events-none' : ''}`}>
              <RinkViewer />
            </div>

            {/* 2D SVG overlay */}
            {state.is2D && (
              <div className="absolute inset-0 bg-gray-850 flex items-center justify-center p-1 sm:p-2"
                   style={{ backgroundColor: '#1a1d23' }}>
                <div className="w-full h-full max-w-full max-h-full" style={{ aspectRatio: '200/85' }}>
                  {/* Rink background for 2D */}
                  <div className="relative w-full h-full bg-white/5 rounded-lg border border-gray-700 overflow-hidden">
                    <RinkBackground />
                    <div className="absolute inset-0">
                      <DrillEditor state={state} actions={actions} bridge={bridge} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Floating 2D/3D toggle — desktop only (mobile uses fixed bar above) */}
            <div className="hidden md:flex absolute top-2 right-2 z-20 bg-gray-700 rounded-lg overflow-hidden shadow-lg">
              <button
                onClick={() => { if (!state.is2D) actions.toggle2D(); }}
                className={`px-2 sm:px-3 py-1.5 text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  state.is2D ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Layout className="w-3 h-3" /> 2D
              </button>
              <button
                onClick={() => { if (state.is2D) actions.toggle2D(); }}
                className={`px-2 sm:px-3 py-1.5 text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  !state.is2D ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3 h-3" /> 3D
              </button>
            </div>

            {/* Drill description overlay */}
            {showDescription && state.drill.description && (
              <div className="absolute bottom-2 left-2 max-w-[50%] md:left-auto md:right-2 md:bottom-2 md:max-w-sm z-20 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-xl p-3 md:p-4 shadow-2xl animate-fade-in">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-sm font-semibold mb-1 truncate">{state.drill.name}</h3>
                    <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line">{state.drill.description}</p>
                  </div>
                  <button
                    onClick={() => setShowDescription(false)}
                    className="shrink-0 p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Animation Timeline — hidden on mobile */}
          <div className="hidden md:block">
            <AnimationTimeline state={state} actions={actions} bridge={bridge} />
          </div>

          {/* Playback controls */}
          <PlaybackControls state={state} actions={actions} bridge={bridge} />
        </div>

        {/* Right: Properties + Library — desktop */}
        <div className="hidden lg:flex w-72 flex-col border-l border-gray-700 bg-gray-800">
          <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '45%' }}>
            <DrillPropertiesPanel state={state} actions={actions} bridge={bridge} />
          </div>
          <div className="flex-1 min-h-0 border-t border-gray-700 overflow-hidden">
            <DrillLibrary
              currentDrillId={state.drill.id}
              onSelect={handleSelectDrill}
              onNew={handleNewDrill}
            />
          </div>
        </div>

        {/* Right: Properties + Library — mobile overlay */}
        {showSidebar && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              onClick={() => setShowSidebar(false)}
            />
            <div className="lg:hidden fixed right-0 top-0 bottom-0 w-72 z-40 flex flex-col bg-gray-800 shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                <span className="text-sm font-medium text-gray-200">Properties</span>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1 text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <DrillPropertiesPanel state={state} actions={actions} bridge={bridge} />
              </div>
              <div className="h-56 border-t border-gray-700 overflow-hidden">
                <DrillLibrary
                  currentDrillId={state.drill.id}
                  onSelect={handleSelectDrill}
                  onNew={handleNewDrill}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Export Dialog */}
      {showExport && (
        <ExportDialog
          state={state}
          bridge={bridge}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* AI Generate Dialog */}
      {showAIGenerate && (
        <AIGenerateDialog
          onDrillGenerated={handleAIDrillGenerated}
          onClose={() => setShowAIGenerate(false)}
        />
      )}
    </div>
  );
}

// Simple hockey stick icon
function HockeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 20 L12 4 L14 4 L14 14 L20 18 L18 20 L12 16 L6 20 Z" />
    </svg>
  );
}

// Simple 2D rink background SVG
function RinkBackground() {
  const w = 800, h = 340;
  // Rink proportions: 200x85 feet
  const cx = w / 2, cy = h / 2;
  const rinkW = w * 0.96, rinkH = h * 0.96;
  const rx = rinkW / 2, ry = rinkH / 2;
  const cr = rinkH * 0.33; // corner radius

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Ice surface */}
      <rect x={cx - rx} y={cy - ry} width={rinkW} height={rinkH} rx={cr} ry={cr}
            fill="#e8ecf0" opacity={0.15} />

      {/* Center line (red) */}
      <line x1={cx} y1={cy - ry} x2={cx} y2={cy + ry} stroke="#cc3333" strokeWidth={2} opacity={0.4} />

      {/* Blue lines */}
      <line x1={cx - rx * 0.25} y1={cy - ry} x2={cx - rx * 0.25} y2={cy + ry} stroke="#3355cc" strokeWidth={2} opacity={0.4} />
      <line x1={cx + rx * 0.25} y1={cy - ry} x2={cx + rx * 0.25} y2={cy + ry} stroke="#3355cc" strokeWidth={2} opacity={0.4} />

      {/* Goal lines */}
      <line x1={cx - rx * 0.89} y1={cy - ry + 10} x2={cx - rx * 0.89} y2={cy + ry - 10} stroke="#cc3333" strokeWidth={1} opacity={0.3} />
      <line x1={cx + rx * 0.89} y1={cy - ry + 10} x2={cx + rx * 0.89} y2={cy + ry - 10} stroke="#cc3333" strokeWidth={1} opacity={0.3} />

      {/* Center circle */}
      <circle cx={cx} cy={cy} r={ry * 0.35} fill="none" stroke="#3355cc" strokeWidth={1} opacity={0.3} />

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={3} fill="#3355cc" opacity={0.4} />

      {/* Faceoff circles */}
      {[[-0.69, 0.52], [-0.69, -0.52], [0.69, 0.52], [0.69, -0.52]].map(([fx, fz], i) => (
        <g key={i}>
          <circle cx={cx + rx * fx} cy={cy + ry * fz} r={ry * 0.35} fill="none" stroke="#cc3333" strokeWidth={1} opacity={0.25} />
          <circle cx={cx + rx * fx} cy={cy + ry * fz} r={4} fill="#cc3333" opacity={0.35} />
        </g>
      ))}

      {/* Goals (net + crease) — NHL: 6ft wide, ~4ft deep net, 6ft radius crease */}
      {(() => {
        const scale = rinkW / 200; // px per foot
        const goalHalfW = 3 * scale;
        const netDepth = 3.5 * scale;
        const creaseR = 6 * scale;
        const glLeft = cx - rx * 0.89;
        const glRight = cx + rx * 0.89;

        return (
          <>
            {/* Left goal */}
            <g>
              {/* Crease (semicircle toward center ice) */}
              <path
                d={`M ${glLeft} ${cy - creaseR} A ${creaseR} ${creaseR} 0 0 1 ${glLeft} ${cy + creaseR}`}
                fill="#cc3333" fillOpacity={0.08} stroke="#cc3333" strokeWidth={1} opacity={0.35}
              />
              {/* Net (U-shape behind goal line) */}
              <rect
                x={glLeft - netDepth} y={cy - goalHalfW}
                width={netDepth} height={goalHalfW * 2}
                rx={2} ry={2}
                fill="#cc3333" fillOpacity={0.06} stroke="#cc3333" strokeWidth={1.5} opacity={0.5}
              />
              {/* Goal posts */}
              <line x1={glLeft} y1={cy - goalHalfW} x2={glLeft} y2={cy + goalHalfW}
                    stroke="#ff4444" strokeWidth={2.5} opacity={0.7} />
            </g>
            {/* Right goal */}
            <g>
              {/* Crease */}
              <path
                d={`M ${glRight} ${cy - creaseR} A ${creaseR} ${creaseR} 0 0 0 ${glRight} ${cy + creaseR}`}
                fill="#cc3333" fillOpacity={0.08} stroke="#cc3333" strokeWidth={1} opacity={0.35}
              />
              {/* Net */}
              <rect
                x={glRight} y={cy - goalHalfW}
                width={netDepth} height={goalHalfW * 2}
                rx={2} ry={2}
                fill="#cc3333" fillOpacity={0.06} stroke="#cc3333" strokeWidth={1.5} opacity={0.5}
              />
              {/* Goal posts */}
              <line x1={glRight} y1={cy - goalHalfW} x2={glRight} y2={cy + goalHalfW}
                    stroke="#ff4444" strokeWidth={2.5} opacity={0.7} />
            </g>
          </>
        );
      })()}

    </svg>
  );
}
