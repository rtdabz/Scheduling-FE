import api from './api';
import { invalidateCacheGroups, type CacheGroupName } from './cacheGroups';
import { registerLiveDisconnect, setLiveSocketState } from './liveSocket';
import type Pusher from 'pusher-js';

export const LIVE_TOPICS = [
  'schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty',
  'courses', 'curriculum', 'departments', 'users', 'settings', 'notifications',
] as const;

export type LiveTopic = (typeof LIVE_TOPICS)[number];

export const LIVE_UPDATE_EVENT = 'wicars:live-update';

export interface LiveUpdateDetail {
  topics: LiveTopic[];
}

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
const RESYNC_DELAY_MIN_MS = 1000;
const RESYNC_DELAY_JITTER_MS = 2000;

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
let resyncTimer: number | undefined;

const cancelResync = (): void => {
  if (resyncTimer !== undefined) window.clearTimeout(resyncTimer);
  resyncTimer = undefined;
};

export const scheduleResync = (random: () => number = Math.random): void => {
  invalidateTopics(LIVE_TOPICS);
  cancelResync();
  resyncTimer = window.setTimeout(() => {
    resyncTimer = undefined;
    publishLiveTopics(LIVE_TOPICS);
  }, RESYNC_DELAY_MIN_MS + Math.round(random() * RESYNC_DELAY_JITTER_MS));
};

const dispatchPending = (): void => {
  debounceTimer = undefined;
  if (pending.size === 0 || document.visibilityState === 'hidden') return;

  const topics = Array.from(pending);
  pending.clear();
  window.dispatchEvent(new CustomEvent<LiveUpdateDetail>(LIVE_UPDATE_EVENT, { detail: { topics } }));
};

const invalidateTopics = (topics: readonly LiveTopic[]): void => {
  const groups = new Set<CacheGroupName>();
  topics.forEach((topic) => {
    TOPIC_CACHE_GROUPS[topic].forEach((group) => groups.add(group));
    if (DASHBOARD_TOPICS.has(topic)) groups.add('dashboards');
  });
  invalidateCacheGroups(...groups);
};

export const publishLiveTopics = (topics: readonly LiveTopic[]): void => {
  if (topics.length === 0) return;

  topics.forEach((topic) => pending.add(topic));
  invalidateTopics(topics);

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
  cancelResync();
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
  debounceTimer = undefined;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  setLiveSocketState(null, false);
  registerLiveDisconnect(null);
};

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

        if (!isConnected) {
          cancelResync();
          return;
        }
        if (hasConnectedBefore) scheduleResync();
        hasConnectedBefore = true;
      });

      pusher.subscribe('private-wicars.live').bind('data.changed', (payload: { topics?: unknown }) => {
        const topics = Array.isArray(payload?.topics) ? payload.topics.filter(isLiveTopic) : [];
        publishLiveTopics(topics);
      });

      const userChannel = pusher.subscribe(`private-App.Models.User.${userId}`);
      userChannel.bind('session.replaced', (payload: { token_id?: unknown }) => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
        if (token.split('|')[0] !== String(payload?.token_id)) {
          api.get('/me').catch(() => undefined);
        }
      });
      userChannel.bind('notifications.changed', () => {
        publishLiveTopics(['notifications']);
      });
    } catch {
    } finally {
      starting = null;
    }
  })();

  return starting;
};
