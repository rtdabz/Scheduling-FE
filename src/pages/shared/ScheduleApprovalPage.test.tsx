import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  toastWarning: vi.fn(),
  confirm: vi.fn(),
  user: { role: 'vpaa', department_id: undefined as number | undefined },
  // Live updates the page subscribes to; lifecycle tests bump the revision as a real live event would.
  live: { revision: 0, listeners: new Set<() => void>() },
  // The props the schedule preview last rendered with, so a test can call a callback it held earlier.
  preview: null as null | { onApprove: () => void; onReject: () => void },
}));

vi.mock('../../lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: (() => {
    const toast = { success: mocks.toastSuccess, error: mocks.toastError, warning: mocks.toastWarning, info: vi.fn() };
    return () => ({ toast, confirm: mocks.confirm });
  })(),
}));

vi.mock('../../hooks/useLiveRefresh', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => { mocks.live.listeners.add(listener); return () => { mocks.live.listeners.delete(listener); }; };
  return { useLiveRevision: () => useSyncExternalStore(subscribe, () => mocks.live.revision) };
});
vi.mock('../../lib/storedUser', () => ({ getStoredUser: () => mocks.user }));
vi.mock('../../lib/cacheGroups', () => ({ invalidateCacheGroups: vi.fn() }));

// The real mapper needs a full scheduler payload; this one maps only the fields the page prints and the
// details table shows, so these tests stay about the queue.
type MockSchedule = { id: number; section_id: number; course_id?: number; mode: 'on-site' | 'online' | 'field'; room?: { room_code?: string } | null };
vi.mock('../ClassSchedules/SchedulerPanel/hooks/initialDataMapper', () => ({
  mapInitialData: (data: { sections: Array<{ id: number; section_name: string }>; schedules: MockSchedule[]; active_semester?: unknown }) => ({
    sections: data.sections.map((section) => ({ id: String(section.id), name: section.section_name })),
    schedules: data.schedules.map((schedule, index) => ({
      id: String(schedule.id),
      sectionId: String(schedule.section_id),
      sectionName: data.sections.find((section) => section.id === schedule.section_id)?.section_name ?? '',
      courseCode: `IT ${schedule.course_id ?? schedule.id}`,
      courseName: 'Programming',
      courseType: 'major',
      meetingType: null,
      facultyName: null,
      roomName: schedule.room?.room_code ?? 'Room TBA',
      day: 'Monday',
      dayIndex: index % 6,
      startSlot: 0,
      durationSlots: 2,
      mode: schedule.mode,
    })),
    departments: [],
    users: [],
    activeSemester: data.active_semester ?? null,
  }),
}));

// The preview embeds a generated PDF; report what it was given instead.
type PreviewProps = {
  title: string; checks?: ReactNode; headerActions?: ReactNode; inert?: boolean; onClose: () => void; status?: string; statusLabel?: string;
  canAct: boolean; printInput: { allSchedules: unknown[] } | null; onReject: () => void; onApprove: () => void;
  approveBlockedReason?: string | null; closeOnEscape?: boolean;
};
vi.mock('../../components/scheduling/ScheduleApprovalPreviewModal', () => ({
  default: (props: PreviewProps) => props.title === 'Room Schedule Reassignment Details' ? (
    <div role="dialog" aria-label={props.title} aria-hidden={props.inert || undefined} inert={props.inert || undefined}>
      {props.headerActions}{props.checks}<span>{`${props.printInput?.allSchedules.length ?? 0} meetings`}</span>
      {props.canAct && <><button onClick={props.onApprove}>Approve</button><button onClick={props.onReject}>Reject</button></>}
      <button aria-label="Close preview" onClick={props.onClose}>Close</button>
    </div>
  ) : (mocks.preview = props) && (
    <div data-testid="preview" aria-hidden={props.inert || undefined} inert={props.inert || undefined}>
      <div data-testid="preview-header">{props.headerActions}{props.statusLabel && <span>{props.statusLabel}</span>}</div>
      {props.checks && <div data-testid="preview-above-pdf">{props.checks}</div>}
      <span>{`${props.printInput?.allSchedules.length ?? 0} meetings`}</span>
      <span>{`canAct:${String(props.canAct)}`}</span>
      <span>{`blocked:${props.approveBlockedReason ?? 'none'}`}</span>
      <span>{`escape:${String(props.closeOnEscape ?? false)}`}</span>
      {props.canAct && <button type="button" onClick={props.onReject}>Preview reject</button>}
      {props.canAct && <button type="button" onClick={props.onApprove}>Preview approve</button>}
    </div>
  ),
}));

