import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecommendedAdjustmentPanel from "./RecommendedAdjustmentPanel";
import ScheduleSummaryStep from "./ScheduleSummaryStep";
import {
  type GenerationRecommendation,
  type YearLevelGenerationFailure,
} from "./yearLevelGenerationFailure";

const onlineRecommendation: GenerationRecommendation = {
  id: "delivery-course-10-20-online",
  title: "Move BAC 11 online",
  detected_cause: "BAC 11 ran out of free classroom time.",
  suggested_adjustment: "Deliver BAC 11 online so it no longer needs a classroom.",
  section_id: 10,
  section_name: "BSBA 1A",
  course_id: 20,
  course_code: "BAC 11",
  impact: "low",
  adjustments: [{
    type: "set_delivery_mode",
    section_id: 10,
    course_id: 20,
    value: "online",
    section_name: "BSBA 1A",
    course_code: "BAC 11",
  }],
  status: "active",
  resolved: false,
};

const advisoryFailure: YearLevelGenerationFailure = {
  message: "No timetable fits the available rooms.",
  stage: "search",
  blockingConstraints: [],
  bottleneck: {
    type: "room_capacity",
    section_id: 10,
    section_name: "BSBA 1G",
    course_id: 20,
    course_code: "PATH FIT",
    detected_cause: "Courses ran out of eligible room-time.",
    iterations: 0,
    search_limit_reached: false,
  },
  attempts: [],
  recommendations: [{
    id: "free-room-time",
    title: "Free room time for BSBA 1G",
    detected_cause: "Every eligible room is booked.",
    suggested_adjustment: "Add a room or add another Preferred Day, then generate again.",
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
    expect(screen.getByText("Free room time for BSBA 1G")).toBeTruthy();
    expect(screen.queryByText("No recommendation is available for this failure.")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Review Constraints" })[0]);
    expect(onReviewConstraints).toHaveBeenCalledWith(10);
  });

  it("offers Apply this to the course once an applicable recommendation is selected", () => {
    const onApplyAndRetry = vi.fn();
    render(
      <RecommendedAdjustmentPanel
        failure={{ ...advisoryFailure, recommendations: [onlineRecommendation] }}
        busy={false}
        onApplyAndRetry={onApplyAndRetry}
        onReviewConstraints={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Apply this to BAC 11 in BSBA 1A/ }));
    expect(onApplyAndRetry).toHaveBeenCalledWith(onlineRecommendation);
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
        recommendations={[onlineRecommendation]}
        onApplyRecommendation={onApply}
      />,
    );

    expect(screen.queryByRole("button", { name: /Apply this to/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Move BAC 11 online/ }));
    fireEvent.click(screen.getByRole("button", { name: /Apply this to BAC 11 in BSBA 1A/ }));
    expect(onApply).toHaveBeenCalledWith(onlineRecommendation);
  });
});
