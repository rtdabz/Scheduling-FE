import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
// import { HelperBuddy } from '../HelperBuddy'
import Sidebar from './Sidebar'
import NotificationBell from '../notifications/NotificationBell'
import { useActiveTerm } from '../../hooks/useActiveTerm'
import { academicYearLabel, semesterLabel } from '../../lib/termLabel'
import { CalendarDays } from 'lucide-react'
import { vpaaNav } from '../../navigation/vpaaNav'
import { deanNav } from '../../navigation/deanNav'
import { secretaryNav } from '../../navigation/secretaryNav'
import { programHeadNav } from '../../navigation/programHeadNav'
import { ChevronRight } from 'lucide-react'

import { useTour } from '../../hooks/useTour'

interface StoredUser {
  role?: string
}

export default function AppLayout() {
  useTour()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const location = useLocation()
  const { term: activeTerm } = useActiveTerm()

  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;

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
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-0 top-5 z-30 flex h-11 w-9 items-center justify-center rounded-r-xl border border-l-0 border-white/10 bg-[#4e0a10] text-[#E8D5C4] shadow-lg shadow-black/20 transition-colors hover:bg-[#641017] hover:text-white md:hidden"
          aria-label="Open navigation menu"
          aria-controls="primary-navigation"
          aria-expanded={sidebarOpen}
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        navItems={navItems}
      />

      <div className={`
        flex-shrink-0 transition-all duration-300
        ${sidebarOpen ? 'w-0 md:w-64' : 'w-0 md:w-16'}
      `} />

      {/* Main content */}
      <div
        className="flex flex-col flex-1 min-w-0 overflow-hidden"
      >
        {/*
          Shell bar. Sits outside the scroll container so the bell stays put. It
          doubles as the page's top margin rather than adding a band of its own,
          so main's top padding is trimmed to match on sm+. Mobile keeps p-4 so the
          bar plus that padding still clears the fixed sidebar tab.
        */}
        <div className="flex shrink-0 items-center justify-end gap-2 px-4 pt-2 sm:gap-3 sm:px-6 md:px-8">
          {activeTerm && (
            <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[11px] shadow-sm">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#4e0a10]" />
              <span className="hidden font-semibold text-slate-500 sm:inline">Active Semester:</span>
              <span className="truncate font-bold text-[#4e0a10]">{semesterLabel(activeTerm.semester)}</span>
              {activeTerm.academic_year && (
                <span className="hidden shrink-0 font-semibold text-slate-400 md:inline">&middot; {academicYearLabel(activeTerm.academic_year)}</span>
              )}
            </div>
          )}
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 sm:pt-1 md:p-8 md:pt-1">
          <Outlet />
        </main>
      </div>
      {/* <HelperBuddy message={helperMessage} /> */}
    </div>
  )
}
