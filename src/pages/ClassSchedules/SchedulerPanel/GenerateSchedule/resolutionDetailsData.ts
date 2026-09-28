import type { GenerationChange, GenerationDetectedIssue } from "./generationChanges";
import { describeAdjustment, type GenerationRecommendation } from "./yearLevelGenerationFailure";

/** One step of how a change came about, in the order the generator took it. */
export type ResolutionStep = {
  label: string;
  text?: string;
  items?: string[];
  /** A quieter supporting line under the text. */
  note?: string;
};

export type ResolutionDetails = {
  recommendation: string;
  steps: ResolutionStep[];
  result: string;
};

type Subject = { section_name?: string | null; course_code?: string | null };

/** "GEC 5 in BSIT 3E", or whichever half is known. */
function classLabel({ course_code, section_name }: Subject): string {
  if (course_code && section_name) return `${course_code} in ${section_name}`;
  return course_code || section_name || "";
}

/**
 * The configured setup an adjustment replaced, and why the replacement is
 * easier to place. Each reason restates the retry strategy's own rationale
 * (YearLevelRetryStrategyPlanner) in plain words; types without one get none.
 */
function adjustmentStory(
  type: string,
  targets: Subject[],
  value: string | null | undefined,
): { setup?: string; reason?: string } {
  const who = targets.length === 1 ? classLabel(targets[0]) || "This class" : "These courses";
  const was = targets.length === 1 ? "was" : "were";

  switch (type) {
    case "disable_minor_split":
    case "split_session_single_meeting_fallback":
      return {
        setup: `${who} ${was} set as a Split Session: two equal-length meetings on different days.`,
        reason: "One regular meeting needs only one open time slot instead of two matching slots on different days, so it is easier to fit.",
      };
    case "set_pattern":
      return {
        setup: `${who} ${was} set to meet on fixed ${value === "MW" ? "TTh" : "MW"} days.`,
        reason: `Moving the meetings to ${value} puts them on the less crowded half of the week.`,
      };
    case "clear_pattern":
      return {
        setup: `${who} ${was} set to meet on fixed days (MW or TTh).`,
        reason: "The course still meets twice a week, but the generator can now pick the days that still have free rooms.",
      };
    case "disable_lecture_lab_split":
      return {
        setup: `${who} ${was} set to have separate lecture and lab meetings.`,
        reason: "One combined meeting needs only one open time slot instead of a matching lecture and lab pair.",
      };
    case "disable_section_hybrid":
      return {
        setup: `${who} ${was} set up for hybrid scheduling.`,
        reason: "Scheduling its classes as standard single sessions eases the crowding. Other sections keep hybrid scheduling.",
      };
    case "enable_friday_saturday_split":
      return {
        setup: "Split Sessions could only be paired on MW or TTh.",
        reason: "Friday + Saturday adds a third pair of days once MW and TTh are full. Each course keeps its two meetings.",
      };
    case "enable_hybrid_split":
      return {
        setup: `${who} ${was} set as a Split Session with both meetings on campus.`,
        reason: "Holding one meeting online means only one on-campus time slot is needed.",
      };
    case "set_delivery_mode":
      return value === "automatic"
        ? {
            setup: `${who} ${was} set to meet face-to-face only.`,
            reason: "On Automatic, the generator can use any free room, or hold the class online when no room is free.",
          }
        : { reason: value === "online" ? "Online meetings need free class time, not a room." : undefined };
    case "add_preferred_day":
      return {
        setup: `The Preferred Days did not include ${value}.`,
        reason: `${value} is the least booked day left out, so adding it opens the most free room time.`,
      };
    default:
      return {};
  }
}

/** What blocked the original setup, in plain words (YearLevelGenerationDiagnostics::causeText). */
function detectedIssueText(issue: GenerationDetectedIssue): string {
  const where = classLabel(issue) || "One class";
  const section = issue.section_name || "One section";

  switch (issue.type) {
    case "fixed_pattern":
      return `${where} is set to fixed meeting days, and those days had no open time left.`;
    case "lecture_lab_split":
      return `${where} needs a lecture time and a lab time that fit together, and no such pair was left.`;
    case "balanced_split":
      return `${where} needs two open time slots of the same length on different days, and no such pair was left.`;
    case "laboratory_room":
      return `${where} could not get a free laboratory room; other sections had already taken them.`;
    case "forced_on_site":
      return `Every course in ${section} must meet in a room, so nothing could move online when rooms ran out.`;
    case "limited_rooms":
      return issue.course_code
        ? `Courses in ${section} that must meet in a room, starting with ${issue.course_code}, ran out of free rooms.`
        : `Courses in ${section} that must meet in a room ran out of free rooms.`;
    default:
      return `${section} could not be fitted without a time or room conflict.`;
  }
}

