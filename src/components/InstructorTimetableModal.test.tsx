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
