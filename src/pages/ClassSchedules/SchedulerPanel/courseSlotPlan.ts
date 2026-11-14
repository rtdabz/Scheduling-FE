import type { Course, ScheduleItem, Subject } from "./types";

export const SLOTS_PER_HOUR = 2;

export const SLOT_MINUTES = 30;

type CourseHours = Pick<Partial<Course>, "lectureHours" | "labHours" | "lectureMinutes" | "laboratoryMinutes">;

/** Department scheduling settings the slot helpers read. */
export interface SchedulingRoomSettings {
  lab_room_type?: string | null;
}

export interface CourseSlotPlan {
  /** The course's Total Hours a week, as slots: lecture plus laboratory hours. */
  totalSlots: number;
  lectureSlots: number;
  laboratorySlots: number;
  hasBothComponents: boolean;
}

/** Minutes, when the curriculum recorded them on import; otherwise the course's own hours. */
const componentSlots = (minutes: number | null | undefined, hours: number | undefined): number =>
  typeof minutes === "number"
    ? Math.floor(Math.max(0, minutes) / SLOT_MINUTES)
    : Math.round(Math.max(0, Number(hours ?? 0)) * SLOTS_PER_HOUR);

/**
 * The course's class time, matching SchedulingPolicy on the server: the minutes its curriculum
 * recorded on import (see placeCourse), otherwise its lecture and laboratory hours as recorded.
 */
export const getCourseSlotPlan = (course?: CourseHours | null): CourseSlotPlan => {
  const lectureSlots = componentSlots(course?.lectureMinutes, course?.lectureHours);
  const laboratorySlots = componentSlots(course?.laboratoryMinutes, course?.labHours);

  return {
    totalSlots: lectureSlots + laboratorySlots,
    lectureSlots,
    laboratorySlots,
    hasBothComponents: lectureSlots > 0 && laboratorySlots > 0,
  };
};

const curriculumPlacement = (course: Course, curriculumId: number | string | null | undefined) =>
  curriculumId == null
    ? undefined
    : course.curriculumPlacements?.find((placement) => String(placement.curriculumId) === String(curriculumId));

/**
 * The course as placed in a curriculum: it carries the year level, semester, and class minutes
 * that curriculum recorded, not another active curriculum's.
 */
export const placeCourse = <T extends Course>(course: T, curriculumId: number | string | null | undefined): T => {
  const recorded = curriculumId == null ? undefined : course.classMinutesByCurriculum?.[String(curriculumId)];
  const placement = curriculumPlacement(course, curriculumId);
  return {
    ...course,
    ...(placement ? { yearLevel: placement.yearLevel, semester: placement.semester } : {}),
    lectureMinutes: recorded ? recorded.lecture : undefined,
    laboratoryMinutes: recorded ? recorded.laboratory : undefined,
  };
};

/**
 * Whether the curriculum offers the course, matching the server's curriculum membership rule.
 * A section without a curriculum, or a payload without placements, cannot tell, so it allows.
 */
export const courseInCurriculum = (course: Course, curriculumId: number | string | null | undefined): boolean =>
  curriculumId == null || course.curriculumPlacements === undefined || curriculumPlacement(course, curriculumId) !== undefined;

/**
 * Each consecutive-day meeting's length, matching SchedulingPolicy on the server: the course's full
 * Total Hours repeated on every selected day (PRAC 101 at 6 hours on 3 days meets 6 hours a day,
 * 18 hours in all). Null when the course has no time or the day count is not a run.
 */
export const consecutiveMeetingSlots = (course: CourseHours | null | undefined, dayCount: number): number | null => {
  const total = getCourseSlotPlan(course).totalSlots;
  return dayCount >= 2 && total > 0 ? total : null;
};

export const slotsToHours = (slots: number): number => slots / SLOTS_PER_HOUR;

export const laboratoryComponentSlots = (course?: CourseHours | null): number =>
  getCourseSlotPlan(course).laboratorySlots;

export const sortSplitMeetingsForEdit = (
  items: ScheduleItem[],
  subject?: Subject | null,
  laboratoryFirst = false,
): ScheduleItem[] => {
  const { lectureSlots, laboratorySlots: labSlots } = getCourseSlotPlan(subject);
  const meetingRank = (item: ScheduleItem): number => {
    if (item.meetingType === "laboratory") return laboratoryFirst ? 0 : 1;
    if (item.meetingType === "lecture") return laboratoryFirst ? 1 : 0;
    if (labSlots > 0 && item.durationSlots === labSlots) return laboratoryFirst ? 0 : 1;
    if (lectureSlots > 0 && item.durationSlots === lectureSlots) return laboratoryFirst ? 1 : 0;
    return 2;
  };

  return [...items].sort((a, b) =>
    meetingRank(a) - meetingRank(b)
    || a.dayIndex - b.dayIndex
    || a.startSlot - b.startSlot
  );
};
