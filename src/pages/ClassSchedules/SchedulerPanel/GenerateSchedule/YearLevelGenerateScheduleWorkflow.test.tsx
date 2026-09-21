import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const { get, post, confirm } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), confirm: vi.fn() }));

vi.mock("../../../../lib/api", () => ({
  default: {
    get,
    patch: vi.fn(),
    post,
  },
}));

vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({
    toast: {
      error: vi.fn(),
      success: vi.fn(),
    },
    confirm,
  }),
}));

import YearLevelGenerateScheduleWorkflow from "./YearLevelGenerateScheduleWorkflow";
import { GenerationRunProvider } from "../hooks/useGenerationRun";
import { clearDataCache } from "../../../../lib/dataCache";
import type { Course, ScheduleItem, Section, Semester } from "../types";

afterEach(cleanup);

// The run itself is tracked above the modal, so the wizard is always rendered
// inside its provider.
const renderWorkflow = (ui: ReactElement) =>
  render(
    <GenerationRunProvider departmentId={2} semesterId={1}>
      {ui}
    </GenerationRunProvider>,
  );

const activeSemester: Semester = {
  id: 1,
  academic_year: "2026-2027",
  semester: "1st",
  is_active: true,
};

const sections: Section[] = [{
  id: "10",
  name: "BSIT 1A",
  yearLevel: 1,
  semester: "1st",
  departmentId: 2,
  // The wizard will not advance past the year-level step until the cohort's
  // curriculum is settled — the course list every later step is configured
  // against is only well defined relative to one.
  curriculumId: 7,
  curriculumName: "BSIT 2026",
  semesterId: 1,
  status: "active",
}];

const courses: Course[] = [{
  id: "20",
  code: "IT 101",
  name: "Introduction to Computing",
  units: 3,
  lectureHours: 3,
  labHours: 0,
  category: "major",
  semester: "1st",
  departmentId: 2,
  yearLevel: 1,
  roomTypeRequired: "lecture",
  status: "active",
}];

/**
 * The wizard asks the API which curricula the department runs, and re-reads its
 * course list scoped to the one the year level follows. Both are answered the
 * same way in every test, so they live here rather than in each mock.
 */
const curriculumEndpoints = (url: string) => {
  if (url === "/curriculum") {
    return Promise.resolve({
      data: [{
        id: 7,
        name: "BSIT 2026",
        code: "BSIT-2026",
        department_id: 2,
        program_id: null,
        effective_school_year: "2026-2027",
        status: "active",
        description: null,
        courses_count: 1,
        active_sections_count: 1,
        lifecycle: "only",
        lifecycle_label: "Active",
        created_at: "",
        updated_at: "",
      }],
    });
  }

  if (url === "/courses") {
    return Promise.resolve({
      data: [{
        id: 20,
        course_code: "IT 101",
        course_name: "Introduction to Computing",
        units: 3,
        lecture_hours: 3,
        lab_hours: 0,
        course_category: "major",
        semester: "1st",
        department_id: 2,
        year_level: "1",
        room_type_required: "lecture",
        status: "active",
      }],
    });
  }

  return null;
};

