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
    expect(screen.getByText("to 8:30 PM")).toBeTruthy();
    expect(screen.queryByText("8:30 PM")).toBeNull();
  });

  it("labels the axis in 1.5-hour bands, in the 12-hour form the cards use", () => {
    render(<WeeklyTimetableGrid days={["Monday"]} />);

    const starts = ["7 AM", "8:30 AM", "10 AM", "11:30 AM", "1 PM", "2:30 PM", "4 PM", "5:30 PM", "7 PM"];
    starts.forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.queryByText("8 AM")).toBeNull();
    expect(screen.queryByText("12 PM")).toBeNull();
    expect(screen.queryByText("07:00")).toBeNull();
  });

  it("keeps bands anchored to the opening when the view starts mid-band", () => {
    render(<WeeklyTimetableGrid days={["Monday"]} startSlot={2} slotCount={4} />);

    // Slot 2 (8:00) is the tail of the 7:00 band; the next band starts at 8:30.
    expect(screen.getByText("8 AM")).toBeTruthy();
    expect(screen.getByText("8:30 AM")).toBeTruthy();
    expect(screen.getByText("to 10 AM")).toBeTruthy();
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
    // 90-minute bands from 06:00: the last one is 19:30-21:00.
    expect(screen.getByText("7:30 PM")).toBeTruthy();
    expect(screen.getByText("to 9 PM")).toBeTruthy();
    expect(gridRoot().style.gridTemplateRows).toBe(
      `${GRID_HEADER_HEIGHT_PX}px repeat(30, ${GRID_SLOT_HEIGHT_PX}px)`,
    );
  });
});
