import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedData, hasCachedData, setCachedData } from './dataCache';
import { LIVE_UPDATE_EVENT, publishLiveTopics, stopLiveUpdates, type LiveUpdateDetail } from './liveUpdates';
import { getLiveSocketId } from './liveSocket';
import api from './api';
import { useLiveRefresh, useLiveRevision } from '../hooks/useLiveRefresh';

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

describe('live updates', () => {
  const received: string[][] = [];
  const listener = (event: Event) => received.push((event as CustomEvent<LiveUpdateDetail>).detail.topics);

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    received.length = 0;
    setVisibility('visible');
    window.addEventListener(LIVE_UPDATE_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(LIVE_UPDATE_EVENT, listener);
    stopLiveUpdates();
    vi.useRealTimers();
  });

  it('invalidates only the affected cache groups, dashboards included', () => {
    setCachedData('page:dean-schedules:3', { rows: 1 });
    setCachedData('dashboard:dean:7', { rows: 1 });
    setCachedData('page:users', { rows: 1 });

    publishLiveTopics(['approvals']);

    expect(hasCachedData('page:dean-schedules:3')).toBe(false);
    expect(getCachedData('dashboard:dean:7')).toBeUndefined();
    expect(hasCachedData('page:users')).toBe(true);
  });

  it('coalesces a burst of signals into one page refresh', () => {
    publishLiveTopics(['schedules']);
    publishLiveTopics(['schedules', 'rooms']);
    publishLiveTopics(['faculty']);

    expect(received).toHaveLength(0);
    vi.advanceTimersByTime(300);

    expect(received).toHaveLength(1);
    expect([...received[0]].sort()).toEqual(['faculty', 'rooms', 'schedules']);
  });

  it('holds refreshes in a hidden tab until it is shown again', () => {
    setVisibility('hidden');
    publishLiveTopics(['approvals']);
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(0);

    setVisibility('visible');
    publishLiveTopics([]);
    vi.advanceTimersByTime(300);
    // Still pending: only a visibilitychange (wired while connected) or a new
    // signal flushes, and a new signal carries the held topics with it.
    publishLiveTopics(['rooms']);
    vi.advanceTimersByTime(300);
    expect(received).toHaveLength(1);
    expect([...received[0]].sort()).toEqual(['approvals', 'rooms']);
  });

  it('runs a page refresh only for the topics that page shows', () => {
    const onSchedules = vi.fn();
    renderHook(() => useLiveRefresh(['schedules'], onSchedules));
    const { result } = renderHook(() => useLiveRevision(['users']));

    act(() => {
      publishLiveTopics(['schedules']);
      vi.advanceTimersByTime(300);
    });

    expect(onSchedules).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(0);

    act(() => {
      publishLiveTopics(['users']);
      vi.advanceTimersByTime(300);
    });

    expect(onSchedules).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(1);
  });

  it('sends no socket id while disconnected', async () => {
    let headers: Record<string, unknown> = {};
    api.defaults.adapter = (config) => {
      headers = { ...config.headers };
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };

    expect(getLiveSocketId()).toBeNull();
    await api.get('/me');
    expect(headers['X-Socket-ID']).toBeUndefined();
  });
});
