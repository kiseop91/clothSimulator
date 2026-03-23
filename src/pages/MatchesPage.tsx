import { useState, useEffect, useCallback } from 'react';
import { Swords, Plus, MapPin, Calendar, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MatchRequest {
  id: string;
  rink_location: string;
  preferred_date: string;
  time_slot: string;
  skill_level: string;
  description: string;
  status: string;
  team: { id: string; name: string } | null;
  created_at: string;
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: '초급', intermediate: '중급', advanced: '상급', all: '모든 레벨'
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [myTeams, setMyTeams] = useState<{ id: string; name: string }[]>([]);

  // Create form
  const [teamId, setTeamId] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [level, setLevel] = useState('all');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/matches', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
    const data = await res.json();
    setMatches(data.matches || []);
    setLoading(false);
  }, []);

  const fetchMyTeams = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/teams', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
    const data = await res.json();
    setMyTeams((data.teams || []).map((t: any) => ({ id: t.id, name: t.name })));
  }, []);

  useEffect(() => { fetchMatches(); fetchMyTeams(); }, [fetchMatches, fetchMyTeams]);

  const handleCreate = async () => {
    if (!teamId || !location || !date || !timeSlot) return;
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ teamId, rinkLocation: location, preferredDate: date, timeSlot, skillLevel: level, description: desc }),
    });

    setShowCreate(false);
    setCreating(false);
    setLocation(''); setDate(''); setTimeSlot(''); setDesc('');
    fetchMatches();
  };

  return (
    <div className="h-full bg-gray-900 text-gray-200 flex flex-col overflow-hidden">
      <div className="bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Swords className="w-5 h-5 text-blue-400" />
            <h1 className="text-white font-semibold text-sm sm:text-lg">매치</h1>
          </div>
          {myTeams.length > 0 && (
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm rounded-lg flex items-center gap-1 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> 매치 요청
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28 sm:pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center text-gray-500 py-12 px-6">
            <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">매치 요청이 없습니다</p>
            <p className="text-xs mt-1">팀을 만들고 연습경기 상대를 찾아보세요!</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {matches.map(m => (
              <div key={m.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium text-white">{m.team?.name || 'Unknown Team'}</h3>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full ${m.status === 'open' ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                    {m.status === 'open' ? '모집 중' : m.status === 'matched' ? '매칭됨' : m.status}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-400">
                  <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {m.rink_location}</p>
                  <p className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {m.preferred_date} {m.time_slot}</p>
                  <p className="flex items-center gap-1.5"><Users className="w-3 h-3" /> {LEVEL_LABELS[m.skill_level] || m.skill_level}</p>
                </div>
                {m.description && <p className="text-xs text-gray-500 mt-2">{m.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Match Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">매치 요청</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-gray-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200">
              <option value="">팀 선택</option>
              {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="빙상장 위치" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200" />
            <input value={timeSlot} onChange={e => setTimeSlot(e.target.value)} placeholder="시간대 (예: 18:00-20:00)" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200" />
            <select value={level} onChange={e => setLevel(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200">
              <option value="all">모든 레벨</option>
              <option value="beginner">초급</option>
              <option value="intermediate">중급</option>
              <option value="advanced">상급</option>
            </select>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="추가 설명 (선택)" rows={2} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 resize-none" />
            <button onClick={handleCreate} disabled={creating || !teamId || !location || !date || !timeSlot} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl cursor-pointer">
              {creating ? '생성 중...' : '매치 요청 등록'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
