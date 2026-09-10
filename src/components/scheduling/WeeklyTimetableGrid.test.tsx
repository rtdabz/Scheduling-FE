import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import WeeklyTimetableGrid, {
  GRID_HEADER_HEIGHT_PX,
  GRID_SLOT_HEIGHT_PX,
  GRID_TIME_COLUMN_WIDTH_PX,
} from "./WeeklyTimetableGrid";
import { configureTimeGrid, resetTimeGrid, slotCount } from "../../lib/timeGrid";

afterEach(() => {
  cleanup();
  resetTimeGrid();
});

const gridRoot = (): HTMLElement => {
  const root = document.querySelector(".timetable-grid-root");
  if (!(root instanceof HTMLElement)) throw new Error("grid root not rendered");

  return root;
};

describe("WeeklyTimetableGrid", () => {
  it("spans 7:00 AM to 8:30 PM with no props beyond the days", () => {
    render(<WeeklyTimetableGrid days={["Monday"]} />);

    // 27 half-hour rows: 07:00 opening through the 20:00-20:30 closing row.
    expect(slotCount()).toBe(27);
    expect(gridRoot().style.gridTemplateRows).toBe(
      `${GRID_HEADER_HEIGHT_PX}px repeat(27, ${GRID_SLOT_HEIGHT_PX}px)`,
    );
    expect(screen.getByText("7 AM")).toBeTruthy();
    expect(screen.getByText("8 PM")).toBeTruthy();
    expect(screen.queryByText("9 PM")).toBeNull();
  });

  it("labels the axis on the hour, in the 12-hour form the cards use", () => {
    render(<WeeklyTimetableGrid days={["Monday"]} />);

    // Labels span two 30-minute rows, so only whole hours are drawn.
    const labels = ["7 AM", "12 PM", "1 PM", "8 PM"];
    labels.forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.queryByText("7:30 AM")).toBeNull();
    expect(screen.queryByText("07:00")).toBeNull();
  });

  it("sizes the header row and the time gutter from the shared geometry", () => {
    render(<WeeklyTimetableGrid days={["Monday", "Tuesday"]} />);

    expect(gridRoot().style.gridTemplateColumns).toBe(
      `${GRID_TIME_COLUMN_WIDTH_PX}px repeat(2, minmax(0, 1fr))`,
    );
    expect(gridRoot().style.minHeight).toBe(
      `${GRID_HEADER_HEIGHT_PX + slotCount() * GRID_SLOT_HEIGHT_PX}px`,
    );
  });

  it("follows a reconfigured operating window rather than a hardcoded one", () => {
    configureTimeGrid({ opening_time: "06:00:00", closing_time: "21:00:00", slot_minutes: 30 });
    render(<WeeklyTimetableGrid days={["Monday"]} />);

    expect(slotCount()).toBe(30);
    expect(screen.getByText("6 AM")).toBeTruthy();
    // The axis labels whole hours, so the 20:30-21:00 closing row is unlabelled.
    expect(screen.getByText("8 PM")).toBeTruthy();
    expect(gridRoot().style.gridTemplateRows).toBe(
      `${GRID_HEADER_HEIGHT_PX}px repeat(30, ${GRID_SLOT_HEIGHT_PX}px)`,
    );
  });
});
