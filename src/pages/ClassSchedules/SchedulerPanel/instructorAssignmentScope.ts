import { majorTeachingDepartmentId, requiredTeachingProgramId } from './facultyEligibility';
import type { Subject } from './types';

type TeachingSubject = Pick<Subject, 'category' | 'departmentId' | 'programId' | 'teachingDepartmentId' | 'teachingProgramId'>;

interface OfferingScope {
  departmentId: number;
  /** Program of the section receiving the class, independent of course ownership. */
  programId?: number | null;
}

/** Call with the effective per-class subject, after applying any returned-section assignment. */
export const isIncomingInstructorAssignment = (
  subject: TeachingSubject | undefined,
  offering: OfferingScope,
  receivingDepartmentId: number | null,
  receivingProgramId: number | null = null,
): boolean => {
  if (!subject || receivingDepartmentId === null) return false;
  const teachingDepartmentId = subject.category === 'major'
    ? majorTeachingDepartmentId(subject, offering.departmentId)
    : subject.teachingDepartmentId ?? offering.departmentId;
  const teachingProgramId = requiredTeachingProgramId(subject);
  if (Number(teachingDepartmentId) !== Number(receivingDepartmentId)
    || (receivingProgramId !== null && teachingProgramId !== null
      && Number(teachingProgramId) !== Number(receivingProgramId))) return false;
  if (Number(offering.departmentId) !== Number(receivingDepartmentId)) return true;

  // Older payloads without section ownership retain the previous course-owner comparison.
  const offeringProgramId = offering.programId ?? subject.programId;
  return teachingProgramId !== null
    && Number(teachingProgramId) !== Number(offeringProgramId ?? 0);
};

/** The local Assign Instructors list contains only the user's own offering sections. */
export const isLocalInstructorAssignment = (
  subject: TeachingSubject | undefined,
  offering: OfferingScope,
  departmentId: number | null,
  programId: number | null,
): boolean => {
  if (!subject || departmentId === null || Number(offering.departmentId) !== Number(departmentId)) return false;
  if (programId !== null && Number(offering.programId) !== Number(programId)) return false;
  const teachingDepartmentId = subject.category === 'major'
    ? majorTeachingDepartmentId(subject, offering.departmentId)
    : subject.teachingDepartmentId ?? offering.departmentId;
  return Number(teachingDepartmentId) === Number(departmentId)
    && !isIncomingInstructorAssignment(subject, offering, departmentId);
};
