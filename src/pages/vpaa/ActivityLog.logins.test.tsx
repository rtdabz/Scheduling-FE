import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../lib/api', () => ({ default: { get, post: vi.fn() } }));

// Leaflet needs a real layout engine; render the pins as buttons instead.
vi.mock('./activityLog/LoginMap', () => ({
  default: ({ groups, onSelect }: { groups: { key: string; label: string }[]; onSelect: (key: string) => void }) => (
    <div data-testid="login-map">
      {groups.map(group => <button key={group.key} type="button" onClick={() => onSelect(group.key)}>pin {group.label}</button>)}
    </div>
  ),
}));

import { MemoryRouter } from 'react-router-dom';
import ActivityLog from './ActivityLog';
import { clearDataCache } from '../../lib/dataCache';
import { groupByLocation, locationLabel, type LoginEntry } from './activityLog/loginActivityModel';

const entry = (overrides: Partial<LoginEntry> = {}): LoginEntry => ({
  id: 1,
  status: 'succeeded',
  reason: null,
  method: 'password',
  occurred_at: '2026-11-14T02:00:00Z',
  user: { id: 7, name: 'Sam Secretary', username: 'sam', role: 'secretary' },
  ip_address: '203.0.113.7',
  client: { browser: 'Chrome 131', os: 'Windows 10/11', device: 'Desktop' },
  location: { status: 'resolved', city: 'Zamboanga', region: 'Zamboanga Peninsula', country: 'Philippines', country_code: 'PH', latitude: 6.91, longitude: 122.07, is_proxy: false },
  ...overrides,
});

const sharedMeta = { summary: { failed: 1, users: 1 }, retention_days: 90, facets: { users: [{ id: 7, name: 'Sam Secretary', username: 'sam', role: 'secretary' }] } };

const failed = entry({
  id: 2, status: 'failed', reason: 'invalid_password',
  location: { status: 'private', city: null, region: null, country: null, country_code: null, latitude: null, longitude: null, is_proxy: null },
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

beforeEach(() => {
  clearDataCache();
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/activity-log') return Promise.resolve({ data: { data: [], meta: { current_page: 1, per_page: 10, total: 0, last_page: 1 } } });
    if (url === '/activity-log/login-locations') {
      return Promise.resolve({ data: { data: [entry()], meta: { ...sharedMeta, total: 2, located: 1, truncated: false, max_points: 2000 } } });
    }
    if (url === '/activity-log/login-history') {
      return Promise.resolve({ data: { data: [failed, entry()], meta: { ...sharedMeta, current_page: 1, per_page: 25, total: 2, last_page: 1 } } });
    }
    return Promise.resolve({ data: [] });
  });
});

describe('Activity Log tabs', () => {
  it('keeps All Activities as the default tab', async () => {
    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    expect(screen.getByRole('tab', { name: 'All Activities' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/activity-log', expect.anything()));
    expect(get).not.toHaveBeenCalledWith('/activity-log/login-locations', expect.anything());
  });

  it('shows login locations and reveals full details when a pin is selected', async () => {
    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'Login Locations' }));

    const pin = await screen.findByRole('button', { name: 'pin Zamboanga, Zamboanga Peninsula, Philippines' });
    expect(window.location.search).toBe('?tab=locations');
    expect(screen.getByText(/1 attempt without a location/)).toBeTruthy();

    fireEvent.click(pin);
    const card = await screen.findByRole('article', { name: 'Sign-in by Sam Secretary' });
    for (const text of ['Secretary', 'Successful', '203.0.113.7', 'Desktop · Windows 10/11', 'Chrome 131', 'Zamboanga, Zamboanga Peninsula, Philippines']) {
      expect(within(card).getByText(text)).toBeTruthy();
    }
    expect(screen.getByText(/does not use device GPS/)).toBeTruthy();
  });

  it('applies date, user, role and status filters to the login endpoints', async () => {
    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'Login History' }));
    await screen.findByText('Incorrect password');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    fireEvent.change(await screen.findByLabelText('User'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'secretary' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/activity-log/login-history', {
      params: { page: 1, per_page: 25, from: '2026-11-01', user_id: '7', role: 'secretary', status: 'failed' },
    }));

    // Filters carry over to the map tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Login Locations' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/activity-log/login-locations', {
      params: { from: '2026-11-01', user_id: '7', role: 'secretary', status: 'failed' },
    }));
  });

  it('lists history rows with graceful location fallbacks', async () => {
    window.history.replaceState(null, '', '/?tab=history');
    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    const table = await screen.findByRole('table', { name: 'Login history' });
    expect(await within(table).findByText('Private or internal network')).toBeTruthy();
    expect(within(table).getByText('Failed')).toBeTruthy();
    expect(within(table).getAllByText('Sam Secretary')).toHaveLength(2);
  });
});

describe('login location model', () => {
  it('groups logins by coordinate and counts failures', () => {
    const groups = groupByLocation([entry(), entry({ id: 3, status: 'failed' }), failed]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].failed).toBe(1);
  });

  it('skips repeated place names and labels unresolved lookups', () => {
    const singapore = entry().location;
    expect(locationLabel({ ...singapore, city: 'Singapore', region: 'Singapore', country: 'Singapore' })).toBe('Singapore');
    expect(locationLabel({ ...singapore, status: 'expired' })).toBe('Location no longer retained');
  });
});
