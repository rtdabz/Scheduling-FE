import type { Course } from "./types";

/**
 * Slot arithmetic for one course, mirroring the server.
 *
 * Audit finding #19 (and finding #3 of the July 2026 split-hours audit) reported
 * "three inconsistent slot-duration formulas". Two of the three are in fact the
 * server's own, and they are different on purpose:
 *
 *  - a **single block** lasts `units * 2` slots — `CSPSolver::rawDurationSlots`
 *  - a **lecture/laboratory split** lasts `lectureHours * 2` for the lecture and
 *    `labHours * 6` for the laboratory — `CSPSolver::buildVariables`, where one
 *    laboratory unit is three clock hours
 *
 * The third was neither: `(isMajor && hasBoth) ? 6 : totalSlots` hardcoded a
 * 3-unit answer, so a 5-unit major with both components was offered a 3-hour
 * block. Naming both conventions here is what stops them being conflated again.
 */

/** 30-minute grid: one clock hour is two slots. */
export const SLOTS_PER_HOUR = 2;

/** One laboratory unit is three clock hours. */
export const SLOTS_PER_LABORATORY_UNIT = 6;

type CourseHours = Pick<Partial<Course>, "units" | "lectureHours" | "labHours">;

export interface CourseSlotPlan {
  /** `units * 2` — one meeting covering the whole course. */
  singleBlockSlots: number;
  /** `lectureHours * 2` — the lecture meeting of a lecture/laboratory split. */
  lectureSlots: number;
  /** `labHours * 6` — the laboratory meeting of a lecture/laboratory split. */
  laboratorySlots: number;
  /** Lecture + laboratory, i.e. what a lecture/laboratory split actually occupies. */
  splitTotalSlots: number;
  /** True when the course has both a lecture and a laboratory component. */
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

/** Slots to clock hours, for labels. Never call this "units". */
export const slotsToHours = (slots: number): number => slots / SLOTS_PER_HOUR;
