import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import TopBar from '../../pages/ClassSchedules/SchedulerPanel/TopBar';
import RoomReassignmentPanel from './RoomReassignmentPanel';
import RoomRecoveryAlerts from './RoomRecoveryAlerts';
import api from '../../lib/api';

vi.mock('../../lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../lib/storedUser', () => ({ getStoredUser: () => ({ role: 'secretary' }), hasStoredCapability: () => true }));
vi.mock('../../lib/liveUpdates', () => ({ publishLiveTopics: vi.fn(), LIVE_UPDATE_EVENT: 'wicars:live-update' }));
const data = {
  cases: [{ id: 2, room_code: 'Lab 1', reason: 'Maintenance', semester_id: 1, semester_label: '2026-2027 1st', meeting_count: 1, schedule_ids: [11] }],
  semester_id: 1, semesters: [{ id: 1, academic_year: '2026-2027', semester: '1st' }],
  rooms: [{ id: 1, room_code: 'Lab 1', room_type: 'laboratory', status: 'not available' }, { id: 2, room_code: 'Lab 2', room_type: 'laboratory', status: 'available' }],
  new_rooms: [], schedules: [{ id: 11, course: 'SCI101', section: 'A', room: 'Lab 1', day: 'Monday', start_time: '08:00', end_time: '09:00', meeting_type: 'laboratory', status: 'draft', needs_attention: true, room_status: 'not available', attention_reason: 'Room unavailable', required_room_type: 'laboratory' }],
};
const row = { id: 11, room_id: 1, day: 'Monday', start_time: '08:00', end_time: '09:00' };
const plan = { plan_id: 'plan-1', groups: [{ key: 'single-11', before: [row], after: [{ ...row, room_id: 2 }] }], unresolved: [], search_limit_reached: false };
const pendingTransfer = { id: 'plan-1', status: 'pending_dean', department: 'Science', semester_id: 1,
  semester_label: '2026-2027 1st', submitted_by: 'Secretary', submitted_at: '2026-10-23T02:00:00Z', reviewed_at: null,
  rejection_reason: null, schedule_ids: [11], changes: [{ schedule_id: 11, course: 'SCI101', section: 'A',
    before: { room: 'Lab 1', day: 'Monday', start_time: '08:00', end_time: '09:00' },
    after: { room: 'Lab 2', day: 'Monday', start_time: '08:00', end_time: '09:00' } }] };
