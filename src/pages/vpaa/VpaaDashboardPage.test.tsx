import type { ReactElement } from 'react';
import { cloneElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ResponsiveContainer measures its parent, and jsdom reports 0x0 — recharts then
// draws nothing at all. Give every chart a fixed box so the mount is real work.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 320, height: 160 } as Partial<Record<string, unknown>>),
  };
});

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
 * Every schedule row here carries a status that the *old* rollup treated as
 * "draft": `faculty_assignment` is where VPAA approval actually leaves a row,
 * and `conditionally_approved` is a Dean approval with an override. If the page
 * ever goes back to reading `schedules.status`, these fixtures make it fail.
 */
const schedule = (id: number, sectionId: number, departmentId: number, status: string) => ({
  id,
  term_id: 1,
  section_id: sectionId,
  room_id: 1,
  faculty_id: 1,
  day: 'Monday',
  start_time: '08:00:00',
  end_time: '09:30:00',
  mode: 'on-site' as const,
  status,
  updated_at: '2026-09-08T02:00:00.000000Z',
  section: { id: sectionId, section_name: `S${sectionId}`, department_id: departmentId },
  faculty: { id: 1, first_name: 'Grace', last_name: 'Hopper' },
  room: { id: 1, room_code: 'R 301', building: 'Main', room_type: 'lecture' },
  course: { id: 1, course_code: 'IT 101', course_name: 'Intro to IT', course_category: 'major', units: 3 },
});

const submission = (id: number, departmentId: number, status: string, sectionIds: number[], extra: Record<string, unknown> = {}) => ({
  id,
  department_id: departmentId,
  term_id: 1,
  revision_number: 1,
  status,
  submitted_at: '2026-09-01T02:00:00.000000Z',
  dean_reviewed_at: '2026-09-02T02:00:00.000000Z',
  sections: sectionIds.map(sectionId => ({ id: sectionId })),
  ...extra,
});

const initialData = {
  active_term: { id: 1, academic_year: '2026-2027', semester: '2nd', is_active: true },
  departments: [department(1, 'CBA', 'Business Administration'), department(2, 'CIT', 'Information Technology'), department(3, 'CED', 'Education')],
  sections: [section(1, 'BSBA 1A', 1), section(2, 'BSBA 2A', 1), section(3, 'BSIT 1A', 2), section(4, 'BEED 1A', 3)],
  schedules: [
    schedule(1, 1, 1, 'faculty_assignment'),
    schedule(2, 2, 1, 'faculty_assignment'),
    schedule(3, 3, 2, 'conditionally_approved'),
    schedule(4, 4, 3, 'draft'),
  ],
  // CBA: fully approved. CIT: dean-cleared with an override, so it is the queue.
  // CED: never submitted, so it has no submission row at all.
  schedule_submissions: [
    submission(1, 1, 'approved', [1, 2]),
    submission(2, 2, 'pending_vpaa', [3], { approval_override: true, approval_override_reason: 'Room-type rule waived' }),
  ],
  faculties: [
    { id: 1, first_name: 'Grace', last_name: 'Hopper', max_units: 21, assigned_units: 21, department_id: 1, status: 'active' },
    { id: 2, first_name: 'Alan', last_name: 'Turing', max_units: 21, assigned_units: 12, department_id: 1, status: 'active' },
    { id: 3, first_name: 'Ada', last_name: 'Lovelace', max_units: 21, assigned_units: 24, department_id: 2, status: 'active' },
    { id: 4, first_name: 'Donald', last_name: 'Knuth', max_units: 21, assigned_units: 0, department_id: 3, status: 'active' },
  ],
  rooms: [
    { id: 1, room_code: 'R 301', room_type: 'lecture', building: 'Main', status: 'available' },
    { id: 2, room_code: 'R 202', room_type: 'laboratory', building: 'Annex', status: 'available' },
    // Virtual placeholder rows must stay out of the campus room inventory.
    { id: 3, room_code: 'ONLINE', room_type: 'online' },
  ],
  courses: [{ id: 1, subject_code: 'IT 101', subject_name: 'Intro to IT' }],
};

