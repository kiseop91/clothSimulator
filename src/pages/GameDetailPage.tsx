import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Play, Square, Flag } from 'lucide-react';

interface Team { id: string; name: string; logo_url?: string; }
interface GameEvent {
  id: number; event_type: string; team_id: string; player_name: string;
  period: number; time_in_period: string; details: Record<string, any>;
}
interface PlayerStats {
  id: number; team_id: string; player_name: string;
  goals: number; assists: number; penalties_minutes: number;
  shots: number; saves: number; hits: number; blocks: number;
  plus_minus: number; is_goalie: boolean; goals_against: number;
}
interface Game {
  id: string; homeTeam: Team; awayTeam: Team;
  home_score: number; away_score: number;
  scheduled_at: string; status: string; venue: string;
  period: number; period_time: string; overtime: boolean; shootout: boolean;
  season: string; notes: string; created_by: string;
}

const EVENT_LABELS: Record<string, string> = {
  goal: '골', assist: '어시스트', penalty: '페널티', save: '세이브',
  shot: '슈팅', hit: '히트', block: '블록',
};

export default function GameDetailPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'events' | 'stats'>('events');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    eventType: 'goal', teamId: '', playerName: '', period: 1, timeInPeriod: '00:00',
  });

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}`);
      const data = await res.json();
      setGame(data.game);
      setEvents(data.events || []);
      setStats(data.stats || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [gameId]);

  useEffect(() => { fetchGame(); }, [fetchGame]);

  const updateGameStatus = async (status: string) => {
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(status === 'live' ? { period: 1 } : {}),
      }),
    });
    fetchGame();
  };

  const updatePeriod = async (period: number) => {
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period }),
    });
    fetchGame();
  };

  const addEvent = async () => {
    if (!eventForm.teamId || !eventForm.playerName) return;
    await fetch(`/api/games/${gameId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventForm),
    });
    setShowAddEvent(false);
    setEventForm({ eventType: 'goal', teamId: '', playerName: '', period: game?.period || 1, timeInPeriod: '00:00' });
    fetchGame();
  };

  const deleteEvent = async (eventId: number) => {
    await fetch(`/api/games/${gameId}/events/${eventId}`, { method: 'DELETE' });
    fetchGame();
  };

  if (loading) return <div className="flex-1 bg-gray-900 flex items-center justify-center text-gray-500">로딩중...</div>;
  if (!game) return <div className="flex-1 bg-gray-900 flex items-center justify-center text-gray-400">경기를 찾을 수 없습니다</div>;

  const formatDate = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const formatTime = (s: string) => new Date(s).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  const homeStats = stats.filter(s => s.team_id === game.homeTeam?.id);
  const awayStats = stats.filter(s => s.team_id === game.awayTeam?.id);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 pb-28 md:pb-0">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Back */}
        <button onClick={() => navigate('/games')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> 경기 목록
        </button>

        {/* Scoreboard Card */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-4">
          <div className="text-center mb-1 text-xs text-gray-500">
            {formatDate(game.scheduled_at)} · {formatTime(game.scheduled_at)}
            {game.venue && ` · ${game.venue}`}
          </div>

          <div className="flex items-center justify-center gap-6 my-4">
            <div className="text-center flex-1">
              <p className="text-lg font-bold text-white">{game.homeTeam?.name}</p>
              <p className="text-[10px] text-gray-500 mt-1">HOME</p>
            </div>
            <div className="flex items-center gap-4 bg-gray-900 rounded-xl px-6 py-3">
              <span className={`text-3xl font-black ${game.home_score >= game.away_score ? 'text-white' : 'text-gray-500'}`}>
                {game.home_score}
              </span>
              <span className="text-gray-600 text-lg">:</span>
              <span className={`text-3xl font-black ${game.away_score >= game.home_score ? 'text-white' : 'text-gray-500'}`}>
                {game.away_score}
              </span>
            </div>
            <div className="text-center flex-1">
              <p className="text-lg font-bold text-white">{game.awayTeam?.name}</p>
              <p className="text-[10px] text-gray-500 mt-1">AWAY</p>
            </div>
          </div>

          {/* Status + Controls */}
          <div className="flex items-center justify-center gap-3 mt-3">
            {game.status === 'live' && (
              <span className="text-xs text-red-400 font-medium animate-pulse">LIVE · P{game.period} {game.period_time}</span>
            )}
            {game.status === 'final' && (
              <span className="text-xs text-gray-400">
                FINAL {game.overtime ? '(OT)' : ''}{game.shootout ? '(SO)' : ''}
              </span>
            )}
          </div>

          {/* Game Control Buttons */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {game.status === 'scheduled' && (
              <button onClick={() => updateGameStatus('live')}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer">
                <Play className="w-3.5 h-3.5" /> 경기 시작
              </button>
            )}
            {game.status === 'live' && (
              <>
                {game.period < 3 && (
                  <button onClick={() => updatePeriod(game.period + 1)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg cursor-pointer">
                    P{game.period + 1} 시작
                  </button>
                )}
                <button onClick={() => updateGameStatus('final')}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg flex items-center gap-1.5 cursor-pointer">
                  <Flag className="w-3.5 h-3.5" /> 경기 종료
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
          {(['events', 'stats'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}>
              {t === 'events' ? '이벤트' : '선수 통계'}
            </button>
          ))}
        </div>

        {/* Events Tab */}
        {tab === 'events' && (
          <div>
            {(game.status === 'live' || game.status === 'final') && (
              <button onClick={() => { setShowAddEvent(true); setEventForm(f => ({ ...f, period: game.period })); }}
                className="w-full mb-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 border-dashed rounded-lg text-sm text-gray-400 flex items-center justify-center gap-1.5 cursor-pointer">
                <Plus className="w-4 h-4" /> 이벤트 추가
              </button>
            )}

            {showAddEvent && (
              <div className="mb-4 bg-gray-800 rounded-xl border border-gray-700 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">유형</label>
                    <select value={eventForm.eventType}
                      onChange={e => setEventForm(f => ({ ...f, eventType: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                      {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">팀</label>
                    <select value={eventForm.teamId}
                      onChange={e => setEventForm(f => ({ ...f, teamId: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                      <option value="">선택...</option>
                      <option value={game.homeTeam.id}>{game.homeTeam.name}</option>
                      <option value={game.awayTeam.id}>{game.awayTeam.name}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">선수 이름</label>
                    <input type="text" value={eventForm.playerName}
                      onChange={e => setEventForm(f => ({ ...f, playerName: e.target.value }))}
                      placeholder="이름"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">시간</label>
                    <input type="text" value={eventForm.timeInPeriod}
                      onChange={e => setEventForm(f => ({ ...f, timeInPeriod: e.target.value }))}
                      placeholder="MM:SS"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => setShowAddEvent(false)} className="px-3 py-1.5 text-sm text-gray-400 cursor-pointer">취소</button>
                  <button onClick={addEvent} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg cursor-pointer">추가</button>
                </div>
              </div>
            )}

            {events.length === 0 ? (
              <p className="text-center py-8 text-gray-500 text-sm">아직 기록된 이벤트가 없습니다</p>
            ) : (
              <div className="space-y-2">
                {events.map(ev => {
                  const isHome = ev.team_id === game.homeTeam?.id;
                  return (
                    <div key={ev.id} className={`flex items-center gap-3 bg-gray-800 rounded-lg p-3 ${isHome ? '' : 'flex-row-reverse'}`}>
                      <div className={`text-xs font-medium px-2 py-1 rounded ${
                        ev.event_type === 'goal' ? 'bg-green-500/20 text-green-400' :
                        ev.event_type === 'penalty' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {EVENT_LABELS[ev.event_type]}
                      </div>
                      <div className={`flex-1 ${isHome ? 'text-left' : 'text-right'}`}>
                        <p className="text-sm text-white font-medium">{ev.player_name}</p>
                        <p className="text-[10px] text-gray-500">P{ev.period} · {ev.time_in_period}</p>
                      </div>
                      <button onClick={() => deleteEvent(ev.id)} className="text-gray-600 hover:text-red-400 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {tab === 'stats' && (
          <div className="space-y-4">
            {[{ label: game.homeTeam?.name, teamStats: homeStats }, { label: game.awayTeam?.name, teamStats: awayStats }].map(({ label, teamStats }) => (
              <div key={label} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-4 py-2 bg-gray-750 border-b border-gray-700">
                  <h3 className="text-sm font-semibold text-white">{label}</h3>
                </div>
                {teamStats.length === 0 ? (
                  <p className="text-center py-4 text-gray-500 text-xs">통계 없음</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-700">
                          <th className="text-left px-3 py-2">선수</th>
                          <th className="px-2 py-2">G</th>
                          <th className="px-2 py-2">A</th>
                          <th className="px-2 py-2">PTS</th>
                          <th className="px-2 py-2">+/-</th>
                          <th className="px-2 py-2">SOG</th>
                          <th className="px-2 py-2">PIM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamStats.map(s => (
                          <tr key={s.id} className="border-b border-gray-700/50 text-gray-300">
                            <td className="px-3 py-2 text-white font-medium">{s.player_name}</td>
                            <td className="px-2 py-2 text-center">{s.goals}</td>
                            <td className="px-2 py-2 text-center">{s.assists}</td>
                            <td className="px-2 py-2 text-center font-medium text-blue-400">{s.goals + s.assists}</td>
                            <td className="px-2 py-2 text-center">{s.plus_minus > 0 ? `+${s.plus_minus}` : s.plus_minus}</td>
                            <td className="px-2 py-2 text-center">{s.shots}</td>
                            <td className="px-2 py-2 text-center">{s.penalties_minutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
