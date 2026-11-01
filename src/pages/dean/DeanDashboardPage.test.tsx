import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the module body, so the spy has to be
// hoisted with them rather than declared as a plain top-level const.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post: vi.fn(), patch: vi.fn() } }));

import DeanDashboardPage from './DeanDashboardPage';
import { clearDataCache } from '../../lib/dataCache';

// The vitest config does not enable globals, so testing-library's automatic
// cleanup never registers.
afterEach(cleanup);

const BSIT = { id: 10, code: 'BSIT', name: 'Information Technology' };
const BSCS = { id: 11, code: 'BSCS', name: 'Computer Science' };

// Program comes from explicit metadata: "ACT 1A" belongs to BSCS, which a name-based guess would miss.
const section = (id: number, name: string, year: number, program: typeof BSIT) => ({ id, section_name: name, year_level: year, department_id: 6, program });

const statusSection = (id: number, code: string, year: number, status: string) => ({ id, code, year_level: year, status });

const schedule = (id: number, sectionId: number, status = 'submitted') => ({ id, semester_id: 1, section_id: sectionId, department_id: 6, status });

const submission = (id: number, status: string, sectionIds: number[], extra: Record<string, unknown> = {}) => ({
  id, department_id: 6, semester_id: 1, revision_number: 1, status,
  submitted_at: '2026-08-12T02:24:00Z',
  sections: sectionIds.map(sectionId => ({ id: sectionId, pivot: { state: 'included' } })),
  submitter: { name: 'Juan Dela Cruz' },
  ...extra,
});

const transfer = (id: string, status: string) => ({
  id, status, department_id: 6, department: 'Information Technology', semester_id: 1, semester_label: '2nd Semester',
  submitted_by: 'Maria Santos', submitted_at: '2026-08-10T02:00:00Z', reviewed_at: null, rejection_reason: null, schedule_ids: [7, 8],
  changes: [
    { schedule_id: 7, course: 'IT 101', section: 'BSIT 1A', before: { room: 'R1', day: 'Monday', start_time: '08:00', end_time: '09:00' }, after: { room: 'R2', day: 'Monday', start_time: '08:00', end_time: '09:00' } },
    { schedule_id: 8, course: 'IT 102', section: 'BSIT 1A', before: { room: 'R1', day: 'Tuesday', start_time: '08:00', end_time: '09:00' }, after: { room: 'R3', day: 'Tuesday', start_time: '08:00', end_time: '09:00' } },
  ],
});

const initialData = {
  active_semester: { id: 1, academic_year: '2026-2027', semester: '2nd', is_active: true },
  faculties: [
    { id: 1, first_name: 'Grace', last_name: 'Hopper', max_units: 18, overload_units: 6, assigned_units: 25, deload_units: 0, department_id: 6, status: 'active' },
    { id: 2, first_name: 'Alan', last_name: 'Turing', max_units: 18, overload_units: 6, assigned_units: 21, deload_units: 0, department_id: 6, status: 'active' },
  ],
  sections: [section(1, 'BSIT 1A', 1, BSIT), section(2, 'BSIT 2A', 2, BSIT), section(3, 'ACT 1A', 1, BSCS), section(4, 'BSCS 2A', 2, BSCS)],
  schedules: [schedule(1, 1), schedule(2, 2, 'draft'), schedule(3, 3, 'revision'), schedule(4, 4, 'conditionally_approved')],
  schedule_submissions: [
    submission(1, 'pending_dean', [1]),
    submission(2, 'pending_vpaa', [4], { approval_override: true, approval_override_reason: 'Lab rule waived' }),
  ],
};

const scheduleStatus = {
  department_id: 6,
  department_name: 'College of Information Technology',
  sections: [
    statusSection(1, 'BSIT 1A', 1, 'submitted'),
    statusSection(2, 'BSIT 2A', 2, 'draft'),
    statusSection(3, 'ACT 1A', 1, 'revision'),
    statusSection(4, 'BSCS 2A', 2, 'conditionally_approved'),
  ],
};

const mockApi = (overrides: { initial?: unknown; transfers?: unknown; status?: unknown } = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/initial-data') return Promise.resolve({ data: overrides.initial ?? initialData });
    if (url === '/departments/6/schedule-status') return overrides.status instanceof Error ? Promise.reject(overrides.status) : Promise.resolve({ data: overrides.status ?? scheduleStatus });
    if (url === '/room-recovery/transfers') return Promise.resolve({ data: { transfers: overrides.transfers ?? [] } });
    return Promise.resolve({ data: {} });
  });
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 5, name: 'Dean Maria Santos', role: 'dean', department_id: 6 }));
  mockApi();
});

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

