
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api';
import { isLiveConnected } from '../lib/liveSocket';
import { notificationLink } from '../lib/notificationLink';
import { getStoredUser, getStoredUserRole } from '../lib/storedUser';
import { fetchCurrentUser } from '../lib/currentUser';
import { useLiveRefresh } from './useLiveRefresh';
import type { ActivityFeedItem } from '../components/overview';

interface NotificationUser {
  id: number;
  name: string;
  role: string;
}

interface NotificationDepartment {
  id: number;
  department_name: string;
  department_code: string;
}

interface NotificationSemester {
  id: number;
  semester_name: string;
  semester: string;
  academic_year: string;
}

interface SystemNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  remarks?: string | null;
  metadata?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
  actor?: NotificationUser | null;
  department?: NotificationDepartment | null;
  academic_semester?: NotificationSemester | null;
}

interface NotificationResponse {
  data: SystemNotification[];
  unread_count: number;
}

interface UseSystemNotificationsResult {
  feedItems: ActivityFeedItem[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const buildActionText = (notification: SystemNotification): string => {
  const departmentName = notification.department?.department_name ?? 'the department schedule';
  const departmentCode = notification.department?.department_code;
  const department = departmentCode ? `${departmentCode} - ${departmentName}` : departmentName;
  const semester = notification.academic_semester
    ? `${notification.academic_semester.semester.toUpperCase()} semester, AY ${notification.academic_semester.academic_year}`
    : 'Active semester';
  const actor = notification.actor?.name || (notification.metadata?._actor_type === 'system' ? 'System' : 'Actor unavailable');
  const schedulesUpdated = Number(notification.metadata?.schedules_updated ?? 0);
  const scheduleText = schedulesUpdated > 0
    ? `${schedulesUpdated} schedule${schedulesUpdated === 1 ? '' : 's'}`
    : 'the schedule';

  switch (notification.type) {
    case 'incoming_cross_department_courses':
      return notification.message;
    case 'incoming_cross_department_course':
      return `${notification.message} Open Incoming Cross-Department Courses to assign instructors and schedule it.`;
    case 'schedule_submitted':
      return `${actor} submitted ${departmentName} for ${semester}. ${scheduleText} sent for Dean review.`;
    case 'schedule_withdrawn':
      return `${actor} recalled selected section${Number(notification.metadata?.sections_unlocked ?? 0) === 1 ? '' : 's'} from ${departmentName} for revision.`;
    case 'schedule_approved_by_dean':
      return `${actor} approved and forwarded ${departmentName} for ${semester}. ${scheduleText} sent to VPAA review.`;
    case 'schedule_returned_by_dean':
      return `${actor} returned ${departmentName} for revision.`;
    case 'schedule_returned_by_vpaa':
      return `${actor} returned ${departmentName} from VPAA review.`;
    case 'schedule_approved_by_vpaa':
      return `${actor} approved ${departmentName} for ${semester}.`;
    default:
      return `${notification.message} Department: ${department}. Semester: ${semester}. Initiated by: ${actor}.`;
  }
};

export function useSystemNotifications(limit = 8, pollMs = 15000): UseSystemNotificationsResult {
  const [, updateIdentity] = useState(0);
  const scope = notificationScope();
  const role = getStoredUserRole();
  const [feed, setFeed] = useState({
    scope: null as string | null,
    notifications: [] as SystemNotification[],
    unreadCount: 0,
    isLoading: true,
  });
  const { notifications, unreadCount, isLoading, scope: loadedScope } = feed;
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (notificationScope() !== scope) {
      updateIdentity(value => value + 1);
      return;
    }
    const version = ++requestVersion.current;
    try {
      const response = await api.get<NotificationResponse>('/notifications', {
        params: { limit },
      });
      if (version !== requestVersion.current || notificationScope() !== scope) return;
      setFeed({ scope, notifications: response.data.data, unreadCount: response.data.unread_count, isLoading: false });
    } catch (error) {
      if (version === requestVersion.current && notificationScope() === scope) {
        setFeed(previous => previous.scope === scope ? { ...previous, isLoading: false }
          : { scope, notifications: [], unreadCount: 0, isLoading: false });
      }
      throw error;
    }
  }, [limit, scope]);

  const markAsRead = useCallback(async (id: number) => {
    if (notificationScope() !== scope) return;
    await api.patch(`/notifications/${id}/read`);
    await refresh();
  }, [refresh, scope]);

  const markAllAsRead = useCallback(async () => {
    if (notificationScope() !== scope) return;
    await api.patch('/notifications/read-all');
    await refresh();
  }, [refresh, scope]);

  useEffect(() => {
    let active = true;
    let timerId: number | undefined;
    let inFlight = false;

    const load = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        await refresh();
      } catch {
        if (!active) return;
      } finally {
        inFlight = false;
        if (active) {
          const baseDelay = isLiveConnected() ? pollMs * 4 : pollMs;
          const delay = document.visibilityState === 'visible' ? baseDelay : baseDelay * 4;
          timerId = window.setTimeout(load, delay);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (timerId !== undefined) window.clearTimeout(timerId);
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    timerId = window.setTimeout(load, 0);

    return () => {
      active = false;
      requestVersion.current += 1;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [refresh, pollMs]);

  useEffect(() => {
    const changed = () => updateIdentity(value => value + 1);
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  useLiveRefresh(['users'], () => {
    void fetchCurrentUser({ force: true }).then(() => updateIdentity(value => value + 1)).catch(() => undefined);
  });

  useLiveRefresh(['notifications'], () => {
    void refresh().catch(() => undefined);
  });

  const feedItems = useMemo<ActivityFeedItem[]>(() => {
    if (loadedScope !== scope) return [];
    return notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      action: buildActionText(notification),
      timestamp: formatTimestamp(notification.created_at),
      remarks: notification.remarks ?? undefined,
      isUnread: notification.read_at === null || notification.read_at === undefined,
      href: notificationLink(notification.type, role, notification.metadata),
    }));
  }, [notifications, role, loadedScope, scope]);

  return {
    feedItems,
    unreadCount: loadedScope === scope ? unreadCount : 0,
    isLoading: loadedScope !== scope || isLoading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}

const notificationScope = (): string => {
  const user = getStoredUser();
  return JSON.stringify([user?.id, user?.role, user?.department_id, user?.program_id]);
};
