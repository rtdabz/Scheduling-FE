export type TimeBlockOption = "flexible" | "morning" | "afternoon" | "evening";
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
