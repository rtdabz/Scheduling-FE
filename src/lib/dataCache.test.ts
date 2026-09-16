import { beforeEach, describe, expect, it } from 'vitest';
import { getConnectionStatus, resetConnectionStatus } from './connectionStatus';
import { clearDataCache, loadCachedData, setCachedData } from './dataCache';

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
