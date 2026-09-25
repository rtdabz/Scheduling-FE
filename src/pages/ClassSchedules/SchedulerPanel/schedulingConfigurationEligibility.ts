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

export const balancedSplitSettingsOf = (settings: {
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
 * Mirrors SchedulingPolicy::balancedSplitEligible on the server. A major is only
 * splittable while it is pure lecture — a major with lab units belongs to the
 * Lecture + Laboratory override, and offering both would let the user build a
 * configuration the generator refuses.
 */
export const isBalancedSplitSchedulingEligible = (
  course: Course | null | undefined,
  settings: BalancedSplitSettings,
): boolean => {
  if (!course) return false;

  if (course.category === "major") {
    return Boolean(
      Number(course.lectureHours ?? 0) > 0
      && Number(course.labHours ?? 0) === 0,
    );
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

export const isFieldSchedulingEligible = (course: Course | null | undefined): boolean => (
  Boolean(course) && Number(course?.labHours ?? 0) <= 0
);
