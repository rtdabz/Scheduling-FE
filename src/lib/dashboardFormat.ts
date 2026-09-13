/**
 * Small formatting helpers shared by the dashboard components.
 *
 * They live outside the component files so those stay single-export and keep
 * working with fast refresh.
 */

/** Thousands separators, so institution-wide counts stay readable. */
export const grouped = (value: number) => value.toLocaleString();

/** "schedule_approved_by_vpaa" -> "Schedule approved by vpaa". */
export const humaniseEvent = (event: string) => {
  const words = event.replace(/[_.]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Activity';
};
