import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutoAssignModal from "./AutoAssignModal";
import type { Faculty, ScheduleItem, Subject } from "../types";

const confirm = vi.fn();
const toastError = vi.fn();

vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({ confirm, toast: { error: toastError } }),
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
} as unknown as Faculty;

const renderModal = (
  conflict: string | null = "Juan Dela Cruz already teaches IT 102 on Monday 07:00-10:00.",
  instructor: Faculty = faculty,
) =>
  render(
    <AutoAssignModal
      isOpen
      onClose={vi.fn()}
      schedules={[schedule]}
      subjects={[subject]}
      faculties={[instructor]}
      departmentId={6}
      facultyActionSlotId={null}
      canManageScheduleFaculty={() => true}
      checkFacultyConflict={() => conflict}
      onAssign={vi.fn().mockResolvedValue(true)}
    />,
  );

/** Picks the instructor, which is what makes the section's conflict show. */
const selectInstructor = () => {
  fireEvent.click(screen.getByRole("button", { name: /Juan Dela Cruz/ }));
};

describe("AutoAssignModal instructor conflict", () => {
  beforeEach(() => {
    confirm.mockReset();
    toastError.mockReset();
  });
  afterEach(cleanup);

  it("offers no way to assign a conflicting section", () => {
    renderModal();
    selectInstructor();

    expect(screen.getByText("Conflict")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /despite the conflict/ })).toBeNull();
  });

  it("does not select a conflicting row when it is clicked", () => {
    renderModal();
    selectInstructor();

    fireEvent.click(screen.getByText("BSIT 1A"));

    expect(confirm).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Add to list" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses a section that would push the instructor past the unit limit", async () => {
    renderModal(null, { ...faculty, requiredUnits: 1, overloadUnits: 1 } as Faculty);
    selectInstructor();

    fireEvent.click(screen.getByText("BSIT 1A"));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe("Unit limit reached");
    expect((screen.getByRole("button", { name: "Add to list" }) as HTMLButtonElement).disabled).toBe(true);
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
