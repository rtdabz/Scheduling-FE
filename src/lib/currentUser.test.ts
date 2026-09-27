import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ default: { get: (...args: unknown[]) => apiGet(...args) } }));

describe('fetchCurrentUser', () => {
  beforeEach(() => {
    vi.resetModules();
    apiGet.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('token', 'token-a');
  });

  afterEach(() => vi.useRealTimers());

  it('shares one request between simultaneous callers and stores the answer', async () => {
    apiGet.mockResolvedValue({ data: { id: 1, role: 'secretary' } });
    const { fetchCurrentUser } = await import('./currentUser');

    const [first, second] = await Promise.all([fetchCurrentUser(), fetchCurrentUser()]);

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toEqual({ id: 1, role: 'secretary' });
  });

  it('reuses a fresh answer, and asks again once it is stale or the session changed', async () => {
    vi.useFakeTimers();
    apiGet.mockResolvedValue({ data: { id: 1 } });
    const { fetchCurrentUser } = await import('./currentUser');

    await fetchCurrentUser();
    await fetchCurrentUser();
    expect(apiGet).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(31_000);
    await fetchCurrentUser();
    expect(apiGet).toHaveBeenCalledTimes(2);

    localStorage.setItem('token', 'token-b');
    await fetchCurrentUser();
    expect(apiGet).toHaveBeenCalledTimes(3);
  });
});
