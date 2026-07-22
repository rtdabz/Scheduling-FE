import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage';
import type { UserRole } from './pages/Dashboard';
import AppLayout from './components/layout/AppLayout';
import api from './lib/api';
import { clearDataCache } from './lib/dataCache';

// VPAA Pages
import Dashboard from './pages/Dashboard';
const VpaaSchedules = lazy(() => import('./pages/vpaa/Schedules'));
const VpaaScheduleApprovalPage = lazy(() => import('./pages/vpaa/ScheduleApprovalPage'));
const VpaaFaculty = lazy(() => import('./pages/vpaa/Faculty'));
const VpaaRooms = lazy(() => import('./pages/vpaa/Rooms'));
const VpaaUsers = lazy(() => import('./pages/vpaa/Users'));
const Departments = lazy(() => import('./pages/vpaa/Departments'));
const VpaaReports = lazy(() => import('./pages/vpaa/Reports'));
const Settings = lazy(() => import('./pages/vpaa/Settings'));

// Other Role Pages
const DeanSchedules = lazy(() => import('./pages/dean/Schedules'));
const DeanScheduleApprovalPage = lazy(() => import('./pages/dean/ScheduleApprovalPage'));
const DeanFaculty = lazy(() => import('./pages/dean/Faculty'));
const DeanRooms = lazy(() => import('./pages/dean/Rooms'));
const DeanReports = lazy(() => import('./pages/dean/Reports'));
const DeanUsers = lazy(() => import('./pages/dean/Users'));
const SecretarySchedules = lazy(() => import('./pages/secretary/Schedules'));
const SecretaryRooms = lazy(() => import('./pages/secretary/Rooms'));
const SecretaryFaculty = lazy(() => import('./pages/secretary/Faculty'));
const ProgramHeadSchedules = lazy(() => import('./pages/program_head/Schedules'));
const ProgramHeadFaculty = lazy(() => import('./pages/program_head/Faculty'));
const ProgramHeadRooms = lazy(() => import('./pages/program_head/Rooms'));
const InstructorAssignment = lazy(() => import('./pages/ClassSchedules/InstructorAssignment'));
const SecretaryCourses = lazy(() => import('./pages/secretary/Courses'));
const SecretarySections = lazy(() => import('./pages/secretary/Sections'));

interface StoredUser {
  role?: string;
}

interface ApiErrorLike {
  response?: {
    status?: number;
  };
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

    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (storedUser) return;

    api.get('/me')
      .then((res) => {
        const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
        storage.setItem('user', JSON.stringify(res.data));
      })
      .catch((error: ApiErrorLike) => {
        if (error.response?.status !== 401) return;

        clearDataCache();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');

        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
      });
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-[#C9952A] border-t-transparent animate-spin" />
          </div>
      }>
        <Routes>
          <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
          {/* Main Layout wrapper for all authenticated routes */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            {/* VPAA Routes */}
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/schedules" element={<VpaaSchedules />} />
            <Route path="/schedules/approval" element={<VpaaScheduleApprovalPage />} />
            <Route path="/faculty" element={<VpaaFaculty />} />
            <Route path="/rooms" element={<VpaaRooms />} />
            <Route path="/users" element={<VpaaUsers />} />
            <Route path="/departments" element={<Departments />} />
            <Route path="/reports" element={<VpaaReports />} />
            <Route path="/settings" element={<Settings />} />

            {/* Dean Routes */}
            <Route path="/dean/dashboard" element={<DashboardRoute />} />
            <Route path="/dean/schedules" element={<DeanSchedules />} />
            <Route path="/dean/schedules/approval" element={<DeanScheduleApprovalPage />} />
            <Route path="/dean/faculty" element={<DeanFaculty />} />
            <Route path="/dean/rooms" element={<DeanRooms />} />
            <Route path="/dean/reports" element={<DeanReports />} />
            <Route path="/dean/users" element={<DeanUsers />} />

            {/* Secretary Routes */}
            <Route path="/secretary/dashboard" element={<DashboardRoute />} />
            <Route path="/secretary/schedules" element={<SecretarySchedules />} />
            <Route path="/secretary/rooms" element={<SecretaryRooms />} />
            <Route path="/secretary/courses" element={<SecretaryCourses />} />
            <Route path="/secretary/subjects" element={<SecretaryCourses />} />
            <Route path="/secretary/sections" element={<SecretarySections />} />
            <Route path="/secretary/instructors" element={<SecretaryFaculty />} />
            <Route path="/secretary/instructor-assignment" element={<InstructorAssignment />} />
            
            {/* Program Head Routes */}
            <Route path="/program_head/dashboard" element={<DashboardRoute />} />
            <Route path="/program_head/schedules" element={<ProgramHeadSchedules />} />
            <Route path="/program_head/faculty" element={<ProgramHeadFaculty />} />
            <Route path="/program_head/rooms" element={<ProgramHeadRooms />} />
            <Route path="/program_head/instructor-assignment" element={<InstructorAssignment />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
