import { describe, expect, it } from "vitest";
import { getForcedDayConcentration } from "./forcedDayConcentration";

describe("forced-day concentration", () => {
  it("detects saved and pending courses assigned to the same day", () => {
    expect(getForcedDayConcentration(
      [{ course_id: 1, day: "Monday" }],
      [2, 3],
      "Monday",
    )).toEqual({ courseCount: 3, day: "Monday" });
  });

  it("does not warn when assignments use different days", () => {
    expect(getForcedDayConcentration(
      [{ course_id: 1, day: "Monday" }],
      [2],
      "Tuesday",
    )).toBeNull();
  });

  it("does not treat a single assigned course as concentrated", () => {
    expect(getForcedDayConcentration([], [1], "Monday")).toBeNull();
  });

  it("counts each course only once", () => {
    expect(getForcedDayConcentration(
      [
        { course_id: 1, day: "Friday" },
        { course_id: 1, day: "Friday" },
        { course_id: 2, day: "Friday" },
      ],
      [],
      "Friday",
    )).toEqual({ courseCount: 2, day: "Friday" });
  });
});
