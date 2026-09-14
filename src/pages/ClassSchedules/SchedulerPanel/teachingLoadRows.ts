/**
 * Turns a faculty member's schedule rows into the lines the Individual Faculty
 * Load Sheet expects, and splits them between its Basic and Overload tables.
 *
 * The form has one line per subject taught -- "MW  7:00-8:30 AM" -- while the
 * schedules table stores one row per meeting day, because `schedules.day` is a
 * single-value enum. So a Monday/Wednesday class is two rows here and one line
 * there, and units must be counted once for the pair rather than once per row.
 */
import type { Faculty, ScheduleItem } from "./types";
import { formatTime12h } from "../../../lib/timeGrid";

/** Rows the blank form provides in each table; anything past this spills to a second sheet. */
export const BASIC_LINE_COUNT = 7;
export const OVERLOAD_LINE_COUNT = 6;

/** The form's day abbreviations, in the order it lists them. */
const DAY_CODES: Record<string, string> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "Th",
  friday: "F",
  saturday: "S",
  sunday: "Su",
};
const DAY_SEQUENCE = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export interface LoadLine {
  code: string;
  title: string;
  /** Combined day codes, e.g. "MW". */
  day: string;
  /** One entry per distinct meeting time, e.g. ["7:00 AM–9:00 AM"]. */
  times: string[];
  section: string;
  lectureUnits: number;
  laboratoryUnits: number;
  totalUnits: number;
  /** Clock hours actually scheduled across every meeting of this subject. */
  totalHours: number;
  /**
   * The load band this subject landed in once classified. Pro bono subjects
   * print in the Overload table, shaded so they read apart from paid overload.
   */
  band?: LoadBand;
  /** A meeting of this subject was assigned over an instructor conflict on purpose. */
  overridden?: boolean;
}

export type LoadBand = "basic" | "overload" | "probono";

/**
 * Matches Print Schedule's "7:00 AM – 9:00 AM" format. Both ends carry their
 * meridiem so every stacked line remains independently readable.
 */
const formatTimeRange = (startTime: string, endTime: string): string => {
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
};

/** Half-hour slots, as clock hours. */
const hoursOf = (schedule: ScheduleItem): number => Math.max(1, schedule.durationSlots) * 0.5;

/**
 * Groups a faculty's meetings into one line per subject-and-section, ordered by
 * the earliest meeting so the classification below is stable between prints.
 */
