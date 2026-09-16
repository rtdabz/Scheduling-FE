/**
 * What the app currently knows about its link to the server, for the shell's
 * connection banner.
 *
 * Fed by the browser's online/offline events and by the API client, which
 * reports every request it finishes. The live-updates socket is deliberately
 * not an input: realtime is optional, and a deployment without Reverb running
 * would otherwise look permanently offline.
 */

export type ConnectionQuality = 'online' | 'slow' | 'offline';

export interface ConnectionStatus {
  quality: ConnectionQuality;
  /** A read failed and cached data was shown in its place. */
  showingSavedData: boolean;
}

/** Answers slower than this, typically, mean the app will feel stuck. */
export const SLOW_RESPONSE_MS = 4000;
const SAMPLE_SIZE = 5;
const MIN_SAMPLES = 3;
/** Consecutive unanswered requests before the app calls itself offline. */
const FAILURES_BEFORE_OFFLINE = 2;

let durations: number[] = [];
let consecutiveFailures = 0;
let showingSavedData = false;
let browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
let snapshot: ConnectionStatus = { quality: 'online', showingSavedData: false };
const listeners = new Set<() => void>();

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const recompute = (): void => {
  let quality: ConnectionQuality = 'online';
  if (browserOffline || consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
    quality = 'offline';
  } else if (durations.length >= MIN_SAMPLES && median(durations) > SLOW_RESPONSE_MS) {
    quality = 'slow';
  }

  if (quality !== snapshot.quality || showingSavedData !== snapshot.showingSavedData) {
    snapshot = { quality, showingSavedData };
    listeners.forEach((listener) => listener());
  }
};

/** The server answered, with any status. Pass a duration only for reads. */
export const reportResponse = (durationMs?: number): void => {
  consecutiveFailures = 0;
  // Any answer means the data on screen can be refreshed again.
  showingSavedData = false;
  if (durationMs !== undefined) durations = [...durations, durationMs].slice(-SAMPLE_SIZE);
  recompute();
};

/** A request ended with no answer at all (not a deliberate cancel). */
export const reportNoResponse = (): void => {
  consecutiveFailures += 1;
  recompute();
};

export const reportShowingSavedData = (): void => {
  showingSavedData = true;
  recompute();
};

export const getConnectionStatus = (): ConnectionStatus => snapshot;

export const subscribeConnectionStatus = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** For tests and sign-out: forget everything measured so far. */
export const resetConnectionStatus = (): void => {
  durations = [];
  consecutiveFailures = 0;
  showingSavedData = false;
  browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  recompute();
};

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    browserOffline = true;
    recompute();
  });
  window.addEventListener('online', () => {
    browserOffline = false;
    // Earlier failures describe the outage that just ended.
    consecutiveFailures = 0;
    recompute();
  });
}
