import { describe, expect, it } from "vitest";

import { buildPrintTermTitle } from "./PrintSchedule";

describe("buildPrintTermTitle", () => {
  it("uses the scheduler active term in the print heading", () => {
    expect(buildPrintTermTitle({
      id: 7,
      academic_year: "2026-2027",
      semester: "1st",
      is_active: true,
    })).toBe("CLASS SCHEDULE AY 2026-2027    1st Semester");
  });

  it("supports the summer term label", () => {
    expect(buildPrintTermTitle({
      id: 8,
      academic_year: "2026-2027",
      semester: "summer",
      is_active: true,
    })).toBe("CLASS SCHEDULE AY 2026-2027    Summer");
  });
});
