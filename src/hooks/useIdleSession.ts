import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVITY_EVENTS,
  LAST_ACTIVITY_KEY,
  IDLE_TIMEOUT_MS,
  readLastActivity,
  writeLastActivity,
} from '../lib/sessionTimeout';

// Activity fires far more often than it needs to be recorded; one write per
// second is enough to keep every tab in step without touching storage on each
// mouse move.
const ACTIVITY_WRITE_INTERVAL_MS = 1000;
const CHECK_INTERVAL_MS = 1000;

interface UseIdleSessionOptions {
  enabled?: boolean;
  timeoutMs?: number;
  onIdle: () => void;
}

/**
 * Reports whether the session has gone idle. Elapsed time is measured from a
 * stored timestamp rather than a running countdown, so a throttled background
 * tab or a sleeping machine still expires at the right moment on wake.
 */
export function useIdleSession({
  enabled = true,
  timeoutMs = IDLE_TIMEOUT_MS,
  onIdle,
}: UseIdleSessionOptions): boolean {
  const [isIdle, setIsIdle] = useState(false);
  const lastActivityRef = useRef<number>(0);
  const lastWriteRef = useRef<number>(0);
  const idleRef = useRef(false);
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const markActivity = useCallback((timestamp: number) => {
    if (idleRef.current) return;
    lastActivityRef.current = timestamp;
    if (timestamp - lastWriteRef.current < ACTIVITY_WRITE_INTERVAL_MS) return;
    lastWriteRef.current = timestamp;
    writeLastActivity(timestamp);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // A reload inside the idle window must not hand back a fresh full window,
    // so resume from the shared timestamp when one is present. An expired
    // session is likewise never revived here; only a fresh sign-in clears it.
    const stored = readLastActivity();
    const now = Date.now();
    lastActivityRef.current = stored ?? now;
    if (stored === null) writeLastActivity(now);

    const goIdle = () => {
      if (idleRef.current) return;
      idleRef.current = true;
      setIsIdle(true);
      onIdleRef.current();
    };

    const handleActivity = () => markActivity(Date.now());

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY || !event.newValue) return;
      const parsed = Number(event.newValue);
      // Another tab is in use; only ever move the deadline forward.
      if (Number.isFinite(parsed) && parsed > lastActivityRef.current) {
        lastActivityRef.current = parsed;
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener('storage', handleStorage);

    const checkIdle = () => {
      const stamp = readLastActivity();
      if (stamp !== null && stamp > lastActivityRef.current) lastActivityRef.current = stamp;
      if (Date.now() - lastActivityRef.current >= timeoutMs) goIdle();
    };

    // Coming back to a hidden tab is the moment a long absence becomes visible.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkIdle();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const timer = window.setInterval(checkIdle, CHECK_INTERVAL_MS);
    checkIdle();

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(timer);
    };
  }, [enabled, timeoutMs, markActivity]);

  return isIdle;
}
