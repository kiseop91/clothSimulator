import { useState, useEffect, useCallback } from 'react';
import { Users, Heart, Eye, Download, Search, TrendingUp, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface SharedDrill {
  id: string;
  title: string;
  description: string;
  tags: string[];
  likes_count: number;
  views_count: number;
  liked: boolean;
  created_at: string;
  author: { display_name: string; avatar_url: string | null } | null;
  drill_data: any;
}

export default function CommunityPage() {
  const { user } = useAuth();
  const [drills, setDrills] = useState<SharedDrill[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'recent' | 'likes'>('recent');
  const [searchTag, setSearchTag] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const fetchDrills = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

    const params = new URLSearchParams({ sort });
    if (searchTag) params.set('tags', searchTag);

    const res = await fetch(`/api/community/drills?${params}`, { headers });
    const data = await res.json();
    setDrills(data.drills || []);
    setLoading(false);
  }, [sort, searchTag]);

  useEffect(() => { fetchDrills(); }, [fetchDrills]);

  const handleLike = async (drillId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(`/api/community/drills/${drillId}/like`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    setDrills(prev => prev.map(d => d.id === drillId ? {
      ...d,
      liked: !d.liked,
      likes_count: d.liked ? d.likes_count - 1 : d.likes_count + 1,
    } : d));
  };

  const handleImport = async (drillId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setImporting(drillId);

    const res = await fetch(`/api/community/drills/${drillId}/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    if (res.ok) alert('드릴이 내 라이브러리에 추가되었습니다!');
    setImporting(null);
  };

  const TAGS = ['breakout', 'powerplay', 'penaltykill', 'rush', 'cycling', 'shooting', 'passing', 'skating'];

  return (
    <div className="h-full bg-gray-900 text-gray-200 flex flex-col overflow-hidden">
      <div className="bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-400" />
          <h1 className="text-white font-semibold text-sm sm:text-lg">커뮤니티</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800/50 border-b border-gray-700/50 shrink-0">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setSort('recent')} className={`px-3 py-1 text-xs rounded-full cursor-pointer ${sort === 'recent' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
              <Clock className="w-3 h-3 inline mr-1" />최신
            </button>
            <button onClick={() => setSort('likes')} className={`px-3 py-1 text-xs rounded-full cursor-pointer ${sort === 'likes' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
              <TrendingUp className="w-3 h-3 inline mr-1" />인기
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {TAGS.map(tag => (
              <button key={tag} onClick={() => setSearchTag(searchTag === tag ? '' : tag)} className={`px-2.5 py-1 text-[10px] rounded-full whitespace-nowrap cursor-pointer ${searchTag === tag ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-500 hover:text-gray-300'}`}>
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drill list */}
      <div className="flex-1 overflow-y-auto pb-28 sm:pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : drills.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">공유된 드릴이 없습니다</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {drills.map(drill => (
              <div key={drill.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-white truncate">{drill.title}</h3>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {drill.author?.display_name || 'Unknown'} · {new Date(drill.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
                {drill.description && (
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2">{drill.description}</p>
                )}
                {drill.tags.length > 0 && (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {drill.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 text-[10px] bg-gray-700/50 text-gray-500 rounded-full">#{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button onClick={() => handleLike(drill.id)} className={`flex items-center gap-1 text-xs cursor-pointer ${drill.liked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}>
                    <Heart className={`w-3.5 h-3.5 ${drill.liked ? 'fill-current' : ''}`} /> {drill.likes_count}
                  </button>
                  <span className="flex items-center gap-1 text-xs text-gray-600">
                    <Eye className="w-3.5 h-3.5" /> {drill.views_count}
                  </span>
                  <button
                    onClick={() => handleImport(drill.id)}
                    disabled={importing === drill.id || !user}
                    className="ml-auto flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" /> {importing === drill.id ? '추가 중...' : '가져오기'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
