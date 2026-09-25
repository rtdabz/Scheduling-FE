import type { Course, Section } from "../types";
import {
  HYBRID_SPLIT_MEETING_MINUTES,
  isConfiguredFieldCourse,
} from "../schedulingConfigurationEligibility";
import {
  getCourseSlotPlan,
  laboratoryComponentSlots,
  SLOT_MINUTES,
  type LaboratoryDurationSettings,
} from "../courseSlotPlan";
import { DAYS } from "../constants";
import type { CourseSetupConfig } from "./SetupCoursesStep";

export type ClassConfiguration = "regular" | "split" | "integrated";
export type ClassComponent = "lecture" | "laboratory" | "field";
export type DeliveryMode = "onsite" | "online" | "hybrid";
export type SectionScope = "all" | "selected";

/**
 * How a course's meetings are laid out, which decides whether its length can
 * be changed:
 * - `single` — one meeting (Regular)
 * - `split` — two equal meetings on different days, both online for an
 *   Online Split
 * - `hybrid-split` — two fixed sessions, one online and one face-to-face,
 *   of `HYBRID_SPLIT_MEETING_MINUTES` each
 * - `integrated-onsite` (Integrated On-site) — a lecture and a laboratory
 *   as two separate sessions, both face-to-face
 * - `hybrid-laboratory` (Integrated Hybrid) — an online lecture and an
 *   on-site laboratory as two separate sessions
 * Both Integrated shapes size each session from the course (the laboratory
 * from the department's Custom Lab Duration when set), and each can be
 * changed on its own.
 */
export type DurationShape =
  | "single"
  | "split"
  | "hybrid-split"
  | "integrated-onsite"
  | "hybrid-laboratory";

export interface CourseClassConfig {
  configuration: ClassConfiguration;
  component: ClassComponent;
  delivery: DeliveryMode;
  /** Hybrid Split is represented separately from Hybrid Laboratory. */
  hybridType?: "split" | "laboratory";
  /**
   * Weekly minutes: the one meeting, or both Split meetings together. Only
   * `single` and `split` shapes can change it; see {@link DurationShape}.
   */
  durationMinutes: number;
  /**
   * Integrated's two sessions (On-site or Hybrid), set separately and used
   * exactly. Unset (left blank) means the course's own length.
   */
  lectureMinutes?: number;
  laboratoryMinutes?: number;
  /** Department-wide: every section of the course meets on this day. */
  requiredDay: string | null;
  /**
   * Consecutive Days, a Regular class only: the class meets on this many
   * back-to-back days, for its full length each day (8 units, 8 hours every
   * day). Unset or null is one meeting a week.
   */
  consecutiveDays?: number | null;
  /** Consecutive Days: the day the run should start on; null lets the Generator choose. */
  preferredStartDay?: string | null;
  /** A ranking preference, never a restriction. */
  preferredRoomId: string | null;
  sectionScope: SectionScope;
  selectedSectionIds: string[];
}

/** Format hours into a clean duration string like "3h" or "1.5h". */
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

/** Integrated, on site or hybrid: a lecture and a laboratory, each its own length. */
export const isIntegratedShape = (shape: DurationShape): boolean =>
  shape === "integrated-onsite" || shape === "hybrid-laboratory";

export const isDurationEditable = (shape: DurationShape): boolean =>
  shape === "single" || shape === "split";

/** A Regular class set to meet on back-to-back days. */
export const isConsecutive = (
  config: Pick<CourseClassConfig, "configuration" | "consecutiveDays">,
): boolean =>
  config.configuration === "regular" && (config.consecutiveDays ?? 0) >= MIN_CONSECUTIVE_DAYS;

/** A saved Consecutive Days rule, as `/scheduling-settings` returns it. */
export interface ConsecutiveDayRule {
  course_id: number;
  /** Null is the course-wide rule; a section's own rule overrides it. */
  section_id: number | null;
  day_count: number;
  preferred_start_day: string | null;
}

export const MIN_CONSECUTIVE_DAYS = 2;
export const DEFAULT_CONSECUTIVE_DAYS = 2;

/** Monday-Saturday, or through Sunday once the department opens it. */
export const teachingWeek = (sundayClassesEnabled: boolean): string[] =>
  sundayClassesEnabled ? [...DAYS] : DAYS.filter((day) => day !== "Sunday");