const insights = {
  term_id: 1,
  generated_at: '2026-09-11T02:00:00.000000Z',
  utilization: {
    open_minutes_per_day: 690,
    rooms_total: 2,
    rooms_in_use: 1,
    rooms_unavailable: 0,
    average_utilization: 23,
    buildings: [
      { building: 'Main', rooms: 1, rooms_in_use: 1, meetings: 4, booked_hours: 6, utilization: 46 },
      { building: 'Annex', rooms: 1, rooms_in_use: 0, meetings: 0, booked_hours: 0, utilization: 0 },
    ],
    busiest_rooms: [],
    idle_rooms: [{ id: 2, room_code: 'R 202', building: 'Annex', room_type: 'laboratory', meetings: 0, booked_minutes: 0, utilization: 0, is_unavailable: false }],
    idle_room_count: 1,
  },
  peak_load: {
    days: ['Monday', 'Tuesday'],
    hours: [8, 9],
    matrix: { Monday: [4, 4], Tuesday: [0, 0] },
    peak: 4,
    peak_day: 'Monday',
    peak_hour: 8,
  },
  coverage: {
    sections_with_schedule: 4,
    classes_without_instructor: 2,
    sections_without_instructor: 2,
    classes_without_room: 0,
    departments_with_gaps: 1,
  },
};

const activityLog = {
  data: [{
    id: 'scheduling:1',
    source: 'scheduling',
    category: 'schedule_workflow',
    event: 'schedule_approved_by_vpaa',
    occurred_at: '2026-09-10T02:24:00.000000Z',
    actor: { id: 2, name: 'VPAA Office', role: 'vpaa' },
  }],
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 2, name: 'VPAA Office', role: 'vpaa' }));

  get.mockImplementation((url: string) => {
    if (url === '/initial-data') return Promise.resolve({ data: initialData });
    if (url === '/vpaa/dashboard-insights') return Promise.resolve({ data: insights });
    if (url === '/activity-log') return Promise.resolve({ data: activityLog });
    return Promise.resolve({ data: {} });
  });
});

const renderPage = () => render(<MemoryRouter><VpaaDashboardPage /></MemoryRouter>);

