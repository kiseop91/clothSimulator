import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, Crown, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { supabase } from '../lib/supabase';

export default function PricingPage() {
  const { user } = useAuth();
  const { isProUser } = useSubscription();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  const handleCheckout = async (provider: 'stripe' | 'toss' | 'paddle') => {
    if (!user) {
      navigate('/login');
      return;
    }
    setLoading(provider);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          provider,
          successUrl: `${window.location.origin}/account?payment=success`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to create checkout session');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(null);
    }
  };

  const FREE_FEATURES = [
    '드릴 3개까지 생성',
    'AI 드릴 생성 5회/일',
    '2D/3D 뷰',
    '프리셋 드릴',
    'JSON 내보내기',
  ];

  const PRO_FEATURES = [
    '무제한 드릴 생성',
    '무제한 AI 드릴/애니메이션 생성',
    '클라우드 동기화',
    '연습 세션 빌더',
    'GIF/영상 내보내기',
    '우선 지원',
  ];

  return (
    <div className="h-screen bg-gray-900 text-gray-200 flex flex-col overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-8 pb-28 sm:pb-8 w-full flex-1 overflow-y-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs sm:text-sm mb-4 sm:mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> 뒤로
        </button>

        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">요금제 선택</h1>
          <p className="text-gray-500 text-xs sm:text-base">Hockey Drill Studio Pro로 더 많은 기능을 사용하세요</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl mx-auto">
          {/* Free */}
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Free</h3>
            <div className="text-2xl sm:text-3xl font-bold text-white mb-3 sm:mb-4">₩0 <span className="text-xs sm:text-sm font-normal text-gray-500">/월</span></div>
            <ul className="space-y-2 mb-5 sm:mb-6">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                  <Check className="w-4 h-4 text-gray-600 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {!user ? (
              <Link to="/signup" className="block w-full py-2.5 sm:py-3 text-center bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-sm rounded-xl transition-colors">
                무료로 시작
              </Link>
            ) : (
              <div className="py-2.5 text-center text-gray-500 text-sm">현재 플랜</div>
            )}
          </div>

          {/* Pro */}
          <div className="bg-gray-800 border-2 border-amber-500/50 rounded-2xl p-5 sm:p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] sm:text-xs font-medium rounded-full">
              인기
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> Pro
            </h3>
            <div className="text-2xl sm:text-3xl font-bold text-white mb-3 sm:mb-4">₩9,900 <span className="text-xs sm:text-sm font-normal text-gray-500">/월</span></div>
            <ul className="space-y-2 mb-5 sm:mb-6">
              {PRO_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2 text-xs sm:text-sm text-gray-300">
                  <Check className="w-4 h-4 text-amber-400 shrink-0" /> {f}
                </li>
              ))}
            </ul>

            {isProUser ? (
              <div className="py-2.5 text-center text-amber-400 text-sm font-medium">현재 플랜</div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => handleCheckout('stripe')}
                  disabled={loading !== null}
                  className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:from-amber-600 active:to-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl cursor-pointer transition-all"
                >
                  {loading === 'stripe' ? '처리 중...' : '카드로 결제 (Stripe)'}
                </button>
                <button
                  onClick={() => handleCheckout('toss')}
                  disabled={loading !== null}
                  className="w-full py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl cursor-pointer transition-all"
                >
                  {loading === 'toss' ? '처리 중...' : '토스페이먼츠로 결제'}
                </button>
                <button
                  onClick={() => handleCheckout('paddle')}
                  disabled={loading !== null}
                  className="w-full py-2.5 sm:py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl cursor-pointer transition-all"
                >
                  {loading === 'paddle' ? '처리 중...' : 'Paddle로 결제'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
