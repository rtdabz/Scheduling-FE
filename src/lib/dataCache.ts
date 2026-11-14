import { reportShowingSavedData } from './connectionStatus';
import { isSessionEndedError } from './sessionEnded';

const isUnansweredRequest = (error: unknown): boolean => {
  const failure = error as { isAxiosError?: boolean; response?: unknown; code?: string } | undefined;
  return failure?.isAxiosError === true && !failure.response && failure.code !== 'ERR_CANCELED';
};

const isCancelledRequest = (error: unknown): boolean => {
  const failure = error as { code?: string; name?: string } | undefined;
  return failure?.code === 'ERR_CANCELED' || failure?.name === 'CanceledError';
};

interface CacheEntry<T> {
  data: T;
  /** When the copy counts as fetched for freshness; 0 once invalidated. */
  timestamp: number;
  /** When the data itself was received; kept through invalidation so stale copies still age out. */
  savedAt?: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();
const STORAGE_PREFIX = 'wicars:data-cache:v6:';
const CACHE_TTL_MS = 30 * 1000;
/** Most keys kept at once; the least recently used are dropped first. */
export const CACHE_MAX_ENTRIES = 150;
/** Oldest copy still shown as a fallback (offline, or while revalidating). */
export const CACHE_MAX_STALE_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Every write, invalidation and newly started request takes the next number for its key. A request
 * may only write if its number is still the key's current one, so an older answer can never replace
 * newer data, and a key cleared while its request was in flight stays cleared.
 */
let sequence = 0;
const versions = new Map<string, number>();
const nextVersion = (key: string): number => {
  sequence += 1;
  versions.set(key, sequence);
  return sequence;
};

/** Recency order for the capacity limit (oldest first). Seeded with stored keys without parsing them. */
const recency = new Map<string, true>();
const touch = (key: string): void => {
  recency.delete(key);
  recency.set(key, true);
};

try {
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith('wicars:data-cache:') && !key.startsWith(STORAGE_PREFIX)) {
      sessionStorage.removeItem(key);
    } else if (key.startsWith(STORAGE_PREFIX)) {
      recency.set(key.slice(STORAGE_PREFIX.length), true);
    }
  });
} catch {
}

const getStorageKey = (key: string): string => `${STORAGE_PREFIX}${key}`;

/*
 * Memory is the source of truth within a page; sessionStorage only lets a reload start from the last
 * copy. Serializing large payloads (the scheduler's timetable) on every patch blocks the main thread,
 * so writes are coalesced per key and flushed after the current task, or immediately when the page is
 * hidden or unloaded.
 */
const dirtyKeys = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const flushStorageWrites = (): void => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const keys = Array.from(dirtyKeys);
  dirtyKeys.clear();
  for (const key of keys) {
    const entry = dataCache.get(key);
    try {
      if (entry === undefined) sessionStorage.removeItem(getStorageKey(key));
      else sessionStorage.setItem(getStorageKey(key), JSON.stringify(entry));
    } catch {
    }
  }
};

const persistLater = (key: string): void => {
  dirtyKeys.add(key);
  if (flushTimer === null) flushTimer = setTimeout(flushStorageWrites, 0);
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushStorageWrites);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorageWrites();
  });
}

const forgetKey = (key: string): void => {
  dataCache.delete(key);
  dirtyKeys.delete(key);
  recency.delete(key);
  try {
    sessionStorage.removeItem(getStorageKey(key));
  } catch {
  }
};

const enforceCapacity = (): void => {
  if (recency.size <= CACHE_MAX_ENTRIES) return;
  for (const key of Array.from(recency.keys())) {
    if (recency.size <= CACHE_MAX_ENTRIES) break;
    if (pendingRequests.has(key)) continue;
    forgetKey(key);
    versions.delete(key);
  }
};

const savedAtOf = (entry: CacheEntry<unknown>): number => entry.savedAt ?? entry.timestamp;
const isTooOld = (entry: CacheEntry<unknown>): boolean => Date.now() - savedAtOf(entry) > CACHE_MAX_STALE_AGE_MS;

const readStoredData = <T>(key: string, allowStale = false): T | undefined => {
  try {
    const raw = sessionStorage.getItem(getStorageKey(key));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.timestamp !== 'number' || isTooOld(entry as CacheEntry<unknown>)) {
      forgetKey(key);
      return undefined;
    }
    const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
    if (isExpired && !allowStale) {
      forgetKey(key);
      return undefined;
    }
    dataCache.set(key, entry as CacheEntry<unknown>);
    touch(key);
    return entry.data;
  } catch {
    forgetKey(key);
    return undefined;
  }
};

const writeStoredData = <T>(key: string, data: T): void => {
  const now = Date.now();
  nextVersion(key);
  dataCache.set(key, { data, timestamp: now, savedAt: now });
  touch(key);
  persistLater(key);
  enforceCapacity();
};

/** The in-memory entry, unless it is too old to show at all. */
const memoryEntry = (key: string): CacheEntry<unknown> | undefined => {
  const entry = dataCache.get(key);
  if (entry === undefined) return undefined;
  if (isTooOld(entry)) {
    forgetKey(key);
    return undefined;
  }
  return entry;
};

export const hasCachedData = (key: string): boolean => {
  const entry = memoryEntry(key);
  if (entry !== undefined) return entry.data !== undefined;
  return readStoredData(key, true) !== undefined;
};

