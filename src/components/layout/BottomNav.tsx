import { useLocation, useNavigate } from 'react-router';
import { Home, Users, Swords, MessageCircle, User } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', icon: Home, label: '홈' },
  { path: '/community', icon: Users, label: '커뮤니티' },
  { path: '/matches', icon: Swords, label: '매치' },
  { path: '/messages', icon: MessageCircle, label: '메시지' },
  { path: '/account', icon: User, label: '계정' },
];

// Pages where BottomNav should NOT show
const HIDDEN_PATHS = ['/', '/login', '/signup', '/editor'];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide on landing, auth pages, and editor
  if (HIDDEN_PATHS.some(p => location.pathname === p || location.pathname.startsWith('/editor/'))) {
    return null;
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-800 border-t border-gray-700 safe-bottom">
      <div className="flex items-center justify-around py-1.5">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer active:bg-gray-700 ${
                active ? 'text-blue-400' : 'text-gray-500'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
