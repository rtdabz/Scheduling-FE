import {
  isApplicableRecommendation,
  isYearLevelAdjustment,
  type GenerationAdjustment,
  type GenerationAttempt,
  type GenerationBottleneck,
  type GenerationRecommendation,
} from "./yearLevelGenerationFailure";

export type RecommendationOption = {
  recommendation: GenerationRecommendation;
  label: string;
  action: string;
  effect: string;
  triedAlone: boolean;
};

export type RecommendationGroup = {
  key: string;
  target: string;
  reason: string;
  options: RecommendationOption[];
};

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

export const APPLY_ALL_RECOMMENDATION_ID = "apply-all";

const impactRank: Record<string, number> = { low: 0, medium: 1, high: 2 };

const unique = <T,>(values: T[]): T[] => Array.from(new Set(values));

const find = (recommendation: GenerationRecommendation, type: string): GenerationAdjustment | undefined =>
  recommendation.adjustments.find((adjustment) => adjustment.type === type);

const isRoomCapacityOption = (recommendation: GenerationRecommendation): boolean =>
  recommendation.id.startsWith("room-capacity-");

function optionText(recommendation: GenerationRecommendation): Omit<RecommendationOption, "recommendation" | "triedAlone"> {
  const apply = (label: string, effect: string) => ({ label, action: `Apply ${label}`, effect });
  const verb = (label: string, effect: string) => ({ label, action: label, effect });

  if (isRoomCapacityOption(recommendation)) return apply(recommendation.title, recommendation.suggested_adjustment);

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
    effect: classes.length > 1 && !yearLevel && !isRoomCapacityOption(recommendation)
      ? `${text.effect} (${classes.length} courses)`
      : text.effect,
    triedAlone: attempts.some(
      (attempt) => `strategy-${attempt.strategy}` === recommendation.id && attempt.outcome === "failed",
    ),
  };
}

function targetOf(recommendation: GenerationRecommendation): { key: string; target: string } {
  const adjustments = recommendation.adjustments;
  const first = adjustments[0];
  if (adjustments.every(isYearLevelAdjustment)) return { key: "year-level", target: "Year level" };
  if (isRoomCapacityOption(recommendation)) return { key: "room-capacity", target: "Free Room Time for This Year Level" };

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

const signature = (recommendation: GenerationRecommendation): string =>
  recommendation.adjustments
    .map((adjustment) => `${adjustment.type}|${adjustment.section_id}|${adjustment.course_id}|${adjustment.value ?? ""}`)
    .sort()
    .join(";");

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

const decision = (adjustment: GenerationAdjustment): string => {
  switch (adjustment.type) {
    case "set_pattern":
    case "clear_pattern":
      return "pattern";
    case "set_delivery_mode":
    case "enable_hybrid_split":
    case "set_hybrid_split":
    case "disable_hybrid_split":
      return "delivery";
    case "disable_minor_split":
    case "disable_lecture_lab_split":
      return "shape";
    default:
      return adjustment.type;
  }
};

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
