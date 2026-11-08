import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from 'react';
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
  overrides: Partial<ComponentProps<typeof AutoAssignModal>> = {},
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
      {...overrides}
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

  it('queues complete meeting groups and saves only after all three steps', async () => {
    const onAssign = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onClose = vi.fn();
    const partner = { ...schedule, id: 's2', day: 'thursday', dayIndex: 3, mode: 'online' } as ScheduleItem;
    renderModal(null, faculty, { schedules: [schedule, partner], onAssign, onClose });
    expect((screen.getByRole('button', { name: 'Review' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 section to list' }));
    expect(screen.getByText('On list')).toBeTruthy();
    expect(screen.getByText('1 section pending · 1 instructor')).toBeTruthy();
    expect(onAssign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
    expect(screen.getByText('Load after saving')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Ready to save')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignments' }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(1));
    expect(onAssign).toHaveBeenCalledWith([{ facultyId: 'f1', scheduleIds: ['s1', 's2'] }]);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignments' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps conflict reasons available without making conflicting sections selectable', () => {
    renderModal();
    const checkbox = screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    const reason = screen.getByText(/Juan Dela Cruz already teaches/);
    expect(reason.closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByText('View reason'));
    expect(reason.closest('details')?.open).toBe(true);
    expect(checkbox.checked).toBe(false);
  });

  it('removes the only queued section in Build list and restores availability and the saved teaching load', () => {
    const onAssign = vi.fn();
    const onRemoveAssignment = vi.fn();
    const instructor = { ...faculty, assignedUnits: 6 } as Faculty;
    const partner = { ...schedule, id: 's2', day: 'thursday', dayIndex: 3 } as ScheduleItem;
    renderModal(null, instructor, { schedules: [schedule, partner], onAssign, onRemoveAssignment });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 section to list' }));
    expect(screen.getByText(/Projected load/).textContent).toContain('9 / 27 units');
    expect(screen.getByText(/1 section pending/)).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }) as HTMLInputElement).disabled).toBe(true);

    const remove = screen.getByRole('button', { name: 'Remove IT 101 BSIT 1A' });
    expect(remove.getAttribute('title')).toBe('Remove from list');
    fireEvent.click(remove);

    const checkbox = screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(false);
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.queryByText('On list')).toBeNull();
    expect(screen.queryByText(/section pending/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Review' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Add to list' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Projected load/).textContent).toContain('6 / 27 units');
    expect(within(screen.getByRole('button', { name: /Juan Dela Cruz/ })).getByText('6 / 27 units')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    expect(onRemoveAssignment).not.toHaveBeenCalled();
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('removes one queued section while preserving other instructors and sections through Review and saving', async () => {
    const second = { ...schedule, id: 's2', sectionId: 'sec2', sectionName: 'BSIT 1B', day: 'tuesday', dayIndex: 1 } as ScheduleItem;
    const third = { ...schedule, id: 's3', sectionId: 'sec3', sectionName: 'BSIT 1C', day: 'wednesday', dayIndex: 2 } as ScheduleItem;
    const instructor = { ...faculty, assignedUnits: 6 } as Faculty;
    const other = { ...faculty, id: 'f2', name: 'Maria Santos', assignedUnits: 9 } as Faculty;
    const onAssign = vi.fn().mockResolvedValue(true);
    renderModal(null, instructor, { schedules: [schedule, second, third], faculties: [instructor, other], onAssign });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 sections to list' }));
    fireEvent.click(screen.getByRole('button', { name: /Maria Santos/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1C' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 section to list' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remove IT 101 BSIT 1A' }));

    expect(screen.getByText(/2 sections pending.*2 instructors/)).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Remove IT 101 BSIT 1B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove IT 101 BSIT 1C' })).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Juan Dela Cruz/ })).getByText('9 / 27 units')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Maria Santos/ })).getByText('12 / 27 units')).toBeTruthy();
    expect(screen.getByText(/Projected load/).textContent).toContain('12 / 27 units');

    fireEvent.click(screen.getByRole('button', { name: 'Review (2)' }));
    expect(screen.queryByText('BSIT 1A')).toBeNull();
    expect(screen.getByText('BSIT 1B')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Maria Santos/ }));
    expect(screen.getByText('BSIT 1C')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.queryByText('BSIT 1A')).toBeNull();
    expect(screen.getByText('BSIT 1B')).toBeTruthy();
    expect(screen.getByText('BSIT 1C')).toBeTruthy();
    expect(onAssign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignments' }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledExactlyOnceWith([
      { facultyId: 'f1', scheduleIds: ['s2'] },
      { facultyId: 'f2', scheduleIds: ['s3'] },
    ]));
  });

  it('preserves saved assignments when removing a queue entry for a partly assigned meeting group', async () => {
    const savedMeeting = { ...schedule, facultyId: faculty.id } as ScheduleItem;
    const pendingMeeting = { ...schedule, id: 's2', day: 'thursday', dayIndex: 3 } as ScheduleItem;
    const savedSection = { ...schedule, id: 'saved', sectionId: 'sec2', sectionName: 'BSIT 1B', facultyId: faculty.id } as ScheduleItem;
    const onRemoveAssignment = vi.fn();
    const onAssign = vi.fn().mockResolvedValue(true);
    renderModal(null, { ...faculty, assignedUnits: 6 } as Faculty, {
      schedules: [savedMeeting, pendingMeeting, savedSection], onRemoveAssignment, onAssign,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 section to list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove IT 101 BSIT 1A' }));

    expect(screen.getByText('Assigned')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove instructor from IT 101 BSIT 1B' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove IT 101 BSIT 1B' })).toBeNull();
    expect((screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1B' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText(/Projected load/).textContent).toContain('6 / 27 units');
    expect(savedMeeting.facultyId).toBe(faculty.id);
    expect(savedSection.facultyId).toBe(faculty.id);
    expect(pendingMeeting.facultyId).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(onRemoveAssignment).not.toHaveBeenCalled();
    expect(onAssign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 section to list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignments' }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledExactlyOnceWith([{ facultyId: 'f1', scheduleIds: ['s2'] }]));
  });

  it('synchronizes Review removals back to Build list and subsequent queue changes back to Review', () => {
    const second = { ...schedule, id: 's2', sectionId: 'sec2', sectionName: 'BSIT 1B', day: 'tuesday', dayIndex: 1 } as ScheduleItem;
    renderModal(null, faculty, { schedules: [schedule, second] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 sections to list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText(/1 section pending/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove IT 101 BSIT 1A' })).toBeNull();
    expect((screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText(/Projected load/).textContent).toContain('3 / 27 units');
    fireEvent.click(screen.getByRole('button', { name: 'Remove IT 101 BSIT 1B' }));
    expect((screen.getByRole('button', { name: 'Review' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 section to list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
    expect(screen.getByText('BSIT 1A')).toBeTruthy();
    expect(screen.queryByText('BSIT 1B')).toBeNull();
  });

  it('preserves department and employment filters', () => {
    const partTime = { ...faculty, id: 'f2', name: 'Ana Reyes', employmentType: 'part-time' } as Faculty;
    const external = { ...faculty, id: 'f3', name: 'Elena Santos', departmentId: 7, departmentCode: 'CTE' } as Faculty;
    const other = { ...faculty, id: 'f4', name: 'Miguel Aquino', departmentId: 8, departmentCode: 'CBA' } as Faculty;
    renderModal(null, faculty, { faculties: [faculty, partTime, external, other] });
    fireEvent.click(screen.getByRole('button', { name: 'Part-time 1' }));
    expect(screen.queryByRole('button', { name: /Juan Dela Cruz/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Ana Reyes/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other departments' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter instructors by department' }), { target: { value: '8' } });
    expect(screen.queryByRole('button', { name: /Elena Santos/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Miguel Aquino/ })).toBeTruthy();
  });

  it('preserves course and year filters and clears their section selections', () => {
    const secondSubject = { ...subject, id: 'c2', code: 'IT 201', yearLevel: 2 } as Subject;
    const secondSchedule = { ...schedule, id: 's2', courseId: 'c2', courseCode: 'IT 201', sectionId: 'sec2', sectionName: 'BSIT 2A' } as ScheduleItem;
    renderModal(null, faculty, { subjects: [subject, secondSubject], schedules: [schedule, secondSchedule] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Year level' }), { target: { value: '2' } });
    expect(screen.queryByText('BSIT 1A')).toBeNull();
    expect(screen.getByText('BSIT 2A')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add to list' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Course' }) as HTMLSelectElement).value).toBe('c2');
  });

  it('prevents saving when a pending assignment develops a conflict', () => {
    const onAssign = vi.fn();
    const props = { isOpen: true, onClose: vi.fn(), schedules: [schedule], subjects: [subject], faculties: [faculty], departmentId: 6, facultyActionSlotId: null, canManageScheduleFaculty: () => true, onAssign };
    const view = render(<AutoAssignModal {...props} checkFacultyConflict={() => null} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select IT 101 BSIT 1A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 section to list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    view.rerender(<AutoAssignModal {...props} checkFacultyConflict={() => 'An instructor schedule changed.'} />);
    expect(screen.getByText('Resolve issues before saving')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save Assignments' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('confirms removal of the saved instructor from every meeting of the class', async () => {
    confirm.mockResolvedValue(true);
    const onRemoveAssignment = vi.fn().mockResolvedValue(true);
    renderModal(null, faculty, {
      schedules: [
        { ...schedule, facultyId: faculty.id },
        { ...schedule, id: 's2', day: 'thursday', dayIndex: 3, facultyId: faculty.id },
      ],
      onRemoveAssignment,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove instructor from IT 101 BSIT 1A' }));
    await waitFor(() => expect(onRemoveAssignment).toHaveBeenCalledExactlyOnceWith(['s1', 's2']));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Remove instructor', message: expect.stringContaining('Juan Dela Cruz'),
    }));
  });

  it('keeps the saved assignment when removal confirmation is cancelled', async () => {
    confirm.mockResolvedValue(false);
    const onRemoveAssignment = vi.fn();
    renderModal(null, faculty, { schedules: [{ ...schedule, facultyId: faculty.id }], onRemoveAssignment });
    fireEvent.click(screen.getByRole('button', { name: 'Remove instructor from IT 101 BSIT 1A' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(onRemoveAssignment).not.toHaveBeenCalled();
    expect(screen.getByText('Assigned')).toBeTruthy();
  });

  it.each(['done', 'unauthorized'] as const)('disables saved removal for %s assignments', (restriction) => {
    const onRemoveAssignment = vi.fn();
    renderModal(null, faculty, {
      schedules: [{ ...schedule, facultyId: faculty.id, facultyAssignmentDone: restriction === 'done' }],
      canManageScheduleFaculty: () => restriction !== 'unauthorized', onRemoveAssignment,
    });
    const remove = screen.getByRole('button', { name: 'Remove instructor from IT 101 BSIT 1A' }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    fireEvent.click(remove);
    expect(confirm).not.toHaveBeenCalled();
    expect(onRemoveAssignment).not.toHaveBeenCalled();
  });

  it('locks background scrolling and supports Escape dismissal', () => {
    const onClose = vi.fn();
    renderModal(null, faculty, { onClose });
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus and background scrolling when the modal unmounts', () => {
    render(<button>Open assignment modal</button>);
    const opener = screen.getByRole('button', { name: 'Open assignment modal' });
    opener.focus();
    const previousOverflow = document.body.style.overflow;
    const view = renderModal(null);
    screen.getByRole('button', { name: 'Close auto-assign' }).focus();
    view.unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it('prevents dismissal and editing while assignments are saving', () => {
    const onClose = vi.fn();
    renderModal(null, faculty, { onClose, facultyActionSlotId: 'bulk' });
    expect(screen.getByRole('main').hasAttribute('inert')).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
