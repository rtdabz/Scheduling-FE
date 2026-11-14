import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MULTIPLE_PROGRAMS_LOCK_MESSAGE } from './lib/storedUser';
import { getCachedData } from './lib/dataCache';

const { get, put, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./lib/api', () => ({ default: { get, put } }));
vi.mock('./context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('./lib/liveUpdates', () => ({ LIVE_UPDATE_EVENT: 'wicars:live-update' }));
vi.mock('./pages/LoginPage', () => ({ default: () => null }));
vi.mock('./pages/vpaa/archive/ModuleArchiveTabs', () => ({ default: () => null }));
vi.mock('./pages/vpaa/archive/ArchiveRedirect', () => ({ default: () => null }));
vi.mock('./components/layout/AppLayout', async () => {
  const { Suspense } = await import('react');
  const { Outlet } = await import('react-router-dom');
  return { default: () => <Suspense><Outlet /></Suspense> };
});

afterEach(cleanup);

it('guards the direct URL, updates access live, and clears cached controls when a save is forbidden', async () => {
  const user = {
    id: 1, role: 'secretary', department_id: 1, scheduling_ready: true,
    department_program_count: 1, permissions: ['schedule.view', 'room.assign_program'],
  };
  const payload = {
    can_manage: true, room_sharing_policy: 'open', rooms: [],
    programs: [{ id: 1, code: 'X' }, { id: 2, code: 'Y' }],
  };
  get.mockImplementation((url: string) => {
    if (url === '/me') return Promise.resolve({ data: { ...user } });
    if (url === '/program-rooms') return Promise.resolve({ data: { data: payload } });
    throw new Error(`Unexpected request: ${url}`);
  });
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('token', 'program-rooms-test');
  sessionStorage.setItem('user', JSON.stringify(user));
  window.history.replaceState(null, '', '/secretary/program-rooms');
  const { default: App } = await import('./App');
  render(<App />);

  expect(await screen.findByText('Program Rooms is Locked')).toBeTruthy();
  expect(screen.getByText(MULTIPLE_PROGRAMS_LOCK_MESSAGE)).toBeTruthy();
  await waitFor(() => expect(get).toHaveBeenCalledWith('/me'));
  expect(get.mock.calls.some(([url]) => url === '/program-rooms')).toBe(false);

  const programsChanged = () => act(() => {
    window.dispatchEvent(new CustomEvent('wicars:live-update', { detail: { topics: ['departments'] } }));
  });
  user.department_program_count = 2;
  programsChanged();
  expect(await screen.findByRole('radiogroup', { name: 'Room sharing' })).toBeTruthy();

  user.department_program_count = 1;
  programsChanged();
  expect(await screen.findByText('Program Rooms is Locked')).toBeTruthy();
  expect(screen.queryByRole('radiogroup')).toBeNull();

  user.department_program_count = 2;
  programsChanged();
  const preferred = await screen.findByRole('radio', { name: 'Preferred' });
  fireEvent.click(preferred);
  put.mockRejectedValue({ response: { status: 403, data: { message: MULTIPLE_PROGRAMS_LOCK_MESSAGE } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(await screen.findByText('Program Rooms is Locked')).toBeTruthy();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(getCachedData('page:rooms:program-rooms:1')).toBeUndefined();

  programsChanged();
  expect(await screen.findByRole('radiogroup', { name: 'Room sharing' })).toBeTruthy();
});
