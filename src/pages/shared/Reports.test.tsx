import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../lib/dataCache';
import Reports from './Reports';
import { fetchReportData, fetchReportsOverview, type ReportsOverview } from '../../lib/reports';
import { mapInitialData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../lib/reports', () => ({ fetchReportsOverview: vi.fn(), fetchReportData: vi.fn() }));
vi.mock('../ClassSchedules/SchedulerPanel/PrintSchedule', () => ({ default: () => <div>Schedule PDF opened</div> }));
vi.mock('../ClassSchedules/SchedulerPanel/TeachingLoad', () => ({ default: () => <div>Teaching load PDF opened</div> }));

const overview: ReportsOverview = {
  departments: [{
    id: 1, code: 'CIT', name: 'College of Information Technology', can_print_department: true,
    complete_section_count: 2, instructor_count: 3,
    programs: [
      { id: 11, code: 'BSIT', name: 'Information Technology', complete_section_count: 2, instructor_count: 3 },
      { id: 12, code: 'BSCS', name: 'Computer Science', complete_section_count: 0, instructor_count: 0 },
    ],
  }],
};

beforeEach(() => {
  clearDataCache();
  vi.clearAllMocks();
  vi.mocked(fetchReportsOverview).mockResolvedValue(overview);
  vi.mocked(fetchReportData).mockResolvedValue({
    sections: [{ id: '1' }], schedules: [], departments: [], users: [], faculties: [], activeSemester: null,
  } as unknown as Awaited<ReturnType<typeof fetchReportData>>);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Reports directory', () => {
  it.each([
    ['Room Utilization', 'CIT Room Utilization', 'SCI-101', 'Science Building', false],
    ['Curriculums & Courses', 'CIT Curriculum Courses', 'IT 101', 'Programming', false],
    ['Approval & Readiness', 'CIT Approval Status', 'BSIT 1A', 'Year 1', false],
    ['Room Utilization', 'CIT Room Utilization', 'SCI-101', 'Main Campus', true],
    ['Curriculums & Courses', 'CIT Curriculum Courses', 'IT 101', 'Programming', true],
  ])('renders, searches and exports mapped %s data: %s / %s / %s / fallback=%s', async (tab, label, code, detail, fallback) => {
    const data = mapInitialData({
      active_semester: null, faculties: [], departments: [], users: [], time_grid: null,
      rooms: [{ id: 1, room_code: 'SCI-101', building: 'Science Building', room_type: 'lecture', status: 'available', department_id: 1 }],
      courses: [{ id: 10, course_code: 'IT 101', course_name: 'Programming', units: 3, lecture_hours: 3, lab_hours: 0,
        course_category: 'major', semester: '1st', department_id: 1, year_level: 1, room_type_required: 'lecture' }],
      sections: [{ id: 1, section_name: 'BSIT 1A', year_level: 1, semester: '1st', semester_id: 1, department_id: 1 }],
      schedules: [{ id: 1, semester_id: 1, department_id: 1, course_id: 10, section_id: 1, room_id: 1, faculty_id: null,
        day: 'Monday', start_time: '07:00:00', end_time: '10:00:00', status: 'approved', mode: 'on-site',
        course: { course_code: 'IT 101', course_name: 'Programming', units: 3 },
        section: { section_name: 'BSIT 1A' }, room: { room_code: 'SCI-101' } }],
    }, { isVpaa: true });
    if (fallback) { data.rooms = []; data.subjects = []; }
    vi.mocked(fetchReportData).mockResolvedValue(data);
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:report');
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = createObjectURL; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }));
    fireEvent.click(screen.getByRole('button', { name: `View Details: ${label}` }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('cell', { name: code })).toBeTruthy();
    expect(dialog.getByRole('cell', { name: detail })).toBeTruthy();
    fireEvent.change(dialog.getByRole('searchbox'), { target: { value: code } });
    expect(dialog.getByRole('cell', { name: code })).toBeTruthy();
    fireEvent.change(dialog.getByRole('searchbox'), { target: { value: 'no matching record' } });
    expect(dialog.queryByRole('cell', { name: code })).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const blob = createObjectURL.mock.calls[0][0];
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(csv).toContain(`"${code}"`);
    expect(csv).toContain(`"${detail}"`);
    expect(csv).not.toContain('undefined');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('lists one report per department covering every program, found by any program name', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    expect(screen.getByText('All programs: BSIT, BSCS')).toBeTruthy();
    expect(screen.queryByText('BSIT Class Schedule')).toBeNull();
    expect(screen.queryByText('BSCS Class Schedule')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Computer Science' } });
    expect(screen.getByText('CIT Class Schedule')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nursing' } });
    expect(screen.getByText('No matching reports')).toBeTruthy();
  });

  it('opens the whole-department schedule PDF', async () => {
    render(<Reports />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open PDF: CIT Class Schedule' }));
    await screen.findByText('Schedule PDF opened');
    expect(fetchReportData).toHaveBeenCalledWith(1, null);
  });

  it('switches report types with the keyboard and opens the whole-department teaching load', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Department Schedule/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Teaching Load/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Open PDF: CIT Instructors Load' }));
    await screen.findByText('Teaching load PDF opened');
    expect(fetchReportData).toHaveBeenCalledWith(1, null);
  });

  it('keeps restricted program scopes and does not add a department export', async () => {
    vi.mocked(fetchReportsOverview).mockResolvedValue({ ...overview, departments: [{ ...overview.departments[0], can_print_department: false }] });
    render(<Reports />);
    await screen.findByText('BSIT Class Schedule');
    expect(screen.getByText('BSCS Class Schedule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open PDF: CIT/ })).toBeNull();
  });

  it('offers recovery after a load failure and preserves the directory after a failed refresh', async () => {
    vi.mocked(fetchReportsOverview).mockRejectedValueOnce(new Error('offline'));
    render(<Reports />);
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('CIT Class Schedule');
    expect(screen.queryByRole('alert')).toBeNull();
    vi.mocked(fetchReportsOverview).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Previously loaded reports'));
    expect(screen.getByText('CIT Class Schedule')).toBeTruthy();
  });

  it('opens and closes the detailed report modal with breakdown table', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    const detailsBtn = screen.getByRole('button', { name: 'View Details: CIT Class Schedule' });
    fireEvent.click(detailsBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(fetchReportData).toHaveBeenCalledWith(1, null);

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'Close detail modal' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches to room utilization, curriculum, and approval tabs', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');

    // Room tab
    fireEvent.click(screen.getByRole('tab', { name: /Room Utilization/ }));
    expect(await screen.findByText('CIT Room Utilization')).toBeTruthy();

    // Curriculum tab
    fireEvent.click(screen.getByRole('tab', { name: /Curriculums & Courses/ }));
    expect(await screen.findByText('CIT Curriculum Courses')).toBeTruthy();

    // Approval tab
    fireEvent.click(screen.getByRole('tab', { name: /Approval & Readiness/ }));
    expect(await screen.findByText('CIT Approval Status')).toBeTruthy();
  });
});
