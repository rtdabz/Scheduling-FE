import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationBell from './NotificationBell';
import type { ActivityFeedItem } from '../overview';

const markAsRead = vi.fn(() => Promise.resolve());
const markAllAsRead = vi.fn(() => Promise.resolve());
const refresh = vi.fn(() => Promise.resolve());

let hookState: {
  feedItems: ActivityFeedItem[];
  unreadCount: number;
  isLoading: boolean;
};

vi.mock('../../hooks/useSystemNotifications', () => ({
  useSystemNotifications: () => ({ ...hookState, refresh, markAsRead, markAllAsRead }),
}));

// The vitest config does not enable globals, so testing-library's automatic
// cleanup never registers and each render would leave its bell in the document.
afterEach(cleanup);

const item = (over: Partial<ActivityFeedItem> & { id: number }): ActivityFeedItem => ({
  title: 'Schedule submitted',
  action: 'BSIT submitted 12 schedules for review.',
  timestamp: 'Aug 19, 2026 09:12 AM',
  isUnread: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  hookState = { feedItems: [], unreadCount: 0, isLoading: false };
});

const bell = () => screen.getByRole('button', { name: /notifications/i });

describe('NotificationBell', () => {
  it('labels the trigger with the unread count', () => {
    hookState = { feedItems: [item({ id: 1 })], unreadCount: 3, isLoading: false };
    render(<NotificationBell />);

    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('caps the badge so a large backlog cannot stretch the trigger', () => {
    hookState = { feedItems: [], unreadCount: 41, isLoading: false };
    render(<NotificationBell />);

    expect(screen.getByText('9+')).toBeTruthy();
    expect(screen.queryByText('41')).toBeNull();
  });

  it('shows no badge when everything has been read', () => {
    render(<NotificationBell />);

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists the feed once opened', () => {
    hookState = {
      feedItems: [
        item({ id: 7, action: 'Dean returned BSIT schedules.', remarks: 'Fix the 7 AM overlap.' }),
        item({ id: 8, title: 'VPAA approval', action: 'VPAA approved BSCS.', isUnread: false }),
      ],
      unreadCount: 1,
      isLoading: false,
    };
    render(<NotificationBell />);
    fireEvent.click(bell());

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByText('Dean returned BSIT schedules.')).toBeTruthy();
    expect(screen.getByText('Fix the 7 AM overlap.')).toBeTruthy();
    expect(screen.getByText('VPAA approved BSCS.')).toBeTruthy();
    expect(screen.getByText('1 unread')).toBeTruthy();
  });

  it('says so when there is nothing to show', () => {
    render(<NotificationBell />);
    fireEvent.click(bell());

    expect(screen.getByText('No notifications yet.')).toBeTruthy();
  });

  it('reports loading only while the first poll is still out', () => {
    hookState = { feedItems: [], unreadCount: 0, isLoading: true };
    render(<NotificationBell />);
    fireEvent.click(bell());

    expect(screen.getByText('Loading notifications')).toBeTruthy();
  });

  it('marks an unread item read by its own id', async () => {
    hookState = {
      feedItems: [item({ id: 7 }), item({ id: 9, action: 'Second notice.' })],
      unreadCount: 2,
      isLoading: false,
    };
    render(<NotificationBell />);
    fireEvent.click(bell());
    fireEvent.click(screen.getByText('Second notice.'));

    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith(9);
  });

  it('does not re-mark an item that is already read', () => {
    hookState = { feedItems: [item({ id: 4, isUnread: false })], unreadCount: 0, isLoading: false };
    render(<NotificationBell />);
    fireEvent.click(bell());
    fireEvent.click(screen.getByText('BSIT submitted 12 schedules for review.'));

    expect(markAsRead).not.toHaveBeenCalled();
  });

  it('clears the whole backlog from the header action', () => {
    hookState = { feedItems: [item({ id: 4 })], unreadCount: 2, isLoading: false };
    render(<NotificationBell />);
    fireEvent.click(bell());
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));

    expect(markAllAsRead).toHaveBeenCalledTimes(1);
  });

  it('offers no mark-all action when nothing is unread', () => {
    hookState = { feedItems: [item({ id: 4, isUnread: false })], unreadCount: 0, isLoading: false };
    render(<NotificationBell />);
    fireEvent.click(bell());

    expect(screen.queryByRole('button', { name: /mark all read/i })).toBeNull();
  });

  it('closes on Escape and on a click outside', () => {
    hookState = { feedItems: [item({ id: 4 })], unreadCount: 1, isLoading: false };
    render(<NotificationBell />);

    fireEvent.click(bell());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(bell());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('toggles shut when the trigger is clicked again', () => {
    render(<NotificationBell />);

    fireEvent.click(bell());
    expect(bell().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(bell());
    expect(bell().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
