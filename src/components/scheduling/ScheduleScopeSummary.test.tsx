import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleScopeSummary, { type ScopeStats } from "./ScheduleScopeSummary";

const stats = (overrides: Partial<ScopeStats> = {}): ScopeStats => ({
  sectionsScheduled: 1,
  sectionsTotal: 12,
  classes: 6,
  meetings: 18,
  unassignedFaculty: 10,
  unassignedRooms: 0,
  conflicts: { faculty: 2, room: 1, section: 0, total: 3 },
  ...overrides,
});

describe("ScheduleScopeSummary", () => {
  afterEach(cleanup);

  it("states problem counts against meetings, not against classes", () => {
    render(<ScheduleScopeSummary scopeLabel="CIT" level="department" stats={stats()} isLoading={false} focus={null} onFocusChange={vi.fn()} />);

    expect(screen.getByText("of 18 meetings have no instructor")).toBeTruthy();
    expect(screen.getByText("6 classes · 18 weekly meetings")).toBeTruthy();
    expect(screen.getByText("meetings clash (2 faculty · 1 room)")).toBeTruthy();
  });

  it("filters on click and clears on a second click", () => {
    const onFocusChange = vi.fn();
    const { rerender } = render(
      <ScheduleScopeSummary scopeLabel="CIT" level="department" stats={stats()} isLoading={false} focus={null} onFocusChange={onFocusChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Conflicts/ }));
    expect(onFocusChange).toHaveBeenLastCalledWith("conflicts");

    rerender(<ScheduleScopeSummary scopeLabel="CIT" level="department" stats={stats()} isLoading={false} focus="conflicts" onFocusChange={onFocusChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Conflicts/ }));
    expect(onFocusChange).toHaveBeenLastCalledWith(null);
  });

  it("renders a zero figure as an all-clear message with nothing to click", () => {
    render(<ScheduleScopeSummary scopeLabel="CIT" level="department" stats={stats()} isLoading={false} focus={null} onFocusChange={vi.fn()} />);

    expect(screen.getByText("Every on-site meeting has a room")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Missing room/ })).toBeNull();
  });
});
