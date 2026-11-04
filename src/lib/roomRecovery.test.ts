import { describe, expect, it } from 'vitest';
import { roomTransferChangeLabel, roomTransferSessionType, type RoomTransferRequest } from './roomRecovery';

type Change = RoomTransferRequest['changes'][number];

const change = (overrides: Partial<Change> = {}): Change => ({
  schedule_id: 1, mode: 'on-site', course: 'SCI101', section: 'A',
  before: { room: 'Lab 1', day: 'Monday', start_time: '08:00:00', end_time: '09:00:00' },
  after: { room: 'Lab 1', day: 'Monday', start_time: '08:00', end_time: '09:00' },
  ...overrides,
});

describe('roomTransferChangeLabel', () => {
  it('names what changed between the stored placements', () => {
    expect(roomTransferChangeLabel(change({ after: { room: 'Lab 2', day: 'Monday', start_time: '08:00', end_time: '09:00' } }))).toBe('Room changed');
    expect(roomTransferChangeLabel(change({ after: { room: 'Lab 1', day: 'Tuesday', start_time: '08:00', end_time: '09:00' } }))).toBe('Time changed');
    expect(roomTransferChangeLabel(change({ after: { room: 'Lab 2', day: 'Monday', start_time: '10:00', end_time: '11:00' } }))).toBe('Room changed · Time changed');
    expect(roomTransferChangeLabel(change())).toBe('Unchanged');
  });

  it('tells an unchanged linked online session apart from a moved one', () => {
    const online = { mode: 'online', before: { room: 'Online', day: 'Monday', start_time: '13:00', end_time: '14:00' } };
    expect(roomTransferChangeLabel(change({ ...online, after: { ...online.before } }))).toBe('Linked online session — unchanged');
    expect(roomTransferChangeLabel(change({ ...online, after: { ...online.before, start_time: '15:00', end_time: '16:00' } }))).toBe('Linked online session — time changed');
  });
});

describe('roomTransferSessionType', () => {
  it('reads the stored meeting type and delivery mode without guessing', () => {
    const laboratory = { meeting_type: 'laboratory' } as NonNullable<Change['preview_schedule']>;
    expect(roomTransferSessionType(change({ preview_schedule: laboratory }))).toBe('Laboratory · On-site');
    expect(roomTransferSessionType(change({ mode: 'online' }))).toBe('Online');
    expect(roomTransferSessionType(change({ mode: undefined }))).toBe('Not recorded');
  });
});