/**
 * Every run of `dayCount` calendar-consecutive teaching days, in week order.
 * Mirrors `SchedulingPolicy::consecutiveDayRuns`: the week does not wrap, and
 * a day outside `allowedDays` (Step 1's Preferred Days) breaks a run.
 */
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

/** "Thursday-Saturday", or "Monday-Tuesday" for two days. */
export const runLabel = (run: string[]): string =>
  run.length === 0 ? "" : `${run[0]}–${run[run.length - 1]}`;

/**
 * The course's Consecutive Days rules as the settings save expects them: one
 * course-wide rule for every section, or one per selected section.
 */
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
  };
  if (config.sectionScope === "all") return [{ ...base, section_id: null }];
  const known = new Set(sections.map((section) => section.id));
  return config.selectedSectionIds
    .filter((id) => known.has(id))
    .map((id) => ({ ...base, section_id: Number(id) }));
}

/** Two rule lists for one course say the same thing, in any order. */
export function sameConsecutiveRules(left: ConsecutiveDayRule[], right: ConsecutiveDayRule[]): boolean {
  const key = (rule: ConsecutiveDayRule) =>
    `${rule.section_id ?? "all"}:${rule.day_count}:${rule.preferred_start_day ?? ""}`;
  const a = left.map(key).sort();
  const b = right.map(key).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The Consecutive Days rule each of this run's sections follows for a
 * course: its own, else the course-wide one. Mirrors
 * `SchedulingPolicy::resolveConsecutiveDayRules`.
 */
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

/** One section's Consecutive Days rule for a course: its own, else the course-wide one. */
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

/** The marker every meeting of a run is saved with: `consecutive:N`. */
export const consecutivePattern = (dayCount: number): string => `consecutive:${dayCount}`;

/** A Consecutive Days placement in Manual Scheduling: its length and the runs the week allows. */
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
  return {
    dayCount: rule.day_count,
    preferredStartDay: rule.preferred_start_day,
    runs: consecutiveDayRuns(rule.day_count, sundayClassesEnabled),
  };
}

/** The run that starts on this day, or null when it would run past the week. */
export const runStartingOn = (placement: ConsecutivePlacement, dayIndex: number): string[] | null =>
  placement.runs.find((run) => run[0] === DAYS[dayIndex]) ?? null;

/** The days ticked in Setup Courses, which the class meets on, or null. */
export const tickedRun = (placement: ConsecutivePlacement): string[] | null =>
  placement.runs.find((run) => run[0] === placement.preferredStartDay) ?? null;

/**
 * Where a run starts when it is dropped on `dayIndex`: on its ticked days
 * when it has them; else on that day if a run can, else the latest run that
 * still covers it, else the first run of the week.
 */
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

/**
 * The run of `dayCount` days starting on `startDay`, kept inside the teaching
 * week: a run that would pass its end starts earlier instead (Friday + 3
 * days without Sunday is Thursday-Saturday). Empty for a day not in the week.
 */
export function runFrom(startDay: string, dayCount: number, sundayClassesEnabled: boolean): string[] {
  const week = teachingWeek(sundayClassesEnabled);
  const start = week.indexOf(startDay);
  if (start < 0 || dayCount > week.length) return [];
  const from = Math.min(start, week.length - dayCount);
  return week.slice(from, from + dayCount);
}

/**
 * Whether `days` are distinct and calendar-consecutive, in any order. Mirrors
 * `SchedulingPolicy::isConsecutiveDaySet`: Sunday -> Monday is the next week.
 */
export function isBackToBack(days: string[]): boolean {
  const indexes = [...new Set(days)].map((day) => DAYS.indexOf(day)).sort((a, b) => a - b);
  return (
    indexes.length === days.length &&
    indexes.every((index, position) => index >= 0 && index === indexes[0] + position)
  );
}

/** "3 days · Thu–Sat" when the days are chosen, else "3 consecutive days". */
export function consecutiveSummary(dayCount: number, startDay: string | null): string {
  const start = startDay ? DAYS.indexOf(startDay) : -1;
  const end = start >= 0 ? DAYS[start + dayCount - 1] : undefined;
  return startDay && end
    ? `${dayCount} days · ${startDay.slice(0, 3)}–${end.slice(0, 3)}`
    : `${dayCount} consecutive days`;
}

/** The Generator's own weekly length for an editable shape: `units × 60`. */
export function defaultDurationMinutes(course: Course): number {
  return getCourseSlotPlan(course).singleBlockSlots * SLOT_MINUTES;
}

