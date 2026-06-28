import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage'

// VPAA Pages
const DashboardPage = lazy(() => import('./pages/vpaa/DashboardPage'));
const Schedules = lazy(() => import('./pages/vpaa/Schedules'));
const ScheduleApprovalPage = lazy(() => import('./pages/vpaa/ScheduleApprovalPage'));
const Faculty = lazy(() => import('./pages/vpaa/Faculty'));
const Rooms = lazy(() => import('./pages/vpaa/Rooms'));
const Users = lazy(() => import('./pages/vpaa/Users'));
const Departments = lazy(() => import('./pages/vpaa/Departments'));
const Reports = lazy(() => import('./pages/vpaa/Reports'));

// Other Role Pages
const DeanDashboard = lazy(() => import('./pages/dean/DashboardPage'));
const DeanSchedules = lazy(() => import('./pages/dean/Schedules'));
const DeanScheduleApprovalPage = lazy(() => import('./pages/dean/ScheduleApprovalPage'));
const SecPHDashboard = lazy(() => import('./pages/secretary/DashboardPage'));
const SecPHSchedules = lazy(() => import('./pages/secretary/Schedules'));
const ProgramHeadDashboard = lazy(() => import('./pages/program_head/DashboardPage'));
const ProgramHeadSchedules = lazy(() => import('./pages/program_head/Schedules'));

import AppLayout from './components/layout/AppLayout'

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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/schedules/approval" element={<ScheduleApprovalPage />} />
          <Route path="/faculty" element={<Faculty />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/users" element={<Users />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/reports" element={<Reports />} />

          {/* Dean Routes */}
          <Route path="/dean/dashboard" element={<DeanDashboard />} />
          <Route path="/dean/schedules" element={<DeanSchedules />} />
          <Route path="/dean/schedules/approval" element={<DeanScheduleApprovalPage />} />
          <Route path="/dean/faculty" element={<Faculty />} />
          <Route path="/dean/rooms" element={<Rooms />} />
          <Route path="/dean/reports" element={<Reports />} />
          <Route path="/dean/users" element={<Users />} />

          {/* Secretary Routes */}
          <Route path="/sec_ph/dashboard" element={<SecPHDashboard />} />
          <Route path="/sec_ph/schedules" element={<SecPHSchedules />} />
          
          {/* Program Head Routes */}
          <Route path="/program_head/dashboard" element={<ProgramHeadDashboard />} />
          <Route path="/program_head/schedules" element={<ProgramHeadSchedules />} />
          <Route path="/program_head/faculty" element={<Faculty />} />
          <Route path="/program_head/rooms" element={<Rooms />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
