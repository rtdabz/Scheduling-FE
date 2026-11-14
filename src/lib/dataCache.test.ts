import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConnectionStatus, resetConnectionStatus } from './connectionStatus';
import { CACHE_MAX_ENTRIES, CACHE_MAX_STALE_AGE_MS, clearCachedKey, clearCachedKeysByPrefix, clearDataCache, getCachedData, hasCachedData, isCacheFresh, loadCachedData, patchCachedData, setCachedData } from './dataCache';

const unanswered = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });

describe('loadCachedData on a failed refresh', () => {
  beforeEach(() => {
    clearDataCache();
    resetConnectionStatus();
  });

  it('falls back to the last copy when the server could not be reached', async () => {
    setCachedData('page:rooms:1', ['Room A']);

    const result = await loadCachedData('page:rooms:1', () => Promise.reject(unanswered()), true);

    expect(result).toEqual(['Room A']);
    expect(getConnectionStatus().showingSavedData).toBe(true);
  });

  it('still surfaces real error answers and loader bugs', async () => {
    setCachedData('page:rooms:1', ['Room A']);

    const forbidden = Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403 } });
    await expect(loadCachedData('page:rooms:1', () => Promise.reject(forbidden), true)).rejects.toBe(forbidden);
    await expect(loadCachedData('page:rooms:1', () => Promise.reject(new TypeError('bug')), true)).rejects.toThrow('bug');
  });

  it('rejects when there is no earlier copy to show', async () => {
    await expect(loadCachedData('page:rooms:2', () => Promise.reject(unanswered()))).rejects.toThrow('Network Error');
  });
});

describe('clearCachedKeysByPrefix', () => {
  beforeEach(() => {
    clearDataCache();
  });

  it('keeps the last copy renderable but refetches it on the next load', async () => {
    setCachedData('page:rooms:1', ['Room A']);
    setCachedData('page:users', ['Ana']);

    clearCachedKeysByPrefix(['page:rooms:']);

    expect(hasCachedData('page:rooms:1')).toBe(true);
    expect(getCachedData('page:rooms:1')).toEqual(['Room A']);
    expect(isCacheFresh('page:rooms:1')).toBe(false);
    expect(isCacheFresh('page:users')).toBe(true);

    const result = await loadCachedData('page:rooms:1', () => Promise.resolve(['Room B']));

    expect(result).toEqual(['Room B']);
    expect(isCacheFresh('page:rooms:1')).toBe(true);
  });
});

describe('patchCachedData', () => {
  beforeEach(() => {
    clearDataCache();
  });

  it('merges a slice without passing an invalidated entry off as fresh', () => {
    setCachedData('scheduler:1', { subjects: ['old'], schedules: [1] });
    clearCachedKeysByPrefix(['scheduler:']);

    patchCachedData<{ subjects: string[]; schedules: number[] }>('scheduler:1', { schedules: [2] });

    expect(getCachedData('scheduler:1')).toEqual({ subjects: ['old'], schedules: [2] });
    expect(isCacheFresh('scheduler:1')).toBe(false);
  });

  it('does nothing without an entry', () => {
    patchCachedData('scheduler:2', { schedules: [] });
    expect(hasCachedData('scheduler:2')).toBe(false);
  });
});

describe('loadCachedData joining a cancelled request', () => {
  beforeEach(() => {
    clearDataCache();
  });

  it('fetches for itself when the request it joined was aborted by its owner', async () => {
    // StrictMode: the first mount starts the fetch, its cleanup aborts it, and
    // the second mount joins that same pending request.
    setCachedData('scheduler:1', { subjects: ['stale'] });
    clearCachedKeysByPrefix(['scheduler:']);
    const cancelled = Object.assign(new Error('canceled'), { isAxiosError: true, code: 'ERR_CANCELED' });

    const first = loadCachedData('scheduler:1', () => Promise.reject(cancelled));
    const second = loadCachedData('scheduler:1', () => Promise.resolve({ subjects: ['fresh'] }));

    await expect(first).rejects.toBe(cancelled);
    await expect(second).resolves.toEqual({ subjects: ['fresh'] });
    expect(getCachedData('scheduler:1')).toEqual({ subjects: ['fresh'] });
  });
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('loadCachedData ordering after invalidation', () => {
  beforeEach(() => {
    clearDataCache();
  });

  it('does not let an older request overwrite the newer answer', async () => {
    const older = deferred<string[]>();
    const newer = deferred<string[]>();

    const first = loadCachedData('page:rooms:1', () => older.promise);
    clearCachedKeysByPrefix(['page:rooms:']);
    const second = loadCachedData('page:rooms:1', () => newer.promise);

    newer.resolve(['new']);
    await expect(second).resolves.toEqual(['new']);
    older.resolve(['old']);
    // The superseded caller is handed the newer copy rather than rendering the old one.
    await expect(first).resolves.toEqual(['new']);

    expect(getCachedData('page:rooms:1')).toEqual(['new']);
    expect(isCacheFresh('page:rooms:1')).toBe(true);
  });

  it('keeps tracking the newer pending request when the older one settles first', async () => {
    const older = deferred<string[]>();
    const newer = deferred<string[]>();
    let loads = 0;

    const first = loadCachedData('page:rooms:1', () => { loads += 1; return older.promise; });
    clearCachedKeysByPrefix(['page:rooms:']);
    const second = loadCachedData('page:rooms:1', () => { loads += 1; return newer.promise; });

    older.resolve(['old']);
    // The older answer must not delete the newer request's pending entry: a third caller joins it.
    const third = loadCachedData('page:rooms:1', () => { loads += 1; return Promise.resolve(['third']); });
    newer.resolve(['new']);

    await expect(first).resolves.toEqual(['new']);
    await expect(second).resolves.toEqual(['new']);
    await expect(third).resolves.toEqual(['new']);
    expect(loads).toBe(2);
    expect(getCachedData('page:rooms:1')).toEqual(['new']);
  });

  it('ignores a forced refresh that started before a newer forced refresh', async () => {
    const older = deferred<string[]>();
    const newer = deferred<string[]>();

    const first = loadCachedData('page:rooms:1', () => older.promise, true);
    const second = loadCachedData('page:rooms:1', () => newer.promise, true);

    newer.resolve(['new']);
    await second;
    older.resolve(['old']);
    await expect(first).resolves.toEqual(['new']);
    expect(getCachedData('page:rooms:1')).toEqual(['new']);
  });

  it('does not resurrect a key that was cleared while its request was in flight', async () => {
    const older = deferred<string[]>();

    const first = loadCachedData('page:rooms:1', () => older.promise);
    clearCachedKey('page:rooms:1');
    older.resolve(['old']);

    await expect(first).resolves.toEqual(['old']);
    expect(hasCachedData('page:rooms:1')).toBe(false);
  });

  it('does not overwrite data written directly after the request started', async () => {
    const older = deferred<string[]>();

    const first = loadCachedData('page:rooms:1', () => older.promise, true);
    setCachedData('page:rooms:1', ['saved']);
    older.resolve(['old']);

    await expect(first).resolves.toEqual(['saved']);
    expect(getCachedData('page:rooms:1')).toEqual(['saved']);
  });

  it('a superseded request that fails defers to the newer request', async () => {
    const older = deferred<string[]>();
    const newer = deferred<string[]>();

    const first = loadCachedData('page:rooms:1', () => older.promise);
    clearCachedKeysByPrefix(['page:rooms:']);
    const second = loadCachedData('page:rooms:1', () => newer.promise);

    older.reject(Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403 } }));
    newer.resolve(['new']);

    await expect(first).resolves.toEqual(['new']);
    await expect(second).resolves.toEqual(['new']);
  });
});

