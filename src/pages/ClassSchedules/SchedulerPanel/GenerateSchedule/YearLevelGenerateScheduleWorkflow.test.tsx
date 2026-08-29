import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import type { Course, Section, Term } from "../types";

afterEach(cleanup);

const activeTerm: Term = {
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
  termId: 1,
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

describe("YearLevelGenerateScheduleWorkflow", () => {
  beforeEach(() => {
    localStorage.clear();
    get.mockReset();
    post.mockReset();
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({ data: { forced_day_rules: [], field_course_codes: [] } });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
  });

  it("polls the queued result, saves it, waits for refresh, and then closes", async () => {
    const generatedSchedule = {
      id: 501,
      term_id: 1,
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
    localStorage.setItem("wicars.year-level-wizard.v4.2.1", JSON.stringify({
      step: 5,
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
        activeStage: "allowed-split",
        completed: true,
        allowedSplitCourseIds: [],
      },
    }));
    get.mockImplementation((url: string) => {
      if (url === "/scheduling-settings") {
        return Promise.resolve({ data: { forced_day_rules: [], field_course_codes: [] } });
      }
      if (url === "/rooms") return Promise.resolve({ data: [] });
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

    render(
      <YearLevelGenerateScheduleWorkflow
        onClose={onClose}
        sections={sections}
        courses={courses}
        activeTerm={activeTerm}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={onAccepted}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Generate Schedule" }));
    await screen.findByRole("heading", { name: "Generated Schedule Preview" });
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
        replace_term_id: 1,
      }),
    ));
    expect(onAccepted).toHaveBeenCalledWith([generatedSchedule]);
    expect(onClose).not.toHaveBeenCalled();

    finishRefresh?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("renders the five-step year-level workflow and separates selection from configuration", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <YearLevelGenerateScheduleWorkflow
        onClose={onClose}
        sections={sections}
        courses={courses}
        activeTerm={activeTerm}
        departmentId={2}
        existingSchedules={[]}
        onAccepted={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("navigation", { name: "Schedule generator steps" }).length).toBe(2);
    expect(screen.getAllByText("Choose Year").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Generate Schedule").length).toBeGreaterThan(0);
    expect(screen.queryByText("Generate by")).toBeNull();
    expect(screen.getByLabelText("Academic term").className).toContain("bg-slate-100");
    expect(screen.getByLabelText("Academic term").tagName).toBe("SPAN");
    expect(screen.getByText("Current: 1st Semester").className).toContain("bg-[#4e0a10]");
    expect(screen.getByLabelText("Year level").className).toContain("h-12");
    expect(screen.getByText("Included in year-level generation").closest("div")?.className).toContain("min-h-[64px]");
    expect(screen.getByRole("group", { name: "Selected year level and included sections" }).textContent).toContain("BSIT 1A");
    expect(container.querySelector("main")?.className).toContain("overflow-hidden");
    expect(container.querySelector(".fixed.inset-0")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close schedule generator" }));
    expect(onClose).toHaveBeenCalledOnce();

    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    await waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(continueButton);

    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Schedule Setup" }).length).toBeGreaterThan(0));
    expect(screen.getAllByText("Forced Day Rules").length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { name: "Available forced-day courses" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Configured forced-day courses" })).toBeTruthy();
    expect(container.querySelector("main")?.className).toContain("overflow-hidden");
    expect(screen.getAllByText("Allowed Split Sessions").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Choose the year level to generate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Set special requirements").length).toBeGreaterThan(0);

    for (let index = 0; index < 2; index += 1) {
      const saveButton = screen.getByRole("button", { name: /^Save & Continue/ });
      fireEvent.click(saveButton);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /Save & Continue|Finish Setup/ }).length).toBeGreaterThan(0));
    }
    fireEvent.click(screen.getByRole("button", { name: /Finish Setup/ }));
    await waitFor(() => expect((screen.getByRole("button", { name: /^Continue/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Section Schedule" })).toBeTruthy());
  });

});