/**
 * The longest weekly time the save will accept. A Split Session (and the
 * fixed Hybrid Split) is capped at the course's units
 * (`minor_split_duration`); a single meeting at the larger of the
 * Generator's two shapes (`class_duration`). Integrated's two sessions are
 * not capped by it: each takes the length the user sets.
 */
export function maxDurationMinutes(
  course: Course,
  shape: DurationShape,
  labSettings?: LaboratoryDurationSettings | null,
): number {
  const plan = getCourseSlotPlan(course);
  const units = plan.singleBlockSlots * SLOT_MINUTES;
  if (shape === "split" || shape === "hybrid-split") return units;

  const laboratory =
    Number(course.labHours ?? 0) > 0
      ? laboratoryComponentSlots(course, labSettings) * SLOT_MINUTES
      : 0;
  return Math.max(units, plan.lectureSlots * SLOT_MINUTES + laboratory);
}

/**
 * Lecture and laboratory minutes of an Integrated Hybrid, as the Generator
 * places them: one hour per lecture unit, and the laboratory at three hours
 * per laboratory unit unless the department set a Custom Lab Duration. Both
 * come from the course, never from fixed numbers, and stay separate.
 */
export function hybridLaboratoryMinutes(
  course: Course,
  labSettings?: LaboratoryDurationSettings | null,
): { lecture: number; laboratory: number } {
  return {
    lecture: getCourseSlotPlan(course).lectureSlots * SLOT_MINUTES,
    laboratory: laboratoryComponentSlots(course, labSettings) * SLOT_MINUTES,
  };
}

/**
 * Step 2's Default Settings: set once and applied to every course that has no
 * Configure settings of its own. `null` keeps each course's own length.
 */
export interface CourseDefaults {
  /** Weekly minutes of a lecture course, and of an Integrated course's lecture. */
  lectureMinutes: number | null;
  /** Weekly minutes of a laboratory course, and of an Integrated course's laboratory. */
  laboratoryMinutes: number | null;
  /** A Split Session or Hybrid Split may also meet Friday + Saturday, after MW and TTh. */
  allowFridaySaturdaySplit: boolean;
}

export const EMPTY_COURSE_DEFAULTS: CourseDefaults = {
  lectureMinutes: null,
  laboratoryMinutes: null,
  allowFridaySaturdaySplit: false,
};

const meetsAsLaboratory = (course: Course): boolean =>
  Number(course.labHours ?? 0) > 0 || course.roomTypeRequired === "laboratory";

/**
 * The course's configuration with the Default Settings applied.
 *
 * A lecture course takes the Lecture Duration, a laboratory course the
 * Laboratory Duration, and an Integrated course one for each session. A
 * default that does not fit the course -- longer than it may meet a week
 * (`class_duration`), or not whole slots per meeting -- leaves the course its
 * own length and is reported as `skipped`, so a default never produces a
 * configuration the save refuses. Field courses and Hybrid Split's fixed
 * meetings are left alone.
 */
export function applyCourseDefaults(
  config: CourseClassConfig,
  course: Course,
  defaults: CourseDefaults,
  labSettings?: LaboratoryDurationSettings | null,
): { config: CourseClassConfig; applied: boolean; skipped: boolean } {
  if (config.component === "field") return { config, applied: false, skipped: false };
  const shape = durationShape(config);

  if (isIntegratedShape(shape)) {
    const own = hybridLaboratoryMinutes(course, labSettings);
    const wanted = defaults.lectureMinutes !== null || defaults.laboratoryMinutes !== null;
    const lecture = defaults.lectureMinutes ?? own.lecture;
    const laboratory = defaults.laboratoryMinutes ?? own.laboratory;
    // Each session takes its length exactly; no unit-derived total caps the pair.
    const fits = [lecture, laboratory].every((minutes) => minutes > 0 && minutes % SLOT_MINUTES === 0);
    return {
      config: {
        ...config,
        lectureMinutes: fits && lecture !== own.lecture ? lecture : undefined,
        laboratoryMinutes: fits && laboratory !== own.laboratory ? laboratory : undefined,
      },
      applied: wanted && fits,
      skipped: wanted && !fits,
    };
  }

  if (!isDurationEditable(shape)) return { config, applied: false, skipped: false };
  const wanted = meetsAsLaboratory(course) ? defaults.laboratoryMinutes : defaults.lectureMinutes;
  const perMeeting = shape === "split" ? 2 : 1;
  const fits =
    wanted !== null &&
    wanted > 0 &&
    wanted <= maxDurationMinutes(course, shape, labSettings) &&
    wanted % (SLOT_MINUTES * perMeeting) === 0;
  return {
    config: { ...config, durationMinutes: fits ? wanted : defaultDurationMinutes(course) },
    applied: fits,
    skipped: wanted !== null && !fits,
  };
}

