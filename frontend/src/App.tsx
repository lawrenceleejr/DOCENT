import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { PublicImpactPage } from './pages/PublicImpactPage';
import { SchedulePage } from './pages/SchedulePage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { ReportsPage } from './pages/ReportsPage';
import { VenueDetailPage } from './pages/VenueDetailPage';
import { VenueListPage } from './pages/VenueListPage';
import { VisitDetailPage } from './pages/VisitDetailPage';
import { VisitFormPage } from './pages/VisitFormPage';
import { VisitListPage } from './pages/VisitListPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/impact" element={<PublicImpactPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<VisitListPage />} />
        <Route path="/visits/new" element={<VisitFormPage />} />
        <Route path="/visits/:id" element={<VisitDetailPage />} />
        <Route path="/visits/:id/edit" element={<VisitFormPage />} />
        <Route path="/venues" element={<VenueListPage />} />
        <Route path="/venues/:id" element={<VenueDetailPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/analysis" element={<DashboardPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
