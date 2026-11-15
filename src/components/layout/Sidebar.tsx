import { useEffect, useState } from 'react';
import type { NavSection, NavItem } from '../../navigation/types';
import Skeleton from '../ui/Skeleton';
import { NavLink, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import campusBg from '../../assets/campus-bg.webp';
import { ChevronDown, Lock, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../lib/api';
import { fetchCurrentUser } from '../../lib/currentUser';
import { hasStoredCapability, lockedModuleMessage } from '../../lib/storedUser';
import { CROSS_DEPARTMENT_LOCKED_MESSAGE, useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { programLabel, programName } from '../../lib/programLabel';
import { prefetchPage } from '../../lib/pagePrefetch';
import { isDepartmentOfficeRole, reassignsRoomSchedulesFromFacilities } from '../../lib/roles';
import { getRecovery } from '../../lib/roomRecovery';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
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
  major?: string | null;
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

// Only Course Assignment (handing courses to another college) waits on VPAA
// approval; the Cross-Department page stays available.
const CROSS_DEPARTMENT_NAV_IDS = new Set(['sidebar-course-teaching-assignments']);

const lockCrossDepartmentItems = (items: NavItem[]): NavItem[] => items.map((item) => (
  CROSS_DEPARTMENT_NAV_IDS.has(item.id ?? '')
    ? {
      ...item,
      isLocked: true,
      lockedMessage: item.lockedMessage ?? CROSS_DEPARTMENT_LOCKED_MESSAGE,
      children: item.children ? lockCrossDepartmentItems(item.children) : undefined,
    }
    : { ...item, children: item.children ? lockCrossDepartmentItems(item.children) : undefined }
));

export default function Sidebar({ isOpen, onClose, onOpen, navItems: baseNavItems }: SidebarProps) {
  const location = useLocation();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(getStoredUser());
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const user = getStoredUser() ?? currentUser;
  const role = user?.role?.toLowerCase() ?? '';
  const userDepartment = user?.department || departments.find(d => d.id === user?.department_id) || null;
  const deptLogo = userDepartment?.logo || null;
  const deptName = userDepartment?.department_name || (role === 'vpaa' ? 'Vice President for Academic Affairs' : null);
  // Full registered program name (with major) from the user's program record; the code is only a fallback.
  const sidebarProgramLabel = programName(user?.program, '') || user?.program?.code || null;
  const programTitle = user?.program ? programLabel(user.program, '') || undefined : undefined;
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isCountLoading, setIsCountLoading] = useState(false);
  const badgeScope = `${user?.id}:${role}:${user?.department_id}`;
  const [approvalBadge, setApprovalBadge] = useState({ scope: '', count: 0 });
  const pendingCount = approvalBadge.scope === badgeScope ? approvalBadge.count : 0;
  const usersRevision = useLiveRevision(['users']);

  useEffect(() => {
    let active = true;
    fetchCurrentUser<StoredUser>({ force: usersRevision > 0 })
      .then((data) => {
        if (data && active) setCurrentUser(data);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [usersRevision]);

  useEffect(() => {
    api.get<DepartmentInfo[]>('/departments')
      .then((res) => {
        if (res.data) setDepartments(res.data);
      })
      .catch(() => {});
  }, []);

  const canAssignCrossDepartment = (isDepartmentOfficeRole(role) || role === 'program_head')
    && hasStoredCapability('schedule.assign_instructor_cross_department');
  const {
    crossDepartmentPending,
    crossDepartmentUnlocked,
    loading: crossDepartmentStatusLoading,
  } = useDepartmentScheduleStatus(
    canAssignCrossDepartment ? user?.department_id : null,
  );
  const crossDepartmentLocked = canAssignCrossDepartment && !crossDepartmentStatusLoading && !crossDepartmentUnlocked;
  const navItems = crossDepartmentLocked
    ? baseNavItems.map((section) => ({ ...section, items: lockCrossDepartmentItems(section.items) }))
    : baseNavItems;

  const approvalsRevision = useLiveRevision(['approvals']);
  const roomsRevision = useLiveRevision(['rooms']);
  const [roomBadge, setRoomBadge] = useState({ scope: '', count: 0 });
  const pendingRoomCount = roomBadge.scope === badgeScope ? roomBadge.count : 0;

  useEffect(() => {
    // Room-request badges belong to the department office (Secretary or Director).
    if (!isDepartmentOfficeRole(role)) {
      return;
    }

    const controller = new AbortController();

    const loadPendingRoomRequests = async () => {
      try {
        const response = await api.get<Array<{
          id: number;
          status: string;
          room?: { department_id?: number | null } | null;
          owner_department?: { id?: number | null } | null;
        }>>('/room-requests', {
          params: { status: 'pending' },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const reqs = Array.isArray(response.data) ? response.data : [];
        if (user?.department_id) {
          const deptId = user.department_id;
          const incoming = reqs.filter(
            (r) => (r.owner_department?.id ?? r.room?.department_id) === deptId,
          );
          setRoomBadge({ scope: badgeScope, count: incoming.length });
        } else {
          setRoomBadge({ scope: badgeScope, count: 0 });
        }
      } catch {
        if (!controller.signal.aborted) {
          setRoomBadge({ scope: badgeScope, count: 0 });
        }
      }
    };

    const timeoutId = window.setTimeout(loadPendingRoomRequests, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [role, user?.department_id, roomsRevision, badgeScope]);

  // Classes needing a room reassignment, shown on Facilities for roles that reassign from there.
  const recoveryRevision = useLiveRevision(['rooms', 'schedules', 'approvals']);
  const [reassignBadge, setReassignBadge] = useState({ scope: '', count: 0 });
  const pendingReassignCount = reassignBadge.scope === badgeScope ? reassignBadge.count : 0;

  useEffect(() => {
    if (!reassignsRoomSchedulesFromFacilities(role)) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        const { data } = await getRecovery(undefined, controller.signal, false);
        if (!controller.signal.aborted) setReassignBadge({ scope: badgeScope, count: data.pending_count ?? 0 });
      } catch {
        if (!controller.signal.aborted) setReassignBadge({ scope: badgeScope, count: 0 });
      }
    };
    const timeoutId = window.setTimeout(load, 0);
    const poll = window.setInterval(load, 60000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(poll);
      controller.abort();
    };
  }, [role, recoveryRevision, badgeScope]);

  useEffect(() => {
    if (role !== 'dean' && role !== 'vpaa') {
      return;
    }

    const controller = new AbortController();

    const loadPendingCount = async () => {
      if (approvalsRevision === 0) setIsCountLoading(true);
      try {
        const response = await api.get<PendingDepartmentCountResponse>(
          '/schedules/pending-department-count',
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) setApprovalBadge({ scope: badgeScope, count: response.data.count });
      } catch {
        if (!controller.signal.aborted) {
          setApprovalBadge({ scope: badgeScope, count: 0 });
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
  }, [role, approvalsRevision, badgeScope]);

  const getChildNotificationCount = (child: NavItem): number => {
    if (child.isLocked) return 0;
    if (child.id === 'sidebar-schedule-approval') return pendingCount;
    if (child.id === 'sidebar-room-requests') return pendingRoomCount;
    if (child.id === 'sidebar-cross-department-assignments') return crossDepartmentPending;
    if (child.id === 'sidebar-rooms') return pendingReassignCount;
    return 0;
  };

  const getItemNotificationCount = (item: NavItem): number => {
    if (item.isLocked) return 0;
    if (!item.children) {
      if (item.id === 'sidebar-schedule-approval') return pendingCount;
      if (item.id === 'sidebar-room-requests') return pendingRoomCount;
      if (item.id === 'sidebar-rooms') return pendingReassignCount;
      return 0;
    }
    return item.children.reduce((sum, child) => sum + getChildNotificationCount(child), 0);
  };

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const activeChildPath = (item: NavItem): string | null => {
    const matches = (item.children ?? [])
      .map((child) => child.path)
      .filter((path): path is string => Boolean(path)
        && (location.pathname === path || location.pathname.startsWith(`${path}/`)));
    return matches.sort((a, b) => b.length - a.length)[0] ?? null;
  };

  const isChildActive = (item: NavItem) => activeChildPath(item) !== null;

  const isExpanded = (item: NavItem) => {
    if (expandedItems[item.label] !== undefined) {
      return expandedItems[item.label];
    }
    return isChildActive(item);
  };

  return (
    <div
      className={`
        fixed left-0 top-0 z-[60] h-screen md:z-40
        bg-[#4e0a10]
        flex flex-col
        overflow-hidden
        transition-[transform,width] duration-300 ease-in-out
        print:hidden
        ${isOpen ? 'w-72 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
      `}
    >
      {/* The TCC campus photograph stays as the sidebar backdrop; one maroon wash keeps it legible. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <img
          src={campusBg}
          alt=""
          className="h-full w-full object-cover object-center opacity-35 filter contrast-105 saturate-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#36060b] via-[#4e0a10]/80 to-[#5A1220]/70 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      </div>

      <div className={`relative z-10 flex flex-shrink-0 items-center border-b border-white/10 transition-[padding] duration-300 ease-in-out ${isOpen ? 'min-h-16 justify-between py-1.5 pl-4 pr-2' : 'h-16 justify-center px-0'}`}>
        <div className="flex min-w-0 items-center">
          <img
            src={deptLogo || logo}
            alt={deptName || "TCC Logo"}
            className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-2 ring-[#C9952A]/40 ring-offset-2 ring-offset-[#4e0a10]"
          />
          <div className={`flex min-w-0 flex-col justify-center overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'ml-3 w-[180px] shrink-0 opacity-100 md:w-[204px]' : 'hidden'}`}>
            <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-none">
              <span className="bg-gradient-to-r from-white to-[#E8D5C4] bg-clip-text text-base font-extrabold tracking-wide text-transparent">TCC</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#C9952A]">Scheduling</span>
            </div>
            {deptName && (
              <span className={`truncate font-medium leading-tight text-[#E8D5C4] ${sidebarProgramLabel ? 'mt-0.5 text-[11px]' : 'mt-1 text-[11px]'}`} title={deptName}>
                {deptName}
              </span>
            )}
            {/* Full program name, wrapped (never cut off with an ellipsis). */}
            {sidebarProgramLabel && (
              <span
                className="mt-0.5 whitespace-normal break-words text-[10px] font-medium leading-[1.2] text-[#C9952A]"
                title={programTitle ?? sidebarProgramLabel}
              >
                <span className="font-bold uppercase tracking-wide">Program:</span> {sidebarProgramLabel}
              </span>
            )}
          </div>
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

      <nav id="primary-navigation" aria-label="Primary navigation" className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 text-[#E8D5C4] [scrollbar-width:thin] [scrollbar-color:rgba(232,213,196,0.3)_transparent]">
        {navItems.map((section, sectionIdx) => (
          <div key={section.section}>
            {sectionIdx > 0 && (
              <div className={`my-3 border-t border-white/10 ${isOpen ? 'mx-2' : 'mx-1'}`} role="separator" />
            )}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'mb-1.5 max-h-6 px-3 opacity-100' : 'pointer-events-none mb-0 max-h-0 px-3 opacity-0'}`}>
              <h4 className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E8D5C4]/40">
                {section.section}
              </h4>
            </div>

            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                if (item.children) {
                  const expanded = isExpanded(item);
                  const hasActiveChild = isChildActive(item);
                  const currentChildPath = activeChildPath(item);
                  const notifCount = getItemNotificationCount(item);
                  const hasChildBadge = (item.children ?? []).some((c) => Boolean(c.badge) && !c.isLocked);
                  const showNotif = notifCount > 0 || hasChildBadge;

                  return (
                    <div key={item.label} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => {
                          if (item.isLocked) {
                            toast.warning('Access Restricted', item.lockedMessage ?? lockedModuleMessage(item.requiredCapability));
                            return;
                          }
                          if (!isOpen) {
                            onOpen?.();
                            setExpandedItems((prev) => ({ ...prev, [item.label]: true }));
                            return;
                          }
                          toggleExpand(item.label);
                        }}
                        onPointerEnter={() => (item.children ?? []).forEach((child) => {
                          if (!child.isLocked) prefetchPage(child.path);
                        })}
                        id={item.id}
                        className={`
                          flex h-9 cursor-pointer items-center overflow-hidden rounded-md text-left
                          transition-colors duration-150 ease-out
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9952A]/70
                          ${isOpen ? 'w-full px-3' : 'mx-auto w-10 justify-center px-0'}
                          ${hasActiveChild ? 'sidebar-parent-active' : 'sidebar-item-hover'}
                          ${hasActiveChild && !isOpen ? 'sidebar-item-active' : ''}
                          ${item.isLocked ? 'opacity-50' : ''}
                        `}
                        aria-expanded={expanded}
                        title={item.isLocked ? (item.lockedMessage ?? `Locked: Requires permission`) : item.label}
                      >
                        <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                          {item.icon && <item.icon size={18} strokeWidth={1.85} className="flex-shrink-0" aria-hidden="true" />}
                          {!isOpen && showNotif && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#C9952A] ring-2 ring-[#4e0a10]" aria-hidden="true" />
                          )}
                        </div>
                        <span className={`overflow-hidden truncate whitespace-nowrap text-[13px] font-medium transition-all duration-300 ease-in-out ${isOpen ? 'ml-3 max-w-[180px] opacity-100' : 'pointer-events-none ml-0 max-w-0 opacity-0'}`}>
                          {item.label}
                        </span>
                        <div className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'ml-auto max-w-[70px] pl-2 opacity-100' : 'pointer-events-none ml-0 max-w-0 opacity-0'}`}>
                          {showNotif && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9952A]"
                              title={notifCount > 0 ? `${notifCount} pending notification${notifCount === 1 ? '' : 's'}` : 'New activity'}
                            />
                          )}
                          {item.isLocked && <Lock size={12} className="shrink-0 text-[#E8D5C4]/50" />}
                          <ChevronDown
                            size={15}
                            className={`text-[#E8D5C4]/60 transition-transform duration-200 ${expanded ? '-rotate-180' : 'rotate-0'}`}
                          />
                        </div>
                      </button>

                      {expanded && isOpen && (
                        <div className="mb-1 ml-[1.375rem] mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                          {item.children.map((child, childIdx) => {
                            const isChildPathActive = Boolean(child.path) && child.path === currentChildPath;
                            return (
                              <NavLink
                                key={child.path}
                                to={child.isLocked ? '#' : child.path || ''}
                                id={child.id}
                                aria-disabled={child.isLocked || undefined}
                                onPointerEnter={() => { if (!child.isLocked) prefetchPage(child.path); }}
                                onFocus={() => { if (!child.isLocked) prefetchPage(child.path); }}
                                style={{ animationDelay: `${childIdx * 45}ms` }}
                                className={`
                                  sidebar-submenu-item
                                  relative flex min-h-8 min-w-0 items-center gap-2 rounded-md py-1.5 pl-3 pr-2
                                  transition-colors duration-150 ease-out
                                  before:absolute before:-left-[9px] before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-transparent
                                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9952A]/70
                                  ${isChildPathActive ? 'sidebar-subitem-active' : 'sidebar-item-hover'}
                                  ${child.isLocked ? 'sidebar-submenu-item-locked cursor-not-allowed hover:bg-transparent' : 'cursor-pointer'}
                                `}
                                onClick={(e) => {
                                  if (child.isLocked) {
                                    e.preventDefault();
                                    toast.warning('Access Restricted', child.lockedMessage ?? lockedModuleMessage(child.requiredCapability));
                                    return;
                                  }
                                  if (window.innerWidth < 768) {
                                    onClose();
                                  }
                                }}
                                title={child.isLocked ? (child.lockedMessage ?? `Locked: Requires permission`) : child.badge ? `${child.label} (${child.badge})` : child.label}
                              >
                                {child.badge ? (
                                  <span className="flex min-w-0 flex-col leading-tight">
                                    <span className="truncate text-xs">{child.label}</span>
                                    <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-[#E8C27A]">
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#C9952A]" aria-hidden="true" />
                                      {child.badge}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="truncate text-xs">
                                    {child.label}
                                  </span>
                                )}
                                {child.isLocked && (
                                  <Lock size={12} className="ml-auto shrink-0 text-[#E8D5C4]/50" />
                                )}
                                {child.id === 'sidebar-schedule-approval' && (pendingCount > 0 || isCountLoading) && !child.isLocked && (
                                  isCountLoading ? (
                                    <Skeleton className="ml-auto h-4 w-6 rounded-full bg-white/20" />
                                  ) : (
                                    <span className="ml-auto shrink-0 rounded-full bg-[#C9952A] px-1.5 text-[10px] font-bold leading-4 text-[#4e0a10]">
                                      {pendingCount > 9 ? '9+' : pendingCount}
                                    </span>
                                  )
                                )}
                                {child.id === 'sidebar-cross-department-assignments' && crossDepartmentPending > 0 && !child.isLocked && (
                                  <span className="ml-auto shrink-0 rounded-full bg-[#C9952A] px-1.5 text-[10px] font-bold leading-4 text-[#4e0a10]">
                                    {crossDepartmentPending > 9 ? '9+' : crossDepartmentPending}
                                  </span>
                                )}
                                {child.id === 'sidebar-room-requests' && pendingRoomCount > 0 && !child.isLocked && (
                                  <span className="ml-auto shrink-0 rounded-full bg-[#C9952A] px-1.5 text-[10px] font-bold leading-4 text-[#4e0a10]">
                                    {pendingRoomCount > 9 ? '9+' : pendingRoomCount}
                                  </span>
                                )}
                                {child.id === 'sidebar-rooms' && pendingReassignCount > 0 && !child.isLocked && (
                                  <span
                                    className="ml-auto shrink-0 rounded-full bg-[#C9952A] px-1.5 text-[10px] font-bold leading-4 text-[#4e0a10]"
                                    title={`${pendingReassignCount} class${pendingReassignCount === 1 ? '' : 'es'} need room reassignment`}
                                  >
                                    {pendingReassignCount > 9 ? '9+' : pendingReassignCount}
                                  </span>
                                )}
                              </NavLink>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                const notifCount = getItemNotificationCount(item);
                const showNotif = notifCount > 0;

                return (
                  <NavLink
                    key={item.path}
                    to={item.isLocked ? '#' : item.path || ''}
                    id={item.id}
                    onPointerEnter={() => { if (!item.isLocked) prefetchPage(item.path); }}
                    onFocus={() => { if (!item.isLocked) prefetchPage(item.path); }}
                    className={({ isActive }) => `
                      flex h-9 items-center overflow-hidden rounded-md
                      transition-colors duration-150 ease-out
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9952A]/70
                      ${isOpen ? 'w-full px-3' : 'mx-auto w-10 justify-center px-0'}
                      ${isActive && !item.isLocked ? 'sidebar-item-active' : 'sidebar-item-hover'}
                      ${item.isLocked ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : 'cursor-pointer'}
                    `}
                    onClick={(e) => {
                      if (item.isLocked) {
                        e.preventDefault();
                        toast.warning('Access Restricted', lockedModuleMessage(item.requiredCapability));
                        return;
                      }
                      if (window.innerWidth < 768) {
                        onClose();
                      }
                    }}
                    title={item.isLocked ? `Locked: Requires permission` : item.label}
                  >
                    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                      {item.icon && <item.icon size={18} strokeWidth={1.85} className="flex-shrink-0" aria-hidden="true" />}
                      {!isOpen && showNotif && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#C9952A] ring-2 ring-[#4e0a10]" aria-hidden="true" />
                      )}
                    </div>
                    <span className={`overflow-hidden truncate whitespace-nowrap text-[13px] font-medium transition-all duration-300 ease-in-out ${isOpen ? 'ml-3 max-w-[190px] opacity-100' : 'pointer-events-none ml-0 max-w-0 opacity-0'}`}>
                      {item.label}
                    </span>
                    <div className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'ml-auto max-w-[70px] pl-2 opacity-100' : 'pointer-events-none ml-0 max-w-0 opacity-0'}`}>
                      {showNotif && (
                        <span
                          className="shrink-0 rounded-full bg-[#C9952A] px-1.5 text-[10px] font-bold leading-4 text-[#4e0a10]"
                          title={item.id === 'sidebar-rooms'
                            ? `${notifCount} class${notifCount === 1 ? '' : 'es'} need room reassignment`
                            : `${notifCount} pending notification${notifCount === 1 ? '' : 's'}`}
                        >
                          {notifCount > 9 ? '9+' : notifCount}
                        </span>
                      )}
                      {item.isLocked && <Lock size={12} className="shrink-0 text-[#E8D5C4]/50" />}
                    </div>
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
