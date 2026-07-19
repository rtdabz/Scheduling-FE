import { useEffect, useRef, useState } from 'react';
import Skeleton from '../ui/Skeleton';
import type { NavSection, NavItem } from '../../navigation/types';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LogOut, RefreshCw, Settings, User, X } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { clearDataCache } from '../../lib/dataCache';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  navItems: NavSection[];
}

interface StoredUser {
  name?: string;
  username?: string;
  role?: string;
}

interface ScheduleRecord {
  department_id: number | string;
  status: string;
}

const getStoredUser = (): StoredUser | null => {
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson) as StoredUser;
  } catch {
    return null;
  }
};

const getInitials = (name?: string): string => {
  return name?.split(' ').map((part) => part[0]).join('').toUpperCase() || 'AD';
};

const formatRole = (role?: string): string => {
  const roles: Record<string, string> = {
    vpaa: 'VPAA',
    dean: 'Dean',
    secretary: 'Secretary',
    program_head: 'Program Head',
  };
  const normalizedRole = role?.toLowerCase() ?? '';
  return roles[normalizedRole] || role || 'User';
};

export default function Sidebar({ isOpen, onClose, onToggleSidebar, navItems }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = getStoredUser();
  const role = user?.role?.toLowerCase() ?? '';
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isCountLoading, setIsCountLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (role !== 'dean' && role !== 'vpaa') {
      return;
    }

    const controller = new AbortController();

    const loadPendingCount = async () => {
      setIsCountLoading(true);
      try {
        const response = await api.get<ScheduleRecord[]>('/schedules', { signal: controller.signal });
        const targetStatus = role === 'vpaa' ? 'approved_by_dean' : 'submitted';
        const pendingDepartments = new Set(
          response.data
            .filter((schedule) => schedule.status === targetStatus)
            .map((schedule) => String(schedule.department_id))
        );
        setPendingCount(pendingDepartments.size);
      } catch {
        if (!controller.signal.aborted) {
          setPendingCount(0);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsCountLoading(false);
        }
      }
    };

    loadPendingCount();

    return () => controller.abort();
  }, [location.pathname, role]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const isChildActive = (item: NavItem) => {
    if (!item.children) return false;
    return item.children.some((child) => child.path && location.pathname === child.path);
  };

  const isExpanded = (item: NavItem) => {
    if (expandedItems[item.label] !== undefined) {
      return expandedItems[item.label];
    }
    return isChildActive(item);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await api.post('/logout');
    } catch {
      setShowProfile(false);
    } finally {
      clearDataCache();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      toast.success('Logged Out', 'You have been successfully signed out.');
      navigate('/');
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      className={`
        fixed left-0 top-0 z-40 h-screen
        bg-[#4e0a10] border-r border-white/5
        flex flex-col
        transition-all duration-300 ease-in-out
        ${isOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
      `}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        className="absolute -right-7 top-24 z-10 hidden h-12 w-7 items-center justify-center rounded-r-full border border-l-0 border-[#C9952A]/30 bg-[#4e0a10] text-[#E8D5C4] shadow-lg shadow-black/20 transition-all duration-300 hover:border-[#C9952A]/60 hover:bg-[#641017] hover:text-white md:flex"
        aria-label={isOpen ? 'Collapse navigation menu' : 'Expand navigation menu'}
        aria-expanded={isOpen}
        aria-controls="primary-navigation"
      >
        {isOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
      </button>

      <div className={`flex h-16 flex-shrink-0 items-center border-b border-white/10 ${isOpen ? 'justify-between px-4' : 'justify-center px-0'}`}>
        <div className="flex min-w-0 items-center">
          <img
            src={logo}
            alt="TCC Logo"
            className="h-10 w-10 flex-shrink-0 rounded-full object-contain ring-2 ring-[#C9952A]/40 ring-offset-2 ring-offset-[#4e0a10] transition-transform duration-500 hover:rotate-12"
          />
          {isOpen && (
            <div className="ml-3 flex min-w-0 items-baseline gap-1 whitespace-nowrap">
              <span className="font-display bg-gradient-to-r from-white to-[#E8D5C4] bg-clip-text text-lg font-extrabold tracking-wider text-transparent">TCC</span>
              <span className="text-sm font-bold uppercase tracking-tight text-[#C9952A]">Scheduling</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-transparent p-2 text-[#E8D5C4] transition-all duration-300 hover:border-white/5 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Close navigation menu"
          aria-expanded={isOpen}
          aria-controls="primary-navigation"
        >
          <X size={18} />
        </button>
      </div>

      <nav id="primary-navigation" aria-label="Primary navigation" className="flex-1 overflow-y-auto overscroll-contain px-3 py-5 text-[#E8D5C4] md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
        {navItems.map((section) => (
          <div key={section.section} className="mb-6 last:mb-0">
            {isOpen && (
              <div className="mb-2 px-2">
                <h4 className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E8D5C4]/40">
                  {section.section}
                </h4>
              </div>
            )}

            <div className="flex flex-col gap-1">
              {section.items.map((item) => {
                if (item.children) {
                  const expanded = isExpanded(item);
                  const hasActiveChild = isChildActive(item);
                  return (
                    <div key={item.label} className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.label)}
                        id={item.id}
                        className={`
                          w-full flex items-center h-10 rounded-lg
                          transition-all duration-200 cursor-pointer text-left
                          ${isOpen ? 'gap-3 px-3 justify-between' : 'justify-center px-0'}
                          ${hasActiveChild ? 'sidebar-item-active' : 'sidebar-item-hover text-[#E8D5C4]'}
                        `}
                        aria-expanded={expanded}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon && <item.icon size={18} className="flex-shrink-0" aria-hidden="true" />}
                          {isOpen && (
                            <span className="whitespace-nowrap text-sm font-medium">
                              {item.label}
                            </span>
                          )}
                        </div>
                        {isOpen && (
                          expanded ? <ChevronUp size={16} className="text-[#E8D5C4]/60" /> : <ChevronDown size={16} className="text-[#E8D5C4]/60" />
                        )}
                      </button>

                      {expanded && isOpen && (
                        <div className="mt-1 flex flex-col gap-1">
                          {item.children.map((child) => {
                            const isChildPathActive = location.pathname === child.path;
                            return (
                              <NavLink
                                key={child.path}
                                to={child.path || ''}
                                id={child.id}
                                className={`
                                  flex items-center h-9 rounded-lg pl-8 pr-3 gap-2.5
                                  transition-all duration-200 cursor-pointer
                                  ${isChildPathActive ? 'sidebar-item-active' : 'sidebar-item-hover text-[#E8D5C4]'}
                                `}
                                onClick={() => {
                                  if (window.innerWidth < 768) {
                                    onClose();
                                  }
                                }}
                              >
                                {child.icon && <child.icon size={16} className="flex-shrink-0" aria-hidden="true" />}
                                <span className="whitespace-nowrap text-xs font-medium">
                                  {child.label}
                                </span>
                                {child.id === 'sidebar-schedule-approval' && pendingCount > 0 && (
                                  isCountLoading ? (
                                    <Skeleton className="ml-auto h-4 w-6 rounded-full bg-white/20" />
                                  ) : (
                                    <span className="ml-auto rounded-full bg-[#C9952A] px-1.5 py-0.5 text-[10px] font-bold text-[#4e0a10]">
                                      {pendingCount >= 9 ? '9+' : pendingCount}
                                    </span>
                                  )
                                )}
                              </NavLink>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={item.path}
                    to={item.path || ''}
                    id={item.id}
                    className={({ isActive }) => `
                      flex items-center h-10 rounded-lg
                      transition-all duration-200 cursor-pointer
                      ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'}
                      ${isActive ? 'sidebar-item-active' : 'sidebar-item-hover text-[#E8D5C4]'}
                    `}
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        onClose();
                      }
                    }}
                  >
                    {item.icon && <item.icon size={18} className="flex-shrink-0" aria-hidden="true" />}
                    {isOpen && (
                      <span className="whitespace-nowrap text-sm font-medium">
                        {item.label}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-white/10 p-3">
        <div className="relative" ref={profileRef} id="sidebar-profile">
          <button
            type="button"
            onClick={() => {
              setShowProfile((current) => !current);
            }}
            className={`flex w-full items-center rounded-xl border border-transparent p-1 transition-all duration-300 hover:border-white/5 hover:bg-white/10 ${
              isOpen ? 'gap-3 pr-3' : 'justify-center'
            } ${showProfile ? 'border-white/10 bg-white/10' : ''}`}
            aria-label="Open user menu"
            aria-expanded={showProfile}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7B1113] to-[#C9952A] shadow-sm ring-2 ring-white/10">
              <span className="font-display text-sm font-bold text-white">
                {getInitials(user?.name)}
              </span>
            </div>

            {isOpen && (
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-sm font-semibold leading-none text-white">
                  {user?.name || 'Administrator'}
                </span>
                <span className="mt-1 truncate text-xs font-medium leading-none text-[#E8D5C4]/60">
                  {formatRole(user?.role)}
                </span>
              </div>
            )}

            {isOpen && (
              <ChevronRight className={`h-4 w-4 flex-shrink-0 text-[#E8D5C4]/60 transition-transform duration-200 ${showProfile ? 'rotate-90 text-[#C9952A]' : ''}`} />
            )}
          </button>

          {showProfile && (
            <div className="absolute bottom-12 left-0 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200/80 bg-[#F7F4F0] shadow-2xl md:bottom-0 md:left-full md:ml-3">
              <div className="flex flex-col gap-0.5 border-b border-gray-100 bg-gray-50/50 p-4">
                <p className="text-sm font-bold leading-tight text-gray-800">{user?.name || 'Administrator'}</p>
                <p className="truncate text-xs font-medium text-gray-500">{user?.username || 'admin'}@tcc.edu.ph</p>
                <span className="mt-1.5 inline-flex w-fit rounded-full border border-[#4e0a10]/10 bg-[#4e0a10]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7B1113]">
                  {formatRole(user?.role)}
                </span>
              </div>
              <div className="space-y-0.5 p-2">
                <button className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-[#4e0a10]/5 hover:text-[#7B1113]">
                  <User size={16} className="text-[#C9952A]" /> My Profile
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-[#4e0a10]/5 hover:text-[#7B1113]">
                  <Settings size={16} className="text-[#C9952A]" /> Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('restart-tour'));
                    setShowProfile(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-bold text-[#C9952A] transition-all duration-200 hover:bg-[#C9952A]/10"
                >
                  <RefreshCw size={16} className="text-[#C9952A]" /> Restart Tour
                </button>
              </div>
              <div className="border-t border-gray-100 p-2">
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-bold text-red-600 transition-all duration-200 hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isLoggingOut ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-red-600 border-t-transparent animate-spin" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <LogOut size={16} /> Log Out
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
