import type { ReactElement } from 'react';
import { cloneElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

import DeanDashboardPage from './DeanDashboardPage';
import { clearDataCache } from '../../lib/dataCache';

// The vitest config does not enable globals, so testing-library's automatic
// cleanup never registers.
afterEach(cleanup);

const section = (id: number, name: string, year: number) => ({ id, section_name: name, year_level: year, department_id: 6 });

const statusSection = (id: number, code: string, year: number, status: string) => ({ id, code, year_level: year, status });

const schedule = (id: number, sectionId: number, over: Record<string, unknown> = {}) => ({
  id,
  semester_id: 1,
  section_id: sectionId,
  department_id: 6,
  faculty_id: 1,
  room_id: 1,
  day: 'Monday',
  start_time: '08:00:00',
  end_time: '09:30:00',
  mode: 'on-site',
  status: 'submitted',
  updated_at: '2026-05-12T02:24:00.000000Z',
  course: { id: 1, course_code: 'IT 101', course_name: 'Intro to IT', course_category: 'major', units: 3 },
  faculty: { id: 1, first_name: 'Grace', last_name: 'Hopper' },
  room: { id: 1, room_code: 'R 301', room_type: 'lecture', building: 'Main' },
  section: { id: sectionId, section_name: 'BSIT 1A' },
  ...over,
});

const initialData = {
  active_semester: { id: 1, academic_year: '2026-2027', semester: '2nd', is_active: true },
  faculties: [
    { id: 1, first_name: 'Grace', last_name: 'Hopper', max_units: 21, assigned_units: 21, deload_units: 0, department_id: 6, status: 'active' },
    { id: 2, first_name: 'Alan', last_name: 'Turing', max_units: 21, assigned_units: 12, deload_units: 0, department_id: 6, status: 'active' },
    { id: 3, first_name: 'Ada', last_name: 'Lovelace', max_units: 21, assigned_units: 24, deload_units: 0, department_id: 6, status: 'active' },
    { id: 4, first_name: 'Donald', last_name: 'Knuth', max_units: 21, assigned_units: 0, deload_units: 0, department_id: 6, status: 'active' },
  ],
  rooms: [
    { id: 1, room_code: 'R 301', room_type: 'lecture', building: 'Main', status: 'available', department_id: 6 },
    { id: 2, room_code: 'R 202', room_type: 'laboratory', building: 'Main', status: 'available', department_id: 6 },
    // Virtual placeholder rows must stay out of the room inventory.
    { id: 3, room_code: 'ONLINE', room_type: 'online', department_id: null },
  ],
  sections: [section(1, 'BSIT 1A', 1), section(2, 'BSIT 2A', 2), section(3, 'ACT 1A', 1)],
  courses: [{ id: 1, subject_code: 'IT 101', subject_name: 'Intro to IT', department_id: 6 }],
  schedules: [schedule(1, 1), schedule(2, 2), schedule(3, 3, { room_id: 2, room: { id: 2, room_code: 'R 202', room_type: 'laboratory', building: 'Main' } })],
  users: [{ id: 9, name: 'Maria Santos', role: 'secretary', department_id: 6 }],
  // The Program Head submitted BSIT, not the department secretary.
  schedule_submissions: [{
    id: 1, semester_id: 1, submitted_at: '2026-08-12T02:24:00Z',
    sections: [{ id: 1, pivot: { state: 'included' } }],
    submitter: { name: 'Juan Dela Cruz' },
  }],
};

const scheduleStatus = {
  department_id: 6,
  department_name: 'College of Information Technology',
  sections: [
    statusSection(1, 'BSIT 1A', 1, 'submitted'),
    statusSection(2, 'BSIT 2A', 2, 'draft'),
    statusSection(3, 'ACT 1A', 1, 'revision'),
  ],
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 5, name: 'Dean Maria Santos', role: 'dean', department_id: 6 }));

  get.mockImplementation((url: string) => {
    if (url === '/initial-data') return Promise.resolve({ data: initialData });
    if (url === '/departments/6/schedule-status') return Promise.resolve({ data: scheduleStatus });
    if (url === '/notifications') return Promise.resolve({ data: { data: [], unread_count: 0 } });
    return Promise.resolve({ data: {} });
  });
});

const renderPage = () => render(<MemoryRouter><DeanDashboardPage /></MemoryRouter>);

it.each(['overview', 'progress', 'attentions'])('loads the dean skeleton for the requested %s tab', (tab) => {
  get.mockImplementation(() => new Promise(() => {}));
  const { container } = render(<MemoryRouter initialEntries={[`/?tab=${tab}`]}><DeanDashboardPage /></MemoryRouter>);
  expect(container.querySelector(`[data-skeleton="panel-${tab}"]`)).toBeTruthy();
});

const openTab = async (name: RegExp) => fireEvent.click(await screen.findByRole('tab', { name }));
const renderTab = async (name: RegExp) => {
  const view = renderPage();
  await openTab(name);
  return view;
};

