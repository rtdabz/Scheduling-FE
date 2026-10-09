import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FacultyModal from "./FacultyModal";
import type { Faculty, ScheduleItem, Subject } from "../types";

afterEach(cleanup);

const subject = {
  id: "c1", code: "IT 101", name: "Computing", category: "major",
  units: 3, departmentId: 6, programId: 2,
} as Subject;
const schedule = {
  id: "s1", subjectId: "c1", semesterId: 1, sectionId: "sec1", sectionName: "IT 1A",
  departmentId: 6, day: "Monday", dayIndex: 0, startTime: "08:00", endTime: "11:00",
  startSlot: 2, durationSlots: 6, mode: "on-site", facultyId: null,
} as ScheduleItem;
const faculty = (id: string, name: string, departmentId = 6): Faculty => ({
  id, name, departmentId, programId: 2, status: "active", employmentType: "full-time",
} as Faculty);
const faculties = [faculty("busy", "Busy Teacher"), faculty("free", "Free Teacher"), faculty("outside", "Outside Teacher", 8)];

function Harness({ assigned = false, onAssign = vi.fn(), onRemove = vi.fn() }) {
  const [facultyId, setFacultyId] = useState(assigned ? "free" : "busy");
  return <FacultyModal
    facultyAssignmentPopup={{ scheduleId: "s1", facultyId }}
    facultyActionSlotId={null}
    schedules={[{ ...schedule, facultyId: assigned ? "free" : null }]}
    popupConflictWarning={facultyId === "busy" ? "Busy Teacher already teaches at this time." : ""}
    popupValidationError=""
    setFacultyAssignmentPopup={vi.fn()}
    handlePopupFacultyChange={setFacultyId}
    handleAssignFaculty={(event) => { event.preventDefault(); onAssign(facultyId); }}
    handleRemoveFaculty={onRemove}
    canManageScheduleFaculty={() => true}
    getFacultyRestrictionMessage={() => ""}
    checkFacultyConflict={(id) => id === "busy" ? "Already scheduled" : null}
    subjects={[subject]}
    faculties={faculties}
  />;
}

describe("FacultyModal after recommendation retirement", () => {
  it("keeps the clash refusal and directs users to manual selection", () => {
    render(<Harness />);
    expect((screen.getByRole("button", { name: "Assign Instructor" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Choose another instructor or move the class/)).toBeTruthy();
    expect(screen.queryByText("Free instructors")).toBeNull();
    expect(screen.queryByText(/Finding instructors/)).toBeNull();
    expect(screen.queryByText("Best match")).toBeNull();
  });

  it("lets users select an eligible instructor manually and save", () => {
    const onAssign = vi.fn();
    render(<Harness onAssign={onAssign} />);
    fireEvent.click(screen.getByRole("button", { name: /Busy Teacher/ }));
    expect(screen.queryByText("Outside Teacher")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Free Teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign Instructor" }));
    expect(onAssign).toHaveBeenCalledWith("free");
  });

  it("keeps the existing clear action for an assigned instructor", () => {
    const onRemove = vi.fn();
    render(<Harness assigned onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
