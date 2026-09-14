import { describe, expect, it } from "vitest";
import { evaluatePlacementQuality, type PlacementQualityInput, type PlannedMeeting } from "./placementQuality";
import type { Room, ScheduleItem } from "./types";

// Default grid: slot 0 = 7:00 AM, one slot = 30 minutes, 27 slots a day.
// Day indexes: 0 = Monday ... 5 = Saturday, 6 = Sunday.

const scheduled = (overrides: Partial<ScheduleItem>): ScheduleItem => ({
  id: "s1",
  semesterId: 1,
  departmentId: 1,
  courseId: "90",
  courseCode: "IT 190",
  courseName: "Existing",
  courseType: "major",
  lectureUnits: 3,
  laboratoryUnits: 0,
  totalUnits: 3,
  sectionName: "BSIT 1A",
  roomName: "Room 1",
  day: "Monday",
  startTime: "7:00 AM",
  endTime: "10:00 AM",
  mode: "on-site",
  facultyName: null,
  facultyId: null,
  status: "draft",
  dayIndex: 0,
  startSlot: 0,
  durationSlots: 6,
  sectionId: "1",
  roomId: "r1",
  ...overrides,
});

const meeting = (overrides: Partial<PlannedMeeting> = {}): PlannedMeeting => ({
  dayIndex: 0,
  startSlot: 6,
  durationSlots: 6,
  mode: "on-site",
  roomId: "r1",
  meetingType: null,
  ...overrides,
});

const rooms: Room[] = [
  { id: "r1", name: "Room 1", departmentId: 1, roomType: "lecture", status: "available" },
  { id: "lab1", name: "Lab 1", departmentId: 1, roomType: "laboratory", status: "available" },
];

const evaluate = (overrides: Partial<PlacementQualityInput>) => evaluatePlacementQuality({
  meetings: [meeting()],
  sectionSchedules: [],
  allSchedules: [],
  rooms,
  sectionName: "BSIT 1A",
  isHybrid: false,
  isForcedDay: false,
  ...overrides,
});

const ids = (input: Partial<PlacementQualityInput>) => evaluate(input).map((note) => note.id);

describe("evaluatePlacementQuality", () => {
  it("has nothing to say about a compact weekday morning placement", () => {
    const existing = [scheduled({})];
    expect(ids({ sectionSchedules: existing, allSchedules: existing })).toEqual([]);
  });

  it("flags a break too short to hold another class", () => {
    const existing = [scheduled({})];
    expect(ids({ meetings: [meeting({ startSlot: 8 })], sectionSchedules: existing })).toContain("awkward_gap");
  });

  it("warns about a long idle gap for the section", () => {
    const existing = [scheduled({})];
    const notes = evaluate({ meetings: [meeting({ startSlot: 14 })], sectionSchedules: existing });
    expect(notes.find((note) => note.id === "idle_gap")?.message).toMatch(/idle for 4 hours on Monday/);
  });

  it("notes weekend days, but not for a Force Day placement", () => {
    expect(ids({ meetings: [meeting({ dayIndex: 5, startSlot: 0 })] })).toContain("weekend_day");
    expect(ids({ meetings: [meeting({ dayIndex: 5, startSlot: 0 })], isForcedDay: true })).not.toContain("weekend_day");
  });

  it("notes weekday classes starting after 1:00 PM", () => {
    expect(ids({ meetings: [meeting({ startSlot: 12 })] })).not.toContain("late_weekday_start");
    expect(ids({ meetings: [meeting({ startSlot: 13 })] })).toContain("late_weekday_start");
  });

  it("notes an extra class day only when the section's hours do not need it", () => {
    const monday = [scheduled({})];
    expect(ids({ meetings: [meeting({ dayIndex: 1, startSlot: 0 })], sectionSchedules: monday })).toContain("extra_day");

    const fullDays = [0, 1].map((dayIndex) => scheduled({ id: `full-${dayIndex}`, dayIndex, startSlot: 0, durationSlots: 26 }));
    expect(ids({ meetings: [meeting({ dayIndex: 2, startSlot: 0 })], sectionSchedules: fullDays })).not.toContain("extra_day");
  });

  it("suggests on-site delivery when a physical room is free, except for a Hybrid lecture", () => {
    expect(ids({ meetings: [meeting({ mode: "online", roomId: "online", startSlot: 0 })] })).toContain("online_with_free_room");
    expect(ids({
      meetings: [meeting({ mode: "online", roomId: "online", startSlot: 0, meetingType: "lecture" })],
      isHybrid: true,
    })).not.toContain("online_with_free_room");

    const busy = [scheduled({ id: "b1", sectionId: "2", roomId: "r1" }), scheduled({ id: "b2", sectionId: "3", roomId: "lab1" })];
    expect(ids({ meetings: [meeting({ mode: "online", roomId: "online", startSlot: 0 })], allSchedules: busy })).not.toContain("online_with_free_room");
  });

  it("warns about an unresolved or non-laboratory room for a laboratory meeting", () => {
    expect(ids({ meetings: [meeting({ meetingType: "laboratory", roomId: "tba", startSlot: 0 })] })).toContain("laboratory_room_unresolved");
    expect(ids({ meetings: [meeting({ meetingType: "laboratory", roomId: "r1", startSlot: 0 })] })).toContain("laboratory_room_mismatch");
    expect(ids({ meetings: [meeting({ meetingType: "laboratory", roomId: "lab1", startSlot: 0 })] })).toEqual([]);
  });
});