/** Integrated Hybrid's session lengths: the ones chosen, else the course's own. */
export function integratedHybridMinutes(
  config: Pick<CourseClassConfig, "lectureMinutes" | "laboratoryMinutes">,
  course: Course,
  labSettings?: LaboratoryDurationSettings | null,
): { lecture: number; laboratory: number } {
  const defaults = hybridLaboratoryMinutes(course, labSettings);
  return {
    lecture: config.lectureMinutes ?? defaults.lecture,
    laboratory: config.laboratoryMinutes ?? defaults.laboratory,
  };
}

/** One weekly meeting the Generator will place for a course. */
export interface MeetingPart {
  /** "Class", "Meeting 1", "Lecture", "Laboratory", … */
  label: string;
  minutes: number;
  /** Set when the meeting's delivery is fixed by the shape. */
  mode?: "Online" | "F2F";
}

/**
 * The course's meetings, one entry per session. Both Hybrid types are always
 * two separate sessions — never one combined block — so callers can show
 * each with its own length and delivery.
 */
export function meetingParts(
  config: CourseClassConfig,
  course: Course,
  labSettings?: LaboratoryDurationSettings | null,
): MeetingPart[] {
  switch (durationShape(config)) {
    case "split": {
      // An Online Split meets online both times; an On-Site one keeps the
      // Generator's own choice of room.
      const mode = config.delivery === "online" ? "Online" : undefined;
      return [
        { label: "Meeting 1", minutes: config.durationMinutes / 2, mode },
        { label: "Meeting 2", minutes: config.durationMinutes / 2, mode },
      ];
    }
    case "hybrid-split":
      return [
        { label: "Meeting 1", minutes: HYBRID_SPLIT_MEETING_MINUTES, mode: "Online" },
        { label: "Meeting 2", minutes: HYBRID_SPLIT_MEETING_MINUTES, mode: "F2F" },
      ];
    case "integrated-onsite":
    case "hybrid-laboratory": {
      const { lecture, laboratory } = integratedHybridMinutes(config, course, labSettings);
      return [
        { label: "Lecture", minutes: lecture, mode: config.delivery === "hybrid" ? "Online" : "F2F" },
        { label: "Laboratory", minutes: laboratory, mode: "F2F" },
      ];
    }
    default:
      // A Consecutive Days class meets for its full length on every day.
      return isConsecutive(config)
        ? Array.from({ length: config.consecutiveDays ?? DEFAULT_CONSECUTIVE_DAYS }, (_, index) => ({
            label: `Day ${index + 1}`,
            minutes: config.durationMinutes,
            mode: config.delivery === "online" ? ("Online" as const) : undefined,
          }))
        : [{ label: "Class", minutes: config.durationMinutes }];
  }
}

const describePart = (part: MeetingPart): string =>
  `${formatHours(part.minutes / 60)}${part.mode ? ` ${part.mode}` : ""}`;

/**
 * What the Generator will place, one session per part, e.g. "3h",
 * "1.5h + 1.5h", "1.5h Online + 1.5h F2F" or "2h Online + 3h F2F".
 */
export function durationLabel(
  config: CourseClassConfig,
  course: Course,
  labSettings?: LaboratoryDurationSettings | null,
): string {
  const parts = meetingParts(config, course, labSettings);
  // A run's days are one class at one length: "3 days × 8h".
  if (isConsecutive(config) && parts.length > 0) {
    return `${parts.length} days × ${describePart(parts[0])}`;
  }
  return parts.map(describePart).join(" + ");
}

/** A room `/scheduling-settings` says this department can reach (RoomAccessPolicy). */
export interface PreferredRoomOption {
  id: number | string;
  room_code: string;
  room_type: string;
  building?: string | null;
  allow_lecture_usage?: boolean;
}

/**
 * Whether a laboratory may host this course's lecture meeting. Mirrors
 * `SchedulingPolicy::laboratoryServesLecture`: a lecture-only major, in a
 * laboratory flagged for lecture use. Minors never use a laboratory.
 */
