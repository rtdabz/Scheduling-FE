import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post: vi.fn() } }));

// Leaflet needs real layout; expose the pin and its popup details as plain DOM.
vi.mock('./activityLog/SingleLoginMap', () => ({
  default: ({ latitude, longitude, details }: { latitude: number; longitude: number; details: [string, string][] }) => (
    <div data-testid="single-login-map" data-lat={latitude} data-lng={longitude}>
      {details.map(([label, value]) => <span key={label}>popup {label}: {value}</span>)}
    </div>
  ),
}));

import ActivityLog from './ActivityLog';
import LoginDetailsPage from './LoginDetailsPage';
import { clearDataCache } from '../../lib/dataCache';
import type { LoginEntry } from './activityLog/loginActivityModel';

const login = (overrides: Partial<LoginEntry> = {}): LoginEntry => ({
  id: 42,
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

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

const renderAt = (path: string, state?: unknown) => render(
  <MemoryRouter initialEntries={[{ pathname: path, state }]}>
    <Routes>
      <Route path="/activity-log" element={<><ActivityLog /><LocationProbe /></>} />
      <Route path="/activity-log/logins/:id" element={<><LoginDetailsPage /><LocationProbe /></>} />
    </Routes>
  </MemoryRouter>,
);

let detail: LoginEntry = login();

beforeEach(() => {
  clearDataCache();
  detail = login();
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/activity-log') {
      return Promise.resolve({ data: {
        data: [
          { id: 'authentication:42', source: 'authentication', category: 'account_access', event: 'login_succeeded', status: 'completed', occurred_at: '2026-11-14T02:00:00Z', actor: { id: 7, name: 'Sam Secretary', username: 'sam', role: 'secretary' }, department_id: null, semester_id: null, target: { type: 'user', id: 7 }, metadata: {} },
          { id: 'authentication:43', source: 'authentication', category: 'account_access', event: 'logout', status: 'completed', occurred_at: '2026-11-14T03:00:00Z', actor: { id: 7, name: 'Sam Secretary', username: 'sam', role: 'secretary' }, department_id: null, semester_id: null, target: { type: 'user', id: 7 }, metadata: {} },
          { id: 'scheduling:9', source: 'scheduling', category: 'scheduling', event: 'schedule_created', status: 'completed', occurred_at: '2026-11-14T04:00:00Z', actor: null, department_id: null, semester_id: null, target: { type: 'schedule', id: 1 }, metadata: {} },
        ],
        meta: { current_page: 1, per_page: 10, total: 3, last_page: 1 },
      } });
    }
    if (url.startsWith('/activity-log/logins/')) {
      if (url.endsWith('/404')) return Promise.reject(Object.assign(new Error('nf'), { isAxiosError: true, response: { status: 404 } }));
      return Promise.resolve({ data: { data: detail, meta: { retention_days: 90 } } });
    }
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => cleanup());

describe('Activity Log View action', () => {
  it('shows View only on sign-in rows and navigates to a full page, not a drawer', async () => {
    renderAt('/activity-log');
    const table = await screen.findByRole('table', { name: 'Activity log' });
    await within(table).findByText('Signed In');

    const viewButtons = within(table).getAllByRole('button', { name: 'View sign-in details' });
    expect(viewButtons).toHaveLength(1);

    fireEvent.click(viewButtons[0]);
    expect((await screen.findByTestId('location')).textContent).toBe('/activity-log/logins/42');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(get).toHaveBeenCalledWith('/activity-log/logins/42');
  });
});

describe('Login details page', () => {
  it('shows user, sign-in, device and location details with a pin', async () => {
    renderAt('/activity-log/logins/42');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sam Secretary' })).toBeTruthy();

    for (const text of ['203.0.113.7', 'Desktop', 'Windows 10/11', 'Chrome 131', 'Username and password', 'Zamboanga', 'Zamboanga Peninsula', 'Philippines', '6.91, 122.07']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Secretary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Successful').length).toBeGreaterThan(0);

    const map = screen.getByTestId('single-login-map');
    expect(map.getAttribute('data-lat')).toBe('6.91');
    expect(within(map).getByText('popup Coordinates: 6.91, 122.07')).toBeTruthy();
    expect(screen.getByText(/never uses device GPS/)).toBeTruthy();
  });

  it('explains missing locations instead of showing a pin', async () => {
    detail = login({
      status: 'failed', reason: 'invalid_password',
      location: { status: 'private', city: null, region: null, country: null, country_code: null, latitude: null, longitude: null, is_proxy: null },
    });
    renderAt('/activity-log/logins/42');

    expect(await screen.findByText('Signed in from a private network')).toBeTruthy();
    expect(screen.queryByTestId('single-login-map')).toBeNull();
    expect(screen.getByText('Incorrect password')).toBeTruthy();
    expect(screen.getAllByText('Not available')).toHaveLength(4);
  });

  it('returns to the Activity Log view the VPAA came from', async () => {
    renderAt('/activity-log/logins/42', { from: '/activity-log?tab=history' });
    const back = await screen.findByRole('link', { name: 'Back to Activity Log' });
    expect(back.getAttribute('href')).toBe('/activity-log?tab=history');
  });

  it('ignores back targets outside the Activity Log and handles unknown records', async () => {
    renderAt('/activity-log/logins/404', { from: 'https://evil.example' });
    expect(await screen.findByText(/does not exist/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Activity Log' }).getAttribute('href')).toBe('/activity-log');
  });
});