const renderPage = () => render(<MemoryRouter initialEntries={['/dean/dashboard']}>
  <Routes>
    <Route path="/dean/dashboard" element={<DeanDashboardPage />} />
    <Route path="*" element={<LocationProbe />} />
  </Routes>
</MemoryRouter>);

const kpi = async (label: string) => {
  const kpis = await screen.findByRole('region', { name: 'Key figures' });
  return within(kpis).getByText(label).parentElement as HTMLElement;
};

describe('DeanDashboardPage', () => {
  it('keeps to four figures, the review queue and the department status', async () => {
    renderPage();
    const kpis = await screen.findByRole('region', { name: 'Key figures' });
    expect(kpis.children).toHaveLength(4);
    ['Awaiting your review', 'With the VPAA', 'Returned for revision', 'Approved by the VPAA'].forEach(label => expect(within(kpis).getByText(label)).toBeTruthy());
    expect(screen.getByText('Review queue')).toBeTruthy();
    expect(screen.getByText('Department status')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Program progress' })).toBeTruthy();
    ['Instructor workload', 'Timetable preview', 'Room usage'].forEach(title => expect(screen.queryByText(title)).toBeNull());
  });

  it('lists the pending submission with its explicit program and real submitter', async () => {
    renderPage();
    const queue = await screen.findByRole('list', { name: 'Pending requests' });
    const rows = within(queue).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('BSIT schedule')).toBeTruthy();
    expect(within(rows[0]).getByText('BSIT 1A · Juan Dela Cruz')).toBeTruthy();
  });

  it('shows a pending room schedule reassignment beside submissions and opens it directly', async () => {
    mockApi({ initial: { ...initialData, schedule_submissions: [] }, transfers: [transfer('t-9', 'pending_dean'), transfer('t-8', 'pending_vpaa')] });
    renderPage();
    const queue = await screen.findByRole('list', { name: 'Pending requests' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(1);
    expect(within(queue).getByText('2 meetings moved · Maria Santos')).toBeTruthy();
    expect(screen.getByText('1 request to review')).toBeTruthy();
    fireEvent.click(within(queue).getByRole('button', { name: 'Review Room schedule reassignment request' }));
    expect(screen.getByTestId('location').textContent).toBe('/dean/schedules/approval?room_transfer=t-9');
  });

  it('counts a conditional approval as forwarded, not final, and notes the override', async () => {
    renderPage();
    const card = await kpi('With the VPAA');
    expect(within(card).getByText('1')).toBeTruthy();
    expect(within(card).getByText('of 4 sections')).toBeTruthy();
    expect(within(card).getByText('1 forwarded with an override')).toBeTruthy();
    const approved = await kpi('Approved by the VPAA');
    expect(within(approved).getByText('0')).toBeTruthy();
  });

  it('groups program progress by program metadata, not section names', async () => {
    renderPage();
    const progress = (await screen.findByText('Program progress')).closest('section')!;
    // BSCS has a returned section and one with the VPAA, though "ACT 1A" does not start with BSCS.
    expect(within(progress).getByText('BSCS')).toBeTruthy();
    expect(within(progress).queryByText('ACT')).toBeNull();
    expect(within(progress).getByText('1 / 2 forwarded')).toBeTruthy();
    expect(within(progress).getByText('1 with VPAA')).toBeTruthy();
    expect(within(progress).getAllByText('1 returned')).toHaveLength(1);
  });

  it('flags instructors over their permitted limit, not those on overload within it', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('1 instructor is over their permitted workload limit.')).toBeTruthy());
  });

  it('does not invent section figures when the status request fails', async () => {
    mockApi({ status: new Error('down') });
    renderPage();
    const card = await kpi('Returned for revision');
    expect(within(card).getByText('Section status unavailable')).toBeTruthy();
    expect(screen.getByText(/program progress is unavailable/)).toBeTruthy();
    expect(screen.queryByText('None returned')).toBeNull();
  });

  it('states that no semester is active instead of showing unscoped work', async () => {
    mockApi({ initial: { ...initialData, active_semester: null } });
    renderPage();
    await waitFor(() => expect(screen.getAllByText('No active semester').length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: 'Key figures' })).toBeNull();
  });

  it('shows the skeleton while the first load is in flight', () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });
});
