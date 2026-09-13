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
  overrideEnabled: boolean,
  fieldCourseCodes: ReadonlySet<string> = new Set(),
): boolean => Boolean(
  overrideEnabled
  && course?.category === "major"
  && !isConfiguredFieldCourse(course, fieldCourseCodes)
  && Number(course.lectureHours ?? 0) > 0
  && Number(course.labHours ?? 0) > 0
);

export type BalancedSplitSettings = {
  /** Department setting: Minor Course Split Sessions. */
  minorEnabled: boolean;
  /** Department setting: Major Lecture Split Sessions. */
  majorLectureEnabled: boolean;
};

export const balancedSplitSettingsOf = (settings: {
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
} | null | undefined): BalancedSplitSettings => ({
  minorEnabled: settings?.gec_split_schedule_override_enabled === true,
  majorLectureEnabled:
    settings?.major_lecture_split_schedule_override_enabled === true,
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
      settings.majorLectureEnabled
      && Number(course.lectureHours ?? 0) > 0
      && Number(course.labHours ?? 0) === 0,
    );
  }

  return settings.minorEnabled;
};

export const isFieldSchedulingEligible = (course: Course | null | undefined): boolean => (
  Boolean(course) && Number(course?.labHours ?? 0) <= 0
);
