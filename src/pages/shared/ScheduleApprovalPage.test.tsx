import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../lib/dataCache';
import ScheduleApprovalPage from './ScheduleApprovalPage';
import { MemoryRouter } from 'react-router-dom';
import type { RoomTransferRequest } from '../../lib/roomRecovery';

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
  default: (props: { title: string; checks?: ReactNode; inert?: boolean; onClose: () => void; status: string; canAct: boolean; printInput: { allSchedules: unknown[] } | null; onReject: () => void; onApprove: () => void }) => props.title === 'Room Schedule Reassignment Details' ? (
    <div role="dialog" aria-label={props.title} aria-hidden={props.inert || undefined} inert={props.inert || undefined}>
      {props.checks}<span>{`${props.printInput?.allSchedules.length ?? 0} meetings`}</span>
      {props.canAct && <><button onClick={props.onApprove}>Approve</button><button onClick={props.onReject}>Reject</button></>}
      <button aria-label="Close preview" onClick={props.onClose}>Close</button>
    </div>
  ) : (
    <div data-testid="preview">
      <span>{`${props.printInput?.allSchedules.length ?? 0} meetings`}</span>
      <span>{`status:${props.status}`}</span>
      <span>{`canAct:${String(props.canAct)}`}</span>
      <button type="button" onClick={props.onReject}>Preview reject</button>
      <button type="button" onClick={props.onApprove}>Preview approve</button>
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
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset().mockResolvedValue({ data: {} });
    mocks.confirm.mockReset().mockResolvedValue(false);
    mocks.user = { role: 'vpaa', department_id: undefined };
  });

  it('previews a package the VPAA returned with its classes, not empty', async () => {
    mocks.apiGet.mockResolvedValue(payload('rejected_by_vpaa', 'rejected_by_vpaa'));
    render(<MemoryRouter><ScheduleApprovalPage stage="vpaa" /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /^Rejected/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    const preview = await screen.findByTestId('preview');
    expect(preview.textContent).toContain('1 meetings');
    expect(preview.textContent).toContain('status:rejected');
    expect(preview.textContent).toContain('canAct:false');
  });

  it('says so when the queue fails to load instead of showing an empty queue', async () => {
    mocks.apiGet.mockImplementation((url: string) => url === '/room-recovery/transfers'
      ? Promise.resolve({ data: { transfers: [] } }) : Promise.reject(new Error('offline')));
    render(<MemoryRouter><ScheduleApprovalPage stage="vpaa" /></MemoryRouter>);

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
    render(<MemoryRouter><ScheduleApprovalPage stage="dean" /></MemoryRouter>);

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

const transfer = (status: RoomTransferRequest['status'], id = 'transfer-1'): RoomTransferRequest => ({
  id, status, department_id: 1, department: 'Information Technology', semester_id: 1, semester_label: '2026-2027 1st',
  submitted_by: 'Secretary', submitted_at: '2026-10-23T02:00:00Z', reviewed_at: null, rejection_reason: null, schedule_ids: [100, 101],
  changes: [
    { schedule_id: 100, mode: 'on-site', course: 'PHYSICAL-CLASS', section: 'IT-1A', before: { room: 'R1', day: 'Monday', start_time: '08:00', end_time: '09:00' }, after: { room: 'R2', day: 'Monday', start_time: '08:00', end_time: '09:00' } },
    { schedule_id: 101, mode: 'online', course: 'ONLINE-CLASS', section: 'IT-1A', before: { room: 'Online', day: 'Tuesday', start_time: '08:00', end_time: '09:00' }, after: { room: 'Online', day: 'Tuesday', start_time: '08:00', end_time: '09:00' } },
  ],
});

describe('Unified schedule and room schedule reassignment approval queue', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    clearDataCache(); vi.clearAllMocks(); mocks.apiGet.mockReset(); mocks.apiPost.mockReset().mockResolvedValue({ data: {} });
    mocks.confirm.mockReset().mockResolvedValue(false);
  });
  function queue(stage: 'dean' | 'vpaa', requests = [transfer(`pending_${stage}`)], link = '') {
    mocks.user = { role: stage, department_id: stage === 'dean' ? 1 : undefined };
    const schedules = payload(`pending_${stage}`, stage === 'dean' ? 'submitted' : 'approved_by_dean');
    schedules.data.schedules.push({ ...schedules.data.schedules[0], id: 101, course_id: 6, mode: 'online', room: null as unknown as { room_code: string } });
    const server = { requests };
    mocks.apiGet.mockImplementation((url: string) => Promise.resolve(url === '/room-recovery/transfers' ? { data: { transfers: server.requests } } : schedules));
    render(<MemoryRouter initialEntries={[`/schedules/approval${link}`]}><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    return server;
  }
  const mainTable = () => screen.getByRole('table', { name: 'Schedule submissions' });
  const transferRow = () => within(mainTable()).getAllByRole('row').find(row => row.textContent?.includes('Room Schedule Reassignment'))!;
  async function openTransfer() {
    await waitFor(() => expect(within(mainTable()).getByText('Room Schedule Reassignment')).toBeTruthy());
    fireEvent.click(within(transferRow()).getByRole('button', { name: 'View' }));
    return screen.findByRole('dialog', { name: 'Room Schedule Reassignment Details' });
  }

  it.each(['dean', 'vpaa'] as const)('fills transfer rows in the %s table like schedule approvals', async stage => {
    const request = transfer(`pending_${stage}`);
    const section = { id: 10, section_name: 'IT-1A', semester_id: 1, semester: '1st' as const, year_level: 1, department_id: 1, program_id: 7,
      program: { id: 7, code: 'BSIT', name: 'Information Technology', major: null } };
    request.changes = request.changes.map(change => ({ ...change, preview_schedule: { id: change.schedule_id, semester_id: 1, section_id: 10, course_id: 5,
      department_id: 1, room_id: null, status: 'faculty_assignment', day: change.after.day, start_time: change.after.start_time, end_time: change.after.end_time,
      mode: change.mode === 'online' ? 'online' as const : 'on-site' as const, section } }));
    queue(stage, [request]);
    await waitFor(() => expect(within(mainTable()).getByText('Room Schedule Reassignment')).toBeTruthy());
    const cells = within(transferRow()).getAllByRole('cell').map(cell => cell.textContent);
    expect(cells[0]).toBe('Room Schedule Reassignment');
    expect(cells[2]).toBe('BSIT');
    expect(cells.at(-2)).toBe('Modified');
    expect(transferRow().textContent).not.toContain('2026-2027 1st');
    fireEvent.click(within(transferRow()).getByRole('button', { name: 'Modified' }));
    expect(await screen.findByRole('dialog', { name: 'Room Schedule Reassignment Details' })).toBeTruthy();
  });

  it.each(['dean', 'vpaa'] as const)('combines both request types in the %s table and lists linked online sessions in transfer details', async stage => {
    queue(stage);
    const details = await openTransfer();
    expect(screen.queryByRole('region', { name: 'Room schedule reassignment requests' })).toBeNull();
    expect(within(details).getByText('PHYSICAL-CLASS · IT-1A')).toBeTruthy();
    expect(within(details).getByText('ONLINE-CLASS · IT-1A · Linked online session')).toBeTruthy();
    expect(within(details).getByRole('region', { name: 'Changes Summary' }).textContent).toContain('R1');
    expect(within(details).getByRole('region', { name: 'Changes Summary' }).textContent).toContain('R2');
    expect(within(details).getByText('1 schedule affected · 1 linked online session')).toBeTruthy();
    expect(within(details).queryByRole('table')).toBeNull();
    fireEvent.click(within(details).getByRole('button', { name: 'Close preview' }));
    const regular = within(mainTable()).getAllByRole('row').find(row => row.textContent?.includes('Schedule Approval'))!;
    fireEvent.click(within(regular).getByRole('button', { name: 'View' }));
    expect((await screen.findByTestId('preview')).textContent).toContain('2 meetings');
    expect(screen.getByTestId('preview').textContent).toContain('canAct:true');
    mocks.confirm.mockImplementation(async options => options.onConfirm());
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(`/departments/1/approve-by-${stage}`, { schedule_submission_id: 7 }));
    expect(mocks.apiPost).not.toHaveBeenCalledWith(expect.stringContaining('/room-recovery/'), expect.anything());
  });

  it.each(['dean', 'vpaa'] as const)('confirms a %s transfer once and updates its shared status tab', async stage => {
    const server = queue(stage);
    const details = await openTransfer();
    fireEvent.click(within(details).getByRole('button', { name: 'Approve' }));
    const confirmation = screen.getByRole('dialog', { name: 'Approve room schedule reassignment' });
    if (stage === 'dean') expect(within(confirmation).getByText(/forward it to the VPAA.*remain unchanged/)).toBeTruthy();
    expect(mocks.apiPost).not.toHaveBeenCalled();
    mocks.apiPost.mockImplementation(async () => { server.requests = [transfer(stage === 'dean' ? 'pending_vpaa' : 'approved')]; return { data: { message: 'Approved.' } }; });
    const approve = within(confirmation).getByRole('button', { name: 'Approve transfer' });
    fireEvent.click(approve); fireEvent.click(approve);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pending Approval/ }).textContent).toContain('1'));
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(mocks.apiPost).toHaveBeenCalledWith('/room-recovery/plans/transfer-1/approve', {});
    fireEvent.click(screen.getByRole('button', { name: /^Schedule Approved/ }));
    await waitFor(() => expect(within(mainTable()).getByText('Room Schedule Reassignment')).toBeTruthy());
    expect(within(mainTable()).getByText(stage === 'dean' ? 'Pending VPAA Approval' : 'Approved')).toBeTruthy();
  });

  it.each(['dean', 'vpaa'] as const)('requires a reason and moves a %s transfer into Rejected', async stage => {
    const server = queue(stage);
    fireEvent.click(within(await openTransfer()).getByRole('button', { name: 'Reject' }));
    const confirmation = screen.getByRole('dialog', { name: 'Reject room schedule reassignment' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reject transfer' }));
    expect(within(confirmation).getByRole('alert').textContent).toContain('reason is required');
    expect(mocks.apiPost).not.toHaveBeenCalled();
    fireEvent.change(within(confirmation).getByRole('textbox'), { target: { value: ' Keep the current room. ' } });
    mocks.apiPost.mockImplementation(async () => { server.requests = [{ ...transfer(`rejected_by_${stage}`), rejection_reason: 'Keep the current room.' }]; return { data: { message: 'Rejected.' } }; });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reject transfer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^Rejected/ }));
    await openTransfer();
    expect(screen.getAllByText('Rejection reason: Keep the current room.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^(Approve|Reject)$/ })).toBeNull();
    expect(mocks.apiPost).toHaveBeenCalledWith('/room-recovery/plans/transfer-1/reject', { reason: 'Keep the current room.' });
  });

  it('uses existing pagination and resets it when filtering request types or departments', async () => {
    queue('vpaa', Array.from({ length: 22 }, (_, index) => ({ ...transfer('pending_vpaa', `transfer-${index}`), department_id: index < 11 ? 1 : 2 })));
    await waitFor(() => expect(within(mainTable()).getAllByRole('row')).toHaveLength(11));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('11-20')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Request Type' }), { target: { value: 'room_transfer' } });
    expect(screen.getByText('1-10')).toBeTruthy();
    expect(within(mainTable()).queryByText('Schedule Approval')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Department' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '25' } });
    await waitFor(() => expect(within(mainTable()).getAllByRole('row')).toHaveLength(12));
    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }));
    await waitFor(() => expect(within(mainTable()).getAllByRole('row')).toHaveLength(24));
  });

  it('opens notification-linked details and closing them does not reopen the modal', async () => {
    queue('dean', [transfer('pending_dean')], '?room_transfer=transfer-1');
    const details = await screen.findByRole('dialog', { name: 'Room Schedule Reassignment Details' });
    fireEvent.click(within(details).getByRole('button', { name: 'Close preview' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('filters forwarded and finally approved room requests using the existing Status filter', async () => {
    queue('dean', [transfer('pending_vpaa'), transfer('approved', 'approved-transfer')]);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Schedule Approved/ }).textContent).toContain('2'));
    fireEvent.click(screen.getByRole('button', { name: /^Schedule Approved/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'approved_by_dean' } });
    expect(within(mainTable()).getAllByRole('row')).toHaveLength(2);
    expect(within(mainTable()).getByText('Pending VPAA Approval')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'approved' } });
    expect(within(mainTable()).getAllByRole('row')).toHaveLength(2);
    expect(within(mainTable()).getByText('Approved')).toBeTruthy();
  });

  it('keeps regular approvals available if transfer loading fails and retries the transfer list', async () => {
    mocks.user = { role: 'dean', department_id: 1 };
    mocks.apiGet.mockImplementation((url: string) => url === '/room-recovery/transfers' ? Promise.reject(new Error('offline')) : Promise.resolve(payload('pending_dean', 'submitted')));
    render(<MemoryRouter><ScheduleApprovalPage stage="dean" /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(within(mainTable()).getByText('Schedule Approval')).toBeTruthy();
    mocks.apiGet.mockImplementation((url: string) => Promise.resolve(url === '/room-recovery/transfers' ? { data: { transfers: [transfer('pending_dean')] } } : payload('pending_dean', 'submitted')));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(mainTable()).getByText('Room Schedule Reassignment')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
