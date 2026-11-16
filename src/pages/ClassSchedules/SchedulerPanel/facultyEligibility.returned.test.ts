import { describe, expect, it } from "vitest";
import { facultyEligibilityForSubject, isDetachedClass, subjectForSchedule } from "./facultyEligibility";
import type { Faculty, Subject } from "./types";

// GEC 101 offered by department 1 (program 10), handed as a course to department 2.
const delegated = {
  id: "7", code: "GEC 101", name: "Understanding the Self", units: 3, lectureHours: 3, labHours: 0,
  category: "minor", semester: "1st", departmentId: 1, teachingDepartmentId: 2, teachingProgramId: 20,
  ownTeachingDepartmentId: 1, yearLevel: 1, roomTypeRequired: "lecture", status: "active",
} as Subject;
const instructorOf = (departmentId: number, programId: number) =>
  ({ id: String(departmentId), name: "Instructor", departmentId, programId, status: "active" }) as unknown as Faculty;

describe("the teaching assignment of one class", () => {
  it("follows the course for a class that was never returned", () => {
    expect(isDetachedClass({ delegationReturnedFromDepartmentId: null })).toBe(false);
    expect(subjectForSchedule(delegated, { delegationReturnedFromDepartmentId: null })).toBe(delegated);
    expect(subjectForSchedule(delegated, undefined)).toBe(delegated);
  });

  it("goes back to the offering department once returned", () => {
    const own = subjectForSchedule(delegated, { delegationReturnedFromDepartmentId: 2 });
    expect(own?.teachingDepartmentId).toBe(1);
    expect(own?.teachingProgramId).toBeNull();
    expect(facultyEligibilityForSubject(instructorOf(1, 10), own, 1).eligible).toBe(true);
    expect(facultyEligibilityForSubject(instructorOf(1, 10), delegated, 1).eligible).toBe(false);
  });

  it("follows its own section-level assignment once handed on, whatever the course says", () => {
    const handed = subjectForSchedule(delegated, {
      delegationReturnedFromDepartmentId: 2, sectionTeachingDepartmentId: 3, sectionTeachingProgramId: null,
    });
    expect(handed?.teachingDepartmentId).toBe(3);
    expect(handed?.teachingProgramId).toBeNull();
    expect(facultyEligibilityForSubject(instructorOf(3, 30), handed, 1).eligible).toBe(true);
    expect(facultyEligibilityForSubject(instructorOf(2, 20), handed, 1).eligible).toBe(false);
  });
});
