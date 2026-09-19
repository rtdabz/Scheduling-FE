import { afterEach, describe, expect, it } from "vitest";
import { configureTimeGrid, resetTimeGrid } from "../../../../lib/timeGrid";
import {
  fieldPeriodOptions,
  fieldPeriodWarning,
  periodReachable,
  periodRunsPastFieldEnd,
} from "./generationTypes";

describe("field course periods", () => {
  afterEach(() => resetTimeGrid());

  it("flags only a period that runs past the 5:00 PM field end", () => {
    expect(periodRunsPastFieldEnd("evening")).toBe(true);
    expect(periodRunsPastFieldEnd("afternoon")).toBe(false);
    expect(periodRunsPastFieldEnd("morning")).toBe(false);
    expect(periodRunsPastFieldEnd("flexible")).toBe(false);
    expect(periodRunsPastFieldEnd(undefined)).toBe(false);
    expect(fieldPeriodOptions()).toEqual(["morning", "afternoon"]);
  });

  it("names the field end and the periods Configure offers", () => {
    expect(fieldPeriodWarning()).toBe(
      "Warning: Field Courses cannot be scheduled beyond 5:00 PM. You can change this course’s preference to Morning or Afternoon in Configure.",
    );
  });

  it("keeps the Evening only while the course can reach 8:30 PM", () => {
    expect(periodReachable("evening", false)).toBe(true);
    expect(periodReachable("evening", true)).toBe(false);
    expect(periodReachable("afternoon", true)).toBe(true);

    // A campus closing at 7:00 PM never reaches the Evening's 8:30 PM end.
    configureTimeGrid({ opening_time: "07:00", closing_time: "19:00", field_end_time: "17:00" });
    expect(periodReachable("evening", false)).toBe(false);
    expect(periodReachable("afternoon", false)).toBe(true);
  });

  it("follows the VPAA's field end time", () => {
    configureTimeGrid({ opening_time: "07:00", closing_time: "20:30", field_end_time: "15:00" });

    expect(periodRunsPastFieldEnd("afternoon")).toBe(true);
    expect(fieldPeriodOptions()).toEqual(["morning"]);
    expect(fieldPeriodWarning()).toContain("beyond 3:00 PM");
  });
});
