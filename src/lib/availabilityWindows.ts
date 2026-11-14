export const coveredContinuously = (
  windows: Array<[number, number]>,
  start: number,
  end: number
): boolean => {
  const sorted = [...windows].sort((left, right) => left[0] - right[0]);

  let coveredUntil = start;
  for (const [windowStart, windowEnd] of sorted) {
    if (windowStart > coveredUntil) break;
    if (windowEnd > coveredUntil) coveredUntil = windowEnd;
    if (coveredUntil >= end) return true;
  }

  return false;
};

export const AVAILABILITY_WARNING_TITLE = "Availability Warning";

const AVAILABILITY_WARNING_PREFIX = "This assignment is outside ";

export const availabilityWarningMessage = (instructorName: string): string =>
  `${AVAILABILITY_WARNING_PREFIX}${instructorName}’s available time.`;

export const isAvailabilityWarning = (message: string | null | undefined): boolean =>
  Boolean(message?.startsWith(AVAILABILITY_WARNING_PREFIX));

/** A weekly window as the API returns it (`HH:MM` or `HH:MM:SS`). */
export interface WeeklyWindow {
  /** Missing on payloads that only carry the day name (older cached copies). */
  day_index?: number | string | null;
  day?: string | null;
  start_time: string;
  end_time: string;
}

/** A meeting expressed in minutes since midnight. */
export interface MeetingMinutes {
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const minutesOfTime = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** The window's day (0 = Monday), read from day_index or, failing that, the day name. */
export const windowDayIndex = (window: WeeklyWindow): number => {
  if (window.day_index !== undefined && window.day_index !== null && window.day_index !== "") {
    const index = Number(window.day_index);
    if (Number.isInteger(index)) return index;
  }
  return window.day ? DAY_NAMES.indexOf(window.day) : -1;
};

const clock = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
};

/** True when the windows cover the whole meeting without a gap. */
export const windowsCoverMeeting = (windows: WeeklyWindow[], meeting: MeetingMinutes): boolean =>
  coveredContinuously(
    windows
      .filter((window) => windowDayIndex(window) === meeting.dayIndex)
      .map((window): [number, number] => [minutesOfTime(window.start_time), minutesOfTime(window.end_time)]),
    meeting.startMinutes,
    meeting.endMinutes
  );

/**
 * Groups consecutive days with identical hours, e.g.
 * "Mon–Fri 5:30 PM–8:30 PM · Sat 7:00 AM–8:30 PM".
 */
export const summarizeWeek = (windows: WeeklyWindow[]): string => {
  const byDay = DAY_NAMES.map((_, dayIndex) =>
    windows
      .filter((window) => windowDayIndex(window) === dayIndex)
      .map((window) => `${clock(minutesOfTime(window.start_time))}–${clock(minutesOfTime(window.end_time))}`)
      .sort()
      .join(", ")
  );

  const groups: string[] = [];
  let dayIndex = 0;
  while (dayIndex < byDay.length) {
    const hours = byDay[dayIndex];
    let last = dayIndex;
    while (last + 1 < byDay.length && byDay[last + 1] === hours) last += 1;
    if (hours) {
      const days = last === dayIndex ? SHORT_DAY_NAMES[dayIndex] : `${SHORT_DAY_NAMES[dayIndex]}–${SHORT_DAY_NAMES[last]}`;
      groups.push(`${days} ${hours}`);
    }
    dayIndex = last + 1;
  }

  return groups.join(" · ");
};

interface AvailabilityFaculty {
  /** Windows added on top of the default week. */
  availabilities?: WeeklyWindow[];
  /** The employment type's default week, from the backend. */
  standardAvailabilities?: WeeklyWindow[];
}

/**
 * True when the meeting is not fully covered by the instructor's availability:
 * the employment type's default week plus any added windows (they extend it,
 * never replace it). Mirrors InstructorAvailabilityRule on the backend.
 */
export const isOutsideAvailability = (
  faculty: AvailabilityFaculty | undefined,
  meeting: MeetingMinutes
): boolean => {
  if (!faculty) return false;
  const added = faculty.availabilities ?? [];
  const standard = faculty.standardAvailabilities;
  // Older payloads without the default week: only judge recorded windows.
  if (!standard && added.length === 0) return false;
  return !windowsCoverMeeting([...(standard ?? []), ...added], meeting);
};
