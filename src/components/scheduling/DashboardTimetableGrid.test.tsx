import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardTimetableGrid, { type DashboardSchedule } from "./DashboardTimetableGrid";
import { resetTimeGrid } from "../../lib/timeGrid";

// The grid plots today only, so pin the clock. 2026-09-14 is a Monday.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 14, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  resetTimeGrid();
});

const schedule = (id: number, status: string): DashboardSchedule => ({
  id,
  status,
  day: "Monday",
  start_time: "08:00",
  end_time: "09:30",
  mode: "on-site",
  course: { course_code: `CS${id}` },
  room: { room_code: "R101", room_type: "lecture" },
});

const renderGrid = (schedules: DashboardSchedule[]) =>
  render(
    <DashboardTimetableGrid
      schedules={schedules}
      sectionLabel="1 Section"
      onOpenSchedule={() => {}}
    />,
  );

describe("DashboardTimetableGrid", () => {
  // VPAA approval writes 'faculty_assignment', not 'approved'; instructor
  // reassignment and term lock-in move the row on to 'reassignment' and
  // 'finalized'. All four are published and must reach the grid.
  it.each(["approved", "faculty_assignment", "reassignment", "finalized"])(
    "plots a %s class",
    (status) => {
      renderGrid([schedule(1, status)]);
      expect(screen.queryByText("CS1")).not.toBeNull();
    },
  );

  it.each(["draft", "completed", "submitted", "approved_by_dean", "conditionally_approved", "revision", "rejected_by_dean"])(
    "withholds a %s class",
    (status) => {
      renderGrid([schedule(2, status)]);
      expect(screen.queryByText("CS2")).toBeNull();
    },
  );

  it("keeps a published class off a day that is not today", () => {
    renderGrid([{ ...schedule(3, "faculty_assignment"), day: "Saturday" }]);
    expect(screen.queryByText("CS3")).toBeNull();
  });
});
