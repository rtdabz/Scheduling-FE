import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  clearDataCache: vi.fn(),
}));

vi.mock('./api', () => ({
  default: { post: (...args: unknown[]) => mocks.apiPost(...args) },
}));

vi.mock('./dataCache', () => ({
  clearDataCache: () => mocks.clearDataCache(),
}));

import { logoutCurrentSession } from './authSession';

describe('logoutCurrentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mocks.apiPost.mockResolvedValue({ data: { message: 'Logged out' } });
  });

  it('revokes the captured token and clears local state immediately', () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', '{"id":1}');
    sessionStorage.setItem('wicars:data-cache:v4:dashboard', '{}');

    logoutCurrentSession();

    expect(mocks.apiPost).toHaveBeenCalledWith('/logout', undefined, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(mocks.clearDataCache).toHaveBeenCalledOnce();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('still clears the session when server revocation fails', async () => {
    mocks.apiPost.mockRejectedValue(new Error('Network unavailable'));
    sessionStorage.setItem('token', 'session-token');
    sessionStorage.setItem('user', '{"id":2}');

    logoutCurrentSession();
    await Promise.resolve();

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
  });
});
