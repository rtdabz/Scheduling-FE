import { useEffect, useRef, useState } from 'react';
import Skeleton from '../ui/Skeleton';
import type { NavSection, NavItem } from '../../navigation/types';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import campusBg from '../../assets/campus-bg.jpg';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, LogOut, RefreshCw, Settings, User, X } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  navItems: NavSection[];
}

interface DepartmentInfo {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

interface StoredUser {
  id?: number;
  name?: string;
  username?: string;
  email?: string | null;
  role?: string;
  profile_picture?: string | null;
  photo?: string | null;
  avatar?: string | null;
  department_id?: number | null;
  department?: DepartmentInfo | null;
}

interface PendingDepartmentCountResponse {
  count: number;
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
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(getStoredUser());
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const user = currentUser ?? getStoredUser();
  const role = user?.role?.toLowerCase() ?? '';
  const userPhoto = user?.profile_picture || user?.photo || user?.avatar || null;
  const userDepartment = user?.department || departments.find(d => d.id === user?.department_id) || null;
  const deptLogo = userDepartment?.logo || null;
  const deptName = userDepartment?.department_name || (role === 'vpaa' ? 'Vice President for Academic Affairs' : null);
  const deptCode = userDepartment?.department_code || (role === 'vpaa' ? 'VPAA' : null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isCountLoading, setIsCountLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.post('/logout');
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      setIsLoggingOut(false);
      toast.success('Logged Out', 'You have been successfully logged out.');
      navigate('/login');
    }
  };

