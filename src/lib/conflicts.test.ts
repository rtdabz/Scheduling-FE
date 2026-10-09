import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ default: { get: (...args: unknown[]) => apiGet(...args) } }));

import {
  alreadyResolvedFrom,
  conflictRuleLabel,
  conflictFlagsBySchedule,
  describeConflictSchedule,
  fetchConflictRecommendations,
  fetchResolvedConflicts,
  fetchRuleIssues,
  isReplottable,
  refusalDetails,
  resolutionActionLabel,
  resolutionMethodLabel,
  resolutionStatusLabel,
  resolvedScheduleIds,
  ruleIssueLabel,
  type ConflictResolution,
  type ConflictSchedule,
} from './conflicts';

const schedule = (overrides: Partial<ConflictSchedule> = {}): ConflictSchedule => ({
  id: 42,
  semester_id: 1,
  section_id: 7,
  course_id: 3,
  faculty_id: null,
  room_id: 9,
  department_id: 2,
  day: 'Monday',
  start_time: '08:00:00',
  end_time: '09:30:00',
  mode: 'on-site',
  status: 'draft',
  course_code: 'IT 301',
  course_name: 'Networks',
  section_name: 'BSIT 3A',
  room_code: 'CL-201',
  faculty_name: null,
  ...overrides,
});

describe('describeConflictSchedule', () => {
  it('names the class, when it meets, where, and who teaches it', () => {
    expect(describeConflictSchedule(schedule())).toBe(
      'IT 301 — BSIT 3A · Monday 8:00 AM - 9:30 AM · CL-201 · No instructor',
    );
  });

  it('says Online rather than a missing room for an online meeting', () => {
    expect(describeConflictSchedule(schedule({ room_code: null, mode: 'online' })))
      .toContain('Online');
  });

  it('falls back to the row id when the class has no code or section', () => {
    expect(describeConflictSchedule(schedule({ course_code: null, section_name: null })))
      .toContain('Class #42');
  });
});

describe('isReplottable', () => {
  it.each(['draft', 'completed', 'revision'])('allows a %s class to be moved', (status) => {
    expect(isReplottable(schedule({ status }))).toBe(true);
  });

  it.each(['submitted', 'approved', 'finalized'])('refuses a %s class', (status) => {
    expect(isReplottable(schedule({ status }))).toBe(false);
  });
});

describe('alreadyResolvedFrom', () => {
  it('reads the open list out of the 409 the server answers with', () => {
    const open = [{ id: 'room_conflict:1:2' }];

    expect(alreadyResolvedFrom({ response: { status: 409, data: { conflicts: open } } }))
      .toEqual(open);
  });

  it('returns an empty list when the 409 carried none', () => {
    expect(alreadyResolvedFrom({ response: { status: 409, data: {} } })).toEqual([]);
  });

  it('is null for every other failure, so a refusal is still shown as one', () => {
    expect(alreadyResolvedFrom({ response: { status: 422, data: {} } })).toBeNull();
    expect(alreadyResolvedFrom(new Error('offline'))).toBeNull();
  });
});

describe('refusalDetails', () => {
  it('lists each violation message once', () => {
    const details = refusalDetails({
      response: {
        data: {
          violations: [
            { rule: 'room_conflict', message: 'The room is taken.' },
            { rule: 'section_conflict', message: 'The room is taken.' },
            { rule: 'operating_hours', message: 'Outside operating hours.' },
            { rule: 'no_message' },
          ],
        },
      },
    });

    expect(details).toEqual(['The room is taken.', 'Outside operating hours.']);
  });

  it('is empty when nothing came back', () => {
    expect(refusalDetails({})).toEqual([]);
  });
});

describe('labels', () => {
  it('names each rule in plain words', () => {
    expect(conflictRuleLabel('faculty_conflict')).toBe('Instructor double-booked');
    expect(conflictRuleLabel('something_new')).toBe('Conflict');
  });

  it('names each action as the thing the user is choosing to do', () => {
    expect(resolutionActionLabel('reassign_instructor')).toBe('Reassign the instructor');
    expect(resolutionActionLabel('move_schedule')).toBe('Move to another day or time');
  });
});

describe('fetchConflictRecommendations', () => {
  it('asks for the encoded conflict and returns its ranked options', async () => {
    const option = {
      rank: 1,
      action: 'change_room',
      schedule_id: 42,
      summary: 'Move IT 301 to CL-202, same time.',
      score: 100,
      payload: { action: 'change_room', schedule_id: 42, room_id: 10, mode: 'on-site' },
    };
    apiGet.mockResolvedValueOnce({ data: { options: [option] } });

    await expect(fetchConflictRecommendations('room_conflict:42:77', { limit: 3 })).resolves.toEqual([option]);
    expect(apiGet).toHaveBeenCalledWith(
      '/conflicts/room_conflict%3A42%3A77/recommendations',
      { signal: undefined, params: { limit: 3 } },
    );
  });

  it('treats a missing options list as no recommendations', async () => {
    apiGet.mockResolvedValueOnce({ data: {} });

    await expect(fetchConflictRecommendations('room_conflict:42:77')).resolves.toEqual([]);
  });

  it('discards retired instructor candidates from an older server while preserving placement order', async () => {
    const move = { rank: 2, action: 'move_schedule', payload: { action: 'move_schedule', schedule_id: 42 } };
    const room = { rank: 3, action: 'change_room', payload: { action: 'change_room', schedule_id: 42 } };
    const retired = { rank: 1, action: 'reassign_instructor', payload: { action: 'reassign_instructor', schedule_id: 42, faculty_id: 9 } };
    apiGet.mockResolvedValueOnce({ data: { options: [retired, move, room] } });

    await expect(fetchConflictRecommendations('faculty_conflict:42:77')).resolves.toEqual([move, room]);
  });
});

