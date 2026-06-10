import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/vpaa/DashboardPage'
import DeanDashboard from './pages/dean/DashboardPage'
import SecPHDashboard from './pages/secretary/DashboardPage'
import Schedules from './pages/vpaa/Schedules'
import Faculty from './pages/vpaa/Faculty'
import Rooms from './pages/vpaa/Rooms'
import Users from './pages/vpaa/Users'
import Departments from './pages/vpaa/Departments'
import AppLayout from './components/layout/AppLayout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        
        {/* VPAA Routes */}
        <Route path="/dashboard" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
        </Route>
        
        {/* Dean Routes */}
        <Route path="/dean/dashboard" element={<AppLayout />}>
          <Route index element={<DeanDashboard />} />
        </Route>

        {/* Secretary Routes */}
        <Route path="/sec_ph/dashboard" element={<AppLayout />}>
          <Route index element={<SecPHDashboard />} />
        </Route>

        <Route path="/schedules" element={<AppLayout />}>
          <Route index element={<Schedules />} />
        </Route>
        <Route path="/faculty" element={<AppLayout />}>
          <Route index element={<Faculty />} />
        </Route>
        <Route path="/rooms" element={<AppLayout />}>
          <Route index element={<Rooms />} />
        </Route>
        <Route path="/users" element={<AppLayout />}>
          <Route index element={<Users />} />
        </Route>
        <Route path="/departments" element={<AppLayout />}>
          <Route index element={<Departments />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
