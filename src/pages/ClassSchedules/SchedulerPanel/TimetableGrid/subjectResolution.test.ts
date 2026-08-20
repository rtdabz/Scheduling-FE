import { describe, expect, it } from "vitest";
import {
  UNKNOWN_SUBJECT_CODE,
  buildSubjectIndex,
  placeholderSubject,
  resolveScheduleSubject,
} from "./subjectResolution";
import { getSubjectTotalSlots, type Subject } from "../types";

/**
 * Guards the fix for audit finding #12: the grid returned null for a schedule
 * whose course is absent from `subjects`, leaving a cell that looked empty but
 * still blocked placement and still generated conflicts.
 */

const subject = (id: string, code: string): Subject => ({
  id,
  code,
  name: `Course ${code}`,
  units: 3,
  lectureHours: 3,
  labHours: 0,
  category: "major",
  semester: "1st",
  departmentId: 2,
  yearLevel: 1,
  roomTypeRequired: "lecture",
  status: "active",
});

describe("buildSubjectIndex", () => {
  it("keys by string id so numeric and string ids both resolve", () => {
    const index = buildSubjectIndex([subject("7", "IT101")]);

    expect(index.get("7")?.code).toBe("IT101");
    expect(index.get(String(7))?.code).toBe("IT101");
  });
});

describe("resolveScheduleSubject", () => {
  it("returns the real course when it is present", () => {
    const index = buildSubjectIndex([subject("7", "IT101")]);
    const result = resolveScheduleSubject({ subjectId: "7" }, index);

    expect(result.isPlaceholder).toBe(false);
    expect(result.subject.code).toBe("IT101");
  });

  it("returns a placeholder instead of dropping an archived course", () => {
    const result = resolveScheduleSubject({ subjectId: "404" }, buildSubjectIndex([]));

    expect(result.isPlaceholder).toBe(true);
    expect(result.subject.code).toBe(UNKNOWN_SUBJECT_CODE);
    expect(result.subject.id).toBe("404");
    expect(result.subject.name).toContain("404");
  });

  it("resolves a numeric schedule id against string-keyed subjects", () => {
    const index = buildSubjectIndex([subject("7", "IT101")]);
    const result = resolveScheduleSubject({ subjectId: 7 as unknown as string }, index);

    expect(result.isPlaceholder).toBe(false);
  });
});

describe("placeholderSubject", () => {
  it("is inert: no hours, no units, inactive", () => {
    const placeholder = placeholderSubject("404");

    expect(placeholder.units).toBe(0);
    expect(placeholder.lectureHours).toBe(0);
    expect(placeholder.labHours).toBe(0);
    expect(placeholder.status).toBe("inactive");
    expect(getSubjectTotalSlots(placeholder)).toBe(0);
  });
});
