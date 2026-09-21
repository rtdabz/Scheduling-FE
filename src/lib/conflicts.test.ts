import { describe, expect, it } from 'vitest';
import {
  alreadyResolvedFrom,
  conflictRuleLabel,
  describeConflictSchedule,
  isReplottable,
  refusalDetails,
  resolutionActionLabel,
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
      'IT 301 — BSIT 3A · Monday 08:00-09:30 · CL-201 · No instructor',
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
    expect(resolutionActionLabel('request_override')).toBe('Allow it to stand, with a reason');
  });
});
