import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function TeamCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('로그인이 필요합니다'); setLoading(false); return; }

      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || '팀 생성 실패'); setLoading(false); return; }

      navigate('/team');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-gray-900 text-gray-200 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4 sm:py-8 pb-28 sm:pb-8">
        <button onClick={() => navigate('/team')} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs sm:text-sm mb-4 sm:mb-6 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> 팀
        </button>

        <h1 className="text-lg sm:text-xl font-bold text-white mb-6">팀 만들기</h1>

        <form onSubmit={handleCreate} className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-xs sm:text-sm text-gray-400 mb-1.5">팀 이름</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 서울 아이스 베어스"
              required
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl cursor-pointer"
          >
            {loading ? '생성 중...' : '팀 생성'}
          </button>

          <p className="text-xs text-gray-500 text-center">
            플레이어 5명이 모이면 코치를 초대할 수 있습니다
          </p>
        </form>
      </div>
    </div>
  );
}
