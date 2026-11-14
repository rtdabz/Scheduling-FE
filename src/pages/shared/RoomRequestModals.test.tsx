import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomRequest } from '../../lib/roomRequests';
import { RequestPreviewModal } from './RoomRequestModals';

vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: {}, confirm: vi.fn() }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));

afterEach(cleanup);

const request = (overrides: Partial<RoomRequest> = {}): RoomRequest => ({
  id: 1, status: 'revoked', purpose: 'Lecture space', review_remarks: 'Latest revocation reason',
  room: null, academic_semester: null, requesting_department: null, owner_department: null,
  requester: null, reviewer: { id: 17, name: 'Original Approver' },
  reviewed_at: '2026-11-01T08:00:00+08:00', created_at: '2026-11-01T07:00:00+08:00', windows: [],
  ...overrides,
});

const preview = (value: RoomRequest) => render(
  <RequestPreviewModal request={value} departmentId={null} onClose={vi.fn()} onChanged={vi.fn()} />,
);

describe('room request actor history', () => {
  it('keeps approval and revocation actors, times and remarks in separate recorded entries', () => {
    preview(request({ decisions: [
      { event: 'room_request_approved', occurred_at: '2026-11-01T08:00:00+08:00',
        actor: { id: 17, name: 'Original Approver' }, before_status: 'pending', after_status: 'approved', remarks: 'Original approval reason' },
      { event: 'room_request_revoked', occurred_at: '2026-11-02T09:00:00+08:00',
        actor: { id: 29, name: 'Replacement Revoker' }, before_status: 'approved', after_status: 'revoked', remarks: 'Recorded revocation reason' },
    ] }));

    const approval = screen.getByText('Room grant approved').closest('li')!;
    const revocation = screen.getByText('Room grant revoked').closest('li')!;
    expect(within(approval).getByText('Original Approver')).toBeTruthy();
    expect(within(approval).getByText('Original approval reason')).toBeTruthy();
    expect(within(approval).queryByText('Replacement Revoker')).toBeNull();
    expect(within(approval).getByText(/8:00/)).toBeTruthy();
    expect(within(revocation).getByText('Replacement Revoker')).toBeTruthy();
    expect(within(revocation).getByText('Recorded revocation reason')).toBeTruthy();
    expect(within(revocation).queryByText('Original Approver')).toBeNull();
    expect(within(revocation).getByText(/9:00/)).toBeTruthy();
    expect(screen.queryByText('Latest revocation reason')).toBeNull();
  });

  it('leaves a missing recorded decision actor unavailable instead of using the old reviewer', () => {
    preview(request({ decisions: [
      { event: 'room_request_revoked', occurred_at: '2026-11-02T09:00:00+08:00',
        actor: null, before_status: 'approved', after_status: 'revoked', remarks: 'Recorded reason' },
    ] }));

    const entry = screen.getByText('Room grant revoked').closest('li')!;
    expect(within(entry).getByText('Actor unavailable')).toBeTruthy();
    expect(screen.queryByText('Original Approver')).toBeNull();
  });

  it('keeps legacy revocation remarks unattributed and the original review separate', () => {
    preview(request());

    const original = screen.getByText('Original review').closest('section')!;
    const remarks = screen.getByText('Reason for revoking').closest('section')!;
    expect(within(original).getByText('Original Approver')).toBeTruthy();
    expect(within(remarks).getByText('Latest revocation reason')).toBeTruthy();
    expect(within(remarks).getByText('The actor for these remarks was not recorded.')).toBeTruthy();
    expect(within(remarks).queryByText('Original Approver')).toBeNull();
  });
});
