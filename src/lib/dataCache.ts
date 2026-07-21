const dataCache = new Map<string, unknown>();
const pendingRequests = new Map<string, Promise<unknown>>();
const STORAGE_PREFIX = 'wicars:data-cache:';

const getStorageKey = (key: string): string => `${STORAGE_PREFIX}${key}`;

const readStoredData = <T>(key: string): T | undefined => {
  try {
    const stored = sessionStorage.getItem(getStorageKey(key));
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as T;
    dataCache.set(key, parsed);
    return parsed;
  } catch {
    sessionStorage.removeItem(getStorageKey(key));
    return undefined;
  }
};

const writeStoredData = <T>(key: string, data: T): void => {
  try {
    sessionStorage.setItem(getStorageKey(key), JSON.stringify(data));
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
};

export const hasCachedData = (key: string): boolean => dataCache.has(key) || sessionStorage.getItem(getStorageKey(key)) !== null;

export const getCachedData = <T>(key: string): T | undefined => {
  if (!dataCache.has(key)) return readStoredData<T>(key);
  return dataCache.get(key) as T;
};

export const setCachedData = <T>(key: string, data: T): void => {
  dataCache.set(key, data);
  writeStoredData(key, data);
};

export const clearCachedKey = (key: string): void => {
  dataCache.delete(key);
  pendingRequests.delete(key);
  sessionStorage.removeItem(getStorageKey(key));
};

export const clearDataCache = (): void => {
  dataCache.clear();
  pendingRequests.clear();
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => sessionStorage.removeItem(key));
};

export const loadCachedData = async <T>(
  key: string,
  loader: () => Promise<T>,
  forceRefresh = false
): Promise<T> => {
  if (!forceRefresh && dataCache.has(key)) {
    return dataCache.get(key) as T;
  }

  if (!forceRefresh) {
    const stored = readStoredData<T>(key);
    if (stored !== undefined) return stored;
  }

  if (!forceRefresh && pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const request = loader()
    .then((data) => {
      dataCache.set(key, data);
      writeStoredData(key, data);
      return data;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
};
