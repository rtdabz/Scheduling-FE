import { useEffect, useState } from 'react';
import type { NavSection, NavItem } from '../../navigation/types';
import Skeleton from '../ui/Skeleton';
import { NavLink, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import campusBg from '../../assets/campus-bg.jpg';
import { ChevronDown, ChevronUp, Compass, X } from 'lucide-react';
import api from '../../lib/api';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavSection[];
}

interface DepartmentInfo {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

interface ProgramInfo {
  id: number;
  code?: string | null;
  name?: string | null;
  cluster?: string | null;
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
  program_id?: number | null;
  program?: ProgramInfo | null;
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

export default function Sidebar({ isOpen, onClose, navItems }: SidebarProps) {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(getStoredUser());
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const user = currentUser ?? getStoredUser();
  const role = user?.role?.toLowerCase() ?? '';
  const userDepartment = user?.department || departments.find(d => d.id === user?.department_id) || null;
  const deptLogo = userDepartment?.logo || null;
  const deptName = userDepartment?.department_name || (role === 'vpaa' ? 'Vice President for Academic Affairs' : null);
  const programLabel = user?.program?.code || user?.program?.name || user?.program?.cluster || null;
  const programTitle = user?.program?.name || user?.program?.cluster || programLabel || undefined;
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isCountLoading, setIsCountLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

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
    return item.children.some((child) => {
      if (!child.path) return false;
      return location.pathname === child.path || location.pathname.startsWith(`${child.path}/`);
    });
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
        transition-[transform,width] duration-150 ease-out
        ${isOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
      `}
    >
      {/* Background Campus Image with Maroon Overlay (reused from LoginPage) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={campusBg}
          alt="Campus Background"
          className="w-full h-full object-cover opacity-35 filter contrast-105 saturate-110 object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#36060b] via-[#4e0a10]/80 to-[#5A1220]/70 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      </div>

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
              {programLabel && (
                <span
                  className="mt-1 block truncate text-[9.5px] font-semibold uppercase tracking-wide text-[#C9952A]"
                  title={programTitle}
                >
                  Program: {programLabel}
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
                            const isChildPathActive = Boolean(
                              child.path
                              && (location.pathname === child.path || location.pathname.startsWith(`${child.path}/`))
                            );
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

      <div className={`relative z-10 flex-shrink-0 border-t border-white/10 p-3 ${isOpen ? '' : 'px-2'}`}>
        <button
          id="sidebar-getting-started"
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('restart-tour'));
            if (window.innerWidth < 768) onClose();
          }}
          title="Getting Started"
          aria-label="Open Getting Started guide"
          className={`flex h-11 w-full items-center rounded-xl border border-[#C9952A]/35 bg-[#C9952A]/10 text-[#F3D37A] shadow-sm transition-all duration-200 hover:border-[#C9952A]/70 hover:bg-[#C9952A]/20 hover:text-white ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'}`}
        >
          <Compass size={18} className="flex-shrink-0" aria-hidden="true" />
          {isOpen && <span className="whitespace-nowrap text-sm font-bold">Getting Started</span>}
        </button>
      </div>

    </div>
  );
}
