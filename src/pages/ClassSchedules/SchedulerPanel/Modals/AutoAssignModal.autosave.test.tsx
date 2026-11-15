import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutoAssignModal from "./AutoAssignModal";
import type { Faculty, ScheduleItem, Subject } from "../types";

const { apiGet, apiPut, apiDelete } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn() }));

vi.mock("../../../../lib/api", () => ({
  default: { get: apiGet, put: apiPut, delete: apiDelete, defaults: { baseURL: "/api" } },
}));
vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({ confirm: vi.fn(), toast: { error: vi.fn() } }),
}));

const subject = { id: "c1", code: "IT 101", name: "Intro", yearLevel: 1, category: "minor" } as unknown as Subject;
const meeting = (id: string, sectionId: string, sectionName: string, dayIndex: number, facultyId: string | null = null) => ({
  id, courseId: "c1", courseCode: "IT 101", courseName: "Intro", sectionId, sectionName, departmentId: 6,
  day: ["monday", "tuesday", "wednesday"][dayIndex], dayIndex, startTime: "07:00", endTime: "08:00",
  startSlot: 0, durationSlots: 2, mode: "on-site", status: "faculty_assignment", facultyId, totalUnits: 3,
}) as unknown as ScheduleItem;
const faculty = { id: "7", name: "Juan Dela Cruz", departmentId: 6, status: "active", employmentType: "full-time", requiredUnits: 21, overloadUnits: 6 } as unknown as Faculty;
const scope = { departmentId: 6, semesterId: 3 };

const renderModal = (schedules: ScheduleItem[], onAssign = vi.fn().mockResolvedValue(true), onClose = vi.fn()) => render(
  <AutoAssignModal
    isOpen
    onClose={onClose}
    schedules={schedules}
    subjects={[subject]}
    faculties={[faculty]}
    departmentId={6}
    facultyActionSlotId={null}
    canManageScheduleFaculty={() => true}
    checkFacultyConflict={() => null}
    onAssign={onAssign}
    draftScope={scope}
  />,
);

describe("AutoAssignModal auto-save", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPut.mockReset().mockResolvedValue({ data: {} });
    apiDelete.mockReset().mockResolvedValue({ data: {} });
  });
  afterEach(cleanup);

  it("restores only unfinished work and drops classes assigned since the draft was saved", async () => {
    apiGet.mockResolvedValue({ data: { revision: 10, payload: {
      step: 2, faculty_id: "7", year_level: "1", course_id: "c1",
      assignments: [
        { key: "c1:secA", faculty_id: "7", schedule_ids: [1] },
        { key: "c1:secA", faculty_id: "7", schedule_ids: [1] }, // duplicate
        { key: "c1:secB", faculty_id: "7", schedule_ids: [2] }, // assigned meanwhile
      ],
    } } });

    renderModal([meeting("1", "secA", "BSIT 1A", 0), meeting("2", "secB", "BSIT 1B", 1, "9")]);

    // Resumes on the saved step with one unfinished class.
    await screen.findByText("Continue", undefined, { timeout: 5000 });
    expect(screen.getByText("BSIT 1A")).toBeTruthy();
    expect(screen.queryByText("BSIT 1B")).toBeNull();
    expect(screen.queryByText("Save failed")).toBeNull();
  });

  it("auto-saves each change with an increasing revision", async () => {
    apiGet.mockResolvedValue({ data: { revision: 0, payload: null } });
    renderModal([meeting("1", "secA", "BSIT 1A", 0)]);

    await waitFor(() => expect(apiPut).toHaveBeenCalled(), { timeout: 5000 });
    fireEvent.click(await screen.findByText("BSIT 1A", undefined, { timeout: 5000 }));
    fireEvent.click(screen.getByRole("button", { name: /Add 1 section to list/ }));

    await waitFor(() => {
      const last = apiPut.mock.calls.at(-1)?.[1];
      expect(last?.payload.assignments).toEqual([{ key: "c1:secA", faculty_id: "7", schedule_ids: [1] }]);
    }, { timeout: 5000 });
    const revisions = apiPut.mock.calls.map((call) => call[1].revision);
    expect([...revisions].sort((a, b) => a - b)).toEqual(revisions);
    expect(await screen.findByText("Saved", undefined, { timeout: 5000 })).toBeTruthy();
  });

  it("never saves over stored progress it could not load", async () => {
    apiGet.mockRejectedValue(new Error("offline"));
    renderModal([meeting("1", "secA", "BSIT 1A", 0)]);

    expect(await screen.findByText("Couldn't load saved progress", undefined, { timeout: 5000 })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("clears the stored progress once the list is saved", async () => {
    apiGet.mockResolvedValue({ data: { revision: 4, payload: {
      step: 3, faculty_id: "7", year_level: "1", course_id: "c1",
      assignments: [{ key: "c1:secA", faculty_id: "7", schedule_ids: [1] }],
    } } });
    const onAssign = vi.fn().mockResolvedValue(true);
    renderModal([meeting("1", "secA", "BSIT 1A", 0)], onAssign);

    fireEvent.click(await screen.findByRole("button", { name: /Save Assignments/ }, { timeout: 5000 }));

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith([{ facultyId: "7", scheduleIds: ["1"] }]), { timeout: 5000 });
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/instructor-assignment-draft", { params: { semester_id: 3, revision: expect.any(Number) } }), { timeout: 5000 });
  });
});
