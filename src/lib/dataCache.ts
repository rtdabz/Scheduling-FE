import { reportShowingSavedData } from './connectionStatus';

/** An Axios request that ended with no answer from the server, and was not cancelled on purpose. */
const isUnansweredRequest = (error: unknown): boolean => {
  const failure = error as { isAxiosError?: boolean; response?: unknown; code?: string } | undefined;
  return failure?.isAxiosError === true && !failure.response && failure.code !== 'ERR_CANCELED';
};

/** An Axios request cancelled on purpose, through an AbortSignal. */
const isCancelledRequest = (error: unknown): boolean => {
  const failure = error as { code?: string; name?: string } | undefined;
  return failure?.code === 'ERR_CANCELED' || failure?.name === 'CanceledError';
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();
const STORAGE_PREFIX = 'wicars:data-cache:v5:'; // v5: term -> semester field rename
const CACHE_TTL_MS = 30 * 1000; // 30 seconds TTL

// Clean up any legacy or stale cache keys from previous versions on startup
try {
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith('wicars:data-cache:') && !key.startsWith(STORAGE_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  });
} catch {
  // Ignore storage access errors
}

const getStorageKey = (key: string): string => `${STORAGE_PREFIX}${key}`;

const readStoredData = <T>(key: string, allowStale = false): T | undefined => {
  try {
    const raw = sessionStorage.getItem(getStorageKey(key));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.timestamp !== 'number') {
      sessionStorage.removeItem(getStorageKey(key));
      return undefined;
    }
    const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
    // Expired entries remain available as a render fallback. The request path
    // still treats them as stale and refreshes them before returning.
    if (isExpired && !allowStale) {
      sessionStorage.removeItem(getStorageKey(key));
      dataCache.delete(key);
      return undefined;
    }
    dataCache.set(key, entry as CacheEntry<unknown>);
    return entry.data;
  } catch {
    sessionStorage.removeItem(getStorageKey(key));
    return undefined;
  }
};

const writeStoredData = <T>(key: string, data: T): void => {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    dataCache.set(key, entry as CacheEntry<unknown>);
    sessionStorage.setItem(getStorageKey(key), JSON.stringify(entry));
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
};

export const hasCachedData = (key: string): boolean => {
  if (dataCache.has(key)) {
    const entry = dataCache.get(key);
    return entry?.data !== undefined;
  }
  return readStoredData(key, true) !== undefined;
};

export const getCachedData = <T>(key: string): T | undefined => {
  const mem = dataCache.get(key);
  if (mem && mem.data !== undefined) {
    return mem.data as T;
  }
  return readStoredData<T>(key, true);
};

/**
 * True when `key` holds a copy younger than the TTL that no write has
 * invalidated since. Use it to decide whether a fetch can be skipped;
 * hasCachedData() also counts stale copies, which are only fit to render.
 */
export const isCacheFresh = (key: string): boolean => getFreshCachedData(key) !== undefined;

const getFreshCachedData = <T>(key: string): T | undefined => {
  const mem = dataCache.get(key);
  if (mem && Date.now() - mem.timestamp <= CACHE_TTL_MS) {
    return mem.data as T;
  }

  try {
    const raw = sessionStorage.getItem(getStorageKey(key));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.timestamp !== 'number' || Date.now() - entry.timestamp > CACHE_TTL_MS) {
      return undefined;
    }
    dataCache.set(key, entry as CacheEntry<unknown>);
    return entry.data;
  } catch {
    return undefined;
  }
};

export const setCachedData = <T>(key: string, data: T): void => {
  writeStoredData(key, data);
};

/**
 * Merges part of a cached entry, keeping its age. setCachedData() restamps the
 * whole entry as fresh, so refreshing one slice of a composite payload (say,
 * its schedules) would also pass off the other slices as just fetched, and an
 * invalidated copy would skip its next revalidation. No-op without an entry.
 */
export const patchCachedData = <T extends object>(key: string, patch: Partial<T>): void => {
  const current = getCachedData<T>(key);
  if (current === undefined) return;
  const entry: CacheEntry<T> = {
    data: { ...current, ...patch },
    timestamp: dataCache.get(key)?.timestamp ?? 0,
  };
  dataCache.set(key, entry as CacheEntry<unknown>);
  try {
    sessionStorage.setItem(getStorageKey(key), JSON.stringify(entry));
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
};

export const clearCachedKey = (key: string): void => {
  dataCache.delete(key);
  pendingRequests.delete(key);
  try {
    sessionStorage.removeItem(getStorageKey(key));
  } catch {
    // Ignore
  }
};

/**
 * Invalidate every cached key that starts with one of `prefixes`.
 *
 * Mutations used to call clearDataCache(), which wiped the cache for every
 * module — renaming one room evicted curriculum, faculty, dashboards and the
 * scheduler, so the next visit to each refetched the whole ~180KB
 * /initial-data payload. Prefer this and invalidate only what the write
 * actually changed; see lib/cacheGroups.ts for the named groups.
 *
 * Entries are marked stale rather than deleted. A page revisited after a
 * write or a live update still paints its last copy immediately (no skeleton)
 * while loadCachedData, which never serves a stale entry, fetches the new one.
 */
export const clearCachedKeysByPrefix = (prefixes: readonly string[]): void => {
  if (prefixes.length === 0) return;

  const matches = (key: string): boolean => prefixes.some((prefix) => key.startsWith(prefix));
  const markStale = (entry: CacheEntry<unknown>): CacheEntry<unknown> => ({ data: entry.data, timestamp: 0 });

  for (const [key, entry] of Array.from(dataCache.entries())) {
    if (matches(key)) dataCache.set(key, markStale(entry));
  }

  for (const key of Array.from(pendingRequests.keys())) {
    if (matches(key)) pendingRequests.delete(key);
  }

  try {
    Object.keys(sessionStorage)
      .filter((storageKey) => storageKey.startsWith(STORAGE_PREFIX)
        && matches(storageKey.slice(STORAGE_PREFIX.length)))
      .forEach((storageKey) => {
        try {
          const entry = JSON.parse(sessionStorage.getItem(storageKey) ?? '') as CacheEntry<unknown>;
          sessionStorage.setItem(storageKey, JSON.stringify(markStale(entry)));
        } catch {
          sessionStorage.removeItem(storageKey);
        }
      });
  } catch {
    // Ignore storage access errors
  }
};

export const clearDataCache = (): void => {
  dataCache.clear();
  pendingRequests.clear();
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('wicars:data-cache:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Ignore
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
    // The request being joined belongs to another caller, which may abort it on
    // unmount — StrictMode does exactly that between its two mount passes. The
    // joiner did not cancel anything, so it fetches for itself rather than
    // inheriting the cancellation and silently keeping a stale copy forever.
    return (pendingRequests.get(key) as Promise<T>).catch((error: unknown) => {
      if (!isCancelledRequest(error)) throw error;
      return loadCachedData(key, loader, forceRefresh);
    });
  }

  const request = loader()
    .then((data) => {
      writeStoredData(key, data);
      return data;
    })
    .catch((error: unknown) => {
      // On a dropped or stalled connection, the last copy beats an error page.
      // Pages stay read-accurate as of that copy, and every save is still
      // checked against the server's current data, so this cannot let a
      // conflict through. Only transport failures qualify: a real error answer
      // or a bug in the loader must still surface.
      const stale = isUnansweredRequest(error) ? getCachedData<T>(key) : undefined;
      if (stale === undefined) throw error;
      reportShowingSavedData();
      return stale;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
};
