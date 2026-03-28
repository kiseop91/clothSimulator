import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Monitor, PanelRightOpen, PanelRightClose, X, BookOpen, Sparkles, SmartphoneIcon, Wand2, Share2, Copy, Check as CheckIcon, Link2 } from 'lucide-react';
import { useRenderer } from '../context/RendererContext';
import { useAuth } from '../context/AuthContext';
import { useDrillStore } from '../context/StorageContext';
import { useSubscription } from '../hooks/useSubscription';
import { useDrillEditor } from '../hooks/useDrillEditor';
import { createEmptyDrill, type Drill } from '../types/drill';
import { generateDrill } from '../lib/aiGenerate';
import { serializeDrill } from '../lib/animationSerializer';
import { supabase } from '../lib/supabase';
import { checkAIQuota } from '../lib/aiUsage';
import RinkViewer from '../components/RinkViewer';
import DrillEditor from '../components/DrillEditor';
import DrillToolbar from '../components/DrillToolbar';
import DrillPropertiesPanel from '../components/DrillPropertiesPanel';
import PlaybackControls from '../components/PlaybackControls';
import DrillLibrary from '../components/DrillLibrary';
import AnimationTimeline from '../components/AnimationTimeline';
import ExportDialog from '../components/ExportDialog';
import AIGenerateDialog from '../components/AIGenerateDialog';
import AIAnimateBar from '../components/AIAnimateBar';
import SessionBuilder from '../components/SessionBuilder';

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

