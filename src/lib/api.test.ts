import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { IDEMPOTENCY_HEADER, clearIdempotencyKeys } from './idempotency';
import { LAST_ACTIVITY_KEY, SESSION_ENDED_EVENT, type SessionEndedReason } from './sessionTimeout';

const rejectWith = (status: number, url: string) => {
  api.defaults.adapter = (config) =>
    Promise.reject(
      Object.assign(new Error(`Request failed with status code ${status}`), {
        config: { ...config, url },
        response: { status, data: {}, config },
      }),
    );
};

// Resolves if the promise settles either way; the interceptor deliberately
// leaves an expired request hanging, which is what these tests assert.
const settlesWithin = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  Promise.race([
    promise.then(() => true, () => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);

describe('api response interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('user', '{"id":1}');
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    // A prior test's 401 leaves the module in its logging-out state.
    api.defaults.adapter = () => Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config: {} as never });
    void api.post('/login').catch(() => undefined);
  });

  it('clears the session and announces the expiry on a 401', async () => {
    const reasons: SessionEndedReason[] = [];
    const listener = (event: Event) => {
      event.preventDefault();
      reasons.push((event as CustomEvent<SessionEndedReason>).detail);
    };
    window.addEventListener(SESSION_ENDED_EVENT, listener);

    rejectWith(401, '/me');
    const pending = api.get('/me');

    expect(await settlesWithin(pending, 50)).toBe(false);
    expect(reasons).toEqual(['expired']);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull();

    window.removeEventListener(SESSION_ENDED_EVENT, listener);
  });

  it('still rejects other failures so pages can report them', async () => {
    rejectWith(422, '/schedules');
    await expect(api.get('/schedules')).rejects.toThrow();
    expect(localStorage.getItem('token')).toBe('expired-token');
  });

  it('leaves a failed login to the login form', async () => {
    const onEnded = vi.fn();
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);

    rejectWith(401, '/login');
    await expect(api.post('/login')).rejects.toThrow();

    expect(onEnded).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  });
});

describe('api resilience on a slow connection', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('token', 'valid-token');
    clearIdempotencyKeys();
    api.defaults.adapter = () => Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config: {} as never });
    void api.post('/login').catch(() => undefined);
  });

  const networkError = (config: unknown) =>
    Promise.reject(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', config }));

  it('resends an unanswered write with the same idempotency key', async () => {
    const keys: string[] = [];
    let calls = 0;
    api.defaults.adapter = (config) => {
      keys.push(String(config.headers[IDEMPOTENCY_HEADER]));
      calls += 1;
      return calls === 1
        ? networkError(config)
        : Promise.resolve({ data: {}, status: 201, statusText: 'Created', headers: {}, config });
    };

    await expect(api.post('/schedules', { room: 1 })).rejects.toThrow();
    await api.post('/schedules', { room: 1 });
    await api.post('/schedules', { room: 1 });

    expect(calls).toBe(3);
    expect(keys[1]).toBe(keys[0]);
    // Answered, so a later deliberate repeat is a new write.
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('gives writes a longer timeout than reads', async () => {
    const timeouts: Record<string, number | undefined> = {};
    api.defaults.adapter = (config) => {
      timeouts[config.method ?? ''] = config.timeout;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };

    await api.get('/schedules');
    await api.put('/schedules/1', { room: 1 });

    expect(timeouts.put).toBeGreaterThan(timeouts.get ?? 0);
  });

  it('quietly retries a read that got no answer', async () => {
    vi.useFakeTimers();
    let calls = 0;
    api.defaults.adapter = (config) => {
      calls += 1;
      return calls === 1
        ? networkError(config)
        : Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
    };

    const pending = api.get('/schedules');
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toMatchObject({ data: { ok: true } });
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it('does not retry a write that got no answer', async () => {
    let calls = 0;
    api.defaults.adapter = (config) => {
      calls += 1;
      return networkError(config);
    };

    await expect(api.post('/schedules', { room: 1 })).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
