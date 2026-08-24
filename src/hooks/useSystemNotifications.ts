import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
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

interface NotificationTerm {
  id: number;
  term_name: string;
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
  term?: NotificationTerm | null;
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
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildActionText = (notification: SystemNotification): string => {
  const departmentName = notification.department?.department_name ?? 'the department schedule';
  const departmentCode = notification.department?.department_code;
  const department = departmentCode ? `${departmentCode} - ${departmentName}` : departmentName;
  const term = notification.term
    ? `${notification.term.semester.toUpperCase()} semester, AY ${notification.term.academic_year}`
    : 'Active term';
  const actor = notification.actor?.name ?? 'System';
  const schedulesUpdated = Number(notification.metadata?.schedules_updated ?? 0);
  const scheduleText = schedulesUpdated > 0
    ? `${schedulesUpdated} schedule${schedulesUpdated === 1 ? '' : 's'}`
    : 'the schedule';

  switch (notification.type) {
    case 'incoming_cross_department_course':
      return `${notification.message} Open Incoming Cross-Department Courses to assign instructors and schedule it.`;
    case 'schedule_submitted':
      return `${actor} submitted ${departmentName} for ${term}. ${scheduleText} sent for Dean review.`;
    case 'schedule_withdrawn':
      return `${actor} withdrew selected section${Number(notification.metadata?.sections_unlocked ?? 0) === 1 ? '' : 's'} from ${departmentName} for revision.`;
    case 'schedule_approved_by_dean':
      return `${actor} approved and forwarded ${departmentName} for ${term}. ${scheduleText} sent to VPAA review.`;
    case 'schedule_returned_by_dean':
      return `${actor} returned ${departmentName} for revision.`;
    case 'schedule_returned_by_vpaa':
      return `${actor} returned ${departmentName} from VPAA review.`;
    case 'schedule_approved_by_vpaa':
      return `${actor} approved ${departmentName} for ${term}.`;
    default:
      return `${notification.message} Department: ${department}. Term: ${term}. Initiated by: ${actor}.`;
  }
};

export function useSystemNotifications(limit = 8, pollMs = 15000): UseSystemNotificationsResult {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await api.get<NotificationResponse>('/notifications', {
      params: { limit },
    });

    setNotifications(response.data.data);
    setUnreadCount(response.data.unread_count);
    setIsLoading(false);
  }, [limit]);

  const markAsRead = useCallback(async (id: number) => {
    await api.patch(`/notifications/${id}/read`);
    await refresh();
  }, [refresh]);

  const markAllAsRead = useCallback(async () => {
    await api.patch('/notifications/read-all');
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await api.get<NotificationResponse>('/notifications', {
          params: { limit },
        });

        if (!active) return;
        setNotifications(response.data.data);
        setUnreadCount(response.data.unread_count);
      } catch {
        if (!active) return;
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    const initialTimeoutId = window.setTimeout(load, 0);
    const intervalId = window.setInterval(load, pollMs);

    return () => {
      active = false;
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [limit, pollMs]);

  const feedItems = useMemo<ActivityFeedItem[]>(() => notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    action: buildActionText(notification),
    timestamp: formatTimestamp(notification.created_at),
    remarks: notification.remarks ?? undefined,
    isUnread: notification.read_at === null || notification.read_at === undefined,
    href: typeof notification.metadata?.link === 'string' ? notification.metadata.link : undefined,
  })), [notifications]);

  return {
    feedItems,
    unreadCount,
    isLoading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