  useEffect(() => {
    api.get<StoredUser>('/me')
      .then((res) => {
        if (res.data) {
          setCurrentUser(res.data);
          const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
          storage.setItem('user', JSON.stringify(res.data));
        }
      })
      .catch(() => {});

    api.get<DepartmentInfo[]>('/departments')
      .then((res) => {
        if (res.data) setDepartments(res.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (role !== 'dean' && role !== 'vpaa') {
      return;
    }

    const controller = new AbortController();

    const loadPendingCount = async () => {
      setIsCountLoading(true);
      try {
        const response = await api.get<PendingDepartmentCountResponse>(
          '/schedules/pending-department-count',
          { signal: controller.signal }
        );
        setPendingCount(response.data.count);
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

    const timeoutId = window.setTimeout(loadPendingCount, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [role]);

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

  return (
    <div
      className={`
        fixed left-0 top-0 z-40 h-screen
        bg-[#4e0a10]
        flex flex-col
        transition-all duration-300 ease-in-out
        ${isOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
      `}
    >
      {/* Background Campus Image with Maroon Overlay (reused from LoginPage) */}
      <div className="absolute inset-y-0 left-0 w-[calc(100%+3rem)] pointer-events-none overflow-hidden [clip-path:polygon(0_0,100%_0,calc(100%_-_3rem)_4rem,calc(100%_-_3rem)_100%,0_100%)]">
        <img
          src={campusBg}
          alt="Campus Background"
          className="w-full h-full object-cover opacity-35 filter contrast-105 saturate-110 object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#36060b] via-[#4e0a10]/80 to-[#5A1220]/70 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      </div>

      <button
        type="button"
        onClick={onToggleSidebar}
        title={isOpen ? 'Collapse navigation menu' : 'Expand navigation menu'}
        className="absolute -right-12 top-0 z-20 hidden h-16 w-12 items-start justify-start pt-3 pl-2.5 bg-transparent text-[#E8D5C4] transition-all duration-200 hover:bg-[#C9952A]/90 hover:text-white md:flex cursor-pointer [clip-path:polygon(0_0,_100%_0,_0_100%)] drop-shadow-lg"
        aria-label={isOpen ? 'Collapse navigation menu' : 'Expand navigation menu'}
        aria-expanded={isOpen}
        aria-controls="primary-navigation"
      >
        {isOpen ? <ChevronLeft size={19} /> : <ChevronRight size={19} />}
      </button>

      <div className={`relative z-10 flex min-h-[4.25rem] py-3 flex-shrink-0 items-center border-b border-white/10 ${isOpen ? 'justify-between px-4' : 'justify-center px-0'}`}>
        <div className="flex min-w-0 items-center">
          <img
            src={deptLogo || logo}
            alt={deptName || "TCC Logo"}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover ring-2 ring-[#C9952A]/40 ring-offset-2 ring-offset-[#4e0a10] transition-transform duration-500 hover:rotate-12"
          />
          {isOpen && (
            <div className="ml-3 flex min-w-0 flex-col justify-center">
              <div className="flex items-baseline gap-1 whitespace-nowrap leading-none">
                <span className="font-display bg-gradient-to-r from-white to-[#E8D5C4] bg-clip-text text-base font-extrabold tracking-wider text-transparent">TCC</span>
                <span className="text-xs font-bold uppercase tracking-tight text-[#C9952A]">Scheduling</span>
              </div>
              {deptName && (
                <span className="text-[10.5px] font-bold text-[#E8D5C4] tracking-wide leading-snug mt-1 whitespace-normal break-words" title={deptName}>
                  {deptName}
                </span>
              )}
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

      <nav id="primary-navigation" aria-label="Primary navigation" className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-3 py-5 text-[#E8D5C4] md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
        {navItems.map((section, sectionIdx) => (
          <div key={section.section} className="mb-4 last:mb-0">
            {sectionIdx > 0 && (
              <div className="my-3 border-t border-white/10 mx-1" />
            )}
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

      <div className="relative z-10 flex-shrink-0 border-t border-white/10 p-3">
        <div className="relative" ref={profileRef} id="sidebar-profile">
          <button
            type="button"
            onClick={() => {
              setShowProfile((current) => !current);
            }}
            title="Open user profile menu"
            className={`flex w-full items-center rounded-xl border border-transparent p-1 transition-all duration-300 hover:border-white/5 hover:bg-white/10 ${
              isOpen ? 'gap-3 pr-3' : 'justify-center'
            }`}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7B1113] to-[#C9952A] shadow-sm ring-2 ring-white/10 overflow-hidden">
              {userPhoto ? (
                <img src={userPhoto} alt={user?.name || 'User'} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-sm font-bold text-white">
                  {getInitials(user?.name)}
                </span>
              )}
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
              <ChevronsUpDown className={`h-4 w-4 flex-shrink-0 text-[#E8D5C4]/60 transition-colors duration-200 ${showProfile ? 'text-[#C9952A]' : ''}`} />
            )}
          </button>

          {showProfile && (
            <div className={`absolute z-50 overflow-hidden rounded-2xl border border-slate-200/80 bg-[#F7F4F0] shadow-2xl transition-all duration-200 ${
              isOpen 
                ? 'bottom-full left-0 right-0 mb-2 w-full' 
                : 'bottom-0 left-full ml-3 w-60'
            }`}>
              <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 p-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7B1113] to-[#C9952A] shadow-md ring-2 ring-white/20 overflow-hidden">
                  {userPhoto ? (
                    <img src={userPhoto} alt={user?.name || 'User'} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-display text-base font-bold text-white">
                      {getInitials(user?.name)}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm font-bold leading-tight text-gray-800 truncate">{user?.name || 'Administrator'}</p>
                  <p className="truncate text-xs font-medium text-gray-500">
                    {user?.email?.trim() || (user?.username?.includes('@') ? user.username : '')}
                  </p>
                  <span className="mt-1 inline-flex w-fit rounded-full border border-[#4e0a10]/10 bg-[#4e0a10]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7B1113]">
                    {formatRole(user?.role)}
                  </span>
                </div>
              </div>
              <div className="space-y-0.5 p-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfile(false);
                    navigate(`/${role || 'vpaa'}/settings`);
                  }}
                  title="View profile details"
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-[#4e0a10]/5 hover:text-[#7B1113] cursor-pointer"
                >
                  <User size={16} className="text-[#C9952A]" /> My Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfile(false);
                    navigate(`/${role || 'vpaa'}/settings`);
                  }}
                  title="Configure settings"
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-[#4e0a10]/5 hover:text-[#7B1113] cursor-pointer"
                >
                  <Settings size={16} className="text-[#C9952A]" /> Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('restart-tour'));
                    setShowProfile(false);
                  }}
                  title="Restart guided tour"
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
                  title="Sign out of the system"
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