describe('DeanDashboardPage', () => {
  it('splits the dashboard panels across the Overview, Progress and Attentions tabs', async () => {
    renderPage();
    const visible = (title: string) => {
      const panel = screen.getByText(title).closest('[role="tabpanel"]');
      return panel ? !(panel as HTMLElement).hidden : false;
    };

    // Overview: KPI row and the timetable. Other tabs mount on their first visit.
    await screen.findByText('Department Academic Timetable');
    expect(screen.getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('true');
    ['Sections', 'Instructors', 'Courses', 'Rooms', 'Scheduling Completion', 'Awaiting Your Approval',
      'Department Academic Timetable'].forEach(title => expect(visible(title)).toBe(true));
    expect(screen.queryByText('Schedule Review Queue')).toBeNull();
    expect(screen.queryByText('Instructor Workload')).toBeNull();

    // Progress: three summary cards, each with its breakdown.
    await openTab(/Progress/);
    ['Section Submission Overview', 'Section Readiness', 'Instructor Workload Overview', 'Instructor Workload Breakdown',
      'Room Utilization Overview', 'Room Utilization Breakdown'].forEach(title => expect(visible(title)).toBe(true));
    expect(visible('Department Academic Timetable')).toBe(false);

    // Attentions: the review queue and its overview.
    await openTab(/Attentions/);
    ['Schedule Review Queue', 'Schedule Review Overview'].forEach(title => expect(visible(title)).toBe(true));
    expect(visible('Section Readiness')).toBe(false);
  });

  it('breaks section readiness down by program', async () => {
    await renderTab(/Progress/);

    // BSIT: 1A submitted, 2A still in preparation. ACT: 1A returned.
    expect(await screen.findByRole('img', { name: 'BSIT: 1 Ready for Review, 1 Still in Preparation' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'ACT: 1 Returned for Revision' })).toBeTruthy();
    expect(screen.getByText('1 of 3 sections completed')).toBeTruthy();
  });

  it('shows overload in the workload breakdown instead of capping it', async () => {
    await renderTab(/Progress/);

    const ada = await screen.findByRole('progressbar', { name: 'Ada Lovelace workload' });
    expect(ada.getAttribute('aria-valuetext')).toBe('24/21 units, 114% of maximum load');
    // Above capacity shares the donut's amber, not the completed-load green.
    expect((ada.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(201, 149, 42)');
    const grace = screen.getByRole('progressbar', { name: 'Grace Hopper workload' });
    expect((grace.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(63, 125, 88)');
  });

  it('labels room bars as load relative to the busiest room', async () => {
    await renderTab(/Progress/);

    const room = await screen.findByRole('progressbar', { name: 'R 301 class load' });
    expect(room.getAttribute('aria-valuetext')).toBe('2 classes, 100% of the busiest room');
    expect(screen.getByRole('progressbar', { name: 'R 202 class load' }).getAttribute('aria-valuetext')).toBe('1 class, 50% of the busiest room');
  });

  it('badges Attentions with one count per package awaiting review', async () => {
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Attentions/ });
    await waitFor(() => expect(tab.textContent).toBe('Attentions1'));
  });

  it('groups sections into per-program schedule packages', async () => {
    await renderTab(/Attentions/);

    // "BSIT 1A" + "BSIT 2A" collapse into one BSIT package; "ACT 1A" is its own.
    // Both appear in the overview, but only BSIT is waiting in the review queue —
    // ACT was returned for revision, so nothing of it awaits the Dean.
    await waitFor(() => expect(screen.getAllByText('BSIT Schedule').length).toBe(2));
    expect(screen.getAllByText('ACT Schedule').length).toBe(1);
  });

  it('names the user who actually submitted each package', async () => {
    await renderTab(/Attentions/);
    await waitFor(() => expect(screen.getAllByText('Juan Dela Cruz').length).toBe(1));
    expect(screen.queryByText('Maria Santos')).toBeNull();
  });

  it('counts one pending approval and reports readiness by stage', async () => {
    renderPage();

    // One 'submitted' section awaits the Dean.
    await waitFor(() => expect(screen.getByText('Awaiting your action')).toBeTruthy());
    // The readiness legend lives on Progress; the Review Overview on Attentions
    // repeats two of its labels as column headers.
    await openTab(/Progress/);
    expect(screen.getAllByText('Ready for Review').length).toBe(1);
    expect(screen.getByText('Not Started')).toBeTruthy();
    await openTab(/Attentions/);
    expect(screen.getAllByText('Ready for Review').length).toBe(2);
    expect(screen.getAllByText('Returned for Revision').length).toBe(2);
  });

  it('keeps virtual ONLINE rows out of the room inventory', async () => {
    renderPage();

    // Two physical rooms, both carrying a class, so utilization is 100%.
    await waitFor(() => expect(screen.getByText('Total rooms')).toBeTruthy());
    await openTab(/Progress/);
    expect(screen.getByText('2 of 2 in use')).toBeTruthy();
  });

  it('shows the skeleton while the first load is in flight', () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });
});
