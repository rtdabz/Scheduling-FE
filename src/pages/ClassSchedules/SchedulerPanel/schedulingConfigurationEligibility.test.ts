import { describe, expect, it } from "vitest";
import type { Course } from "./types";
import {
  isConfiguredFieldCourse,
  isHybridSchedulingEligible,
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
});
