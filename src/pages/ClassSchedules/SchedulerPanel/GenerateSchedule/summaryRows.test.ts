import { describe, expect, it } from "vitest";
import { buildSummaryClasses, timeRangeLabel, type SummaryMeeting } from "./summaryRows";

const meeting = (overrides: Partial<SummaryMeeting>): SummaryMeeting => ({
  sectionId: "1",
  sectionName: "BSIT 1A",
  courseId: "10",
  courseCode: "GEC 1",
  courseName: "Understanding the Self",
  day: "Monday",
  start: "19:00",
  end: "20:30",
  mode: "on-site",
  room: "IT 105",
  meeting: "lecture",
  ...overrides,
});

describe("buildSummaryClasses", () => {
  it("keeps meetings taught by different instructors as separate parts and carries their ids", () => {
    const [gec] = buildSummaryClasses([
      meeting({ id: "1", day: "Monday", faculty: "Ana Cruz" }),
      meeting({ id: "2", day: "Wednesday", faculty: "Ana Cruz" }),
      meeting({ id: "3", day: "Friday", faculty: "Ben Reyes" }),
    ]);

    expect(gec.parts.map((part) => [part.dayLabel, part.faculty, part.ids])).toEqual([
      ["Mon/Wed", "Ana Cruz", ["1", "2"]],
      ["Friday", "Ben Reyes", ["3"]],
    ]);
  });

  it("folds a repeating meeting into one part with combined days", () => {
    const [gec] = buildSummaryClasses([
      meeting({ day: "Wednesday" }),
      meeting({ day: "Monday" }),
    ]);

    expect(gec.parts).toHaveLength(1);
    expect(gec.parts[0].dayLabel).toBe("Mon/Wed");
    expect(gec.meetingCount).toBe(2);
  });

  it("keeps differing meetings as separate parts, on-site before online", () => {
    const [it101] = buildSummaryClasses([
      meeting({ courseId: "11", courseCode: "IT 101", day: "Tuesday", start: "09:00", end: "11:00", mode: "online", room: "Online" }),
      meeting({ courseId: "11", courseCode: "IT 101", day: "Wednesday", start: "16:00", end: "19:00", room: "CompLab4", meeting: "laboratory" }),
    ]);

    expect(it101.parts.map((part) => part.dayLabel)).toEqual(["Wednesday", "Tuesday"]);
    expect(it101.parts.map((part) => part.room)).toEqual(["CompLab4", "Online"]);
    expect(it101.modes).toEqual(["on-site", "online"]);
  });

  it("keeps one row per section and course, ordered by first meeting in the week", () => {
    const classes = buildSummaryClasses([
      meeting({ courseId: "12", courseCode: "IT 102", day: "Thursday" }),
      meeting({ day: "Monday" }),
      meeting({ sectionId: "2", sectionName: "BSIT 1B", day: "Monday" }),
    ]);

    expect(classes.map((item) => `${item.sectionName} ${item.courseCode}`)).toEqual([
      "BSIT 1A GEC 1",
      "BSIT 1A IT 102",
      "BSIT 1B GEC 1",
    ]);
  });
});

describe("timeRangeLabel", () => {
  it("prints the suffix once when both ends share it", () => {
    expect(timeRangeLabel("19:00", "20:30")).toBe("7:00 - 8:30 PM");
  });

  it("prints both suffixes across noon", () => {
    expect(timeRangeLabel("10:00", "13:00")).toBe("10:00 AM - 1:00 PM");
  });
});
