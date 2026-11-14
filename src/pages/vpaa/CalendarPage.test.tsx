import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the module body, so the spy has to be
// hoisted with them rather than declared as a plain top-level const.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { buildPdf, preview } = vi.hoisted(() => ({
  buildPdf: vi.fn<(inputs: unknown[]) => Promise<Blob>>(async () => new Blob()),
  preview: { show: vi.fn(async () => {}), close: vi.fn() },
}));
vi.mock('../../lib/api', () => ({ default: { get, post: vi.fn(), patch: vi.fn() } }));
vi.mock('../../lib/pdfPreview', () => ({ openPdfPreview: () => preview }));
vi.mock('../ClassSchedules/SchedulerPanel/schedulePdf', () => ({
  buildSchedulesPdf: buildPdf,
  getSchedulePdfFilename: () => 'calendar.pdf',
}));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }),
}));

import VpaaCalendarPage from './CalendarPage';
import { clearDataCache } from '../../lib/dataCache';
import { LIVE_UPDATE_EVENT } from '../../lib/liveUpdates';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const schedule = (over: Record<string, unknown> & { id: number }) => ({
  status: 'faculty_assignment',
  day: 'Monday',
  start_time: '08:00:00',
  end_time: '09:30:00',
  mode: 'on-site' as const,
  meeting_type: 'lecture',
  course_id: 1,
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
  { id: 1, department_code: 'CIT', department_name: 'Information Technology', logo: '/cit-logo.png' },
  { id: 2, department_code: 'CBA', department_name: 'Business Administration' },
];

const defaultSchedules = [
  schedule({ id: 1 }),
  schedule({
    id: 2,
    day: 'Tuesday',
    meeting_type: 'laboratory',
    department_id: 2,
    department: { id: 2, department_code: 'CBA', department_name: 'Business Administration' },
    room_id: 2,
    room: { id: 2, room_code: 'LAB 2', building: 'Annex' },
    faculty_id: 2,
    faculty: { id: 2, first_name: 'Ada', last_name: 'Lovelace' },
    section_id: 2,
    section: { id: 2, section_name: 'BSBA 1A', department_id: 2 },
    course: { course_code: 'ACCT 1', course_name: 'Accounting', units: 3 },
  }),
];

const mockApi = (
  scheduleRows: unknown[] = defaultSchedules,
  options: { semester?: unknown; settings?: unknown } = {},
) => {
  get.mockImplementation((url: string) => {
    if (url === '/schedules') return Promise.resolve({ data: scheduleRows });
    if (url === '/departments') return Promise.resolve({ data: departments });
    if (url === '/semesters/active') {
      return options.semester ? Promise.resolve({ data: options.semester }) : Promise.reject({ response: { status: 404 } });
    }
    if (url === '/timeslots') {
      return Promise.resolve({ data: { settings: options.settings ?? { opening_time: '07:00', closing_time: '20:30', slot_interval: 30 } } });
    }
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => {
  get.mockReset();
  buildPdf.mockClear();
  preview.show.mockClear();
  preview.close.mockClear();
  clearDataCache();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 2, name: 'VPAA Office', role: 'vpaa' }));
  mockApi();
});

const block = (code: string) => {
  const match = screen.getAllByRole('button').find((element) => element.getAttribute('aria-label')?.startsWith(`${code} `));
  if (!match) throw new Error(`No timeline block for ${code}`);
  return match;
};

const waitForChart = () => waitFor(() => expect(screen.getByRole('region', { name: 'Master calendar timeline' })).toBeTruthy());

