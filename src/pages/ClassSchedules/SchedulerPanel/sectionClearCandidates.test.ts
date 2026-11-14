import { describe, expect, it } from 'vitest';
import { buildSectionClearCandidates } from './sectionClearCandidates';
import type { ScheduleItem, Section } from './types';

const section = (id: string, departmentId = 1, semesterId = 1) => ({ id, name: `Section ${id}`, yearLevel: 1, departmentId, semesterId }) as Section;
const row = (id: string, sectionId: string, status: ScheduleItem['status']) => ({ id, sectionId, status, courseId: 'course1' }) as ScheduleItem;

describe('clear section eligibility', () => {
  it('restricts choices to the selected department and semester', () => {
    const candidates = buildSectionClearCandidates([section('1'), section('2', 2), section('3', 1, 2)], [row('1', '1', 'draft')], 1, 1);
    expect(candidates.map((candidate) => candidate.sectionId)).toEqual(['1']);
    expect(buildSectionClearCandidates([section('1')], [], null, 1)).toEqual([]);
    expect(buildSectionClearCandidates([section('1')], [], 1, null)).toEqual([]);
  });

  it('allows editable sections (draft, completed, revision), matching the server reset eligibility', () => {
    const candidates = buildSectionClearCandidates(
      ['1', '2', '3', '4'].map((id) => section(id)),
      [row('1', '1', 'draft'), row('2', '1', 'revision'), row('3', '2', 'completed'), row('4', '3', 'revision')], 1, 1,
    );
    // Section 1 mixes draft and a reopened class, 2 is completed but unsubmitted, 3 was recalled, 4 is empty.
    expect(candidates.map((candidate) => candidate.isReady)).toEqual([true, true, true, false]);
    expect(candidates[0].scheduleIds).toEqual([1, 2]);
    expect(candidates[0].blockedReason).toBe('');
    expect(candidates[3].blockedReason).toBe('No schedules to reset');
    const twoClasses = buildSectionClearCandidates([section('5')], [row('6', '5', 'draft'), { ...row('7', '5', 'completed'), courseId: 'course2' }], 1, 1);
    expect(twoClasses[0].isReady).toBe(true);
    expect(twoClasses[0].requiredSubjects).toBe(2);
  });

  it.each([
    ['submitted', 'Waiting for Dean review'],
    ['approved_by_dean', 'Waiting for VPAA review'],
    ['conditionally_approved', 'Waiting for VPAA review'],
    ['approved', 'Approved by the VPAA and locked for instructor assignment'],
    ['faculty_assignment', 'Approved by the VPAA and locked for instructor assignment'],
    ['finalized', 'Approved by the VPAA and locked for instructor assignment'],
  ] as const)('blocks a section with a %s class and says why', (status, reason) => {
    const [candidate] = buildSectionClearCandidates([section('1')], [row('1', '1', 'revision'), row('2', '1', status as ScheduleItem['status'])], 1, 1);
    expect(candidate.isReady).toBe(false);
    expect(candidate.blockedReason).toBe(reason);
  });

  it('names the most protected stage when a section mixes returned and approved classes', () => {
    const [candidate] = buildSectionClearCandidates([section('1')], [row('1', '1', 'rejected'), row('2', '1', 'approved')], 1, 1);
    expect(candidate.blockedReason).toBe('Approved by the VPAA and locked for instructor assignment');
  });

  it.each(['rejected', 'rejected_by_dean'] as const)('allows resetting a %s section for regeneration', (status) => {
    const [candidate] = buildSectionClearCandidates([section('1')], [row('1', '1', status)], 1, 1);
    expect(candidate.isReady).toBe(true);
    expect(candidate.blockedReason).toBe('');
  });
});
