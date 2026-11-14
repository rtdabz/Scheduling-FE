import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoomTransferRequests from './RoomTransferRequests';
import api from '../../lib/api';
import { publishLiveTopics } from '../../lib/liveUpdates';
import type { RoomTransferRequest } from '../../lib/roomRecovery';

vi.mock('../../lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../lib/liveUpdates', () => ({ publishLiveTopics: vi.fn() }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));
const transfer: RoomTransferRequest = {
  id: 'plan-1', status: 'pending_vpaa', department: 'Science', semester_id: 1, semester_label: '2026-2027 1st',
  submitted_by: 'Secretary', submitted_at: '2026-10-23T02:00:00Z', reviewed_at: null, rejection_reason: null, schedule_ids: [11],
  changes: [{ schedule_id: 11, course: 'SCI101', section: 'A',
    before: { room: 'Lab 1', day: 'Monday', start_time: '08:00', end_time: '09:00' },
    after: { room: 'Lab 2', day: 'Monday', start_time: '08:00', end_time: '09:00' } }],
};
beforeEach(() => { vi.mocked(api.get).mockResolvedValue({ data: { transfers: [transfer] } }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const review = (stage: 'dean' | 'vpaa' = 'vpaa') => render(<MemoryRouter><RoomTransferRequests stage={stage} /></MemoryRouter>);

describe('Room schedule reassignment VPAA review', () => {
  it('opens the existing paginated changes modal above the shared schedule preview', async () => {
    const many = { ...transfer, changes: Array.from({ length: 23 }, (_, i) => ({ ...transfer.changes[0], schedule_id: i + 1, mode: i === 22 ? 'online' : 'on-site', course: `SCI${i + 1}` })) };
    const close = vi.fn();
    render(<MemoryRouter><RoomTransferRequests stage="vpaa" transfers={[many]} onClose={close} /></MemoryRouter>);
    const dialog = screen.getByRole('dialog', { name: 'Room Schedule Reassignment Details' });
    expect(within(dialog).queryByRole('table')).toBeNull();
    // The summary and sample rows live only inside View Details.
    expect(within(dialog).queryByRole('region', { name: 'Changes Summary' })).toBeNull();
    expect(within(dialog).queryByText('SCI1 · A')).toBeNull();
    expect(within(dialog).queryByText(/more schedules?/)).toBeNull();
    // Status lives in View Details, not above the document.
    expect(within(dialog).queryByText('Pending VPAA Approval')).toBeNull();
    const viewDetails = within(dialog).getByRole('button', { name: 'View Details' });
    expect(viewDetails.closest('header')?.querySelector('h2')?.textContent).toBe('Room Schedule Reassignment Details');
    expect(viewDetails.getAttribute('aria-haspopup')).toBe('dialog');
    expect(viewDetails.hasAttribute('aria-expanded')).toBe(false);
    fireEvent.click(viewDetails);
    const changes = screen.getByRole('dialog', { name: 'Room schedule reassignment changes' });
    expect(dialog.hasAttribute('inert')).toBe(true);
    const summary = within(changes).getByRole('region', { name: 'Changes Summary' });
    expect(summary.textContent).toContain('22affected meetings');
    expect(summary.textContent).toContain('1linked online session');
    expect(within(summary).getByText('Science')).toBeTruthy();
    expect(within(summary).getByText('2026-2027 1st')).toBeTruthy();
    expect(within(summary).getByText('Secretary')).toBeTruthy();
    expect(within(summary).getByText('Pending VPAA Approval')).toBeTruthy();
    expect(within(summary).queryByText('VPAA reviewed')).toBeNull();
    expect(within(changes).getByRole('table', { name: 'Room schedule reassignment changes' })).toBeTruthy();
    expect(within(changes).getByRole('columnheader', { name: 'Session type' })).toBeTruthy();
    expect(within(changes).getByRole('columnheader', { name: 'Original' })).toBeTruthy();
    expect(within(changes).getByRole('columnheader', { name: 'Proposed' })).toBeTruthy();
    expect(within(changes).getByText('SCI3')).toBeTruthy();
    expect(within(changes).getByText('SCI10')).toBeTruthy();
    expect(within(changes).queryByText('SCI11')).toBeNull();
    fireEvent.click(within(changes).getByRole('button', { name: /next/i }));
    fireEvent.click(within(changes).getByRole('button', { name: /next/i }));
    expect(within(changes).getByText('SCI21')).toBeTruthy();
    expect(within(changes).getByText('SCI23')).toBeTruthy();
    expect(within(changes).getAllByText('Room changed')).toHaveLength(2);
    expect(within(changes).getByText('Linked online session — unchanged')).toBeTruthy();
    expect(within(changes).getAllByText('On-site')).toHaveLength(2);
    expect(within(changes).getByText('Online')).toBeTruthy();
    // Room over day and time; changed values carry text, not only color, and the linked session says it is unchanged.
    expect(within(changes).getAllByText('Lab 1')).toHaveLength(3);
    expect(within(changes).getAllByText('Lab 2')).toHaveLength(3);
    expect(within(changes).getAllByText('Monday 8:00 AM–9:00 AM')).toHaveLength(6);
    expect(within(changes).getAllByText('(new room)')).toHaveLength(2);
    expect(within(changes).getAllByText('Same as original')).toHaveLength(1);
    expect(within(changes).getByRole('region', { name: 'Room schedule reassignment changes table' }).getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Room schedule reassignment changes' })).toBeNull();
    expect(close).not.toHaveBeenCalled();
    expect(dialog.hasAttribute('inert')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(viewDetails));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('dialog', { name: 'Approve room schedule reassignment' })).toBeTruthy();
    expect(dialog.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Approve room schedule reassignment' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Room Schedule Reassignment Details' })).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows the original and proposed placements before approval', async () => {
    review();
    expect(await screen.findByText(/^Pending VPAA Approval/)).toBeTruthy();
    expect(screen.getByText(/Original: Lab 1/)).toBeTruthy();
    expect(screen.getByText(/Proposed: Lab 2/)).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('confirms approval once and refreshes the reviewed status', async () => {
    review();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve room schedule reassignment' });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Approved and applied.' } });
    vi.mocked(api.get).mockResolvedValue({ data: { transfers: [{ ...transfer, status: 'approved' }] } });
    const confirm = within(dialog).getByRole('button', { name: 'Approve transfer' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(await screen.findByText(/^Approved ·/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/room-recovery/plans/plan-1/approve', {});
    expect(publishLiveTopics).toHaveBeenCalledWith(['approvals', 'schedules', 'rooms', 'notifications', 'settings']);
  });

  it.each(['dean', 'vpaa'] as const)('requires a reason and displays the %s rejection after saving', async stage => {
    vi.mocked(api.get).mockResolvedValue({ data: { transfers: [{ ...transfer, status: `pending_${stage}` }] } });
    review(stage);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject room schedule reassignment' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject transfer' }));
    expect(within(dialog).getByRole('alert').textContent).toContain('A rejection reason is required.');
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Rejection reason' }), { target: { value: ' Keep the original room. ' } });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Rejected. Existing schedules are unchanged.' } });
    vi.mocked(api.get).mockResolvedValue({ data: { transfers: [{ ...transfer, status: `rejected_by_${stage}`, rejection_reason: 'Keep the original room.' }] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject transfer' }));
    expect(await screen.findByText('Rejection reason: Keep the original room.')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith('/room-recovery/plans/plan-1/reject', { reason: 'Keep the original room.' });
  });

  it('retains pending status when the server rejects a stale approval', async () => {
    review();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { message: 'Availability changed. Refresh recommendations.' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve transfer' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Availability changed.');
    expect(screen.getByText(/^Pending VPAA Approval/)).toBeTruthy();
    expect(publishLiveTopics).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Approve room schedule reassignment' })).toBeTruthy();
  });

  it('keeps the rejection reason after a server failure and blocks duplicate or cancelled decisions while saving', async () => {
    review();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject room schedule reassignment' });
    const reason = within(dialog).getByRole('textbox', { name: 'Rejection reason' }) as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: 'Keep the current laboratory.' } });
    let fail: (error: unknown) => void = () => {};
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const submit = within(dialog).getByRole('button', { name: 'Reject transfer' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(reason.disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Reject room schedule reassignment' })).toBeTruthy();
    await act(async () => { fail({ response: { data: { message: 'The decision could not be saved.' } } }); });
    expect((await within(dialog).findByRole('alert')).textContent).toContain('The decision could not be saved.');
    expect(reason.value).toBe('Keep the current laboratory.');
    expect(reason.disabled).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Reject room schedule reassignment' })).toBeNull();
  });

  it('uses Dean confirmation to forward a request without implying schedules were applied', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { transfers: [{ ...transfer, status: 'pending_dean' }] } });
    review('dean');
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(screen.getByText('Approve this room schedule reassignment and forward it to the VPAA? Existing schedules will remain unchanged.')).toBeTruthy();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Pending VPAA Approval. Existing schedules are unchanged.' } });
    vi.mocked(api.get).mockResolvedValue({ data: { transfers: [transfer] } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve transfer' }));
    expect(await screen.findByText(/^Pending VPAA Approval ·/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.getByText(/Original: Lab 1/)).toBeTruthy();
  });

  it.each([['dean', 'pending_vpaa'], ['vpaa', 'pending_dean']] as const)('hides controls for %s when the request is %s', async (stage, status) => {
    vi.mocked(api.get).mockResolvedValue({ data: { transfers: [{ ...transfer, status }] } });
    review(stage);
    expect(await screen.findByText(/^Pending (Dean|VPAA) Approval ·/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('shows requester status without review controls and opens a linked request', () => {
    render(<MemoryRouter initialEntries={['/?room_transfer=plan-1']}><RoomTransferRequests transfers={[{ ...transfer, status: 'rejected_by_vpaa', rejection_reason: 'Refresh the proposal.' }]} /></MemoryRouter>);
    expect(screen.getByText(/^Rejected by VPAA ·/).closest('details')?.open).toBe(true);
    expect(screen.getByText('Rejection reason: Refresh the proposal.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('warns reviewers when final approval enables Sunday classes', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { transfers: [{ ...transfer, status: 'pending_dean', enables_sunday: true }] } });
    review('dean');
    expect(await screen.findByText('Final approval also enables Sunday classes for Science.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByText(/forward it to the VPAA\? Existing schedules will remain unchanged\. This transfer moves classes to Sunday, so final approval also enables Sunday classes for Science\./)).toBeTruthy();
  });

  it('lists transfers applied before the approval workflow as approved history', () => {
    render(<MemoryRouter><RoomTransferRequests transfers={[{ ...transfer, status: 'applied' }]} /></MemoryRouter>);
    expect(screen.getByText(/^Applied \(before approval workflow\) ·/)).toBeTruthy();
    expect(screen.queryByText(/Final approval also enables Sunday/)).toBeNull();
  });

  it('shows a decided request in View Details from its stored data for the Dean', async () => {
    const decided: RoomTransferRequest = {
      ...transfer, status: 'rejected_by_vpaa', dean_reviewed_at: '2026-10-24T03:00:00Z', reviewed_at: '2026-10-25T04:00:00Z',
      rejection_reason: 'Lab 2 is reserved for the fair.',
      changes: [
        { ...transfer.changes[0], schedule_id: 21, mode: 'on-site', course: 'SCI201', section: 'B',
          after: { room: 'Lab 1', day: 'Tuesday', start_time: '10:00', end_time: '11:00' },
          preview_schedule: { meeting_type: 'laboratory' } as NonNullable<RoomTransferRequest['changes'][number]['preview_schedule']> },
        { ...transfer.changes[0], schedule_id: 22, mode: 'online', course: 'SCI201', section: 'B',
          before: { room: 'Online', day: 'Monday', start_time: '13:00', end_time: '14:00' },
          after: { room: 'Online', day: 'Monday', start_time: '13:00', end_time: '14:00' } },
      ],
    };
    render(<MemoryRouter><RoomTransferRequests stage="dean" transfers={[decided]} onClose={vi.fn()} /></MemoryRouter>);
    const dialog = screen.getByRole('dialog', { name: 'Room Schedule Reassignment Details' });
    expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(dialog).queryByText(/Rejection reason/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'View Details' }));
    const changes = screen.getByRole('dialog', { name: 'Room schedule reassignment changes' });
    const summary = within(changes).getByRole('region', { name: 'Changes Summary' });
    expect(summary.textContent).toContain('1affected meeting');
    expect(summary.textContent).toContain('1linked online session');
    expect(within(summary).getByText('Rejected by VPAA')).toBeTruthy();
    expect(within(summary).getByText(new Date('2026-10-24T03:00:00Z').toLocaleString())).toBeTruthy();
    expect(within(summary).getByText(new Date('2026-10-25T04:00:00Z').toLocaleString())).toBeTruthy();
    expect(within(summary).getByText('Rejection reason: Lab 2 is reserved for the fair.')).toBeTruthy();
    expect(within(changes).getByText('Time changed')).toBeTruthy();
    expect(within(changes).getByText('Laboratory · On-site')).toBeTruthy();
    expect(within(changes).getByText('Linked online session — unchanged')).toBeTruthy();
    expect(within(changes).getAllByText('Lab 1')).toHaveLength(2);
    expect(within(changes).getByText('Monday 8:00 AM–9:00 AM')).toBeTruthy();
    expect(within(changes).getByText('Tuesday 10:00 AM–11:00 AM')).toBeTruthy();
    expect(within(changes).getByText('(new day or time)')).toBeTruthy();
    expect(within(changes).queryByText('(new room)')).toBeNull();
    expect(within(changes).getAllByText('Same as original')).toHaveLength(1);
  });

  it('offers a retry if requests cannot be loaded', async () => {
    vi.mocked(api.get).mockRejectedValueOnce({ response: { data: { message: 'Could not load transfers.' } } });
    review();
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load transfers.');
    expect(screen.queryByText('No room schedule reassignment requests.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/^Pending VPAA Approval/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
