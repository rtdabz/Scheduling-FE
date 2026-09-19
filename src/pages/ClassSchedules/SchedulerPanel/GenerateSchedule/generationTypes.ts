import {
  FULL_DAY_NAMES,
  fieldEndMinutes,
  formatTime12h,
  gridOpeningMinutes,
  slotCount,
  slotMinutes,
} from "../../../../lib/timeGrid";

export type TimeBlockOption = "flexible" | "morning" | "afternoon" | "evening";
export type PeriodOption = Exclude<TimeBlockOption, "flexible">;

/** Wall-clock ranges; mirrors `SchedulingPolicy::PREFERRED_PERIOD_WINDOWS`. */
export const PERIOD_RANGES: Record<Exclude<TimeBlockOption, "flexible">, string> = {
  morning: "7:00 AM - 11:30 AM",
  afternoon: "11:30 AM - 4:00 PM",
  evening: "4:00 PM - 8:30 PM",
};

/** e.g. "Morning (7:00 AM - 11:30 AM)"; mirrors `SchedulingPolicy::preferredPeriodLabel`. */
export const PERIOD_LABELS: Record<TimeBlockOption, string> = {
  flexible: "Any time",
  morning: `Morning (${PERIOD_RANGES.morning})`,
  afternoon: `Afternoon (${PERIOD_RANGES.afternoon})`,
  evening: `Evening (${PERIOD_RANGES.evening})`,
};

/** The periods a course's Preferred Meeting can be set to in Configure. */
export const PERIOD_OPTIONS: PeriodOption[] = ["morning", "afternoon", "evening"];

/** The same windows in minutes from midnight, for comparing against the field end. */
const PERIOD_WINDOW_MINUTES: Record<PeriodOption, [number, number]> = {
  morning: [7 * 60, 11 * 60 + 30],
  afternoon: [11 * 60 + 30, 16 * 60],
  evening: [16 * 60, 20 * 60 + 30],
};

export const PERIOD_NAMES: Record<PeriodOption, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/**
 * The period runs past the VPAA's field end time (default 5:00 PM), so a
 * field course held to it has little or no room to start.
 */
export const periodRunsPastFieldEnd = (
  period: TimeBlockOption | null | undefined,
): period is PeriodOption =>
  !!period && period !== "flexible" && PERIOD_WINDOW_MINUTES[period][1] > fieldEndMinutes();

/** The periods a field course can be moved to in Configure: those ending by the field end. */
export const fieldPeriodOptions = (): PeriodOption[] =>
  (Object.keys(PERIOD_WINDOW_MINUTES) as PeriodOption[]).filter(
    (period) => !periodRunsPastFieldEnd(period),
  );

const minutesLabel = (minutes: number): string =>
  formatTime12h(`${Math.floor(minutes / 60)}:${minutes % 60}`);

/** e.g. "5:00 PM". */
export const fieldEndLabel = (): string => minutesLabel(fieldEndMinutes());

/**
 * The latest a course may end: the field end time for a field course,
 * otherwise the institution's closing time.
 */
export const latestEndMinutes = (isField: boolean): number =>
  isField ? fieldEndMinutes() : gridOpeningMinutes() + slotCount() * slotMinutes();

/** e.g. "5:00 PM" for a field course, "8:30 PM" otherwise. */
export const latestEndLabel = (isField: boolean): string => minutesLabel(latestEndMinutes(isField));

/**
 * The course can use the whole period: its latest end time reaches the
 * period's end (8:30 PM for the Evening). Configure disables the rest.
 */
export const periodReachable = (period: PeriodOption, isField: boolean): boolean =>
  PERIOD_WINDOW_MINUTES[period][1] <= latestEndMinutes(isField);

/** The warning shown wherever a field course sits in a period that runs past the field end. */
export const fieldPeriodWarning = (): string => {
  const options = fieldPeriodOptions().map((period) => PERIOD_NAMES[period]);
  const remedy =
    options.length > 0
      ? `You can change this course’s preference to ${options.join(" or ")} in Configure.`
      : "Set the section back to Any time on the Preferred Meetings board.";
  return `Warning: Field Courses cannot be scheduled beyond ${fieldEndLabel()}. ${remedy}`;
};

/**
 * Puts Step 1's Preferred Days back into calendar order, dropping anything
 * that is not a day name.
 */
export const orderDays = (days: readonly string[]): string[] =>
  FULL_DAY_NAMES.filter((day) => days.includes(day));
export type DeliveryModeOption = "on-site" | "online" | "field";

export type SchedulingPreference =
  | "automatic"
  | "morning"
  | "afternoon"
  | "evening"
  | "flexible";

/**
 * The bands the generator can actually act on. "automatic" and "flexible" both
 * mean "no preference" and are left out of the request, so the solver applies
 * no time-band penalty for those courses.
 */
export const REQUESTABLE_TIME_PREFERENCES = [
  "morning",
  "afternoon",
  "evening",
] as const;

export type RequestableTimePreference =
  (typeof REQUESTABLE_TIME_PREFERENCES)[number];

export const isRequestableTimePreference = (
  value: string,
): value is RequestableTimePreference =>
  (REQUESTABLE_TIME_PREFERENCES as readonly string[]).includes(value);
