import { describe, expect, it } from "vitest";
import type { ScheduleItem, Section } from "../types";
import {
  canGenerateYearLevel,
  YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE,
} from "./yearLevelGenerationEligibility";

const sections = ["1", "2", "3"].map((id, index): Section => ({
  id,
  name: `IT 1${String.fromCharCode(65 + index)}`,
  yearLevel: 1,
  semester: "1st",
  departmentId: 10,
  semesterId: 20,
  status: "active",
}));

const schedule = (sectionId: string, status: ScheduleItem["status"]): ScheduleItem => ({
  id: `${sectionId}-${status}`,
  semesterId: 20,
  departmentId: 10,
  courseId: "100",
  courseCode: "IT 101",
  courseName: "Introduction to Computing",
  courseType: "major",
  lectureUnits: 3,
  laboratoryUnits: 0,
  totalUnits: 3,
  sectionName: `IT 1${sectionId}`,
  roomName: "IT 101",
  day: "Monday",
  startTime: "07:00",
  endTime: "10:00",
  mode: "on-site",
  facultyName: null,
  facultyId: null,
  status,
  dayIndex: 0,
  startSlot: 0,
  durationSlots: 6,
  sectionId,
  roomId: "1",
});

describe("year-level generation eligibility", () => {
  it("allows a year level that has not been plotted", () => {
    expect(canGenerateYearLevel(sections, [], 20)).toBe(true);
  });

  it.each(["draft", "completed"] as const)("allows regeneration while schedules are still %s", (status) => {
    expect(canGenerateYearLevel(sections, sections.map((section) => schedule(section.id, status)), 20)).toBe(true);
  });

  it("allows a partially plotted year level while all existing rows remain in plotting", () => {
    expect(canGenerateYearLevel(sections, [
      schedule("1", "draft"),
      schedule("2", "completed"),
    ], 20)).toBe(true);
  });

  it("blocks generation when only some sections are withdrawn", () => {
    expect(canGenerateYearLevel(sections, [
      schedule("1", "revision"),
      schedule("2", "finalized"),
      schedule("3", "finalized"),
    ], 20)).toBe(false);
  });

  it("allows regeneration when every section is withdrawn", () => {
    expect(canGenerateYearLevel(sections, sections.map((section) => schedule(section.id, "revision")), 20)).toBe(true);
  });

  it("does not treat mixed plotting and revision rows as a fully withdrawn year level", () => {
    expect(canGenerateYearLevel(sections, [
      schedule("1", "revision"),
      schedule("2", "draft"),
      schedule("3", "completed"),
    ], 20)).toBe(false);
  });

  it("blocks protected workflow stages", () => {
    expect(canGenerateYearLevel(sections, sections.map((section) => schedule(section.id, "submitted")), 20)).toBe(false);
  });

  it("uses the required blocked message", () => {
    expect(YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE).toBe(
      "Schedules for this year level have already been plotted. Generation is unavailable unless the entire year level is withdrawn.",
    );
  });
});
