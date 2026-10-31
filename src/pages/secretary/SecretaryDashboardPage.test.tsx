import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post: vi.fn(), patch: vi.fn() } }));

import SecretaryDashboardPage from './SecretaryDashboardPage';
import { clearDataCache } from '../../lib/dataCache';

afterEach(cleanup);

const statusSection = (id: number, code: string, year: number, status: string) => ({ id, code, year_level: year, status });

const schedule = (id: number, sectionId: number, over: Record<string, unknown> = {}) => ({
  id,
  semester_id: 1,
  section_id: sectionId,
  department_id: 6,
  faculty_id: 1,
  room_id: 1,
  start_time: '08:00:00',
  end_time: '09:30:00',
  mode: 'on-site',
  status: 'draft',
  course: { id: 1 },
  faculty: { id: 1 },
  room: { id: 1, room_type: 'lecture' },
  ...over,
});

const noInstructor = { faculty_id: null, faculty: null };

// One section at each stage: approved, returned, drafting, and with the Dean.
const scheduleStatus = {
  department_id: 6,
  department_name: 'College of Information Technology',
  has_dean: true,
  cross_department_pending: 0,
  sections: [
    statusSection(1, 'BSIT 1A', 1, 'approved'),
    statusSection(2, 'BSIT 2A', 2, 'revision'),
    statusSection(3, 'BSIT 3A', 3, 'draft'),
    statusSection(4, 'BSIT 4A', 4, 'submitted'),
  ],
};

const initialData = {
  active_semester: { id: 1, academic_year: '2026-2027', semester: '1st', status: 'active' },
  schedules: [
    // Approved and assignable without an instructor: the only assignment that is due.
    schedule(1, 1, { status: 'faculty_assignment', ...noInstructor }),
    // Finalized work is locked, even without an instructor.
    schedule(2, 1, { status: 'finalized', ...noInstructor }),
    // Unapproved rows without instructors are not assignable yet.
    schedule(3, 2, { status: 'revision', ...noInstructor }),
    schedule(4, 3, { ...noInstructor, room_id: null, room: null }),
    schedule(5, 4, { status: 'submitted', ...noInstructor }),
  ],
};

const permissions = ['schedule.view', 'schedule.update', 'schedule.assign_instructor'];

const signIn = (extra: Record<string, unknown> = {}) => localStorage.setItem('user', JSON.stringify({ id: 9, name: 'Maria Santos', role: 'secretary', department_id: 6, permissions, ...extra }));

const mockApi = (overrides: { status?: unknown; requests?: unknown; initial?: unknown } = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/initial-data') return Promise.resolve({ data: overrides.initial ?? initialData });
    if (url === '/departments/6/schedule-status') return overrides.status instanceof Error ? Promise.reject(overrides.status) : Promise.resolve({ data: overrides.status ?? scheduleStatus });
    if (url === '/room-requests') return Promise.resolve({ data: overrides.requests ?? [] });
    if (url === '/room-recovery') return Promise.reject(new Error('not under test'));
    return Promise.resolve({ data: {} });
  });
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  signIn();
  mockApi();
});

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

const renderPage = (role: 'secretary' | 'program_head' = 'secretary') => render(<MemoryRouter initialEntries={['/home']}>
  <Routes>
    <Route path="/home" element={<SecretaryDashboardPage role={role} />} />
    <Route path="*" element={<LocationProbe />} />
  </Routes>
</MemoryRouter>);

const queueRow = (label: string) => screen.getByText(label).closest('button') as HTMLElement;

