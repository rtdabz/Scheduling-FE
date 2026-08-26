import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import HelperBuddyChat from '../help/HelperBuddyChat'
import PageHeader from './PageHeader'
import Sidebar from './Sidebar'
import SystemHeader from './SystemHeader'
import { useActiveTerm } from '../../hooks/useActiveTerm'
import { getStoredUser } from '../../lib/storedUser'
import { vpaaNav } from '../../navigation/vpaaNav'
import { deanNav } from '../../navigation/deanNav'
import { secretaryNav } from '../../navigation/secretaryNav'
import { programHeadNav } from '../../navigation/programHeadNav'
import RoleOnboarding from '../onboarding/RoleOnboarding'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const location = useLocation()
  const { term: activeTerm } = useActiveTerm()

  const user = getStoredUser()

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
  const role = user?.role?.toLowerCase()
  const homePath = role === 'dean'
    ? '/dean/dashboard'
    : role === 'secretary'
      ? '/secretary/dashboard'
      : role === 'program_head'
        ? '/program_head/dashboard'
        : '/dashboard'
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen])

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches
    if (!isMobile || !sidebarOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [sidebarOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F4F0]">

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-150 md:hidden ${sidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        navItems={navItems}
      />

      <div className={`
        flex-shrink-0 transition-[width] duration-150 ease-out
        ${sidebarOpen ? 'w-0 md:w-64' : 'w-0 md:w-16'}
      `} />

      {/* Main content */}
      <div
        className="flex flex-col flex-1 min-w-0 overflow-hidden"
      >
        <SystemHeader activeTerm={activeTerm} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4 md:px-8 md:pb-8 md:pt-4">
          <PageHeader navItems={navItems} homePath={homePath} />
          <Outlet />
        </main>
      </div>
      <HelperBuddyChat />
      <RoleOnboarding onOpenSidebar={() => setSidebarOpen(true)} />
    </div>
  )
}
