import { describe, expect, it } from "vitest";
import type { Course } from "./types";
import {
  isBalancedSplitSchedulingEligible,
  isConfiguredFieldCourse,
  isHybridSplitEligible,
  isHybridSchedulingEligible,
  isOnlineSplitEligible,
  savedMeetingPairShape,
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

    it("offers a split for a major carrying laboratory units, laboratory-only included", () => {
      const settings = { minorEnabled: true, majorLectureEnabled: true };
      expect(isBalancedSplitSchedulingEligible(labMajor, settings)).toBe(true);
      expect(isBalancedSplitSchedulingEligible({ ...labMajor, lectureHours: 0, labHours: 3, units: 3 }, settings)).toBe(true);
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

  describe("savedMeetingPairShape", () => {
    const lectureOnly = { lectureHours: 3, labHours: 0 };
    const lectureAndLab = { lectureHours: 2, labHours: 1 };

    it("reads a generated split (days:x-y, hybrid or not) as Split Session", () => {
      expect(savedMeetingPairShape(lectureOnly, 2, true, "days:1-3")).toEqual({ isIntegrated: false, isSplit: true });
      expect(savedMeetingPairShape(lectureOnly, 2, false, "days:0-2")).toEqual({ isIntegrated: false, isSplit: true });
      expect(savedMeetingPairShape(lectureOnly, 2, false, "TTh")).toEqual({ isIntegrated: false, isSplit: true });
    });

    it("reads a lecture-plus-laboratory pair as Integrated unless it uses a named split pattern", () => {
      expect(savedMeetingPairShape(lectureAndLab, 2, true, "days:1-3")).toEqual({ isIntegrated: true, isSplit: false });
      expect(savedMeetingPairShape(lectureAndLab, 2, false, "days:1-4")).toEqual({ isIntegrated: true, isSplit: false });
      expect(savedMeetingPairShape(lectureAndLab, 2, false, "MW")).toEqual({ isIntegrated: false, isSplit: true });
    });

    it("reads a lecture-plus-laboratory pair without a lecture and a laboratory meeting as a Split", () => {
      expect(savedMeetingPairShape(lectureAndLab, 2, false, "days:1-3", [null, null])).toEqual({ isIntegrated: false, isSplit: true });
      expect(savedMeetingPairShape(lectureAndLab, 2, false, "days:1-3", ["laboratory", "lecture"])).toEqual({ isIntegrated: true, isSplit: false });
    });

    it("leaves a single meeting as neither", () => {
      expect(savedMeetingPairShape(lectureOnly, 1, false, null)).toEqual({ isIntegrated: false, isSplit: false });
    });
  });
});
