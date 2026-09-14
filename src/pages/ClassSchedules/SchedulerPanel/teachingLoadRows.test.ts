import { describe, expect, it } from "vitest";
import { buildLoadLines, classifyLoad } from "./teachingLoadRows";
import type { Faculty, ScheduleItem } from "./types";

/**
 * Guards the Time column of the Individual Faculty Load Sheet: one range per
 * meeting time, each on its own line, with the meridiem on both ends -- while
 * the Day column stays a single run of codes, split days included.
 */

const HALF_HOURS_PER_HOUR = 2;

/** A meeting of one course-and-section, with only the fields these lines read. */
const meeting = (overrides: Partial<ScheduleItem>): ScheduleItem =>
  ({
    id: "1",
    courseId: "c1",
    courseCode: "IT 101",
    courseName: "Introduction to Computing",
    sectionId: "s1",
    sectionName: "BSIT 1A",
    day: "monday",
    dayIndex: 0,
    startTime: "07:00",
    endTime: "09:00",
    startSlot: 0,
    durationSlots: 2 * HALF_HOURS_PER_HOUR,
    lectureUnits: 3,
    laboratoryUnits: 0,
    totalUnits: 3,
    ...overrides,
  }) as ScheduleItem;

describe("buildLoadLines", () => {
  it("writes the meridiem on both ends of a range", () => {
    const [line] = buildLoadLines([meeting({ startTime: "07:00", endTime: "09:00" })]);

    expect(line.times).toEqual(["7:00 AM \u2013 9:00 AM"]);
  });

  it("keeps the meridiem on both ends when the range crosses noon", () => {
    const [line] = buildLoadLines([meeting({ startTime: "10:00", endTime: "13:00" })]);

    expect(line.times).toEqual(["10:00 AM \u2013 1:00 PM"]);
  });

  it("gives a split day one line per meeting time, in day order", () => {
    const [line] = buildLoadLines([
      meeting({ id: "2", day: "thursday", dayIndex: 3, startTime: "07:00", endTime: "09:00" }),
      meeting({ id: "1", day: "monday", dayIndex: 0, startTime: "07:00", endTime: "10:00" }),
    ]);

    expect(line.day).toBe("MTh");
    expect(line.times).toEqual(["7:00 AM \u2013 10:00 AM", "7:00 AM \u2013 9:00 AM"]);
  });

  it("collapses the repeated range when a split day keeps one time", () => {
    const [line] = buildLoadLines([
      meeting({ id: "1", day: "tuesday", dayIndex: 1 }),
      meeting({ id: "2", day: "friday", dayIndex: 4 }),
    ]);

    expect(line.day).toBe("TF");
    expect(line.times).toEqual(["7:00 AM \u2013 9:00 AM"]);
  });

  it("leaves the day codes alone for the other split pairings", () => {
    const [line] = buildLoadLines([
      meeting({ id: "1", day: "tuesday", dayIndex: 1, startTime: "09:00", endTime: "11:00" }),
      meeting({ id: "2", day: "thursday", dayIndex: 3, startTime: "10:00", endTime: "13:00" }),
    ]);

    expect(line.day).toBe("TTh");
    expect(line.times).toEqual(["9:00 AM \u2013 11:00 AM", "10:00 AM \u2013 1:00 PM"]);
  });
});

describe("classifyLoad", () => {
  /** Six distinct 3-unit subjects, one per weekday slot, in a stable order. */
  const subjects = Array.from({ length: 6 }, (_, index) =>
    meeting({
      id: String(index + 1),
      courseId: `c${index + 1}`,
      courseCode: `IT 10${index + 1}`,
      dayIndex: index % 6,
      day: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][index % 6],
      totalUnits: 3,
    }),
  );
  const bandsOf = (lines: { band?: string }[]) => lines.map((line) => line.band);

  it("fills Basic up to the Basic Load, then Overload, then Pro Bono inside the Overload table", () => {
    const faculty = { id: "f1", name: "A Cruz", employmentType: "full-time", requiredUnits: 9, overloadUnits: 6, probonoUnits: 3 } as Faculty;
    const load = classifyLoad(faculty, subjects);

    expect(bandsOf(load.basic)).toEqual(["basic", "basic", "basic"]);
    expect(bandsOf(load.overload)).toEqual(["overload", "overload", "probono"]);
    expect(load.basicTotals.units).toBe(9);
    expect(load.overloadTotals.units).toBe(9);
  });

  it("lists everything under Overload for an overload-only instructor, part-time or not", () => {
    const overloadOnly = { id: "f2", name: "R Del Rosario", maxUnits: 0, deloadUnits: 0, overloadUnits: 15, probonoUnits: 0 };
    for (const employmentType of ["part-time", "full-time"] as const) {
      const load = classifyLoad({ ...overloadOnly, employmentType } as Faculty, subjects.slice(0, 2));
      expect(load.basic).toHaveLength(0);
      expect(bandsOf(load.overload)).toEqual(["overload", "overload"]);
    }
  });

  it("follows a part-timer's Basic Load instead of sending every subject to Overload", () => {
    const partTimer = { id: "f3", name: "K Awitin", employmentType: "part-time", maxUnits: 6, deloadUnits: 0, overloadUnits: 15 } as Faculty;
    const load = classifyLoad(partTimer, subjects.slice(0, 3));

    expect(bandsOf(load.basic)).toEqual(["basic", "basic"]);
    expect(bandsOf(load.overload)).toEqual(["overload"]);
  });

  it("lists anything past the overload allowance as pro bono, even with no pro bono granted", () => {
    const faculty = { id: "f4", name: "J Pada", employmentType: "full-time", requiredUnits: 3, overloadUnits: 3, probonoUnits: 0 } as Faculty;
    const load = classifyLoad(faculty, subjects.slice(0, 4));

    expect(bandsOf(load.overload)).toEqual(["overload", "probono", "probono"]);
  });
});
