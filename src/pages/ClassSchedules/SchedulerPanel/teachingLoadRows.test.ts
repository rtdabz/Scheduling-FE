import { describe, expect, it } from "vitest";
import { buildLoadLines } from "./teachingLoadRows";
import type { ScheduleItem } from "./types";

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

    expect(line.times).toEqual(["7:00 AM\u20139:00 AM"]);
  });

  it("keeps the meridiem on both ends when the range crosses noon", () => {
    const [line] = buildLoadLines([meeting({ startTime: "10:00", endTime: "13:00" })]);

    expect(line.times).toEqual(["10:00 AM\u20131:00 PM"]);
  });

  it("gives a split day one line per meeting time, in day order", () => {
    const [line] = buildLoadLines([
      meeting({ id: "2", day: "thursday", dayIndex: 3, startTime: "07:00", endTime: "09:00" }),
      meeting({ id: "1", day: "monday", dayIndex: 0, startTime: "07:00", endTime: "10:00" }),
    ]);

    expect(line.day).toBe("MTh");
    expect(line.times).toEqual(["7:00 AM\u201310:00 AM", "7:00 AM\u20139:00 AM"]);
  });

  it("collapses the repeated range when a split day keeps one time", () => {
    const [line] = buildLoadLines([
      meeting({ id: "1", day: "tuesday", dayIndex: 1 }),
      meeting({ id: "2", day: "friday", dayIndex: 4 }),
    ]);

    expect(line.day).toBe("TF");
    expect(line.times).toEqual(["7:00 AM\u20139:00 AM"]);
  });

  it("leaves the day codes alone for the other split pairings", () => {
    const [line] = buildLoadLines([
      meeting({ id: "1", day: "tuesday", dayIndex: 1, startTime: "09:00", endTime: "11:00" }),
      meeting({ id: "2", day: "thursday", dayIndex: 3, startTime: "10:00", endTime: "13:00" }),
    ]);

    expect(line.day).toBe("TTh");
    expect(line.times).toEqual(["9:00 AM\u201311:00 AM", "10:00 AM\u20131:00 PM"]);
  });
});
