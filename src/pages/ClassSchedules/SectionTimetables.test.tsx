import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleItem, Section } from "./SchedulerPanel/types";
import { clearDataCache } from "../../lib/dataCache";

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

interface GanttProbeProps {
  days: Array<{ rows: Array<{ blocks: Array<{ schedule: { section_id?: number | null } }> }> }>;
}

// The page renders the shared Gantt chart; the probe reports what it was given.
vi.mock("../vpaa/calendar/MasterGantt", () => ({
  default: ({ days }: GanttProbeProps) => {
    const blocks = days.flatMap((day) => day.rows.flatMap((row) => row.blocks));
    return (
      <div
        data-testid="gantt-probe"
        data-sections={[...new Set(blocks.map((block) => block.schedule.section_id))].join(",")}
        data-count={blocks.length}
      />
    );
  },
}));

import SectionTimetables from "./SectionTimetables";

const section = (id: string, name: string, yearLevel: Section["yearLevel"]): Section => ({
  id,
  name,
  yearLevel,
  semester: "1st",
  departmentId: 7,
  semesterId: 9,
  status: "active",
});

const schedule = (id: string, sectionId: string, mode: ScheduleItem["mode"]): ScheduleItem => ({
  id,
  semesterId: 9,
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
  status: "approved",
  dayIndex: 0,
  startSlot: 0,
  durationSlots: 2,
  sectionId,
  roomId: "1",
});

describe("SectionTimetables", () => {
  afterEach(cleanup);
  beforeEach(() => {
    clearDataCache();
    mocks.get.mockReset();
    mocks.mapInitialData.mockReset();
    mocks.get.mockResolvedValue({ data: {} });
    mocks.mapInitialData.mockReturnValue({
      rooms: [],
      sections: [section("2", "BSIT-2A", 2), section("1", "BSIT-1A", 1)],
      subjects: [],
      faculties: [],
      activeSemester: { id: 9, academic_year: "2026-2027", semester: "1st", is_active: true },
      departments: [],
      users: [],
      schedules: [schedule("10", "1", "on-site"), schedule("20", "2", "online")],
      fieldCourseAssignmentEnabled: false,
      fieldCourseCodes: [],
    });
  });

  it("loads the authorized data and switches the shared Gantt chart by section and mode", async () => {
    render(<SectionTimetables />);

    const gantt = await screen.findByTestId("gantt-probe");
    expect(gantt.getAttribute("data-sections")).toBe("1");
    expect(gantt.getAttribute("data-count")).toBe("1");
    expect(mocks.get).toHaveBeenCalledWith("/initial-data", expect.objectContaining({
      params: { schedule_limit: 2000, view: "gantt" },
    }));

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByTestId("gantt-probe").getAttribute("data-sections")).toBe("2"));

    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "on-site" } });
    await waitFor(() => expect(screen.getByTestId("gantt-probe").getAttribute("data-count")).toBe("0"));
  });

  it("excludes unapproved schedules from blocks and placement counts", async () => {
    const data = mocks.mapInitialData();
    mocks.mapInitialData.mockReturnValue({ ...data,
      subjects: [{ id: "10", yearLevel: 1, semester: "1st" }, { id: "11", yearLevel: 1, semester: "1st" }],
      schedules: [schedule("10", "1", "on-site"), { ...schedule("11", "1", "on-site"), status: "approved_by_dean" }],
    });
    render(<SectionTimetables />);
    await waitFor(() => expect(screen.getByTestId("gantt-probe").getAttribute("data-count")).toBe("1"));
    expect(screen.getByRole("progressbar", { name: "Courses placed" }).getAttribute("aria-valuenow")).toBe("1");
  });
});
