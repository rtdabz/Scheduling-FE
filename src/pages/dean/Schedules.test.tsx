import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../lib/dataCache';
import DeanScheduleViewer from './Schedules';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('../../lib/api', () => ({ default: { get: (...args: unknown[]) => mocks.apiGet(...args) } }));
vi.mock('../../lib/storedUser', () => ({ getStoredUser: () => ({ department_id: 1, department: { department_name: 'Information Technology' } }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));
// The Gantt view is not under test here.
vi.mock('../vpaa/calendar/MasterGantt', () => ({ default: () => null }));

const meeting = (id: number, overrides: Record<string, unknown>) => ({
  id, section_id: 10, department_id: 1, semester_id: 1, faculty_id: null, room_id: 5, day: 'Monday',
  start_time: '08:00:00', end_time: '09:00:00', mode: 'on-site', meeting_type: null,
  section: { section_name: 'IT-1A' }, room: { room_code: 'CIT 101' },
  course: { course_code: `IT ${id}`, course_name: `Course ${id}`, course_category: 'major' },
  ...overrides,
});

const payload = {
  active_semester: { id: 1 },
  sections: [
    { id: 10, section_name: 'IT-1A', department_id: 1, semester_id: 1 },
    { id: 11, section_name: 'IT-1B', department_id: 1, semester_id: 1 },
  ],
  // Out of chronological order on purpose.
  schedules: [
    meeting(1, { day: 'Tuesday', meeting_type: 'laboratory' }),
    meeting(2, { day: 'Monday', start_time: '10:00:00', end_time: '11:00:00', mode: 'online', room: { room_code: 'ONLINE' } }),
    meeting(3, { day: 'Monday', section_id: 11, section: { section_name: 'IT-1B' }, meeting_type: 'lecture', faculty: { first_name: 'Ada', last_name: 'Reyes' } }),
  ],
};

const roomConflict = {
  id: 'room_conflict:3:99', rule: 'room_conflict', semester_id: 1, day: 'Monday', overlap_start: '08:00', overlap_end: '09:00',
  message: 'Two classes share CIT 101.', resolution_options: [], schedules: [{ id: 3 }, { id: 99 }],
};

describe('Dean Schedules table (shared with approval Schedule details)', () => {
  beforeEach(() => {
    clearDataCache();
    mocks.apiGet.mockReset().mockImplementation((url: string) => (url === '/conflicts'
      ? Promise.resolve({ data: { conflicts: [roomConflict] } })
      : Promise.resolve({ data: payload })));
  });
  afterEach(() => cleanup());

  const table = () => screen.getByRole('table', { name: 'Department schedules' });
  const bodyRows = () => within(table()).getAllByRole('row').slice(1);

  it('keeps the seven columns, chronological rows, badges, 12-hour times, and conflict marking', async () => {
    render(<DeanScheduleViewer />);
    await waitFor(() => expect(bodyRows()).toHaveLength(3));

    expect(within(table()).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Course', 'Section', 'Day & Time', 'Room', 'Instructor', 'Mode', 'Status']);
    expect(bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['IT 3LecCourse 3', 'IT 2Course 2', 'IT 1LabCourse 1']);
    const [monday8, monday10] = bodyRows();
    expect(within(monday8).getAllByRole('cell')[2].textContent).toBe('Monday8 AM - 9 AM');
    expect(within(monday8).getByText('Ada Reyes')).toBeTruthy();
    expect(within(monday10).getByText('Online', { selector: 'span' })).toBeTruthy();
    expect(within(monday10).getAllByRole('cell')[4].textContent).toBe('Unassigned');

    await waitFor(() => expect(within(monday8).getByText('Room Conflict')).toBeTruthy());
    expect(monday8.className).toContain('!bg-red-50/60');
    expect(within(monday10).getByText('No conflict')).toBeTruthy();
    expect(monday10.className).not.toContain('!bg-red-50/60');
  });

  it('sorts Day & Time chronologically, filters, resets, pages by 10/25/50, and opens a meeting', async () => {
    render(<DeanScheduleViewer />);
    await waitFor(() => expect(bodyRows()).toHaveLength(3));

    fireEvent.click(within(table()).getByRole('button', { name: 'Sort by Day & Time' }));
    fireEvent.click(within(table()).getByRole('button', { name: 'Sort by Day & Time' }));
    expect(bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent?.slice(0, 4))).toEqual(['IT 1', 'IT 2', 'IT 3']);

    const [sectionSelect, modeSelect] = screen.getAllByRole('combobox');
    fireEvent.change(sectionSelect, { target: { value: '11' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(sectionSelect, { target: { value: 'All' } });
    fireEvent.change(modeSelect, { target: { value: 'online' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText('Search course, section, room, instructor...'), { target: { value: 'nothing matches' } });
    expect(screen.getByText('No schedules match the selected filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(bodyRows()).toHaveLength(3);

    const pageSizes = screen.getByRole('combobox', { name: 'Rows per page' }) as HTMLSelectElement;
    expect(Array.from(pageSizes.options).map((option) => option.value)).toEqual(['10', '25', '50']);

    fireEvent.click(bodyRows()[0]);
    expect(screen.getByRole('heading', { name: 'Course 3' })).toBeTruthy();
    expect(screen.getByText('Confirmed conflict')).toBeTruthy();
  });
});
