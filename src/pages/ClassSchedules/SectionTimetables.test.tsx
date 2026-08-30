import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleItem, Section } from "./SchedulerPanel/types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  mapInitialData: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  default: { get: mocks.get },
}));

vi.mock("../../lib/storedUser", () => ({
  getStoredUser: () => ({ role: "secretary", department_id: 7 }),
}));

vi.mock("./SchedulerPanel/hooks/initialDataMapper", () => ({
  mapInitialData: mocks.mapInitialData,
}));

interface GridProbeProps {
  selectedSectionId: string;
  sectionSchedules: ScheduleItem[];
  isReadOnlyViewer?: boolean;
}

vi.mock("./SchedulerPanel/TimetableGrid", () => ({
  default: ({ selectedSectionId, sectionSchedules, isReadOnlyViewer }: GridProbeProps) => (
    <div
      data-testid="grid-probe"
      data-section={selectedSectionId}
      data-count={sectionSchedules.length}
      data-read-only={String(isReadOnlyViewer)}
    />
  ),
}));

import SectionTimetables from "./SectionTimetables";

const section = (id: string, name: string, yearLevel: Section["yearLevel"]): Section => ({
  id,
  name,
  yearLevel,
  semester: "1st",
  departmentId: 7,
  termId: 9,
  status: "active",
});

const schedule = (id: string, sectionId: string, mode: ScheduleItem["mode"]): ScheduleItem => ({
  id,
  termId: 9,
  departmentId: 7,
  courseId: id,
  subjectId: id,
  courseCode: `COURSE-${id}`,
  courseName: `Course ${id}`,
  courseType: "major",
  lectureUnits: 3,
  laboratoryUnits: 0,
  totalUnits: 3,
  sectionName: sectionId === "1" ? "BSIT-1A" : "BSIT-2A",
  roomName: "R101",
  day: "Monday",
  startTime: "7 AM",
  endTime: "8 AM",
  mode,
  facultyName: null,
  facultyId: null,
  status: "draft",
  dayIndex: 0,
  startSlot: 0,
  durationSlots: 2,
  sectionId,
  roomId: "1",
});

describe("SectionTimetables", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.mapInitialData.mockReset();
    mocks.get.mockResolvedValue({ data: {} });
    mocks.mapInitialData.mockReturnValue({
      rooms: [],
      sections: [section("2", "BSIT-2A", 2), section("1", "BSIT-1A", 1)],
      subjects: [],
      faculties: [],
      activeTerm: { id: 9, academic_year: "2026-2027", semester: "1st", is_active: true },
      departments: [],
      users: [],
      schedules: [schedule("10", "1", "on-site"), schedule("20", "2", "online")],
      fieldCourseAssignmentEnabled: false,
      fieldCourseCodes: [],
    });
  });

  it("loads the authorized data and switches the shared read-only grid by section and mode", async () => {
    render(<SectionTimetables />);

    const grid = await screen.findByTestId("grid-probe");
    expect(grid.getAttribute("data-section")).toBe("1");
    expect(grid.getAttribute("data-count")).toBe("1");
    expect(grid.getAttribute("data-read-only")).toBe("true");
    expect(mocks.get).toHaveBeenCalledWith("/initial-data", expect.objectContaining({
      params: { schedule_limit: 2000 },
    }));

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "2" } });
    await waitFor(() => expect(grid.getAttribute("data-section")).toBe("2"));

    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "on-site" } });
    await waitFor(() => expect(grid.getAttribute("data-count")).toBe("0"));
  });
});
