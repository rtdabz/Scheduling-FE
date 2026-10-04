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
  minorEnabled: boolean;
  majorLectureEnabled: boolean;
};

export const balancedSplitSettingsOf = (_settings: {
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
} | null | undefined): BalancedSplitSettings => ({
  minorEnabled: true,
  majorLectureEnabled: true,
});

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

export const HYBRID_SPLIT_MEETING_MINUTES = 90;

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

export const savedMeetingPairShape = (
  course: Pick<Course, "lectureHours" | "labHours"> | null | undefined,
  meetingCount: number,
  isHybrid: boolean,
  preferredPattern?: string | null,
  meetingTypes?: ReadonlyArray<string | null | undefined>,
): { isIntegrated: boolean; isSplit: boolean } => {
  const hasLectureAndLab = Number(course?.lectureHours ?? 0) > 0 && Number(course?.labHours ?? 0) > 0;
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
