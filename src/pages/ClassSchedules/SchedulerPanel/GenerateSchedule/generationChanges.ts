import {
  describeAdjustment,
  type AppliedStrategy,
  type GenerationAdjustment,
} from "./yearLevelGenerationFailure";

export type GenerationChangeKind =
  | "preference_relaxed"
  | "split_session_single_meeting"
  | "lecture_moved_online"
  | "room_tba";

export type GenerationChangeItem = {
  section_id: number;
  section_name: string;
  course_id: number;
  course_code: string;
  detail: string;
  adjustment_type?: string;
  adjustment_value?: string | null;
};

export type GenerationDetectedIssue = {
  type: string;
  section_name: string;
  course_code: string;
  detected_cause: string;
};

export type GenerationChange = {
  kind: GenerationChangeKind | string;
  severity: "warning" | "critical" | string;
  title: string;
  description: string;
  items: GenerationChangeItem[];
  status?: "active" | "resolved" | string;
  resolved?: boolean;
  detected_issue?: GenerationDetectedIssue | null;
  failed_attempts?: number;
};

const badgeLabels: Record<string, string> = {
  preference_relaxed: "Preference changed",
  split_session_single_meeting: "One meeting",
  lecture_moved_online: "Moved online",
  room_tba: "Room TBA",
};

export const classKey = (sectionId: number | string, courseId: number | string) =>
  `${sectionId}|${courseId}`;

export function resolveGenerationChanges(result: {
  generation_changes?: GenerationChange[] | null;
  applied_strategy?: AppliedStrategy | null;
  applied_adjustments?: GenerationAdjustment[] | null;
} | null | undefined): GenerationChange[] | null {
  if (!result) return null;
  if (Array.isArray(result.generation_changes)) return result.generation_changes;

  const adjustments = result.applied_adjustments ?? [];
  if (!result.applied_strategy || adjustments.length === 0) return null;

  const toItem = (adjustment: GenerationAdjustment): GenerationChangeItem => ({
    section_id: adjustment.section_id,
    section_name: adjustment.section_name ?? `Section ${adjustment.section_id}`,
    course_id: adjustment.course_id,
    course_code: adjustment.course_code ?? `Course ${adjustment.course_id}`,
    detail: describeAdjustment(adjustment).replace(/^.*?: /, ""),
    adjustment_type: adjustment.type,
    adjustment_value: adjustment.value,
  });
  const isSplit = (adjustment: GenerationAdjustment) =>
    adjustment.type === "split_session_single_meeting_fallback";

  return [
    {
      kind: "preference_relaxed",
      severity: "warning",
      status: "resolved",
      resolved: true,
      title: result.applied_strategy.label,
      description: result.applied_strategy.description,
      items: adjustments.filter((adjustment) => !isSplit(adjustment)).map(toItem),
    },
    {
      kind: "split_session_single_meeting",
      severity: "warning",
      status: "resolved",
      resolved: true,
      title: "Split session changed to one meeting",
      description: "These courses were set to meet twice a week, but no second slot was free, so each meets once instead.",
      items: adjustments.filter(isSplit).map(toItem),
    },
  ].filter((change) => change.items.length > 0);
}

export function changeBadgesByClass(changes: GenerationChange[]): Map<string, GenerationChange[]> {
  const byClass = new Map<string, GenerationChange[]>();
  for (const change of changes) {
    for (const item of change.items) {
      const key = classKey(item.section_id, item.course_id);
      const existing = byClass.get(key) ?? [];
      if (!existing.includes(change)) byClass.set(key, [...existing, change]);
    }
  }
  return byClass;
}

export const changeBadgeLabel = (change: GenerationChange) =>
  badgeLabels[change.kind] ?? change.title;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Splits "Scheduled online: no room was available (Monday)" into its parts. Anything unrecognized stays in `result`. */
export function parseChangeDetail(detail: string): { result: string; reason: string | null; day: string | null } {
  let text = detail.trim();
  let day: string | null = null;
  const dayMatch = text.match(/\s*\(([^()]+)\)$/);
  if (dayMatch && dayMatch[1].split(/[,/&]|\band\b/).every((part) => DAYS.includes(part.trim()))) {
    day = dayMatch[1].trim();
    text = text.slice(0, dayMatch.index).trim();
  }
  const separator = text.indexOf(": ");
  if (separator > 0) {
    return { result: text.slice(0, separator), reason: text.slice(separator + 2), day };
  }
  // Listed under "Room to be assigned", so "Room TBA" from older results would repeat the word.
  return { result: text === "Room TBA" ? "TBA" : text, reason: null, day };
}
