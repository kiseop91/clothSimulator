import { useLocation, useNavigate } from 'react-router';
import { Home, Users, Swords, MessageCircle, User, Shield, Crown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';

const NAV_ITEMS = [
  { path: '/dashboard', icon: Home, label: '대시보드' },
  { path: '/team', icon: Shield, label: '팀' },
  { path: '/community', icon: Users, label: '커뮤니티' },
  { path: '/matches', icon: Swords, label: '매치' },
  { path: '/messages', icon: MessageCircle, label: '메시지' },
];

const HIDDEN_PATHS = ['/', '/login', '/signup', '/editor'];

export default function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isProUser } = useSubscription();

  if (!user) return null;
  if (HIDDEN_PATHS.some(p => location.pathname === p || location.pathname.startsWith('/editor/'))) return null;

  return (
    <div className="hidden md:flex w-56 bg-gray-800 border-r border-gray-700 flex-col h-screen shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2 border-b border-gray-700">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
            <path d="M4 20 L12 4 L14 4 L14 14 L20 18 L18 20 L12 16 L6 20 Z" />
          </svg>
        </div>
        <span className="text-white font-semibold text-sm">Hockey Drill Studio</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                active
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
              }`}
            >
              <item.icon className="w-4.5 h-4.5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-700 p-3">
        {!isProUser && (
          <button
            onClick={() => navigate('/pricing')}
            className="w-full mb-2 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5" /> 업그레이드
          </button>
        )}
        <button
          onClick={() => navigate('/account')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-700/50 hover:text-gray-200 text-sm cursor-pointer"
        >
          <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center text-xs text-gray-300">
            {profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs text-gray-300 truncate">{profile?.display_name || user?.email?.split('@')[0]}</p>
            <p className="text-[10px] text-gray-600">{isProUser ? 'Pro' : 'Free'}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
