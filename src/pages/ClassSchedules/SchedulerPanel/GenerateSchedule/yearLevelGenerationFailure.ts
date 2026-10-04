import { orderDays } from "./generationTypes";

export type AdjustmentType =
  | "set_pattern"
  | "clear_pattern"
  | "disable_lecture_lab_split"
  | "disable_minor_split"
  | "enable_hybrid_split"
  | "set_hybrid_split"
  | "disable_hybrid_split"
  | "disable_section_hybrid"
  | "enable_friday_saturday_split"
  | "add_preferred_day"
  | "set_delivery_mode"
  | "split_session_single_meeting_fallback";

export type GenerationAdjustment = {
  type: AdjustmentType | string;
  section_id: number;
  course_id: number;
  value: string | null;
  section_name?: string;
  course_code?: string;
  reason?: string;
};

export type GenerationRecommendation = {
  id: string;
  title: string;
  detected_cause: string;
  suggested_adjustment: string;
  section_id: number | null;
  section_name: string | null;
  course_id: number | null;
  course_code: string | null;
  impact: "low" | "medium" | "high" | string;
  adjustments: GenerationAdjustment[];
  status?: "active" | "resolved" | string;
  resolved?: boolean;
};

export type BlockingConstraint = {
  code: string;
  message: string;
  suggested_action: string;
  section_id?: number | null;
  context?: Record<string, unknown>;
};

export type GenerationAttempt = {
  strategy: string;
  label: string;
  description: string;
  outcome: "succeeded" | "failed" | "skipped_no_time" | "not_applicable" | string;
  section_id: number | null;
  section_name: string | null;
  iterations: number;
  search_limit_reached: boolean;
};

export type GenerationBottleneck = {
  type: string;
  section_id: number;
  section_name: string;
  course_id: number | null;
  course_code: string | null;
  detected_cause: string;
  iterations: number;
  search_limit_reached: boolean;
};

export type YearLevelGenerationFailure = {
  message: string;
  stage: "feasibility" | "search" | string;
  blockingConstraints: BlockingConstraint[];
  bottleneck: GenerationBottleneck | null;
  attempts: GenerationAttempt[];
  recommendations: GenerationRecommendation[];
  provisional?: boolean;
  searchIncomplete?: boolean;
};

export type AppliedStrategy = {
  key: string;
  label: string;
  description: string;
  impact: string;
};

export type AdjustableSectionConfig = {
  splitCourseIds: string[];
  gecSplitCourseIds: string[];
  hybridSplitCourseIds?: string[];
  gecSplitPatternsByCourseId: Record<string, string>;
  modesByCourseId: Record<string, string>;
};

const stageLabels: Record<string, string> = {
  feasibility: "Blocked before generation",
  search: "No valid timetable found",
};

export const failureStageLabel = (stage: string): string =>
  stageLabels[stage] ?? "Generation unsuccessful";

export const impactLabels: Record<string, string> = {
  low: "No configuration change",
  medium: "Changes one preference",
  high: "Changes several preferences",
};

export function parseYearLevelFailure(error: unknown): YearLevelGenerationFailure | null {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  return parseYearLevelFailurePayload(data);
}

export function parseYearLevelFailurePayload(data: unknown): YearLevelGenerationFailure | null {
  if (!data || typeof data !== "object") return null;

  const payload = data as Record<string, unknown>;
  if (payload.error_code === "schedule_generation_preflight_failed") {
    return preflightFailure(payload);
  }
  if (payload.error_code !== "year_level_generation_failed") return null;

  const recommendations = Array.isArray(payload.recommendations)
    ? (payload.recommendations as GenerationRecommendation[]).map((recommendation) => ({
        ...recommendation,
        adjustments: Array.isArray(recommendation.adjustments) ? recommendation.adjustments : [],
        status: recommendation.status ?? (recommendation.resolved ? "resolved" : "active"),
        resolved: recommendation.resolved ?? recommendation.status === "resolved",
      }))
    : [];

  return {
    message: typeof payload.message === "string" ? payload.message : "No valid timetable was found.",
    stage: typeof payload.stage === "string" ? payload.stage : "search",
    blockingConstraints: Array.isArray(payload.blocking_constraints)
      ? (payload.blocking_constraints as BlockingConstraint[])
      : [],
    bottleneck: (payload.bottleneck as GenerationBottleneck | null) ?? null,
    attempts: Array.isArray(payload.attempts) ? (payload.attempts as GenerationAttempt[]) : [],
    recommendations,
    provisional: payload.provisional === true,
    searchIncomplete: payload.search_incomplete === true,
  };
}

