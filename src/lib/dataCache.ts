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
 * Drop every cached key that starts with one of `prefixes`.
 *
 * Mutations used to call clearDataCache(), which wiped the cache for every
 * module — renaming one room evicted curriculum, faculty, dashboards and the
 * scheduler, so the next visit to each refetched the whole ~180KB
 * /initial-data payload. Prefer this and invalidate only what the write
 * actually changed; see lib/cacheGroups.ts for the named groups.
 */
export const clearCachedKeysByPrefix = (prefixes: readonly string[]): void => {
  if (prefixes.length === 0) return;

  const matches = (key: string): boolean => prefixes.some((prefix) => key.startsWith(prefix));

  for (const key of Array.from(dataCache.keys())) {
    if (matches(key)) dataCache.delete(key);
  }

  for (const key of Array.from(pendingRequests.keys())) {
    if (matches(key)) pendingRequests.delete(key);
  }

  try {
    Object.keys(sessionStorage)
      .filter((storageKey) => storageKey.startsWith(STORAGE_PREFIX)
        && matches(storageKey.slice(STORAGE_PREFIX.length)))
      .forEach((storageKey) => sessionStorage.removeItem(storageKey));
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
    return pendingRequests.get(key) as Promise<T>;
  }

  const request = loader()
    .then((data) => {
      writeStoredData(key, data);
      return data;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
};