export const buildLoadLines = (schedules: ScheduleItem[]): LoadLine[] => {
  const groups = new Map<string, ScheduleItem[]>();

  schedules.forEach((schedule) => {
    // Split courses share a course and section but sit in different rows; the
    // form lists the subject once, so they belong in the same group.
    const key = `${schedule.courseId || schedule.subjectId || schedule.courseCode}|${schedule.sectionId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(schedule);
    else groups.set(key, [schedule]);
  });

  const lines = [...groups.values()].map((meetings) => {
    const sorted = [...meetings].sort((a, b) =>
      a.dayIndex !== b.dayIndex ? a.dayIndex - b.dayIndex : a.startSlot - b.startSlot,
    );
    const first = sorted[0];

    const days = [...new Set(sorted.map((m) => (m.day ?? "").toLowerCase()))]
      .sort((a, b) => DAY_SEQUENCE.indexOf(a) - DAY_SEQUENCE.indexOf(b))
      .map((day) => DAY_CODES[day] ?? (day ? day.slice(0, 2) : ""))
      .filter(Boolean)
      .join("");

    // Most classes keep one time across every meeting day. A split day -- MTh,
    // TTh, TF -- can keep a different one on each, so every distinct range is
    // its own line rather than one run-on cell. Meetings are already in day
    // order, so the lines read in the order the Day column lists its codes.
    const times = [...new Set(sorted.map((m) => formatTimeRange(m.startTime, m.endTime)))];

    return {
      line: {
        code: first.courseCode || first.subjectCode || "",
        title: first.courseName || first.subjectName || "",
        day: days,
        times,
        section: first.sectionName,
        lectureUnits: first.lectureUnits ?? 0,
        laboratoryUnits: first.laboratoryUnits ?? 0,
        totalUnits: first.totalUnits ?? (first.lectureUnits ?? 0) + (first.laboratoryUnits ?? 0),
        totalHours: sorted.reduce((sum, meeting) => sum + hoursOf(meeting), 0),
        overridden: sorted.some((meeting) => Boolean(meeting.facultyConflictOverride)),
      },
      dayIndex: first.dayIndex,
      startSlot: first.startSlot,
    };
  });

  return lines
    .sort((a, b) => (a.dayIndex !== b.dayIndex ? a.dayIndex - b.dayIndex : a.startSlot - b.startSlot))
    .map((entry) => entry.line);
};

export interface LoadTotals {
  units: number;
  hours: number;
}

export interface ClassifiedLoad {
  basic: LoadLine[];
  overload: LoadLine[];
  basicTotals: LoadTotals;
  overloadTotals: LoadTotals;
  grandTotals: LoadTotals;
}

const sumOf = (lines: LoadLine[]): LoadTotals => ({
  units: lines.reduce((sum, line) => sum + line.totalUnits, 0),
  hours: lines.reduce((sum, line) => sum + line.totalHours, 0),
});

/**
 * Basic Load as the server computes it -- max units less any administrative
 * deload. Falls back to the raw figures when the payload predates
 * `requiredUnits`, and to 21 units when a profile carries no ceiling at all.
 * A Basic Load of 0 is real (an overload-only instructor), not "missing".
 */
const basicLoadCeiling = (faculty: Faculty): number => {
  if (typeof faculty.requiredUnits === "number") return Math.max(0, faculty.requiredUnits);
  return Math.max(0, (faculty.maxUnits ?? 21) - (faculty.deloadUnits ?? 0));
};

/**
 * Fills the tables in the order the load bands stack, the same order the
 * scheduler enforces and the Faculty page shows: Basic Load first, then the
 * overload allowance, then pro bono.
 *
 * - A subject goes in the Basic table while it still fits the Basic Load.
 * - Past that it goes in the Overload table, as overload while it fits the
 *   overload allowance, and as pro bono once that is used up.
 *
 * A subject that will not fit a band is skipped rather than ending the fill, so
 * a later 1-unit subject can still take the room left. An instructor with a
 * Basic Load of 0 (overload only) therefore lists everything under Overload,
 * which is what "B. Overload/Part Time Load" is for.
 */
export const classifyLoad = (faculty: Faculty, schedules: ScheduleItem[]): ClassifiedLoad => {
  const lines = buildLoadLines(schedules);
  const basic: LoadLine[] = [];
  const overload: LoadLine[] = [];

  const basicCeiling = basicLoadCeiling(faculty);
  const overloadAllowance = Math.max(0, faculty.overloadUnits ?? 0);
  let basicAssigned = 0;
  let overloadAssigned = 0;

  lines.forEach((line) => {
    if (basicAssigned + line.totalUnits <= basicCeiling) {
      basicAssigned += line.totalUnits;
      basic.push({ ...line, band: "basic" });
    } else if (overloadAssigned + line.totalUnits <= overloadAllowance) {
      overloadAssigned += line.totalUnits;
      overload.push({ ...line, band: "overload" });
    } else {
      overload.push({ ...line, band: "probono" });
    }
  });

  const basicTotals = sumOf(basic);
  const overloadTotals = sumOf(overload);

  return {
    basic,
    overload,
    basicTotals,
    overloadTotals,
    grandTotals: {
      units: basicTotals.units + overloadTotals.units,
      hours: basicTotals.hours + overloadTotals.hours,
    },
  };
};

/** Trims a trailing ".0" so whole units print as "3" and half-hours as "4.5". */
export const formatQuantity = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);
