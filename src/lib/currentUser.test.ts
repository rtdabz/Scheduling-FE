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

  it('fetches fresh permissions after an older pending read without duplicating the follow-up', async () => {
    let resolveOld!: (value: unknown) => void;
    apiGet.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    apiGet.mockResolvedValue({ data: { id: 1, can_edit_program_ids: [] } });
    const { fetchCurrentUser } = await import('./currentUser');
    const old = fetchCurrentUser();
    const first = fetchCurrentUser({ force: true, afterPending: true });
    const second = fetchCurrentUser({ force: true, afterPending: true });
    resolveOld({ data: { id: 1, can_edit_program_ids: [7] } });
    await old;
    expect(await first).toEqual({ id: 1, can_edit_program_ids: [] });
    expect(await second).toEqual({ id: 1, can_edit_program_ids: [] });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
