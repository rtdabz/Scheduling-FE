import { describe, expect, it } from "vitest";

import { buildPrintSemesterTitle } from "./printScheduleFormat";

describe("buildPrintSemesterTitle", () => {
  it("uses the scheduler active semester in the print heading", () => {
    expect(buildPrintSemesterTitle({
      id: 7,
      academic_year: "2026-2027",
      semester: "1st",
      is_active: true,
    })).toBe("CLASS SCHEDULE AY 2026-2027    1st Semester");
  });

  it("supports the summer semester label", () => {
    expect(buildPrintSemesterTitle({
      id: 8,
      academic_year: "2026-2027",
      semester: "summer",
      is_active: true,
    })).toBe("CLASS SCHEDULE AY 2026-2027    Summer");
  });
});
