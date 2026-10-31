import { describe, expect, it } from 'vitest';
import { oldestWaitingFirst, pendingScheduleRequests, pendingTransferRequests, waitingSinceFor } from './dashboardQueue';
import { workloadExceptions } from './facultyLoad';
import { rollupDepartments } from './vpaaOverview';
import type { RoomTransferRequest } from './roomRecovery';

const submission = (id: number, status: string, sections: Array<{ id: number; state?: 'included' | 'withdrawn' }>, extra: Record<string, unknown> = {}) => ({
  id,
  department_id: 1,
  semester_id: 1,
  revision_number: 1,
  status: status as never,
  submitted_at: '2026-09-01T02:00:00Z',
  dean_reviewed_at: null as string | null,
  sections: sections.map(section => ({ id: section.id, pivot: section.state ? { state: section.state } : null })),
  ...extra,
});

const transfer = (id: string, status: RoomTransferRequest['status'], extra: Partial<RoomTransferRequest> = {}): RoomTransferRequest => ({
  id, status, department_id: 1, department: 'Information Technology', semester_id: 1, semester_label: '1st Semester',
  submitted_by: 'Maria', submitted_at: '2026-09-03T02:00:00Z', reviewed_at: null, rejection_reason: null, schedule_ids: [1, 2],
  changes: [
    { schedule_id: 1, course: 'IT 101', section: 'BSIT 1A', before: { room: 'R1', day: 'Monday', start_time: '08:00', end_time: '09:00' }, after: { room: 'R2', day: 'Monday', start_time: '08:00', end_time: '09:00' } },
    { schedule_id: 2, mode: 'online', course: 'IT 101', section: 'BSIT 1A', before: { room: 'ONLINE', day: 'Tuesday', start_time: '08:00', end_time: '09:00' }, after: { room: 'ONLINE', day: 'Tuesday', start_time: '08:00', end_time: '09:00' } },
  ],
  ...extra,
});

describe('pendingScheduleRequests', () => {
  it('keeps one identity per submission and only the stage that is waiting on the reviewer', () => {
    const submissions = [
      submission(1, 'pending_vpaa', [{ id: 1 }, { id: 2 }], { approval_override: true, approval_override_reason: 'Lab rule waived', dean_reviewed_at: '2026-09-04T00:00:00Z' }),
      submission(2, 'pending_vpaa', [{ id: 3 }], { dean_reviewed_at: '2026-09-02T00:00:00Z' }),
      submission(3, 'pending_dean', [{ id: 4 }]),
      submission(4, 'approved', [{ id: 5 }]),
    ];
    const vpaa = pendingScheduleRequests('vpaa', submissions, () => []);
    expect(vpaa.map(request => request.key)).toEqual(['1', '2']);
    expect(vpaa[0]).toMatchObject({ sectionCount: 2, override: true, overrideReason: 'Lab rule waived' });
    expect(pendingScheduleRequests('dean', submissions, () => []).map(request => request.key)).toEqual(['3']);
  });

  it('counts only the still-active slice of a partially withdrawn submission', () => {
    const partial = submission(5, 'partially_withdrawn', [{ id: 1, state: 'withdrawn' }, { id: 2 }, { id: 3 }]);
    const [request] = pendingScheduleRequests('dean', [partial], () => ['submitted']);
    expect(request).toMatchObject({ key: '5:active', sectionCount: 2 });
  });
});

describe('pendingTransferRequests', () => {
  it('separates transfers from schedule submissions and counts moved meetings, not linked online sessions', () => {
    const rows = pendingTransferRequests('vpaa', [transfer('a', 'pending_vpaa'), transfer('b', 'pending_dean'), transfer('c', 'approved')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'room-transfer:a', type: 'room_transfer', transferId: 'a', meetingCount: 1 });
    expect(pendingTransferRequests('dean', [transfer('b', 'pending_dean')])[0].key).toBe('room-transfer:b');
  });
});

describe('waitingSinceFor', () => {
  it('uses the time the request entered the reviewer stage, and says when it had to fall back', () => {
    expect(waitingSinceFor('dean', { submitted_at: '2026-09-01', dean_reviewed_at: '2026-09-05' })).toEqual({ at: '2026-09-01', approximate: false });
    expect(waitingSinceFor('vpaa', { submitted_at: '2026-09-01', dean_reviewed_at: '2026-09-05' })).toEqual({ at: '2026-09-05', approximate: false });
    expect(waitingSinceFor('vpaa', { submitted_at: '2026-09-01', dean_reviewed_at: null })).toEqual({ at: '2026-09-01', approximate: true });
    expect(waitingSinceFor('vpaa', { submitted_at: null, dean_reviewed_at: null })).toEqual({ at: null, approximate: false });
  });

  it('sorts the genuinely oldest request first and never treats an unknown time as fresh', () => {
    const rows = [{ waitingSince: '2026-09-05' }, { waitingSince: null }, { waitingSince: '2026-09-01' }];
    expect([...rows].sort(oldestWaitingFirst).map(row => row.waitingSince)).toEqual(['2026-09-01', '2026-09-05', null]);
  });
});

describe('rollupDepartments', () => {
  it('keeps the oldest pending handoff for the department, not the newest', () => {
    const bySection = new Map([
      [1, submission(1, 'pending_vpaa', [{ id: 1 }], { dean_reviewed_at: '2026-09-09T00:00:00Z' })],
      [2, submission(2, 'pending_vpaa', [{ id: 2 }], { dean_reviewed_at: '2026-09-02T00:00:00Z' })],
    ]);
    const [row] = rollupDepartments(
      [{ id: 1, department_name: 'IT', department_code: 'CIT' }],
      [{ id: 1, department_id: 1 }, { id: 2, department_id: 1 }],
      bySection as never,
    );
    expect(row.submittedAt).toBe('2026-09-02T00:00:00Z');
  });
});

describe('workloadExceptions', () => {
  const faculty = (assigned: number, extra: Record<string, unknown> = {}) => ({ max_units: 18, deload_units: 0, overload_units: 6, assigned_units: assigned, status: 'active', ...extra });

  it('separates basic-load overload from exceeding the permitted ceiling', () => {
    // Basic 18 + overload 6 = 24 ceiling: 21 is overload within the limit, 25 is over the limit.
    expect(workloadExceptions([faculty(18), faculty(21), faculty(25)])).toEqual({ overload: 1, overLimit: 1, active: 3 });
  });

  it('leaves inactive instructors out of both the exceptions and the population', () => {
    expect(workloadExceptions([faculty(30, { status: 'inactive' }), faculty(10)])).toEqual({ overload: 0, overLimit: 0, active: 1 });
  });
});
