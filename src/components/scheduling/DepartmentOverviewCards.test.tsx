import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DepartmentOverviewCards from "./DepartmentOverviewCards";
import type { DepartmentOverview } from "../../hooks/useScheduleOverview";

const department = (overrides: Partial<DepartmentOverview> = {}): DepartmentOverview => ({
  department_id: 1,
  code: "CIT",
  name: "College of Information Technology",
  sections_total: 4,
  sections_scheduled: 4,
  classes: 20,
  meetings: 48,
  unassigned_faculty: 0,
  unassigned_rooms: 0,
  conflicts: { faculty: 0, room: 0, section: 0, total: 0 },
  status: "draft",
  sections: [],
  ...overrides,
});

describe("DepartmentOverviewCards", () => {
  // This suite runs without vitest globals, so RTL auto-cleanup is not wired
  // up and each render would otherwise leave its cards in the document.
  afterEach(cleanup);

  it("opens the department when the card itself is clicked", () => {
    const onOpen = vi.fn();
    render(<DepartmentOverviewCards departments={[department()]} isLoading={false} onOpen={onOpen} />);

    fireEvent.click(screen.getByText("CIT"));

    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("carries the reason for the click so the level below opens pre-filtered", () => {
    const onOpen = vi.fn();
    render(
      <DepartmentOverviewCards
        departments={[department({ conflicts: { faculty: 2, room: 1, section: 0, total: 3 }, unassigned_faculty: 7 })]}
        isLoading={false}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByText("3 conflicts"));
    expect(onOpen).toHaveBeenLastCalledWith(1, "conflicts");

    fireEvent.click(screen.getByText("7 no faculty"));
    expect(onOpen).toHaveBeenLastCalledWith(1, "missing-faculty");
  });

  it("does not offer a drill-down with nothing in it, and opens the department instead", () => {
    const onOpen = vi.fn();
    render(<DepartmentOverviewCards departments={[department()]} isLoading={false} onOpen={onOpen} />);

    const chip = screen.getByText("0 conflicts");
    expect(chip.closest("button")).toBeNull();

    fireEvent.click(chip);
    // The click falls through to the card rather than filtering to an empty list.
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("reports how much of the department is scheduled, not how big it is", () => {
    render(
      <DepartmentOverviewCards
        departments={[department({ sections_total: 10, sections_scheduled: 4 })]}
        isLoading={false}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText("4 / 10")).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
  });

  it("separates classes from the meeting rows they expand into", () => {
    render(
      <DepartmentOverviewCards
        departments={[department({ classes: 20, meetings: 48 })]}
        isLoading={false}
        onOpen={vi.fn()}
      />,
    );

    // The count is split across text nodes by the pluralisation, so assert on
    // the rendered line rather than on a single node.
    expect(document.body.textContent).toContain("20 classes");
    expect(document.body.textContent).toContain("48 meetings");
  });
});