beforeEach(() => { vi.mocked(api.get).mockResolvedValue({ data }); vi.mocked(api.post).mockResolvedValue({ data: plan }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const panel = () => render(<MemoryRouter initialEntries={['/?recovery=2&recovery_semester=1']}><RoomReassignmentPanel /></MemoryRouter>);

const toolbarProps = {
  sections: [], selectedSectionId: '', isSectionDropdownOpen: false, setIsSectionDropdownOpen: vi.fn(),
  handleSectionSelect: vi.fn(), groupedSections: [], currentStatus: 'draft', isPhase1Completed: false,
  isPhase2Active: false, isPhase2Completed: false, totalScheduled: 0, totalSubjects: 0,
  assignedSlotsCount: 0, totalSlotsCount: 0, unassignedSlotsCount: 0, departmentSectionProgress: [],
  sectionFinalizeCandidates: [], sectionReassignCandidates: [], departmentTotalSections: 0,
  departmentDoneSections: 0, departmentRemainingSections: 0, departmentReadyToSubmit: false,
  departmentHasSubmittedSchedule: false, departmentHasWithdrawableSubmission: false,
  departmentWithdrawalStage: 'dean_review', handleSubmitForApproval: vi.fn(), handleWithdrawSubmission: vi.fn(),
  canWithdrawSubmission: false, isWithdrawingSubmission: false, onPrint: vi.fn(),
  clearableSectionInstructorCount: 0, clearableDepartmentInstructorCount: 0, isClearingSectionInstructors: false,
  canUpdateSchedule: true, canSubmitSchedule: false, canAssignInstructor: false, isEditingSection: false,
  isResubmittingSection: false, isFinalizing: false, handleEditSection: vi.fn().mockResolvedValue(undefined),
  handleResubmit: vi.fn().mockResolvedValue(undefined), handleFinalize: vi.fn().mockResolvedValue(undefined), sectionSchedules: [],
} satisfies ComponentProps<typeof TopBar>;

function ToolbarWithTransfers() {
  const [, setParams] = useSearchParams();
  const [pending, setPending] = useState(0);
  return <><TopBar {...toolbarProps} pendingRoomTransferCount={pending} onOpenRoomTransfer={() => setParams({ recovery: 'open', recovery_semester: '1' })} /><RoomReassignmentPanel semesterId={1} onPendingCountChange={setPending} /></>;
}

describe('Room recovery workflow', () => {
  it('reuses the confirmation modal and cancels without submitting or closing the transfer review', async () => {
    panel();
    fireEvent.click(await screen.findByText('Find suitable rooms'));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    const confirmation = screen.getByRole('dialog', { name: 'Submit room transfer' });
    expect(within(confirmation).getByText('Are you sure you want to submit this room transfer for approval?')).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1); // Only the read-only preview request.
    const controls = within(confirmation).getAllByRole('button');
    await waitFor(() => expect(document.activeElement).toBe(controls[0]));
    controls[controls.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(controls[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Submit room transfer' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Room Transfer' })).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Submit room transfer' })).getByRole('button', { name: 'Cancel' }));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('submits only after confirmation and disables duplicate confirmation clicks', async () => {
    panel();
    fireEvent.click(await screen.findByText('Find suitable rooms'));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Pending Dean Approval.', applied: false } });
    const submit = screen.getByRole('button', { name: 'Submit request' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(await screen.findByText('Pending Dean Approval.')).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(2); // Preview and one submission.
    expect(api.post).toHaveBeenLastCalledWith('/room-recovery/plans/plan-1/submit', { group_keys: ['single-11'] });
  });

  it('reuses the just-loaded list when opening the Room Transfer modal', async () => {
    render(<MemoryRouter><ToolbarWithTransfers /></MemoryRouter>);
    await screen.findByRole('status', { name: 'Pending room transfers' });
    const calls = vi.mocked(api.get).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Room Transfer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Room Transfer' });
    expect(await within(dialog).findByText('SCI101')).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(calls);
  });

  it('updates the pending badge on source changes and hides it at zero', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, pending_count: 2 } });
    render(<MemoryRouter><ToolbarWithTransfers /></MemoryRouter>);
    const button = screen.getByRole('button', { name: 'Room Transfer' });
    const badge = () => within(button).queryByRole('status', { name: 'Pending room transfers' });
    await waitFor(() => expect(badge()?.textContent).toBe('2 pending room transfers'));
    for (const [count, topic] of [[3, 'rooms'], [1, 'approvals'], [0, 'schedules']] as const) {
      vi.mocked(api.get).mockResolvedValue({ data: { ...data, pending_count: count } });
      fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: [topic] } }));
      await waitFor(() => count > 0 ? expect(badge()?.textContent).toBe(`${count} pending room transfers`) : expect(badge()).toBeNull());
    }
  });

  it('revalidates an older prefetched list instead of retaining it indefinitely', async () => {
    let now = 1000;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      render(<MemoryRouter><ToolbarWithTransfers /></MemoryRouter>);
      await screen.findByRole('status', { name: 'Pending room transfers' });
      const calls = vi.mocked(api.get).mock.calls.length;
      now += 11000;
      vi.mocked(api.get).mockResolvedValue({ data: { ...data, cases: [], schedules: [{ ...data.schedules[0], course: 'SCI202' }] } });
      fireEvent.click(screen.getByRole('button', { name: 'Room Transfer' }));
      expect(await screen.findByText('SCI202')).toBeTruthy();
      expect(api.get).toHaveBeenCalledTimes(calls + 1);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('keeps the badge while approval is pending and clears it after an approved schedule update', async () => {
    render(<MemoryRouter><ToolbarWithTransfers /></MemoryRouter>);
    await screen.findByRole('status', { name: 'Pending room transfers' });
    fireEvent.click(screen.getByRole('button', { name: 'Room Transfer' }));
    const find = await screen.findByRole('button', { name: 'Find suitable rooms' });
    await waitFor(() => expect((find as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(find);
    const confirm = await screen.findByText('Submit for approval');
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Pending Dean Approval.', applied: false } });
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, transfers: [pendingTransfer], schedules: [{ ...data.schedules[0], pending_transfer_id: 'plan-1' }] } });
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText('Pending Dean Approval.')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Pending room transfers' }).textContent).toContain('1');
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, pending_count: 0, cases: [], schedules: [] } });
    fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: ['schedules'] } }));
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Pending room transfers' })).toBeNull());
  });

  it('replaces the Conflicts toolbar action with Room Transfer and opens a modal on demand', async () => {
    render(<MemoryRouter><ToolbarWithTransfers /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Conflicts' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const button = screen.getByRole('button', { name: 'Room Transfer' });
    button.focus(); fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Room Transfer' });
    expect(await within(dialog).findByText('SCI101')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('opens affected schedules from the toolbar without a duplicate unavailable-room banner', async () => {
    render(<MemoryRouter><ToolbarWithTransfers /></MemoryRouter>);
    await screen.findByRole('status', { name: 'Pending room transfers' });
    expect(screen.queryByText('Room unavailable: Lab 1')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review room transfers' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Room Transfer' }));
    const modal = await screen.findByRole('dialog', { name: 'Room Transfer' });
    expect(await within(modal).findByText('SCI101')).toBeTruthy();
    expect(within(modal).getByText('Laboratory', { exact: true })).toBeTruthy();
    expect(within(modal).getByText('Room unavailable', { exact: true })).toBeTruthy();
    expect(within(modal).getByText('Monday 8:00 AM–9:00 AM')).toBeTruthy();
  });

  it('shows only schedules needing a room, without the all-schedules checkbox', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, cases: [], schedules: [
      { ...data.schedules[0], room: 'Room TBA', room_status: null, attention_reason: 'Room required' },
      { ...data.schedules[0], id: 12, course: 'HIS101', room: 'Lab 2', room_status: 'available', attention_reason: null, needs_attention: false },
    ] } });
    panel();
    expect(await screen.findByText('Room required', { exact: true })).toBeTruthy();
    expect(screen.queryByText('HIS101')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Show all on-site schedules' })).toBeNull();
    expect(screen.queryByText('HIS101')).toBeNull();
    expect(screen.getByText('SCI101')).toBeTruthy();
  });

  it('submits for approval without treating the unchanged timetable as transferred', async () => {
    const onTransferred = vi.fn();
    render(<MemoryRouter initialEntries={['/?recovery=2&recovery_semester=1']}><RoomReassignmentPanel onTransferred={onTransferred} /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Find suitable rooms'));
    const confirm = await screen.findByText('Submit for approval');
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Pending Dean Approval. Existing schedules are unchanged.', applied: false } });
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, schedules: [{ ...data.schedules[0], pending_transfer_id: 'plan-1' }] } });
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText('Pending Dean Approval. Existing schedules are unchanged.')).toBeTruthy();
    expect(await screen.findByText('Pending Dean Approval', { exact: true })).toBeTruthy();
    const selection = screen.getByRole('checkbox', { name: /^Select SCI101/ }) as HTMLInputElement;
    expect(selection.disabled).toBe(true);
    expect(selection.checked).toBe(false);
    expect(screen.getByText('Lab 1', { exact: true })).toBeTruthy();
    expect(onTransferred).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenLastCalledWith('/room-recovery/plans/plan-1/submit', { group_keys: ['single-11'] });
  });

  it('caps automatically selected affected meetings at the server batch limit', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, cases: [], schedules: Array.from({ length: 31 }, (_, index) => ({ ...data.schedules[0], id: index + 1 })) } });
    panel();
    fireEvent.click(await screen.findByText('Find suitable rooms'));
    await screen.findByText('Submit for approval');
    expect(api.post).toHaveBeenCalledWith('/room-recovery/preview', { schedule_ids: Array.from({ length: 30 }, (_, index) => index + 1), destination_room_ids: [], allow_time_changes: false });
  });

  it('automatically uses the active second semester despite a stale URL or scheduler semester', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, cases: [], semester_id: 2,
      semesters: [...data.semesters, { id: 2, academic_year: '2026-2027', semester: '2nd', is_active: true }],
      schedules: [{ ...data.schedules[0], id: 22, course: 'SCI202' }],
    } });
    render(<MemoryRouter initialEntries={['/?recovery=open&recovery_semester=1&recovery_room=1']}><RoomReassignmentPanel semesterId={1} /></MemoryRouter>);
    const semester = await screen.findByText('Current semester: 2026-2027 · Second Semester');
    expect(semester.closest('header')).toBeTruthy();
    expect(screen.getByText('SCI202')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/room-recovery', expect.objectContaining({ params: { semester_id: undefined, include_schedules: 1 } }));
    fireEvent.click(screen.getByText('Find suitable rooms'));
    await screen.findByText('Submit for approval');
    expect(api.post).toHaveBeenCalledWith('/room-recovery/preview', { schedule_ids: [22], destination_room_ids: [], allow_time_changes: false });
  });

  it('opens a linked transfer in its verified historical semester', async () => {
    vi.mocked(api.get).mockImplementation(async (url, options) => {
      if (url === '/room-recovery/transfers') return { data: { transfers: [pendingTransfer] } };
      const historical = options?.params.semester_id === 1;
      return { data: { ...data, cases: [], semester_id: historical ? 1 : 2,
        semesters: [{ ...data.semesters[0], is_active: false }, { id: 2, academic_year: '2026-2027', semester: '2nd', is_active: true }],
        transfers: historical ? [pendingTransfer] : [], schedules: historical ? [{ ...data.schedules[0], pending_transfer_id: 'plan-1' }] : [] } };
    });
    render(<MemoryRouter initialEntries={['/?recovery=open&room_transfer=plan-1']}><RoomReassignmentPanel /></MemoryRouter>);
    expect(await screen.findByText('Incident semester: 2026-2027 · First Semester')).toBeTruthy();
    const details = await screen.findByRole('dialog', { name: 'Submitted room transfers' });
    expect(within(details).getByRole('table', { name: 'Submitted room transfer schedules' })).toBeTruthy();
    fireEvent.click(within(details).getByRole('button', { name: 'Close modal' }));
    expect((screen.getByRole('checkbox', { name: /^Select SCI101/ }) as HTMLInputElement).disabled).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/room-recovery/transfers', expect.anything());
  });

  it('opens submitted requests in a separate read-only modal and returns focus to View Details', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, transfers: [pendingTransfer, { ...pendingTransfer, id: 'plan-2', status: 'pending_vpaa' }] } });
    panel();
    const view = await screen.findByRole('button', { name: 'View Details' });
    expect(screen.getByRole('status', { name: 'Pending room transfer requests' }).textContent).toBe('2 pending requests');
    expect(screen.getByText('Pending Dean Approval: 1')).toBeTruthy();
    expect(screen.getByText('Pending VPAA Approval: 1')).toBeTruthy();
    expect(document.querySelector('details')).toBeNull();
    view.focus(); fireEvent.click(view);
    const details = screen.getByRole('dialog', { name: 'Submitted room transfers' });
    expect(within(details).getByRole('table', { name: 'Submitted room transfer schedules' })).toBeTruthy();
    expect(within(details).queryByRole('button', { name: /Approve|Reject/ })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    const parent = document.querySelector('.room-transfer-modal')!;
    expect(parent.getAttribute('aria-hidden')).toBe('true');
    expect(parent.hasAttribute('inert')).toBe(true);
    const controls = details.querySelectorAll<HTMLElement>('button:not(:disabled), select, [tabindex="0"]');
    await waitFor(() => expect(document.activeElement).toBe(controls[0]));
    controls[controls.length - 1].focus(); fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(controls[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Submitted room transfers' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Room Transfer' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(view));
  });

  it('paginates submitted schedules without changing the room transfer selection or proposal', async () => {
    const transfer = { ...pendingTransfer, changes: Array.from({ length: 23 }, (_, i) => ({ ...pendingTransfer.changes[0], schedule_id: i + 1, course: `SCI${i + 1}` })) };
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, transfers: [transfer] } });
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Find suitable rooms' }));
    await screen.findByRole('button', { name: 'Submit for approval' });
    const calls = vi.mocked(api.get).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    const details = screen.getByRole('dialog', { name: 'Submitted room transfers' });
    const table = within(details).getByRole('table', { name: 'Submitted room transfer schedules' });
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(within(table).getByText('SCI1 · A')).toBeTruthy();
    expect(within(table).getAllByText('Lab 1')).toHaveLength(10);
    expect(within(table).getAllByText('Lab 2')).toHaveLength(10);
    fireEvent.click(within(details).getByRole('button', { name: 'Next page' }));
    expect(await within(table).findByText('SCI11 · A')).toBeTruthy();
    fireEvent.change(within(details).getByRole('combobox', { name: 'Rows per page' }), { target: { value: '25' } });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(24));
    fireEvent.change(within(details).getByRole('combobox', { name: 'Submitted transfer approval status' }), { target: { value: 'pending_vpaa' } });
    expect(await within(table).findByText('No submitted schedules with this status.')).toBeTruthy();
    fireEvent.click(within(details).getByRole('button', { name: 'Close modal' }));
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /^Select SCI101/ }) as HTMLInputElement).checked).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(calls);
    expect(api.post).toHaveBeenCalledTimes(1); // The original preview only.
  });

  it('updates a submitted request status while its monitoring modal stays open', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, transfers: [pendingTransfer] } });
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'View Details' }));
    const details = screen.getByRole('dialog', { name: 'Submitted room transfers' });
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, transfers: [{ ...pendingTransfer, status: 'pending_vpaa' }] } });
    fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: ['approvals'] } }));
    const table = within(details).getByRole('table', { name: 'Submitted room transfer schedules' });
    expect((await within(table).findAllByText('Pending VPAA Approval', { selector: 'span' })).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { name: 'Submitted room transfers' })).toBe(details);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps the parent usable when a submitted-request refresh fails and reopens details after retry', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, transfers: [pendingTransfer] } });
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'View Details' }));
    vi.mocked(api.get).mockRejectedValue(new Error('Connection interrupted'));
    fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: ['approvals'] } }));
    const retry = await screen.findByRole('button', { name: 'Refresh' });
    const parent = screen.getByRole('dialog', { name: 'Room Transfer' });
    expect(parent.hasAttribute('inert')).toBe(false);
    expect(within(parent).getByText('Semester details unavailable')).toBeTruthy();
    expect(within(parent).getByRole('button', { name: 'Close modal' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Submitted room transfers' })).toBeNull();
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, transfers: [pendingTransfer] } });
    fireEvent.click(retry);
    expect(await screen.findByRole('dialog', { name: 'Submitted room transfers' })).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('automatically resolves an older incident semester and labels it without a selector', async () => {
    vi.mocked(api.get).mockImplementation(async (_url, options) => {
      const semester = Number(options?.params.semester_id) || 2;
      return { data: { ...data, semester_id: semester, pending_count: semester === 2 ? 9 : 1,
        semesters: [{ ...data.semesters[0], is_active: 0 }, { id: 2, academic_year: '2026-2027', semester: '2nd', is_active: 1 }],
        schedules: [{ ...data.schedules[0], id: semester === 1 ? 11 : 22, course: semester === 1 ? 'SCI101' : 'SCI202' }],
      } };
    });
    const countChanged = vi.fn();
    render(<MemoryRouter initialEntries={['/?recovery=2&recovery_semester=1']}><RoomReassignmentPanel onPendingCountChange={countChanged} /></MemoryRouter>);
    expect(await screen.findByText('SCI101')).toBeTruthy();
    expect(screen.getByText('Incident semester: 2026-2027 · First Semester').closest('header')).toBeTruthy();
    expect(screen.queryByText('SCI202')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    await waitFor(() => expect(countChanged).toHaveBeenLastCalledWith(9));
  });

  it('keeps the table in the schedules pane and finder and confirmation in the review pane', async () => {
    panel();
    const schedules = await screen.findByRole('region', { name: 'Schedules' });
    const review = screen.getByRole('region', { name: 'Review proposed room transfers' });
    const card = within(review).getByRole('article', { name: 'Proposed room transfers' });
    const actions = within(review).getByRole('group', { name: 'Room transfer actions' });
    expect(within(schedules).getByRole('table')).toBeTruthy();
    expect(within(schedules).queryByRole('button', { name: 'Find suitable rooms' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Find suitable rooms' })).toBeNull();
    fireEvent.click(within(actions).getByRole('button', { name: 'Find suitable rooms' }));
    expect(await within(review).findByText('Lab 2 · Monday 8:00 AM–9:00 AM')).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Submit for approval' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Submit for approval' })).toBeNull();
  });

  it('shows an empty state and disables the finder when no active semester exists', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, semester_id: 0, cases: [], schedules: [] } });
    panel();
    expect(await screen.findByText('No active semester configured')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Find suitable rooms' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('labels suitable rooms and requires an explicit replacement selection before confirmation', async () => {
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Find suitable rooms' }));
    const confirm = await screen.findByRole('button', { name: 'Submit for approval' });
    expect(screen.getByText('Available for this schedule')).toBeTruthy();
    expect(screen.getByText('Laboratory · Capacity not recorded')).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);
    const proposal = screen.getByRole('checkbox', { name: 'Transfer SCI101 A' });
    fireEvent.click(proposal);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Not selected')).toBeTruthy();
    expect(screen.getByText('0 of 1 classes selected for transfer')).toBeTruthy();
    fireEvent.click(proposal);
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Transfers saved.' } });
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    await screen.findByText('Transfers saved.');
    expect(api.post).toHaveBeenLastCalledWith('/room-recovery/plans/plan-1/submit', { group_keys: ['single-11'] });
  });

  it('keeps keyboard focus within the modal including its scrollable panes', async () => {
    panel();
    const schedules = await screen.findByRole('region', { name: 'Schedule list' });
    const suggestions = screen.getByRole('region', { name: 'Room suggestions' });
    expect(schedules.tabIndex).toBe(0);
    const close = screen.getByRole('button', { name: 'Close modal' });
    suggestions.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(suggestions);
  });

  it('links an alert to the exact case and semester', async () => {
    render(<MemoryRouter><RoomRecoveryAlerts /></MemoryRouter>);
    const link = await screen.findByText('Review affected schedules');
    expect(link.getAttribute('href')).toBe('/secretary/schedule-management?recovery=2&recovery_semester=1');
    expect(screen.getByText(/Lab 1: 1 meeting/)).toBeTruthy();
  });

  it('hides the alert banner until issues need attention and hides it again when resolved', async () => {
    const resolved = { ...data, cases: [], pending_count: 0, schedules: [], new_rooms: [data.rooms[1]] };
    vi.mocked(api.get).mockResolvedValue({ data: resolved });
    render(<MemoryRouter><RoomRecoveryAlerts /></MemoryRouter>);
    const banner = () => screen.queryByRole('region', { name: 'Room and Laboratory Alerts' });
    expect(banner()).toBeNull();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(banner()).toBeNull();
    expect(screen.queryByText(/Recently added rooms/)).toBeNull();
    vi.mocked(api.get).mockResolvedValue({ data });
    fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: ['rooms'] } }));
    expect(await screen.findByRole('region', { name: 'Room and Laboratory Alerts' })).toBeTruthy();
    vi.mocked(api.get).mockResolvedValue({ data: resolved });
    fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: ['schedules'] } }));
    await waitFor(() => expect(banner()).toBeNull());
  });

  it('shows pending room transfers even without a closure incident', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, cases: [], pending_count: 2, schedules: [] } });
    render(<MemoryRouter><RoomRecoveryAlerts /></MemoryRouter>);
    expect(await screen.findByText(/2 meeting\(s\) need attention/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review room transfers' }).getAttribute('href'))
      .toBe('/secretary/schedule-management?recovery=open&recovery_semester=1');
    expect(screen.queryByText('No unresolved room recovery alerts.')).toBeNull();
  });

  it('preselects affected classes and defaults to preserving times', async () => {
    panel();
    const find = await screen.findByText('Find suitable rooms');
    expect((screen.getByRole('checkbox', { name: /Select SCI101/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(find);
    await screen.findByText('Submit for approval');
    expect(api.post).toHaveBeenCalledWith('/room-recovery/preview', { schedule_ids: [11], destination_room_ids: [], allow_time_changes: false });
    fireEvent.click(screen.getByLabelText('Allow day and time changes'));
    expect(screen.queryByText('Submit for approval')).toBeNull();
    expect(screen.getByText(/including Sunday/)).toBeTruthy();
    fireEvent.click(screen.getByText('Find suitable rooms'));
    await screen.findByText('Submit for approval');
    expect(api.post).toHaveBeenLastCalledWith('/room-recovery/preview', { schedule_ids: [11], destination_room_ids: [], allow_time_changes: true });
  });

  it('removes a stale plan and explains the failure', async () => {
    panel(); fireEvent.click(await screen.findByText('Find suitable rooms'));
    const apply = await screen.findByText('Submit for approval');
    vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 409, data: { message: 'Availability changed. Refresh recommendations.' } } });
    fireEvent.click(apply);
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    await screen.findByText(/Availability changed/);
    expect(screen.queryByText('Submit for approval')).toBeNull();
  });

  it('does not ask for fewer classes when every selected transfer has a verified result', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ...plan, search_limit_reached: true } });
    panel();
    fireEvent.click(await screen.findByText('Find suitable rooms'));
    await screen.findByText('Submit for approval');
    expect(screen.queryByText('Search limit reached. Try fewer classes.')).toBeNull();
  });

  it('shows class names and linked meeting times instead of database IDs in unresolved results', async () => {
    const reason = 'An affected meeting requires the existing revision workflow before reassignment.';
    vi.mocked(api.post).mockResolvedValue({ data: { ...plan, groups: [],
      meetings: [
        { ...data.schedules[0], mode: 'on-site' },
        { ...data.schedules[0], id: 15434, day: 'Wednesday', start_time: '17:30:00', end_time: '19:30:00', mode: 'online', room: 'Online' },
      ],
      unresolved: [{ schedule_ids: [11, 15434], reason, reason_code: 'revision_required' }],
    } });
    panel();
    fireEvent.click(await screen.findByText('Find suitable rooms'));
    expect(await screen.findByText('Could not transfer: SCI101 · A')).toBeTruthy();
    expect(screen.getByText('Monday 8:00 AM–9:00 AM · Lab 1')).toBeTruthy();
    expect(screen.getByText('Wednesday 5:30 PM–7:30 PM · Online')).toBeTruthy();
    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.getByText('No transfers ready. See the reasons below.')).toBeTruthy();
    expect(screen.queryByText(/15434/)).toBeNull();
    expect(screen.queryByText('No verified suitable room was found.')).toBeNull();
    expect(screen.queryByText('Submit for approval')).toBeNull();
  });

  it('allows optional day/time changes during faculty assignment and labels unchanged online partners', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, schedules: [{ ...data.schedules[0], status: 'faculty_assignment', revision_required: false }] } });
    const online = { ...row, id: 15434, day: 'Wednesday', room_id: null };
    vi.mocked(api.post).mockResolvedValue({ data: { ...plan,
      // Matching uses IDs even when the before rows arrive in a different order.
      groups: [{ ...plan.groups[0], before: [online, row], after: [{ ...row, room_id: 2 }, online] }],
      meetings: [{ ...data.schedules[0], id: 15434, day: 'Wednesday', mode: 'online', room: 'Online' }],
    } });
    panel();
    expect(await screen.findByText('Day/time changes allowed when enabled')).toBeTruthy();
    expect(screen.queryByText('Room only · same day and time')).toBeNull();
    expect(screen.queryByText('Revision required')).toBeNull();
    fireEvent.click(screen.getByText('Find suitable rooms'));
    expect(await screen.findByText('Day and time unchanged')).toBeTruthy();
    expect(screen.getByText('Current: Lab 1 · Monday 8:00 AM–9:00 AM')).toBeTruthy();
    expect(screen.getByText('Lab 2 · Monday 8:00 AM–9:00 AM')).toBeTruthy();
    expect(screen.getByText('Online · Wednesday 8:00 AM–9:00 AM · Unchanged linked meeting')).toBeTruthy();
    expect(screen.queryByText(/15434/)).toBeNull();
  });

  it('does not show a failed alert request as an empty recovery queue', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Offline'));
    render(<MemoryRouter><RoomRecoveryAlerts /></MemoryRouter>);
    await screen.findByRole('alert');
    expect(screen.queryByRole('region', { name: 'Room and Laboratory Alerts' })).toBeNull();
    expect(screen.queryByText('No unresolved room recovery alerts.')).toBeNull();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByText('Review affected schedules')).toBeTruthy();
  });
});
