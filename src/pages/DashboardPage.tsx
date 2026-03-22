import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Plus, FileText, Sparkles, BookOpen, Clock, Trash2, LogOut, User, Crown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDrillStore } from '../context/StorageContext';
import { useSubscription } from '../hooks/useSubscription';
import type { Drill, PracticeSession } from '../types/drill';
import { createEmptyDrill } from '../types/drill';

export default function DashboardPage() {
  const { user, profile, signOut } = useAuth();
  const store = useDrillStore();
  const { isProUser } = useSubscription();
  const navigate = useNavigate();

  const [drills, setDrills] = useState<Drill[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'drills' | 'sessions'>('drills');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [d, s] = await Promise.all([store.loadDrills(), store.loadSessions()]);
    setDrills(d);
    setSessions(s);
    setLoading(false);
  }, [store]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleNewDrill = async () => {
    if (!isProUser && drills.length >= 3) {
      if (confirm('Free 플랜은 최대 3개 드릴까지 생성 가능합니다. Pro로 업그레이드하시겠습니까?')) {
        navigate('/pricing');
      }
      return;
    }
    const drill = createEmptyDrill();
    drill.source = 'user';
    await store.saveDrill(drill);
    navigate(`/editor/${drill.id}`);
  };

  const handleDeleteDrill = async (id: string) => {
    if (!confirm('이 드릴을 삭제하시겠습니까?')) return;
    await store.deleteDrill(id);
    refresh();
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('이 세션을 삭제하시겠습니까?')) return;
    await store.deleteSession(id);
    refresh();
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });

  return (
    <div className="h-screen bg-gray-900 text-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5 text-white">
                <path d="M4 20 L12 4 L14 4 L14 14 L20 18 L18 20 L12 16 L6 20 Z" />
              </svg>
            </div>
            <h1 className="text-white font-semibold text-sm sm:text-lg truncate">Hockey Drill Studio</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isProUser && (
              <button
                onClick={() => navigate('/pricing')}
                className="px-2 sm:px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-[10px] sm:text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer active:scale-95"
              >
                <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden xs:inline">업그레이드</span>
                <span className="xs:hidden">Pro</span>
              </button>
            )}
            <button
              onClick={() => navigate('/account')}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg cursor-pointer active:bg-gray-600"
              title="계정"
            >
              <User className="w-4 h-4" />
            </button>
            <button
              onClick={() => { signOut(); navigate('/'); }}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg cursor-pointer active:bg-gray-600"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-28 sm:pb-6 flex-1 overflow-y-auto">
        {/* Welcome */}
        <div className="mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            안녕하세요, {profile?.display_name || user?.email?.split('@')[0]}!
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            {isProUser ? (
              <span className="text-amber-400 flex items-center gap-1"><Crown className="w-3.5 h-3.5" /> Pro 플랜</span>
            ) : (
              <span>Free 플랜 — 드릴 {drills.length}/3</span>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-700 mb-3 sm:mb-4">
          <button
            onClick={() => setTab('drills')}
            className={`pb-2 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === 'drills' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent'
            }`}
          >
            드릴 ({drills.length})
          </button>
          <button
            onClick={() => setTab('sessions')}
            className={`pb-2 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === 'sessions' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent'
            }`}
          >
            세션 ({sessions.length})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'drills' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {/* New drill card */}
            <button
              onClick={handleNewDrill}
              className="border-2 border-dashed border-gray-700 hover:border-blue-500 active:border-blue-400 rounded-xl p-5 sm:p-6 flex flex-col items-center gap-2 text-gray-500 hover:text-blue-400 transition-colors cursor-pointer"
            >
              <Plus className="w-7 h-7 sm:w-8 sm:h-8" />
              <span className="text-sm font-medium">새 드릴</span>
            </button>

            {drills.map(drill => (
              <div
                key={drill.id}
                onClick={() => navigate(`/editor/${drill.id}`)}
                className="bg-gray-800 border border-gray-700 hover:border-gray-600 active:bg-gray-750 rounded-xl p-3.5 sm:p-4 cursor-pointer transition-colors relative group"
              >
                <div className="flex items-start justify-between mb-1.5 sm:mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {drill.source === 'ai' ? (
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                    ) : drill.source === 'preset' ? (
                      <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <h3 className="text-sm font-medium text-white truncate">{drill.name}</h3>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteDrill(drill.id); }}
                    className="p-1.5 -mr-1 text-gray-600 hover:text-red-400 active:text-red-300 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{drill.description || 'No description'}</p>
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  <span>{drill.objects.length} tokens</span>
                  <span>{drill.paths.length} paths</span>
                  <span className="ml-auto flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(drill.updatedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {sessions.length === 0 ? (
              <p className="text-gray-500 text-sm col-span-full text-center py-8">아직 세션이 없습니다</p>
            ) : sessions.map(session => (
              <div
                key={session.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-3.5 sm:p-4 relative group"
              >
                <div className="flex items-start justify-between mb-1.5">
                  <h3 className="text-sm font-medium text-white truncate">{session.name}</h3>
                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    className="p-1.5 -mr-1 text-gray-600 hover:text-red-400 active:text-red-300 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  {session.blocks.length} blocks — {session.targetDurationMinutes}분
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
