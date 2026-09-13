// Inactivity policy for authenticated screens. A signed-in page left unattended
// is a standing risk on shared office machines, so the shell stops the session
// once no interaction has been seen for this long.
export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

// Activity is shared through localStorage so that working in one tab keeps the
// other tabs of the same session alive instead of expiring them behind the user.
export const LAST_ACTIVITY_KEY = 'wicars:last-activity';

// Pointer, keyboard, scroll and touch cover every way the user drives the UI;
// `visibilitychange` is handled separately because returning to a tab is not
// itself activity.
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
    // Storage can be unavailable (private mode, blocked cookies); the caller
    // then falls back to this tab's own in-memory timestamp.
    return null;
  }
};

export const writeLastActivity = (timestamp: number): void => {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  } catch {
    // Non-fatal: this tab still tracks activity in memory.
  }
};

export const clearLastActivity = (): void => {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Non-fatal.
  }
};

// Why the session stopped. The distinction only drives the wording of the
// notice: an idle timeout is this app's own policy, whereas an expired token is
// the server declining the credentials the page still holds.
export type SessionEndedReason = 'idle' | 'expired';

export const SESSION_ENDED_EVENT = 'wicars:session-ended';

/**
 * Announces that the session is over so the authenticated shell can explain it
 * in place. Returns false when nothing is listening — no shell is mounted, so
 * the caller must fall back to sending the browser to the login screen itself.
 */
export const announceSessionEnded = (reason: SessionEndedReason): boolean => {
  const event = new CustomEvent<SessionEndedReason>(SESSION_ENDED_EVENT, {
    cancelable: true,
    detail: reason,
  });
  // A listener claims the announcement with preventDefault(); dispatchEvent
  // then reports false, which is the signal that the notice is on screen.
  return !window.dispatchEvent(event);
};
