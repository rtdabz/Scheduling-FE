import type { GenerationChange } from "./generationChanges";
import { describeAdjustment, type GenerationRecommendation } from "./yearLevelGenerationFailure";

export type ResolutionDetails = {
  recommendation: string;
  originalIssue: string;
  actionTaken: string;
  changesMade: string[];
  result: string;
};

export function resolutionDetailsForChange(change: GenerationChange): ResolutionDetails {
  const actionTaken = (() => {
    switch (change.kind) {
      case "preference_relaxed":
        return "The generator applied the reported preference adjustment and regenerated the timetable.";
      case "lecture_moved_online":
        return "The affected lecture was moved online so the timetable could use the available capacity.";
      case "split_session_single_meeting":
        return "The affected course was scheduled as one meeting instead of two.";
      default:
        return change.title;
    }
  })();

  const changesMade = change.items.map((item) =>
    `${item.section_name} / ${item.course_code}: ${item.detail}`,
  );

  return {
    recommendation: change.title,
    originalIssue: change.description || "The original configuration could not be used as entered.",
    actionTaken,
    changesMade: changesMade.length > 0 ? changesMade : ["The generated timetable reflects this adjustment."],
    result: "The timetable was generated successfully with this change, so it is no longer an active scheduling concern.",
  };
}

export function resolutionDetailsForRecommendation(
  recommendation: GenerationRecommendation,
): ResolutionDetails {
  const changesMade = recommendation.adjustments.map((adjustment) => describeAdjustment(adjustment));

  return {
    recommendation: recommendation.title,
    originalIssue: recommendation.detected_cause || "The scheduling configuration created an active concern.",
    actionTaken: recommendation.suggested_adjustment || "The recommended scheduling adjustment was applied.",
    changesMade: changesMade.length > 0
      ? changesMade
      : ["The generated timetable reflects the accepted recommendation."],
    result: "The issue was resolved and is no longer treated as an active scheduling concern.",
  };
}