describe('SecretaryDashboardPage', () => {
  it('reports concurrent drafts, returns, reviews and approvals instead of one department stage', async () => {
    renderPage();
    const context = await screen.findByRole('region', { name: 'Semester status' });
    await waitFor(() => expect(within(context).getByText('Revision needed')).toBeTruthy());
    expect(within(context).getByText('1 returned · 1 drafting · 1 with the Dean · 1 approved')).toBeTruthy();
    // Returned work comes first, without claiming who returned it.
    expect(within(context).getByRole('button', { name: 'Revise returned sections' })).toBeTruthy();
    expect(screen.queryByText(/Returned by Dean/)).toBeNull();
  });

  it('keeps the same four figures whatever stage the work is at', async () => {
    renderPage();
    const kpis = await screen.findByRole('region', { name: 'Key figures' });
    await waitFor(() => expect(within(kpis).getByText('1 returned for revision')).toBeTruthy());
    expect(kpis.children).toHaveLength(4);
    ['Sections drafted', 'Under review', 'Approved by the VPAA', 'Instructors assigned'].forEach(label => expect(within(kpis).getByText(label)).toBeTruthy());
  });

  it('counts only approved, unlocked meetings as instructor assignments due', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Approved meetings without an instructor')).toBeTruthy());
    expect(within(queueRow('Approved meetings without an instructor')).getByText('1')).toBeTruthy();
    fireEvent.click(queueRow('Approved meetings without an instructor'));
    expect(screen.getByTestId('location').textContent).toBe('/secretary/instructor-assignment');
  });

  it('leaves assignment counts out for an account that cannot assign instructors', async () => {
    signIn({ permissions: ['schedule.view', 'schedule.update'] });
    renderPage();
    await screen.findByText("What's left to do");
    expect(screen.queryByText('Approved meetings without an instructor')).toBeNull();
    expect(screen.queryByText('Instructors assigned')).toBeNull();
  });

  it('counts missing rooms only for on-site meetings still being prepared', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('On-site meetings without a room')).toBeTruthy());
    expect(within(queueRow('On-site meetings without a room')).getByText('1')).toBeTruthy();
  });

  it('shows received borrowing requests only to an owner reviewer, and opens Room Requests', async () => {
    signIn({ permissions: [...permissions, 'room.request', 'room.review_requests'] });
    mockApi({ requests: [
      { id: 1, status: 'pending', owner_department: { id: 6, code: 'CIT', name: 'IT' }, requesting_department: { id: 7, code: 'CBA', name: 'BA' } },
      { id: 2, status: 'pending', owner_department: { id: 7, code: 'CBA', name: 'BA' }, requesting_department: { id: 6, code: 'CIT', name: 'IT' } },
    ] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Room borrowing requests to review')).toBeTruthy());
    expect(within(queueRow('Room borrowing requests to review')).getByText('1')).toBeTruthy();
    fireEvent.click(queueRow('Room borrowing requests to review'));
    expect(screen.getByTestId('location').textContent).toBe('/secretary/room-requests');
  });

  it('does not fetch or show borrowing work without the review capability', async () => {
    signIn({ permissions: [...permissions, 'room.request'] });
    renderPage();
    await screen.findByText("What's left to do");
    expect(get).not.toHaveBeenCalledWith('/room-requests', expect.anything());
    expect(screen.queryByText('Room borrowing requests to review')).toBeNull();
  });

  it('keeps Program Head links inside its own routes and leaves out Room Requests', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 9, name: 'PH', role: 'program_head', department_id: 6, permissions: [...permissions, 'room.request', 'room.review_requests'] }));
    renderPage('program_head');
    await waitFor(() => expect(screen.getByText('Approved meetings without an instructor')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Room Requests' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule History' }));
    expect(screen.getByTestId('location').textContent).toBe('/program_head/schedule-history');
  });

  it('opens instructor assignment once every section is approved', async () => {
    mockApi({ status: { ...scheduleStatus, sections: scheduleStatus.sections.map(section => ({ ...section, status: 'approved' })) } });
    renderPage();
    const context = await screen.findByRole('region', { name: 'Semester status' });
    await waitFor(() => expect(within(context).getByText('Instructor assignment')).toBeTruthy());
    fireEvent.click(within(context).getByRole('button', { name: 'Assign instructors' }));
    expect(screen.getByTestId('location').textContent).toBe('/secretary/instructor-assignment');
  });

  it('never shows an all-clear when section status is unavailable', async () => {
    mockApi({ status: new Error('down'), initial: { ...initialData, schedules: [] } });
    renderPage();
    await waitFor(() => expect(screen.getByText('Status unavailable')).toBeTruthy());
    expect(screen.queryByText('Nothing is left to do right now.')).toBeNull();
    expect(screen.getByText(/returned and unscheduled sections may be missing/)).toBeTruthy();
  });

  it('shows submission readiness while sections are being prepared, with the Dean counted once', async () => {
    renderPage();
    const readiness = (await screen.findByText('Submission readiness')).closest('section')!;
    expect(within(readiness).getByText(/of 5 checks pass/)).toBeTruthy();
    expect(screen.getByText('A Department Dean is assigned to receive the submission')).toBeTruthy();
    expect(screen.getByText(/Guidance only/)).toBeTruthy();
  });

  it('leaves out the breakdown and actions a read-only account cannot use', async () => {
    signIn({ permissions: [] });
    renderPage();
    await screen.findByText("What's left to do");
    expect(screen.queryByText('Progress by year level')).toBeNull();
    expect(screen.queryByText('Week at a glance')).toBeNull();
    expect(screen.queryByText('Submission readiness')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule Management' })).toBeNull();
    expect(screen.queryByText('Sections returned for revision')).toBeNull();
  });
});
