import type { ReactElement } from 'react';
import { cloneElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the module body, so the spy has to be
// hoisted with them rather than declared as a plain top-level const.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post: vi.fn(), patch: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }),
}));

// ResponsiveContainer is unused here, but recharts is pulled in transitively; the
// grid itself is plain CSS grid, so nothing needs faking beyond a stable box.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 320, height: 160 } as Partial<Record<string, unknown>>),
  };
});

import VpaaCalendarPage from './CalendarPage';
import { clearDataCache } from '../../lib/dataCache';
import { resetTimeGrid, slotCount } from '../../lib/timeGrid';

afterEach(cleanup);

const schedule = (over: Record<string, unknown> & { id: number }) => ({
  day: 'Monday',
  start_time: '08:00:00',
  end_time: '09:30:00',
  mode: 'on-site' as const,
  department_id: 1,
  department: { id: 1, department_code: 'CIT', department_name: 'Information Technology' },
  room_id: 1,
  room: { id: 1, room_code: 'R 301', building: 'Main' },
  faculty_id: 1,
  faculty: { id: 1, first_name: 'Grace', last_name: 'Hopper' },
  section_id: 1,
  section: { id: 1, section_name: 'BSIT 1A', department_id: 1 },
  course: { course_code: 'IT 101', course_name: 'Introduction to IT', units: 3 },
  ...over,
});

const departments = [
  { id: 1, department_code: 'CIT', department_name: 'Information Technology' },
  { id: 2, department_code: 'CBA', department_name: 'Business Administration' },
];

const rooms = [{ id: 1, room_code: 'R 301', building: 'Main' }];

/** A 1.5h morning CIT class and a 1.5h morning CBA class in the same slot. */
const schedules = [
  schedule({ id: 1 }),
  schedule({
    id: 2,
    department_id: 2,
    department: { id: 2, department_code: 'CBA', department_name: 'Business Administration' },
    section: { id: 2, section_name: 'BSBA 1A', department_id: 2 },
    course: { course_code: 'ACCT 1', course_name: 'Accounting', units: 3 },
  }),
];

const mockApi = (scheduleRows: unknown[]) => {
  get.mockImplementation((url: string) => {
    if (url === '/schedules') return Promise.resolve({ data: scheduleRows });
    if (url === '/departments') return Promise.resolve({ data: departments });
    if (url === '/rooms') return Promise.resolve({ data: rooms });
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => {
  clearDataCache();
  resetTimeGrid();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 2, name: 'VPAA Office', role: 'vpaa' }));
  mockApi(schedules);
});

const renderPage = () => render(<VpaaCalendarPage />);

describe('VpaaCalendarPage timetable grid', () => {
  it('renders each class with the shared card format', async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText('IT 101').length).toBeGreaterThan(0));
    // Card rows: code, course title, room, time range, units chip.
    expect(screen.getAllByText('Introduction to IT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R 301').length).toBeGreaterThan(0);
    expect(screen.getAllByText('8:00 AM–9:30 AM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3u').length).toBeGreaterThan(0);
  });

  it('keys the footer legend to the departments actually in view', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Departments:')).toBeTruthy());
    // Both departments have a class, so both get a legend entry.
    expect(screen.getAllByTitle('Information Technology').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Business Administration').length).toBeGreaterThan(0);
  });

  it('stretches the grid past the shared window so evening classes are not clipped', async () => {
    // The shared window closes at 19:00 (slot 24). A class ending 20:00 needs 26 rows.
    mockApi([schedule({ id: 3, start_time: '18:30:00', end_time: '20:00:00' })]);
    const { container } = renderPage();

    await waitFor(() => expect(screen.getAllByText('IT 101').length).toBeGreaterThan(0));

    const grid = container.querySelector<HTMLElement>('[style*="grid-template-rows"]');
    expect(grid).toBeTruthy();
    const rows = (grid!.style.gridTemplateRows.match(/repeat\((\d+)/) ?? [])[1];
    expect(Number(rows)).toBeGreaterThan(slotCount());
    expect(Number(rows)).toBe(26);
  });

  it('uses the shared window when every class fits inside it', async () => {
    const { container } = renderPage();

    await waitFor(() => expect(screen.getAllByText('IT 101').length).toBeGreaterThan(0));

    const grid = container.querySelector<HTMLElement>('[style*="grid-template-rows"]');
    const rows = (grid!.style.gridTemplateRows.match(/repeat\((\d+)/) ?? [])[1];
    expect(Number(rows)).toBe(slotCount());
  });

  it('drops the course title on short classes so the card does not overflow', async () => {
    // One slot-hour class: two rows of 24px leaves no room for a title line.
    mockApi([schedule({ id: 4, start_time: '08:00:00', end_time: '09:00:00' })]);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('IT 101').length).toBeGreaterThan(0));
    expect(screen.queryByText('Introduction to IT')).toBeNull();
    // The code, room and time still render.
    expect(screen.getAllByText('R 301').length).toBeGreaterThan(0);
  });
});

describe('VpaaCalendarPage department colours', () => {
  /**
   * The monthly view and the day modal colour their chips through
   * getDepartmentColor, while the weekly grid and its footer legend use
   * getDeptStyles/getDeptSwatch. Both now key off normalizeDepartmentKey, so a
   * department cannot be one colour in one view and another elsewhere.
   *
   * CHM and MID are the regression case: the old four-branch colour chain had no
   * case for either, so both fell back to the same maroon and were
   * indistinguishable here even though the weekly grid drew them lime and emerald.
   */
  it('gives every department its own chip colour in the monthly view', async () => {
    mockApi([
      schedule({
        id: 10,
        department_id: 3,
        department: { id: 3, department_code: 'CHM', department_name: 'Hospitality Management' },
        course: { course_code: 'HM 101', course_name: 'Food Service', units: 3 },
      }),
      schedule({
        id: 11,
        department_id: 4,
        department: { id: 4, department_code: 'MID', department_name: 'Midwifery' },
        course: { course_code: 'MW 101', course_name: 'Maternal Care', units: 3 },
      }),
      schedule({
        id: 12,
        department_id: 5,
        department: { id: 5, department_code: 'CLIS', department_name: 'Library and Information Science' },
        course: { course_code: 'LIS 101', course_name: 'Cataloguing', units: 3 },
      }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Monthly Master')).toBeTruthy());
    fireEvent.click(screen.getByText('Monthly Master'));

    await waitFor(() => expect(screen.getAllByText('HM 101').length).toBeGreaterThan(0));

    // The chip carries the colour classes; the course code sits in a span inside it.
    const chipClass = (code: string) => {
      const chip = screen.getAllByText(code)[0].closest('[title]');
      expect(chip).toBeTruthy();
      return (chip as HTMLElement).className;
    };
    const chm = chipClass('HM 101');
    const mid = chipClass('MW 101');
    const clis = chipClass('LIS 101');

    expect(new Set([chm, mid, clis]).size).toBe(3);
    // And they line up with the weekly grid's palette for those departments.
    expect(chm).toContain('lime');
    expect(mid).toContain('emerald');
    expect(clis).toContain('pink');
  });
});
