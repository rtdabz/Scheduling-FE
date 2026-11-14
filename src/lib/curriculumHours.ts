import type { CurriculumCourse, CurriculumCourseHours } from '../types/curriculum';

export const formatHours = (hours: number) => hours.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });

export const hoursLabel = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 hours';
  const hours = minutes / 60;
  return `${formatHours(hours)} ${hours === 1 ? 'hour' : 'hours'}`;
};

/** Short weekly-hours text for table cells, e.g. "5h". */
export const shortHours = (minutes: number) => `${formatHours(Math.max(0, minutes) / 60)}h`;

/**
 * The hours of a row the server has not described yet (e.g. just added): a placement without a
 * recorded conversion uses 1 unit = 1 hour, exactly as the scheduler does.
 */
export const legacyCourseHours = (course: Pick<CurriculumCourse, 'lec_units' | 'lab_units'>): CurriculumCourseHours => {
  const lecture = Math.max(0, Number(course.lec_units) || 0);
  const lab = Math.max(0, Number(course.lab_units) || 0);
  return {
    lecture_units: lecture,
    lab_units: lab,
    lecture_minutes_per_unit: 60,
    laboratory_minutes_per_unit: 60,
    lecture_minutes: lecture * 60,
    laboratory_minutes: lab * 60,
    total_minutes: (lecture + lab) * 60,
    source: 'legacy',
  };
};

/** The course's hours after its units change: the placement keeps its hours per unit. */
export const hoursForUnits = (hours: CurriculumCourseHours | undefined, lecUnits: number, labUnits: number): CurriculumCourseHours | undefined => {
  if (!hours) return undefined;
  const lecture = lecUnits * hours.lecture_minutes_per_unit;
  const laboratory = labUnits * hours.laboratory_minutes_per_unit;
  return { ...hours, lecture_units: lecUnits, lab_units: labUnits, lecture_minutes: lecture, laboratory_minutes: laboratory, total_minutes: lecture + laboratory };
};
