import api from './api';
import { invalidateCacheGroups, type CacheGroupName } from './cacheGroups';
import { registerLiveDisconnect, setLiveSocketState } from './liveSocket';
import type Pusher from 'pusher-js';

/**
 * Real-time updates over WebSocket (Laravel Reverb, Pusher protocol).
 *
 * The server never pushes records, only the names of what changed
 * ("schedules", "approvals", ...). On each signal this module:
 *   1. drops the matching dataCache groups, so the next read is fresh, and
 *   2. tells mounted pages, which refetch through their normal API calls.
 *
 * Keeping it light:
 *   - pusher-js is loaded on demand after sign-in, not in the initial bundle;
 *   - bursts are coalesced into one refresh per DEBOUNCE_MS;
 *   - a hidden tab only invalidates its cache and refreshes when shown again;
 *   - refetches hit the API's ETag/304 path, so unchanged payloads are cheap.
 * If the socket is unavailable the app keeps working exactly as before.
 */

export const LIVE_TOPICS = [
  'schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty',
  'courses', 'curriculum', 'departments', 'users', 'settings', 'notifications',
] as const;

export type LiveTopic = (typeof LIVE_TOPICS)[number];

export const LIVE_UPDATE_EVENT = 'wicars:live-update';

export interface LiveUpdateDetail {
  topics: LiveTopic[];
}

/** Topics that also change the figures on the role dashboards. */
const DASHBOARD_TOPICS: ReadonlySet<LiveTopic> = new Set([
  'schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'courses', 'curriculum',
]);

const TOPIC_CACHE_GROUPS: Record<LiveTopic, CacheGroupName[]> = {
  schedules: ['schedules'],
  approvals: ['approvals', 'schedules'],
  assignments: ['assignments'],
  sections: ['sections'],
  rooms: ['rooms'],
  faculty: ['faculty'],
  courses: ['courses'],
  curriculum: ['curriculum'],
  departments: ['departments'],
  users: ['users'],
  settings: ['settings'],
  notifications: [],
};

const DEBOUNCE_MS = 300;

interface RealtimeConfig {
  enabled: boolean;
  key: string | null;
  host: string | null;
  port: number | null;
  scheme: string | null;
}

const isLiveTopic = (value: unknown): value is LiveTopic =>
  typeof value === 'string' && (LIVE_TOPICS as readonly string[]).includes(value);

const pending = new Set<LiveTopic>();
let debounceTimer: number | undefined;

const dispatchPending = (): void => {
  debounceTimer = undefined;
  if (pending.size === 0 || document.visibilityState === 'hidden') return;

  const topics = Array.from(pending);
  pending.clear();
  window.dispatchEvent(new CustomEvent<LiveUpdateDetail>(LIVE_UPDATE_EVENT, { detail: { topics } }));
};

/** Record topics as changed. Exported for tests and for same-tab broadcasts. */
export const publishLiveTopics = (topics: readonly LiveTopic[]): void => {
  if (topics.length === 0) return;

  const groups = new Set<CacheGroupName>();
  topics.forEach((topic) => {
    pending.add(topic);
    TOPIC_CACHE_GROUPS[topic].forEach((group) => groups.add(group));
    if (DASHBOARD_TOPICS.has(topic)) groups.add('dashboards');
  });
  // Invalidate right away, even in a hidden tab, so navigating shows fresh data.
  invalidateCacheGroups(...groups);

  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(dispatchPending, DEBOUNCE_MS);
};

const onVisibilityChange = (): void => {
  if (document.visibilityState === 'visible' && pending.size > 0) dispatchPending();
};

let client: Pusher | null = null;
let startedForUser: number | null = null;
let starting: Promise<void> | null = null;

export const stopLiveUpdates = (): void => {
  client?.disconnect();
  client = null;
  startedForUser = null;
  starting = null;
  pending.clear();
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
  debounceTimer = undefined;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  setLiveSocketState(null, false);
  registerLiveDisconnect(null);
};

/**
 * Open the connection for the signed-in user. Safe to call repeatedly; any
 * failure (socket server down, broadcasting disabled) leaves the app on its
 * existing request-driven refresh.
 */
export const startLiveUpdates = (userId: number): Promise<void> => {
  if (startedForUser === userId && (client || starting)) return starting ?? Promise.resolve();
  stopLiveUpdates();
  startedForUser = userId;

  starting = (async () => {
    try {
      const { data: config } = await api.get<RealtimeConfig>('/realtime-config');
      if (!config.enabled || !config.key || startedForUser !== userId) return;

      const { default: PusherClient } = await import('pusher-js');
      if (startedForUser !== userId) return;

      const secure = (config.scheme ?? window.location.protocol.replace(':', '')) === 'https';
      const port = config.port ?? (Number(window.location.port) || (secure ? 443 : 80));

      const pusher = new PusherClient(config.key, {
        cluster: '',
        wsHost: config.host ?? window.location.hostname,
        wsPort: port,
        wssPort: port,
        forceTLS: secure,
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        channelAuthorization: {
          endpoint: '/broadcasting/auth',
          transport: 'ajax',
          // Authorise through the API client: same base URL, bearer token and
          // 401 handling as every other request.
          customHandler: ({ socketId, channelName }, callback) => {
            api.post('/broadcasting/auth', { socket_id: socketId, channel_name: channelName })
              .then(({ data }) => callback(null, data))
              .catch((error: Error) => callback(error, null));
          },
        },
      });
      client = pusher;
      registerLiveDisconnect(stopLiveUpdates);
      document.addEventListener('visibilitychange', onVisibilityChange);

      let hasConnectedBefore = false;
      pusher.connection.bind('state_change', ({ current }: { current: string }) => {
        const isConnected = current === 'connected';
        setLiveSocketState(isConnected ? pusher.connection.socket_id : null, isConnected);

        if (!isConnected) return;
        // Signals sent while the socket was down are lost; resync once.
        if (hasConnectedBefore) publishLiveTopics(LIVE_TOPICS);
        hasConnectedBefore = true;
      });

      pusher.subscribe('private-wicars.live').bind('data.changed', (payload: { topics?: unknown }) => {
        const topics = Array.isArray(payload?.topics) ? payload.topics.filter(isLiveTopic) : [];
        publishLiveTopics(topics);
      });

      pusher.subscribe(`private-App.Models.User.${userId}`).bind('notifications.changed', () => {
        publishLiveTopics(['notifications']);
      });
    } catch {
      // Realtime is an enhancement; the app works without it.
    } finally {
      starting = null;
    }
  })();

  return starting;
};
