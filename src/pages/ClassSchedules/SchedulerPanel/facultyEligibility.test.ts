import { describe, expect, it } from "vitest";
import {
  eligibleFacultiesForSubject,
  facultyEligibilityForSubject,
  requiredTeachingProgramId
} from "./facultyEligibility";
import type { Faculty, Subject } from "./types";

const subject = (overrides: Partial<Subject> = {}): Subject => ({
  id: "10",
  code: "IT 101",
  name: "Programming",
  units: 3,
  lectureHours: 3,
  labHours: 0,
  category: "major",
  semester: "1st",
  departmentId: 1,
  yearLevel: 1,
  roomTypeRequired: "lecture",
  status: "active",
  ...overrides
});

const faculty = (overrides: Partial<Faculty> = {}): Faculty => ({
  id: "5",
  name: "Own Instructor",
  departmentId: 1,
  status: "active",
  ...overrides
});

describe("facultyEligibilityForSubject", () => {
  it("accepts an instructor of the department that offers the major", () => {
    expect(facultyEligibilityForSubject(faculty(), subject(), 1).eligible).toBe(true);
  });

  it("refuses an instructor from another department", () => {
    const result = facultyEligibilityForSubject(faculty({ departmentId: 2 }), subject(), 1);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Outside the offering department");
  });

  it("refuses an instructor outside the major's program", () => {
    const result = facultyEligibilityForSubject(
      faculty({ programId: 8 }),
      subject({ programId: 7, programCode: "BSIT" }),
      1
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Not in the BSIT program");
  });

  it("refuses an instructor with no program when the major names one", () => {
    expect(
      facultyEligibilityForSubject(faculty(), subject({ programId: 7 }), 1).eligible
    ).toBe(false);
  });

  it("accepts an instructor of the major's own program", () => {
    expect(
      facultyEligibilityForSubject(faculty({ programId: 7 }), subject({ programId: 7 }), 1).eligible
    ).toBe(true);
  });

  it("ignores the program on a minor course", () => {
    expect(
      facultyEligibilityForSubject(
        faculty(),
        subject({ category: "minor", programId: 7, teachingDepartmentId: 1 }),
        1
      ).eligible
    ).toBe(true);
  });

  it("holds a service course to the college that teaches it", () => {
    const result = facultyEligibilityForSubject(
      faculty({ departmentId: 1 }),
      subject({ category: "minor", teachingDepartmentId: 3 }),
      1
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Outside the teaching college for this course");
  });

  it("lets any department teach a shared minor no college owns", () => {
    // PATH FIT and the like: no college teaches it, so external instructors are
    // eligible even though the section belongs elsewhere.
    expect(
      facultyEligibilityForSubject(
        faculty({ departmentId: 9 }),
        subject({ category: "minor", departmentId: null, teachingDepartmentId: null }),
        1
      ).eligible
    ).toBe(true);
  });

  it("follows a delegated course to the college it was assigned to", () => {
    // IT (department 1) owns GEC 101 and offers the section, but a secretary
    // assigned it to Arts and Sciences (3) — so CAS instructors teach it and IT's
    // own no longer may, which is the whole point of the override.
    const delegated = subject({
      code: "GEC 101",
      category: "minor",
      departmentId: 1,
      teachingDepartmentId: 3,
      teachingDepartmentCode: "CAS"
    });

    expect(facultyEligibilityForSubject(faculty({ departmentId: 3 }), delegated, 1).eligible).toBe(true);

    const owner = facultyEligibilityForSubject(faculty({ departmentId: 1 }), delegated, 1);
    expect(owner.eligible).toBe(false);
    expect(owner.reason).toBe("Outside the teaching college for this course");
  });

  it("refuses an inactive instructor of the delegated college", () => {
    expect(
      facultyEligibilityForSubject(
        faculty({ departmentId: 3, status: "inactive" }),
        subject({ code: "GEC 101", category: "minor", departmentId: 1, teachingDepartmentId: 3 }),
        1
      ).eligible
    ).toBe(false);
  });

  it("falls back to the schedule department when a major has none of its own", () => {
    expect(
      facultyEligibilityForSubject(faculty({ departmentId: 4 }), subject({ departmentId: null }), 4)
        .eligible
    ).toBe(true);
  });

  it("refuses an inactive instructor", () => {
    expect(facultyEligibilityForSubject(faculty({ status: "inactive" }), subject(), 1).eligible).toBe(
      false
    );
  });
});

describe("requiredTeachingProgramId", () => {
  it("is the program of a major", () => {
    expect(requiredTeachingProgramId(subject({ programId: 7 }))).toBe(7);
  });

  it("is null for a minor even when a program is set", () => {
    expect(requiredTeachingProgramId(subject({ category: "minor", programId: 7 }))).toBeNull();
  });
});

describe("eligibleFacultiesForSubject", () => {
  it("keeps only the instructors a save would accept", () => {
    const candidates = [
      faculty({ id: "1", programId: 7 }),
      faculty({ id: "2", programId: 8 }),
      faculty({ id: "3", departmentId: 2, programId: 7 })
    ];

    expect(
      eligibleFacultiesForSubject(candidates, subject({ programId: 7 }), 1).map((item) => item.id)
    ).toEqual(["1"]);
  });
});
