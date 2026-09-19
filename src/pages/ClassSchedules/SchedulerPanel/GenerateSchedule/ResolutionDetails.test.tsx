import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResolutionDetailsButton from "./ResolutionDetails";
import { resolutionDetailsForChange, resolutionDetailsForRecommendation } from "./resolutionDetailsData";
import type { GenerationChange } from "./generationChanges";
import type { GenerationRecommendation } from "./yearLevelGenerationFailure";

const change: GenerationChange = {
  kind: "preference_relaxed",
  severity: "warning",
  title: "Recommend adding another day",
  description: "Preferred days limited available scheduling slots.",
  items: [{
    section_id: 1,
    section_name: "BSIT 1A",
    course_id: 10,
    course_code: "GEC 1",
    detail: "Monday, Wednesday -> Monday, Wednesday, Friday",
  }],
  status: "resolved",
  resolved: true,
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
  it("builds the five-part summary from a resolved generation change", () => {
    expect(resolutionDetailsForChange(change)).toEqual({
      recommendation: "Recommend adding another day",
      originalIssue: "Preferred days limited available scheduling slots.",
      actionTaken: "The generator applied the reported preference adjustment and regenerated the timetable.",
      changesMade: ["BSIT 1A / GEC 1: Monday, Wednesday -> Monday, Wednesday, Friday"],
      result: "The timetable was generated successfully with this change, so it is no longer an active scheduling concern.",
    });
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

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
