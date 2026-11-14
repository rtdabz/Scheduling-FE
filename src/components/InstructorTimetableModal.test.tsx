import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstructorTimetableModal from './InstructorTimetableModal';
import api from '../lib/api';
import { buildInstructorTimetablePdf } from '../pages/ClassSchedules/SchedulerPanel/instructorTimetablePdf';
import { openPdfPreview } from '../lib/pdfPreview';
import { clearDataCache, setCachedData } from '../lib/dataCache';

const { toast, show, close } = vi.hoisted(() => ({
  toast: { error: vi.fn() }, show: vi.fn(), close: vi.fn(),
}));
vi.mock('../lib/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('../lib/pdfPreview', () => ({ openPdfPreview: vi.fn(() => ({ show, close })) }));
vi.mock('../pages/ClassSchedules/SchedulerPanel/instructorTimetablePdf', () => ({ buildInstructorTimetablePdf: vi.fn() }));
vi.mock('../pages/vpaa/calendar/MasterGantt', () => ({ default: () => null }));
vi.mock('../pages/vpaa/calendar/ScheduleDetailModal', () => ({ default: () => null }));

const schedule = (facultyId: number) => ({ id: facultyId, faculty_id: facultyId, department_id: 1,
  status: 'approved',
  semester_id: 1, section_id: 1, room_id: 1, day: 'Monday', start_time: '07:00:00', end_time: '09:00:00',
  course: { course_code: `C${facultyId}`, course_name: 'Course' } });
const props = { facultyId: 1, facultyName: 'First Instructor', isOpen: true, onClose: vi.fn() };

beforeEach(() => {
  clearDataCache();
  show.mockResolvedValue(undefined);
  vi.mocked(buildInstructorTimetablePdf).mockResolvedValue(new Blob(['pdf']));
  vi.mocked(api.get).mockImplementation(async (url, config) => ({ data: url === '/departments'
    ? [] : [schedule(config?.params.faculty_id)] }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('instructor timetable printing', () => {
  it('prints and counts only VPAA-approved meetings from a mixed response', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/departments' ? [] : [
      schedule(1), { ...schedule(1), id: 2, status: 'approved_by_dean' },
      { ...schedule(1), id: 3, status: 'draft' }, { ...schedule(1), id: 4, status: undefined },
    ] }));
    render(<InstructorTimetableModal {...props} />);
    await screen.findByText('1 Assigned Class');
    expect(api.get).toHaveBeenCalledWith('/schedules', expect.objectContaining({
      params: expect.objectContaining({ view: 'gantt' }),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Print Timetable' }));
    await waitFor(() => expect(buildInstructorTimetablePdf).toHaveBeenCalledOnce());
    expect(vi.mocked(buildInstructorTimetablePdf).mock.calls[0][0].schedules).toHaveLength(1);
  });

  it('passes the active semester so the printed timetable shows the academic year', async () => {
    const semester = { id: 7, academic_year: '2026-2027', semester: '1st' };
    vi.mocked(api.get).mockImplementation(async (url, config) => ({ data: url === '/departments'
      ? [] : url === '/semesters/active' ? semester : [schedule(config?.params.faculty_id)] }));
    render(<InstructorTimetableModal {...props} />);
    await screen.findByText('1 Assigned Class');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/semesters/active'));
    fireEvent.click(screen.getByRole('button', { name: 'Print Timetable' }));
    await waitFor(() => expect(buildInstructorTimetablePdf).toHaveBeenCalledOnce());
    expect(vi.mocked(buildInstructorTimetablePdf).mock.calls[0][0].activeSemester).toEqual(semester);
  });

  it('prevents stale printing while another instructor loads and after a load failure', async () => {
    setCachedData('global:schedules', []);
    const { rerender } = render(<InstructorTimetableModal {...props} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Print Timetable' }) as HTMLButtonElement).disabled).toBe(false));

    let fail!: (error: Error) => void;
    vi.mocked(api.get).mockImplementation((url) => url === '/departments'
      ? Promise.resolve({ data: [] }) : new Promise((_resolve, reject) => { fail = reject; }));
    rerender(<InstructorTimetableModal {...props} facultyId={2} facultyName="Second Instructor" />);
    expect((screen.getByRole('button', { name: 'Print Timetable' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fail(new Error('Unavailable')); });
    expect((screen.getByRole('button', { name: 'Print Timetable' }) as HTMLButtonElement).disabled).toBe(true);
    expect(openPdfPreview).not.toHaveBeenCalled();
  });

  it('allows only one pending PDF and enables retry after a generation failure', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(buildInstructorTimetablePdf).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    render(<InstructorTimetableModal {...props} />);
    const button = screen.getByRole('button', { name: 'Print Timetable' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(buildInstructorTimetablePdf).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Preparing...' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fail(new Error('PDF failed')); });
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Print Timetable' }));
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(buildInstructorTimetablePdf).toHaveBeenCalledTimes(2);
    expect(vi.mocked(buildInstructorTimetablePdf).mock.calls[1][0].schedules[0].courseCode).toBe('C1');
  });
});
