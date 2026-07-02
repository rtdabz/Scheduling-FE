// PROBLEM EXPLANATION:
// The error "Cannot find module './pages/vpaa/Settings'" occurs because 'Settings.tsx' was recently created
// and was untracked by Git, which causes the IDE's TypeScript language server on Windows to fail to resolve
// the new file path in the workspace.
// 
// HOW TO FIX/RESOLVED:
// 1. We staged the file using `git add src/pages/vpaa/Settings.tsx` to make it tracked.
// 2. If your IDE/editor still shows this error, please reload your IDE or restart the TypeScript server
//    (in VS Code: press Ctrl+Shift+P, and select "TypeScript: Restart TS Server") to clear the diagnostics cache.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage';
import type { UserRole } from './pages/Dashboard';
import AppLayout from './components/layout/AppLayout';

// VPAA Pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
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

const getDashboardRole = (): UserRole | string => {
  const userJson = localStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;

  return user?.role?.toLowerCase() || '';
};

const DashboardRoute = () => <Dashboard role={getDashboardRole()} />;

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
              <p className="text-muted text-sm">Loading...</p>
          </div>
      }></Suspense>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        
        {/* Main Layout wrapper for all authenticated routes */}
        <Route element={<AppLayout />}>
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
          <Route path="/sec_ph/dashboard" element={<DashboardRoute />} />
          <Route path="/sec_ph/schedules" element={<SecPHSchedules />} />
          <Route path="/sec_ph/rooms" element={<Rooms />} />
          
          {/* Program Head Routes */}
          <Route path="/program_head/dashboard" element={<DashboardRoute />} />
          <Route path="/program_head/schedules" element={<ProgramHeadSchedules />} />
          <Route path="/program_head/faculty" element={<Faculty />} />
          <Route path="/program_head/rooms" element={<Rooms />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
