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
import type { CourseSetupConfig } from "./SetupCoursesStep";

export type ClassConfiguration = "regular" | "split" | "integrated";
export type ClassComponent = "lecture" | "laboratory" | "field";
export type DeliveryMode = "onsite" | "online" | "hybrid";
export type SectionScope = "all" | "selected";

/**
 * How a course's meetings are laid out, which decides whether its length can
 * be changed:
 * - `single` — one meeting (Regular)
 * - `split` — two equal meetings on different days
 * - `hybrid-split` — two fixed sessions, one online and one face-to-face,
 *   of `HYBRID_SPLIT_MEETING_MINUTES` each
 * - `integrated-onsite` (Integrated On-site) — a lecture and a laboratory
 *   as two separate sessions, both face-to-face
 * - `hybrid-laboratory` (Integrated Hybrid) — an online lecture and an
 *   on-site laboratory as two separate sessions
 *
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
    case "split":
      return [
        { label: "Meeting 1", minutes: config.durationMinutes / 2 },
        { label: "Meeting 2", minutes: config.durationMinutes / 2 },
      ];
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
      return [{ label: "Class", minutes: config.durationMinutes }];
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
  return meetingParts(config, course, labSettings).map(describePart).join(" + ");
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
): CourseClassConfig {
  const isField = isConfiguredFieldCourse(course, fieldCourseCodes);
  const lecHours = Number(course.lectureHours ?? 0);
  const labHours = Number(course.labHours ?? 0);

  const sectionsWith = (key: "gecSplitCourseIds" | "splitCourseIds" | "hybridSplitCourseIds") =>
    sections.filter((s) => (configs[s.id]?.[key] ?? []).includes(course.id));
  const sectionsWithSplit = sectionsWith("gecSplitCourseIds");
  const sectionsWithHybrid = sectionsWith("splitCourseIds");
  const sectionsWithHybridSplit = sectionsWith("hybridSplitCourseIds");

  const isAnySplit = sectionsWithSplit.length > 0;
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
  if (isAnySplit) narrowTo(sectionsWithSplit);
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

  if (isAnySplit) {
    return {
      ...shared,
      configuration: "split",
      component: labHours > 0 && lecHours === 0 ? "laboratory" : "lecture",
      delivery: isAnyHybridSplit ? "hybrid" : "onsite",
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
