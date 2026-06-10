import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'

// VPAA Pages
import DashboardPage from './pages/vpaa/DashboardPage'
import Schedules from './pages/vpaa/Schedules'
import Faculty from './pages/vpaa/Faculty'
import Rooms from './pages/vpaa/Rooms'
import Users from './pages/vpaa/Users'
import Departments from './pages/vpaa/Departments'

// Other Role Pages
import DeanDashboard from './pages/dean/DashboardPage'
import SecPHDashboard from './pages/secretary/DashboardPage'
import ProgramHeadDashboard from './pages/program_head/DashboardPage'

import AppLayout from './components/layout/AppLayout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        
        {/* Main Layout wrapper for all authenticated routes */}
        <Route element={<AppLayout />}>
          {/* VPAA Routes */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/faculty" element={<Faculty />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/users" element={<Users />} />
          <Route path="/departments" element={<Departments />} />

          {/* Dean Routes */}
          <Route path="/dean/dashboard" element={<DeanDashboard />} />
          <Route path="/dean/schedules" element={<Schedules />} /> {/* Shared pages for now */}
          <Route path="/dean/faculty" element={<Faculty />} />
          <Route path="/dean/rooms" element={<Rooms />} />

          {/* Secretary Routes */}
          <Route path="/sec_ph/dashboard" element={<SecPHDashboard />} />
          <Route path="/sec_ph/schedules" element={<Schedules />} />
          
          {/* Program Head Routes */}
          <Route path="/program_head/dashboard" element={<ProgramHeadDashboard />} />
          <Route path="/program_head/schedules" element={<Schedules />} />
          <Route path="/program_head/faculty" element={<Faculty />} />
          <Route path="/program_head/rooms" element={<Rooms />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
