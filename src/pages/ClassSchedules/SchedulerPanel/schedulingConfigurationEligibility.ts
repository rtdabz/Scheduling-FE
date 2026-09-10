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

export const isMinorSplitSchedulingEligible = (
  course: Course | null | undefined,
  overrideEnabled: boolean,
): boolean => Boolean(overrideEnabled && course?.category === "minor");

export const isFieldSchedulingEligible = (course: Course | null | undefined): boolean => (
  Boolean(course) && Number(course?.labHours ?? 0) <= 0
);
