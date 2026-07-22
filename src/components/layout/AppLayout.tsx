import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { vpaaNav } from '../../navigation/vpaaNav'
import { deanNav } from '../../navigation/deanNav'
import { secretaryNav } from '../../navigation/secretaryNav'
import { programHeadNav } from '../../navigation/programHeadNav'
import type { NavItem, NavSection } from '../../navigation/types'
import { ChevronRight } from 'lucide-react'

interface StoredUser {
  role?: string
}

interface PageTitleConfig {
  title: string
  breadcrumb: string
  subtitle: string
}

const pageSubtitles: Record<string, string> = {
  'Schedule Builder': 'Build, review, and manage section class schedules.',
  'Instructor Assignment': 'Assign eligible instructors to plotted class schedules.',
  Sections: 'Manage academic sections for scheduling operations.',
  Instructors: 'Manage instructor records, departments, and teaching load.',
  Rooms: 'Manage room records, room types, and department assignments.',
  Courses: 'Manage course records and scheduling requirements.',
  Subjects: 'Manage course records and scheduling requirements.',
  'Activity Log': 'Review recent scheduling and system activity.',
  Settings: 'Manage account and system preferences.',
  'User Management': 'Manage user accounts, roles, and access.',
  Departments: 'Manage department records and academic ownership.',
  Faculty: 'Manage faculty records and teaching assignments.',
  Schedules: 'Review and monitor class schedules.',
  Reports: 'View and export scheduling reports.',
}

const findActiveNavItem = (items: NavSection[], pathname: string): NavItem | null => {
  for (const section of items) {
    for (const item of section.items) {
      if (item.path === pathname) {
        return item
      }

      const activeChild = item.children?.find((child) => child.path === pathname)
      if (activeChild) {
        return activeChild
      }
    }
  }

  return null
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const location = useLocation()

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
  const activeNavItem = findActiveNavItem(navItems, location.pathname)
  const shouldShowPageTitle = Boolean(activeNavItem && !activeNavItem.label.toLowerCase().includes('dashboard'))
  const pageTitle: PageTitleConfig | null = activeNavItem
    ? {
        title: activeNavItem.label,
        breadcrumb: `Home / ${activeNavItem.label}`,
        subtitle: pageSubtitles[activeNavItem.label] ?? `Manage ${activeNavItem.label.toLowerCase()} records and related scheduling information.`,
      }
    : null

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
        className={`
          flex flex-col flex-1 min-w-0 overflow-hidden
          transition-all duration-300
        `}
      >
        <main className="flex-1 overflow-y-auto p-4 pt-16 sm:p-6 sm:pt-6 md:p-8">
          {shouldShowPageTitle && pageTitle && (
            <div className="mb-6">
              <p className="text-muted text-xs tracking-wider uppercase">{pageTitle.breadcrumb}</p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#1f2937]">{pageTitle.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{pageTitle.subtitle}</p>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
