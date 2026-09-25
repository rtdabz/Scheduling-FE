/**
 * The single source of truth for timetable grid arithmetic.
 *
 * These conversions were previously copy-pasted across useScheduler,
 * useConflict, DropModal, GenerateScheduleModal and several role dashboards —
 * and the copies had drifted into *three different rounding rules* for the same
 * conversion (floor-clamped, round-unclamped, and hour/minute arithmetic). For
 * times on a 30-minute boundary they agree; for anything else they did not.
 *
 * The server treats opening and closing time as configurable
 * (`schedule_settings`, PATCH /timeslots/settings). The initial-data mapper
 * applies those values at runtime; these constants are the startup fallback.
 */

/**
 * The grid window, configurable at runtime.
 *
 * `schedule_settings` stores opening time, closing time and slot interval, and
 * `PATCH /timeslots/settings` changes them — but the client used to hardcode
 * 07:00–20:30 in about forty places, so widening the window silently
 * desynchronised the builder: a 06:00 class clamped onto the 07:00 row, and
 * anything after the old 19:00 cutoff was conflict-checked against the wrong
 * slot (finding #33).
 *
 * Defaults match the server defaults, so behaviour is unchanged until
 * `/initial-data` reports something else.
 */
const DEFAULT_GRID = {
  openingMinutes: 7 * 60,
  closingMinutes: 20 * 60 + 30,
  slotMinutes: 30,
  /** schedule_settings.field_end_time; field classes must end by it. */
  fieldEndMinutes: 17 * 60,
} as const;

let gridConfig: { openingMinutes: number; closingMinutes: number; slotMinutes: number; fieldEndMinutes: number } = { ...DEFAULT_GRID };

export interface TimeGridConfigInput {
  opening_time?: string | null;
  closing_time?: string | null;
  field_end_time?: string | null;
  slot_minutes?: number | null;
  slot_count?: number | null;
}

/** Applied once per load from the `/initial-data` payload. */
export const configureTimeGrid = (config: TimeGridConfigInput | null | undefined): void => {
  if (!config) return;

  const opening = parseClockTime(config.opening_time);
  const closing = parseClockTime(config.closing_time);
  const fieldEnd = parseClockTime(config.field_end_time);
  const slotMinutes = Number(config.slot_minutes);

  gridConfig = {
    openingMinutes: opening ?? DEFAULT_GRID.openingMinutes,
    closingMinutes: closing ?? DEFAULT_GRID.closingMinutes,
    slotMinutes: Number.isFinite(slotMinutes) && slotMinutes > 0 ? slotMinutes : DEFAULT_GRID.slotMinutes,
    fieldEndMinutes: fieldEnd ?? DEFAULT_GRID.fieldEndMinutes,
  };
};

/** Restores the defaults. Test helper. */
export const resetTimeGrid = (): void => {
  gridConfig = { ...DEFAULT_GRID };
};

/** Grid start, in minutes from midnight. */
export const gridOpeningMinutes = (): number => gridConfig.openingMinutes;

/** Minutes per grid slot. */
export const slotMinutes = (): number => gridConfig.slotMinutes;

/** Number of slots the weekly grid renders. */
export const slotCount = (): number =>
  Math.max(0, Math.floor((gridConfig.closingMinutes - gridConfig.openingMinutes) / gridConfig.slotMinutes));

/** Closing time as a 24-hour "HH:MM" label, for user-facing messages. */
export const closingTimeLabel = (): string => slotToTime24h(slotCount());

/**
 * Latest end time for a field class, in minutes from midnight. Mirrors
 * SchedulingPolicy::fieldDayEndTime, including its clamp into the grid window.
 */
export const fieldEndMinutes = (): number =>
  Math.min(Math.max(gridConfig.fieldEndMinutes, gridConfig.openingMinutes), gridConfig.closingMinutes);

/** Full weekday names, in grid column order. */
export const FULL_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Accepts both the full and the three-letter form the API may return. */
export const DAY_NAME_TO_INDEX: Record<string, number> = {
  "Monday": 0, "Mon": 0,
  "Tuesday": 1, "Tue": 1,
  "Wednesday": 2, "Wed": 2,
  "Thursday": 3, "Thu": 3,
  "Friday": 4, "Fri": 4,
  "Saturday": 5, "Sat": 5,
  "Sunday": 6, "Sun": 6,
};

/** Day index for an API day string; -1 when unrecognized. */
export const dayNameToIndex = (day: string): number =>
  DAY_NAME_TO_INDEX[day.trim()] ?? -1;

const parseClockTime = (time: string | null | undefined): number | null => {
  if (!time) return null;
  const minutes = parseTimeToMinutes(time);

  return Number.isNaN(minutes) ? null : minutes;
};

const parseTimeToMinutes = (time: string): number => {
  const parts = time.split(":");
  if (parts.length < 2) return Number.NaN;

  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.NaN;

  return hours * 60 + minutes;
};

