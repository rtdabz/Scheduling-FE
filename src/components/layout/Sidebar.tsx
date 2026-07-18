import React, { useState, useEffect } from 'react';
import Skeleton from '../ui/Skeleton';
import type { NavSection, NavItem } from '../../navigation/types';
import { NavLink, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../lib/api';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavSection[];
}

interface StoredUser {
  role?: string;
}

interface ScheduleRecord {
  department_id: number | string;
  status: string;
}

const getStoredRole = (): string => {
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  if (!userJson) return '';

  try {
    const user = JSON.parse(userJson) as StoredUser;
    return user.role?.toLowerCase() ?? '';
  } catch {
    return '';
  }
};

export default function Sidebar({ isOpen, onClose, navItems }: SidebarProps) {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isCountLoading, setIsCountLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const role = getStoredRole();
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
  }, [location.pathname]);

  const toggleExpand = (label: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const isChildActive = (item: NavItem) => {
    if (!item.children) return false;
    return item.children.some(child => child.path && location.pathname === child.path);
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
        fixed left-0 top-16 z-40 h-[calc(100vh-4rem)]
        bg-[#4e0a10] border-r border-white/5
        flex flex-col
        transition-all duration-300 ease-in-out
        ${isOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
      `}
    >
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-white/10 px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="TCC Logo" className="h-8 w-8 flex-shrink-0 rounded-full object-contain" />
          <span className="text-sm font-bold tracking-wide text-white">Navigation</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-[#E8D5C4] transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close navigation menu"
        >
          <X size={18} />
        </button>
      </div>
 
      {/* Navigation - takes up remaining space */}
      <nav id="primary-navigation" aria-label="Primary navigation" className="flex-1 overflow-y-auto overscroll-contain px-3 py-5 text-[#E8D5C4]">
        {navItems.map((section) => (
          <div key={section.section} className="mb-6 last:mb-0">
            {/* Section label — hide when collapsed */}
            {isOpen && (
              <div className="mb-2 px-2">
                <h4 className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#E8D5C4]/40 whitespace-nowrap">
                  {section.section}
                </h4>
              </div>
            )}
 
            {/* Nav items */}
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
                          ${hasActiveChild
                            ? 'sidebar-item-active'
                            : 'sidebar-item-hover text-[#E8D5C4]'
                          }
                        `}
                        aria-expanded={expanded}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon && <item.icon size={18} className="flex-shrink-0" aria-hidden="true" />}
                          {isOpen && (
                            <span className="text-sm font-medium whitespace-nowrap">
                              {item.label}
                            </span>
                          )}
                        </div>
                        {isOpen && (
                          expanded ? <ChevronUp size={16} className="text-[#E8D5C4]/60" /> : <ChevronDown size={16} className="text-[#E8D5C4]/60" />
                        )}
                      </button>
 
                      {expanded && isOpen && (
                        <div className="flex flex-col gap-1 mt-1">
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
                                  ${isChildPathActive
                                    ? 'sidebar-item-active'
                                    : 'sidebar-item-hover text-[#E8D5C4]'
                                  }
                                `}
                                onClick={() => {
                                  if (window.innerWidth < 768) {
                                    onClose();
                                  }
                                }}
                              >
                                {child.icon && <child.icon size={16} className="flex-shrink-0" aria-hidden="true" />}
                                <span className="text-xs font-medium whitespace-nowrap">
                                  {child.label}
                                </span>
                                {child.id === 'sidebar-schedule-approval' && pendingCount > 0 && (
                                  isCountLoading ? (
                                    <Skeleton className="ml-auto h-4 w-6 rounded-full bg-white/20" />
                                  ) : (
                                    <span className="ml-auto bg-[#C9952A] text-[#4e0a10] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
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
                      ${isActive
                        ? 'sidebar-item-active'
                        : 'sidebar-item-hover text-[#E8D5C4]'
                      }
                    `}
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        onClose();
                      }
                    }}
                  >
                    {item.icon && <item.icon size={18} className="flex-shrink-0" aria-hidden="true" />}
                    {isOpen && (
                      <span className="text-sm font-medium whitespace-nowrap">
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
    </div>
  );
}
