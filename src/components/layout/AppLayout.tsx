import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import { vpaaNav } from '../../navigation/vpaaNav'
import { deanNav } from '../../navigation/deanNav'
import { secretaryNav } from '../../navigation/secretaryNav'
import { programHeadNav } from '../../navigation/programHeadNav'
import { useSessionTimeout } from '../../hooks/useSessionTimeout'
import { AlertTriangle, Clock } from 'lucide-react'

export default function AppLayout() {
  const {
    isWarningOpen,
    isExpiredOpen,
    remainingSeconds,
    staySignedIn,
    signInAgain,
  } = useSessionTimeout()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const location = useLocation()

  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
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
          className="fixed inset-0 top-16 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
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
        <main className="mt-16 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>
      </div>

      {(isWarningOpen || isExpiredOpen) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-[#F7F4F0] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#C9952A]/30 bg-[#C9952A]/15 text-[#4e0a10]">
                  {isExpiredOpen ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-black text-[#4e0a10]">
                    {isExpiredOpen ? 'Session Expired' : 'Session Timeout'}
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">
                    {isExpiredOpen
                      ? 'Your session has expired for security. Please sign in again to continue.'
                      : `You will be signed out in ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} due to inactivity.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
              {isExpiredOpen ? (
                <button
                  type="button"
                  onClick={signInAgain}
                  className="h-11 w-full rounded-xl bg-[#4e0a10] px-4 text-sm font-bold text-[#E8D5C4] transition-colors hover:bg-[#C9952A]"
                >
                  Sign In Again
                </button>
              ) : (
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={signInAgain}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Sign Out
                  </button>
                  <button
                    type="button"
                    onClick={staySignedIn}
                    className="h-11 rounded-xl bg-[#4e0a10] px-4 text-sm font-bold text-[#E8D5C4] transition-colors hover:bg-[#C9952A]"
                  >
                    Stay Signed In
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
