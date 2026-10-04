export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

export const LAST_ACTIVITY_KEY = 'wicars:last-activity';

export const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
  'pointerdown',
] as const;

export const readLastActivity = (): number | null => {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeLastActivity = (timestamp: number): void => {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  } catch {
  }
};

export const clearLastActivity = (): void => {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
  }
};

export type SessionEndedReason = 'idle' | 'expired' | 'replaced';

export const SESSION_ENDED_EVENT = 'wicars:session-ended';

export const announceSessionEnded = (reason: SessionEndedReason): boolean => {
  const event = new CustomEvent<SessionEndedReason>(SESSION_ENDED_EVENT, {
    cancelable: true,
    detail: reason,
  });
  return !window.dispatchEvent(event);
};
