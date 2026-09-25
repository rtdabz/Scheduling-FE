/**
 * Turns the generator's recommendations into a short list of choices.
 *
 * The server sends one recommendation per possible change, and several of them
 * are alternatives for the same class: Hybrid Split, Online Split and one
 * Regular meeting all fix the same stuck Split Session. Shown one banner each,
 * a single failure filled the screen. Here they become one group per thing
 * being changed, each option with a short name and a one-line effect, so the
 * user picks one per group -- and "Apply all" can take one from every group
 * without applying two contradictory fixes.
 */

import {
  isApplicableRecommendation,
  isYearLevelAdjustment,
  type GenerationAdjustment,
  type GenerationAttempt,
  type GenerationBottleneck,
  type GenerationRecommendation,
} from "./yearLevelGenerationFailure";

/** One way to fix a group, as it reads in the panel. */
export type RecommendationOption = {
  recommendation: GenerationRecommendation;
  /** The choice's name: "Hybrid", "Online (All)", "Add Tuesday". */
  label: string;
  /** Its button: "Apply Hybrid", "Add Tuesday". */
  action: string;
  /** What applying it changes, in one short line. */
  effect: string;
  /** The generator already retried with this change alone, without a timetable. */
  triedAlone: boolean;
};

/** Alternative fixes for one course, one section, or the whole year level. */
export type RecommendationGroup = {
  key: string;
  /** What the fixes change: "GEC 1 · BSIT 1A", "BSIT 1A", "Year level". */
  target: string;
  /** Why they are offered, when the run's own explanation does not say it. */
  reason: string;
  options: RecommendationOption[];
};

/** Advice the wizard cannot apply itself: rooms, course data, department rules. */
export type ManualRecommendation = {
  key: string;
  title: string;
  action: string;
  sectionId: number | null;
  sectionNames: string[];
};

export type GroupedRecommendations = {
  groups: RecommendationGroup[];
  manual: ManualRecommendation[];
  resolved: GenerationRecommendation[];
};

/** The id of the combined recommendation "Apply all" hands to the wizard. */
export const APPLY_ALL_RECOMMENDATION_ID = "apply-all";

const impactRank: Record<string, number> = { low: 0, medium: 1, high: 2 };

const unique = <T,>(values: T[]): T[] => Array.from(new Set(values));

const find = (recommendation: GenerationRecommendation, type: string): GenerationAdjustment | undefined =>
  recommendation.adjustments.find((adjustment) => adjustment.type === type);

/** Name, button and effect for one recommendation, read from what it changes. */
function optionText(recommendation: GenerationRecommendation): Omit<RecommendationOption, "recommendation" | "triedAlone"> {
  const apply = (label: string, effect: string) => ({ label, action: `Apply ${label}`, effect });
  const verb = (label: string, effect: string) => ({ label, action: label, effect });

  const mode = find(recommendation, "set_delivery_mode");
  const pattern = find(recommendation, "set_pattern");
  const day = find(recommendation, "add_preferred_day");

  if (find(recommendation, "enable_hybrid_split")) return apply("Hybrid", "One meeting online, one on campus.");
  if (mode?.value === "online") {
    return recommendation.id.startsWith("recommend-online-split-")
      ? apply("Online (All)", "Both meetings online, so no room is needed.")
      : apply("Online", "Meets online, so no room is needed.");
  }
  if (mode?.value === "on-site") return apply("On-site", "Meets on campus.");
  if (mode) return apply("Automatic mode", "The generator picks on-site or online.");
  if (find(recommendation, "disable_minor_split")) return apply("Regular", "One full-length meeting instead of two.");
  if (find(recommendation, "disable_hybrid_split")) return apply("Split (on-site)", "Both meetings on campus.");
  if (pattern?.value) return apply(pattern.value, `Meets on the ${pattern.value} days.`);
  if (find(recommendation, "clear_pattern")) return apply("Auto days", "The generator picks the two days.");
  if (find(recommendation, "disable_lecture_lab_split")) return apply("Single block", "Lecture and lab meet together, not as two sessions.");
  if (find(recommendation, "disable_section_hybrid")) return verb("Turn off Integrated", "Lecture and lab meet together in this section.");
  if (find(recommendation, "enable_friday_saturday_split")) return verb("Allow Fri + Sat", "Split courses may also meet on Friday and Saturday.");
  if (day?.value) return verb(`Add ${day.value}`, `Opens ${day.value} for every section.`);
  return { label: recommendation.title, action: "Apply", effect: recommendation.suggested_adjustment };
}

/**
 * A recommendation as a choice. `attempts` is the run's retry ladder: a
 * relaxation it already tried alone is still offered -- combined with another
 * fix it may work -- but says so, and ranks after untried ones.
 */
export function describeOption(
  recommendation: GenerationRecommendation,
  attempts: GenerationAttempt[] = [],
): RecommendationOption {
  const text = optionText(recommendation);
  const classes = unique(recommendation.adjustments.map((adjustment) => `${adjustment.section_id}|${adjustment.course_id}`));
  const yearLevel = recommendation.adjustments.every(isYearLevelAdjustment);

  return {
    recommendation,
    ...text,
    effect: classes.length > 1 && !yearLevel ? `${text.effect} (${classes.length} courses)` : text.effect,
    triedAlone: attempts.some(
      (attempt) => `strategy-${attempt.strategy}` === recommendation.id && attempt.outcome === "failed",
    ),
  };
}

