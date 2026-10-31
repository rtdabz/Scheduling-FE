import { describe, expect, it } from "vitest";
import {
  consecutiveMeetingSlots,
  placeCourse,
  getCourseSlotPlan,
  laboratoryComponentSlots,
  slotsToHours,
} from "./courseSlotPlan";
import { getSubjectTotalSlots } from "./types";

/**
 * Scheduling follows each course's Total Hours as recorded, matching
 * SchedulingPolicy::courseDurationSlots on the server: lecture hours plus
 * laboratory hours, with no unit conversion.
 */

describe("getCourseSlotPlan", () => {
  it("reads a lecture-only course's hours as they are", () => {
    const plan = getCourseSlotPlan({ lectureHours: 3, labHours: 0 });

    expect(plan.lectureSlots).toBe(6);
    expect(plan.laboratorySlots).toBe(0);
    expect(plan.totalSlots).toBe(6);
    expect(plan.hasBothComponents).toBe(false);
  });

  it("reads a laboratory-only course's hours as they are", () => {
    const plan = getCourseSlotPlan({ lectureHours: 0, labHours: 8 });

    expect(plan.laboratorySlots).toBe(16);
    expect(plan.totalSlots).toBe(16);
    expect(plan.hasBothComponents).toBe(false);
  });

  it("adds a lecture and laboratory course's hours without converting either", () => {
    const plan = getCourseSlotPlan({ lectureHours: 2, labHours: 1 });

    expect(plan.lectureSlots).toBe(4);
    expect(plan.laboratorySlots).toBe(2);
    expect(plan.totalSlots).toBe(6);
    expect(plan.hasBothComponents).toBe(true);
  });

  it("gives no time to a missing course", () => {
    expect(getCourseSlotPlan(null).totalSlots).toBe(0);
    expect(getCourseSlotPlan(undefined).totalSlots).toBe(0);
  });
});

describe("placeCourse", () => {
  const course = {
    id: "8", code: "IT 105", name: "Computer Programming 2", units: 3, lectureHours: 2, labHours: 1,
    category: "major" as const, semester: "2nd" as const, departmentId: 6, yearLevel: 1 as const,
    roomTypeRequired: "laboratory" as const, status: "active" as const,
    classMinutesByCurriculum: { "19": { lecture: 120, laboratory: 180 } },
  };

  it("uses the minutes the section's curriculum recorded on import", () => {
    const plan = getCourseSlotPlan(placeCourse(course, 19));
    expect([plan.lectureSlots, plan.laboratorySlots, plan.totalSlots]).toEqual([4, 6, 10]);
  });

  it("keeps the course's own hours for a curriculum entered by hand, or no curriculum", () => {
    expect(getCourseSlotPlan(placeCourse(course, 1)).totalSlots).toBe(6);
    expect(getCourseSlotPlan(placeCourse(course, null)).totalSlots).toBe(6);
    // Re-placing in another curriculum drops the previous curriculum's minutes.
    expect(getCourseSlotPlan(placeCourse(placeCourse(course, 19), 1)).totalSlots).toBe(6);
  });
});

describe("consecutiveMeetingSlots", () => {
  it("shares the Total Hours equally across the days", () => {
    expect(consecutiveMeetingSlots({ lectureHours: 0, labHours: 8 }, 2)).toBe(8);
    expect(consecutiveMeetingSlots({ lectureHours: 3, labHours: 0 }, 3)).toBe(2);
  });

  it("refuses a day count that cannot split the hours into equal half-hour meetings", () => {
    expect(consecutiveMeetingSlots({ lectureHours: 0, labHours: 8 }, 3)).toBeNull();
    expect(consecutiveMeetingSlots({ lectureHours: 0, labHours: 0 }, 2)).toBeNull();
  });
});

describe("getSubjectTotalSlots", () => {
  it("reports the Total Hours as slots", () => {
    expect(getSubjectTotalSlots({ lectureHours: 3, labHours: 0 })).toBe(6);
    expect(getSubjectTotalSlots({ lectureHours: 2, labHours: 1 })).toBe(6);
    expect(getSubjectTotalSlots(null)).toBe(0);
  });

  it("follows the course's hours even when its units say otherwise", () => {
    const course = { units: 5, lectureHours: 2, labHours: 1 };
    expect(getSubjectTotalSlots(course)).toBe(6);
  });
});

describe("laboratoryComponentSlots", () => {
  it("is the laboratory hours", () => {
    expect(laboratoryComponentSlots({ lectureHours: 2, labHours: 1 })).toBe(2);
    expect(laboratoryComponentSlots({ lectureHours: 3, labHours: 2 })).toBe(4);
  });
});

describe("slotsToHours", () => {
  it("converts on the 30-minute grid", () => {
    expect(slotsToHours(6)).toBe(3);
    expect(slotsToHours(10)).toBe(5);
    expect(slotsToHours(1)).toBe(0.5);
  });
});
