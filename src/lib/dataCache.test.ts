import { beforeEach, describe, expect, it } from 'vitest';
import { getConnectionStatus, resetConnectionStatus } from './connectionStatus';
import { clearCachedKeysByPrefix, clearDataCache, getCachedData, hasCachedData, isCacheFresh, loadCachedData, patchCachedData, setCachedData } from './dataCache';

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