describe('VpaaCalendarPage Gantt timeline', () => {
  it('removes a returned meeting from open details and hover cards after a live refresh', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    fireEvent.mouseEnter(block('IT 101'));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(block('IT 101'));
    expect(await screen.findByRole('dialog')).toBeTruthy();

    mockApi([schedule({ id: 1, status: 'rejected' })]);
    await act(async () => { window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { topics: ['schedules'] } })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('0 classes in view');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy();
  });

  it('prints only approved schedules even when the print response contains drafts', async () => {
    const printRows = [schedule({ id: 1, semester_id: 1 }), schedule({ id: 10, semester_id: 1, status: 'approved_by_dean' }), schedule({ id: 11, semester_id: 1, status: 'draft' })];
    get.mockImplementation((url: string) => {
      if (url === '/initial-data') return Promise.resolve({ data: {
        active_semester: { id: 1, academic_year: '2026-2027', semester: '1st' },
        departments, schedules: printRows,
        sections: [{ id: 1, section_name: 'BSIT 1A', department_id: 1, year_level: 1, semester: '1st', semester_id: 1, status: 'active' }],
        rooms: [], courses: [], faculties: [], users: [],
      } });
      if (url === '/schedules') return Promise.resolve({ data: printRows });
      if (url === '/departments') return Promise.resolve({ data: departments });
      return Promise.resolve({ data: null });
    });
    render(<VpaaCalendarPage />);
    await waitForChart();
    fireEvent.click(screen.getByRole('button', { name: 'Print calendar' }));
    await waitFor(() => expect(buildPdf).toHaveBeenCalledOnce());
    expect(get).toHaveBeenCalledWith('/initial-data', { params: { view: 'gantt', schedule_limit: 2000 } });
    expect(buildPdf.mock.calls[0][0]).toEqual([expect.objectContaining({ allSchedules: [expect.objectContaining({ id: '1', status: 'faculty_assignment' })] })]);
    await waitFor(() => expect(preview.show).toHaveBeenCalled());
  });

  it('requests approved-only data and excludes unapproved rows from the timeline and details', async () => {
    const unapproved = ['draft', 'completed', 'submitted', 'approved_by_dean', 'conditionally_approved', 'revision', 'rejected', 'rejected_by_dean', undefined];
    mockApi([
      schedule({ id: 1 }),
      ...unapproved.map((status, index) => schedule({ id: index + 10, status, day: 'Wednesday', start_time: '05:00:00', end_time: '23:00:00' })),
    ], { semester: { id: 5, academic_year: '2026-2027', semester: '1st' } });
    render(<VpaaCalendarPage />);
    await waitForChart();
    expect(get).toHaveBeenCalledWith('/schedules', { params: { view: 'gantt', per_page: 1000, semester_id: 5 } });
    expect(screen.getByRole('status').textContent).toBe('1 class in view');
    expect(screen.queryByText('5 AM')).toBeNull();
    expect(screen.queryByText('11 PM')).toBeNull();
    fireEvent.click(block('IT 101'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Weekly meetings of this lecture')).toBeNull();
    expect(within(dialog).queryByText(/Overlapping classes/)).toBeNull();
  });

  it('draws each meeting as a block with course, section, room, instructor and session type', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    const lecture = block('IT 101');
    expect(lecture.getAttribute('data-session-type')).toBe('lecture');
    expect(within(lecture).getByText('Lec')).toBeTruthy();
    expect(within(lecture).getByText('BSIT 1A')).toBeTruthy();
    expect(within(lecture).getByText('R 301')).toBeTruthy();
    expect(within(lecture).getByText('Grace Hopper')).toBeTruthy();
    expect(within(lecture).getByRole('img', { name: 'Information Technology logo' }).getAttribute('src')).toBe('/cit-logo.png');

    const lab = block('ACCT 1');
    expect(lab.getAttribute('data-session-type')).toBe('laboratory');
    expect(within(lab).getByText('Lab')).toBeTruthy();
    expect(within(lab).getByRole('img', { name: 'Business Administration — no logo uploaded' })).toBeTruthy();
  });

  it('places blocks by real time on the configured standard hours', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    // 07:00-20:30 is 810 minutes; 08:00-09:30 starts 60 in and lasts 90.
    const style = block('IT 101').style;
    expect(Number.parseFloat(style.left)).toBeCloseTo((60 / 810) * 100, 3);
    expect(Number.parseFloat(style.width)).toBeCloseTo((90 / 810) * 100, 3);
    expect(screen.getByText('Standard hours 7 AM – 8:30 PM')).toBeTruthy();
  });

  it('follows the standard hours from settings rather than a hardcoded window', async () => {
    mockApi(defaultSchedules, { settings: { opening_time: '08:00', closing_time: '18:00', slot_interval: 60 } });
    render(<VpaaCalendarPage />);
    await waitForChart();

    expect(Number.parseFloat(block('IT 101').style.left)).toBe(0);
    expect(screen.getByText('Standard hours 8 AM – 6 PM')).toBeTruthy();
  });

  it('puts days on the vertical axis, Monday first', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    const dayLabels = screen.getAllByRole('button', { expanded: true }).map((button) => button.textContent ?? '');
    expect(dayLabels[0]).toContain('Monday');
    expect(dayLabels[1]).toContain('Tuesday');
    expect(dayLabels[6]).toContain('Sunday');
    expect(dayLabels).toHaveLength(7);
    expect(within(screen.getByRole('group', { name: 'Days shown' })).getByRole('button', { name: 'Sun' })).toBeTruthy();
  });

  it('scopes schedules to the active semester when one exists', async () => {
    mockApi(defaultSchedules, { semester: { id: 7, academic_year: '2026-2027', semester: '1st' } });
    render(<VpaaCalendarPage />);
    await waitForChart();

    const scheduleCall = get.mock.calls.find(([url]) => url === '/schedules');
    expect(scheduleCall?.[1]).toMatchObject({ params: { semester_id: 7 } });
    expect(screen.getByText('1st Semester · AY 2026-2027')).toBeTruthy();
  });

  it('filters by session type', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    fireEvent.click(screen.getByRole('button', { name: 'Laboratory' }));
    await waitFor(() => expect(() => block('IT 101')).toThrow());
    expect(block('ACCT 1')).toBeTruthy();
  });

  it('groups rows by room when asked', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    fireEvent.change(screen.getByRole('combobox', { name: /rows/i }), { target: { value: 'room' } });
    await waitFor(() => expect(screen.getByTitle('R 301')).toBeTruthy());
    expect(screen.getByTitle('LAB 2')).toBeTruthy();
  });

  it('flags meetings that share a room at the same time', async () => {
    mockApi([
      schedule({ id: 1 }),
      schedule({ id: 3, faculty_id: 5, section_id: 5, section: { id: 5, section_name: 'BSIT 2B' }, course: { course_code: 'IT 205', course_name: 'Networks' } }),
    ]);
    render(<VpaaCalendarPage />);
    await waitForChart();

    expect(block('IT 101').getAttribute('aria-label')).toContain('Overlaps 1 class on room');
    expect(screen.queryByRole('button', { name: 'Show only overlapping classes' })).toBeNull();
  });

  it('collapses a day from its row header', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    fireEvent.click(screen.getAllByRole('button', { expanded: true })[0]);
    await waitFor(() => expect(() => block('IT 101')).toThrow());
    expect(block('ACCT 1')).toBeTruthy();
  });

  it('opens the detail view with the other weekly meetings of the class', async () => {
    mockApi([
      schedule({ id: 1 }),
      schedule({ id: 4, day: 'Wednesday' }),
    ]);
    render(<VpaaCalendarPage />);
    await waitForChart();

    fireEvent.click(screen.getAllByRole('button').find((element) => element.getAttribute('data-schedule-id') === '1')!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Introduction to IT')).toBeTruthy();
    expect(within(dialog).getByText('Weekly meetings of this lecture')).toBeTruthy();
    expect(within(dialog).getByText(/Wed 8:00 AM/)).toBeTruthy();
  });

  it('keys the legend to the departments actually in view', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    expect(screen.getByTitle('Information Technology').textContent).toBe('CIT');
    expect(screen.getByTitle('Business Administration').textContent).toBe('CBA');
  });

  it('falls back gracefully when a department logo cannot load', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();
    const lecture = block('IT 101');
    fireEvent.error(within(lecture).getByRole('img', { name: 'Information Technology logo' }));
    expect(within(lecture).getByRole('img', { name: 'Information Technology — logo unavailable' })).toBeTruthy();
    fireEvent.click(lecture);
    expect(within(await screen.findByRole('dialog')).getByRole('img', { name: 'Information Technology logo' }).getAttribute('src')).toBe('/cit-logo.png');
  });

  it('shows only the selected day, updates the summary and legend, and restores all days on clear', async () => {
    mockApi([...defaultSchedules, schedule({ id: 3, day: 'Sunday', course: { course_code: 'IT 205', course_name: 'Networks' } })]);
    render(<VpaaCalendarPage />);
    await waitForChart();

    const days = within(screen.getByRole('group', { name: 'Days shown' }));
    expect(screen.getByRole('status').textContent).toBe('3 classes in view');
    fireEvent.click(days.getByRole('button', { name: 'Tue' }));

    expect(screen.getByRole('status').textContent).toBe('1 class in view');
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('Tuesday');
    expect(screen.queryByTitle('Information Technology')).toBeNull();
    expect(screen.getByTitle('Business Administration')).toBeTruthy();
    expect(block('ACCT 1')).toBeTruthy();
    expect(() => block('IT 101')).toThrow();

    fireEvent.click(days.getByRole('button', { name: 'Tue' }));
    expect(screen.getByRole('status').textContent).toBe('1 class in view');
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('Tuesday');

    fireEvent.click(days.getByRole('button', { name: 'Mon' }));
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('Monday');
    expect(screen.getByTitle('Information Technology')).toBeTruthy();
    expect(screen.queryByTitle('Business Administration')).toBeNull();
    expect(() => block('ACCT 1')).toThrow();
    expect(block('IT 101')).toBeTruthy();

    fireEvent.click(days.getByRole('button', { name: 'Sun' }));
    expect(screen.getByRole('status').textContent).toBe('1 class in view');
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('Sunday');
    expect(block('IT 205')).toBeTruthy();
    expect(() => block('IT 101')).toThrow();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('status').textContent).toBe('3 classes in view');
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(7);
    expect(screen.getByTitle('Business Administration')).toBeTruthy();
  });

  it('shows an empty Sunday and restores all days without clearing the session filter', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    fireEvent.click(screen.getByRole('button', { name: 'Laboratory' }));
    const days = within(screen.getByRole('group', { name: 'Days shown' }));
    fireEvent.click(days.getByRole('button', { name: 'Sun' }));

    expect(screen.getByRole('status').textContent).toBe('0 classes in view');
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('Sunday');
    expect(screen.getAllByText('No classes in view').length).toBeGreaterThan(0);

    fireEvent.click(days.getByRole('button', { name: 'All days' }));
    expect(screen.getByRole('status').textContent).toBe('1 class in view');
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Laboratory' }).getAttribute('aria-pressed')).toBe('true');
    expect(block('ACCT 1')).toBeTruthy();
    expect(() => block('IT 101')).toThrow();
  });

  it('keeps display controls visible and clears the selected session filter', async () => {
    render(<VpaaCalendarPage />);
    await waitForChart();

    expect(screen.queryByRole('button', { name: 'View options' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Session type' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print calendar' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Density' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse all days' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh calendar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Laboratory' }));
    expect(screen.getByRole('status').textContent).toBe('1 class in view');
    expect(block('ACCT 1')).toBeTruthy();
    expect(() => block('IT 101')).toThrow();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('status').textContent).toBe('2 classes in view');
    expect(block('IT 101')).toBeTruthy();
    expect(block('ACCT 1')).toBeTruthy();
  });

  it('reduces time labels on a narrow viewport while keeping classes selectable', async () => {
    let resize: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    render(<VpaaCalendarPage />);
    await waitForChart();

    // Ticks run in 90-minute steps from opening (7 AM, 8:30 AM, 10 AM, ...) and
    // widen to multiples of 90 minutes when the track is too narrow for them.
    act(() => resize([{ contentRect: { width: 360 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByText('7 AM')).toBeTruthy();
    expect(screen.queryByText('8:30 AM')).toBeNull();
    fireEvent.click(block('IT 101'));
    expect(await screen.findByRole('dialog')).toBeTruthy();

    act(() => resize([{ contentRect: { width: 1400 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByText('8:30 AM')).toBeTruthy();
  });
});
