import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import { vpaaNav } from '../../navigation/vpaaNav'
import { deanNav } from '../../navigation/deanNav'
import { secretaryNav } from '../../navigation/secretaryNav'
import { programHeadNav } from '../../navigation/programHeadNav'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()

  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;

  const getNavItems = () => {
    const role = user?.role?.toLowerCase();

    if (role === 'vpaa') return vpaaNav;
    if (role === 'dean') return deanNav;
    if (role === 'secretary') return secretaryNav;
    if (role === 'program_head') return programHeadNav;

    if (location.pathname.startsWith('/dean')) return deanNav;
    if (location.pathname.startsWith('/secretary')) return secretaryNav;
    if (location.pathname.startsWith('/program_head')) return programHeadNav;
    return vpaaNav;
  }

  const navItems = getNavItems()

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F4F0]">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        navItems={navItems}
      />

      <div className={`
        flex-shrink-0 transition-all duration-300
        ${sidebarOpen ? 'w-0 md:w-64' : 'w-0 md:w-16'}
      `} />

      {/* Main content */}
      <div
        className={`
          flex flex-col flex-1 min-w-0 overflow-hidden
          transition-all duration-300
        `}
      >
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 mt-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