export const getCachedData = <T>(key: string): T | undefined => {
  const mem = memoryEntry(key);
  if (mem && mem.data !== undefined) {
    touch(key);
    return mem.data as T;
  }
  return readStoredData<T>(key, true);
};

export const isCacheFresh = (key: string): boolean => getFreshCachedData(key) !== undefined;

const getFreshCachedData = <T>(key: string): T | undefined => {
  const mem = dataCache.get(key);
  if (mem && Date.now() - mem.timestamp <= CACHE_TTL_MS) {
    touch(key);
    return mem.data as T;
  }
  if (mem) return undefined;

  try {
    const raw = sessionStorage.getItem(getStorageKey(key));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.timestamp !== 'number' || Date.now() - entry.timestamp > CACHE_TTL_MS) {
      return undefined;
    }
    dataCache.set(key, entry as CacheEntry<unknown>);
    touch(key);
    return entry.data;
  } catch {
    return undefined;
  }
};

export const setCachedData = <T>(key: string, data: T): void => {
  writeStoredData(key, data);
};

export const patchCachedData = <T extends object>(key: string, patch: Partial<T>): void => {
  const current = getCachedData<T>(key);
  if (current === undefined) return;
  const previous = dataCache.get(key);
  const entry: CacheEntry<T> = {
    data: { ...current, ...patch },
    timestamp: previous?.timestamp ?? 0,
    savedAt: previous?.savedAt ?? previous?.timestamp ?? Date.now(),
  };
  // A request already in flight was answered before this change, so it must not overwrite it.
  nextVersion(key);
  dataCache.set(key, entry as CacheEntry<unknown>);
  touch(key);
  persistLater(key);
};

export const clearCachedKey = (key: string): void => {
  versions.delete(key);
  pendingRequests.delete(key);
  forgetKey(key);
};

export const clearCachedKeysByPrefix = (prefixes: readonly string[]): void => {
  if (prefixes.length === 0) return;

  const matches = (key: string): boolean => prefixes.some((prefix) => key.startsWith(prefix));
  const markStale = (entry: CacheEntry<unknown>): CacheEntry<unknown> => ({
    data: entry.data,
    timestamp: 0,
    savedAt: savedAtOf(entry),
  });

  for (const [key, entry] of Array.from(dataCache.entries())) {
    if (!matches(key)) continue;
    dataCache.set(key, markStale(entry));
    persistLater(key);
  }

  for (const key of Array.from(pendingRequests.keys())) {
    if (!matches(key)) continue;
    pendingRequests.delete(key);
    nextVersion(key);
  }
  for (const key of Array.from(versions.keys())) {
    if (matches(key)) nextVersion(key);
  }

  // Copies left by an earlier page load that this page has not read yet.
  try {
    Object.keys(sessionStorage)
      .filter((storageKey) => storageKey.startsWith(STORAGE_PREFIX))
      .map((storageKey) => storageKey.slice(STORAGE_PREFIX.length))
      .filter((key) => matches(key) && !dataCache.has(key))
      .forEach((key) => {
        try {
          const entry = JSON.parse(sessionStorage.getItem(getStorageKey(key)) ?? '') as CacheEntry<unknown>;
          sessionStorage.setItem(getStorageKey(key), JSON.stringify(markStale(entry)));
        } catch {
          forgetKey(key);
        }
      });
  } catch {
  }
};

export const clearDataCache = (): void => {
  dataCache.clear();
  pendingRequests.clear();
  versions.clear();
  recency.clear();
  dirtyKeys.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('wicars:data-cache:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
  }
};

export const loadCachedData = async <T>(
  key: string,
  loader: () => Promise<T>,
  forceRefresh = false
): Promise<T> => {
  if (!forceRefresh) {
    const cached = getFreshCachedData<T>(key);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (!forceRefresh && pendingRequests.has(key)) {
    return (pendingRequests.get(key) as Promise<T>).catch((error: unknown) => {
      // Retry only a request its owner aborted; one cut off by the session ending stays failed.
      if (!isCancelledRequest(error) || isSessionEndedError(error)) throw error;
      return loadCachedData(key, loader, forceRefresh);
    });
  }

  const version = nextVersion(key);
  const isCurrent = (): boolean => versions.get(key) === version;

  /** A newer request or write took over: hand back what it produced instead of this older answer. */
  const newerResult = (fallback: () => T): Promise<T> | T => {
    const newer = pendingRequests.get(key);
    if (newer !== undefined && newer !== request) return newer as Promise<T>;
    const current = getCachedData<T>(key);
    return current !== undefined ? current : fallback();
  };

  // The callbacks below only run after `request` is assigned, so they may refer to it.
  const request: Promise<T> = loader()
    .then((data) => {
      if (!isCurrent()) return newerResult(() => data);
      writeStoredData(key, data);
      return data;
    }, (error: unknown) => {
      if (isCancelledRequest(error)) throw error;
      if (!isCurrent()) return newerResult(() => { throw error; });
      const stale = isUnansweredRequest(error) ? getCachedData<T>(key) : undefined;
      if (stale === undefined) throw error;
      reportShowingSavedData();
      return stale;
    })
    .finally(() => {
      if (pendingRequests.get(key) === request) pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
};
