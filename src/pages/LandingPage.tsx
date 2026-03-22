import { Link, useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0 safe-top">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
              <path d="M4 20 L12 4 L14 4 L14 14 L20 18 L18 20 L12 16 L6 20 Z" />
            </svg>
          </div>
          <span className="text-white font-semibold text-sm sm:text-base">Hockey Drill Studio</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="text-gray-400 hover:text-white text-xs sm:text-sm">로그인</Link>
          <Link to="/signup" className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm rounded-lg">시작하기</Link>
        </div>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:py-20 text-center">
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 leading-tight">
          AI로 하키 드릴을
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">30초 만에</span> 만드세요
        </h1>
        <p className="text-gray-400 text-sm sm:text-lg mb-6 sm:mb-8 max-w-xl mx-auto leading-relaxed">
          텍스트로 설명하면 AI가 2D/3D 드릴을 자동 생성합니다.
          드릴 편집, 애니메이션, 연습 세션 빌더까지.
        </p>
        <div className="flex flex-col items-center gap-3 sm:gap-4 w-full max-w-xs">
          <Link
            to="/editor"
            className="w-full px-6 py-3.5 sm:py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-base sm:text-lg font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition-all active:scale-95"
          >
            <Sparkles className="w-5 h-5" />
            무료로 체험하기
          </Link>
          <p className="text-gray-600 text-xs sm:text-sm">로그인 없이 바로 사용 가능</p>
          <div className="flex items-center gap-2 sm:gap-3 mt-1">
            <Link
              to="/signup"
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-xl border border-gray-700 active:bg-gray-600"
            >
              회원가입
            </Link>
            <Link
              to="/pricing"
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-xl border border-gray-700 active:bg-gray-600"
            >
              요금제 보기
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="px-4 pb-8 sm:pb-16 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 max-w-4xl mx-auto w-full">
        {[
          { title: 'AI 드릴 생성', desc: '텍스트 프롬프트로 드릴과 애니메이션을 자동 생성', icon: '🤖' },
          { title: '2D & 3D 뷰', desc: 'SVG 2D 편집과 WebGL2 3D 프리뷰를 자유롭게 전환', icon: '🏒' },
          { title: '세션 빌더', desc: '드릴을 조합하여 완전한 연습 세션을 구성', icon: '📋' },
        ].map(f => (
          <div key={f.title} className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-5 flex sm:flex-col items-start gap-3 sm:gap-0">
            <div className="text-2xl sm:mb-3 shrink-0">{f.icon}</div>
            <div>
              <h3 className="text-white font-semibold mb-0.5 sm:mb-1 text-sm sm:text-base">{f.title}</h3>
              <p className="text-gray-500 text-xs sm:text-sm">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
