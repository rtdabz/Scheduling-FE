import { describe, expect, it } from "vitest";
import {
  SLOTS_PER_HOUR,
  SLOTS_PER_LABORATORY_UNIT,
  getCourseSlotPlan,
  slotsToHours,
} from "./courseSlotPlan";
import { getSubjectTotalSlots } from "./types";

/**
 * Guards the fix for audit finding #19 (and finding #3 of the split-hours audit):
 * the two server conventions are named separately, and the third formula — a
 * hardcoded 6 for any major with both components — is gone.
 */

describe("getCourseSlotPlan", () => {
  it("derives a single block from units, matching CSPSolver::rawDurationSlots", () => {
    expect(getCourseSlotPlan({ units: 3, lectureHours: 3, labHours: 0 }).singleBlockSlots).toBe(6);
    expect(getCourseSlotPlan({ units: 5, lectureHours: 2, labHours: 1 }).singleBlockSlots).toBe(10);
  });

  it("derives split components from hours, matching CSPSolver::buildVariables", () => {
    const plan = getCourseSlotPlan({ units: 3, lectureHours: 2, labHours: 1 });

    expect(plan.lectureSlots).toBe(2 * SLOTS_PER_HOUR);
    expect(plan.laboratorySlots).toBe(1 * SLOTS_PER_LABORATORY_UNIT);
    expect(plan.splitTotalSlots).toBe(10);
    expect(plan.hasBothComponents).toBe(true);
  });

  it("keeps the two conventions distinct for the same course", () => {
    const plan = getCourseSlotPlan({ units: 3, lectureHours: 2, labHours: 1 });

    // 3 units is a 3-hour single block; the same course split is 5 hours.
    expect(plan.singleBlockSlots).toBe(6);
    expect(plan.splitTotalSlots).toBe(10);
  });

  it("does not claim both components when one is absent", () => {
    expect(getCourseSlotPlan({ units: 3, lectureHours: 3, labHours: 0 }).hasBothComponents).toBe(false);
    expect(getCourseSlotPlan({ units: 3, lectureHours: 0, labHours: 1 }).hasBothComponents).toBe(false);
  });

  it("defaults a course with no units to three, and no course to zero", () => {
    expect(getCourseSlotPlan({}).singleBlockSlots).toBe(6);
    expect(getCourseSlotPlan(null).singleBlockSlots).toBe(0);
    expect(getCourseSlotPlan(undefined).singleBlockSlots).toBe(0);
  });
});

describe("getSubjectTotalSlots", () => {
  it("still reports the single-block convention", () => {
    expect(getSubjectTotalSlots({ units: 3, lectureHours: 2, labHours: 1 })).toBe(6);
    expect(getSubjectTotalSlots({ units: 5, lectureHours: 2, labHours: 1 })).toBe(10);
    expect(getSubjectTotalSlots(null)).toBe(0);
  });
});

describe("slotsToHours", () => {
  it("converts on the 30-minute grid", () => {
    expect(slotsToHours(6)).toBe(3);
    expect(slotsToHours(10)).toBe(5);
    expect(slotsToHours(1)).toBe(0.5);
  });
});