const payload = (submissionStatus: string, scheduleStatus: string, revisionStatus = 'initial') => ({
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
      revision_status: revisionStatus,
      submitted_at: '2026-09-20 10:00:00',
      dean_reviewed_at: null,
      sections: [{ id: 10, section_name: 'IT-1A', department_id: 1, semester_id: 1 }],
    }],
  },
});

const conflictRow = (id: number) => ({
  id, semester_id: 1, section_id: 10, course_id: 5, faculty_id: null, room_id: 9, department_id: 1, day: 'Monday',
  start_time: '08:00:00', end_time: '09:00:00', mode: 'on-site', status: 'submitted', course_code: 'IT 101',
  course_name: 'Programming', section_name: 'IT-1A', room_code: 'R1', faculty_name: null,
});
const openConflict = {
  id: 'room_conflict:100:200', rule: 'room_conflict', semester_id: 1, day: 'Monday', overlap_start: '08:00', overlap_end: '09:00',
  message: 'IT 101 and IT 102 share room R1.', resolution_options: [], schedules: [conflictRow(100), conflictRow(200)],
};
const diffChange = (index: number) => ({
  change: 'added', before: null,
  after: { day: 'Monday', start_time: '08:00', end_time: '09:00', mode: 'on-site', room: { room_code: 'R1' }, course: { course_code: `C${index}` } },
});

type Reply = unknown | Error;
/** Answers each endpoint the approval page and its details call; an Error rejects that call. */
function route(replies: { queue: unknown; conflicts?: Reply; issues?: Reply; diff?: Reply; changes?: Reply }) {
  const reply = (value: Reply) => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value));
  mocks.apiGet.mockImplementation((url: string) => {
    if (url === '/room-recovery/transfers') return Promise.resolve({ data: { transfers: [] } });
    if (url === '/conflicts') return reply(replies.conflicts ?? { data: { conflicts: [] } });
    if (url === '/conflicts/rule-issues') return reply(replies.issues ?? { data: { issues: [] } });
    if (url.endsWith('/revision-diff')) return reply(replies.diff ?? { data: { data: { available: false, sections: [] } } });
    if (url.endsWith('/changes')) return reply(replies.changes ?? { data: { data: [] } });
    if (url.endsWith('/snapshot')) return Promise.resolve({ data: { data: { available: false, schedules: [] } } });
    return Promise.resolve(replies.queue);
  });
}

