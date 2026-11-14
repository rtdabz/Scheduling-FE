import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";
import { orderDays } from "./generationTypes";

/*
 * The Preferred Days picker works by exclusion: every open day is in by
 * default and the user clicks only the days to leave out. The stored value
 * stays an inclusion list (what the backend's `allowed_days` expects), with
 * `[]` meaning "no day limit". These helpers translate between the two.
 */

/** Days a class may be placed on at all. Sunday only while Sunday classes are not off. */
export const availableDays = (sundayClassesEnabled: boolean | null): string[] =>
  FULL_DAY_NAMES.filter(
    (day) => day !== "Sunday" || sundayClassesEnabled !== false,
  );

/** The open days that are currently in, given the stored inclusion list. */
export const includedDays = (
  preferredDays: readonly string[],
  available: readonly string[],
): string[] =>
  preferredDays.length === 0
    ? [...available]
    : available.filter((day) => preferredDays.includes(day));

/** The open days the user has excluded. */
export const excludedDays = (
  preferredDays: readonly string[],
  available: readonly string[],
): string[] => {
  const included = includedDays(preferredDays, available);
  return available.filter((day) => !included.includes(day));
};

/**
 * Turns an included set back into the stored inclusion list: `[]` when
 * nothing is excluded, otherwise the included days in calendar order.
 */
export const normalizePreferredDays = (
  included: readonly string[],
  available: readonly string[],
): string[] => {
  const kept = orderDays(included.filter((day) => available.includes(day)));
  return kept.length === available.length ? [] : kept;
};

/**
 * Excludes `day` if it is in, restores it if it is out. The last remaining
 * day cannot be excluded, since a run needs at least one day.
 */
export const toggleExcludedDay = (
  preferredDays: readonly string[],
  day: string,
  available: readonly string[],
): string[] => {
  if (!available.includes(day)) return [...preferredDays];
  const included = includedDays(preferredDays, available);
  if (included.includes(day)) {
    if (included.length <= 1) return [...preferredDays];
    return normalizePreferredDays(
      included.filter((item) => item !== day),
      available,
    );
  }
  return normalizePreferredDays([...included, day], available);
};

/**
 * Re-fits the stored list after Sunday classes are switched. A day that just
 * became available is in by default, like every other day; a day that just
 * closed drops out.
 */
export const preferredDaysAfterSundayChange = (
  preferredDays: readonly string[],
  sundayClassesEnabled: boolean,
): string[] => {
  if (preferredDays.length === 0) return [];
  const available = availableDays(sundayClassesEnabled);
  const included = sundayClassesEnabled
    ? [...preferredDays, "Sunday"]
    : preferredDays.filter((day) => day !== "Sunday");
  return normalizePreferredDays(included, available);
};
