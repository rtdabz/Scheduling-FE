import { formatPhilippineDate } from '../lib/philippineTime';

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { isLiveConnected } from '../lib/liveSocket';
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
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildActionText = (notification: SystemNotification): string => {
  const departmentName = notification.department?.department_name ?? 'the department schedule';
  const departmentCode = notification.department?.department_code;
  const department = departmentCode ? `${departmentCode} - ${departmentName}` : departmentName;
  const semester = notification.academic_semester
    ? `${notification.academic_semester.semester.toUpperCase()} semester, AY ${notification.academic_semester.academic_year}`
    : 'Active semester';
  const actor = notification.actor?.name ?? 'System';
  const schedulesUpdated = Number(notification.metadata?.schedules_updated ?? 0);
  const scheduleText = schedulesUpdated > 0
    ? `${schedulesUpdated} schedule${schedulesUpdated === 1 ? '' : 's'}`
    : 'the schedule';

  switch (notification.type) {
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
    let timerId: number | undefined;
    let inFlight = false;

    const load = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
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
        inFlight = false;
        if (active) {
          setIsLoading(false);
          // With the live socket up, new notifications arrive as a push; the
          // poll is only a safety net, so it can run far less often.
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
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [limit, pollMs]);

  // Approvals and returns also change what the activity feed says.
  useLiveRefresh(['notifications', 'approvals'], () => {
    void refresh().catch(() => undefined);
  });

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
