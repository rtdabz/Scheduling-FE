import { describe, expect, it } from 'vitest';
import { roomReassignmentActivity, type RecoverySchedule, type RoomTransferRequest } from './roomRecovery';

const schedule = (overrides: Partial<RecoverySchedule>): RecoverySchedule => ({
  id: 1, course: 'IT101', section: 'A', room: 'R101', day: 'Monday', start_time: '08:00', end_time: '09:00',
  meeting_type: 'lecture', status: 'draft', needs_attention: true, ...overrides,
});

describe('roomReassignmentActivity', () => {
  it('flags rooms with classes needing a room and rooms in pending transfers', () => {
    const transfer = {
      id: 't1', status: 'pending_vpaa', schedule_ids: [3],
      changes: [
        { schedule_id: 3, mode: 'on-site', course: 'IT103', section: 'C', before: { room: 'R103', day: 'Tuesday', start_time: '08:00', end_time: '09:00' }, after: { room: 'R200', day: 'Tuesday', start_time: '08:00', end_time: '09:00' } },
        { schedule_id: 4, mode: 'online', course: 'IT103', section: 'C', before: { room: 'R999', day: 'Friday', start_time: '08:00', end_time: '09:00' }, after: { room: 'R998', day: 'Friday', start_time: '08:00', end_time: '09:00' } },
      ],
    } as unknown as RoomTransferRequest;
    const activity = roomReassignmentActivity({
      schedules: [
        schedule({ id: 1, room: 'R101' }),
        schedule({ id: 2, room: 'Online (temporary, R102 unavailable)', temporarily_online: true, original_room: 'R102' }),
        schedule({ id: 3, room: 'R103', pending_transfer_id: 't1', pending_transfer_status: 'pending_vpaa' }),
        schedule({ id: 5, room: 'Room TBA' }),
        schedule({ id: 6, room: 'R104', needs_attention: false }),
      ],
      transfers: [transfer, { ...transfer, id: 't2', status: 'rejected_by_dean', changes: [{ ...transfer.changes[0], after: { ...transfer.changes[0].after, room: 'R300' } }] }],
    });

    expect(activity).toEqual({
      R101: { needs: 1, pending: 0 },
      R102: { needs: 1, pending: 0 },
      R103: { needs: 0, pending: 1 },
      R200: { needs: 0, pending: 1 },
    });
  });
});
