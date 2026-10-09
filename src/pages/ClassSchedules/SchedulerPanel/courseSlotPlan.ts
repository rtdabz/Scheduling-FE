import type { Course, ScheduleItem, Subject } from "./types";

export const SLOTS_PER_HOUR = 2;

export const SLOTS_PER_LABORATORY_UNIT = 6;

type CourseHours = Pick<Partial<Course>, "units" | "lectureHours" | "labHours">;

export interface CourseSlotPlan {
  singleBlockSlots: number;
  lectureSlots: number;
  laboratorySlots: number;
  splitTotalSlots: number;
  hasBothComponents: boolean;
}

export const getCourseSlotPlan = (course?: CourseHours | null): CourseSlotPlan => {
  const units = Number(course?.units ?? 3);
  const lectureHours = Number(course?.lectureHours ?? 0);
  const labHours = Number(course?.labHours ?? 0);

  const lectureSlots = Math.max(0, Math.round(lectureHours * SLOTS_PER_HOUR));
  const laboratorySlots = Math.max(0, Math.round(labHours * SLOTS_PER_LABORATORY_UNIT));

  return {
    singleBlockSlots: course ? Math.max(0, Math.round(units * SLOTS_PER_HOUR)) : 0,
    lectureSlots,
    laboratorySlots,
    splitTotalSlots: lectureSlots + laboratorySlots,
    hasBothComponents: lectureHours > 0 && labHours > 0,
  };
};

export const slotsToHours = (slots: number): number => slots / SLOTS_PER_HOUR;

export interface LaboratoryDurationSettings {
  custom_lab_duration_override_enabled?: boolean | null;
  custom_lab_duration_minutes?: number | null;
  custom_lab_duration_6_hours_enabled?: boolean | null;
  custom_lab_duration_5_hours_enabled?: boolean | null;
  custom_lab_duration_other_enabled?: boolean | null;
  lab_room_type?: string | null;
}

export const SLOT_MINUTES = 30;

export const customLaboratoryDurationSlots = (settings?: LaboratoryDurationSettings | null): number | null => {
  if (!settings?.custom_lab_duration_override_enabled) return null;

  const minutes = settings.custom_lab_duration_6_hours_enabled
    ? 360
    : settings.custom_lab_duration_5_hours_enabled
      ? 300
      : settings.custom_lab_duration_other_enabled
        ? Number(settings.custom_lab_duration_minutes ?? 0)
        : 0;

  if (!Number.isFinite(minutes) || minutes <= 0 || minutes % SLOT_MINUTES !== 0) return null;
  return minutes / SLOT_MINUTES;
};

export const laboratoryComponentSlots = (
  course?: CourseHours | null,
  settings?: LaboratoryDurationSettings | null,
): number => customLaboratoryDurationSlots(settings) ?? getCourseSlotPlan(course).laboratorySlots;

export const sortSplitMeetingsForEdit = (
  items: ScheduleItem[],
  subject?: Subject | null,
  laboratoryFirst = false,
  laboratorySettings: LaboratoryDurationSettings | null = null,
): ScheduleItem[] => {
  const lectureSlots = getCourseSlotPlan(subject).lectureSlots;
  const labSlots = Number(subject?.labHours ?? 0) > 0 ? laboratoryComponentSlots(subject, laboratorySettings) : 0;
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
