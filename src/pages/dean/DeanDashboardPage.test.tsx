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

import DeanDashboardPage from './DeanDashboardPage';
import { clearDataCache } from '../../lib/dataCache';

// The vitest config does not enable globals, so testing-library's automatic
// cleanup never registers.
afterEach(cleanup);

const section = (id: number, name: string, year: number) => ({ id, section_name: name, year_level: year, department_id: 6 });

const statusSection = (id: number, code: string, year: number, status: string) => ({ id, code, year_level: year, status });

const schedule = (id: number, sectionId: number, over: Record<string, unknown> = {}) => ({
  id,
  term_id: 1,
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
  active_term: { id: 1, academic_year: '2026-2027', semester: '2nd', is_active: true },
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

describe('DeanDashboardPage', () => {
  it('mounts and renders every panel of the dashboard', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Dean Dashboard')).toBeTruthy());

    // Every panel from the design is present.
    ['Schedule Review Queue', 'Section Submission Readiness', 'Schedule Review Overview',
      'Department Academic Timetable', 'Faculty Workload', 'Room Utilization'].forEach(title =>
      expect(screen.getByText(title)).toBeTruthy());

    // KPI row.
    ['Department Sections', 'Faculty Members', 'Curriculum Courses', 'Rooms Managed',
      'Scheduling Completion', 'Pending Approvals'].forEach(label =>
      expect(screen.getByText(label)).toBeTruthy());
  });

  it('groups sections into per-program schedule packages', async () => {
    renderPage();

    // "BSIT 1A" + "BSIT 2A" collapse into one BSIT package; "ACT 1A" is its own.
    await waitFor(() => expect(screen.getAllByText('BSIT Schedule').length).toBe(2));
    expect(screen.getAllByText('ACT Schedule').length).toBe(2);
  });

  it('names the department schedule coordinator as the submitter', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Maria Santos').length).toBeGreaterThan(0));
  });

  it('counts one pending approval and reports readiness by stage', async () => {
    renderPage();

    // One 'submitted' section awaits the Dean.
    await waitFor(() => expect(screen.getByText('Awaiting your action')).toBeTruthy());
    // These labels appear twice by design: once as a readiness legend row, once as
    // a Review Overview column header.
    expect(screen.getAllByText('Ready for Review').length).toBe(2);
    expect(screen.getAllByText('Returned for Revision').length).toBe(2);
    expect(screen.getByText('Not Started')).toBeTruthy();
  });

  it('keeps virtual ONLINE rows out of the room inventory', async () => {
    renderPage();

    // Two physical rooms, both carrying a class, so utilization is 100%.
    await waitFor(() => expect(screen.getByText('Total rooms')).toBeTruthy());
    expect(screen.getByText('2 of 2 in use')).toBeTruthy();
  });

  it('shows the skeleton while the first load is in flight', () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });
});
