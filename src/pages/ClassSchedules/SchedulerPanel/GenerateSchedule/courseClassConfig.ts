import type { Course, Section } from "../types";
import {
  HYBRID_SPLIT_MEETING_MINUTES,
  isConfiguredFieldCourse,
  isFieldSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import {
  getCourseSlotPlan,
  SLOT_MINUTES,
} from "../courseSlotPlan";
import { DAYS } from "../constants";
import { isLabMeetingRoomType, isMajorWithoutLaboratoryUnits } from "../../../../lib/labRoomPolicy";
import type { CourseSetupConfig } from "./SetupCoursesStep";

export type ClassConfiguration = "regular" | "split" | "integrated";
export type ClassComponent = "lecture" | "laboratory" | "field";
export type DeliveryMode = "onsite" | "online" | "hybrid";
export type SectionScope = "all" | "selected";

export type DurationShape =
  | "single"
  | "split"
  | "hybrid-split"
  | "integrated-onsite"
  | "hybrid-laboratory";

/** Run-scoped days of an Integrated course's two meetings. Blank = automatic. */
export type IntegratedComponent = "lecture" | "laboratory";
export type ComponentRequiredDays = Partial<Record<IntegratedComponent, string | null>>;

export interface CourseClassConfig {
  configuration: ClassConfiguration;
  component: ClassComponent;
  delivery: DeliveryMode;
  hybridType?: "split" | "laboratory";
  requiredDay: string | null;
  /**
   * Integrated only. `undefined` means the targeted sections hold different
   * values (or none were inferred), so applying keeps each section's own days.
   */
  componentRequiredDays?: ComponentRequiredDays;
  consecutiveDays?: number | null;
  preferredStartDay?: string | null;
  meetingDays?: string[] | null;
  preferredRoomId: string | null;
  sectionScope: SectionScope;
  selectedSectionIds: string[];
}

export function formatHours(hours: number): string {
  if (hours <= 0) return "0h";
  return hours % 1 === 0 ? `${hours}h` : `${Number(hours.toFixed(2))}h`;
}

export function durationShape(
  config: Pick<CourseClassConfig, "configuration" | "delivery">,
): DurationShape {
  if (config.configuration === "split") {
    return config.delivery === "hybrid" ? "hybrid-split" : "split";
  }
  if (config.configuration === "integrated") {
    return config.delivery === "hybrid" ? "hybrid-laboratory" : "integrated-onsite";
  }
  return "single";
}

export const isIntegratedShape = (shape: DurationShape): boolean =>
  shape === "integrated-onsite" || shape === "hybrid-laboratory";

export const isConsecutive = (
  config: Pick<CourseClassConfig, "configuration" | "consecutiveDays">,
): boolean =>
  config.configuration === "regular" && (config.consecutiveDays ?? 0) >= MIN_CONSECUTIVE_DAYS;

export function asRegularClass(config: CourseClassConfig): CourseClassConfig {
  if (config.configuration === "regular") return config;
  return {
    ...config,
    configuration: "regular",
    delivery: config.delivery === "hybrid" ? "onsite" : config.delivery,
    hybridType: undefined,
    componentRequiredDays: {},
  };
}

export const INTEGRATED_COMPONENTS: IntegratedComponent[] = ["lecture", "laboratory"];

/** Drops automatic (blank) components; `null` when nothing is pinned. */
export function normalizeComponentRequiredDays(
  days: ComponentRequiredDays | null | undefined,
): Record<string, string> | null {
  if (!days) return null;
  const pinned: Record<string, string> = {};
  for (const component of INTEGRATED_COMPONENTS) {
    const day = days[component];
    if (day) pinned[component] = day;
  }
  return Object.keys(pinned).length > 0 ? pinned : null;
}

export const sameComponentRequiredDays = (
  left: ComponentRequiredDays | null | undefined,
  right: ComponentRequiredDays | null | undefined,
): boolean =>
  JSON.stringify(normalizeComponentRequiredDays(left)) ===
  JSON.stringify(normalizeComponentRequiredDays(right));

/** "Lecture: Monday · Laboratory: Thursday", automatic components omitted. */
export function formatComponentRequiredDays(days: ComponentRequiredDays | null | undefined): string {
  const pinned = normalizeComponentRequiredDays(days);
  if (!pinned) return "";
  return INTEGRATED_COMPONENTS.filter((component) => pinned[component])
    .map((component) => `${component === "lecture" ? "Lecture" : "Laboratory"}: ${pinned[component]}`)
    .join(" · ");
}

/**
 * Component days for summaries. One label when every section shares it;
 * otherwise each distinct value with the sections it applies to, so no
 * section's days are shown as a shared default.
 */
export function componentDaysSummary(
  sections: Array<{ name: string; label: string }>,
  totalSections: number,
): string[] {
  const groups = new Map<string, string[]>();
  for (const section of sections) {
    if (!section.label) continue;
    groups.set(section.label, [...(groups.get(section.label) ?? []), section.name]);
  }
  if (groups.size === 1 && [...groups.values()][0].length === totalSections) {
    return [[...groups.keys()][0]];
  }
  return [...groups.entries()].map(([label, names]) => `${label} (${names.join(", ")})`);
}

/** The same corrections the server makes, shown beside the controls. */
export function componentRequiredDaysError(
  days: ComponentRequiredDays | null | undefined,
  preferredDays: string[],
  sundayClassesEnabled: boolean,
): string | null {
  const pinned = normalizeComponentRequiredDays(days);
  if (!pinned) return null;
  if (pinned.lecture && pinned.lecture === pinned.laboratory) {
    return `The lecture and laboratory meet on different days. Choose another day for one of them; both are ${pinned.lecture}.`;
  }
  for (const component of INTEGRATED_COMPONENTS) {
    const day = pinned[component];
    if (!day) continue;
    const label = component === "lecture" ? "Lecture" : "Laboratory";
    if (preferredDays.length > 0 && !preferredDays.includes(day)) {
      return `The ${label} Required Day (${day}) is not one of the Preferred Days (${preferredDays.join(", ")}). Choose one of them, or restore ${day} in Configuration.`;
    }
    if (day === "Sunday" && !sundayClassesEnabled) {
      return `The ${label} Required Day is Sunday, but Sunday classes are not enabled for this department.`;
    }
  }
  if (preferredDays.length === 1) {
    return `The lecture and laboratory meet on two different days, but the Preferred Days allow only ${preferredDays[0]}. Restore another day in Configuration.`;
  }
  return null;
}

export interface ConsecutiveDayRule {
  course_id: number;
  section_id: number | null;
  day_count: number;
  preferred_start_day: string | null;
  meeting_days?: string[] | null;
}

export const MIN_CONSECUTIVE_DAYS = 2;
export const DEFAULT_CONSECUTIVE_DAYS = 2;

export const teachingWeek = (sundayClassesEnabled: boolean): string[] =>
  sundayClassesEnabled ? [...DAYS] : DAYS.filter((day) => day !== "Sunday");

export function consecutiveDayRuns(
  dayCount: number,
  sundayClassesEnabled: boolean,
  allowedDays: string[] | null = null,
): string[][] {
  const week = teachingWeek(sundayClassesEnabled);
  if (dayCount < MIN_CONSECUTIVE_DAYS || dayCount > week.length) return [];
  const allowed = allowedDays && allowedDays.length > 0 ? new Set(allowedDays) : null;
  const runs: string[][] = [];
  for (let start = 0; start + dayCount <= week.length; start += 1) {
    const run = week.slice(start, start + dayCount);
    if (!allowed || run.every((day) => allowed.has(day))) runs.push(run);
  }
  return runs;
}

export const runLabel = (run: string[]): string =>
  run.length === 0
    ? ""
    : isBackToBack(run)
      ? `${run[0]}–${run[run.length - 1]}`
      : run.join(", ");

export function consecutiveRulesForCourse(
  courseId: string,
  config: CourseClassConfig,
  sections: Section[],
): ConsecutiveDayRule[] {
  if (!isConsecutive(config)) return [];
  const base = {
    course_id: Number(courseId),
    day_count: config.consecutiveDays ?? DEFAULT_CONSECUTIVE_DAYS,
    preferred_start_day: config.preferredStartDay ?? null,
    meeting_days: config.meetingDays ?? null,
  };
  if (config.sectionScope === "all") return [{ ...base, section_id: null }];
  const known = new Set(sections.map((section) => section.id));
  return config.selectedSectionIds
    .filter((id) => known.has(id))
    .map((id) => ({ ...base, section_id: Number(id) }));
}

export function sameConsecutiveRules(left: ConsecutiveDayRule[], right: ConsecutiveDayRule[]): boolean {
  const key = (rule: ConsecutiveDayRule) =>
    `${rule.section_id ?? "all"}:${rule.day_count}:${rule.preferred_start_day ?? ""}:${(rule.meeting_days ?? []).join(",")}`;
  const a = left.map(key).sort();
  const b = right.map(key).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function consecutiveRulesBySection(
  courseId: string,
  rules: ConsecutiveDayRule[],
  sections: Section[],
): Map<string, ConsecutiveDayRule> {
  const resolved = new Map<string, ConsecutiveDayRule>();
  for (const section of sections) {
    const rule = consecutiveRuleForSection(courseId, section.id, rules);
    if (rule) resolved.set(section.id, rule);
  }
  return resolved;
}

export function consecutiveRuleForSection(
  courseId: string,
  sectionId: string,
  rules: ConsecutiveDayRule[],
): ConsecutiveDayRule | null {
  const forCourse = rules.filter((rule) => String(rule.course_id) === String(courseId));
  return (
    forCourse.find((rule) => rule.section_id !== null && String(rule.section_id) === String(sectionId)) ??
    forCourse.find((rule) => rule.section_id === null) ??
    null
  );
}

export const consecutivePattern = (dayCount: number): string => `consecutive:${dayCount}`;

export interface ConsecutivePlacement {
  dayCount: number;
  preferredStartDay: string | null;
  runs: string[][];
}

export function consecutivePlacementFor(
  courseId: string,
  sectionId: string,
  rules: ConsecutiveDayRule[],
  sundayClassesEnabled: boolean,
): ConsecutivePlacement | null {
  const rule = consecutiveRuleForSection(courseId, sectionId, rules);
  if (!rule) return null;
  const ticked = rule.meeting_days && rule.meeting_days.length >= MIN_CONSECUTIVE_DAYS ? rule.meeting_days : null;
  return {
    dayCount: ticked ? ticked.length : rule.day_count,
    preferredStartDay: ticked ? ticked[0] : rule.preferred_start_day,
    runs: ticked ? [ticked] : consecutiveDayRuns(rule.day_count, sundayClassesEnabled),
  };
}

export const runStartingOn = (placement: ConsecutivePlacement, dayIndex: number): string[] | null =>
  placement.runs.find((run) => run[0] === DAYS[dayIndex]) ?? null;

export const tickedRun = (placement: ConsecutivePlacement): string[] | null =>
  placement.runs.find((run) => run[0] === placement.preferredStartDay) ?? null;

export function runStartForDay(placement: ConsecutivePlacement, dayIndex: number): number {
  const day = DAYS[dayIndex];
  const covering = placement.runs.filter((run) => run.includes(day));
  const chosen =
    tickedRun(placement) ??
    placement.runs.find((run) => run[0] === day) ??
    covering[covering.length - 1] ??
    placement.runs[0];
  return chosen ? DAYS.indexOf(chosen[0]) : dayIndex;
}

export function runFrom(startDay: string, dayCount: number, sundayClassesEnabled: boolean): string[] {
  const week = teachingWeek(sundayClassesEnabled);
  const start = week.indexOf(startDay);
  if (start < 0 || dayCount > week.length) return [];
  const from = Math.min(start, week.length - dayCount);
  return week.slice(from, from + dayCount);
}

export function isBackToBack(days: string[]): boolean {
  const indexes = [...new Set(days)].map((day) => DAYS.indexOf(day)).sort((a, b) => a - b);
  return (
    indexes.length === days.length &&
    indexes.every((index, position) => index >= 0 && index === indexes[0] + position)
  );
}

export function consecutiveSummary(
  dayCount: number,
  startDay: string | null,
  meetingDays: string[] | null = null,
): string {
  if (meetingDays && meetingDays.length >= MIN_CONSECUTIVE_DAYS) {
    const short = meetingDays.map((day) => day.slice(0, 3));
    return `${meetingDays.length} days · ${
      isBackToBack(meetingDays) ? `${short[0]}–${short[short.length - 1]}` : short.join(", ")
    }`;
  }
  const start = startDay ? DAYS.indexOf(startDay) : -1;
  const end = start >= 0 ? DAYS[start + dayCount - 1] : undefined;
  return startDay && end
    ? `${dayCount} days · ${startDay.slice(0, 3)}–${end.slice(0, 3)}`
    : `${dayCount} consecutive days`;
}

/** The course's Total Hours a week, in minutes. */
export function requiredDurationMinutes(course: Course): number {
  return getCourseSlotPlan(course).totalSlots * SLOT_MINUTES;
}

export function hybridLaboratoryMinutes(course: Course): { lecture: number; laboratory: number } {
  const plan = getCourseSlotPlan(course);
  return {
    lecture: plan.lectureSlots * SLOT_MINUTES,
    laboratory: plan.laboratorySlots * SLOT_MINUTES,
  };
}

export interface CourseDefaults {
  allowFridaySaturdaySplit: boolean;
}

export const EMPTY_COURSE_DEFAULTS: CourseDefaults = {
  allowFridaySaturdaySplit: false,
};

export interface MeetingPart {
  label: string;
  minutes: number;
  mode?: "Online" | "Face to Face";
}

export function meetingParts(config: CourseClassConfig, course: Course): MeetingPart[] {
  const required = requiredDurationMinutes(course);
  switch (durationShape(config)) {
    case "split": {
      const mode = config.delivery === "online" ? "Online" : undefined;
      return [
        { label: "Meeting 1", minutes: required / 2, mode },
        { label: "Meeting 2", minutes: required / 2, mode },
      ];
    }
    case "hybrid-split":
      return [
        { label: "Meeting 1", minutes: HYBRID_SPLIT_MEETING_MINUTES, mode: "Online" },
        { label: "Meeting 2", minutes: HYBRID_SPLIT_MEETING_MINUTES, mode: "Face to Face" },
      ];
    case "integrated-onsite":
    case "hybrid-laboratory": {
      const { lecture, laboratory } = hybridLaboratoryMinutes(course);
      return [
        { label: "Lecture", minutes: lecture, mode: config.delivery === "hybrid" ? "Online" : "Face to Face" },
        { label: "Laboratory", minutes: laboratory, mode: "Face to Face" },
      ];
    }
    default: {
      // A Regular course is one meeting of its Total Hours; with laboratory units it meets in
      // a laboratory room.
      if (!isConsecutive(config)) return [{ label: "Class", minutes: required }];
      // Every day repeats the course's full Total Hours.
      const dayCount = config.consecutiveDays ?? DEFAULT_CONSECUTIVE_DAYS;
      return Array.from({ length: dayCount }, (_, index) => ({
        label: `Day ${index + 1}`,
        minutes: required,
        mode: config.delivery === "online" ? ("Online" as const) : undefined,
      }));
    }
  }
}

const describePart = (part: MeetingPart): string =>
  `${formatHours(part.minutes / 60)}${part.mode ? ` ${part.mode}` : ""}`;

export function durationLabel(config: CourseClassConfig, course: Course): string {
  const parts = meetingParts(config, course);
  if (isConsecutive(config) && parts.length > 0) {
    const perDay = parts[0].minutes / 60;
    const mode = parts[0].mode ? ` ${parts[0].mode}` : "";
    return `${formatHours(perDay)}/day × ${parts.length} days = ${formatHours(perDay * parts.length)}${mode}`;
  }
  return parts.map(describePart).join(" + ");
}

export interface PreferredRoomOption {
  id: number | string;
  room_code: string;
  room_type: string;
  building?: string | null;
  allow_lecture_usage?: boolean;
}

export function compatibleRoomOptions(
  course: Course,
  config: Pick<CourseClassConfig, "configuration" | "delivery">,
  _isFieldCourse: boolean,
  options: PreferredRoomOption[],
): PreferredRoomOption[] {
  if (config.delivery === "online") return [];
  const fieldRooms = isFieldSchedulingEligible(course) ? options.filter((room) => room.room_type === "field") : [];
  if (course.roomTypeRequired === "field" && isFieldSchedulingEligible(course)) return fieldRooms;

  const needsLaboratory = !isMajorWithoutLaboratoryUnits(course)
    && (Number(course.labHours ?? 0) > 0 || course.roomTypeRequired === "laboratory");
  const ownRooms = needsLaboratory
    ? options.filter((room) => isLabMeetingRoomType(room.room_type))
    : options.filter((room) => room.room_type === "lecture");
  return [...ownRooms, ...fieldRooms];
}

export function inferInitialCourseClassConfig(
  course: Course,
  configs: Record<string, CourseSetupConfig>,
  sections: Section[],
  fieldCourseCodes: ReadonlySet<string>,
  requiredDay: string | null = null,
  consecutiveRules: ConsecutiveDayRule[] = [],
): CourseClassConfig {
  const isField = isConfiguredFieldCourse(course, fieldCourseCodes);
  const lecHours = Number(course.lectureHours ?? 0);
  const labHours = Number(course.labHours ?? 0);

  const sectionsWith = (key: "gecSplitCourseIds" | "splitCourseIds" | "hybridSplitCourseIds") =>
    sections.filter((s) => (configs[s.id]?.[key] ?? []).includes(course.id));
  const sectionsWithSplit = sectionsWith("gecSplitCourseIds");
  const sectionsWithHybrid = sectionsWith("splitCourseIds");
  const sectionsWithHybridSplit = sectionsWith("hybridSplitCourseIds");
  const consecutiveBySection = consecutiveRulesBySection(course.id, consecutiveRules, sections);
  const sectionsWithConsecutive = sections.filter((s) => consecutiveBySection.has(s.id));

  const isAnyConsecutive = sectionsWithConsecutive.length > 0;
  const isAnySplit = !isAnyConsecutive && sectionsWithSplit.length > 0;
  const isAnyHybrid = sectionsWithHybrid.length > 0;
  const isAnyHybridSplit = sectionsWithHybridSplit.length > 0;

  let sectionScope: SectionScope = "all";
  let selectedSectionIds: string[] = sections.map((s) => s.id);
  const narrowTo = (subset: Section[]) => {
    if (subset.length > 0 && subset.length < sections.length) {
      sectionScope = "selected";
      selectedSectionIds = subset.map((s) => s.id);
    }
  };
  if (isAnyConsecutive) narrowTo(sectionsWithConsecutive);
  else if (isAnySplit) narrowTo(sectionsWithSplit);
  else if (isAnyHybrid) narrowTo(sectionsWithHybrid);
  else if (isAnyHybridSplit) narrowTo(sectionsWithHybridSplit);

  const targets = sections.filter((s) => selectedSectionIds.includes(s.id));
  const savedRoom = targets
    .map((s) => configs[s.id]?.preferredRoomsByCourseId?.[course.id])
    .find((roomId): roomId is string => Boolean(roomId));

  const shared = {
    requiredDay,
    preferredRoomId: savedRoom ?? null,
    sectionScope,
    selectedSectionIds,
  };
  // Never inferred from a course-wide Required Day. Mixed section values stay
  // undefined so Apply does not overwrite them with one section's days.
  const pinsOf = (section: Section) =>
    normalizeComponentRequiredDays(configs[section.id]?.componentRequiredDaysByCourseId?.[course.id]);
  const integratedPins = sectionsWithHybrid.map(pinsOf);
  const sharedPins = integratedPins.every((pins) => sameComponentRequiredDays(pins, integratedPins[0]))
    ? { ...(integratedPins[0] ?? {}) }
    : undefined;

  if (isAnyConsecutive) {
    const rule = consecutiveBySection.get(sectionsWithConsecutive[0].id)!;
    const isOnline = sectionsWithConsecutive.some(
      (s) => configs[s.id]?.modesByCourseId?.[course.id] === "online",
    );
    return {
      ...shared,
      configuration: "regular",
      component: isField ? "field" : labHours > 0 && lecHours === 0 ? "laboratory" : "lecture",
      delivery: isOnline ? "online" : "onsite",
      consecutiveDays: rule.day_count,
      preferredStartDay: rule.preferred_start_day,
      meetingDays: rule.meeting_days ?? null,
      requiredDay: null,
    };
  }

  if (isAnySplit) {
    const isOnlineSplit = sectionsWithSplit.some(
      (s) => configs[s.id]?.modesByCourseId?.[course.id] === "online",
    );
    return {
      ...shared,
      configuration: "split",
      component: labHours > 0 && lecHours === 0 ? "laboratory" : "lecture",
      delivery: isAnyHybridSplit ? "hybrid" : isOnlineSplit ? "online" : "onsite",
      hybridType: isAnyHybridSplit ? "split" : undefined,
    };
  }

  if (isAnyHybrid) {
    const onSite = sectionsWithHybrid.some(
      (s) => configs[s.id]?.modesByCourseId?.[course.id] === "on-site",
    );
    return {
      ...shared,
      configuration: "integrated",
      component: "lecture",
      delivery: onSite ? "onsite" : "hybrid",
      hybridType: onSite ? undefined : "laboratory",
      componentRequiredDays: sharedPins,
    };
  }

  return {
    ...shared,
    configuration: "regular",
    component: isField ? "field" : labHours > 0 && lecHours === 0 ? "laboratory" : "lecture",
    delivery: "onsite",
  };
}

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

export function syncCourseConfigToSectionConfigs(
  course: Course,
  courseConfig: CourseClassConfig,
  sections: Section[],
  configs: Record<string, CourseSetupConfig>,
  onConfigChange: (sectionId: string, change: Partial<CourseSetupConfig>) => void,
): void {
  const courseId = course.id;
  const targetSectionIds = new Set(
    courseConfig.sectionScope === "all"
      ? sections.map((s) => s.id)
      : courseConfig.selectedSectionIds,
  );

  for (const section of sections) {
    const isTarget = targetSectionIds.has(section.id);
    const current = configs[section.id];
    const currentSplit = current?.splitCourseIds ?? [];
    const currentGecSplit = current?.gecSplitCourseIds ?? [];
    const currentHybridSplit = current?.hybridSplitCourseIds ?? [];
    const currentModes = current?.modesByCourseId ?? {};
    const currentRooms = current?.preferredRoomsByCourseId ?? {};
    const currentPins = current?.componentRequiredDaysByCourseId ?? {};

    const without = (ids: string[]) => ids.filter((id) => id !== courseId);
    const withCourse = (ids: string[]) => Array.from(new Set([...ids, courseId]));

    let nextSplit = without(currentSplit);
    let nextGecSplit = without(currentGecSplit);
    let nextHybridSplit = without(currentHybridSplit);
    const nextModes = { ...currentModes };
    const nextRooms = { ...currentRooms };
    delete nextRooms[courseId];
    const nextPins = { ...currentPins };
    delete nextPins[courseId];

    if (isTarget) {
      if (courseConfig.configuration === "split") {
        nextGecSplit = withCourse(currentGecSplit);
        if (courseConfig.delivery === "hybrid") nextHybridSplit = withCourse(currentHybridSplit);
      } else if (courseConfig.configuration === "integrated") {
        nextSplit = withCourse(currentSplit);
        // Only targeted Integrated sections hold component days; undefined
        // (mixed, untouched) keeps each section's own.
        const pins = courseConfig.componentRequiredDays === undefined
          ? normalizeComponentRequiredDays(currentPins[courseId])
          : normalizeComponentRequiredDays(courseConfig.componentRequiredDays);
        if (pins) nextPins[courseId] = pins;
      }
      if (courseConfig.preferredRoomId) nextRooms[courseId] = courseConfig.preferredRoomId;
    }

    if (isTarget && courseConfig.delivery === "online") nextModes[courseId] = "online";
    else if (isTarget && courseConfig.delivery === "onsite") nextModes[courseId] = "on-site";
    else delete nextModes[courseId];

    const changed =
      !sameIds(nextSplit, currentSplit) ||
      !sameIds(nextGecSplit, currentGecSplit) ||
      !sameIds(nextHybridSplit, currentHybridSplit) ||
      JSON.stringify(nextModes) !== JSON.stringify(currentModes) ||
      JSON.stringify(nextRooms) !== JSON.stringify(currentRooms) ||
      JSON.stringify(nextPins) !== JSON.stringify(currentPins);

    if (changed) {
      onConfigChange(section.id, {
        splitCourseIds: nextSplit,
        gecSplitCourseIds: nextGecSplit,
        hybridSplitCourseIds: nextHybridSplit,
        modesByCourseId: nextModes,
        preferredRoomsByCourseId: nextRooms,
        ...(JSON.stringify(nextPins) !== JSON.stringify(currentPins)
          ? { componentRequiredDaysByCourseId: nextPins }
          : {}),
      });
    }
  }
}