const pendingFor = (stage: 'dean' | 'vpaa', revision = 'initial') => {
  mocks.user = { role: stage, department_id: stage === 'dean' ? 1 : undefined };
  return payload(`pending_${stage}`, stage === 'dean' ? 'submitted' : 'approved_by_dean', revision);
};

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
    route({ queue: payload('rejected_by_vpaa', 'rejected_by_vpaa'), changes: { data: { data: [] } } });
    render(<MemoryRouter><ScheduleApprovalPage stage="vpaa" /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /^Rejected/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    const preview = await screen.findByTestId('preview');
    expect(preview.textContent).toContain('1 meetings');
    expect(preview.textContent).toContain('canAct:false');
    fireEvent.click(within(preview).getByRole('button', { name: 'View details' }));
    const details = screen.getByRole('dialog', { name: 'Schedule details' });
    expect(within(details).getByText('Rejected by VPAA')).toBeTruthy();
    // Checks do not apply to a returned package: no checks section, and the table never claims "No conflict".
    expect(within(details).queryByRole('region', { name: 'Scheduling checks' })).toBeNull();
    const meetings = within(details).getByRole('table', { name: 'Schedule meetings' });
    expect(within(meetings).getAllByRole('row')).toHaveLength(2);
    expect(within(meetings).getByText('Not checked')).toBeTruthy();
    expect(within(details).queryByText('No conflict')).toBeNull();
    // The snapshot is unavailable here, so the current working copy is shown and labelled as such.
    expect(within(details).getByText('Submitted version unavailable — showing current working copy.')).toBeTruthy();
    expect(within(details).getByText('Current working copy')).toBeTruthy();
    const changes = within(details).getByRole('region', { name: 'Changes' });
    expect(within(changes).getByText('Changes since this submission')).toBeTruthy();
    expect(await within(changes).findByText('No changes to the working copy since this version.')).toBeTruthy();
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

describe.each(['dean', 'vpaa'] as const)('%s approval preview details', (stage) => {
  afterEach(() => cleanup());
  beforeEach(() => {
    clearDataCache();
    vi.clearAllMocks();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset().mockResolvedValue({ data: {} });
    mocks.confirm.mockReset().mockResolvedValue(false);
  });

  const openPreview = async () => {
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    return screen.findByTestId('preview');
  };

  it('keeps status, changes, and findings in View details instead of above the PDF', async () => {
    route({
      queue: pendingFor(stage, 'modified'),
      diff: { data: { data: { available: true, sections: [{
        section_id: 10, section_name: 'IT-1A', previous_status: 'rejected_by_dean', previous_revision_number: 1,
        previous_rejection_reason: 'Spread the labs out.', changes: Array.from({ length: 30 }, (_, index) => diffChange(index)),
      }] } } },
    });
    const preview = await openPreview();

    // Only the title, View details, and close sit above the document.
    expect(within(screen.getByTestId('preview-header')).getAllByRole('button').map(button => button.textContent)).toEqual(['View details']);
    expect(screen.getByTestId('preview-header').textContent).toBe('View details');
    expect(screen.queryByTestId('preview-above-pdf')).toBeNull();
    expect(preview.textContent).toContain('escape:true');

    const viewDetails = within(preview).getByRole('button', { name: 'View details' });
    viewDetails.focus();
    fireEvent.click(viewDetails);
    const details = screen.getByRole('dialog', { name: 'Schedule details' });
    expect(preview.getAttribute('aria-hidden')).toBe('true');

    // The department and program sit once, in the dialog's description; repeated facts and cards are gone.
    expect(within(details).getByText(stage === 'dean' ? 'Pending Dean Approval' : 'Pending VPAA Approval')).toBeTruthy();
    expect(within(details).queryByText(/Revision:/)).toBeNull();
    expect(within(details).queryByText('Subjects scheduled')).toBeNull();
    expect(within(details).queryByText('Dean reviewed')).toBeNull();
    expect(within(details).queryByText('Department:')).toBeNull();
    expect(within(details).getByRole('group', { name: 'Approval scope' }).textContent).toContain('1 section');

    // The schedule itself is the main content, in the shared Dean schedules table.
    const meetings = within(details).getByRole('table', { name: 'Schedule meetings' });
    expect(within(meetings).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Course', 'Section', 'Day & Time', 'Room', 'Instructor', 'Mode', 'Status']);
    expect(within(meetings).getByText('IT 5')).toBeTruthy();
    await waitFor(() => expect(within(meetings).getByText('No conflict')).toBeTruthy());

    // Changes are secondary, inside one disclosure, with provenance, the return reason, and the instructor limit.
    const changes = within(details).getByRole('region', { name: 'Changes' });
    expect(within(changes).getByText('Changes from the previous version')).toBeTruthy();
    expect(await within(changes).findByText('30 changed classes')).toBeTruthy();
    expect(within(changes).getByText('Instructor changes are not included.')).toBeTruthy();
    expect(within(changes).getByText('vs. returned version #1')).toBeTruthy();
    expect(within(changes).getByText('Return reason: Spread the labs out.')).toBeTruthy();
    const table = within(changes).getByRole('table', { name: 'Changes from the previous version' });
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    fireEvent.click(within(changes).getByRole('button', { name: 'Next page' }));
    expect(within(table).getByText('C10')).toBeTruthy();
    expect(within(changes).queryByRole('button', { name: 'View details' })).toBeNull();

    const checks = within(details).getByRole('region', { name: 'Scheduling checks' });
    expect(await within(checks).findByText('No conflicts or rule issues.')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Schedule details' })).toBeNull());
    expect(screen.getByTestId('preview')).toBe(preview);
    expect(preview.getAttribute('aria-hidden')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(preview).getByRole('button', { name: 'View details' })));
  });

  it('blocks approval from an open conflict even while details stay closed', async () => {
    route({ queue: pendingFor(stage), conflicts: { data: { conflicts: [openConflict] } } });
    const preview = await openPreview();

    await waitFor(() => expect(preview.textContent).toContain('blocked:This schedule has 1 open conflict. Return it for revision.'));
    expect(screen.queryByText('IT 101 and IT 102 share room R1.')).toBeNull();

    fireEvent.click(within(preview).getByRole('button', { name: 'View details' }));
    const details = screen.getByRole('dialog', { name: 'Schedule details' });
    const checks = within(details).getByRole('region', { name: 'Scheduling checks' });
    // One blocking alert, followed by the findings themselves.
    expect(within(details).getAllByRole('alert')).toHaveLength(1);
    expect(within(checks).getByRole('alert').textContent).toContain('1 open conflict — approval blocked');
    expect(within(checks).getByText('IT 101 and IT 102 share room R1.')).toBeTruthy();
    // The conflicting meeting is flagged and highlighted in the table, as on Dean Schedules.
    const meetings = within(details).getByRole('table', { name: 'Schedule meetings' });
    const row = within(meetings).getByText('Room Conflict').closest('tr')!;
    expect(row.className).toContain('!bg-red-50/60');
    expect(preview.textContent).toContain('blocked:This schedule has 1 open conflict. Return it for revision.');
  });

  it('shows empty and failed states inside details', async () => {
    route({ queue: pendingFor(stage), conflicts: new Error('offline') });
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'View details' }));
    const details = screen.getByRole('dialog', { name: 'Schedule details' });

    // A first submission has nothing to compare: a short label, no empty Changes card.
    expect(within(details).getByText('First submission')).toBeTruthy();
    expect(within(details).queryByRole('region', { name: 'Changes' })).toBeNull();
    // A failed check stays failed: never "No conflict".
    expect(await within(details).findByText(/Conflict check unavailable/)).toBeTruthy();
    const meetings = within(details).getByRole('table', { name: 'Schedule meetings' });
    expect(within(meetings).getByText('Check unavailable')).toBeTruthy();
    expect(within(details).queryByText('No conflict')).toBeNull();
    expect(preview.textContent).toContain('blocked:none');
  });

  it('says "Checking" in the table until the package check settles', async () => {
    let settle!: (value: unknown) => void;
    route({ queue: pendingFor(stage), conflicts: new Promise((resolve) => { settle = resolve; }) as never });
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    fireEvent.click(within(await screen.findByTestId('preview')).getByRole('button', { name: 'View details' }));
    const details = screen.getByRole('dialog', { name: 'Schedule details' });
    const meetings = within(details).getByRole('table', { name: 'Schedule meetings' });

    expect(within(meetings).getByText('Checking…')).toBeTruthy();
    expect(within(details).queryByText('No conflict')).toBeNull();
    await act(async () => settle({ data: { conflicts: [] } }));
    await waitFor(() => expect(within(meetings).getByText('No conflict')).toBeTruthy());
  });

  it('says so in details when the changes cannot load', async () => {
    route({ queue: pendingFor(stage, 'modified'), diff: new Error('offline') });
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'View details' }));
    const changes = within(screen.getByRole('dialog', { name: 'Schedule details' })).getByRole('region', { name: 'Changes' });
    expect(await within(changes).findByText('The changes from the previous version could not be loaded.')).toBeTruthy();
  });

  it('opens details from the Modified badge and returns focus to View details', async () => {
    route({ queue: pendingFor(stage, 'modified') });
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Modified' }));

    const details = await screen.findByRole('dialog', { name: 'Schedule details' });
    fireEvent.click(within(details).getByRole('button', { name: 'Close modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Schedule details' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByTestId('preview')).getByRole('button', { name: 'View details' })));
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
    expect(within(details).queryByRole('region', { name: 'Changes Summary' })).toBeNull();
    expect(within(details).queryByText('PHYSICAL-CLASS · IT-1A')).toBeNull();
    expect(within(details).queryByRole('table')).toBeNull();
    fireEvent.click(within(details).getByRole('button', { name: 'View Details' }));
    const changes = screen.getByRole('dialog', { name: 'Room schedule reassignment changes' });
    const summary = within(changes).getByRole('region', { name: 'Changes Summary' });
    expect(summary.textContent).toContain('1affected meeting');
    expect(summary.textContent).toContain('1linked online session');
    expect(within(summary).getByText('Information Technology')).toBeTruthy();
    expect(within(summary).getByText(`Pending ${stage === 'dean' ? 'Dean' : 'VPAA'} Approval`)).toBeTruthy();
    expect(within(changes).getByText('PHYSICAL-CLASS')).toBeTruthy();
    expect(within(changes).getByText('Room changed')).toBeTruthy();
    expect(within(changes).getByText('R1')).toBeTruthy();
    expect(within(changes).getByText('R2')).toBeTruthy();
    expect(within(changes).getAllByText('Monday 8:00 AM–9:00 AM').length).toBeGreaterThanOrEqual(2);
    expect(within(changes).getByText('ONLINE-CLASS')).toBeTruthy();
    expect(within(changes).getByText('Linked online session — unchanged')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Room schedule reassignment changes' })).toBeNull();
    fireEvent.click(within(details).getByRole('button', { name: 'Close preview' }));
    const regular = within(mainTable()).getAllByRole('row').find(row => row.textContent?.includes('Schedule Approval'))!;
    fireEvent.click(within(regular).getByRole('button', { name: 'View' }));
    expect((await screen.findByTestId('preview')).textContent).toContain('2 meetings');
    expect(screen.getByTestId('preview').textContent).toContain('canAct:true');
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Approve' }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(`/departments/1/approve-by-${stage}`, { schedule_submission_id: 7 }));
    expect(mocks.confirm).not.toHaveBeenCalled();
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
    const rejected = await openTransfer();
    fireEvent.click(within(rejected).getByRole('button', { name: 'View Details' }));
    expect(within(screen.getByRole('dialog', { name: 'Room schedule reassignment changes' })).getByText('Rejection reason: Keep the current room.')).toBeTruthy();
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

/**
 * A recall, a competing decision, or a resubmission can change a package while the reviewer has its
 * preview or a confirmation open. The page must act only on the current queue: what a dialog confirms
 * is the slice, stage, and section set the reviewer saw, checked again right before posting.
 */
describe.each(['dean', 'vpaa'] as const)('%s review lifecycle against a changing queue', (stage) => {
  const pending = stage === 'dean' ? 'submitted' : 'approved_by_dean';
  type SectionState = { id: number; name: string; state: 'included' | 'withdrawn'; status: string; room?: boolean };
  const queue = (status: string, sections: SectionState[]) => ({
    data: {
      active_semester: { id: 1 },
      departments: [{ id: 1, department_name: 'Information Technology' }],
      sections: sections.map(section => ({ id: section.id, section_name: section.name, department_id: 1, semester_id: 1 })),
      schedules: sections.map((section, index) => ({
        id: 100 + index, department_id: 1, section_id: section.id, semester_id: 1, course_id: 5 + index, mode: 'on-site',
        status: section.status, room: section.room === false ? null : { room_code: 'R1' },
      })),
      schedule_submissions: [{
        id: 7, department_id: 1, semester_id: 1, revision_number: 1, status, revision_status: 'initial',
        submitted_at: '2026-09-20 10:00:00', dean_reviewed_at: null,
        sections: sections.map(section => ({ id: section.id, section_name: section.name, department_id: 1, semester_id: 1, pivot: { state: section.state } })),
      }],
    },
  });
  const both = (room = true): SectionState[] => [
    { id: 10, name: 'IT-1A', state: 'included', status: pending, room },
    { id: 11, name: 'IT-1B', state: 'included', status: pending, room },
  ];
  const states = {
    pending: (room = true) => queue(`pending_${stage}`, both(room)),
    partial: () => queue('partially_withdrawn', [
      { id: 10, name: 'IT-1A', state: 'withdrawn', status: 'revision' },
      { id: 11, name: 'IT-1B', state: 'included', status: pending },
    ]),
    full: () => queue('withdrawn', both().map(section => ({ ...section, state: 'withdrawn' as const, status: 'revision' }))),
    advanced: () => queue(stage === 'dean' ? 'pending_vpaa' : 'approved', both().map(section => ({
      ...section, status: stage === 'dean' ? 'approved_by_dean' : 'faculty_assignment',
    }))),
  };

  /** A queue server whose next /initial-data replies a test can hold back or fail. */
  let server: { queue: unknown; next: Array<() => Promise<unknown>> };
  const deferred = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
  };
  const bumpLive = () => act(() => {
    mocks.live.revision += 1;
    mocks.live.listeners.forEach(listener => listener());
  });
  const queueLoads = () => mocks.apiGet.mock.calls.filter(([url]) => url === '/initial-data').length;

  beforeEach(() => {
    cleanup();
    clearDataCache();
    vi.clearAllMocks();
    mocks.live.revision = 0;
    mocks.preview = null;
    mocks.user = { role: stage, department_id: stage === 'dean' ? 1 : undefined };
    mocks.apiPost.mockReset().mockResolvedValue({ data: {} });
    server = { queue: states.pending(), next: [] };
    mocks.apiGet.mockReset().mockImplementation((url: string) => {
      if (url === '/initial-data') {
        const held = server.next.shift();
        return held ? held() : Promise.resolve(server.queue);
      }
      if (url === '/room-recovery/transfers') return Promise.resolve({ data: { transfers: [] } });
      if (url === '/conflicts') return Promise.resolve({ data: { conflicts: [] } });
      if (url === '/conflicts/rule-issues') return Promise.resolve({ data: { issues: [] } });
      if (url.endsWith('/snapshot')) return Promise.resolve({ data: { data: { available: false, schedules: [] } } });
      if (url.endsWith('/changes')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: { available: false, sections: [] } } });
    });
  });
  afterEach(() => cleanup());

  const openPreview = async () => {
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    const preview = await screen.findByTestId('preview');
    await waitFor(() => expect(preview.textContent).toContain('canAct:true'));
    return preview;
  };
  const approveDialog = () => screen.queryByRole('dialog', { name: 'Approve Schedule' });
  const confirmButton = () => within(approveDialog()!).getByRole('button', { name: 'Confirm Approve' }) as HTMLButtonElement;
  const viewInTable = () => within(screen.getByRole('table', { name: 'Schedule submissions' })).getByRole('button', { name: 'View' });

  it('closes an open preview after a full recall and ignores a held approve callback', async () => {
    await openPreview();
    const heldCallback = mocks.preview!.onApprove;

    server.queue = states.full();
    bumpLive();
    await waitFor(() => expect(screen.queryByTestId('preview')).toBeNull());

    act(() => heldCallback());
    expect(approveDialog()).toBeNull();
    expect(mocks.toastWarning).toHaveBeenCalledWith('Schedule Changed', expect.stringContaining('changed'));
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('keeps a partially recalled preview open on its remaining sections', async () => {
    const preview = await openPreview();
    expect(preview.textContent).toContain('2 meetings');

    server.queue = states.partial();
    bumpLive();
    expect(preview.textContent).toContain('canAct:false');
    await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('1 meetings'));
    await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('canAct:true'));
  });

  it('cancels an open approval after a partial recall and requires a new confirmation', async () => {
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    expect(approveDialog()).toBeTruthy();

    server.queue = states.partial();
    bumpLive();
    await waitFor(() => expect(approveDialog()).toBeNull());
    expect(mocks.toastWarning).toHaveBeenCalledWith('Schedule Changed', expect.any(String));
    expect(mocks.apiPost).not.toHaveBeenCalled();

    // The remaining section is still reviewable, through a fresh confirmation.
    fireEvent.click(viewInTable());
    await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('canAct:true'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(`/departments/1/approve-by-${stage}`, { schedule_submission_id: 7 }));
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
  });

  it('cancels an open return and its reason after a partial recall', async () => {
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Preview reject' }));
    fireEvent.change(await screen.findByLabelText(/Reason/), { target: { value: 'Spread the labs out.' } });

    server.queue = states.partial();
    bumpLive();
    await waitFor(() => expect(screen.queryByLabelText(/Reason/)).toBeNull());
    expect(mocks.apiPost).not.toHaveBeenCalled();

    fireEvent.click(viewInTable());
    await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('canAct:true'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview reject' }));
    expect((await screen.findByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps a typed reason through a harmless refresh and blocks returning until it loads', async () => {
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Preview reject' }));
    fireEvent.change(await screen.findByLabelText(/Reason/), { target: { value: 'Spread the labs out.' } });

    const held = deferred();
    server.next.push(() => held.promise);
    bumpLive();
    const confirmReturn = screen.getByRole('button', { name: 'Confirm Return' }) as HTMLButtonElement;
    expect(confirmReturn.disabled).toBe(true);
    fireEvent.click(confirmReturn);
    expect(mocks.apiPost).not.toHaveBeenCalled();

    await act(async () => held.resolve(states.pending()));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirm Return' }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Spread the labs out.');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Return' }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      `/departments/1/return-by-${stage}`, { schedule_submission_id: 7, rejection_reason: 'Spread the labs out.' },
    ));
  });

  it('posts nothing while a failed refresh leaves the queue stale, and resumes after Retry', async () => {
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));

    server.next.push(() => Promise.reject(new Error('offline')));
    bumpLive();
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(confirmButton());
    expect(mocks.apiPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(confirmButton().disabled).toBe(false));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1));
  });

  it('shows a rejected stale decision, reloads, and claims no success', async () => {
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    const loadsBefore = queueLoads();
    mocks.apiPost.mockImplementation(async () => {
      server.queue = states.advanced();
      throw { response: { status: 409, data: { message: 'This submission was already reviewed or recalled.', error_code: 'submission_stage_changed' } } };
    });

    fireEvent.click(confirmButton());
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Approval Failed', 'This submission was already reviewed or recalled.'));
    await waitFor(() => expect(approveDialog()).toBeNull());
    expect(queueLoads()).toBeGreaterThan(loadsBefore);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
  });

  it('reloads the queue after a successful decision instead of marking it locally', async () => {
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    const loadsBefore = queueLoads();
    mocks.apiPost.mockImplementation(async () => { server.queue = states.advanced(); return { data: {} }; });

    const confirm = confirmButton();
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(approveDialog()).toBeNull());
    await waitFor(() => expect(queueLoads()).toBeGreaterThan(loadsBefore));
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Approved', expect.any(String));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pending Approval/ }).textContent).toContain('0'));
  });

  it('never lets a late queue response restore an older package', async () => {
    await openPreview();
    const late = deferred();
    server.next.push(() => late.promise);
    bumpLive();
    server.queue = states.partial();
    bumpLive();
    await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('1 meetings'));

    await act(async () => late.resolve(states.pending()));
    expect(screen.getByTestId('preview').textContent).toContain('1 meetings');
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    expect(approveDialog()).toBeTruthy();
  });

  it('does not open actions from cached data until the queue reloads', async () => {
    // Visit once to cache the queue, then return with the reload held back.
    const first = render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'View' });
    first.unmount();

    const held = deferred();
    server.next.push(() => held.promise);
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(screen.getByTestId('preview').textContent).toContain('canAct:false');

    await act(async () => held.resolve(states.pending()));
    await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('canAct:true'));
  });

  if (stage === 'dean') {
    it('cancels a Room TBA approval after a partial recall and keeps the reason rule on the new one', async () => {
      server.queue = states.pending(false);
      await openPreview();
      fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
      expect(within(approveDialog()!).getByText('Conditional Approval')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Reason for approving with Room TBA'), { target: { value: 'Lab rooms pending.' } });

      server.queue = queue('partially_withdrawn', [
        { id: 10, name: 'IT-1A', state: 'withdrawn', status: 'revision', room: false },
        { id: 11, name: 'IT-1B', state: 'included', status: pending, room: false },
      ]);
      bumpLive();
      await waitFor(() => expect(approveDialog()).toBeNull());

      fireEvent.click(viewInTable());
      await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('canAct:true'));
      fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
      expect((screen.getByLabelText('Reason for approving with Room TBA') as HTMLTextAreaElement).value).toBe('');
      fireEvent.click(confirmButton());
      expect(within(approveDialog()!).getByRole('alert').textContent).toContain('Give a reason');
      expect(mocks.apiPost).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText('Reason for approving with Room TBA'), { target: { value: 'Rooms assigned next week.' } });
      fireEvent.click(confirmButton());
      await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('/departments/1/approve-by-dean', {
        schedule_submission_id: 7, override_room_tba: true, override_reason: 'Rooms assigned next week.',
      }));
    });
  }
});

