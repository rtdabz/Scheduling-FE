import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage';
import type { UserRole } from './pages/Dashboard';
import AppLayout from './components/layout/AppLayout';
import api from './lib/api';

// VPAA Pages
import Dashboard from './pages/Dashboard';
const Schedules = lazy(() => import('./pages/vpaa/Schedules'));
const ScheduleApprovalPage = lazy(() => import('./pages/vpaa/ScheduleApprovalPage'));
const Faculty = lazy(() => import('./pages/vpaa/Faculty'));
const Rooms = lazy(() => import('./pages/vpaa/Rooms'));
const Users = lazy(() => import('./pages/vpaa/Users'));
const Departments = lazy(() => import('./pages/vpaa/Departments'));
const Reports = lazy(() => import('./pages/vpaa/Reports'));
const Settings = lazy(() => import('./pages/vpaa/Settings'));

// Other Role Pages
const DeanSchedules = lazy(() => import('./pages/dean/Schedules'));
const DeanScheduleApprovalPage = lazy(() => import('./pages/dean/ScheduleApprovalPage'));
const SecPHSchedules = lazy(() => import('./pages/secretary/Schedules'));
const ProgramHeadSchedules = lazy(() => import('./pages/program_head/Schedules'));

interface StoredUser {
  role?: string;
}

const getStoredRole = (): string => {
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  return user?.role?.toLowerCase() || '';
};

const getDashboardRole = (): UserRole | string => getStoredRole();

const getDashboardPath = (role: string): string => {
  if (role === 'dean') return '/dean/dashboard';
  if (role === 'secretary') return '/secretary/dashboard';
  if (role === 'program_head') return '/program_head/dashboard';
  return '/dashboard';
};

const DashboardRoute = () => <Dashboard role={getDashboardRole()} />;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) return <Navigate to={getDashboardPath(getStoredRole())} replace />;
  return <>{children}</>;
};

export default function App() {
  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;

    api.get('/me')
      .then((res) => {
        const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
        storage.setItem('user', JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/';
      });
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
              <p className="text-muted text-sm">Loading...</p>
          </div>
      }>
        <Routes>
          <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
          {/* Main Layout wrapper for all authenticated routes */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            {/* VPAA Routes */}
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/schedules/approval" element={<ScheduleApprovalPage />} />
            <Route path="/faculty" element={<Faculty />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/users" element={<Users />} />
            <Route path="/departments" element={<Departments />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />

            {/* Dean Routes */}
            <Route path="/dean/dashboard" element={<DashboardRoute />} />
            <Route path="/dean/schedules" element={<DeanSchedules />} />
            <Route path="/dean/schedules/approval" element={<DeanScheduleApprovalPage />} />
            <Route path="/dean/faculty" element={<Faculty />} />
            <Route path="/dean/rooms" element={<Rooms />} />
            <Route path="/dean/reports" element={<Reports />} />
            <Route path="/dean/users" element={<Users />} />

            {/* Secretary Routes */}
            <Route path="/secretary/dashboard" element={<DashboardRoute />} />
            <Route path="/secretary/schedules" element={<SecPHSchedules />} />
            <Route path="/secretary/rooms" element={<Rooms />} />
            
            {/* Program Head Routes */}
            <Route path="/program_head/dashboard" element={<DashboardRoute />} />
            <Route path="/program_head/schedules" element={<ProgramHeadSchedules />} />
            <Route path="/program_head/faculty" element={<Faculty />} />
            <Route path="/program_head/rooms" element={<Rooms />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
