import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../lib/dataCache';
import ScheduleApprovalPage from './ScheduleApprovalPage';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  confirm: vi.fn(),
  user: { role: 'vpaa', department_id: undefined as number | undefined },
}));

vi.mock('../../lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: (() => {
    const toast = { success: mocks.toastSuccess, error: mocks.toastError };
    return () => ({ toast, confirm: mocks.confirm });
  })(),
}));

vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));
vi.mock('../../lib/storedUser', () => ({ getStoredUser: () => mocks.user }));
vi.mock('../../lib/cacheGroups', () => ({ invalidateCacheGroups: vi.fn() }));

// The real mapper needs a full scheduler payload; the page only relies on it
// for the ids it prints, so a pass-through keeps these tests about the queue.
vi.mock('../ClassSchedules/SchedulerPanel/hooks/initialDataMapper', () => ({
  mapInitialData: (data: { sections: Array<{ id: number; section_name: string }>; schedules: Array<{ id: number }> }) => ({
    sections: data.sections.map((section) => ({ id: String(section.id), name: section.section_name })),
    schedules: data.schedules.map((schedule) => ({ id: String(schedule.id) })),
    departments: [],
    users: [],
    activeSemester: null,
  }),
}));

// The preview embeds a generated PDF; report what it was given instead.
vi.mock('../../components/scheduling/ScheduleApprovalPreviewModal', () => ({
  default: (props: { status: string; canAct: boolean; printInput: { allSchedules: unknown[] } | null; onReject: () => void }) => (
    <div data-testid="preview">
      <span>{`${props.printInput?.allSchedules.length ?? 0} meetings`}</span>
      <span>{`status:${props.status}`}</span>
      <span>{`canAct:${String(props.canAct)}`}</span>
      <button type="button" onClick={props.onReject}>Preview reject</button>
    </div>
  ),
}));

const payload = (submissionStatus: string, scheduleStatus: string) => ({
  data: {
    active_semester: { id: 1 },
    departments: [{ id: 1, department_name: 'Information Technology' }],
    sections: [{ id: 10, section_name: 'IT-1A', department_id: 1, semester_id: 1 }],
    schedules: [
      { id: 100, department_id: 1, section_id: 10, semester_id: 1, course_id: 5, mode: 'on-site', status: scheduleStatus, room: { room_code: 'R1' } },
    ],
    schedule_submissions: [{
      id: 7,
      department_id: 1,
      semester_id: 1,
      revision_number: 1,
      status: submissionStatus,
      submitted_at: '2026-09-20 10:00:00',
      dean_reviewed_at: null,
      sections: [{ id: 10, section_name: 'IT-1A', department_id: 1, semester_id: 1 }],
    }],
  },
});

describe('ScheduleApprovalPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    clearDataCache();
    vi.clearAllMocks();
    mocks.user = { role: 'vpaa', department_id: undefined };
  });

  it('previews a package the VPAA returned with its classes, not empty', async () => {
    mocks.apiGet.mockResolvedValue(payload('rejected_by_vpaa', 'rejected_by_vpaa'));
    render(<ScheduleApprovalPage stage="vpaa" />);

    fireEvent.click(await screen.findByRole('button', { name: /^Rejected/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    const preview = await screen.findByTestId('preview');
    expect(preview.textContent).toContain('1 meetings');
    expect(preview.textContent).toContain('status:rejected');
    expect(preview.textContent).toContain('canAct:false');
  });

  it('says so when the queue fails to load instead of showing an empty queue', async () => {
    mocks.apiGet.mockRejectedValue(new Error('offline'));
    render(<ScheduleApprovalPage stage="vpaa" />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();

    mocks.apiGet.mockResolvedValue(payload('pending_vpaa', 'approved_by_dean'));
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('button', { name: /^Pending Approval/ }).textContent).toContain('1');
  });

  it('keeps the dialog and the typed reason when returning a schedule fails', async () => {
    mocks.user = { role: 'dean', department_id: 1 };
    mocks.apiGet.mockResolvedValue(payload('pending_dean', 'submitted'));
    mocks.apiPost.mockRejectedValue({ response: { status: 409, data: { message: 'This submission was already reviewed.' } } });
    render(<ScheduleApprovalPage stage="dean" />);

    // The queue shows how many sections a package holds, not every name.
    expect((await screen.findByTitle('IT-1A')).textContent).toBe('1 section');

    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect((await screen.findByTestId('preview')).textContent).toContain('canAct:true');
    fireEvent.click(screen.getByRole('button', { name: 'Preview reject' }));

    const reason = await screen.findByLabelText(/Reason/);
    fireEvent.change(reason, { target: { value: 'Move the lab classes to the afternoon.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Return' }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      '/departments/1/return-by-dean',
      { schedule_submission_id: 7, rejection_reason: 'Move the lab classes to the afternoon.' },
    ));
    expect(await screen.findByText('This submission was already reviewed.')).toBeTruthy();
    expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Move the lab classes to the afternoon.');
  });
});
