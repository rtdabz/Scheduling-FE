const DEFAULT_GRID = {
  openingMinutes: 7 * 60,
  closingMinutes: 20 * 60 + 30,
  slotMinutes: 30,
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

export const resetTimeGrid = (): void => {
  gridConfig = { ...DEFAULT_GRID };
};

export const gridOpeningMinutes = (): number => gridConfig.openingMinutes;

export const slotMinutes = (): number => gridConfig.slotMinutes;

export const slotCount = (): number =>
  Math.max(0, Math.floor((gridConfig.closingMinutes - gridConfig.openingMinutes) / gridConfig.slotMinutes));

export const closingTimeLabel = (): string => slotToTime24h(slotCount());

export const fieldEndMinutes = (): number =>
  Math.min(Math.max(gridConfig.fieldEndMinutes, gridConfig.openingMinutes), gridConfig.closingMinutes);

export const FULL_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DAY_NAME_TO_INDEX: Record<string, number> = {
  "Monday": 0, "Mon": 0,
  "Tuesday": 1, "Tue": 1,
  "Wednesday": 2, "Wed": 2,
  "Thursday": 3, "Thu": 3,
  "Friday": 4, "Fri": 4,
  "Saturday": 5, "Sat": 5,
  "Sunday": 6, "Sun": 6,
};

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

export const timeToSlot = (time: string): number => {
  const totalMinutes = parseTimeToMinutes(time);
  if (Number.isNaN(totalMinutes)) return 0;

  return Math.max(0, Math.round((totalMinutes - gridConfig.openingMinutes) / gridConfig.slotMinutes));
};

export const timeToSlotUnclamped = (time: string): number => {
  const totalMinutes = parseTimeToMinutes(time);
  if (Number.isNaN(totalMinutes)) return 0;

  return Math.round((totalMinutes - gridConfig.openingMinutes) / gridConfig.slotMinutes);
};

export const slotToTime24h = (slot: number): string => {
  const totalMinutes = gridConfig.openingMinutes + slot * gridConfig.slotMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

export const slotToTimeLabel = (slot: number): string => {
  const totalMinutes = gridConfig.openingMinutes + slot * gridConfig.slotMinutes;
  const minutes = totalMinutes % 60;
  const rawHours = Math.floor(totalMinutes / 60);
  const suffix = rawHours >= 12 ? "PM" : "AM";
  const hours = rawHours % 12 === 0 ? 12 : rawHours % 12;

  return minutes === 0 ? `${hours} ${suffix}` : `${hours}:${minutes.toString().padStart(2, "0")} ${suffix}`;
};

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

export const FIXED_SPLIT_PATTERNS = {
  MW: { days: [0, 2], label: "Monday–Wednesday" },
  TTh: { days: [1, 3], label: "Tuesday–Thursday" },
  FS: { days: [4, 5], label: "Friday–Saturday" },
} as const satisfies Record<string, { days: readonly [number, number]; label: string }>;

export type FixedSplitPattern = keyof typeof FIXED_SPLIT_PATTERNS;

export const isFixedSplitPattern = (preferredPattern?: string | null): preferredPattern is FixedSplitPattern =>
  !!preferredPattern && Object.prototype.hasOwnProperty.call(FIXED_SPLIT_PATTERNS, preferredPattern);

export const fixedSplitPatternForDays = (day1Index: number, day2Index: number): FixedSplitPattern | null => {
  const [low, high] = day1Index < day2Index ? [day1Index, day2Index] : [day2Index, day1Index];
  const match = Object.entries(FIXED_SPLIT_PATTERNS).find(([, { days }]) => days[0] === low && days[1] === high);
  return match ? (match[0] as FixedSplitPattern) : null;
};

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

export const consecutiveDayCount = (preferredPattern?: string | null): number | null => {
  const match = (preferredPattern ?? "").match(/^consecutive:([2-7])$/);
  return match ? Number(match[1]) : null;
};

export const buildPreferredPattern = (day1Index: number, day2Index: number): string =>
  `days:${day1Index}-${day2Index}`;
