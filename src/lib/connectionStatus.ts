export type ConnectionQuality = 'online' | 'slow' | 'offline';

export interface ConnectionStatus {
  quality: ConnectionQuality;
  showingSavedData: boolean;
}

export const SLOW_RESPONSE_MS = 4000;
const SAMPLE_SIZE = 5;
const MIN_SAMPLES = 3;
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

export const reportResponse = (durationMs?: number): void => {
  consecutiveFailures = 0;
  showingSavedData = false;
  if (durationMs !== undefined) durations = [...durations, durationMs].slice(-SAMPLE_SIZE);
  recompute();
};

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
    consecutiveFailures = 0;
    recompute();
  });
}
