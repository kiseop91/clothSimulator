import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const { signUp, signInWithOAuth, user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (user) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다');
      return;
    }
    setError(null);
    setLoading(true);
    const result = await signUp(email, password, displayName);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-5">
        <div className="w-full max-w-sm text-center">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 sm:p-8">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-white text-lg font-semibold mb-2">가입 완료!</h2>
            <p className="text-gray-400 text-sm mb-4">이메일을 확인하고 인증 링크를 클릭해주세요.</p>
            <Link to="/login" className="inline-block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl">로그인 페이지로 이동</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="px-4 pt-3 sm:pt-4">
        <Link to="/" className="text-gray-500 hover:text-gray-300 text-xs sm:text-sm">&larr; 홈으로</Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 py-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 sm:w-8 sm:h-8 text-white">
                <path d="M4 20 L12 4 L14 4 L14 14 L20 18 L18 20 L12 16 L6 20 Z" />
              </svg>
            </div>
            <h1 className="text-white text-lg sm:text-xl font-bold">Hockey Drill Studio</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">회원가입</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs sm:text-sm text-gray-400 mb-1.5">이름</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoComplete="name"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm text-gray-400 mb-1.5">이메일</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm text-gray-400 mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
            >
              {loading ? '가입 중...' : '회원가입'}
            </button>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-gray-800 px-2 text-gray-500">또는</span></div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => signInWithOAuth('google')}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-300 text-sm rounded-xl transition-colors cursor-pointer"
              >
                Google
              </button>
              <button
                type="button"
                onClick={() => signInWithOAuth('kakao')}
                className="flex-1 py-3 bg-yellow-500/20 hover:bg-yellow-500/30 active:bg-yellow-500/40 text-yellow-300 text-sm rounded-xl transition-colors cursor-pointer"
              >
                카카오
              </button>
            </div>
          </form>

          <p className="text-center text-xs sm:text-sm text-gray-500 mt-4 pb-4">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300">로그인</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
