import { describe, expect, it } from "vitest";
import type { Course } from "./types";
import {
  isBalancedSplitSchedulingEligible,
  isConfiguredFieldCourse,
  isHybridSplitEligible,
  isHybridSchedulingEligible,
  isOnlineSplitEligible,
} from "./schedulingConfigurationEligibility";

const fieldCapableCourse: Course = {
  id: "1",
  code: "PATHFIT 1",
  name: "Physical Activity",
  units: 2,
  lectureHours: 1,
  labHours: 1,
  category: "major",
  semester: "1st",
  departmentId: 10,
  yearLevel: 1,
  roomTypeRequired: "lecture",
  status: "active",
};

describe("scheduling configuration eligibility", () => {
  it("recognizes configured field-course codes using normalized values", () => {
    expect(isConfiguredFieldCourse(fieldCapableCourse, new Set([" pathfit  1 "]))).toBe(true);
  });

  it("does not offer Hybrid for configured Field Courses", () => {
    expect(isHybridSchedulingEligible(fieldCapableCourse, true, new Set(["PATHFIT 1"]))).toBe(false);
  });

  it("does not offer Hybrid when the course explicitly requires a field room", () => {
    expect(
      isHybridSchedulingEligible(
        { ...fieldCapableCourse, roomTypeRequired: "field" },
        true,
      ),
    ).toBe(false);
  });

  describe("balanced split eligibility", () => {
    const minorCourse: Course = {
      ...fieldCapableCourse,
      category: "minor",
      lectureHours: 3,
      labHours: 0,
      units: 3,
    };
    const lectureOnlyMajor: Course = { ...minorCourse, category: "major" };
    const labMajor: Course = { ...lectureOnlyMajor, labHours: 1, units: 4 };

    it("offers a minor split regardless of retired department settings", () => {
      expect(
        isBalancedSplitSchedulingEligible(minorCourse, {
          minorEnabled: true,
          majorLectureEnabled: false,
        }),
      ).toBe(true);
      expect(
        isBalancedSplitSchedulingEligible(minorCourse, {
          minorEnabled: false,
          majorLectureEnabled: true,
        }),
      ).toBe(true);
    });

    it("offers a lecture-only major split regardless of retired department settings", () => {
      expect(
        isBalancedSplitSchedulingEligible(lectureOnlyMajor, {
          minorEnabled: false,
          majorLectureEnabled: true,
        }),
      ).toBe(true);
      expect(
        isBalancedSplitSchedulingEligible(lectureOnlyMajor, {
          minorEnabled: true,
          majorLectureEnabled: false,
        }),
      ).toBe(true);
    });

    it("never offers a split for a major carrying laboratory units", () => {
      expect(
        isBalancedSplitSchedulingEligible(labMajor, {
          minorEnabled: true,
          majorLectureEnabled: true,
        }),
      ).toBe(false);
    });

    it("only offers Hybrid Split for three-unit lecture-only courses", () => {
      expect(isHybridSplitEligible(minorCourse)).toBe(true);
      expect(isHybridSplitEligible({ ...minorCourse, labHours: 1 })).toBe(false);
      expect(isHybridSplitEligible({ ...minorCourse, lectureHours: 0 })).toBe(false);
    });

    it("offers Online Split for any lecture split, never a laboratory or field course", () => {
      expect(isOnlineSplitEligible(minorCourse)).toBe(true);
      expect(isOnlineSplitEligible(lectureOnlyMajor)).toBe(true);
      // Not tied to Hybrid Split's three units.
      expect(isOnlineSplitEligible({ ...minorCourse, units: 2 })).toBe(true);
      expect(isOnlineSplitEligible(labMajor)).toBe(false);
      expect(isOnlineSplitEligible({ ...minorCourse, labHours: 1 })).toBe(false);
      expect(isOnlineSplitEligible({ ...minorCourse, roomTypeRequired: "laboratory" })).toBe(false);
      expect(isOnlineSplitEligible({ ...minorCourse, roomTypeRequired: "field" })).toBe(false);
      expect(isOnlineSplitEligible(minorCourse, new Set(["PATHFIT 1"]))).toBe(false);
    });
  });
});
