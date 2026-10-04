import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";

export const orderDays = (days: readonly string[]): string[] =>
  FULL_DAY_NAMES.filter((day) => days.includes(day));

export type DeliveryModeOption = "on-site" | "online" | "field";