export default function EditorPage() {
  const { drillId } = useParams<{ drillId?: string }>();
  const navigate = useNavigate();
  const { bridge } = useRenderer();
  const { user } = useAuth();
  const store = useDrillStore();
  const { tier, isProUser } = useSubscription();

  const [showExport, setShowExport] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'drill' | 'session'>('drill');
  const [showDescription, setShowDescription] = useState(false);
  const [showAIAnimate, setShowAIAnimate] = useState(false);
  const [aiSelectedIds, setAISelectedIds] = useState<string[]>([]);
  const isPortraitMobile = useIsPortraitMobile();

  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const [showWelcome, setShowWelcome] = useState(!drillId);
  const [welcomePhase, setWelcomePhase] = useState<'input' | 'loading' | 'rotate'>('input');
  const [pendingDrill, setPendingDrill] = useState<Drill | null>(null);
  const [welcomePrompt, setWelcomePrompt] = useState('');
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  const [welcomeMsgIndex, setWelcomeMsgIndex] = useState(0);
  const [drillLoaded, setDrillLoaded] = useState(false);

  const initialDrillRef = useRef<Drill>(createEmptyDrill());
  const { state, actions } = useDrillEditor(initialDrillRef.current);

  // Load drill from store if drillId specified
  useEffect(() => {
    if (!drillId || drillLoaded) return;
    (async () => {
      const drill = await store.loadDrill(drillId);
      if (drill) {
        actions.setDrill(drill);
        setShowWelcome(false);
      }
      setDrillLoaded(true);
    })();
  }, [drillId, store, actions, drillLoaded]);

  // Auto-save debounced
  useEffect(() => {
    const timeout = setTimeout(() => {
      store.saveDrill(state.drill);
    }, 500);
    return () => clearTimeout(timeout);
  }, [state.drill, store]);

  // Playback animation loop
  useEffect(() => {
    if (!state.isPlaying) return;
    let raf: number;
    const startTime = performance.now();
    const startT = state.playbackTime;
    const durationMs = (state.drill.duration || 5) * 1000;
    const speed = state.playbackSpeed;
    const looping = state.isLooping;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      let t = startT + (elapsed * speed) / durationMs;
      if (t >= 1.0) t = looping ? t % 1.0 : 1.0;
      actions.setPlaybackTime(t);
      bridge.setPlaybackTime(t);
      if (t < 1.0 || looping) raf = requestAnimationFrame(tick);
      else actions.setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.isPlaying]);

  // Sync to WASM
  useEffect(() => { bridge.syncTokens(state.drill.objects); }, [state.drill.objects, bridge]);
  useEffect(() => { bridge.syncPaths(state.drill.paths); }, [state.drill.paths, bridge]);
  useEffect(() => { bridge.setRinkLayout(state.drill.rinkLayout); }, [state.drill.rinkLayout, bridge]);
  useEffect(() => {
    try { bridge.syncAnimation(state.drill.keyframes, state.drill.objects); } catch {}
  }, [state.drill.keyframes, state.drill.objects, bridge]);

  useEffect(() => {
    if (!state.is2D) {
      bridge.syncTokens(state.drill.objects);
      bridge.syncPaths(state.drill.paths);
      try { bridge.syncAnimation(state.drill.keyframes, state.drill.objects); } catch {}
      bridge.setPlaybackTime(state.playbackTime);
    }
  }, [state.is2D]);

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
    const interval = setInterval(() => setWelcomeMsgIndex(i => (i + 1) % WELCOME_LOADING_MESSAGES.length), 2500);
    return () => clearInterval(interval);
  }, [welcomePhase]);

  const wasMobilePortraitRef = useRef(false);
  if (isPortraitMobile) wasMobilePortraitRef.current = true;

  useEffect(() => {
    if (isPortraitMobile || !wasMobilePortraitRef.current) return;
    if (pendingDrill) {
      store.saveDrill(pendingDrill);
      actions.setDrill(pendingDrill);
      actions.setPlaybackTime(0);
      bridge.setPlaybackTime(0);
      setTimeout(() => actions.setPlaying(true), 300);
      if (pendingDrill.description) setShowDescription(true);
      setPendingDrill(null);
    }
    setShowWelcome(false);
    setWelcomePhase('input');
    setWelcomePrompt('');
    try { (screen.orientation as any)?.lock?.('landscape').catch(() => {}); } catch {}
  }, [isPortraitMobile, pendingDrill]);

  const handleShare = useCallback(async () => {
    setShareLoading(true);
    setShareError(null);
    setShareUrl(null);
    setShareCopied(false);

    const result = serializeDrill(state.drill);
    if ('error' in result) {
      setShareError(result.error);
      setShareLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setShareError('로그인이 필요합니다'); setShareLoading(false); return; }

      const res = await fetch('/api/drill-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ drillJson: result.payload, title: state.drill.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShareError(data.error || '공유 링크 생성 실패');
      } else {
        setShareUrl(window.location.origin + data.shareUrl);
      }
    } catch {
      setShareError('네트워크 오류. 다시 시도해주세요.');
    }
    setShareLoading(false);
  }, [state.drill]);

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Fallback: select input
      const input = document.querySelector<HTMLInputElement>('#share-url-input');
      if (input) { input.select(); document.execCommand('copy'); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }
    }
  }, [shareUrl]);

  const handleWelcomeGenerate = useCallback(async () => {
    if (!welcomePrompt.trim()) return;

    // Check AI quota for free users
    if (user && !isProUser) {
      const { allowed, remaining } = await checkAIQuota(user.id);
      if (!allowed) {
        setWelcomeError(`일일 AI 사용 한도 초과 (5회/일). Pro로 업그레이드하세요.`);
        return;
      }
    }

    setWelcomePhase('loading');
    setWelcomeError(null);
    setWelcomeMsgIndex(0);
    try {
      const drill = await generateDrill(welcomePrompt.trim());
      drill.source = 'ai';
      if (isPortraitMobile) {
        setPendingDrill(drill);
        setWelcomePhase('rotate');
      } else {
        await store.saveDrill(drill);
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
  }, [welcomePrompt, isPortraitMobile, actions, bridge, store, user, isProUser]);

  const WELCOME_SUGGESTIONS = ['Breakout', 'Power play', '2-on-1 rush', 'Cycling', 'Penalty kill', 'Neutral zone regroup', 'One-timer setup', 'Dump and chase'];

  const handleSelectDrill = useCallback((drill: Drill) => {
    actions.setDrill(drill);
    setShowSidebar(false);
  }, [actions]);

  const handleNewDrill = useCallback(async (drill: Drill) => {
    await store.saveDrill(drill);
    actions.setDrill(drill);
  }, [actions, store]);

  const handleAIDrillGenerated = useCallback(async (drill: Drill) => {
    drill.source = 'ai';
    await store.saveDrill(drill);
    actions.setDrill(drill);
    setShowAIGenerate(false);
    actions.setPlaybackTime(0);
    bridge.setPlaybackTime(0);
    setTimeout(() => actions.setPlaying(true), 300);
    if (drill.description) setShowDescription(true);
  }, [actions, bridge, store]);

  // AI quota display for free users
  const [aiRemaining, setAIRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (user && !isProUser) {
      checkAIQuota(user.id).then(({ remaining }) => setAIRemaining(remaining));
    }
  }, [user, isProUser, state.drill]); // refresh after drill changes (potential AI use)

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 text-gray-200">
      {/* Portrait mobile: AI-first flow overlay */}
      {isPortraitMobile && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center text-center">
          <div className="pt-12 pb-6 flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <HockeyIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white font-bold text-xl">Hockey Drill Studio</h1>
            <p className="text-gray-500 text-xs">AI-powered drill designer</p>
          </div>
          <div className="flex-1 w-full px-6 flex flex-col">
            {welcomePhase === 'input' && (
              <div className="flex-1 flex flex-col gap-4">
                <p className="text-gray-400 text-sm">어떤 드릴을 만들까요?</p>
                <textarea value={welcomePrompt} onChange={e => setWelcomePrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleWelcomeGenerate(); } }} placeholder="예: 3대2 러시 + 원타이머 마무리" rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500 transition-colors" autoFocus />
                <div className="flex flex-wrap gap-2 justify-center">
                  {WELCOME_SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => setWelcomePrompt(prev => prev ? `${prev}, ${s.toLowerCase()}` : s)} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-full border border-gray-700 transition-colors cursor-pointer">{s}</button>
                  ))}
                </div>
                {welcomeError && <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">{welcomeError}</p>}
                <div className="mt-auto pb-8">
                  <button onClick={handleWelcomeGenerate} disabled={!welcomePrompt.trim()} className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-purple-500/20">
                    <Sparkles className="w-4 h-4" /> Generate Drill
                  </button>
                </div>
              </div>
            )}
            {welcomePhase === 'loading' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-gray-900 animate-pulse" /></div>
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/50 animate-ping" />
                </div>
                <p className="text-gray-300 text-sm animate-fade-in" key={welcomeMsgIndex}>{WELCOME_LOADING_MESSAGES[welcomeMsgIndex]}</p>
              </div>
            )}
            {welcomePhase === 'rotate' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <SmartphoneIcon className="w-16 h-16 text-blue-400 animate-bounce" style={{ transform: 'rotate(90deg)' }} />
                <div className="space-y-2">
                  <p className="text-white text-lg font-semibold">드릴이 준비되었습니다!</p>
                  <p className="text-gray-400 text-sm">기기를 가로로 돌려주세요<br />자동으로 재생이 시작됩니다</p>
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
                {!isProUser && aiRemaining !== null && (
                  <p className="text-xs text-center text-gray-500">남은 AI 생성: {aiRemaining}/5</p>
                )}
                <textarea value={welcomePrompt} onChange={e => setWelcomePrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleWelcomeGenerate(); } }} placeholder="예: 3대2 러시 + 원타이머 마무리" rows={3} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500 transition-colors" autoFocus />
                <div className="flex flex-wrap gap-2 justify-center">
                  {WELCOME_SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => setWelcomePrompt(prev => prev ? `${prev}, ${s.toLowerCase()}` : s)} className="px-3 py-1.5 text-xs bg-gray-900 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-full border border-gray-600 transition-colors cursor-pointer">{s}</button>
                  ))}
                </div>
                {welcomeError && <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">{welcomeError}</p>}
                <button onClick={handleWelcomeGenerate} disabled={!welcomePrompt.trim()} className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-purple-500/20">
                  <Sparkles className="w-4 h-4" /> Generate Drill
                </button>
              </div>
            )}
            {welcomePhase === 'loading' && (
              <div className="flex flex-col items-center justify-center gap-6 py-16">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-gray-900 animate-pulse" /></div>
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/50 animate-ping" />
                </div>
                <p className="text-gray-300 text-sm animate-fade-in" key={welcomeMsgIndex}>{WELCOME_LOADING_MESSAGES[welcomeMsgIndex]}</p>
              </div>
            )}
            {welcomePhase === 'input' && (
              <div className="mt-6 text-center">
                <button onClick={() => setShowWelcome(false)} className="text-gray-500 hover:text-gray-300 text-sm transition-colors cursor-pointer">
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
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center cursor-pointer" onClick={() => navigate('/dashboard')}>
            <HockeyIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-white font-semibold text-lg hidden sm:block">Hockey Drill Studio</h1>        </div>
        <div className="flex items-center gap-2">
          {!isProUser && aiRemaining !== null && (
            <span className="text-xs text-gray-500 mr-2">AI: {aiRemaining}/5</span>
          )}
          <button onClick={() => store.saveDrill(state.drill)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors cursor-pointer">Save</button>
          <button onClick={() => setShowAIGenerate(true)} className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-md text-sm transition-colors cursor-pointer flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> AI Generate
          </button>
          <button onClick={() => { if (showAIAnimate) { setShowAIAnimate(false); setAISelectedIds([]); } else { actions.setPlaying(false); setShowAIAnimate(true); } }} disabled={state.drill.objects.length === 0} className={`px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${showAIAnimate ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40 disabled:cursor-not-allowed'}`}>
            <Wand2 className="w-3.5 h-3.5" /> AI Animate
          </button>
          <button onClick={() => { setShowShare(true); handleShare(); }} disabled={state.drill.objects.length === 0} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md text-sm transition-colors cursor-pointer flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          <button onClick={() => setShowExport(true)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors cursor-pointer">Export</button>
          <button onClick={() => setShowSidebar(!showSidebar)} className="lg:hidden p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer" title="Toggle Panel">
            {showSidebar ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile floating top-right */}
      <div className="md:hidden fixed top-1 right-1 z-30 flex items-center gap-1">
        <button onClick={() => setShowAIGenerate(true)} className="relative flex items-center gap-1 px-2 py-1.5 bg-gradient-to-r from-purple-600/90 to-blue-600/90 text-white rounded-lg shadow-lg cursor-pointer text-xs font-medium backdrop-blur-sm">
          <Sparkles className="w-3 h-3 relative z-10" /><span className="relative z-10">AI</span>
        </button>
        <button onClick={() => setShowSidebar(!showSidebar)} className="relative flex items-center gap-1 px-2 py-1.5 bg-cyan-600/90 text-white rounded-lg shadow-lg cursor-pointer text-xs font-medium backdrop-blur-sm">
          <BookOpen className="w-3.5 h-3.5 relative z-10" /><span className="relative z-10">Drills</span>
        </button>
        <div className="flex bg-gray-700/90 backdrop-blur-sm rounded-lg overflow-hidden shadow-lg">
          <button onClick={() => { if (!state.is2D) actions.toggle2D(); }} className={`px-2 py-1.5 text-xs flex items-center gap-0.5 cursor-pointer ${state.is2D ? 'bg-blue-600 text-white' : 'text-gray-300'}`}>
            <Layout className="w-3 h-3" /> 2D
          </button>
          <button onClick={() => { if (state.is2D) actions.toggle2D(); }} className={`px-2 py-1.5 text-xs flex items-center gap-0.5 cursor-pointer ${!state.is2D ? 'bg-blue-600 text-white' : 'text-gray-300'}`}>
            <Monitor className="w-3 h-3" /> 3D
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        <DrillToolbar state={state} actions={actions} />

        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          <div className="flex-1 relative min-h-0">
            <div className={`absolute inset-0 ${state.is2D ? 'opacity-0 pointer-events-none' : ''}`}>
              <RinkViewer />
            </div>
            {state.is2D && (
              <div className="absolute inset-0 bg-gray-850 flex items-center justify-center p-1 sm:p-2" style={{ backgroundColor: '#1a1d23' }}>
                <div className="w-full h-full max-w-full max-h-full" style={{ aspectRatio: '200/85' }}>
                  <div className="relative w-full h-full bg-white/5 rounded-lg border border-gray-700 overflow-hidden">
                    <RinkBackground />
                    <div className="absolute inset-0">
                      <DrillEditor state={state} actions={actions} bridge={bridge} isAIAnimateMode={showAIAnimate} aiSelectedIds={aiSelectedIds} onAISelectionChange={setAISelectedIds} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="hidden md:flex absolute top-2 right-2 z-20 bg-gray-700 rounded-lg overflow-hidden shadow-lg">
              <button onClick={() => { if (!state.is2D) actions.toggle2D(); }} className={`px-2 sm:px-3 py-1.5 text-xs flex items-center gap-1 transition-colors cursor-pointer ${state.is2D ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                <Layout className="w-3 h-3" /> 2D
              </button>
              <button onClick={() => { if (state.is2D) actions.toggle2D(); }} className={`px-2 sm:px-3 py-1.5 text-xs flex items-center gap-1 transition-colors cursor-pointer ${!state.is2D ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                <Monitor className="w-3 h-3" /> 3D
              </button>
            </div>
            {showDescription && state.drill.description && (
              <div className="absolute bottom-2 left-2 max-w-[50%] md:left-auto md:right-2 md:bottom-2 md:max-w-sm z-20 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-xl p-3 md:p-4 shadow-2xl animate-fade-in">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-sm font-semibold mb-1 truncate">{state.drill.name}</h3>
                    <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line">{state.drill.description}</p>
                  </div>
                  <button onClick={() => setShowDescription(false)} className="shrink-0 p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <AnimationTimeline state={state} actions={actions} bridge={bridge} />
          </div>
          {showAIAnimate && !showWelcome && (
            <AIAnimateBar state={state} actions={actions} bridge={bridge} aiSelectedIds={aiSelectedIds} onClose={() => { setShowAIAnimate(false); setAISelectedIds([]); }} />
          )}
          <PlaybackControls state={state} actions={actions} bridge={bridge} />
        </div>

        {/* Right sidebar — desktop */}
        <div className="hidden lg:flex w-72 flex-col border-l border-gray-700 bg-gray-800">
          <div className="flex border-b border-gray-700 shrink-0">
            <button onClick={() => setSidebarMode('drill')} className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${sidebarMode === 'drill' ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-gray-200'}`}>Drill</button>
            <button onClick={() => setSidebarMode('session')} className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${sidebarMode === 'session' ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-gray-200'}`}>Session</button>
          </div>
          {sidebarMode === 'drill' ? (
            <>
              <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '45%' }}>
                <DrillPropertiesPanel state={state} actions={actions} bridge={bridge} />
              </div>
              <div className="flex-1 min-h-0 border-t border-gray-700 overflow-hidden">
                <DrillLibrary currentDrillId={state.drill.id} onSelect={handleSelectDrill} onNew={handleNewDrill} />
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden">
              <SessionBuilder onLoadDrill={handleSelectDrill} />
            </div>
          )}
        </div>

        {/* Right sidebar — mobile overlay */}
        {showSidebar && (
          <>
            <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setShowSidebar(false)} />
            <div className="lg:hidden fixed right-0 top-0 bottom-0 w-72 z-40 flex flex-col bg-gray-800 shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                <div className="flex gap-2">
                  <button onClick={() => setSidebarMode('drill')} className={`text-xs font-medium px-2 py-1 rounded cursor-pointer ${sidebarMode === 'drill' ? 'text-white bg-gray-700' : 'text-gray-400'}`}>Drill</button>
                  <button onClick={() => setSidebarMode('session')} className={`text-xs font-medium px-2 py-1 rounded cursor-pointer ${sidebarMode === 'session' ? 'text-white bg-gray-700' : 'text-gray-400'}`}>Session</button>
                </div>
                <button onClick={() => setShowSidebar(false)} className="p-1 text-gray-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              {sidebarMode === 'drill' ? (
                <>
                  <div className="flex-1 overflow-hidden flex flex-col"><DrillPropertiesPanel state={state} actions={actions} bridge={bridge} /></div>
                  <div className="h-56 border-t border-gray-700 overflow-hidden"><DrillLibrary currentDrillId={state.drill.id} onSelect={handleSelectDrill} onNew={handleNewDrill} /></div>
                </>
              ) : (
                <div className="flex-1 min-h-0 overflow-hidden"><SessionBuilder onLoadDrill={handleSelectDrill} /></div>
              )}
            </div>
          </>
        )}
      </div>

      {showExport && <ExportDialog state={state} bridge={bridge} onClose={() => setShowExport(false)} />}
      {showAIGenerate && <AIGenerateDialog onDrillGenerated={handleAIDrillGenerated} onClose={() => setShowAIGenerate(false)} />}

      {/* Share Modal */}
      {showShare && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowShare(false)}>
          <div className="bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-400" /> 드릴 공유
              </h3>
              <button onClick={() => setShowShare(false)} className="p-1 text-gray-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            {shareLoading && (
              <div className="flex items-center justify-center py-6">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-sm text-gray-400">링크 생성 중...</span>
              </div>
            )}

            {shareError && (
              <div className="bg-red-900/30 border border-red-800/30 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{shareError}</p>
                {shareError.includes('한도') && (
                  <button onClick={() => { setShowShare(false); navigate('/pricing'); }} className="mt-2 text-xs text-amber-400 hover:text-amber-300 cursor-pointer">Pro로 업그레이드 →</button>
                )}
              </div>
            )}

            {shareUrl && !shareLoading && (
              <>
                <p className="text-xs text-gray-400">이 링크를 팀 그룹채팅에 공유하세요. 플레이어는 로그인 없이 모바일에서 바로 볼 수 있습니다.</p>
                <div className="flex items-center gap-2">
                  <input
                    id="share-url-input"
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none"
                  />
                  <button
                    onClick={handleCopyShareUrl}
                    className={`px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all ${
                      shareCopied ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {shareCopied ? <CheckIcon className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {shareCopied && <p className="text-xs text-green-400">링크가 복사되었습니다!</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HockeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 20 L12 4 L14 4 L14 14 L20 18 L18 20 L12 16 L6 20 Z" />
    </svg>
  );
}

function RinkBackground() {
  const w = 800, h = 340;
  const cx = w / 2, cy = h / 2;
  const rinkW = w * 0.96, rinkH = h * 0.96;
  const rx = rinkW / 2, ry = rinkH / 2;
  const cr = rinkH * 0.33;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
      <rect x={cx - rx} y={cy - ry} width={rinkW} height={rinkH} rx={cr} ry={cr} fill="#e8ecf0" opacity={0.15} />
      <line x1={cx} y1={cy - ry} x2={cx} y2={cy + ry} stroke="#cc3333" strokeWidth={2} opacity={0.4} />
      <line x1={cx - rx * 0.25} y1={cy - ry} x2={cx - rx * 0.25} y2={cy + ry} stroke="#3355cc" strokeWidth={2} opacity={0.4} />
      <line x1={cx + rx * 0.25} y1={cy - ry} x2={cx + rx * 0.25} y2={cy + ry} stroke="#3355cc" strokeWidth={2} opacity={0.4} />
      <line x1={cx - rx * 0.89} y1={cy - ry + 10} x2={cx - rx * 0.89} y2={cy + ry - 10} stroke="#cc3333" strokeWidth={1} opacity={0.3} />
      <line x1={cx + rx * 0.89} y1={cy - ry + 10} x2={cx + rx * 0.89} y2={cy + ry - 10} stroke="#cc3333" strokeWidth={1} opacity={0.3} />
      <circle cx={cx} cy={cy} r={ry * 0.35} fill="none" stroke="#3355cc" strokeWidth={1} opacity={0.3} />
      <circle cx={cx} cy={cy} r={3} fill="#3355cc" opacity={0.4} />
      {[[-0.69, 0.52], [-0.69, -0.52], [0.69, 0.52], [0.69, -0.52]].map(([fx, fz], i) => (
        <g key={i}>
          <circle cx={cx + rx * fx} cy={cy + ry * fz} r={ry * 0.35} fill="none" stroke="#cc3333" strokeWidth={1} opacity={0.25} />
          <circle cx={cx + rx * fx} cy={cy + ry * fz} r={4} fill="#cc3333" opacity={0.35} />
        </g>
      ))}
      {(() => {
        const scale = rinkW / 200;
        const goalHalfW = 3 * scale;
        const netDepth = 3.5 * scale;
        const creaseR = 6 * scale;
        const glLeft = cx - rx * 0.89;
        const glRight = cx + rx * 0.89;
        return (
          <>
            <g>
              <path d={`M ${glLeft} ${cy - creaseR} A ${creaseR} ${creaseR} 0 0 1 ${glLeft} ${cy + creaseR}`} fill="#cc3333" fillOpacity={0.08} stroke="#cc3333" strokeWidth={1} opacity={0.35} />
              <rect x={glLeft - netDepth} y={cy - goalHalfW} width={netDepth} height={goalHalfW * 2} rx={2} ry={2} fill="#cc3333" fillOpacity={0.06} stroke="#cc3333" strokeWidth={1.5} opacity={0.5} />
              <line x1={glLeft} y1={cy - goalHalfW} x2={glLeft} y2={cy + goalHalfW} stroke="#ff4444" strokeWidth={2.5} opacity={0.7} />
            </g>
            <g>
              <path d={`M ${glRight} ${cy - creaseR} A ${creaseR} ${creaseR} 0 0 0 ${glRight} ${cy + creaseR}`} fill="#cc3333" fillOpacity={0.08} stroke="#cc3333" strokeWidth={1} opacity={0.35} />
              <rect x={glRight} y={cy - goalHalfW} width={netDepth} height={goalHalfW * 2} rx={2} ry={2} fill="#cc3333" fillOpacity={0.06} stroke="#cc3333" strokeWidth={1.5} opacity={0.5} />
              <line x1={glRight} y1={cy - goalHalfW} x2={glRight} y2={cy + goalHalfW} stroke="#ff4444" strokeWidth={2.5} opacity={0.7} />
            </g>
          </>
        );
      })()}
    </svg>
  );
}
