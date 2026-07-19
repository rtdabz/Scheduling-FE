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
  const department = notification.department
    ? `${notification.department.department_code} - ${notification.department.department_name}`
    : 'System-wide';
  const term = notification.term
    ? `${notification.term.semester.toUpperCase()} semester, AY ${notification.term.academic_year}`
    : 'Active term';
  const actor = notification.actor?.name ?? 'System';

  return `${notification.message} Department: ${department}. Term: ${term}. Initiated by: ${actor}.`;
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

    void load();
    const intervalId = window.setInterval(load, pollMs);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [limit, pollMs]);

  const feedItems = useMemo<ActivityFeedItem[]>(() => notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    action: buildActionText(notification),
    timestamp: formatTimestamp(notification.created_at),
    remarks: notification.remarks ?? undefined,
    isUnread: notification.read_at === null || notification.read_at === undefined,
  })), [notifications]);

  return {
    feedItems,
    unreadCount,
    isLoading,
    refresh,
    markAllAsRead,
  };
}
