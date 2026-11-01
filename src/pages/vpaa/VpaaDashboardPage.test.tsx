import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the module body, so the spy has to be
// hoisted with them rather than declared as a plain top-level const.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post: vi.fn(), patch: vi.fn() } }));

import VpaaDashboardPage from './VpaaDashboardPage';
import { clearDataCache } from '../../lib/dataCache';

afterEach(cleanup);

const department = (id: number, code: string, name: string) => ({ id, department_code: code, department_name: name });
const section = (id: number, name: string, departmentId: number) => ({ id, section_name: name, department_id: departmentId });

/**
 * `faculty_assignment` is where VPAA approval actually leaves a row, and
 * `conditionally_approved` is a Dean approval with an override. Approval stage
 * comes from submissions, so these rows must never decide the counts.
 */
const schedule = (id: number, sectionId: number, departmentId: number, status: string) => ({
  id, semester_id: 1, section_id: sectionId, department_id: departmentId, status,
});

const submission = (id: number, departmentId: number, status: string, sectionIds: number[], extra: Record<string, unknown> = {}) => ({
  id,
  department_id: departmentId,
  semester_id: 1,
  revision_number: 1,
  status,
  submitted_at: '2026-09-01T02:00:00.000000Z',
  dean_reviewed_at: '2026-09-02T02:00:00.000000Z',
  sections: sectionIds.map(sectionId => ({ id: sectionId })),
  ...extra,
});

const faculty = (id: number, name: string, assigned: number, extra: Record<string, unknown> = {}) => {
  const [first_name, last_name] = name.split(' ');
  return { id, first_name, last_name, max_units: 18, deload_units: 0, overload_units: 6, assigned_units: assigned, department_id: 1, status: 'active', ...extra };
};

const transfer = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, status, department_id: 3, department: 'Education', semester_id: 1, semester_label: '2nd Semester, AY 2026-2027',
  submitted_by: 'Maria Santos', submitted_at: '2026-08-20T02:00:00Z', dean_reviewed_at: '2026-08-25T02:00:00Z',
  reviewed_at: null, rejection_reason: null, schedule_ids: [9],
  changes: [{ schedule_id: 9, course: 'ED 101', section: 'BEED 1A', before: { room: 'R1', day: 'Monday', start_time: '08:00', end_time: '09:00' }, after: { room: 'R2', day: 'Monday', start_time: '08:00', end_time: '09:00' } }],
  ...extra,
});

const initialData = {
  active_semester: { id: 1, academic_year: '2026-2027', semester: '2nd', is_active: true },
  departments: [department(1, 'CBA', 'Business Administration'), department(2, 'CIT', 'Information Technology'), department(3, 'CED', 'Education')],
  sections: [section(1, 'BSBA 1A', 1), section(2, 'BSBA 2A', 1), section(3, 'BSIT 1A', 2), section(4, 'BEED 1A', 3)],
  schedules: [
    schedule(1, 1, 1, 'faculty_assignment'),
    schedule(2, 2, 1, 'faculty_assignment'),
    schedule(3, 3, 2, 'conditionally_approved'),
    schedule(4, 4, 3, 'draft'),
  ],
  // CBA: fully approved. CIT: Dean-cleared with an override. CED: never submitted.
  schedule_submissions: [
    submission(1, 1, 'approved', [1, 2]),
    submission(2, 2, 'pending_vpaa', [3], { approval_override: true, approval_override_reason: 'Room-type rule waived' }),
  ],
  // Basic 18 + 6 overload = 24 ceiling: 21 is overload within the limit, 25 is over it.
  faculties: [faculty(1, 'Grace Hopper', 18), faculty(2, 'Alan Turing', 21), faculty(3, 'Ada Lovelace', 25), faculty(4, 'Old Timer', 40, { status: 'inactive' })],
};

const insights = {
  semester_id: 1, generated_at: '2026-10-30T00:00:00Z',
  utilization: {
    open_minutes_per_day: 810, rooms_total: 12, rooms_in_use: 5, rooms_unavailable: 0, average_utilization: 18,
    buildings: [
      { building: 'Main Building', rooms: 8, rooms_in_use: 5, meetings: 40, booked_hours: 120, utilization: 27 },
      { building: 'Annex', rooms: 4, rooms_in_use: 0, meetings: 0, booked_hours: 0, utilization: 0 },
    ],
    busiest_rooms: [], idle_rooms: [], idle_room_count: 7,
  },
  peak_load: { days: [], hours: [], matrix: {}, peak: 0, peak_day: null, peak_hour: null },
  coverage: { sections_with_schedule: 4, classes_without_instructor: 0, sections_without_instructor: 0, classes_without_room: 3, departments_with_gaps: 1 },
};