describe('VpaaDashboardPage', () => {
  it('renders every section of the executive overview', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Institutional Overview')).toBeTruthy());

    [
      'Requires Attention',
      'Workflow · Department Scheduling Progress',
      'Room Utilisation by Building',
      'Institutional Master Timetable (Preview)',
      'Faculty Load Overview',
      'Institutional Readiness',
      'Campus Peak-Hour Load',
      'Recent Administrative Activity',
    ].forEach(title => expect(screen.getByText(title)).toBeTruthy());
  });

  it('names the active term and when the figures were taken', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/2nd Semester, AY 2026-2027/)).toBeTruthy());
    expect(screen.getByText('Figures as of')).toBeTruthy();
  });

  it('counts a dean override as awaiting the VPAA rather than as a draft', async () => {
    renderPage();

    // CIT sits at pending_vpaa with approval_override set. The old rollup read
    // `conditionally_approved` off the schedule row, found no branch for it and
    // called it a draft, so the package never reached this queue.
    await waitFor(() => expect(screen.getByText('1 Section Awaiting VPAA Review')).toBeTruthy());
    expect(screen.getByText(/approved by a Dean with an override/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Review/ }).length).toBe(1);
  });

  it('counts VPAA-approved sections as approved, not as drafts', async () => {
    renderPage();

    // CBA's two sections carry `faculty_assignment` on their schedule rows —
    // where VPAA approval actually leaves them — and `approved` on the
    // submission. Two of four sections approved is 50%.
    await waitFor(() => expect(screen.getByText('2 / 4 sections approved')).toBeTruthy());
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('reports room utilisation per building and names idle rooms', async () => {
    renderPage();

    // Building names appear twice by design: once as a timetable filter option
    // and once as a row of the utilisation table.
    await waitFor(() => expect(screen.getAllByText('Main').length).toBeGreaterThan(1));
    expect(screen.getAllByText('Annex').length).toBeGreaterThan(1);
    expect(screen.getByText(/Unused this term/)).toBeTruthy();
    expect(screen.getAllByText(/R 202/).length).toBeGreaterThan(0);
  });

  it('draws the peak-hour grid and calls out the busiest slot', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Peak: 4 classes · Monday 8 AM/)).toBeTruthy());
  });

  it('names the overloaded instructor rather than only counting them', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeTruthy());
    expect(screen.getByText('24 / 21 units')).toBeTruthy();
  });

  it('renders administrative activity from the audit log', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Schedule approved by vpaa')).toBeTruthy());
  });

  it('keeps virtual ONLINE rows out of the campus room inventory', async () => {
    renderPage();
    // Two physical rooms; the ONLINE placeholder is excluded.
    await waitFor(() => expect(screen.getByText('Across campus')).toBeTruthy());
    expect(screen.getByText('Available Rooms')).toBeTruthy();
  });

  it('asks the API for the full schedule window rather than the default cap', async () => {
    renderPage();

    await waitFor(() => expect(get).toHaveBeenCalledWith('/initial-data', { params: { schedule_limit: 2000 } }));
  });

  it('still renders when the insights endpoint fails', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/initial-data') return Promise.resolve({ data: initialData });
      if (url === '/vpaa/dashboard-insights') return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: activityLog });
    });

    renderPage();

    // The approval rollup does not depend on the aggregate endpoint, so it must
    // survive the aggregate being unavailable.
    await waitFor(() => expect(screen.getByText('1 Section Awaiting VPAA Review')).toBeTruthy());
    // The utilisation panel falls back to the empty aggregate rather than blanking.
    expect(screen.getByText('Room Utilisation by Building')).toBeTruthy();
  });

  it('shows the skeleton while the first load is in flight', () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });

  it('holds the skeleton until the aggregates land, rather than painting without them', async () => {
    // The page used to render as soon as /initial-data resolved, so the
    // utilisation and peak-load panels filled in seconds after the rest of the
    // dashboard had already painted. Keep the aggregate pending and the whole
    // page must still be the skeleton.
    let releaseInsights: (value: { data: typeof insights }) => void = () => {};
    get.mockImplementation((url: string) => {
      if (url === '/initial-data') return Promise.resolve({ data: initialData });
      if (url === '/activity-log') return Promise.resolve({ data: activityLog });
      if (url === '/vpaa/dashboard-insights') return new Promise(resolve => { releaseInsights = resolve; });
      return Promise.resolve({ data: {} });
    });

    const { container } = renderPage();

    await waitFor(() => expect(get).toHaveBeenCalledWith('/vpaa/dashboard-insights'));
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
    expect(screen.queryByText('Institutional Overview')).toBeNull();

    releaseInsights({ data: insights });

    await waitFor(() => expect(screen.getByText('Institutional Overview')).toBeTruthy());
    expect(screen.getByText('Campus Peak-Hour Load')).toBeTruthy();
  });

  it('serves a revisit from cache instead of refetching the aggregates', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Institutional Overview')).toBeTruthy());

    const callsAfterFirstMount = get.mock.calls.length;
    cleanup();
    renderPage();

    // Every panel is seeded from cache, so the revisit paints whole rather than
    // leaving the two aggregate panels to arrive behind the others.
    await waitFor(() => expect(screen.getByText('Institutional Overview')).toBeTruthy());
    expect(screen.getByText('Campus Peak-Hour Load')).toBeTruthy();
    expect(get.mock.calls.length).toBe(callsAfterFirstMount);
  });
});
