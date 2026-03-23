import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Shield, Plus, Copy, Check, Users, Crown, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface Team {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  myRole: string;
}

interface RosterMember {
  user_id: string;
  role: string;
  display_name: string | null;
  joined_at: string;
}

export default function TeamPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchTeams = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/teams', {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    setTeams(data.teams || []);
    if (data.teams?.length && !selectedTeam) {
      setSelectedTeam(data.teams[0]);
    }
    setLoading(false);
  }, [selectedTeam]);

  const fetchTeamDetail = useCallback(async (teamId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/teams/${teamId}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    setRoster(data.roster || []);
    setMemberCount(data.memberCount || 0);
  }, []);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);
  useEffect(() => { if (selectedTeam) fetchTeamDetail(selectedTeam.id); }, [selectedTeam, fetchTeamDetail]);

  const handleCopyInvite = () => {
    if (!selectedTeam) return;
    const url = `${window.location.origin}/team/join/${selectedTeam.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async (teamId: string) => {
    if (!confirm('팀을 탈퇴하시겠습니까?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !user) return;
    await fetch(`/api/teams/${teamId}/members/${user.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    setSelectedTeam(null);
    fetchTeams();
  };

  const canInviteCoach = memberCount >= 5;
  const isOwnerOrCoach = selectedTeam?.myRole === 'owner' || selectedTeam?.myRole === 'coach';

  if (loading) {
    return (
      <div className="h-full bg-gray-900 text-gray-200 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="h-full bg-gray-900 text-gray-200 flex flex-col overflow-hidden">
        <div className="bg-gray-800 border-b border-gray-700 shrink-0">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-400" />
              <h1 className="text-white font-semibold text-sm sm:text-lg">팀</h1>
            </div>
            <button onClick={() => navigate('/team/create')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm rounded-lg flex items-center gap-1 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> 팀 만들기
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-28 sm:pb-6 flex items-center justify-center">
          <div className="text-center text-gray-500 px-6">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">아직 팀이 없습니다</p>
            <p className="text-xs mb-4">5명이 모이면 팀을 결성하고 코치를 초대할 수 있어요!</p>
            <button onClick={() => navigate('/team/create')} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm rounded-xl cursor-pointer">팀 만들기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-900 text-gray-200 flex flex-col overflow-hidden">
      <div className="bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-5 h-5 text-blue-400 shrink-0" />
            <h1 className="text-white font-semibold text-sm sm:text-lg truncate">{selectedTeam?.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded-full shrink-0">
              {selectedTeam?.myRole === 'owner' ? '오너' : selectedTeam?.myRole === 'coach' ? '코치' : '선수'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isOwnerOrCoach && (
              <button onClick={() => navigate('/team/create')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg cursor-pointer">
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28 sm:pb-6">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 space-y-4">
          {/* Invite Link */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> 초대 링크
              </h3>
              <button onClick={handleCopyInvite} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs rounded-lg flex items-center gap-1 cursor-pointer">
                {copied ? <><Check className="w-3 h-3" /> 복사됨</> : <><Copy className="w-3 h-3" /> 복사</>}
              </button>
            </div>
            <p className="text-xs text-gray-500 break-all">{`${window.location.origin}/team/join/${selectedTeam?.invite_code}`}</p>
          </div>

          {/* Coach Invite */}
          {!canInviteCoach && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
              <p className="text-sm text-amber-400 font-medium mb-1">코치 초대까지 {5 - memberCount}명 남았어요!</p>
              <p className="text-xs text-amber-400/70">플레이어 5명이 모이면 코치를 초대할 수 있습니다 (현재 {memberCount}명)</p>
            </div>
          )}
          {canInviteCoach && isOwnerOrCoach && (
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-4">
              <p className="text-sm text-green-400 font-medium mb-1">코치를 초대할 수 있어요!</p>
              <p className="text-xs text-green-400/70">초대 링크를 코치에게 공유하세요</p>
            </div>
          )}

          {/* Roster */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> 로스터 ({memberCount}명)
            </h3>
            <div className="space-y-2">
              {roster.map(m => (
                <div key={m.user_id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs text-gray-400">
                      {m.display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm text-white">{m.display_name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-500">
                        {m.role === 'owner' ? '오너' : m.role === 'coach' ? '코치' : '선수'}
                      </p>
                    </div>
                  </div>
                  {selectedTeam?.myRole === 'owner' && m.user_id !== user?.id && (
                    <button
                      onClick={() => handleLeave(selectedTeam.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
