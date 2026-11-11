import { Center, Loader } from '@mantine/core';
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AnalyticsBeacon } from './components/AnalyticsBeacon';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegisterPage } from './pages/RegisterPage';
import { VisitListPage } from './pages/VisitListPage';

// Everything past the sign-in screen and the events list loads on demand, so
// the login and public pages don't download the charts, the map and the admin
// panel up front.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = <K extends string>(load: () => Promise<Record<K, any>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })));

const AdminPage = page(() => import('./pages/AdminPage'), 'AdminPage');
const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const DirectoryPage = page(() => import('./pages/DirectoryPage'), 'DirectoryPage');
const MapPage = page(() => import('./pages/MapPage'), 'MapPage');
const PublicImpactPage = page(() => import('./pages/PublicImpactPage'), 'PublicImpactPage');
const PolicyPage = page(() => import('./pages/PolicyPage'), 'PolicyPage');
const SchedulePage = page(() => import('./pages/SchedulePage'), 'SchedulePage');
const ProfilePage = page(() => import('./pages/ProfilePage'), 'ProfilePage');
const ProfileViewPage = page(() => import('./pages/ProfileViewPage'), 'ProfileViewPage');
const ReportsPage = page(() => import('./pages/ReportsPage'), 'ReportsPage');
const VenueDetailPage = page(() => import('./pages/VenueDetailPage'), 'VenueDetailPage');
const VenueListPage = page(() => import('./pages/VenueListPage'), 'VenueListPage');
const VisitDetailPage = page(() => import('./pages/VisitDetailPage'), 'VisitDetailPage');
const VisitFormPage = page(() => import('./pages/VisitFormPage'), 'VisitFormPage');

function PageLoader({ full = false }: { full?: boolean }) {
  return (
    <Center h={full ? '100vh' : undefined} py={full ? undefined : 80}>
      <Loader />
    </Center>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader full />;
  if (!user) {
    // Remember where they were headed, so a shared link survives signing in.
    const here = location.pathname + location.search;
    return (
      <Navigate to={here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`} replace />
    );
  }
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}

/** The API refuses non-admins anyway; this keeps them from landing on a page
 * of nothing but failed requests. */
function RequireAdmin() {
  const { user } = useAuth();
  return user?.is_admin ? <Outlet /> : <NotFoundPage />;
}

export default function App() {
  return (
    <>
      <AnalyticsBeacon />
      <Suspense fallback={<PageLoader full />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/impact" element={<PublicImpactPage />} />
          {/* Readable signed-out: you should be able to read the privacy
              policy before registering. */}
          <Route path="/privacy" element={<PolicyPage />} />
          <Route path="/terms" element={<PolicyPage />} />
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
            <Route path="/directory" element={<DirectoryPage />} />
            <Route path="/directory/:userId" element={<ProfileViewPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            {/* A mistyped or outdated address says so, inside the app. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
