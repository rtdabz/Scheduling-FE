import { semesterLabel } from "../../../lib/termLabel";
import type { ScheduleItem, Term } from "./types";

/**
 * Pure formatting for the printed class schedule.
 *
 * These live outside PrintSchedule.tsx so the component file exports only a
 * component, and so the table's row building can be tested without driving
 * jsPDF.
 */

export const buildPrintTermTitle = (term: Term | null): string => term
  ? `CLASS SCHEDULE AY ${term.academic_year}    ${semesterLabel(term.semester)}`
  : "CLASS SCHEDULE";

export const getFullDayName = (day: string): string => {
  if (!day) return "";
  const d = day.trim().toLowerCase();
  if (d === "mon" || d === "monday") return "Monday";
  if (d === "tue" || d === "tuesday") return "Tuesday";
  if (d === "wed" || d === "wednesday") return "Wednesday";
  if (d === "thu" || d === "thursday") return "Thursday";
  if (d === "fri" || d === "friday") return "Friday";
  if (d === "sat" || d === "saturday") return "Saturday";
  if (d === "sun" || d === "sunday") return "Sunday";
  return day;
};

const DAY_SHORT_CODES: Record<string, string> = {
  Monday: "M",
  Tuesday: "T",
  Wednesday: "W",
  Thursday: "Th",
  Friday: "F",
  Saturday: "S",
  Sunday: "Su",
};

export type PrintMeetingGroup = {
  /** The meeting that carries the course columns for the group. */
  first: ScheduleItem;
  days: string[];
  dayLabel: string;
  timeLabel: string;
  room: string;
};

const printRoomLabel = (item: ScheduleItem): string =>
  item.roomName
  || (item.mode === "online" ? "Online" : item.mode === "field" ? "Field" : "");

/**
 * A meeting that repeats at the same time in the same room is one line.
 *
 * `schedules.day` holds one row per meeting, so an MWF class arrives as three
 * rows identical apart from the day. Printing them verbatim repeated the time
 * and room on consecutive lines; a registrar reads those as a single entry
 * with the days combined. Anything that genuinely differs — another room, or
 * another time — keeps its own line.
 */
export const groupPrintMeetings = (
  schedules: ScheduleItem[],
  formatTime: (time: string) => string,
  fullDayName: (day: string) => string,
): PrintMeetingGroup[] => {
  const ordered = [...schedules].sort((left, right) => (
    left.dayIndex - right.dayIndex || left.startSlot - right.startSlot
  ));

  const groups = new Map<string, ScheduleItem[]>();
  for (const item of ordered) {
    const key = `${item.startTime}|${item.endTime}|${printRoomLabel(item)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return Array.from(groups.values()).map((meetings) => {
    const days = meetings.map((meeting) => fullDayName(meeting.day));

    return {
      first: meetings[0],
      days,
      // One meeting keeps its full day name; a combined one uses the
      // shorthand, which is both the convention and what fits the column.
      dayLabel: days.length === 1
        ? days[0]
        : days.map((day) => DAY_SHORT_CODES[day] ?? day).join(""),
      timeLabel: `${formatTime(meetings[0].startTime)} – ${formatTime(meetings[0].endTime)}`,
      room: printRoomLabel(meetings[0]),
    };
  });
};
