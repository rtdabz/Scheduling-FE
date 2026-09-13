import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock('../../lib/authSession', () => ({
  logoutCurrentSession: () => mocks.logout(),
}));

import SessionTimeoutGuard from './SessionTimeoutGuard';
import {
  announceSessionEnded,
  IDLE_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
} from '../../lib/sessionTimeout';

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

describe('SessionTimeoutGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T08:00:00Z'));
  });

  afterEach(() => {
    // This suite runs without vitest globals, so RTL's auto-cleanup is not wired up.
    cleanup();
    vi.useRealTimers();
  });

  it('stays out of the way while the user is active', async () => {
    render(<SessionTimeoutGuard />);

    for (let elapsed = 0; elapsed < IDLE_TIMEOUT_MS * 2; elapsed += 60_000) {
      await advance(60_000);
      act(() => {
        window.dispatchEvent(new Event('keydown'));
      });
    }

    expect(mocks.logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('warns and ends the session after the idle window with no interaction', async () => {
    render(<SessionTimeoutGuard />);

    await advance(IDLE_TIMEOUT_MS - 2000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mocks.logout).not.toHaveBeenCalled();

    await advance(3000);

    expect(mocks.logout).toHaveBeenCalledOnce();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('You have been signed out');
    expect(screen.getByRole('button', { name: 'Back to Login' })).toBeTruthy();
  });

  it('honours activity recorded by another tab', async () => {
    render(<SessionTimeoutGuard />);

    await advance(IDLE_TIMEOUT_MS - 30_000);
    const stamp = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(stamp));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: LAST_ACTIVITY_KEY, newValue: String(stamp) }),
      );
    });

    await advance(60_000);

    expect(mocks.logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('expires immediately when the stored timestamp is already stale', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now() - IDLE_TIMEOUT_MS - 1000));

    render(<SessionTimeoutGuard />);
    await advance(0);

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('explains an expired token announced by the API layer', async () => {
    render(<SessionTimeoutGuard />);
    await advance(1000);

    let handled = false;
    act(() => {
      handled = announceSessionEnded('expired');
    });

    // The API layer relies on this to know it must not redirect instead.
    expect(handled).toBe(true);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Your session is no longer valid');
    expect(screen.getByRole('button', { name: 'Back to Login' })).toBeTruthy();
    // The token is already gone by then; the guard must not sign out again.
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('reports no handler when the shell is not mounted', () => {
    expect(announceSessionEnded('expired')).toBe(false);
  });

  it('keeps the first explanation when both causes fire', async () => {
    render(<SessionTimeoutGuard />);

    await advance(IDLE_TIMEOUT_MS);
    expect(screen.getByRole('alertdialog').textContent).toContain('You have been signed out');

    act(() => {
      announceSessionEnded('expired');
    });

    expect(screen.getByRole('alertdialog').textContent).toContain('You have been signed out');
  });
});
