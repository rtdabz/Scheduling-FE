import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache, setCachedData } from '../../lib/dataCache';
import DeanScheduleViewer from './Schedules';
import type { CalendarSchedule, GanttDay } from '../vpaa/calendar/ganttLayout';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  user: { role: 'dean', department_id: 1 as number | null, department: { department_name: 'Information Technology' } },
}));

vi.mock('../../lib/api', () => ({ default: { get: (...args: unknown[]) => mocks.apiGet(...args) } }));
vi.mock('../../lib/storedUser', () => ({ getStoredUser: () => mocks.user }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));
vi.mock('../vpaa/calendar/MasterGantt', () => ({ default: ({ days, onSelect }: { days: GanttDay[]; onSelect: (schedule: CalendarSchedule) => void }) => (
  <div data-testid="gantt-schedules">{days.flatMap((day) => day.rows.flatMap((row) => row.blocks.map((block) => (
    <button key={block.schedule.id} onClick={() => onSelect(block.schedule)}>Gantt class {block.schedule.id}</button>
  ))))}</div>
) }));

const meeting = (id: number, overrides: Record<string, unknown>) => ({
  id, status: 'approved', section_id: 10, department_id: 1, semester_id: 1, faculty_id: null, room_id: 5, day: 'Monday',
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
  message: 'Two classes share CIT 101.', resolution_options: [], schedules: [{ id: 3, status: 'approved' }, { id: 99, status: 'approved' }],
};

describe('Dean Schedules table (shared with approval Schedule details)', () => {
  beforeEach(() => {
    clearDataCache();
    mocks.user.role = 'dean';
    mocks.user.department_id = 1;
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

  it.each(['dean', 'vpaa'])('shows only published meetings in the %s table and Gantt', async (role) => {
    mocks.user.role = role;
    mocks.user.department_id = role === 'dean' ? 1 : null;
    // An old unrestricted cache must not suppress the published-only request.
    setCachedData(`page:dean-schedules:${mocks.user.department_id ?? 'all'}`, { sections: [], schedules: [] });
    const statuses = ['approved', 'faculty_assignment', 'reassignment', 'finalized', 'draft', 'completed',
      'submitted', 'approved_by_dean', 'conditionally_approved', 'revision', 'rejected', 'rejected_by_dean', 'unknown', undefined];
    mocks.apiGet.mockImplementation((url: string) => Promise.resolve({ data: url === '/conflicts'
      ? { conflicts: [] }
      : { ...payload, schedules: [
        ...statuses.map((status, index) => meeting(index + 1, { status })),
      ] } }));
    render(<DeanScheduleViewer />);
    await waitFor(() => expect(bodyRows()).toHaveLength(4));
    expect(mocks.apiGet).toHaveBeenCalledWith('/initial-data', { params: { view: 'published', schedule_limit: 2000 } });
    expect(bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent))
      .toEqual(['IT 1Course 1', 'IT 2Course 2', 'IT 3Course 3', 'IT 4Course 4']);
    fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
    expect(screen.getAllByRole('button', { name: /^Gantt class/ })).toHaveLength(4);
    expect(screen.queryByText('Gantt class 5')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(bodyRows()).toHaveLength(4);
  });

  it.each(['draft', 'approved'])('shows confirmed conflicts with a %s meeting only in the appropriate detail view', async (otherStatus) => {
    mocks.apiGet.mockImplementation((url: string) => Promise.resolve({ data: url === '/conflicts'
      ? { conflicts: [{ ...roomConflict, schedules: [{ id: 3, status: 'approved' }, { id: 99, status: otherStatus }] }] }
      : { ...payload, schedules: [meeting(3, { status: 'approved' }), meeting(99, { status: otherStatus })] } }));
    render(<DeanScheduleViewer />);
    await waitFor(() => expect(bodyRows()).toHaveLength(otherStatus === 'approved' ? 2 : 1));
    if (otherStatus === 'approved') await waitFor(() => expect(within(bodyRows()[0]).getByText('Room Conflict')).toBeTruthy());
    else expect(within(bodyRows()[0]).queryByText('Room Conflict')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gantt class 3' }));
    expect(screen.getByRole('heading', { name: 'Course 3' })).toBeTruthy();
    if (otherStatus === 'approved') expect(screen.getByText('Confirmed conflict')).toBeTruthy();
    else expect(screen.queryByText('Confirmed conflict')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close schedule details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(bodyRows()[0]);
    if (otherStatus === 'approved') expect(screen.getByText('Confirmed conflict')).toBeTruthy();
    else expect(screen.queryByText('Confirmed conflict')).toBeNull();
  });
});