const laboratoryServesLecture = (course: Course, room: PreferredRoomOption): boolean =>
  course.category === "major" &&
  Number(course.lectureHours ?? 0) > 0 &&
  Number(course.labHours ?? 0) === 0 &&
  (course.roomTypeRequired ?? "lecture") === "lecture" &&
  room.room_type === "laboratory" &&
  Boolean(room.allow_lecture_usage);

/**
 * Rooms the course's face-to-face meeting can use, by the same rule the
 * server validates the choice with (it also refuses a room that is not
 * available or not reachable). The options come from the department's own
 * room list; nothing here names a room. An online class uses none.
 *
 * Field is chosen here, not by the course's name: a course that can meet in
 * the field is offered field rooms beside its classrooms, and picking one is
 * what makes it a field course. With no preference it is scheduled like any
 * other minor. Only a course whose record requires the field is limited to
 * field rooms.
 */
export function compatibleRoomOptions(
  course: Course,
  config: Pick<CourseClassConfig, "configuration" | "delivery">,
  isFieldCourse: boolean,
  options: PreferredRoomOption[],
): PreferredRoomOption[] {
  if (config.delivery === "online") return [];
  const fieldRooms = options.filter((room) => room.room_type === "field");
  if (course.roomTypeRequired === "field") return fieldRooms;

  // A laboratory course meets in a laboratory: as one block, or as the
  // on-site half of an Integrated Hybrid.
  const needsLaboratory =
    Number(course.labHours ?? 0) > 0 || course.roomTypeRequired === "laboratory";
  if (needsLaboratory) {
    return options.filter((room) => room.room_type === "laboratory");
  }
  const classrooms = options.filter(
    (room) => room.room_type === "lecture" || laboratoryServesLecture(course, room),
  );
  return canMeetInField(course, isFieldCourse) ? [...classrooms, ...fieldRooms] : classrooms;
}

/**
 * Whether a field room may be offered: a course already on the department's
 * field list, or a lecture-only minor such as PATHFIT or NSTP.
 */
export const canMeetInField = (course: Course, isFieldCourse: boolean): boolean =>
  isFieldCourse ||
  (course.category === "minor" &&
    Number(course.labHours ?? 0) === 0 &&
    course.roomTypeRequired !== "laboratory");

