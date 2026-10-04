import { reportShowingSavedData } from './connectionStatus';

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
  timestamp: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();
const STORAGE_PREFIX = 'wicars:data-cache:v5:';
const CACHE_TTL_MS = 30 * 1000;

try {
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith('wicars:data-cache:') && !key.startsWith(STORAGE_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  });
} catch {
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
  }
};

export const clearCachedKey = (key: string): void => {
  dataCache.delete(key);
  pendingRequests.delete(key);
  try {
    sessionStorage.removeItem(getStorageKey(key));
  } catch {
  }
};

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
