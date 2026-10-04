import { DAYS } from "../constants";
import type { DeliveryMode } from "../types";

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
  id?: string;
  faculty?: string;
};

export type SummaryPart = {
  days: string[];
  dayLabel: string;
  start: string;
  end: string;
  mode: DeliveryMode;
  room: string;
  meeting: string;
  faculty?: string;
  ids: string[];
};

export type SummaryClass = {
  key: string;
  sectionId: string;
  sectionName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  parts: SummaryPart[];
  modes: DeliveryMode[];
  meetingCount: number;
};

const MODE_ORDER: Record<string, number> = { "on-site": 0, field: 1, online: 2 };
const modeRank = (mode: string) => MODE_ORDER[mode] ?? 3;
const dayRank = (day: string) => {
  const index = DAYS.indexOf(day);
  return index === -1 ? DAYS.length : index;
};

const shortDay = (day: string) => (DAYS.includes(day) ? day.slice(0, 3) : day);

export const buildSummaryClasses = (meetings: SummaryMeeting[]): SummaryClass[] => {
  const byClass = new Map<string, SummaryMeeting[]>();
  for (const meeting of meetings) {
    const key = `${meeting.sectionId}|${meeting.courseId}`;
    byClass.set(key, [...(byClass.get(key) ?? []), meeting]);
  }

  const classes = Array.from(byClass.entries()).map(([key, classMeetings]): SummaryClass => {
    const byPart = new Map<string, SummaryMeeting[]>();
    for (const meeting of classMeetings) {
      const partKey = [meeting.start, meeting.end, meeting.mode, meeting.room, meeting.meeting, meeting.faculty ?? ""].join("|");
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
          faculty: first.faculty,
          ids: partMeetings.flatMap((m) => (m.id ? [m.id] : [])),
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

  const firstMeeting = (item: SummaryClass) =>
    Math.min(...item.parts.flatMap((part) => part.days.map((day) => dayRank(day) * 10000 + Number(part.start.replace(":", "")))));

  return classes.sort(
    (a, b) =>
      a.sectionName.localeCompare(b.sectionName) ||
      firstMeeting(a) - firstMeeting(b) ||
      a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true }),
  );
};

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
