import type { Faculty, Subject } from "./types";

export interface FacultyEligibility {
  eligible: boolean;
  reason: string | null;
}

const ELIGIBLE: FacultyEligibility = { eligible: true, reason: null };

/** The per-class teaching fields a schedule row carries. */
export interface ClassTeaching {
  delegationReturnedFromDepartmentId?: number | null;
  sectionTeachingDepartmentId?: number | null;
  sectionTeachingProgramId?: number | null;
}

/**
 * Whether a receiving department returned this class. A returned class is detached from the
 * course-level assignment for good and follows only its own section-level assignment.
 */
export const isDetachedClass = (schedule: ClassTeaching | null | undefined): boolean =>
  schedule?.delegationReturnedFromDepartmentId != null;

/**
 * The course as it applies to one class (mirrors SchedulingPolicy::courseForRow on the server):
 * a returned class takes its section-level assignment instead of the course-level one; with
 * none, its offering department teaches it.
 */
export const subjectForSchedule = <T extends Subject>(
  subject: T | null | undefined,
  schedule: ClassTeaching | null | undefined
): T | undefined => {
  if (!subject) return undefined;
  if (!isDetachedClass(schedule)) return subject;
  return {
    ...subject,
    teachingDepartmentId: schedule?.sectionTeachingDepartmentId ?? subject.ownTeachingDepartmentId ?? null,
    teachingProgramId: schedule?.sectionTeachingProgramId ?? null,
    // The course-level labels name another department; the generic label is used instead.
    teachingDepartmentCode: undefined,
    teachingDepartmentName: undefined,
  };
};

export const isMajorSubject = (subject?: Pick<Subject, 'category'> | null): boolean =>
  (subject?.category ?? "major") === "major";

export const majorTeachingDepartmentId = (
  subject: Pick<Subject, 'teachingDepartmentId' | 'departmentId'> | null | undefined,
  scheduleDepartmentId: number | null
): number | null => subject?.teachingDepartmentId ?? subject?.departmentId ?? scheduleDepartmentId;

export const requiredTeachingProgramId = (subject?: Pick<Subject, 'category' | 'teachingProgramId' | 'teachingDepartmentId' | 'programId'> | null): number | null => {
  if (subject?.teachingProgramId != null) return subject.teachingProgramId;
  if (subject?.teachingDepartmentId != null) return null;
  return isMajorSubject(subject) ? subject?.programId ?? null : null;
};

export const facultyEligibilityForSubject = (
  faculty: Faculty,
  subject: Subject | null | undefined,
  scheduleDepartmentId: number | null
): FacultyEligibility => {
  if (faculty.status === "inactive") {
    return { eligible: false, reason: "Inactive" };
  }

  const facultyDepartmentId = faculty.departmentId ?? null;

  if (isMajorSubject(subject)) {
    const offeringDepartmentId = majorTeachingDepartmentId(subject, scheduleDepartmentId);
    if (offeringDepartmentId !== null && Number(facultyDepartmentId) !== Number(offeringDepartmentId)) {
      return { eligible: false, reason: "Outside the offering department" };
    }

    const requiredProgramId = requiredTeachingProgramId(subject);
    if (requiredProgramId !== null && Number(faculty.programId ?? 0) !== Number(requiredProgramId)) {
      return {
        eligible: false,
        reason: subject?.teachingProgramId
          ? "Outside the teaching program for this course"
          : subject?.programCode
          ? `Not in the ${subject.programCode} program`
          : "Not in this major's program"
      };
    }

    return ELIGIBLE;
  }

  const assignedTeachingDepartmentId = subject?.teachingDepartmentId ?? null;

  if (
    assignedTeachingDepartmentId !== null
    && Number(facultyDepartmentId) !== Number(assignedTeachingDepartmentId)
  ) {
    return { eligible: false, reason: "Outside the teaching college for this course" };
  }

  const requiredProgramId = requiredTeachingProgramId(subject);
  if (requiredProgramId !== null && Number(faculty.programId ?? 0) !== Number(requiredProgramId)) {
    return { eligible: false, reason: "Outside the teaching program for this course" };
  }

  return ELIGIBLE;
};

export const eligibleFacultiesForSubject = (
  faculties: Faculty[],
  subject: Subject | null | undefined,
  scheduleDepartmentId: number | null
): Faculty[] => faculties.filter(
  (faculty) => facultyEligibilityForSubject(faculty, subject, scheduleDepartmentId).eligible
);