/**
 * Slot offset for a "HH:MM" time, rounded to the nearest slot and clamped to the
 * start of the grid. Use for anything that positions or measures a class.
 */
export const timeToSlot = (time: string): number => {
  const totalMinutes = parseTimeToMinutes(time);
  if (Number.isNaN(totalMinutes)) return 0;

  return Math.max(0, Math.round((totalMinutes - gridConfig.openingMinutes) / gridConfig.slotMinutes));
};

/**
 * As timeToSlot, but allowed to go negative for times before the grid opens.
 * Availability windows need this: clamping a 06:00 window start to slot 0 would
 * silently narrow it to 07:00.
 */
export const timeToSlotUnclamped = (time: string): number => {
  const totalMinutes = parseTimeToMinutes(time);
  if (Number.isNaN(totalMinutes)) return 0;

  return Math.round((totalMinutes - gridConfig.openingMinutes) / gridConfig.slotMinutes);
};

/** 24-hour "HH:MM" for a slot offset — the format the API accepts. */
export const slotToTime24h = (slot: number): string => {
  const totalMinutes = gridConfig.openingMinutes + slot * gridConfig.slotMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

/** 12-hour display label for a slot offset, e.g. "7 AM", "1:30 PM". */
export const slotToTimeLabel = (slot: number): string => {
  const totalMinutes = gridConfig.openingMinutes + slot * gridConfig.slotMinutes;
  const minutes = totalMinutes % 60;
  const rawHours = Math.floor(totalMinutes / 60);
  const suffix = rawHours >= 12 ? "PM" : "AM";
  const hours = rawHours % 12 === 0 ? 12 : rawHours % 12;

  return minutes === 0 ? `${hours} ${suffix}` : `${hours}:${minutes.toString().padStart(2, "0")} ${suffix}`;
};

/**
 * 12-hour display label for a stored time value: "07:00:00" -> "7:00 AM".
 *
 * Schedule times arrive from MySQL TIME columns as 24-hour "HH:MM:SS" strings.
 * Rendering one straight into the UI shows a 24-hour time with a stray seconds
 * component, which is how the timetable cards ended up disagreeing with their
 * own 12-hour time axis (slotToTimeLabel).
 *
 * Unrecognized input is returned untouched rather than rendered as "NaN:00 AM".
 */
export const formatTime12h = (time: string | null | undefined): string => {
  if (!time) return "";

  const ampmMatch = time.trim().match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hours = Number(ampmMatch[1]);
    const minutes = (ampmMatch[2] ?? "00").padStart(2, "0").slice(0, 2);
    return `${hours}:${minutes} ${ampmMatch[3].toUpperCase()}`;
  }

  const [rawHours, rawMinutes] = time.split(":");
  const hours = Number(rawHours);
  if (!Number.isFinite(hours)) return time;

  const minutes = (rawMinutes ?? "00").padStart(2, "0").slice(0, 2);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hours12}:${minutes} ${suffix}`;
};

/**
 * Named Split Session patterns and their day indexes. Mirrors
 * SchedulingPolicy::FIXED_MEETING_PATTERNS.
 */
export const FIXED_SPLIT_PATTERNS = {
  MW: { days: [0, 2], label: "Monday–Wednesday" },
  TTh: { days: [1, 3], label: "Tuesday–Thursday" },
  FS: { days: [4, 5], label: "Friday–Saturday" },
} as const satisfies Record<string, { days: readonly [number, number]; label: string }>;

export type FixedSplitPattern = keyof typeof FIXED_SPLIT_PATTERNS;

export const isFixedSplitPattern = (preferredPattern?: string | null): preferredPattern is FixedSplitPattern =>
  !!preferredPattern && Object.prototype.hasOwnProperty.call(FIXED_SPLIT_PATTERNS, preferredPattern);

/**
 * Day indexes a two-meeting pattern is allowed to use, or null when the pattern
 * is absent or unrecognized. Mirrors SchedulingPolicy::allowedDaysForPattern.
 */
export const parsePreferredPattern = (preferredPattern?: string | null): [number, number] | null => {
  if (!preferredPattern) return null;
  if (isFixedSplitPattern(preferredPattern)) {
    const [first, second] = FIXED_SPLIT_PATTERNS[preferredPattern].days;
    return [first, second];
  }

  const customMatch = preferredPattern.match(/^days:([0-6])-([0-6])$/);
  if (!customMatch) return null;

  return [Number(customMatch[1]), Number(customMatch[2])];
};

/**
 * The N of a Consecutive Days meeting's `consecutive:N` pattern, or null. A
 * run may start on any day, so it narrows no day the way a pair does.
 */
export const consecutiveDayCount = (preferredPattern?: string | null): number | null => {
  const match = (preferredPattern ?? "").match(/^consecutive:([2-7])$/);
  return match ? Number(match[1]) : null;
};

/** Serializes a custom two-day pattern back to its API form. */
export const buildPreferredPattern = (day1Index: number, day2Index: number): string =>
  `days:${day1Index}-${day2Index}`;
