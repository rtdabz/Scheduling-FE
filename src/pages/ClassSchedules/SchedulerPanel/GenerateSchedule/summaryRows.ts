import { DAYS } from "../constants";
import type { DeliveryMode } from "../types";

/** One generated meeting, already resolved to display names. */
export type SummaryMeeting = {
  sectionId: string;
  sectionName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  day: string;
  start: string;
  end: string;
  mode: DeliveryMode;
  room: string;
  meeting: string;
};

/** Meetings of one class that share a time, room, mode and meeting type. */
export type SummaryPart = {
  days: string[];
  dayLabel: string;
  start: string;
  end: string;
  mode: DeliveryMode;
  room: string;
  meeting: string;
};

/** One section's course, with every meeting folded into it. */
export type SummaryClass = {
  key: string;
  sectionId: string;
  sectionName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  parts: SummaryPart[];
  /** Distinct modes, on-site first. */
  modes: DeliveryMode[];
  meetingCount: number;
};

const MODE_ORDER: Record<string, number> = { "on-site": 0, field: 1, online: 2 };
const modeRank = (mode: string) => MODE_ORDER[mode] ?? 3;
const dayRank = (day: string) => {
  const index = DAYS.indexOf(day);
  return index === -1 ? DAYS.length : index;
};

/** 'Tuesday' -> 'Tue'; unknown values pass through unchanged. */
const shortDay = (day: string) => (DAYS.includes(day) ? day.slice(0, 3) : day);

/**
 * Folds the generator's one-row-per-meeting output into one row per class.
 *
 * `schedules.day` is one row per meeting, so a Tue/Thu lecture arrives as two
 * rows that differ only by day. Those collapse into a single part. Meetings
 * that differ in time, room, mode or type (a lecture online and a lab in a
 * computer lab) stay separate parts of the same class, with in-person parts
 * listed before online ones.
 */
export const buildSummaryClasses = (meetings: SummaryMeeting[]): SummaryClass[] => {
  const byClass = new Map<string, SummaryMeeting[]>();
  for (const meeting of meetings) {
    const key = `${meeting.sectionId}|${meeting.courseId}`;
    byClass.set(key, [...(byClass.get(key) ?? []), meeting]);
  }

  const classes = Array.from(byClass.entries()).map(([key, classMeetings]): SummaryClass => {
    const byPart = new Map<string, SummaryMeeting[]>();
    for (const meeting of classMeetings) {
      const partKey = [meeting.start, meeting.end, meeting.mode, meeting.room, meeting.meeting].join("|");
      byPart.set(partKey, [...(byPart.get(partKey) ?? []), meeting]);
    }

    const parts = Array.from(byPart.values())
      .map((partMeetings): SummaryPart => {
        const days = Array.from(new Set(partMeetings.map((m) => m.day))).sort((a, b) => dayRank(a) - dayRank(b));
        const first = partMeetings[0];
        return {
          days,
          dayLabel: days.length === 1 ? days[0] : days.map(shortDay).join("/"),
          start: first.start,
          end: first.end,
          mode: first.mode,
          room: first.room,
          meeting: first.meeting,
        };
      })
      .sort(
        (a, b) =>
          modeRank(a.mode) - modeRank(b.mode) ||
          dayRank(a.days[0]) - dayRank(b.days[0]) ||
          a.start.localeCompare(b.start),
      );

    const first = classMeetings[0];
    return {
      key,
      sectionId: first.sectionId,
      sectionName: first.sectionName,
      courseId: first.courseId,
      courseCode: first.courseCode,
      courseName: first.courseName,
      parts,
      modes: Array.from(new Set(parts.map((part) => part.mode))).sort((a, b) => modeRank(a) - modeRank(b)),
      meetingCount: classMeetings.length,
    };
  });

  // Within a section, classes follow the week: whichever meets first comes first.
  const firstMeeting = (item: SummaryClass) =>
    Math.min(...item.parts.flatMap((part) => part.days.map((day) => dayRank(day) * 10000 + Number(part.start.replace(":", "")))));

  return classes.sort(
    (a, b) =>
      a.sectionName.localeCompare(b.sectionName) ||
      firstMeeting(a) - firstMeeting(b) ||
      a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true }),
  );
};

/** '19:00'-'20:30' -> '7:00 - 8:30 PM'; the suffix repeats only when it changes. */
export const timeRangeLabel = (start: string, end: string): string => {
  const parse = (value: string) => {
    const [hourText, minuteText] = value.split(":");
    const hour = Number(hourText);
    return {
      text: `${hour % 12 === 0 ? 12 : hour % 12}:${minuteText ?? "00"}`,
      suffix: hour >= 12 ? "PM" : "AM",
    };
  };
  const from = parse(start);
  const to = parse(end);
  return from.suffix === to.suffix
    ? `${from.text} - ${to.text} ${to.suffix}`
    : `${from.text} ${from.suffix} - ${to.text} ${to.suffix}`;
};