const mockApi = (overrides: { initial?: unknown; transfers?: unknown; insights?: unknown } = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/initial-data') return overrides.initial instanceof Error ? Promise.reject(overrides.initial) : Promise.resolve({ data: overrides.initial ?? initialData });
    if (url === '/vpaa/dashboard-insights') return overrides.insights instanceof Error ? Promise.reject(overrides.insights) : Promise.resolve({ data: overrides.insights ?? insights });
    if (url === '/room-recovery/transfers') return overrides.transfers instanceof Error ? Promise.reject(overrides.transfers) : Promise.resolve({ data: { transfers: overrides.transfers ?? [] } });
    return Promise.resolve({ data: {} });
  });
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 2, name: 'VPAA Office', role: 'vpaa' }));
  mockApi();
});

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

const renderPage = () => render(<MemoryRouter initialEntries={['/dashboard']}>
  <Routes>
    <Route path="/dashboard" element={<VpaaDashboardPage />} />
    <Route path="*" element={<LocationProbe />} />
  </Routes>
</MemoryRouter>);

const kpi = async (label: string) => {
  const kpis = await screen.findByRole('region', { name: 'Key figures' });
  // The label is a direct child of its card.
  return within(kpis).getByText(label).parentElement as HTMLElement;
};

describe('VpaaDashboardPage', () => {
  it('keeps to four figures, the decision queue, exceptions and the institution status', async () => {
    renderPage();
    const kpis = await screen.findByRole('region', { name: 'Key figures' });
    expect(kpis.children).toHaveLength(4);
    expect(screen.getByText('Waiting on your decision')).toBeTruthy();
    expect(screen.getByText('Exceptions to watch')).toBeTruthy();
    expect(screen.getByText('Institution status')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Department progress' })).toBeTruthy();
    expect(screen.getByText('Room use')).toBeTruthy();
    // Timetable browsing lives in the master calendar.
    expect(screen.queryByText('Master timetable')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open master calendar' })).toBeTruthy();
  });

  it('shows a pending room schedule reassignment when no schedule submission is waiting, and opens that transfer', async () => {
    mockApi({
      initial: { ...initialData, schedule_submissions: [submission(1, 1, 'approved', [1, 2])] },
      transfers: [transfer('t-1', 'pending_vpaa'), transfer('t-2', 'pending_dean'), transfer('t-3', 'approved')],
    });
    renderPage();
    const queue = await screen.findByRole('list', { name: 'Pending requests' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(1);
    expect(within(queue).getByText('Room schedule reassignment')).toBeTruthy();
    expect(within(queue).getByText(/1 meeting moved/)).toBeTruthy();
    expect(screen.getByText('1 decision awaiting you')).toBeTruthy();
    expect(screen.queryByText('Nothing is waiting on your decision.')).toBeNull();

    fireEvent.click(within(queue).getByRole('button', { name: 'Review Education' }));
    expect(screen.getByTestId('location').textContent).toBe('/schedules/approval?room_transfer=t-1');
  });

  it('counts a Dean override as awaiting the VPAA and keeps the override reason visible', async () => {
    renderPage();
    const queue = await screen.findByRole('list', { name: 'Pending requests' });
    expect(within(queue).getByText('Information Technology')).toBeTruthy();
    expect(within(queue).getByText('Override: Room-type rule waived')).toBeTruthy();
    expect(screen.getByText('1 awaiting you · override')).toBeTruthy();
  });

  it('lists separate requests from one department, oldest handoff first', async () => {
    mockApi({
      initial: {
        ...initialData,
        sections: [...initialData.sections, section(5, 'BSIT 2A', 2)],
        schedule_submissions: [
          submission(2, 2, 'pending_vpaa', [3], { dean_reviewed_at: '2026-09-09T02:00:00Z' }),
          submission(3, 2, 'pending_vpaa', [5], { revision_number: 2, dean_reviewed_at: '2026-08-01T02:00:00Z' }),
        ],
      },
    });
    renderPage();
    const queue = await screen.findByRole('list', { name: 'Pending requests' });
    const rows = within(queue).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // The older handoff (a revision) is first, so it cannot hide behind the newer one.
    expect(within(rows[0]).getByText('Revision 2')).toBeTruthy();
    expect(screen.getByText('2 decisions awaiting you')).toBeTruthy();
  });

  it('counts VPAA-approved sections from submissions, and fully approved departments beside them', async () => {
    renderPage();
    const card = await kpi('Sections approved');
    expect(within(card).getByText('2')).toBeTruthy();
    expect(within(card).getByText('/ 4')).toBeTruthy();
    const departments = await kpi('Departments complete');
    expect(within(departments).getByText('1')).toBeTruthy();
    expect(within(departments).getByText('/ 3 scheduling')).toBeTruthy();
  });

  it('separates basic-load overload from exceeding the permitted ceiling, among active instructors', async () => {
    renderPage();
    const overLimit = await screen.findByRole('button', { name: /Instructors over their limit/ });
    expect(within(overLimit).getByText('1')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /On overload, within limit/ })).getByText('1')).toBeTruthy();
    // The inactive instructor at 40 units is not counted.
    expect(within(screen.getByRole('button', { name: /Dean overrides awaiting you/ })).getByText('1')).toBeTruthy();
    fireEvent.click(overLimit);
    expect(screen.getByTestId('location').textContent).toBe('/instructors');
  });

  it('does not report an all-clear when room schedule reassignments fail to load', async () => {
    mockApi({ initial: { ...initialData, schedule_submissions: [submission(1, 1, 'approved', [1, 2])] }, transfers: new Error('boom') });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Room schedule reassignments could not be loaded/)).toBeTruthy());
    expect(screen.queryByText('Nothing is waiting on your decision.')).toBeNull();
    expect(screen.queryByText('Nothing awaiting you')).toBeNull();
    expect(screen.getByText('Room schedule reassignments unavailable')).toBeTruthy();
  });

  it('hides figures instead of showing zeros when the first load fails', async () => {
    mockApi({ initial: new Error('down') });
    renderPage();
    await waitFor(() => expect(screen.getByText('Data unavailable')).toBeTruthy());
    expect(screen.queryByRole('region', { name: 'Key figures' })).toBeNull();
    expect(screen.queryByText('Nothing awaiting you')).toBeNull();
  });

  it('summarises room use by building, folding buildings without classes into one line', async () => {
    renderPage();
    const panel = (await screen.findByText('Room use')).closest('section')!;
    await waitFor(() => expect(within(panel).getByText('18%')).toBeTruthy());
    expect(within(panel).getByText(/5 of 12 rooms in use/)).toBeTruthy();
    expect(within(panel).getByText('Main Building')).toBeTruthy();
    expect(within(panel).getByText('No classes in Annex.')).toBeTruthy();
    expect(within(panel).getByText('7 rooms are unused this semester.')).toBeTruthy();
  });

  it('shows room use as unavailable, not as zero rooms, when insights fail', async () => {
    mockApi({ insights: new Error('down') });
    renderPage();
    const panel = (await screen.findByText('Room use')).closest('section')!;
    await waitFor(() => expect(within(panel).getByText('Room use could not be loaded.')).toBeTruthy());
    expect(within(panel).queryByText('No rooms are set up yet.')).toBeNull();
    // Other blocks keep working.
    expect(screen.getByText('Exceptions to watch')).toBeTruthy();
  });

  it('states that no semester is active rather than rolling up every semester', async () => {
    mockApi({ initial: { ...initialData, active_semester: null } });
    renderPage();
    await waitFor(() => expect(screen.getAllByText('No active semester').length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: 'Key figures' })).toBeNull();
  });

  it('asks the API for the same schedule window as before', async () => {
    renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/initial-data', { params: { schedule_limit: 2000 } }));
  });

  it('shows the skeleton while the first load is in flight', () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });

  it('serves a revisit from cache instead of refetching the initial data', async () => {
    renderPage();
    await screen.findByText('Waiting on your decision');
    const initialCalls = get.mock.calls.filter(([url]) => url === '/initial-data').length;
    cleanup();
    renderPage();
    await screen.findByText('Waiting on your decision');
    expect(get.mock.calls.filter(([url]) => url === '/initial-data').length).toBe(initialCalls);
  });
});
