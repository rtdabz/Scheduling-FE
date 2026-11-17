import type { ScheduleItem } from '../pages/ClassSchedules/SchedulerPanel/types';
import { FULL_DAY_NAMES, dayNameToIndex, slotCount, slotMinutes, slotToTimeLabel } from './timeGrid';

/** Monday to Saturday; Sunday is added only for a room that actually holds Sunday classes. */
const WEEKDAY_COUNT = 6;

export interface RoomMeeting {
  day: string;
  time: string;
  course: string;
  section: string;
  instructor: string;
  hours: number;
}

export interface RoomDayUsage {
  /** Short day name, e.g. "Mon". */
  day: string;
  scheduledHours: number;
  /** Open windows within operating hours, e.g. "7 AM – 9 AM"; empty when the day is fully booked. */
  freeWindows: string[];
}

export interface RoomUtilizationSummary {
  /** Hours the room can be booked in a week: operating hours × days covered. */
  capacityHours: number;
  scheduledHours: number;
  /** Booked share of capacity, rounded to a whole percent (same rule as the VPAA dashboard). */
  utilization: number;
  /** Hours of operating time with no class booked. */
  unusedHours: number;
  days: RoomDayUsage[];
  meetings: RoomMeeting[];
}

type RoomRef = { id: string; name: string };
type Meeting = Pick<
  ScheduleItem,
  'roomId' | 'roomName' | 'day' | 'dayIndex' | 'startSlot' | 'durationSlots' | 'courseCode' | 'subjectCode'
  | 'courseName' | 'subjectName' | 'sectionName' | 'facultyName'
>;

const roundHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

const meetingsFor = (room: RoomRef, schedules: Meeting[]) =>
  schedules.filter((s) => (s.roomId && s.roomId === room.id) || (s.roomName && s.roomName === room.name));

const dayIndexOf = (meeting: Meeting) =>
  Number.isInteger(meeting.dayIndex) ? meeting.dayIndex : dayNameToIndex(meeting.day);

/** Gaps between booked slot ranges within [0, slotCount()). */
const freeWindows = (booked: [number, number][]): string[] => {
  const end = slotCount();
  const windows: string[] = [];
  let cursor = 0;
  [...booked].sort((a, b) => a[0] - b[0]).forEach(([start, stop]) => {
    if (start > cursor) windows.push(`${slotToTimeLabel(cursor)} – ${slotToTimeLabel(Math.min(start, end))}`);
    cursor = Math.max(cursor, stop);
  });
  if (cursor < end) windows.push(`${slotToTimeLabel(cursor)} – ${slotToTimeLabel(end)}`);
  return windows;
};

/**
 * Weekly usage of one room from its approved meetings, measured against the configured
 * operating hours (the scheduler's time grid).
 */
export function summarizeRoomUtilization(room: RoomRef, schedules: Meeting[]): RoomUtilizationSummary {
  const meetings = meetingsFor(room, schedules);
  const minutesPerSlot = slotMinutes();
  const hasSunday = meetings.some((m) => dayIndexOf(m) === WEEKDAY_COUNT);
  const dayCount = hasSunday ? WEEKDAY_COUNT + 1 : WEEKDAY_COUNT;
  const openMinutes = slotCount() * minutesPerSlot;

  const days: RoomDayUsage[] = FULL_DAY_NAMES.slice(0, dayCount).map((name, index) => {
    const ranges = meetings
      .filter((m) => dayIndexOf(m) === index)
      .map((m): [number, number] => [m.startSlot, m.startSlot + m.durationSlots]);
    const bookedSlots = ranges.reduce((total, [start, stop]) => total + (stop - start), 0);
    return {
      day: name.slice(0, 3),
      scheduledHours: roundHours(bookedSlots * minutesPerSlot),
      freeWindows: freeWindows(ranges),
    };
  });

  const scheduledMinutes = meetings.reduce((total, m) => total + m.durationSlots * minutesPerSlot, 0);
  const capacityMinutes = openMinutes * dayCount;

  return {
    capacityHours: roundHours(capacityMinutes),
    scheduledHours: roundHours(scheduledMinutes),
    utilization: capacityMinutes > 0 ? Math.round((scheduledMinutes / capacityMinutes) * 100) : 0,
    unusedHours: roundHours(Math.max(0, capacityMinutes - scheduledMinutes)),
    days,
    meetings: [...meetings]
      .sort((a, b) => dayIndexOf(a) - dayIndexOf(b) || a.startSlot - b.startSlot)
      .map((m) => ({
        day: (FULL_DAY_NAMES[dayIndexOf(m)] ?? m.day).slice(0, 3),
        time: `${slotToTimeLabel(m.startSlot)} – ${slotToTimeLabel(m.startSlot + m.durationSlots)}`,
        course: [m.courseCode || m.subjectCode, m.courseName || m.subjectName].filter(Boolean).join(' · '),
        section: m.sectionName || '—',
        instructor: m.facultyName || 'TBA',
        hours: roundHours(m.durationSlots * minutesPerSlot),
      })),
  };
}

/** "Mon–Sat, 7 AM – 8:30 PM": the weekly window utilization is measured against. */
export const operatingWindowLabel = (includeSunday = false): string =>
  `Mon–${includeSunday ? 'Sun' : 'Sat'}, ${slotToTimeLabel(0)} – ${slotToTimeLabel(slotCount())}`;
