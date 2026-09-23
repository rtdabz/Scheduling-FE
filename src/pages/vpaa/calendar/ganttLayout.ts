/**
 * Pure layout arithmetic for the Master Calendar's Gantt view.
 *
 * Kept free of React so the rules that decide where a block sits, which lane it
 * takes and what counts as an overlap can be tested without rendering the page.
 * Everything here works in minutes from midnight rather than grid slots: a
 * timeline positions a 7:15 class at 7:15, where the slot helpers in timeGrid
 * would round it onto the nearest half hour.
 */

export interface CalendarDepartment {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

export interface CalendarSchedule {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
  meeting_type?: string | null;
  mode?: 'on-site' | 'online' | 'field' | string | null;
  course_id?: number | null;
  department_id?: number | null;
  department?: CalendarDepartment | null;
  room_id?: number | null;
  room?: { id: number; room_code: string; building?: string | null } | null;
  faculty_id?: number | null;
  faculty?: { id: number; first_name: string; last_name: string } | null;
  section_id?: number | null;
  section?: { id: number; section_name: string; department_id?: number | null } | null;
  course?: { course_code?: string; course_name?: string; units?: number } | null;
  subject?: { subject_code?: string; subject_name?: string; units?: number } | null;
}

/** Row order of the chart. Matches SchedulingPolicy::PERSISTABLE_DAYS. */
export const CALENDAR_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * Row index for a stored day, or -1 when it is not a weekday name.
 *
 * `schedules.day` holds one full day name per meeting, but older rows and some
 * imports use the three-letter form, so match on the prefix.
 */
export const dayIndexOf = (day: string | null | undefined): number => {
  const prefix = (day ?? '').trim().toLowerCase().slice(0, 3);
  if (prefix.length < 3) return -1;
  return CALENDAR_DAYS.findIndex((name) => name.toLowerCase().startsWith(prefix));
};

/** Monday-first index of a Date, matching CALENDAR_DAYS. */
export const dateDayIndex = (date: Date): number => (date.getDay() + 6) % 7;

/** Minutes from midnight for "HH:MM" or "HH:MM:SS"; null when unparseable. */
export const toMinutes = (time: string | null | undefined): number | null => {
  const [hours, minutes] = (time ?? '').split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

/** "7 AM", "1:30 PM" for an axis tick. */
export const minutesToLabel = (total: number): string => {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours >= 12 && hours < 24 ? 'PM' : 'AM';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

export type SessionType = 'lecture' | 'laboratory';

/** A meeting without a type is a lecture: the column is nullable and lecture is the default. */
export const sessionTypeOf = (schedule: Pick<CalendarSchedule, 'meeting_type'>): SessionType =>
  (schedule.meeting_type ?? '').toLowerCase() === 'laboratory' ? 'laboratory' : 'lecture';

export const courseCodeOf = (schedule: CalendarSchedule): string =>
  schedule.course?.course_code || schedule.subject?.subject_code || 'Class';

export const courseNameOf = (schedule: CalendarSchedule): string =>
  schedule.course?.course_name || schedule.subject?.subject_name || '';

export const instructorNameOf = (schedule: CalendarSchedule): string =>
  schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}`.trim() : '';

export const departmentIdOf = (schedule: CalendarSchedule): number | null =>
  schedule.department_id ?? schedule.department?.id ?? schedule.section?.department_id ?? null;

/** Resolve logos once from the department directory, not from repeated API relations. */
export const withCalendarDepartments = <T extends CalendarSchedule>(schedules: readonly T[], departments: readonly CalendarDepartment[]): T[] => {
  const byId = new Map(departments.map(department => [department.id, department]));
  return schedules.map(schedule => {
    const department = byId.get(departmentIdOf(schedule) ?? -1);
    return department ? { ...schedule, department } : schedule;
  });
};

export interface TimeWindow {
  /** First minute drawn on the axis. */
  start: number;
  /** Last minute drawn on the axis. */
  end: number;
}

export interface StandardHours {
  opening: number;
  closing: number;
  slotMinutes: number;
}

/** Server defaults (schedule_settings), used until GET /timeslots answers. */
export const DEFAULT_STANDARD_HOURS: StandardHours = { opening: 7 * 60, closing: 20 * 60 + 30, slotMinutes: 30 };

/** Shared normalization for /timeslots and /initial-data time-grid settings. */
export const buildStandardHours = (openingTime?: string | null, closingTime?: string | null, slotInterval?: number | null): StandardHours => {
  const opening = toMinutes(openingTime);
  const closing = toMinutes(closingTime);
  const slot = Number(slotInterval);
  return {
    opening: opening ?? DEFAULT_STANDARD_HOURS.opening,
    closing: closing !== null && (opening === null || closing > opening) ? closing : DEFAULT_STANDARD_HOURS.closing,
    slotMinutes: Number.isFinite(slot) && slot > 0 ? slot : DEFAULT_STANDARD_HOURS.slotMinutes,
  };
};

/**
 * The axis span: the configured opening-to-closing hours, stretched to cover any
 * class that starts earlier or ends later so nothing is clipped off either edge.
 * The stretched part is drawn shaded, so the standard window stays visible.
 */
export const buildTimeWindow = (hours: StandardHours, schedules: readonly CalendarSchedule[]): TimeWindow => {
  let start = hours.opening;
  let end = hours.closing;
  for (const schedule of schedules) {
    const from = toMinutes(schedule.start_time);
    const to = toMinutes(schedule.end_time);
    if (from !== null) start = Math.min(start, from);
    if (to !== null) end = Math.max(end, to);
  }
  // An extended edge snaps outward to the hour so the axis never starts on "6:50".
  if (start < hours.opening) start = Math.floor(start / 60) * 60;
  if (end > hours.closing) end = Math.ceil(end / 60) * 60;
  return { start, end: Math.max(end, start + 60) };
};

/** Axis ticks every `step` minutes, aligned to the window start. */
export const buildTicks = (window: TimeWindow, step: number): number[] => {
  const ticks: number[] = [];
  const safeStep = step > 0 ? step : 30;
  for (let minute = window.start; minute <= window.end; minute += safeStep) ticks.push(minute);
  return ticks;
};

/** Horizontal position of a minute, as a percentage of the timeline width. */
export const percentOf = (minute: number, window: TimeWindow): number =>
  ((minute - window.start) / (window.end - window.start)) * 100;

export type OverlapKind = 'room' | 'instructor' | 'section';

export interface OverlapEntry {
  otherId: number;
  kinds: OverlapKind[];
}

/**
 * Meetings that share a day, an interval, and a room, instructor or section.
 *
 * These are reported as overlaps, not conflicts: an instructor clash can be a
 * deliberate override, and a combined class legitimately shares a room. The
 * calendar surfaces them for monitoring and leaves the verdict to the reader.
 * Online and field meetings do not occupy their room, so they never overlap on it.
 */
export const findOverlaps = (schedules: readonly CalendarSchedule[]): Map<number, OverlapEntry[]> => {
  const result = new Map<number, OverlapEntry[]>();
  const byDay = new Map<number, { schedule: CalendarSchedule; start: number; end: number }[]>();

  for (const schedule of schedules) {
    const day = dayIndexOf(schedule.day);
    const start = toMinutes(schedule.start_time);
    const end = toMinutes(schedule.end_time);
    if (day < 0 || start === null || end === null || end <= start) continue;
    const list = byDay.get(day) ?? [];
    list.push({ schedule, start, end });
    byDay.set(day, list);
  }

  const occupiesRoom = (schedule: CalendarSchedule) =>
    schedule.room_id != null && (schedule.mode ?? 'on-site').toLowerCase() === 'on-site';

  const record = (id: number, entry: OverlapEntry) => {
    const list = result.get(id) ?? [];
    list.push(entry);
    result.set(id, list);
  };

  for (const meetings of byDay.values()) {
    meetings.sort((a, b) => a.start - b.start);
    for (let i = 0; i < meetings.length; i++) {
      const a = meetings[i];
      // Sorted by start, so once a later meeting starts after `a` ends none overlap.
      for (let j = i + 1; j < meetings.length && meetings[j].start < a.end; j++) {
        const b = meetings[j];
        const kinds: OverlapKind[] = [];
        if (occupiesRoom(a.schedule) && occupiesRoom(b.schedule) && a.schedule.room_id === b.schedule.room_id) kinds.push('room');
        if (a.schedule.faculty_id != null && a.schedule.faculty_id === b.schedule.faculty_id) kinds.push('instructor');
        if (a.schedule.section_id != null && a.schedule.section_id === b.schedule.section_id) kinds.push('section');
        if (!kinds.length) continue;
        record(a.schedule.id, { otherId: b.schedule.id, kinds });
        record(b.schedule.id, { otherId: a.schedule.id, kinds });
      }
    }
  }

  return result;
};

export type GroupBy = 'none' | 'room' | 'instructor' | 'section' | 'department';

export interface GanttBlock {
  schedule: CalendarSchedule;
  start: number;
  end: number;
  lane: number;
}

export interface GanttRow {
  key: string;
  label: string;
  /** Groups with no real value ("No instructor") sort after named ones. */
  isPlaceholder: boolean;
  laneCount: number;
  blocks: GanttBlock[];
}

export interface GanttDay {
  dayIndex: number;
  name: string;
  count: number;
  rows: GanttRow[];
}

/**
 * Greedy interval packing: each meeting takes the first lane that is free by its
 * start. Sorted by start (longest first on ties), this uses the fewest lanes the
 * busiest moment allows, so a row is exactly as tall as its peak concurrency.
 */
export const packLanes = <T extends { schedule: { id: number }; start: number; end: number }>(
  items: readonly T[],
): { blocks: (T & { lane: number })[]; laneCount: number } => {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.schedule.id - b.schedule.id);
  const laneEnds: number[] = [];
  const blocks = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return { ...item, lane };
  });
  return { blocks, laneCount: Math.max(1, laneEnds.length) };
};

const groupKeyOf = (schedule: CalendarSchedule, groupBy: GroupBy): { key: string; label: string; isPlaceholder: boolean } => {
  switch (groupBy) {
    case 'room': {
      const mode = (schedule.mode ?? 'on-site').toLowerCase();
      if (mode === 'online') return { key: 'mode:online', label: 'Online', isPlaceholder: true };
      if (mode === 'field') return { key: 'mode:field', label: 'Field', isPlaceholder: true };
      return schedule.room_id != null
        ? { key: `room:${schedule.room_id}`, label: schedule.room?.room_code ?? `Room #${schedule.room_id}`, isPlaceholder: false }
        : { key: 'room:none', label: 'Room TBA', isPlaceholder: true };
    }
    case 'instructor':
      return schedule.faculty_id != null
        ? {
            key: `faculty:${schedule.faculty_id}`,
            // Surname first, so the rows read like a faculty roster.
            label: schedule.faculty ? `${schedule.faculty.last_name}, ${schedule.faculty.first_name}` : `Instructor #${schedule.faculty_id}`,
            isPlaceholder: false,
          }
        : { key: 'faculty:none', label: 'Unassigned', isPlaceholder: true };
    case 'section':
      return schedule.section_id != null
        ? { key: `section:${schedule.section_id}`, label: schedule.section?.section_name ?? `Section #${schedule.section_id}`, isPlaceholder: false }
        : { key: 'section:none', label: 'No section', isPlaceholder: true };
    case 'department': {
      const id = departmentIdOf(schedule);
      return id != null
        ? { key: `department:${id}`, label: schedule.department?.department_code ?? `Department #${id}`, isPlaceholder: false }
        : { key: 'department:none', label: 'No department', isPlaceholder: true };
    }
    default:
      return { key: 'all', label: '', isPlaceholder: false };
  }
};

