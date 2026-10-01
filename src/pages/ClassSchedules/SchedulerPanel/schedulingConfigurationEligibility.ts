import { isFixedSplitPattern } from "../../../lib/timeGrid";
import type { Course } from "./types";

const normalizeCourseCode = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toUpperCase();

export const isConfiguredFieldCourse = (
  course: Course | null | undefined,
  fieldCourseCodes: ReadonlySet<string> = new Set(),
): boolean => {
  if (!course) return false;

  const normalizedCode = normalizeCourseCode(course.code);
  return (
    course.roomTypeRequired === "field" ||
    Array.from(fieldCourseCodes).some(
      (code) => normalizeCourseCode(code) === normalizedCode,
    )
  );
};

export const isHybridSchedulingEligible = (
  course: Course | null | undefined,
  _overrideEnabled = true,
  fieldCourseCodes: ReadonlySet<string> = new Set(),
): boolean => Boolean(
  course?.category === "major"
  && !isConfiguredFieldCourse(course, fieldCourseCodes)
  && Number(course.lectureHours ?? 0) > 0
  && Number(course.labHours ?? 0) > 0
);

export type BalancedSplitSettings = {
  /** Retained for compatibility with older settings payloads. */
  minorEnabled: boolean;
  /** Retained for compatibility with older settings payloads. */
  majorLectureEnabled: boolean;
};

export const balancedSplitSettingsOf = (_settings: {
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
} | null | undefined): BalancedSplitSettings => ({
  // Split Session is selected per course in Step 2. Keep this compatibility
  // shape for callers that still pass the old settings payload, but never let
  // the removed department switches gate an eligible course.
  minorEnabled: true,
  majorLectureEnabled: true,
});

/**
 * Mirrors SchedulingPolicy::balancedSplitEligible on the server. Every minor is
 * splittable, and so is a major with lecture or laboratory units — a
 * laboratory-only (0 LEC + LAB) major included. A major with both components
 * may be Split or Integrated; Setup Courses keeps one shape per course.
 */
export const isBalancedSplitSchedulingEligible = (
  course: Course | null | undefined,
  settings: BalancedSplitSettings,
): boolean => {
  if (!course) return false;

  if (course.category === "major") {
    return Number(course.lectureHours ?? 0) > 0 || Number(course.labHours ?? 0) > 0;
  }

  return settings.minorEnabled || settings.majorLectureEnabled;
};

/**
 * Length of each Hybrid Split meeting — one online, one face-to-face.
 * Mirrors `SchedulingPolicy::HYBRID_SPLIT_MEETING_MINUTES`.
 */
export const HYBRID_SPLIT_MEETING_MINUTES = 90;

/**
 * Hybrid Split is the fixed shape of two {@link HYBRID_SPLIT_MEETING_MINUTES}
 * meetings, so a course qualifies when they add up to exactly its weekly
 * contact time (`units × 60`). Courses with a different total stay regular or
 * use the ordinary Split Session shape.
 */
export const isHybridSplitEligible = (
  course: Course | null | undefined,
): boolean => Boolean(
  isBalancedSplitSchedulingEligible(course, {
    minorEnabled: true,
    majorLectureEnabled: true,
  })
  && Math.round(Number(course?.units ?? 0) * 60) === 2 * HYBRID_SPLIT_MEETING_MINUTES
  && Number(course?.lectureHours ?? 0) > 0
  && Number(course?.labHours ?? 0) === 0,
);

/**
 * Online Split: both Split Session meetings online. Mirrors
 * `SchedulingPolicy::allowsOnlineRoomFallback`: only a lecture meets online,
 * never a laboratory or field course.
 */
export const isOnlineSplitEligible = (
  course: Course | null | undefined,
  fieldCourseCodes: ReadonlySet<string> = new Set(),
): boolean => Boolean(
  isBalancedSplitSchedulingEligible(course, {
    minorEnabled: true,
    majorLectureEnabled: true,
  })
  && !isConfiguredFieldCourse(course, fieldCourseCodes)
  && Number(course?.labHours ?? 0) === 0
  && course?.roomTypeRequired !== "laboratory",
);

/**
 * Which two-meeting option a course's saved (or recommended) meetings are, read
 * the way Generate Schedule writes them.
 *
 * Integrated belongs to a course with both a lecture and a laboratory; it is
 * saved hybrid when its lecture is online and as a plain linked pair when both
 * meet on site. Every other pair is a Split Session. The generator saves a
 * split as `days:x-y` rather than `MW`/`TTh`, and a Hybrid Split carries
 * `is_hybrid`, so neither the named pattern nor the flag alone identifies one.
 */
export const savedMeetingPairShape = (
  course: Pick<Course, "lectureHours" | "labHours"> | null | undefined,
  meetingCount: number,
  isHybrid: boolean,
  preferredPattern?: string | null,
  meetingTypes?: ReadonlyArray<string | null | undefined>,
): { isIntegrated: boolean; isSplit: boolean } => {
  const hasLectureAndLab = Number(course?.lectureHours ?? 0) > 0 && Number(course?.labHours ?? 0) > 0;
  // Integrated is one lecture and one laboratory meeting. A Split Session of
  // the same course (allowed since it has laboratory units) is the class
  // halved, so its meetings never carry that pair.
  const hasComponentPair = meetingTypes === undefined
    || (meetingTypes.includes("lecture") && meetingTypes.includes("laboratory"));
  const isIntegrated = hasLectureAndLab
    && hasComponentPair
    && (isHybrid || (meetingCount >= 2 && !isFixedSplitPattern(preferredPattern)));

  return { isIntegrated, isSplit: meetingCount >= 2 && !isIntegrated };
};

export const isFieldSchedulingEligible =(course: Course | null | undefined): boolean => (
  Boolean(course) && Number(course?.labHours ?? 0) <= 0
);
