import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import PageHeader from './PageHeader'
import Sidebar from './Sidebar'
import SystemHeader from './SystemHeader'
import SessionTimeoutGuard from './SessionTimeoutGuard'
import Skeleton from '../ui/Skeleton'
import { useActiveSemester } from '../../hooks/useActiveSemester'
import { getStoredUser, hasStoredCapability, type StoredUser } from '../../lib/storedUser'
import api from '../../lib/api'
import { startLiveUpdates } from '../../lib/liveUpdates'
import { vpaaNav } from '../../navigation/vpaaNav'
import { deanNav } from '../../navigation/deanNav'
import { secretaryNav } from '../../navigation/secretaryNav'
import { programHeadNav } from '../../navigation/programHeadNav'
import { directorNav } from '../../navigation/directorNav'
import type { NavItem, NavSection } from '../../navigation/types'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const location = useLocation()
  const { semester: activeSemester } = useActiveSemester()

  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser())
  const userId = user?.id

  // One live-updates connection for the signed-in shell; sign-out closes it.
  useEffect(() => {
    if (userId) void startLiveUpdates(Number(userId))
  }, [userId])

  useEffect(() => {
    api.get<StoredUser>('/me')
      .then(({ data }) => {
        if (!data) return
        const storage = localStorage.getItem('token') ? localStorage : sessionStorage
        storage.setItem('user', JSON.stringify(data))
        setUser(data)
      })
      .catch(() => {})
  }, [])

  const annotateItems = (items: NavItem[]): NavItem[] => {
    return items.map((item) => {
      const isItemLocked = Boolean(item.requiredCapability && !hasStoredCapability(item.requiredCapability));
      const children = item.children ? annotateItems(item.children) : undefined;
      const allChildrenLocked = Boolean(children && children.length > 0 && children.every((c) => c.isLocked));
      return {
        ...item,
        isLocked: isItemLocked || allChildrenLocked,
        children,
      };
    });
  };

  const processNav = (nav: NavSection[]): NavSection[] => {
    return nav.map((section) => ({
      ...section,
      items: annotateItems(section.items),
    }));
  };

  const getNavItems = (): NavSection[] => {
    const role = user?.role?.toLowerCase();

    if (role === 'vpaa') return processNav(vpaaNav);
    if (role === 'dean') return processNav(deanNav);
    if (role === 'secretary') return processNav(secretaryNav);
    if (role === 'program_head') return processNav(programHeadNav);
    if (role === 'director') return processNav(directorNav);

    if (location.pathname.startsWith('/dean')) return processNav(deanNav);
    if (location.pathname.startsWith('/secretary')) return processNav(secretaryNav);
    if (location.pathname.startsWith('/program_head')) return processNav(programHeadNav);
    return processNav(vpaaNav);
  }

  const navItems = getNavItems()
  const role = user?.role?.toLowerCase()
  const homePath = role === 'dean'
    ? '/dean/dashboard'
    : role === 'secretary'
      ? '/secretary/dashboard'
        : role === 'program_head'
        ? '/program_head/dashboard'
        : role === 'director'
          ? '/director/dashboard'
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
    // `fixed inset-0` rather than `h-screen`: an h-screen shell still sits in
    // document flow, so the browser kept its own window scrollbar alongside
    // <main>'s — two vertical scrollbars, side by side. Taking the shell out of
    // flow leaves <main> as the only scroller on the page.
    <div className="fixed inset-0 flex overflow-hidden bg-[#F7F4F0]">

      {/* Ends the session and explains why after a spell of inactivity. */}
      <SessionTimeoutGuard />

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
        <SystemHeader activeSemester={activeSemester} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <PageHeader navItems={navItems} homePath={homePath} />
          <Suspense fallback={
            <div className="space-y-4" aria-busy="true" aria-label="Loading module">
              <Skeleton className="h-8 w-64 rounded-lg" />
              <Skeleton className="h-4 w-96 max-w-full rounded" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
              </div>
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
