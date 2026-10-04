import type { Faculty, Subject } from "./types";

export interface FacultyEligibility {
  eligible: boolean;
  reason: string | null;
}

const ELIGIBLE: FacultyEligibility = { eligible: true, reason: null };

export const isMajorSubject = (subject?: Subject | null): boolean =>
  (subject?.category ?? "major") === "major";

export const majorTeachingDepartmentId = (
  subject: Subject | null | undefined,
  scheduleDepartmentId: number | null
): number | null => subject?.teachingDepartmentId ?? subject?.departmentId ?? scheduleDepartmentId;

export const requiredTeachingProgramId = (subject?: Subject | null): number | null => {
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
