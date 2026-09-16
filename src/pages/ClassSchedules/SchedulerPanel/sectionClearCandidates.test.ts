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

  it('allows working schedules while blocking empty and approval-locked sections', () => {
    const candidates = buildSectionClearCandidates(
      ['1', '2', '3', '4'].map((id) => section(id)),
      [row('1', '1', 'draft'), row('2', '1', 'revision'), row('3', '2', 'completed'), row('4', '3', 'draft'), row('5', '3', 'approved')], 1, 1,
    );
    expect(candidates.map((candidate) => candidate.isReady)).toEqual([true, true, false, false]);
    expect(candidates[0].requiredSubjects).toBe(1);
    expect(candidates[0].scheduleIds).toEqual([1, 2]);
    expect(candidates[2].blockedReason).toContain('Locked');
  });
});
