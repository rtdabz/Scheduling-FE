import type { ReactElement } from 'react';
import { cloneElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const department = (id: number, code: string, name: string) => ({ id, department_code: code, department_name: name, logo: id === 1 ? '/cba-logo.png' : null });
const section = (id: number, name: string, departmentId: number) => ({ id, section_name: name, department_id: departmentId });

/**
 * Every schedule row here carries a status that the *old* rollup treated as
 * "draft": `faculty_assignment` is where VPAA approval actually leaves a row,
 * and `conditionally_approved` is a Dean approval with an override. If the page
 * ever goes back to reading `schedules.status`, these fixtures make it fail.
 */
const schedule = (id: number, sectionId: number, departmentId: number, status: string) => ({
  id,
  semester_id: 1,
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
  semester_id: 1,
  revision_number: 1,
  status,
  submitted_at: '2026-09-01T02:00:00.000000Z',
  dean_reviewed_at: '2026-09-02T02:00:00.000000Z',
  sections: sectionIds.map(sectionId => ({ id: sectionId })),
  ...extra,
});

const initialData = {
  time_grid: { opening_time: '06:00', closing_time: '18:00', slot_minutes: 30 },
  active_semester: { id: 1, academic_year: '2026-2027', semester: '2nd', is_active: true },
  departments: [department(1, 'CBA', 'Business Administration'), department(2, 'CIT', 'Information Technology'), department(3, 'CED', 'Education')],
  sections: [section(1, 'BSBA 1A', 1), section(2, 'BSBA 2A', 1), section(3, 'BSIT 1A', 2), section(4, 'BEED 1A', 3)],
  schedules: [
    { ...schedule(1, 1, 1, 'faculty_assignment'), department: { id: 1, department_code: 'CBA', department_name: 'Business Administration' } },
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
  active_curricula_count: 5,
};

const insights = {
  semester_id: 1,
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

it.each(['overview', 'progress', 'attentions', 'activity'])('loads the VPAA skeleton for the requested %s tab', (tab) => {
  get.mockImplementation(() => new Promise(() => {}));
  const { container } = render(<MemoryRouter initialEntries={[`/?tab=${tab}`]}><VpaaDashboardPage /></MemoryRouter>);
  expect(container.querySelector(`[data-skeleton="panel-${tab}"]`)).toBeTruthy();
});

const openTab = async (name: RegExp) => fireEvent.click(await screen.findByRole('tab', { name }));
const renderTab = async (name: RegExp) => {
  const view = renderPage();
  await openTab(name);
  return view;
};

describe('VpaaDashboardPage', () => {
  it('distinguishes unavailable historical actors from explicit system activity', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/initial-data') return Promise.resolve({ data: initialData });
      if (url === '/vpaa/dashboard-insights') return Promise.resolve({ data: insights });
      if (url === '/activity-log') return Promise.resolve({ data: {
        data: [
          { ...activityLog.data[0], actor: { id: 8, name: null }, actor_type: 'unknown' },
          { ...activityLog.data[0], id: 'scheduling:2', actor: null, actor_type: 'system' },
        ],
      } });
      return Promise.resolve({ data: {} });
    });

    await renderTab(/Activity/);
    const panel = screen.getByText('Recent Administrative Activity').closest('section')!;
    expect(await within(panel).findByText(/^Actor unavailable ·/)).toBeTruthy();
    expect(within(panel).getByText(/^System ·/)).toBeTruthy();
  });

  // Renders the full Gantt: about 3 s alone, past the 5 s default under a full parallel run.
  it('reuses the Gantt with configured hours and only published classes in the weekly view', async () => {
    renderPage();
    const chart = await screen.findByRole('region', { name: 'Master calendar timeline' });
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));

    const blocks = within(chart).getAllByRole('button', { name: /^IT 101 lecture/ });
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0]).getByRole('img', { name: 'Business Administration logo' }).getAttribute('src')).toBe('/cba-logo.png');
    expect(blocks.map((block) => block.getAttribute('data-schedule-id'))).toEqual(['1', '2']);
    expect(Number.parseFloat(blocks[0].style.left)).toBeCloseTo(100 * 120 / 720);
    expect(within(chart).getByText('6 AM')).toBeTruthy();
    expect(screen.queryByText('Timetable Grid')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Timetable filters' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Dept' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Timetable filters' }));
    expect(screen.queryByRole('combobox', { name: 'Dept' })).toBeNull();
    expect(within(chart).queryAllByRole('button', { name: /^IT 101 lecture/ })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(within(chart).getAllByRole('button', { name: /^IT 101 lecture/ })).toHaveLength(2);
  }, 15_000);

  it('opens shared class details in fullscreen and leaves fullscreen open when the details close', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Master calendar timeline' });
    fireEvent.click(screen.getByRole('button', { name: 'Full window view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    const chart = screen.getByRole('region', { name: 'Master calendar timeline' });
    fireEvent.click(within(chart).getAllByRole('button', { name: /^IT 101 lecture/ })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Intro to IT')).toBeTruthy();
    expect(within(dialog).getByText('Overlapping classes (1)')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit full window' })).toBeTruthy();
  });

  it('separates on-site, online and field meetings while preserving semester scope', async () => {
    const today = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
    get.mockImplementation((url: string) => {
      if (url === '/initial-data') return Promise.resolve({ data: { ...initialData, schedules: [
        { ...schedule(10, 1, 1, 'finalized'), day: today, meeting_type: 'laboratory' },
        { ...schedule(11, 2, 1, 'reassignment'), day: today, room: { id: 3, room_code: 'ONLINE', room_type: 'online' } },
        { ...schedule(12, 1, 1, 'finalized'), day: today, semester_id: 99 },
        { ...schedule(13, 1, 1, 'finalized'), day: today, mode: 'field', room: null, room_id: null },
        { ...schedule(14, 2, 1, 'finalized'), day: today, room: { id: 4, room_code: 'FIELD', room_type: 'field' } },
      ] } });
      if (url === '/vpaa/dashboard-insights') return Promise.resolve({ data: insights });
      return Promise.resolve({ data: activityLog });
    });
    renderPage();
    const chart = await screen.findByRole('region', { name: 'Master calendar timeline' });
    expect(within(chart).getByRole('button', { name: /^IT 101 laboratory/ }).getAttribute('data-schedule-id')).toBe('10');
    expect(within(chart).queryByRole('button', { name: /^IT 101 lecture/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Online' }));
    expect(within(chart).getByRole('button', { name: /^IT 101 lecture/ }).getAttribute('data-schedule-id')).toBe('11');
    expect(within(chart).queryByRole('button', { name: /^IT 101 laboratory/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Field' }));
    expect(within(chart).getAllByRole('button', { name: /^IT 101 lecture/ }).map(block => block.getAttribute('data-schedule-id'))).toEqual(['13', '14']);
    expect(within(chart).queryByRole('button', { name: /^IT 101 laboratory/ })).toBeNull();
  });

  it('sorts every section of the executive overview into its tab', async () => {
    renderPage();

    const visible = (title: string) => {
      const panel = screen.getByText(title).closest('[role="tabpanel"]');
      return panel ? !(panel as HTMLElement).hidden : false;
    };

    await screen.findByText('Master timetable');
    expect(screen.getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('true');
    ['Overall Approval Completion', 'Master timetable'].forEach(title => expect(visible(title)).toBe(true));
    expect(screen.queryByText('Requires Attention')).toBeNull();
    expect(screen.queryByText('Recent Administrative Activity')).toBeNull();

    await openTab(/Progress/);
    [
      'Workflow · Department Scheduling Progress',
      'Room Utilisation by Building',
      'Instructor Load Overview',
      'Institutional Readiness',
    ].forEach(title => expect(visible(title)).toBe(true));
    expect(visible('Master timetable')).toBe(false);

    await openTab(/Attentions/);
    ['Requires Attention', '1 Section Awaiting VPAA Review'].forEach(title => expect(visible(title)).toBe(true));
    expect(screen.queryByText('Returned Department Packages')).toBeNull();
    expect(screen.queryByText('Scheduling Concerns')).toBeNull();
    expect(visible('Master timetable')).toBe(false);

    await openTab(/Activity/);
    expect(visible('Recent Administrative Activity')).toBe(true);
    expect(visible('Requires Attention')).toBe(false);
  }, 15_000);

  it('badges Attentions with one count per department package awaiting review', async () => {
    renderPage();
    // Only CIT is pending; returned packages and coverage gaps are not counted.
    const tab = await screen.findByRole('tab', { name: /Attentions/ });
    expect(within(tab).getByLabelText('1 item requiring attention').textContent).toBe('1');
  });

  it('counts a department once when it has both pending and returned sections', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/initial-data') return Promise.resolve({ data: {
        ...initialData,
        sections: [...initialData.sections, section(5, 'BSIT 2A', 2)],
        schedule_submissions: [
          ...initialData.schedule_submissions,
          submission(3, 2, 'rejected_by_vpaa', [5], { vpaa_reviewed_at: '2026-09-05T02:00:00.000000Z', rejection_reason: 'Room clash' }),
        ],
      } });
      if (url === '/vpaa/dashboard-insights') return Promise.resolve({ data: insights });
      return Promise.resolve({ data: activityLog });
    });
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Attentions/ });
    expect(within(tab).getByLabelText('1 item requiring attention')).toBeTruthy();
  });

  it('hides the Attentions badge when nothing needs action', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/initial-data') return Promise.resolve({ data: {
        ...initialData,
        schedule_submissions: [initialData.schedule_submissions[0]],
        faculties: initialData.faculties.filter(f => f.assigned_units <= f.max_units),
      } });
      if (url === '/vpaa/dashboard-insights') return Promise.resolve({ data: { ...insights, coverage: { ...insights.coverage, classes_without_instructor: 0, sections_without_instructor: 0 } } });
      return Promise.resolve({ data: activityLog });
    });
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Attentions/ });
    expect(tab.textContent).toBe('Attentions');
  });

  it('counts a dean override as awaiting the VPAA rather than as a draft', async () => {
    renderPage();

    // CIT sits at pending_vpaa with approval_override set. The old rollup read
    // `conditionally_approved` off the schedule row, found no branch for it and
    // called it a draft, so the package never reached this queue.
    await openTab(/Attentions/);
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
    // (Overview) and once as a row of the utilisation table (Progress).
    fireEvent.click(await screen.findByRole('button', { name: 'Timetable filters' }));
    await openTab(/Progress/);
    await waitFor(() => expect(screen.getAllByText('Main').length).toBeGreaterThan(1));
    expect(screen.getAllByText('Annex').length).toBeGreaterThan(1);
    expect(screen.getByText(/Unused this semester/)).toBeTruthy();
    expect(screen.getAllByText(/R 202/).length).toBeGreaterThan(0);
  });

  it('names the overloaded instructor rather than only counting them', async () => {
    await renderTab(/Progress/);
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeTruthy());
    expect(screen.getByText('24 / 21 units')).toBeTruthy();
  });

  it('renders administrative activity from the audit log', async () => {
    await renderTab(/Activity/);
    await waitFor(() => expect(screen.getByText('Schedule approved by vpaa')).toBeTruthy());
  });

  it('keeps virtual ONLINE rows out of the campus room inventory', async () => {
    renderPage();
    // Two physical rooms; the ONLINE placeholder is excluded.
    await waitFor(() => expect(screen.getByText('Across campus')).toBeTruthy());
    const roomCard = screen.getByText('Across campus').closest('button');
    expect(roomCard).toBeTruthy();
    expect(within(roomCard!).getByText('2')).toBeTruthy();
  });

  it('reports active curriculum count in the inventory strip', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Active curriculums')).toBeTruthy());
    const card = screen.getByText('Active curriculums').closest('button');
    expect(card).toBeTruthy();
    expect(within(card!).getByText('Curriculums')).toBeTruthy();
    expect(within(card!).getByText('5')).toBeTruthy();
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
    await openTab(/Attentions/);
    await waitFor(() => expect(screen.getByText('1 Section Awaiting VPAA Review')).toBeTruthy());
    await openTab(/Progress/);
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
    expect(screen.queryByText('Master timetable')).toBeNull();

    releaseInsights({ data: insights });

    await waitFor(() => expect(screen.getByText('Master timetable')).toBeTruthy());
    await openTab(/Progress/);
    expect(screen.getByText('Room Utilisation by Building')).toBeTruthy();
  });

  it('serves a revisit from cache instead of refetching the aggregates', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Master timetable')).toBeTruthy());

    const callsAfterFirstMount = get.mock.calls.length;
    cleanup();
    renderPage();

    // Every panel is seeded from cache, so the revisit paints whole rather than
    // leaving the two aggregate panels to arrive behind the others.
    await waitFor(() => expect(screen.getByText('Master timetable')).toBeTruthy());
    await openTab(/Progress/);
    await openTab(/Attentions/);
    expect(screen.getByText('Room Utilisation by Building')).toBeTruthy();
    expect(get.mock.calls.length).toBe(callsAfterFirstMount);
  });
});
