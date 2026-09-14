import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssignmentWorklist, { meetingPatterns } from "./AssignmentWorklist";
import type { WorklistClass } from "./AssignmentWorklist";

// vitest runs without `globals`, so Testing Library never registers its own
// afterEach cleanup and renders would otherwise stack up across tests.
afterEach(cleanup);

const buildClass = (overrides: Partial<WorklistClass> = {}): WorklistClass => ({
  key: "1:10:100",
  scheduleId: 501,
  courseCode: "IT 101",
  courseName: "Intro to Programming",
  units: 3,
  sectionName: "BSIT 1A",
  facultyId: null,
  facultyName: null,
  locked: false,
  meetings: [
    { id: 1, day: "Monday", startTime: "8 AM", endTime: "9 AM", roomName: "NEE 201" },
    { id: 2, day: "Wednesday", startTime: "8 AM", endTime: "9 AM", roomName: "NEE 201" },
    { id: 3, day: "Friday", startTime: "8 AM", endTime: "9 AM", roomName: "NEE 201" },
  ],
  eligible: [
    { id: 9, name: "Rich Dadubo", conflict: null },
    { id: 10, name: "John Doe", conflict: "already scheduled" },
  ],
  restrictionNote: null,
  ...overrides,
});

describe("meetingPatterns", () => {
  it("folds the days of one class into a single pattern", () => {
    expect(meetingPatterns(buildClass().meetings)).toEqual(["MWF 8 AM - 9 AM"]);
  });

  it("orders days by the week, not by insertion", () => {
    const patterns = meetingPatterns([
      { id: 2, day: "Friday", startTime: "8 AM", endTime: "9 AM", roomName: "R" },
      { id: 1, day: "Monday", startTime: "8 AM", endTime: "9 AM", roomName: "R" },
    ]);
    expect(patterns).toEqual(["MF 8 AM - 9 AM"]);
  });

  it("keeps meetings at different times apart rather than folding them", () => {
    const patterns = meetingPatterns([
      { id: 1, day: "Tuesday", startTime: "8 AM", endTime: "9 AM", roomName: "R" },
      { id: 2, day: "Thursday", startTime: "1 PM", endTime: "2:30 PM", roomName: "R" },
    ]);
    expect(patterns).toEqual(["T 8 AM - 9 AM", "Th 1 PM - 2:30 PM"]);
  });
});

describe("AssignmentWorklist", () => {
  it("shows an MWF class as one row, not three", () => {
    render(
      <AssignmentWorklist
        classes={[buildClass()]}
        busyScheduleId={null}
        onAssign={vi.fn()}
        emptyMessage="nothing here"
      />,
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByText("MWF 8 AM - 9 AM")).toBeTruthy();
  });

  it("assigns straight from the row", () => {
    const onAssign = vi.fn();
    render(
      <AssignmentWorklist
        classes={[buildClass()]}
        busyScheduleId={null}
        onAssign={onAssign}
        emptyMessage="nothing here"
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9" } });
    expect(onAssign).toHaveBeenCalledWith(501, 9);
  });

  it("keeps a conflicting instructor selectable, so the assignment can be confirmed", () => {
    const onAssign = vi.fn();
    render(
      <AssignmentWorklist
        classes={[buildClass()]}
        busyScheduleId={null}
        onAssign={onAssign}
        emptyMessage="nothing here"
      />,
    );

    const conflicting = screen.getByRole("option", { name: /John Doe/ }) as HTMLOptionElement;
    expect(conflicting.disabled).toBe(false);
    expect(conflicting.textContent).toMatch(/— Conflict$/);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: conflicting.value } });
    expect(onAssign).toHaveBeenCalledWith(501, Number(conflicting.value));
  });

  it("sends null when the instructor is cleared", () => {
    const onAssign = vi.fn();
    render(
      <AssignmentWorklist
        classes={[buildClass({ facultyId: 9, facultyName: "Rich Dadubo" })]}
        busyScheduleId={null}
        onAssign={onAssign}
        emptyMessage="nothing here"
      />,
    );

    // The section is fully assigned, so it renders folded.
    fireEvent.click(screen.getByRole("button", { name: "Section BSIT 1A" }));
    fireEvent.click(screen.getByRole("button", { name: /^Remove instructor/ }));
    expect(onAssign).toHaveBeenCalledWith(501, null);
  });

  it("leaves a finished section folded and an unfinished one open", () => {
    render(
      <AssignmentWorklist
        classes={[
          buildClass({ key: "a", sectionName: "BSIT 1A", facultyId: 9, facultyName: "Rich Dadubo" }),
          buildClass({ key: "b", scheduleId: 502, sectionName: "BSIT 1B" }),
        ]}
        busyScheduleId={null}
        onAssign={vi.fn()}
        emptyMessage="nothing here"
      />,
    );

    expect(screen.getByRole("button", { name: "Section BSIT 1A" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Section BSIT 1B" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("locks the picker for a class that is already finalized", () => {
    render(
      <AssignmentWorklist
        classes={[buildClass({ locked: true, facultyId: 9, facultyName: "Rich Dadubo" })]}
        busyScheduleId={null}
        onAssign={vi.fn()}
        emptyMessage="nothing here"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Section BSIT 1A" }));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Rich Dadubo")).toBeTruthy();
  });

  it("explains an empty result instead of showing a blank panel", () => {
    render(
      <AssignmentWorklist
        classes={[]}
        busyScheduleId={null}
        onAssign={vi.fn()}
        emptyMessage="No class matches these filters."
      />,
    );

    expect(screen.getByText("No class matches these filters.")).toBeTruthy();
  });
});
