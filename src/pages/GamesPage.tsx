import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Calendar, Plus, Clock, MapPin, Trophy, Filter } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Team {
  id: string;
  name: string;
  logo_url?: string;
}

interface Game {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  home_score: number;
  away_score: number;
  scheduled_at: string;
  status: string;
  venue: string;
  period: number;
  period_time: string;
  overtime: boolean;
  shootout: boolean;
  season: string;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: '예정',
  live: '진행중',
  final: '종료',
  cancelled: '취소',
  postponed: '연기',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-400',
  live: 'bg-red-500/20 text-red-400 animate-pulse',
  final: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-yellow-500/20 text-yellow-400',
  postponed: 'bg-orange-500/20 text-orange-400',
};

export default function GamesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'live' | 'final'>('all');
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    homeTeamId: '', awayTeamId: '', scheduledAt: '', venue: '', season: '2025-2026',
  });

  const fetchGames = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/games?${params}`);
      const data = await res.json();
      setGames(data.games || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filter]);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams');
      const data = await res.json();
      setMyTeams(data.teams || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchGames(); }, [fetchGames]);
  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const handleCreate = async () => {
    if (!form.homeTeamId || !form.awayTeamId || !form.scheduledAt) return;
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeamId: form.homeTeamId,
          awayTeamId: form.awayTeamId,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          venue: form.venue,
          season: form.season,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ homeTeamId: '', awayTeamId: '', scheduledAt: '', venue: '', season: '2025-2026' });
        fetchGames();
      }
    } catch { /* ignore */ }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 pb-28 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-blue-400" /> 경기 일정
            </h1>
            <p className="text-sm text-gray-400 mt-1">팀 경기를 관리하고 스코어를 기록하세요</p>
          </div>
          {myTeams.length > 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> 새 경기
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {(['all', 'scheduled', 'live', 'final'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? '전체' : STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Create Game Modal */}
        {showCreate && (
          <div className="mb-6 bg-gray-800 rounded-xl border border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">새 경기 만들기</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">홈 팀</label>
                <select value={form.homeTeamId} onChange={e => setForm(f => ({ ...f, homeTeamId: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">선택...</option>
                  {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">원정 팀</label>
                <select value={form.awayTeamId} onChange={e => setForm(f => ({ ...f, awayTeamId: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">선택...</option>
                  {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">일시</label>
                <input type="datetime-local" value={form.scheduledAt}
                  onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">장소</label>
                <input type="text" value={form.venue} placeholder="링크 이름"
                  onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white cursor-pointer">취소</button>
              <button onClick={handleCreate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg cursor-pointer">만들기</button>
            </div>
          </div>
        )}

        {/* Games List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">로딩중...</div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">아직 등록된 경기가 없습니다</p>
            {myTeams.length > 0 && (
              <button onClick={() => setShowCreate(true)}
                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg cursor-pointer">
                첫 경기 만들기
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {games.map(game => (
              <button
                key={game.id}
                onClick={() => navigate(`/games/${game.id}`)}
                className="w-full bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 p-4 cursor-pointer transition-colors text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(game.scheduled_at)}
                    <Clock className="w-3.5 h-3.5 ml-1" />
                    {formatTime(game.scheduled_at)}
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[game.status]}`}>
                    {STATUS_LABELS[game.status]}
                    {game.status === 'live' && ` P${game.period}`}
                  </span>
                </div>

                {/* Scoreboard */}
                <div className="flex items-center justify-between">
                  <div className="flex-1 text-right pr-4">
                    <p className="text-sm font-medium text-white">{game.homeTeam?.name || '홈'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">HOME</p>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 rounded-lg min-w-[100px] justify-center">
                    <span className={`text-xl font-bold ${game.home_score > game.away_score ? 'text-white' : 'text-gray-400'}`}>
                      {game.status === 'scheduled' ? '-' : game.home_score}
                    </span>
                    <span className="text-gray-600 text-sm">:</span>
                    <span className={`text-xl font-bold ${game.away_score > game.home_score ? 'text-white' : 'text-gray-400'}`}>
                      {game.status === 'scheduled' ? '-' : game.away_score}
                    </span>
                  </div>
                  <div className="flex-1 pl-4">
                    <p className="text-sm font-medium text-white">{game.awayTeam?.name || '원정'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">AWAY</p>
                  </div>
                </div>

                {game.venue && (
                  <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
                    <MapPin className="w-3 h-3" /> {game.venue}
                  </div>
                )}
                {(game.overtime || game.shootout) && (
                  <div className="mt-2 text-[10px] text-amber-400 font-medium">
                    {game.shootout ? 'SO' : 'OT'}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
