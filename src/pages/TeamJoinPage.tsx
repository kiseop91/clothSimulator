import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Shield, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function TeamJoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate(`/login?redirect=/team/join/${code}`); return; }

      try {
        const res = await fetch('/api/teams/join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ inviteCode: code }),
        });
        const data = await res.json();
        if (!res.ok) { setStatus('error'); setError(data.error); return; }

        setTeamName(data.team?.name || '');
        setStatus(data.alreadyMember ? 'already' : 'success');
      } catch (err: any) {
        setStatus('error');
        setError(err.message);
      }
    })();
  }, [code, navigate]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-400">팀에 가입하는 중...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <h1 className="text-white text-lg font-bold mb-2">가입 완료!</h1>
            <p className="text-gray-400 text-sm mb-4">{teamName} 팀에 합류했습니다</p>
            <button onClick={() => navigate('/team')} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl cursor-pointer">
              팀 페이지로 이동
            </button>
          </>
        )}
        {status === 'already' && (
          <>
            <Shield className="w-12 h-12 text-blue-400 mx-auto mb-4" />
            <h1 className="text-white text-lg font-bold mb-2">이미 팀원입니다</h1>
            <p className="text-gray-400 text-sm mb-4">{teamName}</p>
            <button onClick={() => navigate('/team')} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl cursor-pointer">
              팀 페이지로 이동
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-white text-lg font-bold mb-2">가입 실패</h1>
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-xl cursor-pointer">
              대시보드로 이동
            </button>
          </>
        )}
      </div>
    </div>
  );
}