/**
 * Infer the course-level configuration from course metadata and the section
 * configs, so reopening Setup Courses shows what the Generator will receive.
 */
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
  // Consecutive Days is the department's saved rule, so it outranks what the
  // draft says: the server refuses a run that also splits the course.
  const consecutiveBySection = consecutiveRulesBySection(course.id, consecutiveRules, sections);
  const sectionsWithConsecutive = sections.filter((s) => consecutiveBySection.has(s.id));

  const isAnyConsecutive = sectionsWithConsecutive.length > 0;
  const isAnySplit = !isAnyConsecutive && sectionsWithSplit.length > 0;
  const isAnyHybrid = sectionsWithHybrid.length > 0;
  const isAnyHybridSplit = sectionsWithHybridSplit.length > 0;

  // Determine section scope
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

  // A saved custom duration or room lives on each targeted section; the
  // first targeted section that carries one speaks for the course.
  const targets = sections.filter((s) => selectedSectionIds.includes(s.id));
  const savedMinutes = targets
    .map((s) => configs[s.id]?.durationMinutesByCourseId?.[course.id])
    .find((minutes): minutes is number => typeof minutes === "number" && minutes > 0);
  const savedRoom = targets
    .map((s) => configs[s.id]?.preferredRoomsByCourseId?.[course.id])
    .find((roomId): roomId is string => Boolean(roomId));
  const savedComponents = targets
    .map((s) => configs[s.id]?.componentMinutesByCourseId?.[course.id])
    .find(Boolean);

  const shared = {
    durationMinutes: savedMinutes ?? defaultDurationMinutes(course),
    lectureMinutes: savedComponents?.lecture,
    laboratoryMinutes: savedComponents?.laboratory,
    requiredDay,
    preferredRoomId: savedRoom ?? null,
    sectionScope,
    selectedSectionIds,
  };

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
      // A run cannot also have a Required Day; the server refuses the pair.
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
    // Integrated is always lecture + laboratory; the delivery decides the
    // lecture: On-site keeps it face-to-face, otherwise it is online.
    const onSite = sectionsWithHybrid.some(
      (s) => configs[s.id]?.modesByCourseId?.[course.id] === "on-site",
    );
    return {
      ...shared,
      configuration: "integrated",
      component: "lecture",
      delivery: onSite ? "onsite" : "hybrid",
      hybridType: onSite ? undefined : "laboratory",
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

/**
 * Synchronize the course-level configuration back to the per-section configs
 * the Review step and the generation payload read.
 */
export function syncCourseConfigToSectionConfigs(
  course: Course,
  courseConfig: CourseClassConfig,
  sections: Section[],
  configs: Record<string, CourseSetupConfig>,
  onConfigChange: (sectionId: string, change: Partial<CourseSetupConfig>) => void,
  labSettings?: LaboratoryDurationSettings | null,
): void {
  const courseId = course.id;
  const targetSectionIds = new Set(
    courseConfig.sectionScope === "all"
      ? sections.map((s) => s.id)
      : courseConfig.selectedSectionIds,
  );
  // Only a length that differs from the Generator's own is sent, so a later
  // change to the course's units is not masked by a stale copy of the default.
  const customMinutes =
    isDurationEditable(durationShape(courseConfig)) &&
    courseConfig.durationMinutes !== defaultDurationMinutes(course)
      ? courseConfig.durationMinutes
      : null;
  // Integrated's two sessions, sent only when one differs from the
  // course's own so a later curriculum change still reaches the Generator.
  const hybridDefaults = hybridLaboratoryMinutes(course, labSettings);
  const chosenComponents = integratedHybridMinutes(courseConfig, course, labSettings);
  const customComponents =
    isIntegratedShape(durationShape(courseConfig)) &&
    (chosenComponents.lecture !== hybridDefaults.lecture ||
      chosenComponents.laboratory !== hybridDefaults.laboratory)
      ? chosenComponents
      : null;

  for (const section of sections) {
    const isTarget = targetSectionIds.has(section.id);
    const current = configs[section.id];
    const currentSplit = current?.splitCourseIds ?? [];
    const currentGecSplit = current?.gecSplitCourseIds ?? [];
    const currentHybridSplit = current?.hybridSplitCourseIds ?? [];
    const currentModes = current?.modesByCourseId ?? {};
    const currentDurations = current?.durationMinutesByCourseId ?? {};
    const currentRooms = current?.preferredRoomsByCourseId ?? {};
    const currentComponents = current?.componentMinutesByCourseId ?? {};

    const without = (ids: string[]) => ids.filter((id) => id !== courseId);
    const withCourse = (ids: string[]) => Array.from(new Set([...ids, courseId]));

    let nextSplit = without(currentSplit);
    let nextGecSplit = without(currentGecSplit);
    let nextHybridSplit = without(currentHybridSplit);
    const nextModes = { ...currentModes };
    const nextDurations = { ...currentDurations };
    const nextRooms = { ...currentRooms };
    const nextComponents = { ...currentComponents };
    delete nextDurations[courseId];
    delete nextRooms[courseId];
    delete nextComponents[courseId];

    if (isTarget) {
      if (courseConfig.configuration === "split") {
        // Split Session is gecSplitCourseIds. Hybrid Split is a separate
        // marker because Hybrid Laboratory uses splitCourseIds.
        nextGecSplit = withCourse(currentGecSplit);
        if (courseConfig.delivery === "hybrid") nextHybridSplit = withCourse(currentHybridSplit);
      } else if (courseConfig.configuration === "integrated") {
        // Lecture and laboratory as two sessions; the course's mode below
        // tells the Generator whether the lecture is on site or online.
        nextSplit = withCourse(currentSplit);
      }
      if (customMinutes !== null) nextDurations[courseId] = customMinutes;
      if (customComponents !== null) nextComponents[courseId] = customComponents;
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
      JSON.stringify(nextDurations) !== JSON.stringify(currentDurations) ||
      JSON.stringify(nextRooms) !== JSON.stringify(currentRooms) ||
      JSON.stringify(nextComponents) !== JSON.stringify(currentComponents);

    if (changed) {
      onConfigChange(section.id, {
        splitCourseIds: nextSplit,
        gecSplitCourseIds: nextGecSplit,
        hybridSplitCourseIds: nextHybridSplit,
        modesByCourseId: nextModes,
        durationMinutesByCourseId: nextDurations,
        preferredRoomsByCourseId: nextRooms,
        componentMinutesByCourseId: nextComponents,
      });
    }
  }
}
