import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResolutionDetailsButton from "./ResolutionDetails";
import { resolutionDetailsForChange, resolutionDetailsForRecommendation } from "./resolutionDetailsData";
import type { GenerationChange } from "./generationChanges";
import type { GenerationRecommendation } from "./yearLevelGenerationFailure";

const splitChange: GenerationChange = {
  kind: "preference_relaxed",
  severity: "warning",
  title: "Schedule GEC 5 as one regular meeting",
  description: "Turn off Split Session for GEC 5 in BSIT 3E so it needs one full-length meeting instead of two vacant equal-length meetings on different days.",
  items: [{
    section_id: 1,
    section_name: "BSIT 3E",
    course_id: 10,
    course_code: "GEC 5",
    detail: "Split Session turned off; scheduled as one meeting",
    adjustment_type: "disable_minor_split",
    adjustment_value: null,
  }],
  status: "resolved",
  resolved: true,
  detected_issue: {
    type: "balanced_split",
    section_name: "BSIT 3E",
    course_code: "GEC 5",
    detected_cause: "The Split schedule on GEC 5 needs two vacant equal-length meetings, and no complete pair remains.",
  },
  failed_attempts: 2,
};

const recommendation: GenerationRecommendation = {
  id: "preferred-days-add-day-1",
  title: "Recommend adding another day",
  detected_cause: "Preferred days limited available scheduling slots.",
  suggested_adjustment: "Add Friday as an additional preferred day.",
  section_id: 1,
  section_name: "BSIT 1A",
  course_id: null,
  course_code: null,
  impact: "low",
  adjustments: [],
  status: "resolved",
  resolved: true,
};

describe("ResolutionDetails", () => {
  it("walks a retry through setup, detected issue, reason, change and result", () => {
    expect(resolutionDetailsForChange(splitChange)).toEqual({
      recommendation: "Schedule GEC 5 as one regular meeting",
      steps: [
        {
          label: "Original setup",
          text: "GEC 5 in BSIT 3E was set as a Split Session: two equal-length meetings on different days.",
        },
        {
          label: "Issue found",
          text: "GEC 5 in BSIT 3E needs two open time slots of the same length on different days, and no such pair was left.",
          note: "Your original setup and 1 other attempt could not produce a complete timetable.",
        },
        {
          label: "Why this change",
          text: "One regular meeting needs only one open time slot instead of two matching slots on different days, so it is easier to fit.",
        },
        { label: "Change applied", items: ["BSIT 3E / GEC 5: Split Session turned off; scheduled as one meeting"] },
      ],
      result: "The timetable was generated successfully with this change.",
    });
  });

  it("does not guess a cause for runs stored before the detected issue was reported", () => {
    const details = resolutionDetailsForChange({
      ...splitChange,
      items: [{
        section_id: 1,
        section_name: "BSIT 3E",
        course_id: 10,
        course_code: "GEC 5",
        detail: "Split Session turned off; scheduled as one meeting",
      }],
      detected_issue: undefined,
      failed_attempts: undefined,
    });

    expect(details.steps.map((step) => step.label)).toEqual(["Issue found", "Change applied"]);
    expect(details.steps[0].text).toBe("Your original setup was tried first but could not produce a complete timetable.");
  });

  it("opens a read-only Resolution Summary modal for a resolved recommendation", () => {
    render(<ResolutionDetailsButton details={resolutionDetailsForRecommendation(recommendation)} />);

    fireEvent.click(screen.getByRole("button", { name: "Resolution Details" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Resolution Summary")).toBeTruthy();
    expect(screen.getByText("Recommend adding another day")).toBeTruthy();
    expect(screen.getByText("Preferred days limited available scheduling slots.")).toBeTruthy();
    expect(screen.getByText("Add Friday as an additional preferred day.")).toBeTruthy();
    expect(screen.getByText("The generated timetable reflects the accepted recommendation.")).toBeTruthy();
    expect(screen.getByText("This issue has been resolved.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
