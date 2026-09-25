import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecommendedAdjustmentPanel from "./RecommendedAdjustmentPanel";
import ScheduleSummaryStep from "./ScheduleSummaryStep";
import { APPLY_ALL_RECOMMENDATION_ID } from "./recommendationGroups";
import {
  type GenerationAdjustment,
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

/** One fix for GEC 1 in BSIT 1A, the stuck Split Session. */
const splitFix = (id: string, adjustment: Partial<GenerationAdjustment>, impact = "medium"): GenerationRecommendation => ({
  id,
  title: id,
  detected_cause: "GEC 1 has no two free on-site slots for its Split Session.",
  suggested_adjustment: "",
  section_id: 1,
  section_name: "BSIT 1A",
  course_id: 5,
  course_code: "GEC 1",
  impact,
  adjustments: [{
    type: "set_delivery_mode",
    section_id: 1,
    course_id: 5,
    value: null,
    section_name: "BSIT 1A",
    course_code: "GEC 1",
    ...adjustment,
  }],
  status: "active",
  resolved: false,
});

const hybridSplit = splitFix("recommend-hybrid-split-1-5", { type: "enable_hybrid_split" });
const onlineSplit = splitFix("recommend-online-split-1-5", { type: "set_delivery_mode", value: "online" });
const regularMeeting = splitFix("recommend-regular-meeting-1-5", { type: "disable_minor_split" }, "high");
const addTuesday: GenerationRecommendation = {
  id: "add-preferred-day-tuesday",
  title: "Add Tuesday to the Preferred Days",
  detected_cause: "The Preferred Days limit every section to Monday, Wednesday.",
  suggested_adjustment: "",
  section_id: null,
  section_name: null,
  course_id: null,
  course_code: null,
  impact: "medium",
  adjustments: [1, 2].map((sectionId) => ({
    type: "add_preferred_day",
    section_id: sectionId,
    course_id: 0,
    value: "Tuesday",
  })),
  status: "active",
  resolved: false,
};

const splitFailure: YearLevelGenerationFailure = {
  message: "No year-level timetable satisfies all section constraints after 3 generation attempts.",
  stage: "search",
  blockingConstraints: [{ code: "limited", message: "Rooms are full on MW.", suggested_action: "Free a room." }],
  bottleneck: {
    type: "balanced_split",
    section_id: 1,
    section_name: "BSIT 1A",
    course_id: 5,
    course_code: "GEC 1",
    detected_cause: "The Split schedule on GEC 1 needs two vacant equal-length meetings.",
    iterations: 1200,
    search_limit_reached: true,
  },
  attempts: [],
  recommendations: [regularMeeting, hybridSplit, onlineSplit, addTuesday],
};

const renderPanel = (failure: YearLevelGenerationFailure, props: Partial<Parameters<typeof RecommendedAdjustmentPanel>[0]> = {}) =>
  render(
    <RecommendedAdjustmentPanel
      failure={failure}
      busy={false}
      onApplyAndRetry={vi.fn()}
      onReviewConstraints={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />,
  );

afterEach(() => cleanup());

describe("RecommendedAdjustmentPanel", () => {
  it("shows a provisional report as still searching, with Keep searching and Stop generating", () => {
    const onKeepSearching = vi.fn();
    const onCancel = vi.fn();

    renderPanel(
      { ...advisoryFailure, provisional: true, recommendations: [onlineRecommendation] },
      { onCancel, onKeepSearching },
    );

    expect(screen.getByText(/Still searching/)).toBeTruthy();
    // Applying is allowed while the search runs; it stops that search first.
    expect(screen.getByRole("button", { name: "Apply Online to BAC 11 · BSBA 1A" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Keep searching/ }));
    fireEvent.click(screen.getByRole("button", { name: /Stop generating/ }));
    expect(onKeepSearching).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("offers no Keep searching on a final report", () => {
    renderPanel(advisoryFailure, { onKeepSearching: vi.fn() });

    expect(screen.queryByRole("button", { name: /Keep searching/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeTruthy();
  });

  it("lists advice it cannot apply as a manual change", () => {
    const onReviewConstraints = vi.fn();
    renderPanel(advisoryFailure, { onReviewConstraints });

    expect(screen.getByText("Needs a manual change")).toBeTruthy();
    expect(screen.getByText("Free room time for BSBA 1G")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Review$/ }));
    expect(onReviewConstraints).toHaveBeenCalledWith(10);
  });

  it("says what blocked the run in one line and keeps the evidence under Details", () => {
    renderPanel(splitFailure);

    expect(screen.getByText("BSIT 1A · GEC 1:")).toBeTruthy();
    expect(screen.getByText(/needs two vacant equal-length meetings/)).toBeTruthy();
    // Blocking constraints and the search are folded away, not banners.
    expect(screen.queryByText("Rooms are full on MW.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("Rooms are full on MW.")).toBeTruthy();
    expect(screen.getByText(/1,200 steps, search limit reached/)).toBeTruthy();
  });

  it("offers a stuck Split Session's alternatives as choices on one row", () => {
    const onApplyAndRetry = vi.fn();
    renderPanel(splitFailure, { onApplyAndRetry });

    // One row for GEC 1, its fixes as choices: untried and least disruptive first.
    const choices = within(screen.getByRole("radiogroup", { name: "Fixes for GEC 1 · BSIT 1A" }));
    expect(choices.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Hybrid",
      "Online (All)",
      "Regular",
    ]);

    fireEvent.click(choices.getByRole("radio", { name: "Online (All)" }));
    expect(screen.getByText(/Both meetings online/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply Online (All) to GEC 1 · BSIT 1A" }));
    expect(onApplyAndRetry).toHaveBeenCalledWith(onlineSplit);
  });

  it("applies the chosen fix of every row at once", () => {
    const onApplyAndRetry = vi.fn();
    renderPanel(splitFailure, { onApplyAndRetry });

    fireEvent.click(screen.getByRole("radio", { name: "Online (All)" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply all \(2\)/ }));

    const combined = onApplyAndRetry.mock.calls[0][0] as GenerationRecommendation;
    expect(combined.id).toBe(APPLY_ALL_RECOMMENDATION_ID);
    // Online for GEC 1 and Tuesday for the year level -- never Hybrid or
    // Regular beside it.
    expect(combined.adjustments.map((adjustment) => adjustment.type)).toEqual([
      "set_delivery_mode",
      "add_preferred_day",
      "add_preferred_day",
    ]);
  });
});

describe("ScheduleSummaryStep recommendations", () => {
  it("offers a suggestion with its own Apply button", () => {
    const onApply = vi.fn();
    render(
      <ScheduleSummaryStep
        preview={[]}
        sections={[]}
        courses={[]}
        roomCodeById={new Map()}
        changes={null}
        recommendations={[addTuesday]}
        onApplyRecommendation={onApply}
      />,
    );

    expect(screen.getByText("Suggestions")).toBeTruthy();
    // A single suggestion has nothing to combine.
    expect(screen.queryByRole("button", { name: /Apply all/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Tuesday to Year level" }));
    expect(onApply).toHaveBeenCalledWith(addTuesday);
  });
});
