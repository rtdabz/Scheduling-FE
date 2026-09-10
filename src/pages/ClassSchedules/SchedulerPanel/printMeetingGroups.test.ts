import { describe, expect, it } from "vitest";

import { groupPrintMeetings } from "./printScheduleFormat";
import type { ScheduleItem } from "./types";

const DAY_INDEXES: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
};

const meeting = (
  day: string,
  startTime: string,
  endTime: string,
  roomName = "IT 105",
): ScheduleItem =>
  ({
    id: `${day}-${startTime}-${roomName}`,
    courseId: "20",
    courseCode: "IT 105",
    courseName: "Data Structures",
    day,
    startTime,
    endTime,
    roomName,
    mode: "on-site",
    dayIndex: DAY_INDEXES[day] ?? 0,
    startSlot: Number(startTime.slice(0, 2)) * 2,
  }) as unknown as ScheduleItem;

// The print helper is handed the component's own formatters.
const time = (value: string) => value;
const fullDay = (value: string) => value;

describe("groupPrintMeetings", () => {
  it("prints one line for meetings that share a time and room", () => {
    const groups = groupPrintMeetings(
      [
        meeting("Monday", "14:30", "16:00"),
        meeting("Wednesday", "14:30", "16:00"),
      ],
      time,
      fullDay,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].dayLabel).toBe("MW");
    expect(groups[0].timeLabel).toBe("14:30 – 16:00");
    expect(groups[0].room).toBe("IT 105");
  });

  it("keeps a single meeting's full day name", () => {
    const groups = groupPrintMeetings(
      [meeting("Saturday", "07:00", "10:00")],
      time,
      fullDay,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].dayLabel).toBe("Saturday");
  });

  it("splits meetings that share a time but sit in different rooms", () => {
    const groups = groupPrintMeetings(
      [
        meeting("Monday", "14:30", "16:00", "IT 105"),
        meeting("Wednesday", "14:30", "16:00", "IT 201"),
      ],
      time,
      fullDay,
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.room)).toEqual(["IT 105", "IT 201"]);
    expect(groups.map((group) => group.dayLabel)).toEqual([
      "Monday",
      "Wednesday",
    ]);
  });

  it("splits meetings in the same room at different times", () => {
    const groups = groupPrintMeetings(
      [
        meeting("Monday", "07:00", "08:30"),
        meeting("Monday", "14:30", "16:00"),
      ],
      time,
      fullDay,
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.timeLabel)).toEqual([
      "07:00 – 08:30",
      "14:30 – 16:00",
    ]);
  });

  it("orders groups and their days by day then start time", () => {
    const groups = groupPrintMeetings(
      [
        meeting("Friday", "14:30", "16:00"),
        meeting("Monday", "14:30", "16:00"),
        meeting("Tuesday", "07:00", "08:30"),
      ],
      time,
      fullDay,
    );

    expect(groups.map((group) => group.dayLabel)).toEqual(["MF", "Tuesday"]);
    expect(groups[0].days).toEqual(["Monday", "Friday"]);
  });

  it("uses the delivery mode when a meeting has no room", () => {
    const online = {
      ...meeting("Monday", "14:30", "16:00", ""),
      mode: "online",
    } as unknown as ScheduleItem;

    expect(groupPrintMeetings([online], time, fullDay)[0].room).toBe("Online");
  });
});