describe("YearLevelGenerateScheduleWorkflow", () => {
  beforeEach(() => {
    localStorage.clear();
    // The generator's reference reads are cached in sessionStorage, which
    // outlives a test; each case must start cold or it would assert against
    // the previous case's responses.
    clearDataCache();
    get.mockReset();
    post.mockReset();
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({ data: { forced_day_rules: [], field_course_codes: [] } });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      const curriculumResponse = curriculumEndpoints(url);
      if (curriculumResponse) return curriculumResponse;
      return Promise.resolve({ data: {} });
    });
  });

  it("marks an already scheduled year level and asks before generating it again", async () => {
    localStorage.setItem("wicars.year-level-wizard.v5.2.1", JSON.stringify({
      step: 3,
      yearLevel: 1,
      activeSectionId: "10",
      configs: {},
      setupDraft: { completed: true },
    }));
    confirm.mockResolvedValue(false);
    const draft = {
      id: "900",
      semesterId: 1,
      departmentId: 2,
      courseId: "20",
      courseCode: "IT 101",
      courseName: "Introduction to Computing",
      courseType: "major",
      lectureUnits: 3,
      laboratoryUnits: 0,
      totalUnits: 3,
      sectionName: "BSIT 1A",
      roomName: null,
      day: "Monday",
      startTime: "07:00",
      endTime: "10:00",
      mode: "on-site",
      facultyName: null,
      facultyId: null,
      status: "draft",
      dayIndex: 0,
      startSlot: 0,
      durationSlots: 6,
      sectionId: "10",
      roomId: null,
    } as unknown as ScheduleItem;

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[draft]}
        onAccepted={vi.fn()}
      />,
    );

    expect(await screen.findByText("Already scheduled")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
  });

  it("polls the queued result, saves it, and closes on the click while the refresh finishes", async () => {
    const generatedSchedule = {
      id: 501,
      semester_id: 1,
      department_id: 2,
      course_id: 20,
      section_id: 10,
      room_id: null,
      day: "Monday",
      start_time: "07:00:00",
      end_time: "10:00:00",
      mode: "on-site" as const,
      status: "draft" as const,
    };
    localStorage.setItem("wicars.year-level-wizard.v5.2.1", JSON.stringify({
      step: 3,
      yearLevel: 1,
      activeSectionId: "10",
      configs: {
        "10": {
          courseIds: ["20"],
          locked: true,
          splitCourseIds: [],
          gecSplitCourseIds: [],
          gecSplitPatternsByCourseId: { "20": "MW" },
          modesByCourseId: { "20": "automatic" },
        },
      },
      setupDraft: {
        completed: true,
      },
    }));
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({ data: { forced_day_rules: [], field_course_codes: [] } });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      const curriculumResponse = curriculumEndpoints(url);
      if (curriculumResponse) return curriculumResponse;
      if (url === "/schedule-recommendations/generation-runs/run-1") {
        return Promise.resolve({ data: { status: "completed", result: { schedules: [generatedSchedule] } } });
      }
      return Promise.resolve({ data: {} });
    });
    post.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/year-level-preview/queue") {
        return Promise.resolve({ data: { run_id: "run-1" } });
      }
      if (url === "/schedules/batch") {
        return Promise.resolve({ data: { schedules: [generatedSchedule] } });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });
    let finishRefresh: (() => void) | undefined;
    const onAccepted = vi.fn(() => new Promise<void>((resolve) => {
      finishRefresh = resolve;
    }));
    const onClose = vi.fn();
    const onSavingChange = vi.fn();

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={onClose}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={onAccepted}
        onSavingChange={onSavingChange}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));
    // A completed run moves the wizard to the summary step on its own.
    await screen.findByText(/class meetings generated/);
    expect(post).toHaveBeenCalledWith(
      "/schedule-recommendations/year-level-preview/queue",
      expect.objectContaining({
        section_configs: [expect.objectContaining({ course_ids: [20] })],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & View Timetable" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/schedules/batch",
      expect.objectContaining({
        operations: [expect.objectContaining({ section_id: 10, course_id: 20 })],
        replace_section_ids: [10],
        replace_semester_id: 1,
      }),
    ));
    expect(onAccepted).toHaveBeenCalledWith([generatedSchedule]);
    // The wizard leaves on the click, so the timetable refresh behind it is
    // the only overlay the user sees.
    expect(onClose).toHaveBeenCalledOnce();
    // The timetable behind the closed wizard shows the save as in progress
    // until the refresh lands.
    expect(onSavingChange).toHaveBeenCalledWith(true);
    expect(onSavingChange).not.toHaveBeenCalledWith(false);

    finishRefresh?.();
    await waitFor(() => expect(onSavingChange).toHaveBeenLastCalledWith(false));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("serves the reference data from cache when the generator is reopened", async () => {
    const countGets = (url: string) =>
      get.mock.calls.filter((call) => call[0] === url).length;

    const open = () =>
      renderWorkflow(
        <YearLevelGenerateScheduleWorkflow
          onClose={vi.fn()}
          sections={sections}
          courses={courses}
          activeSemester={activeSemester}
          departmentId={2}
          existingSchedules={[]}
          onAccepted={vi.fn()}
        />,
      );

    open();
    // Wait until the first open has finished its reads.
    await waitFor(() => expect(countGets("/curriculum")).toBe(1));
    await waitFor(() => expect(countGets("/courses")).toBe(1));
    await waitFor(() => expect(countGets("/scheduling-settings")).toBe(1));
    await waitFor(() => expect(countGets("/rooms")).toBe(1));

    // Closing the generator unmounts it; reopening must not refetch any of it.
    cleanup();
    open();
    await screen.findByLabelText("Year level");

    expect(countGets("/curriculum")).toBe(1);
    expect(countGets("/courses")).toBe(1);
    expect(countGets("/scheduling-settings")).toBe(1);
    expect(countGets("/rooms")).toBe(1);
  });

  it("sends every curriculum course, not only the configured field courses", async () => {
    // Regression: the course list reached the API as just the field courses,
    // so a year level generated PATH FIT and ROTC and dropped every major and
    // minor. With nothing unchecked in Setup Courses, all of them must be sent.
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({
          data: {
            forced_day_rules: [],
            field_course_assignment_enabled: true,
            field_course_codes: ["PATH FIT 1"],
            field_course_options: [
              { id: 21, code: "PATH FIT 1", name: "Movement Competency Training" },
            ],
          },
        });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      if (url === "/curriculum") return curriculumEndpoints(url);
      if (url === "/courses") {
        return Promise.resolve({
          data: [
            {
              id: 20,
              course_code: "IT 101",
              course_name: "Introduction to Computing",
              units: 3,
              lecture_hours: 3,
              lab_hours: 0,
              course_category: "major",
              semester: "1st",
              department_id: 2,
              year_level: "1",
              room_type_required: "lecture",
              status: "active",
            },
            {
              id: 21,
              course_code: "PATH FIT 1",
              course_name: "Movement Competency Training",
              units: 2,
              lecture_hours: 2,
              lab_hours: 0,
              course_category: "minor",
              semester: "1st",
              department_id: 2,
              year_level: "1",
              room_type_required: "field",
              status: "active",
            },
          ],
        });
      }
      // The run stays queued: this test only asserts what was submitted.
      if (url === "/schedule-recommendations/generation-runs/run-2") {
        return Promise.resolve({ data: { run_id: "run-2", status: "queued" } });
      }
      return Promise.resolve({ data: {} });
    });
    post.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/year-level-preview/queue") {
        return Promise.resolve({ data: { run_id: "run-2" } });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    for (let step = 1; step <= 2; step += 1) {
      const continueButton = screen.getByRole("button", { name: /^Continue/ });
      await waitFor(() =>
        expect((continueButton as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(continueButton);
    }

    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/schedule-recommendations/year-level-preview/queue",
        expect.objectContaining({
          section_configs: [
            expect.objectContaining({
              section_id: 10,
              course_ids: expect.arrayContaining([20, 21]),
            }),
          ],
        }),
      ),
    );
  });

  it("leaves an unchecked course out of the run and sends the Friday + Saturday default", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({
          data: { forced_day_rules: [], field_course_codes: ["PATH FIT 1"] },
        });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      if (url === "/curriculum") return curriculumEndpoints(url);
      if (url === "/courses") {
        return Promise.resolve({
          data: [
            {
              id: 20, course_code: "IT 101", course_name: "Introduction to Computing",
              units: 3, lecture_hours: 3, lab_hours: 0, course_category: "major",
              semester: "1st", department_id: 2, year_level: "1",
              room_type_required: "lecture", status: "active",
            },
            {
              id: 21, course_code: "PATH FIT 1", course_name: "Movement Competency Training",
              units: 2, lecture_hours: 2, lab_hours: 0, course_category: "minor",
              semester: "1st", department_id: 2, year_level: "1",
              room_type_required: "field", status: "active",
            },
          ],
        });
      }
      if (url === "/schedule-recommendations/generation-runs/run-2") {
        return Promise.resolve({ data: { run_id: "run-2", status: "queued" } });
      }
      return Promise.resolve({ data: {} });
    });
    post.mockImplementation((url: string) =>
      url === "/schedule-recommendations/year-level-preview/queue"
        ? Promise.resolve({ data: { run_id: "run-2" } })
        : Promise.reject(new Error(`Unexpected POST ${url}`)),
    );

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueButton);

    // A field course used to be re-added to every run whatever was chosen.
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Include PATH FIT 1 in generation" }),
    );
    // Default Settings open from the gear in the header, in the right sidebar.
    fireEvent.click(screen.getByRole("button", { name: "Default Settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow Friday and Saturday as Paired Days" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Defaults/ }));
    expect(screen.queryByRole("region", { name: "Default Settings" })).toBeNull();
    // Saved per department, apart from the draft an accepted year level wipes,
    // so the next year level opens with the same defaults.
    expect(
      JSON.parse(localStorage.getItem("wicars.generator-course-defaults.v1.2") ?? "{}"),
    ).toMatchObject({ allowFridaySaturdaySplit: true });
    fireEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/schedule-recommendations/year-level-preview/queue",
        expect.objectContaining({
          section_configs: [
            expect.objectContaining({
              section_id: 10,
              course_ids: [20],
              allow_friday_saturday_split: true,
            }),
          ],
        }),
      ),
    );
  });

  it("opens every year level with the saved Default Settings, even without a draft", async () => {
    // An accepted year level wipes the wizard draft; the defaults survive it.
    localStorage.setItem(
      "wicars.generator-course-defaults.v1.2",
      JSON.stringify({ allowFridaySaturdaySplit: true }),
    );
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({ data: { forced_day_rules: [], field_course_codes: [] } });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      if (url === "/curriculum") return curriculumEndpoints(url);
      if (url === "/courses") {
        return Promise.resolve({
          data: [
            {
              id: 20, course_code: "IT 101", course_name: "Introduction to Computing",
              units: 3, lecture_hours: 3, lab_hours: 0, course_category: "major",
              semester: "1st", department_id: 2, year_level: "1",
              room_type_required: "lecture", status: "active",
            },
          ],
        });
      }
      if (url === "/schedule-recommendations/generation-runs/run-3") {
        return Promise.resolve({ data: { run_id: "run-3", status: "queued" } });
      }
      return Promise.resolve({ data: {} });
    });
    post.mockImplementation((url: string) =>
      url === "/schedule-recommendations/year-level-preview/queue"
        ? Promise.resolve({ data: { run_id: "run-3" } })
        : Promise.reject(new Error(`Unexpected POST ${url}`)),
    );

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueButton);
    await screen.findByRole("checkbox", { name: "Include IT 101 in generation" });
    fireEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/schedule-recommendations/year-level-preview/queue",
        expect.objectContaining({
          section_configs: [
            expect.objectContaining({ allow_friday_saturday_split: true }),
          ],
        }),
      ),
    );
  });

  it("sends the Configure panel's custom duration and preferred room with the run", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({
          data: {
            forced_day_rules: [],
            field_course_codes: [],
            preferred_room_options: [
              { id: 7, room_code: "LEC 7", room_type: "lecture", building: "Main" },
            ],
          },
        });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      if (url === "/schedule-recommendations/generation-runs/run-3") {
        return Promise.resolve({ data: { run_id: "run-3", status: "queued" } });
      }
      const curriculumResponse = curriculumEndpoints(url);
      if (curriculumResponse) return curriculumResponse;
      return Promise.resolve({ data: {} });
    });
    post.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/year-level-preview/queue") {
        return Promise.resolve({ data: { run_id: "run-3" } });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    const continueToSetup = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueToSetup as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueToSetup);

    fireEvent.click(await screen.findByRole("button", { name: /^Configure$/ }));
    fireEvent.change(screen.getByLabelText(/Duration in hours/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/Preferred Room/i), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

    const continueToReview = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueToReview as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueToReview);
    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/schedule-recommendations/year-level-preview/queue",
        expect.objectContaining({
          section_configs: [
            expect.objectContaining({
              section_id: 10,
              duration_minutes_by_course_id: { 20: 120 },
              preferred_rooms_by_course_id: { 20: 7 },
            }),
          ],
        }),
      ),
    );
  });

  it("renders the four-step workflow with the rules board on the first step", async () => {
    const onClose = vi.fn();
    const { container } = renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={onClose}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    // One stepper, at the top, with the four named steps.
    const stepper = screen.getByRole("navigation", { name: "Schedule generator steps" });
    for (const title of ["Configuration", "Setup Courses", "Review & Generate", "Schedule Summary"]) {
      expect(stepper.textContent).toContain(title);
    }
    expect(screen.queryByText("Choose Year")).toBeNull();

    // Scope on top, then the Preferred Days. Course rules (Required Day,
    // Preferred Room) live in Step 2's Configure panel.
    expect(screen.getByLabelText("Year level")).toBeTruthy();
    expect(screen.queryByText("Preferred Meetings")).toBeNull();
    expect(screen.queryByText("Forced Day")).toBeNull();
    expect(screen.queryByText("Field Courses")).toBeNull();
    // The step area scrolls: the modal sizes itself to its content, so when
    // the content is taller than the viewport this is what gives.
    expect(container.querySelector("main")?.className).toContain("overflow-y-auto");

    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueButton);

    // Step 2 is one row per course, with redesigned class configuration columns.
    await waitFor(() => expect(screen.getByRole("columnheader", { name: "Course" })).toBeTruthy());
    for (const heading of ["Regular", "Split", "Integrated", "Delivery Mode", "Duration", "Configure"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Configure/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close schedule generator" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("excludes only the opted-out section from a course's split session", async () => {
    // Two sections and one split-eligible minor course, so a per-section
    // exclusion is observable in the payload.
    const twoSections: Section[] = [
      sections[0],
      { ...sections[0], id: "11", name: "BSIT 1B" },
    ];
    const minor = {
      id: 21,
      course_code: "GEC 1",
      course_name: "Understanding the Self",
      units: 3,
      lecture_hours: 3,
      lab_hours: 0,
      course_category: "minor",
      semester: "1st",
      department_id: 2,
      year_level: "1",
      room_type_required: "lecture",
      status: "active",
    };

    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({
          data: {
            forced_day_rules: [],
            field_course_codes: [],
            gec_split_schedule_override_enabled: true,
          },
        });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      if (url === "/curriculum") return curriculumEndpoints(url);
      if (url === "/courses") return Promise.resolve({ data: [minor] });
      return Promise.resolve({ data: {} });
    });
    post.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/year-level-preview/queue") {
        return Promise.resolve({ data: { run_id: "run-5" } });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={twoSections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    // Split eligibility is configured directly in Step 2.
    const toStep2 = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((toStep2 as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(toStep2);

    // Turn Split on for GEC 1 in the table, then open Configure to exclude BSIT 1B.
    fireEvent.click(await screen.findByRole("checkbox", { name: "Split for GEC 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Configure/ }));

    const sidebar = await screen.findByRole("region", { name: /Configure GEC 1/i });

    // Switch to Selected Sections scope
    fireEvent.click(within(sidebar).getByLabelText(/Selected Sections Only/i));

    // Exclude BSIT 1B
    const bsit1bCheckbox = within(sidebar).getByRole("checkbox", {
      name: /BSIT 1B/i,
    });
    fireEvent.click(bsit1bCheckbox);
    fireEvent.click(within(sidebar).getByRole("button", { name: /Apply Configuration/i }));

    // The table now shows the partial override badge.
    await waitFor(() => expect(screen.getByText("1/2 sections")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const payload = post.mock.calls.find(
      (call) => call[0] === "/schedule-recommendations/year-level-preview/queue",
    )?.[1] as { section_configs: Array<Record<string, unknown>> };
    const bySection = new Map(
      payload.section_configs.map((config) => [config.section_id, config]),
    );

    expect(bySection.get(10)?.selected_gec_course_ids).toEqual([21]);
    expect(bySection.get(11)?.selected_gec_course_ids).toEqual([]);
  });

  it("limits every section to the Preferred Days picked on step 1", async () => {
    post.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/year-level-preview/queue") {
        return Promise.resolve({ data: { run_id: "run-days" } });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    const days = await screen.findByRole("group", { name: "Preferred days" });
    // Picked out of order; sent in calendar order.
    for (const day of ["Wed", "Mon", "Tue"]) {
      fireEvent.click(within(days).getByRole("button", { name: day }));
    }
    await waitFor(() =>
      expect(
        within(screen.getByRole("group", { name: "Preferred days" }))
          .getByRole("button", { name: "Tue" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    for (let step = 1; step <= 2; step += 1) {
      const continueButton = screen.getByRole("button", { name: /^Continue/ });
      await waitFor(() =>
        expect((continueButton as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(continueButton);
    }

    expect(
      await screen.findByText(/limited to the Preferred Days \(Monday, Tuesday, Wednesday\)/),
    ).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/schedule-recommendations/year-level-preview/queue",
        expect.objectContaining({
          section_configs: [
            expect.objectContaining({
              section_id: 10,
              allowed_days: ["Monday", "Tuesday", "Wednesday"],
            }),
          ],
        }),
      ),
    );
  });

  it("slides forward on Continue and back on Back", async () => {
    const { container } = renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueButton);

    await waitFor(() =>
      expect(
        container.querySelector('[class*="animate-stepInRight"]'),
      ).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Back/ }));

    await waitFor(() =>
      expect(
        container.querySelector('[class*="animate-stepInLeft"]'),
      ).toBeTruthy(),
    );
  });

  it("sends no day limit when no Preferred Days are picked", async () => {
    post.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/year-level-preview/queue") {
        return Promise.resolve({ data: { run_id: "run-4" } });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={courses}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    for (let step = 1; step <= 2; step += 1) {
      const continueButton = screen.getByRole("button", { name: /^Continue/ });
      await waitFor(() =>
        expect((continueButton as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(continueButton);
    }

    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/schedule-recommendations/year-level-preview/queue",
        expect.objectContaining({
          section_configs: [
            expect.objectContaining({ allowed_days: null }),
          ],
        }),
      ),
    );
  });

  it("warns in Setup Courses when every Required Day falls on the same day", async () => {
    const secondCourse: Course = {
      ...courses[0],
      id: "21",
      code: "IT 102",
      name: "Computer Programming 1",
    };
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({
          data: {
            forced_day_courses: [
              { id: 20, code: "IT 101", name: "Introduction to Computing" },
              { id: 21, code: "IT 102", name: "Computer Programming 1" },
            ],
            forced_day_rules: [
              { course_id: 20, day: "Monday" },
              { course_id: 21, day: "Monday" },
            ],
            field_course_codes: [],
          },
        });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      const curriculumResponse = curriculumEndpoints(url);
      if (curriculumResponse) return curriculumResponse;
      return Promise.resolve({ data: {} });
    });

    renderWorkflow(
      <YearLevelGenerateScheduleWorkflow
        onClose={vi.fn()}
        sections={sections}
        courses={[...courses, secondCourse]}
        activeSemester={activeSemester}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueButton);

    // Wait for this warning by its text rather than for the first alert.
    const warning = await screen.findByText(/Same-day concentration warning/);
    expect(warning.closest('[role="alert"]')).toBeTruthy();
    expect(warning.textContent).toContain("all 2 Required Day courses");
    expect(warning.textContent).toContain("assigned to Monday");
    expect(warning.textContent).toContain("should be reviewed");
  });

});
