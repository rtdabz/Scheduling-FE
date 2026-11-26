import { describe, expect, it } from 'vitest';
import { subjectForSchedule } from './facultyEligibility';
import { isIncomingInstructorAssignment, isLocalInstructorAssignment } from './instructorAssignmentScope';
import type { Subject } from './types';

const sociology: Subject = {
  id: '128', code: 'SCC 1', name: 'Sociology', category: 'major',
  departmentId: 1, programId: 8, teachingDepartmentId: 1, teachingProgramId: 8,
  units: 3, lectureHours: 3, labHours: 0, semester: '1st', yearLevel: 1,
  roomTypeRequired: 'lecture', status: 'active',
};
const bas = { departmentId: 1, programId: 8 };
const bscd = { departmentId: 1, programId: 9 };

describe('instructor assignment offering scope', () => {
  it.each([8, null])('routes a BSCD class taught by Sociology to cross-department when course owner is %s', (programId) => {
    const subject = { ...sociology, programId };
    expect(isIncomingInstructorAssignment(subject, bscd, 1, 8)).toBe(true);
    expect(isLocalInstructorAssignment(subject, bscd, 1, 8)).toBe(false);
    expect(isLocalInstructorAssignment(subject, bscd, 1, null)).toBe(false);
  });

  it('keeps Sociology own sections local and supports a major taught by its owning program', () => {
    const subject = { ...sociology, teachingDepartmentId: null, teachingProgramId: null };
    expect(isLocalInstructorAssignment(subject, bas, 1, 8)).toBe(true);
    expect(isIncomingInstructorAssignment(subject, bas, 1, 8)).toBe(false);
    expect(isIncomingInstructorAssignment(subject, bscd, 1, 8)).toBe(true);
  });

  it('does not expose a BSCD course to the Sociology head', () => {
    const subject = { ...sociology, programId: 9, teachingProgramId: 9 };
    expect(isIncomingInstructorAssignment(subject, bscd, 1, 8)).toBe(false);
    expect(isLocalInstructorAssignment(subject, bscd, 1, 8)).toBe(false);
  });

  it('retains external-department and legacy sibling handoffs', () => {
    expect(isIncomingInstructorAssignment(sociology, { departmentId: 2, programId: 20 }, 1, 8)).toBe(true);
    expect(isIncomingInstructorAssignment({ ...sociology, programId: 9 }, { departmentId: 1 }, 1, 8)).toBe(true);
  });

  it('keeps department-wide minors local without inventing a teaching program', () => {
    const subject = { ...sociology, category: 'minor' as const, teachingProgramId: null };
    expect(isIncomingInstructorAssignment(subject, bscd, 1)).toBe(false);
    expect(isLocalInstructorAssignment(subject, bscd, 1, null)).toBe(true);
    expect(isLocalInstructorAssignment({ ...subject, teachingDepartmentId: null, departmentId: 2 }, bas, 1, 8)).toBe(true);
  });

  it('follows a returned class current section-level teaching program', () => {
    const subject = subjectForSchedule(sociology, {
      delegationReturnedFromDepartmentId: 1, sectionTeachingDepartmentId: 1, sectionTeachingProgramId: 9,
    });
    expect(isIncomingInstructorAssignment(subject, bscd, 1, 8)).toBe(false);
    expect(isIncomingInstructorAssignment(subject, bscd, 1, 9)).toBe(false);
    expect(isLocalInstructorAssignment(subject, bscd, 1, 9)).toBe(true);
  });
});
