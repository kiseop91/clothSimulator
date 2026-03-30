import { useState, useEffect, useCallback } from 'react';
import { Trophy, TrendingUp, Medal } from 'lucide-react';

interface Standing {
  teamId: string;
  teamName: string;
  logoUrl?: string;
  gp: number;
  w: number;
  l: number;
  otl: number;
  pts: number;
  gf: number;
  ga: number;
}

interface Leader {
  playerName: string;
  teamName: string;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  penaltiesMinutes: number;
  shots: number;
  plusMinus: number;
}

export default function StandingsPage() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'standings' | 'leaders'>('standings');
  const [leaderStat, setLeaderStat] = useState<'points' | 'goals' | 'assists'>('points');
  const [season, setSeason] = useState('2025-2026');

  const fetchStandings = useCallback(async () => {
    try {
      const res = await fetch(`/api/standings?season=${season}`);
      const data = await res.json();
      setStandings(data.standings || []);
    } catch { /* ignore */ }
  }, [season]);

  const fetchLeaders = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboards?stat=${leaderStat}&season=${season}`);
      const data = await res.json();
      setLeaders(data.leaders || []);
    } catch { /* ignore */ }
  }, [leaderStat, season]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStandings(), fetchLeaders()]).finally(() => setLoading(false));
  }, [fetchStandings, fetchLeaders]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 pb-28 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" /> 순위 & 리더보드
            </h1>
            <p className="text-sm text-gray-400 mt-1">{season} 시즌</p>
          </div>
          <select value={season} onChange={e => setSeason(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
            <option value="2025-2026">2025-2026</option>
            <option value="2024-2025">2024-2025</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
          {(['standings', 'leaders'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}>
              {t === 'standings' ? '팀 순위' : '선수 리더보드'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">로딩중...</div>
        ) : tab === 'standings' ? (
          /* Standings Table */
          standings.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">종료된 경기가 없어 순위를 계산할 수 없습니다</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-700">
                      <th className="text-left px-4 py-3 w-8">#</th>
                      <th className="text-left px-3 py-3">팀</th>
                      <th className="px-3 py-3 text-center">GP</th>
                      <th className="px-3 py-3 text-center">W</th>
                      <th className="px-3 py-3 text-center">L</th>
                      <th className="px-3 py-3 text-center">OTL</th>
                      <th className="px-3 py-3 text-center font-bold text-amber-400">PTS</th>
                      <th className="px-3 py-3 text-center">GF</th>
                      <th className="px-3 py-3 text-center">GA</th>
                      <th className="px-3 py-3 text-center">DIFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((team, i) => (
                      <tr key={team.teamId} className="border-b border-gray-700/50 hover:bg-gray-750">
                        <td className="px-4 py-3">
                          {i < 3 ? (
                            <Medal className={`w-4 h-4 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : 'text-orange-400'}`} />
                          ) : (
                            <span className="text-gray-500 text-xs">{i + 1}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-white font-medium">{team.teamName}</td>
                        <td className="px-3 py-3 text-center text-gray-400">{team.gp}</td>
                        <td className="px-3 py-3 text-center text-green-400">{team.w}</td>
                        <td className="px-3 py-3 text-center text-red-400">{team.l}</td>
                        <td className="px-3 py-3 text-center text-gray-400">{team.otl}</td>
                        <td className="px-3 py-3 text-center font-bold text-white">{team.pts}</td>
                        <td className="px-3 py-3 text-center text-gray-400">{team.gf}</td>
                        <td className="px-3 py-3 text-center text-gray-400">{team.ga}</td>
                        <td className={`px-3 py-3 text-center ${team.gf - team.ga > 0 ? 'text-green-400' : team.gf - team.ga < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {team.gf - team.ga > 0 ? '+' : ''}{team.gf - team.ga}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          /* Leaderboards */
          <div>
            {/* Stat filter */}
            <div className="flex gap-2 mb-4">
              {(['points', 'goals', 'assists'] as const).map(s => (
                <button key={s} onClick={() => setLeaderStat(s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                    leaderStat === s ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}>
                  {s === 'points' ? '포인트' : s === 'goals' ? '골' : '어시스트'}
                </button>
              ))}
            </div>

            {leaders.length === 0 ? (
              <div className="text-center py-12">
                <Medal className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">아직 선수 통계가 없습니다</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs border-b border-gray-700">
                        <th className="text-left px-4 py-3 w-8">#</th>
                        <th className="text-left px-3 py-3">선수</th>
                        <th className="text-left px-3 py-3">팀</th>
                        <th className="px-3 py-3 text-center">GP</th>
                        <th className="px-3 py-3 text-center">G</th>
                        <th className="px-3 py-3 text-center">A</th>
                        <th className="px-3 py-3 text-center font-bold text-amber-400">PTS</th>
                        <th className="px-3 py-3 text-center">+/-</th>
                        <th className="px-3 py-3 text-center">SOG</th>
                        <th className="px-3 py-3 text-center">PIM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaders.map((player, i) => (
                        <tr key={`${player.playerName}-${player.teamName}`} className="border-b border-gray-700/50 hover:bg-gray-750">
                          <td className="px-4 py-3">
                            {i < 3 ? (
                              <Medal className={`w-4 h-4 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : 'text-orange-400'}`} />
                            ) : (
                              <span className="text-gray-500 text-xs">{i + 1}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-white font-medium">{player.playerName}</td>
                          <td className="px-3 py-3 text-gray-400">{player.teamName}</td>
                          <td className="px-3 py-3 text-center text-gray-400">{player.gp}</td>
                          <td className="px-3 py-3 text-center">{player.goals}</td>
                          <td className="px-3 py-3 text-center">{player.assists}</td>
                          <td className="px-3 py-3 text-center font-bold text-white">{player.points}</td>
                          <td className={`px-3 py-3 text-center ${player.plusMinus > 0 ? 'text-green-400' : player.plusMinus < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {player.plusMinus > 0 ? '+' : ''}{player.plusMinus}
                          </td>
                          <td className="px-3 py-3 text-center text-gray-400">{player.shots}</td>
                          <td className="px-3 py-3 text-center text-gray-400">{player.penaltiesMinutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
