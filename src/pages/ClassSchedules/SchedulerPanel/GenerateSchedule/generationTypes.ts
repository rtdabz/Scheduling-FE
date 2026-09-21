import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";

/**
 * Puts Step 1's Preferred Days back into calendar order, dropping anything
 * that is not a day name.
 */
export const orderDays = (days: readonly string[]): string[] =>
  FULL_DAY_NAMES.filter((day) => days.includes(day));

export type DeliveryModeOption = "on-site" | "online" | "field";