const preflightTitles: Record<string, string> = {
  invalid_section_status: "Activate the section",
  invalid_curriculum_assignment: "Correct the curriculum assignment",
  invalid_course_status: "Activate the course",
  invalid_course_duration: "Correct the course duration",
  missing_lecture_room: "Provide an available lecture room",
  missing_laboratory_room: "Provide an available laboratory room",
  department_profile_mismatch: "Align the department scheduling profile",
  invalid_department_setting: "Disable the conflicting department setting",
};

function preflightFailure(payload: Record<string, unknown>): YearLevelGenerationFailure {
  const issues = Array.isArray(payload.issues)
    ? (payload.issues as Array<Record<string, unknown>>)
    : [];

  return {
    message: typeof payload.message === "string"
      ? payload.message
      : "The selected scope cannot be generated yet.",
    stage: "feasibility",
    blockingConstraints: issues.map((issue) => ({
      code: String(issue.code ?? "preflight_issue"),
      message: String(issue.message ?? ""),
      suggested_action: String(issue.suggested_action ?? ""),
      section_id: typeof issue.section_id === "number" ? issue.section_id : null,
      context: (issue.context as Record<string, unknown>) ?? {},
    })),
    bottleneck: null,
    attempts: [],
    recommendations: issues.map((issue, index) => {
      const context = (issue.context as Record<string, unknown>) ?? {};
      const code = String(issue.code ?? "preflight_issue");

      return {
        id: `preflight-${code}-${index}`,
        title: preflightTitles[code] ?? "Correct the generation scope",
        detected_cause: String(issue.message ?? ""),
        suggested_adjustment: String(issue.suggested_action ?? ""),
        section_id: typeof issue.section_id === "number" ? issue.section_id : null,
        section_name: typeof issue.section_name === "string" ? issue.section_name : null,
        course_id: typeof context.course_id === "number" ? context.course_id : null,
        course_code: typeof context.course_code === "string" ? context.course_code : null,
        impact: "high",
        adjustments: [],
      };
    }),
  };
}

export const isApplicableRecommendation = (recommendation: GenerationRecommendation): boolean =>
  recommendation.adjustments.length > 0
  && !recommendation.resolved
  && recommendation.status !== "resolved";

export function recommendationTarget(recommendation: GenerationRecommendation): string {
  const first = recommendation.adjustments[0];
  if (first && isYearLevelAdjustment(first)) return "the year level";
  const courseCode = recommendation.course_code || first?.course_code || "";
  const sectionName = recommendation.section_name || first?.section_name || "";

  if (courseCode && sectionName) return `${courseCode} in ${sectionName}`;
  return courseCode || sectionName || "the configuration";
}

export function describeAdjustment(adjustment: GenerationAdjustment): string {
  const course = adjustment.course_code || `course ${adjustment.course_id}`;
  const section = adjustment.section_name || `section ${adjustment.section_id}`;

  switch (adjustment.type) {
    case "set_pattern":
      return `${course} in ${section}: pattern set to ${adjustment.value}`;
    case "clear_pattern":
      return `${course} in ${section}: pattern set to Automatic`;
    case "disable_lecture_lab_split":
      return `${course} in ${section}: lecture/lab split turned off`;
    case "disable_minor_split":
      return `${course} in ${section}: Split Session turned off, one regular meeting`;
    case "enable_hybrid_split":
    case "set_hybrid_split":
      return `${course} in ${section}: Hybrid Split turned on, one meeting online`;
    case "disable_hybrid_split":
      return `${course} in ${section}: Hybrid Split turned off, both meetings on-site`;
    case "disable_section_hybrid":
      return `${section}: lecture/lab hybrid splits turned off`;
    case "enable_friday_saturday_split":
      return "Year level: Friday + Saturday allowed as paired days";
    case "add_preferred_day":
      return `Year level: ${adjustment.value} added to the Preferred Days`;
    case "set_delivery_mode":
      return `${course} in ${section}: mode set to ${adjustment.value === "automatic" ? "Automatic" : adjustment.value}`;
    case "split_session_single_meeting_fallback":
      return `${course} in ${section}: Can't split, switched to one meeting.`;
    default:
      return `${course} in ${section}: configuration updated`;
  }
}

const yearLevelAdjustmentTypes = new Set(["enable_friday_saturday_split", "add_preferred_day"]);

export const isYearLevelAdjustment = (adjustment: GenerationAdjustment): boolean =>
  yearLevelAdjustmentTypes.has(adjustment.type);

export type AdjustableYearLevelSettings = {
  preferredDays: string[];
  allowFridaySaturdaySplit: boolean;
};

