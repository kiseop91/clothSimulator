import { Routes, Route, Navigate } from 'react-router';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import EditorPage from './pages/EditorPage';
import PricingPage from './pages/PricingPage';
import AccountPage from './pages/AccountPage';
import TeamPage from './pages/TeamPage';
import TeamCreatePage from './pages/TeamCreatePage';
import TeamJoinPage from './pages/TeamJoinPage';
import CommunityPage from './pages/CommunityPage';
import MatchesPage from './pages/MatchesPage';
import MessagesPage from './pages/MessagesPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/editor/:drillId?" element={<EditorPage />} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
      />
      <Route
        path="/account"
        element={<ProtectedRoute><AccountPage /></ProtectedRoute>}
      />
      <Route
        path="/team"
        element={<ProtectedRoute><TeamPage /></ProtectedRoute>}
      />
      <Route
        path="/team/create"
        element={<ProtectedRoute><TeamCreatePage /></ProtectedRoute>}
      />
      <Route
        path="/team/join/:code"
        element={<ProtectedRoute><TeamJoinPage /></ProtectedRoute>}
      />
      <Route
        path="/community"
        element={<ProtectedRoute><CommunityPage /></ProtectedRoute>}
      />
      <Route
        path="/matches"
        element={<ProtectedRoute><MatchesPage /></ProtectedRoute>}
      />
      <Route
        path="/messages"
        element={<ProtectedRoute><MessagesPage /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