/** The first attempt is always the configuration as entered. */
function attemptsText(failedAttempts: number | undefined): string {
  const others = Math.max(0, (failedAttempts ?? 1) - 1);
  return others === 0
    ? "Your original setup was tried first but could not produce a complete timetable."
    : `Your original setup and ${others} other ${others === 1 ? "attempt" : "attempts"} could not produce a complete timetable.`;
}

function issueStep(change: GenerationChange): ResolutionStep {
  switch (change.kind) {
    case "preference_relaxed":
      // Runs made before the detected issue was reported only know that the
      // original setup failed.
      return change.detected_issue
        ? { label: "Issue found", text: detectedIssueText(change.detected_issue), note: attemptsText(change.failed_attempts) }
        : { label: "Issue found", text: attemptsText(change.failed_attempts) };
    case "split_session_single_meeting":
      return { label: "Issue found", text: "The generator could not find a second open time slot for the other meeting." };
    case "lecture_moved_online":
      return { label: "Issue found", text: "No lecture room was free at a time that fit." };
    default:
      return { label: "Issue found", text: change.description || "The original setup could not be used as entered." };
  }
}

function storyForChange(change: GenerationChange): { setup?: string; reason?: string } {
  const plural = change.items.length !== 1;
  const who = plural ? "These lectures" : classLabel(change.items[0]) || "This lecture";

  switch (change.kind) {
    case "split_session_single_meeting":
      return adjustmentStory("split_session_single_meeting_fallback", change.items, null);
    case "lecture_moved_online":
      return {
        setup: `${who} ${plural ? "were" : "was"} planned to meet in a room.`,
        reason: "An online lecture does not need a room, so it could still be scheduled.",
      };
    default:
      // A retry strategy relaxes one kind of preference, so the first item
      // speaks for the rest.
      return adjustmentStory(
        change.items[0]?.adjustment_type ?? "",
        change.items,
        change.items[0]?.adjustment_value,
      );
  }
}

const presentSteps = (steps: Array<ResolutionStep | null>): ResolutionStep[] =>
  steps.filter((step): step is ResolutionStep => step !== null && Boolean(step.text || step.items?.length));

export function resolutionDetailsForChange(change: GenerationChange): ResolutionDetails {
  const { setup, reason } = storyForChange(change);
  const changesMade = change.items.map((item) =>
    `${[item.section_name, item.course_code].filter(Boolean).join(" / ")}: ${item.detail}`,
  );

  return {
    recommendation: change.title,
    steps: presentSteps([
      setup ? { label: "Original setup", text: setup } : null,
      issueStep(change),
      reason ? { label: "Why this change", text: reason } : null,
      { label: "Change applied", items: changesMade.length > 0 ? changesMade : ["The generated timetable reflects this change."] },
    ]),
    result: "The timetable was generated successfully with this change.",
  };
}

export function resolutionDetailsForRecommendation(
  recommendation: GenerationRecommendation,
): ResolutionDetails {
  const first = recommendation.adjustments[0];
  const { setup, reason } = first
    ? adjustmentStory(
        first.type,
        recommendation.adjustments.filter((adjustment) => adjustment.type === first.type),
        first.value,
      )
    : {};
  // Year-level adjustments repeat once per section with the same wording.
  const changesMade = [...new Set(recommendation.adjustments.map(describeAdjustment))];

  return {
    recommendation: recommendation.title,
    steps: presentSteps([
      setup ? { label: "Original setup", text: setup } : null,
      { label: "Issue found", text: recommendation.detected_cause || "The scheduling setup caused a problem." },
      { label: "Why this change", text: reason ?? recommendation.suggested_adjustment },
      {
        label: "Change applied",
        items: changesMade.length > 0 ? changesMade : ["The generated timetable reflects the accepted recommendation."],
      },
    ]),
    result: "This issue has been resolved.",
  };
}