describe('bounded retention', () => {
  beforeEach(() => {
    clearDataCache();
    resetConnectionStatus();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops the least recently used keys beyond the capacity', async () => {
    for (let page = 1; page <= CACHE_MAX_ENTRIES; page += 1) {
      setCachedData(`page:activity-log:${page}`, [page]);
    }
    // Reading page 1 makes it recent, so page 2 is the oldest when the next key arrives.
    getCachedData('page:activity-log:1');
    setCachedData('page:activity-log:extra', ['extra']);

    expect(hasCachedData('page:activity-log:1')).toBe(true);
    expect(hasCachedData('page:activity-log:2')).toBe(false);
    expect(hasCachedData('page:activity-log:extra')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = Object.keys(sessionStorage).filter((key) => key.startsWith('wicars:data-cache:'));
    expect(stored.length).toBeLessThanOrEqual(CACHE_MAX_ENTRIES);
    expect(stored.some((key) => key.endsWith('page:activity-log:2'))).toBe(false);
  });

  it('still falls back to a stale copy offline, but not to one past the age limit', async () => {
    vi.useFakeTimers();
    setCachedData('page:rooms:1', ['Room A']);

    vi.advanceTimersByTime(CACHE_MAX_STALE_AGE_MS - 1000);
    await expect(loadCachedData('page:rooms:1', () => Promise.reject(unanswered()))).resolves.toEqual(['Room A']);

    vi.advanceTimersByTime(2000);
    expect(hasCachedData('page:rooms:1')).toBe(false);
    await expect(loadCachedData('page:rooms:1', () => Promise.reject(unanswered()))).rejects.toThrow('Network Error');
  });

  it('keeps invalidated copies aging from when they were fetched', () => {
    vi.useFakeTimers();
    setCachedData('page:rooms:1', ['Room A']);
    clearCachedKeysByPrefix(['page:rooms:']);
    expect(getCachedData('page:rooms:1')).toEqual(['Room A']);

    vi.advanceTimersByTime(CACHE_MAX_STALE_AGE_MS + 1);
    expect(getCachedData('page:rooms:1')).toBeUndefined();
  });

  it('coalesces repeated patches into one storage write', async () => {
    setCachedData('scheduler:1', { schedules: [0] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    for (let i = 1; i <= 20; i += 1) {
      patchCachedData<{ schedules: number[] }>('scheduler:1', { schedules: [i] });
    }
    expect(setItem).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('wicars:data-cache:v6:scheduler:1') ?? '{}').data).toEqual({ schedules: [20] });
    setItem.mockRestore();
  });
});

it('discards persisted identities from before the integrity rollout while retaining current snapshots', async () => {
  clearDataCache();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const staleKey = 'wicars:data-cache:v5:page:activity-log:old';
  const currentKey = 'wicars:data-cache:v6:page:activity-log:current';
  sessionStorage.setItem(staleKey, JSON.stringify({ data: [{ actor: 'Mutable account name' }], timestamp: Date.now() }));
  sessionStorage.setItem(currentKey, JSON.stringify({ data: [{ actor: 'Recorded actor name' }], timestamp: Date.now() }));
  vi.resetModules();
  const cache = await import('./dataCache');

  try {
    expect(sessionStorage.getItem(staleKey)).toBeNull();
    expect(cache.getCachedData('page:activity-log:old')).toBeUndefined();
    expect(cache.getCachedData('page:activity-log:current')).toEqual([{ actor: 'Recorded actor name' }]);
  } finally {
    cache.clearDataCache();
  }
});
