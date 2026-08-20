import type { Faculty, Subject } from "./types";

/**
 * Client-side mirror of the rule engine's instructor-eligibility rules
 * (`major_faculty_department_alignment`, `major_faculty_program_alignment`,
 * `service_subject_faculty_department_alignment`, `faculty_department_alignment`).
 *
 * The pickers filter with this so they never offer an instructor the save would
 * refuse. It is a convenience, not the enforcement — the server decides.
 */
export interface FacultyEligibility {
  eligible: boolean;
  /** Why the instructor is ineligible, phrased for display. Null when eligible. */
  reason: string | null;
}

const ELIGIBLE: FacultyEligibility = { eligible: true, reason: null };

export const isMajorSubject = (subject?: Subject | null): boolean =>
  (subject?.category ?? "major") === "major";

/** The department whose instructors may teach a major. */
export const majorTeachingDepartmentId = (
  subject: Subject | null | undefined,
  scheduleDepartmentId: number | null
): number | null => subject?.departmentId ?? scheduleDepartmentId;

/** The program an instructor must belong to, or null when the course has none. */
export const requiredTeachingProgramId = (subject?: Subject | null): number | null =>
  isMajorSubject(subject) ? subject?.programId ?? null : null;

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
        reason: subject?.programCode
          ? `Not in the ${subject.programCode} program`
          : "Not in this major's program"
      };
    }

    return ELIGIBLE;
  }

  // A minor or service course is only tied to a department when the VPAA assigned
  // one. Otherwise it is open to every department — shared minors are taught by
  // external instructors, so the section's department is not a restriction here.
  const assignedTeachingDepartmentId = subject?.teachingDepartmentId ?? null;

  if (
    assignedTeachingDepartmentId !== null
    && Number(facultyDepartmentId) !== Number(assignedTeachingDepartmentId)
  ) {
    return { eligible: false, reason: "Outside the assigned teaching department" };
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
