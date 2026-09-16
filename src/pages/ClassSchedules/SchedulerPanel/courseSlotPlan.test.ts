import { describe, expect, it } from "vitest";
import {
  SLOTS_PER_HOUR,
  SLOTS_PER_LABORATORY_UNIT,
  customLaboratoryDurationSlots,
  getCourseSlotPlan,
  laboratoryComponentSlots,
  slotsToHours,
} from "./courseSlotPlan";
import { getSubjectTotalSlots } from "./types";

/**
 * Guards the fix for audit finding #19 (and finding #3 of the split-hours audit):
 * the two server conventions are named separately, and the third formula — a
 * hardcoded 6 for any major with both components — is gone.
 */

describe("getCourseSlotPlan", () => {
  it("derives a single block from units, matching CspSolver::rawDurationSlots", () => {
    expect(getCourseSlotPlan({ units: 3, lectureHours: 3, labHours: 0 }).singleBlockSlots).toBe(6);
    expect(getCourseSlotPlan({ units: 5, lectureHours: 2, labHours: 1 }).singleBlockSlots).toBe(10);
  });

  it("derives split components from hours, matching CspSolver::buildVariables", () => {
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

describe("laboratoryComponentSlots", () => {
  const course = { units: 3, lectureHours: 2, labHours: 1 };

  it("uses three hours per laboratory unit when no custom duration is set", () => {
    expect(laboratoryComponentSlots(course, null)).toBe(6);
    expect(laboratoryComponentSlots(course, { custom_lab_duration_override_enabled: false, custom_lab_duration_5_hours_enabled: true })).toBe(6);
  });

  it("applies the presets in the server's precedence order", () => {
    expect(laboratoryComponentSlots(course, {
      custom_lab_duration_override_enabled: true,
      custom_lab_duration_6_hours_enabled: true,
      custom_lab_duration_5_hours_enabled: true,
    })).toBe(12);
    expect(laboratoryComponentSlots(course, { custom_lab_duration_override_enabled: true, custom_lab_duration_5_hours_enabled: true })).toBe(10);
    expect(laboratoryComponentSlots(course, {
      custom_lab_duration_override_enabled: true,
      custom_lab_duration_other_enabled: true,
      custom_lab_duration_minutes: 240,
    })).toBe(8);
  });

  it("ignores a custom minute count off the 30-minute grid", () => {
    expect(customLaboratoryDurationSlots({
      custom_lab_duration_override_enabled: true,
      custom_lab_duration_other_enabled: true,
      custom_lab_duration_minutes: 250,
    })).toBeNull();
  });
});
