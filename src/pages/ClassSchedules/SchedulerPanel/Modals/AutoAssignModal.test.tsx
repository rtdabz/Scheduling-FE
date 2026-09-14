import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutoAssignModal from "./AutoAssignModal";
import type { Faculty, ScheduleItem, Subject } from "../types";

const confirm = vi.fn();

vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({ confirm }),
}));

const subject = {
  id: "c1",
  code: "IT 101",
  name: "Introduction to Computing",
  yearLevel: 1,
  category: "minor",
} as unknown as Subject;

const schedule = {
  id: "s1",
  courseId: "c1",
  courseCode: "IT 101",
  courseName: "Introduction to Computing",
  sectionId: "sec1",
  sectionName: "BSIT 1A",
  departmentId: 6,
  day: "monday",
  dayIndex: 0,
  startTime: "07:00",
  endTime: "10:00",
  startSlot: 0,
  durationSlots: 6,
  mode: "on-site",
  status: "faculty_assignment",
  facultyId: null,
  totalUnits: 3,
} as unknown as ScheduleItem;

const faculty = {
  id: "f1",
  name: "Juan Dela Cruz",
  departmentId: 6,
  status: "active",
  employmentType: "full-time",
  requiredUnits: 21,
  overloadUnits: 6,
  probonoUnits: 3,
} as unknown as Faculty;

const renderModal = () =>
  render(
    <AutoAssignModal
      isOpen
      onClose={vi.fn()}
      schedules={[schedule]}
      subjects={[subject]}
      faculties={[faculty]}
      departmentId={6}
      facultyActionSlotId={null}
      canManageScheduleFaculty={() => true}
      checkFacultyConflict={() => "Juan Dela Cruz already teaches IT 102 on Monday 07:00-10:00."}
      onAssign={vi.fn().mockResolvedValue(true)}
    />,
  );

/** Picks the instructor, which is what makes the section's conflict show. */
const selectInstructor = () => {
  fireEvent.click(screen.getByRole("button", { name: /Juan Dela Cruz/ }));
};

describe("AutoAssignModal instructor conflict", () => {
  beforeEach(() => confirm.mockReset());
  afterEach(cleanup);

  it("offers an Assign button on a conflicting section and asks before selecting it", async () => {
    confirm.mockResolvedValue(true);
    renderModal();
    selectInstructor();

    fireEvent.click(screen.getByRole("button", { name: /Assign IT 101 BSIT 1A despite the conflict/ }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toMatchObject({
      title: "Instructor has a conflict",
      confirmLabel: "Assign anyway",
    });
    expect(confirm.mock.calls[0][0].message).toMatch(/already teaches IT 102/);
    expect(await screen.findByText("Conflict · confirmed")).toBeTruthy();
    expect(confirm.mock.calls[0][0].message).not.toMatch(/override/i);
  });

  it("leaves the section unselected when the override is declined", async () => {
    confirm.mockResolvedValue(false);
    renderModal();
    selectInstructor();

    fireEvent.click(screen.getByRole("button", { name: /Assign IT 101 BSIT 1A despite the conflict/ }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Conflict")).toBeTruthy();
    expect(screen.queryByText("Conflict · confirmed")).toBeNull();
  });

  it("asks the same question when the conflicting row itself is clicked", async () => {
    confirm.mockResolvedValue(false);
    renderModal();
    selectInstructor();

    fireEvent.click(screen.getByText("BSIT 1A"));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Conflict · confirmed")).toBeNull();
  });
  it("filters the instructor list by name as you type", () => {
    const other = { ...faculty, id: "f2", name: "Maria Santos" } as unknown as Faculty;
    render(
      <AutoAssignModal
        isOpen
        onClose={vi.fn()}
        schedules={[schedule]}
        subjects={[subject]}
        faculties={[faculty, other]}
        departmentId={6}
        facultyActionSlotId={null}
        canManageScheduleFaculty={() => true}
        checkFacultyConflict={() => null}
        onAssign={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search instructors to assign" }), { target: { value: "santos" } });
    expect(screen.queryByRole("button", { name: /Juan Dela Cruz/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Maria Santos/ })).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search instructors to assign" }), { target: { value: "nobody" } });
    expect(screen.getByText(/No instructor matches/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear instructor search" }));
    expect(screen.getByRole("button", { name: /Juan Dela Cruz/ })).toBeTruthy();
  });
});