/** Where a recommendation's changes land, which is what groups alternatives. */
function targetOf(recommendation: GenerationRecommendation): { key: string; target: string } {
  const adjustments = recommendation.adjustments;
  const first = adjustments[0];
  if (adjustments.every(isYearLevelAdjustment)) return { key: "year-level", target: "Year level" };

  const classes = unique(adjustments.map((adjustment) => `${adjustment.section_id}|${adjustment.course_id}`));
  const sectionName = recommendation.section_name || first.section_name || `Section ${first.section_id}`;
  if (classes.length === 1 && first.course_id > 0) {
    const courseCode = recommendation.course_code || first.course_code || `Course ${first.course_id}`;
    return { key: `class:${classes[0]}`, target: `${courseCode} · ${sectionName}` };
  }

  const sections = unique(adjustments.map((adjustment) => adjustment.section_id));
  if (sections.length === 1) return { key: `section:${sections[0]}`, target: sectionName };

  return { key: `recommendation:${recommendation.id}`, target: recommendation.title };
}

/** Two recommendations that make exactly the same changes are one choice. */
const signature = (recommendation: GenerationRecommendation): string =>
  recommendation.adjustments
    .map((adjustment) => `${adjustment.type}|${adjustment.section_id}|${adjustment.course_id}|${adjustment.value ?? ""}`)
    .sort()
    .join(";");

/**
 * Group a report's recommendations. The bottleneck's own class comes first,
 * and its reason is left to the run's headline so it is not said twice.
 */
export function groupRecommendations(
  recommendations: GenerationRecommendation[],
  attempts: GenerationAttempt[] = [],
  bottleneck: Pick<GenerationBottleneck, "section_id" | "course_id" | "detected_cause"> | null = null,
): GroupedRecommendations {
  const groups = new Map<string, RecommendationGroup>();
  const manual = new Map<string, ManualRecommendation>();
  const resolved: GenerationRecommendation[] = [];

  for (const recommendation of recommendations) {
    if (recommendation.resolved || recommendation.status === "resolved") {
      resolved.push(recommendation);
      continue;
    }

    if (!isApplicableRecommendation(recommendation)) {
      // The same advice repeated per section reads as one line naming them.
      const key = `${recommendation.title}|${recommendation.suggested_adjustment}`;
      const existing = manual.get(key);
      const sectionName = recommendation.section_name ?? "";
      if (existing) {
        if (sectionName && !existing.sectionNames.includes(sectionName)) existing.sectionNames.push(sectionName);
      } else {
        manual.set(key, {
          key,
          title: recommendation.title,
          action: recommendation.suggested_adjustment || recommendation.detected_cause,
          sectionId: recommendation.section_id,
          sectionNames: sectionName ? [sectionName] : [],
        });
      }
      continue;
    }

    const { key, target } = targetOf(recommendation);
    const group = groups.get(key) ?? { key, target, reason: recommendation.detected_cause, options: [] };
    if (!group.options.some((option) => signature(option.recommendation) === signature(recommendation))) {
      group.options.push(describeOption(recommendation, attempts));
    }
    groups.set(key, group);
  }

  const bottleneckKey = bottleneck?.course_id
    ? `class:${bottleneck.section_id}|${bottleneck.course_id}`
    : null;
  const ordered = [...groups.values()].map((group) => {
    // Untried fixes first, then the ones that change the least.
    const options = [...group.options].sort(
      (left, right) =>
        Number(left.triedAlone) - Number(right.triedAlone)
        || (impactRank[left.recommendation.impact] ?? 1) - (impactRank[right.recommendation.impact] ?? 1),
    );
    const repeatsHeadline = group.key === bottleneckKey || group.reason === bottleneck?.detected_cause;
    return { ...group, options, reason: repeatsHeadline ? "" : group.reason };
  });
  ordered.sort((left, right) => Number(right.key === bottleneckKey) - Number(left.key === bottleneckKey));

  return { groups: ordered, manual: [...manual.values()], resolved };
}

/**
 * What an adjustment decides for its class. Two fixes deciding the same thing
 * for one class contradict each other -- a section-wide "Automatic mode" and a
 * course's "Online" -- so "Apply all" keeps the first, from the group listed
 * first. Different things (days and delivery) combine freely.
 */
const decision = (adjustment: GenerationAdjustment): string => {
  switch (adjustment.type) {
    case "set_pattern":
    case "clear_pattern":
      return "pattern";
    case "set_delivery_mode":
    case "enable_hybrid_split":
    case "disable_hybrid_split":
      return "delivery";
    case "disable_minor_split":
    case "disable_lecture_lab_split":
      return "shape";
    default:
      return adjustment.type;
  }
};

/** One recommendation carrying every chosen fix, for "Apply all". */
export function combineRecommendations(recommendations: GenerationRecommendation[]): GenerationRecommendation {
  const decided = new Set<string>();
  const adjustments: GenerationAdjustment[] = [];
  for (const recommendation of recommendations) {
    for (const adjustment of recommendation.adjustments) {
      const key = `${decision(adjustment)}|${adjustment.section_id}|${adjustment.course_id}`;
      if (decided.has(key)) continue;
      decided.add(key);
      adjustments.push(adjustment);
    }
  }

  return {
    id: APPLY_ALL_RECOMMENDATION_ID,
    title: `${recommendations.length} recommendations`,
    detected_cause: "",
    suggested_adjustment: "",
    section_id: null,
    section_name: null,
    course_id: null,
    course_code: null,
    impact: "high",
    adjustments,
    status: "active",
    resolved: false,
  };
}
