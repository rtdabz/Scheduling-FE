import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstructorTeachingLoadButton from './InstructorTeachingLoadButton';
import api from '../lib/api';

const { toast, printed } = vi.hoisted(() => ({ toast: { error: vi.fn(), warning: vi.fn() }, printed: vi.fn() }));
vi.mock('../lib/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('../pages/ClassSchedules/SchedulerPanel/TeachingLoad', () => ({ default: (props: { isTeachingLoadOpen: boolean }) => {
  if (props.isTeachingLoadOpen) printed(props);
  return null;
} }));

beforeEach(() => {
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/initial-data'
    ? { active_semester: null, departments: [], faculties: [], sections: [], schedules: [], users: [], schedules_truncated: true }
    : [{ id: 50, faculty_id: 7, course_id: 3, section_id: 2, room_id: 1, semester_id: 1, department_id: 4,
      day: 'Monday', start_time: '07:00:00', end_time: '09:00:00', status: 'instructor_assigned',
      course: { course_code: 'SHARED101', course_name: 'Shared course' } }] }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('individual teaching-load print data', () => {
  it('uses the instructor schedule endpoint rather than a truncated department snapshot', async () => {
    render(<InstructorTeachingLoadButton facultyId={7} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print Load Sheet' }));
    await waitFor(() => expect(printed).toHaveBeenCalled());
    expect(api.get).toHaveBeenCalledWith('/schedules', {
      params: { faculty_id: 7, semester_id: 'active', per_page: 1000 },
    });
    expect(printed.mock.calls[0][0].allSchedules).toEqual([expect.objectContaining({ id: '50', courseCode: 'SHARED101' })]);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('reports a schedule retrieval failure instead of printing incomplete lookup data', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
    render(<InstructorTeachingLoadButton facultyId={7} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print Load Sheet' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(printed).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Print Load Sheet' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses to print a response at the endpoint limit because completeness cannot be established', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => ({})) });
    render(<InstructorTeachingLoadButton facultyId={7} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print Load Sheet' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(printed).not.toHaveBeenCalled();
  });
});
