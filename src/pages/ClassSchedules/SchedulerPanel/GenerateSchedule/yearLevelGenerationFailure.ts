/**
 * Shapes and pure transforms for the year-level generator's diagnostic report.
 *
 * The backend returns a machine-applicable `adjustments` list with every
 * recommendation. Keeping the parse and the apply step here — away from the
 * modal's rendering — is what lets "Apply & Retry" be tested without a DOM.
 */

export type AdjustmentType =
  | "set_pattern"
  | "clear_pattern"
  | "disable_lecture_lab_split"
  | "set_delivery_mode";

export type GenerationAdjustment = {
  type: AdjustmentType | string;
  section_id: number;
  course_id: number;
  value: string | null;
  section_name?: string;
  course_code?: string;
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
};

export type AppliedStrategy = {
  key: string;
  label: string;
  description: string;
  impact: string;
};

/** The subset of a wizard section config that an adjustment can rewrite. */
export type AdjustableSectionConfig = {
  splitCourseIds: string[];
  gecSplitCourseIds: string[];
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

/**
 * Read a diagnostic report out of an axios-shaped error.
 *
 * Returns null for anything that is not this endpoint's structured 422 (session
 * expiry, timeouts, plain validation errors) so the caller can keep its existing
 * toast handling for those.
 */
export function parseYearLevelFailure(error: unknown): YearLevelGenerationFailure | null {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
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
  };
}

/** Preflight rejects on data, not capacity, so nothing here is auto-applicable. */
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

/** Human-readable summary of one adjustment, used in the panel and the toast. */
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
    case "set_delivery_mode":
      return `${course} in ${section}: mode set to ${adjustment.value === "automatic" ? "Automatic" : adjustment.value}`;
    default:
      return `${course} in ${section}: configuration updated`;
  }
}

/**
 * Rewrite the wizard configs so the next run matches what the generator
 * recommended. Unknown adjustment types and unknown sections are ignored, and
 * `applied` reports only the changes that actually landed — so the caller can
 * tell the user what changed rather than claiming a no-op succeeded.
 */
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
    case "set_delivery_mode": {
      const value = adjustment.value === null || adjustment.value === "automatic" ? "automatic" : adjustment.value;
      if (config.modesByCourseId[courseKey] === value) return null;
      return { ...config, modesByCourseId: { ...config.modesByCourseId, [courseKey]: value } };
    }
    default:
      return null;
  }
}
