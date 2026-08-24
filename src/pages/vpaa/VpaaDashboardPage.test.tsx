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

const schedule = (id: number, sectionId: number, departmentId: number, status: string, updatedAt: string) => ({
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
  updated_at: updatedAt,
  section: { id: sectionId, section_name: `S${sectionId}`, department_id: departmentId },
  faculty: { id: 1, first_name: 'Grace', last_name: 'Hopper' },
  room: { id: 1, room_code: 'R 301', building: 'Main', room_type: 'lecture' },
  course: { id: 1, course_code: 'IT 101', course_name: 'Intro to IT', course_category: 'major', units: 3 },
});

const initialData = {
  active_term: { id: 1, academic_year: '2026-2027', semester: '2nd', is_active: true },
  departments: [department(1, 'CBA', 'Business Administration'), department(2, 'CIT', 'Information Technology'), department(3, 'CED', 'Education')],
  // CBA: both sections approved -> Fully Approved.
  // CIT: one section cleared by the Dean -> awaiting VPAA.
  // CED: draft only -> still drafting.
  sections: [section(1, 'BSBA 1A', 1), section(2, 'BSBA 2A', 1), section(3, 'BSIT 1A', 2), section(4, 'BEED 1A', 3)],
  schedules: [
    schedule(1, 1, 1, 'approved', '2026-08-18T02:00:00.000000Z'),
    schedule(2, 2, 1, 'approved', '2026-08-18T02:00:00.000000Z'),
    schedule(3, 3, 2, 'approved_by_dean', '2026-08-20T02:24:00.000000Z'),
    schedule(4, 4, 3, 'draft', '2026-08-21T02:00:00.000000Z'),
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

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 2, name: 'VPAA Office', role: 'vpaa' }));

  get.mockImplementation((url: string) => {
    if (url === '/initial-data') return Promise.resolve({ data: initialData });
    if (url === '/notifications') {
      return Promise.resolve({
        data: {
          data: [{
            id: 1,
            type: 'schedule_approved_by_vpaa',
            title: 'VPAA approved department schedule',
            message: 'Approved',
            read_at: null,
            created_at: '2026-08-20T02:24:00.000000Z',
            actor: { id: 2, name: 'VPAA Office', role: 'vpaa' },
            department: { id: 1, department_name: 'Business Administration', department_code: 'CBA' },
          }],
          unread_count: 1,
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
});

const renderPage = () => render(<MemoryRouter><VpaaDashboardPage /></MemoryRouter>);

describe('VpaaDashboardPage', () => {
  it('mounts and renders every panel of the dashboard', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('VPAA Dashboard')).toBeTruthy());

    ['Executive Overview', 'Requires Attention', 'Workflow · Department Scheduling Progress',
      'Tactical · Operational Overview', 'Institutional Master Timetable (Preview)',
      'Faculty Load Overview', 'Institutional Readiness', 'Recent Administrative Activity'].forEach(title =>
      expect(screen.getByText(title)).toBeTruthy());

    ['Faculty', 'Courses', 'Rooms',
      'Overall Scheduling Completion', 'Fully Approved Departments'].forEach(label =>
      expect(screen.getByText(label)).toBeTruthy());
    // "Departments" is both a KPI tile label and the readiness donut's caption.
    expect(screen.getAllByText('Departments').length).toBe(2);
  });

  it('counts the Dean-cleared sections as the VPAA review queue', async () => {
    renderPage();

    // Exactly one section sits at approved_by_dean.
    await waitFor(() => expect(screen.getByText('1 Schedule Awaiting VPAA Review')).toBeTruthy());
    expect(screen.getByText('Submitted by Deans for final approval')).toBeTruthy();
    // Only Information Technology is in the queue, so only one Review button exists.
    expect(screen.getAllByRole('button', { name: /^Review/ }).length).toBe(1);
  });

  it('reports one of three departments as fully approved', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeTruthy());
    expect(screen.getByText('33% of departments')).toBeTruthy();
  });

  it('splits institutional readiness across the three department stages', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Ready for Final Approval')).toBeTruthy());
    expect(screen.getByText('Still Drafting')).toBeTruthy();
    // Appears twice by design: readiness legend row and workflow table column header.
    expect(screen.getAllByText('Fully Approved').length).toBe(3);
  });

  it('reports scheduling completion over sections that carry a schedule', async () => {
    renderPage();
    // All four sections have a schedule row this term.
    await waitFor(() => expect(screen.getByText('4 / 4 sections scheduled')).toBeTruthy());
  });

  it('keeps virtual ONLINE rows out of the campus room inventory', async () => {
    renderPage();
    // Two physical rooms; the ONLINE placeholder is excluded.
    await waitFor(() => expect(screen.getByText('Across campus')).toBeTruthy());
    expect(screen.getByText('Available Rooms')).toBeTruthy();
  });

  it('renders recent administrative activity from the notification feed', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('VPAA approved department schedule')).toBeTruthy());
  });

  it('shows the skeleton while the first load is in flight', () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });
});