const resolution = (overrides: Partial<ConflictResolution> = {}): ConflictResolution => ({
  key: '9:room_conflict:42:77',
  conflict_id: 'room_conflict:42:77',
  rule: 'room_conflict',
  message: 'IT 301 and IT 302 share the same room on Monday 08:00-09:00.',
  day: 'Monday',
  overlap_start: '08:00',
  overlap_end: '09:00',
  method: 'recommended',
  source: 'conflict_inbox',
  status: 'resolved',
  resolved_at: '2026-09-27T08:00:00.000Z',
  resolved_by: 'Secretary',
  reason: null,
  affected_schedule_ids: [77],
  ...overrides,
});

describe('resolution labels', () => {
  it('says how a conflict was resolved, and where a recommendation came from', () => {
    expect(resolutionMethodLabel(resolution())).toBe('Recommended fix');
    expect(resolutionMethodLabel(resolution({ source: 'schedule_generator' }))).toBe('Recommendation (Generate)');
    expect(resolutionMethodLabel(resolution({ method: 'manual' }))).toBe('Manual change');
    expect(resolutionMethodLabel(resolution({ method: 'overridden' }))).toBe('Allowed to stand');
  });

  it('never calls an allowed or returning clash resolved', () => {
    expect(resolutionStatusLabel('resolved')).toBe('Resolved');
    expect(resolutionStatusLabel('overridden')).toBe('Allowed');
    expect(resolutionStatusLabel('reopened')).toBe('Reopened');
  });
});

describe('fetchResolvedConflicts', () => {
  it('asks for the scope and returns the resolutions', async () => {
    apiGet.mockResolvedValueOnce({ data: { resolutions: [resolution()] } });

    await expect(fetchResolvedConflicts({ semesterId: 1, departmentId: 2 })).resolves.toEqual([resolution()]);
    expect(apiGet).toHaveBeenLastCalledWith('/conflicts/resolved', {
      signal: undefined,
      params: { semester_id: 1, department_id: 2, section_id: undefined },
    });
  });
});

describe('resolvedScheduleIds', () => {
  it('flags both sides of a resolved clash and the classes the fix changed, but not reopened or allowed ones', () => {
    const ids = resolvedScheduleIds([
      resolution({ affected_schedule_ids: [77, 78] }),
      resolution({ key: 'b', status: 'reopened', affected_schedule_ids: [90] }),
      resolution({ key: 'c', method: 'overridden', status: 'overridden', affected_schedule_ids: [91, 92] }),
    ]);

    // room_conflict:42:77 names both sides; 78 was moved along with 77.
    expect([...ids].sort()).toEqual(['42', '77', '78']);
  });
});

describe('rule issues', () => {
  it('asks for the scope and returns the issues', async () => {
    const issue = {
      id: 'rule_issue:room_availability:42',
      rule: 'room_availability',
      message: 'Room CL-201 is not available for scheduling.',
      schedule: schedule(),
    };
    apiGet.mockResolvedValueOnce({ data: { issues: [issue] } });

    await expect(fetchRuleIssues({ semesterId: 1 })).resolves.toEqual([issue]);
    expect(apiGet).toHaveBeenLastCalledWith('/conflicts/rule-issues', {
      signal: undefined,
      params: { semester_id: 1, department_id: undefined, section_id: undefined },
    });
  });

  it('names the common drifts and falls back for the rest', () => {
    expect(ruleIssueLabel('room_availability')).toBe('Room not available');
    expect(ruleIssueLabel('faculty_active')).toBe('Instructor inactive');
    expect(ruleIssueLabel('subject_active')).toBe('Rule no longer met');
  });
});

describe('conflictFlagsBySchedule', () => {
  it('marks both classes of each conflict with its kind', () => {
    const conflict = (id: string, rule: string, ids: [number, number]) => ({
      id,
      rule,
      semester_id: 1,
      day: 'Monday',
      overlap_start: '08:00',
      overlap_end: '09:00',
      message: '',
      resolution_options: [],
      schedules: [schedule({ id: ids[0] }), schedule({ id: ids[1] })] as [ConflictSchedule, ConflictSchedule],
    });

    const flags = conflictFlagsBySchedule([
      conflict('room_conflict:1:2', 'room_conflict', [1, 2]),
      conflict('faculty_conflict:2:3', 'faculty_conflict', [2, 3]),
    ] as never);

    expect(flags.get('1')).toEqual({ faculty: false, room: true, section: false, online: false });
    expect(flags.get('2')).toEqual({ faculty: true, room: true, section: false, online: false });
    expect(flags.get('3')).toEqual({ faculty: true, room: false, section: false, online: false });
    expect(flags.has('4')).toBe(false);
  });
});
