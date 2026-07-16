const dataCache = new Map<string, unknown>();
const pendingRequests = new Map<string, Promise<unknown>>();

export const hasCachedData = (key: string): boolean => dataCache.has(key);

export const getCachedData = <T>(key: string): T | undefined => {
  if (!dataCache.has(key)) return undefined;
  return dataCache.get(key) as T;
};

export const setCachedData = <T>(key: string, data: T): void => {
  dataCache.set(key, data);
};

export const clearDataCache = (): void => {
  dataCache.clear();
  pendingRequests.clear();
};

export const loadCachedData = async <T>(
  key: string,
  loader: () => Promise<T>,
  forceRefresh = false
): Promise<T> => {
  if (!forceRefresh && dataCache.has(key)) {
    return dataCache.get(key) as T;
  }

  if (!forceRefresh && pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const request = loader()
    .then((data) => {
      dataCache.set(key, data);
      return data;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
};
