import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecommendedAdjustmentPanel from "./RecommendedAdjustmentPanel";
import ScheduleSummaryStep from "./ScheduleSummaryStep";
import {
  applyAdjustments,
  type GenerationRecommendation,
  type YearLevelGenerationFailure,
} from "./yearLevelGenerationFailure";

const afternoonSession: GenerationRecommendation = {
  id: "session-course-10-20-afternoon",
  title: "Put BAC 11 in the Afternoon Session",
  detected_cause: "BAC 11 asked for the Morning session, but no free time was left there.",
  suggested_adjustment: "Afternoon (11:30 AM - 4:00 PM) still has 6 free start times for BAC 11.",
  section_id: 10,
  section_name: "BSBA 1A",
  course_id: 20,
  course_code: "BAC 11",
  impact: "low",
  adjustments: [{
    type: "set_time_preference",
    section_id: 10,
    course_id: 20,
    value: "afternoon",
    section_name: "BSBA 1A",
    course_code: "BAC 11",
  }],
  status: "active",
  resolved: false,
};

const advisoryFailure: YearLevelGenerationFailure = {
  message: "No timetable fits the preferred meeting period.",
  stage: "search",
  blockingConstraints: [],
  bottleneck: {
    type: "preferred_period",
    section_id: 10,
    section_name: "BSBA 1G",
    course_id: 20,
    course_code: "PATH FIT",
    detected_cause: "Courses ran out of eligible room-time inside the selected period.",
    iterations: 0,
    search_limit_reached: false,
  },
  attempts: [],
  recommendations: [{
    id: "preferred-period-too-narrow",
    title: "Widen or clear BSBA 1G's meeting period",
    detected_cause: "The section is restricted to Evening.",
    suggested_adjustment: "Set the Preferred Meetings period back to Any time, then generate again.",
    section_id: 10,
    section_name: "BSBA 1G",
    course_id: 20,
    course_code: "PATH FIT",
    impact: "high",
    adjustments: [],
    status: "active",
    resolved: false,
  }],
};

afterEach(() => cleanup());

describe("RecommendedAdjustmentPanel", () => {
  it("integrates advisory recommendations when no automatic adjustment exists", () => {
    const onReviewConstraints = vi.fn();

    render(
      <RecommendedAdjustmentPanel
        failure={advisoryFailure}
        busy={false}
        onApplyAndRetry={vi.fn()}
        onReviewConstraints={onReviewConstraints}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Manual recommendations")).toBeTruthy();
    expect(screen.getByText("Widen or clear BSBA 1G's meeting period")).toBeTruthy();
    expect(screen.queryByText("No recommendation is available for this failure.")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Review Constraints" })[0]);
    expect(onReviewConstraints).toHaveBeenCalledWith(10);
  });

  it("offers Apply this to the course once a session recommendation is selected", () => {
    const onApplyAndRetry = vi.fn();
    render(
      <RecommendedAdjustmentPanel
        failure={{ ...advisoryFailure, recommendations: [afternoonSession] }}
        busy={false}
        onApplyAndRetry={onApplyAndRetry}
        onReviewConstraints={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Apply this to BAC 11 in BSBA 1A/ }));
    expect(onApplyAndRetry).toHaveBeenCalledWith(afternoonSession);
  });
});

describe("ScheduleSummaryStep recommendations", () => {
  it("shows the Apply action only for the selected recommendation", () => {
    const onApply = vi.fn();
    render(
      <ScheduleSummaryStep
        preview={[]}
        sections={[]}
        courses={[]}
        roomCodeById={new Map()}
        changes={null}
        recommendations={[afternoonSession]}
        onApplyRecommendation={onApply}
      />,
    );

    expect(screen.queryByRole("button", { name: /Apply this to/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Put BAC 11 in the Afternoon Session/ }));
    fireEvent.click(screen.getByRole("button", { name: /Apply this to BAC 11 in BSBA 1A/ }));
    expect(onApply).toHaveBeenCalledWith(afternoonSession);
  });
});

describe("applying a session recommendation", () => {
  it("writes the session into the course's preference", () => {
    const configs = {
      "10": {
        splitCourseIds: [],
        gecSplitCourseIds: [],
        gecSplitPatternsByCourseId: {},
        modesByCourseId: {},
        preferencesByCourseId: { "20": "morning" },
      },
    };

    const { configs: next, applied } = applyAdjustments(configs, afternoonSession.adjustments);

    expect(applied).toHaveLength(1);
    expect(next["10"].preferencesByCourseId?.["20"]).toBe("afternoon");
  });
});
