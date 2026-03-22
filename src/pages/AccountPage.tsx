import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Crown, CreditCard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { supabase } from '../lib/supabase';

export default function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { subscription, isProUser, refresh: refreshSub } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setToast('결제가 완료되었습니다! Pro 플랜이 활성화됩니다.');
      refreshSub();
      refreshProfile();
    }
  }, [searchParams, refreshSub, refreshProfile]);

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setToast('프로필이 저장되었습니다');
  };

  const handleCancelSubscription = async () => {
    if (!confirm('구독을 해지하시겠습니까? 현재 결제 기간이 끝날 때까지 Pro 기능을 사용할 수 있습니다.')) return;
    setCanceling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/payments/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      if (res.ok) {
        setToast('구독이 해지되었습니다');
        refreshSub();
      } else {
        const data = await res.json();
        alert(data.error || '해지 실패');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="h-screen bg-gray-900 text-gray-200 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4 sm:py-8 pb-28 sm:pb-8">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs sm:text-sm mb-4 sm:mb-6 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> 대시보드
        </button>

        <h1 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6">계정 설정</h1>

        {toast && (
          <div className="mb-3 sm:mb-4 px-3 sm:px-4 py-2 bg-green-900/30 border border-green-800/30 text-green-400 text-xs sm:text-sm rounded-lg">
            {toast}
          </div>
        )}

        {/* Profile */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-5 mb-3 sm:mb-4">
          <h3 className="text-sm font-semibold text-white mb-3">프로필</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">이메일</label>
              <p className="text-sm text-gray-300 truncate">{user?.email}</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">이름</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-xl cursor-pointer transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> 구독
          </h3>
          <div className="flex items-center gap-2 mb-3">
            {isProUser ? (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
                <Crown className="w-3.5 h-3.5" /> Pro
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-gray-700 text-gray-400 text-xs font-medium rounded-full">Free</span>
            )}
          </div>

          {subscription && (
            <div className="space-y-1.5 text-xs sm:text-sm text-gray-400 mb-4">
              <p>결제 수단: {subscription.provider}</p>
              {subscription.current_period_end && (
                <p>다음 결제일: {new Date(subscription.current_period_end).toLocaleDateString('ko-KR')}</p>
              )}
              {subscription.cancel_at_period_end && (
                <p className="text-orange-400">기간 종료 후 해지 예정</p>
              )}
            </div>
          )}

          {isProUser && !subscription?.cancel_at_period_end ? (
            <button
              onClick={handleCancelSubscription}
              disabled={canceling}
              className="w-full sm:w-auto px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 active:bg-red-600/40 text-red-400 text-sm rounded-xl cursor-pointer transition-colors"
            >
              {canceling ? '처리 중...' : '구독 해지'}
            </button>
          ) : !isProUser ? (
            <button
              onClick={() => navigate('/pricing')}
              className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:from-amber-600 active:to-orange-600 text-white text-sm font-medium rounded-xl cursor-pointer transition-all"
            >
              Pro로 업그레이드
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
