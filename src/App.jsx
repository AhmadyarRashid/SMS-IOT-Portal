import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useAuthStore from './store/authStore';
import { LoadingSpinner } from './components/ui';

const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const SitesPage = lazy(() => import('./pages/SitesPage'));
const GatewayPage = lazy(() => import('./pages/GatewayPage'));
const AssetPage = lazy(() => import('./pages/AssetPage'));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner size="lg" fullScreen />}>
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="sites" element={<SitesPage />} />
              <Route path="g/:id" element={<GatewayPage />} />
              <Route path="a/:id" element={<AssetPage />} />
              <Route path="alarms" element={<AlarmsPage />} />
              <Route path="automations" element={<AutomationsPage />} />
              <Route path="map" element={<MapPage />} />
              <Route path="settings" element={<SettingsPage />} />

              {/* Legacy redirects — old routes now funnel to the unified views */}
              <Route path="monitoring" element={<Navigate to="/" replace />} />
              <Route path="devices" element={<Navigate to="/" replace />} />
              <Route path="devices/:id" element={<LegacyAssetRedirect />} />
              <Route path="history" element={<Navigate to="/" replace />} />
              <Route path="controls" element={<Navigate to="/" replace />} />
              <Route path="rules" element={<Navigate to="/automations" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function LegacyAssetRedirect() {
  const id = window.location.pathname.split('/').pop();
  return <Navigate to={`/a/${id}`} replace />;
}
