import AppRoutes from './routes';
import BottomNav from './components/layout/BottomNav';
import SideNav from './components/layout/SideNav';

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <AppRoutes />
      </div>
      <BottomNav />
    </div>
  );
}
