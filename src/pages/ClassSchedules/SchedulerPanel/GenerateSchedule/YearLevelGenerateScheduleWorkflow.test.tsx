import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

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
  }),
}));

import YearLevelGenerateScheduleWorkflow from "./YearLevelGenerateScheduleWorkflow";
import { GenerationRunProvider } from "../hooks/useGenerationRun";
import { clearDataCache } from "../../../../lib/dataCache";
import type { Course, Section, Semester } from "../types";

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
          preferredTimeBlock: "flexible",
          splitCourseIds: [],
          gecSplitCourseIds: [],
          gecSplitPatternsByCourseId: { "20": "MW" },
          modesByCourseId: { "20": "automatic" },
          preferencesByCourseId: { "20": "automatic" },
        },
      },
      setupDraft: {
        completed: true,
        allowedSplitCourseIds: [],
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
    // minor. The table has no exclude control, so all of them must be sent.
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

    // Scope on top, the three rule groups side by side below.
    expect(screen.getByLabelText("Year level")).toBeTruthy();
    expect(screen.getByText("Forced Day")).toBeTruthy();
    expect(screen.getByText("Field Courses")).toBeTruthy();
    expect(screen.getByText("Allowed Split")).toBeTruthy();
    // The step area scrolls: the modal sizes itself to its content, so when
    // the content is taller than the viewport this is what gives.
    expect(container.querySelector("main")?.className).toContain("overflow-y-auto");

    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueButton);

    // Step 2 is one row per course, with a blank cell where a rule cannot apply.
    await waitFor(() => expect(screen.getByRole("columnheader", { name: "Courses" })).toBeTruthy());
    for (const heading of ["Hybrid", "Split", "Configure"]) {
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

    // Step 1: allow GEC 1 to split at all, then move on to the course table.
    fireEvent.click(await screen.findByRole("button", { name: /GEC 1/ }));
    const toStep2 = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((toStep2 as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(toStep2);

    // Turn Split on for the whole year level, then open Configure.
    fireEvent.click(await screen.findByRole("switch", { name: "Split for GEC 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Configure/ }));

    const dialog = await screen.findByRole("dialog", { name: "Configure GEC 1" });
    const exclude = within(dialog).getByRole("switch", {
      name: "Split for GEC 1 in BSIT 1B",
    });
    await waitFor(() => expect(exclude.getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(exclude);
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    // The table now shows the rule as partial rather than on or off.
    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Split for GEC 1" })
          .getAttribute("aria-checked"),
      ).toBe("mixed"),
    );
    expect(screen.getByText("1/2")).toBeTruthy();

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

  it("restricts a section to the period picked on the Preferred Meetings board", async () => {
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

    // The board lives on step 1, one group of periods per section.
    const periods = await screen.findByRole("group", {
      name: "Preferred meeting period for BSIT 1A",
    });
    const afternoon = within(periods).getByRole("button", { name: "Afternoon" });
    expect(afternoon.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(afternoon);
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("group", {
            name: "Preferred meeting period for BSIT 1A",
          }),
        )
          .getByRole("button", { name: "Afternoon" })
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

    fireEvent.click(await screen.findByRole("button", { name: /^Generate$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/schedule-recommendations/year-level-preview/queue",
        expect.objectContaining({
          section_configs: [
            expect.objectContaining({
              section_id: 10,
              preferred_period: "afternoon",
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

  it("warns on the review step that a set period can fail the run", async () => {
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

    fireEvent.click(
      within(
        await screen.findByRole("group", {
          name: "Preferred meeting period for BSIT 1A",
        }),
      ).getByRole("button", { name: "Morning" }),
    );

    for (let step = 1; step <= 2; step += 1) {
      const continueButton = screen.getByRole("button", { name: /^Continue/ });
      await waitFor(() =>
        expect((continueButton as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(continueButton);
    }

    expect(
      await screen.findByText(/restricted to a teaching period/),
    ).toBeTruthy();
  });

  it("sends no period for a section left on any time", async () => {
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
            expect.objectContaining({ preferred_period: null }),
          ],
        }),
      ),
    );
  });

  it("warns when all forced-day courses are assigned to the same day", async () => {
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

    // The board also warns about disabled rule groups, so wait for this one by
    // its text rather than for the first alert to appear.
    const warning = await screen.findByText(/Same-day concentration warning/);
    expect(warning.closest('[role="alert"]')).toBeTruthy();
    expect(warning.textContent).toContain("all 2 forced-day courses are assigned to Monday");
    expect(warning.textContent).toContain("should be reviewed");
  });

});
