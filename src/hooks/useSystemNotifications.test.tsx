import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../lib/api';
import { LIVE_UPDATE_EVENT } from '../lib/liveUpdates';
import { useSystemNotifications } from './useSystemNotifications';

vi.mock('../lib/api', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('../lib/liveSocket', () => ({ isLiveConnected: () => false }));
vi.mock('../lib/currentUser', () => ({ fetchCurrentUser: vi.fn(() => Promise.resolve()) }));

const user = (id: number, role: string, programId = 1) => {
  localStorage.setItem('user', JSON.stringify({ id, role, department_id: 1, program_id: programId }));
};
const response = (id: number, unread = 1, type = 'schedule_submitted') => ({
  data: { data: [{ id, type, title: 'Schedule update', message: 'Updated', created_at: '2026-11-13T08:00:00Z', read_at: null }], unread_count: unread },
});
const changed = (topic: string) => window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { topics: [topic] } }));
const start = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  user(1, 'dean');
  vi.mocked(api.get).mockResolvedValue(response(10, 7));
  vi.mocked(api.patch).mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSystemNotifications', () => {
  it('uses the authorized backend list and count together without deriving the badge from the page size', async () => {
    const { result } = renderHook(() => useSystemNotifications(1));
    await start();
    expect(api.get).toHaveBeenCalledWith('/notifications', { params: { limit: 1 } });
    expect(result.current.feedItems.map(item => item.id)).toEqual([10]);
    expect(result.current.unreadCount).toBe(7);
    expect(result.current.feedItems[0].href).toBe('/dean/schedules/approval');
    expect(result.current.isLoading).toBe(false);
  });

  it('refreshes both list and badge on the private notification signal, without reacting to global approvals', async () => {
    const { result } = renderHook(() => useSystemNotifications());
    await start();
    act(() => { changed('approvals'); });
    expect(api.get).toHaveBeenCalledTimes(1);
    vi.mocked(api.get).mockResolvedValueOnce(response(20, 2));
    await act(async () => { changed('notifications'); });
    expect(result.current.feedItems.map(item => item.id)).toEqual([20]);
    expect(result.current.unreadCount).toBe(2);
  });

  it('prevents an older poll response from restoring unread data after a newer refresh', async () => {
    let finishOld!: (value: ReturnType<typeof response>) => void;
    vi.mocked(api.get).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    const { result } = renderHook(() => useSystemNotifications());
    await start();
    vi.mocked(api.get).mockResolvedValueOnce(response(20, 0));
    await act(async () => { changed('notifications'); });
    expect(result.current.unreadCount).toBe(0);
    await act(async () => { finishOld(response(10, 8)); });
    expect(result.current.feedItems.map(item => item.id)).toEqual([20]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('clears the visible feed immediately when identity or role changes and discards the old account response', async () => {
    const { result, rerender } = renderHook(() => useSystemNotifications());
    await start();
    expect(result.current.feedItems).toHaveLength(1);
    let finishOld!: (value: ReturnType<typeof response>) => void;
    vi.mocked(api.get).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    act(() => { changed('notifications'); });
    user(2, 'vpaa');
    rerender();
    expect(result.current.feedItems).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    vi.mocked(api.get).mockResolvedValueOnce(response(30, 3, 'schedule_approved_by_dean'));
    await start();
    await act(async () => { finishOld(response(11, 99)); });
    expect(result.current.feedItems.map(item => item.id)).toEqual([30]);
    expect(result.current.feedItems[0].href).toBe('/schedules/approval');
    expect(result.current.unreadCount).toBe(3);
  });

  it('clears old program data on a storage change and leaves no stale badge when the next fetch fails', async () => {
    user(1, 'program_head', 1);
    const { result } = renderHook(() => useSystemNotifications());
    await start();
    user(1, 'program_head', 2);
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Unavailable'));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'user' })); });
    expect(result.current.feedItems).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    await start();
    expect(result.current.feedItems).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('refreshes after reads and prevents an old account callback from marking the new account feed read', async () => {
    const { result } = renderHook(() => useSystemNotifications());
    await start();
    vi.mocked(api.get).mockResolvedValueOnce(response(10, 0));
    await act(async () => { await result.current.markAsRead(10); });
    expect(api.patch).toHaveBeenCalledWith('/notifications/10/read');
    expect(result.current.unreadCount).toBe(0);
    const staleMarkAll = result.current.markAllAsRead;
    user(2, 'vpaa');
    await act(async () => { await staleMarkAll(); });
    expect(api.patch).toHaveBeenCalledTimes(1);
  });
});