/**
 * A submission keeps every section it was sent with. When some are recalled, the reviewer sees how many
 * remain against the original, which sections left and where they are now, and approves only the rest.
 */
describe.each(['dean', 'vpaa'] as const)('%s partial recall visibility', (stage) => {
  const pending = stage === 'dean' ? 'submitted' : 'approved_by_dean';
  /** Submission 7 with 18 sections (ids 10-27, named IT-1 ... IT-18); `statusOf` overrides recalled sections' meetings. */
  const eighteen = (recalled: Record<number, string>, submissionStatus = 'partially_withdrawn') => {
    const ids = Array.from({ length: 18 }, (_, index) => 10 + index);
    const section = (id: number) => ({ id, section_name: `IT-${id - 9}`, department_id: 1, semester_id: 1 });
    return {
      data: {
        active_semester: { id: 1, academic_year: '2026-2027', semester: '1st' },
        departments: [{ id: 1, department_name: 'Information Technology' }],
        sections: ids.map(section),
        schedules: ids.map((id) => ({
          id: id * 10, department_id: 1, section_id: id, semester_id: 1, course_id: id, mode: 'on-site',
          status: recalled[id] ?? pending, room: { room_code: 'R1' },
        })),
        schedule_submissions: [{
          id: 7, department_id: 1, semester_id: 1, revision_number: 1, status: submissionStatus, revision_status: 'initial',
          submitted_at: '2026-09-20 10:00:00', dean_reviewed_at: null, section_count: 18,
          submitter: { name: 'Maria Secretary' },
          sections: ids.map((id) => ({ ...section(id), pivot: { state: id in recalled ? 'withdrawn' : 'included' } })),
        }],
      },
    };
  };
  let queue: unknown;

  beforeEach(() => {
    cleanup();
    clearDataCache();
    vi.clearAllMocks();
    mocks.live.revision = 0;
    mocks.user = { role: stage, department_id: stage === 'dean' ? 1 : undefined };
    mocks.apiPost.mockReset().mockResolvedValue({ data: {} });
    mocks.apiGet.mockReset().mockImplementation((url: string) => {
      if (url === '/room-recovery/transfers') return Promise.resolve({ data: { transfers: [] } });
      if (url === '/conflicts') return Promise.resolve({ data: { conflicts: [] } });
      if (url === '/conflicts/rule-issues') return Promise.resolve({ data: { issues: [] } });
      if (url === '/initial-data') return Promise.resolve(queue);
      return Promise.resolve({ data: { data: { available: false, sections: [] } } });
    });
  });
  afterEach(() => cleanup());

  const pendingRow = () => within(screen.getByRole('table', { name: 'Schedule submissions' })).getAllByRole('row')
    .find((row) => row.textContent?.includes('Schedule Approval'))!;

  it('shows 17/18 Active · 1 Recalled, names the recalled section, and approves only the other 17', async () => {
    queue = eighteen({ 10: 'revision' });
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);

    await waitFor(() => expect(pendingRow().textContent).toContain('17/18 Active'));
    expect(pendingRow().textContent).toContain('1 Recalled');

    fireEvent.click(within(pendingRow()).getByRole('button', { name: 'View' }));
    const preview = await screen.findByTestId('preview');
    expect(preview.textContent).toContain('17 meetings');
    await waitFor(() => expect(preview.textContent).toContain('canAct:true'));

    fireEvent.click(within(preview).getByRole('button', { name: 'View details' }));
    const details = screen.getByRole('dialog', { name: 'Schedule details' });
    expect(within(details).getByText('Information Technology Schedule')).toBeTruthy();
    expect(within(details).getByText('1st Semester, AY 2026-2027')).toBeTruthy();
    expect(within(details).getByText(/^Maria Secretary · /)).toBeTruthy();
    const scope = within(details).getByRole('group', { name: 'Approval scope' });
    expect(within(scope).getByText('17 of 18 sections included · 1 recalled')).toBeTruthy();
    expect(within(scope).getByText('Recalled sections are excluded from this approval.')).toBeTruthy();
    const recalled = within(scope).getByRole('list', { name: 'Recalled sections' });
    expect(within(recalled).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['IT-1Awaiting revision']);

    // The table holds exactly what the PDF prints: the 17 included sections' meetings, never the recalled one.
    const table = within(details).getByRole('table', { name: 'Schedule meetings' });
    expect(within(details).getByText((_, element) => element?.textContent === 'Showing 1-10 of 17 classes')).toBeTruthy();
    const sectionFilter = within(details).getByRole('combobox', { name: 'Section' }) as HTMLSelectElement;
    expect(Array.from(sectionFilter.options).map((option) => option.text)).not.toContain('IT-1');
    expect(sectionFilter.options).toHaveLength(18);
    // Filters narrow the list only, and can be cleared back to the whole scope.
    fireEvent.click(within(details).getByRole('button', { name: 'Next page' }));
    fireEvent.change(sectionFilter, { target: { value: '11' } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('IT-2')).toBeTruthy();
    fireEvent.change(sectionFilter, { target: { value: 'All' } });
    fireEvent.change(within(details).getByRole('textbox', { name: 'Search schedules' }), { target: { value: 'no such class' } });
    expect(within(table).getByText('No classes match the search or section.')).toBeTruthy();
    fireEvent.change(within(details).getByRole('textbox', { name: 'Search schedules' }), { target: { value: '' } });
    expect(within(details).getByText((_, element) => element?.textContent === 'Showing 1-10 of 17 classes')).toBeTruthy();

    fireEvent.click(within(details).getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview approve' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Approve' }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(`/departments/1/approve-by-${stage}`, { schedule_submission_id: 7 }));
  });

  it('updates the counts on a further recall and shows where a resubmitted section is now', async () => {
    queue = eighteen({ 10: 'revision' });
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    await waitFor(() => expect(pendingRow().textContent).toContain('17/18 Active'));

    // Another section is recalled, and the first one has since been revised and resubmitted.
    queue = eighteen({ 10: pending, 11: 'revision' });
    act(() => {
      mocks.live.revision += 1;
      mocks.live.listeners.forEach((listener) => listener());
    });
    await waitFor(() => expect(pendingRow().textContent).toContain('16/18 Active'));
    expect(pendingRow().textContent).toContain('2 Recalled');

    fireEvent.click(within(pendingRow()).getByRole('button', { name: 'View' }));
    fireEvent.click(within(await screen.findByTestId('preview')).getByRole('button', { name: 'View details' }));
    const recalled = within(screen.getByRole('dialog', { name: 'Schedule details' })).getByRole('list', { name: 'Recalled sections' });
    expect(within(recalled).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      `IT-1Resubmitted · Pending ${stage === 'dean' ? 'Dean' : 'VPAA'} approval`,
      'IT-2Awaiting revision',
    ]);
  });

  it('lists a fully recalled submission under Recalled with its plain section count', async () => {
    queue = eighteen(Object.fromEntries(Array.from({ length: 18 }, (_, index) => [10 + index, 'revision'])), 'withdrawn');
    render(<MemoryRouter><ScheduleApprovalPage stage={stage} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Recalled/ }).textContent).toContain('1'));
    expect(screen.getByRole('button', { name: /^Pending Approval/ }).textContent).toContain('0');

    fireEvent.click(screen.getByRole('button', { name: /^Recalled/ }));
    const row = await waitFor(() => pendingRow());
    expect(row.textContent).toContain('18 sections');
    expect(row.textContent).not.toContain('Active');
  });
});