/**
 * Day groups for the chart, one per visible day, each split into rows by
 * `groupBy` and packed into lanes. Meetings with an unreadable day or time are
 * skipped rather than drawn at the axis origin.
 */
export const buildGanttDays = (
  schedules: readonly CalendarSchedule[],
  groupBy: GroupBy,
  visibleDays: readonly number[],
): GanttDay[] => {
  const perDay = new Map<number, Map<string, { label: string; isPlaceholder: boolean; items: Omit<GanttBlock, 'lane'>[] }>>();

  for (const schedule of schedules) {
    const dayIndex = dayIndexOf(schedule.day);
    const start = toMinutes(schedule.start_time);
    const end = toMinutes(schedule.end_time);
    if (dayIndex < 0 || start === null || end === null || end <= start) continue;

    const groups = perDay.get(dayIndex) ?? new Map();
    perDay.set(dayIndex, groups);
    const { key, label, isPlaceholder } = groupKeyOf(schedule, groupBy);
    const group = groups.get(key) ?? { label, isPlaceholder, items: [] };
    groups.set(key, group);
    group.items.push({ schedule, start, end });
  }

  return [...visibleDays].sort((a, b) => a - b).map((dayIndex) => {
    const groups = perDay.get(dayIndex) ?? new Map();
    const rows: GanttRow[] = [...groups.entries()]
      .map(([key, group]) => ({ key, label: group.label, isPlaceholder: group.isPlaceholder, ...packLanes<Omit<GanttBlock, 'lane'>>(group.items) }))
      .sort((a, b) => Number(a.isPlaceholder) - Number(b.isPlaceholder) || a.label.localeCompare(b.label, undefined, { numeric: true }));

    return {
      dayIndex,
      name: CALENDAR_DAYS[dayIndex],
      count: rows.reduce((sum, row) => sum + row.blocks.length, 0),
      rows,
    };
  });
};

/**
 * The other weekly meetings of the same class: same section, course and session
 * type. `schedules.day` is one row per meeting, so an MWF lecture is three rows
 * and the detail view lists its siblings rather than pretending it meets once.
 */
export const siblingMeetingsOf = (target: CalendarSchedule, schedules: readonly CalendarSchedule[]): CalendarSchedule[] => {
  const courseKey = (s: CalendarSchedule) => s.course_id ?? courseCodeOf(s);
  return schedules
    .filter((s) =>
      s.section_id === target.section_id
      && courseKey(s) === courseKey(target)
      && sessionTypeOf(s) === sessionTypeOf(target))
    .sort((a, b) => dayIndexOf(a.day) - dayIndexOf(b.day) || (toMinutes(a.start_time) ?? 0) - (toMinutes(b.start_time) ?? 0));
};