export function applyYearLevelAdjustments(
  settings: AdjustableYearLevelSettings,
  adjustments: GenerationAdjustment[],
): { settings: AdjustableYearLevelSettings; applied: GenerationAdjustment[] } {
  let next = settings;
  const applied: GenerationAdjustment[] = [];

  for (const adjustment of adjustments) {
    if (adjustment.type === "enable_friday_saturday_split" && !next.allowFridaySaturdaySplit) {
      next = { ...next, allowFridaySaturdaySplit: true };
      applied.push(adjustment);
    } else if (
      adjustment.type === "add_preferred_day"
      && adjustment.value
      && next.preferredDays.length > 0
      && !next.preferredDays.includes(adjustment.value)
    ) {
      next = { ...next, preferredDays: orderDays([...next.preferredDays, adjustment.value]) };
      applied.push(adjustment);
    }
  }

  return { settings: next, applied };
}

export function applyAdjustments<T extends AdjustableSectionConfig>(
  configs: Record<string, T>,
  adjustments: GenerationAdjustment[],
): { configs: Record<string, T>; applied: GenerationAdjustment[] } {
  let next = configs;
  const applied: GenerationAdjustment[] = [];

  for (const adjustment of adjustments) {
    const sectionKey = String(adjustment.section_id);
    const courseKey = String(adjustment.course_id);
    const config = next[sectionKey];
    if (!config) continue;

    const updated = applyOne(config, adjustment, courseKey);
    if (!updated) continue;

    next = next === configs ? { ...configs } : next;
    next[sectionKey] = updated;
    applied.push(adjustment);
  }

  return { configs: next, applied };
}

function applyOne<T extends AdjustableSectionConfig>(
  config: T,
  adjustment: GenerationAdjustment,
  courseKey: string,
): T | null {
  switch (adjustment.type) {
    case "set_pattern": {
      const value = adjustment.value === "TTh" ? "TTh" : adjustment.value === "MW" ? "MW" : null;
      if (!value || config.gecSplitPatternsByCourseId[courseKey] === value) return null;
      return {
        ...config,
        gecSplitPatternsByCourseId: { ...config.gecSplitPatternsByCourseId, [courseKey]: value },
      };
    }
    case "clear_pattern": {
      if (config.gecSplitPatternsByCourseId[courseKey] === "auto") return null;
      return {
        ...config,
        gecSplitPatternsByCourseId: { ...config.gecSplitPatternsByCourseId, [courseKey]: "auto" },
      };
    }
    case "disable_lecture_lab_split": {
      if (!config.splitCourseIds.includes(courseKey)) return null;
      return { ...config, splitCourseIds: config.splitCourseIds.filter((id) => id !== courseKey) };
    }
    case "disable_minor_split": {
      if (!config.gecSplitCourseIds.includes(courseKey)) return null;
      return {
        ...config,
        gecSplitCourseIds: config.gecSplitCourseIds.filter((id) => id !== courseKey),
        hybridSplitCourseIds: (config.hybridSplitCourseIds ?? []).filter((id) => id !== courseKey),
      };
    }
    case "enable_hybrid_split": {
      const hybridIds = config.hybridSplitCourseIds ?? [];
      if (!config.gecSplitCourseIds.includes(courseKey) || hybridIds.includes(courseKey)) return null;
      return {
        ...config,
        hybridSplitCourseIds: [...hybridIds, courseKey],
        modesByCourseId: { ...config.modesByCourseId, [courseKey]: "automatic" },
      };
    }
    case "set_hybrid_split": {
      const hybridIds = config.hybridSplitCourseIds ?? [];
      if (hybridIds.includes(courseKey)) return null;
      return {
        ...config,
        gecSplitCourseIds: config.gecSplitCourseIds.includes(courseKey)
          ? config.gecSplitCourseIds
          : [...config.gecSplitCourseIds, courseKey],
        hybridSplitCourseIds: [...hybridIds, courseKey],
        modesByCourseId: { ...config.modesByCourseId, [courseKey]: "automatic" },
      };
    }
    case "disable_hybrid_split": {
      const hybridIds = config.hybridSplitCourseIds ?? [];
      if (!hybridIds.includes(courseKey)) return null;
      return {
        ...config,
        hybridSplitCourseIds: hybridIds.filter((id) => id !== courseKey),
        modesByCourseId: { ...config.modesByCourseId, [courseKey]: "on-site" },
      };
    }
    case "disable_section_hybrid": {
      if (config.splitCourseIds.length === 0) return null;
      return { ...config, splitCourseIds: [] };
    }
    case "set_delivery_mode": {
      const value = adjustment.value === null || adjustment.value === "automatic" ? "automatic" : adjustment.value;
      const hybridIds = config.hybridSplitCourseIds ?? [];
      const dropsHybrid = value === "online" && hybridIds.includes(courseKey);
      if (config.modesByCourseId[courseKey] === value && !dropsHybrid) return null;
      return {
        ...config,
        modesByCourseId: { ...config.modesByCourseId, [courseKey]: value },
        ...(dropsHybrid ? { hybridSplitCourseIds: hybridIds.filter((id) => id !== courseKey) } : {}),
      };
    }
    default:
      return null;
  }
}
