import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ClassSummaryTable from "./ClassSummaryTable";
import type { SummaryClass, SummaryPart } from "../../pages/ClassSchedules/SchedulerPanel/GenerateSchedule/summaryRows";

const part = (overrides: Partial<SummaryPart>): SummaryPart => ({
  days: ["Monday"],
  dayLabel: "Monday",
  start: "07:00",
  end: "10:00",
  mode: "on-site",
  room: "CompLab4",
  meeting: "laboratory",
  faculty: "Unassigned",
  ids: [],
  ...overrides,
});

const klass = (parts: SummaryPart[]): SummaryClass => ({
  key: "1|10",
  sectionId: "1",
  sectionName: "BSIT 1A",
  courseId: "10",
  courseCode: "IT 101",
  courseName: "Introduction to Computing",
  parts,
  modes: Array.from(new Set(parts.map((item) => item.mode))),
  meetingCount: parts.length,
});

describe("ClassSummaryTable", () => {
  afterEach(cleanup);

  it("prints a faculty or room shared by every part once", () => {
    render(
      <ClassSummaryTable
        showFaculty
        classes={[klass([part({ dayLabel: "Tuesday", mode: "online", room: "Online" }), part({ dayLabel: "Wednesday", room: "Online" })])]}
      />,
    );

    expect(screen.getAllByText("Unassigned")).toHaveLength(1);
    expect(screen.getAllByText("Online")).toHaveLength(1);
  });

  it("keeps one line per part when the parts differ", () => {
    render(
      <ClassSummaryTable
        showFaculty
        classes={[klass([part({ faculty: "Ana Cruz", room: "CompLab4" }), part({ faculty: "Unassigned", room: "IT 105" })])]}
      />,
    );

    expect(screen.getByText("Ana Cruz")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getByText("CompLab4")).toBeTruthy();
    expect(screen.getByText("IT 105")).toBeTruthy();
  });
});
