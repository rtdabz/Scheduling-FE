/**
 * Whether [start, end) is covered by the windows with no gap. Units are the
 * caller's (minutes or grid slots). Back-to-back windows (08:00-10:00,
 * 10:00-12:00) count as one, so a 09:00-11:00 class inside them fits.
 *
 * Mirrors InstructorAvailabilityRule::coveredContinuously on the server.
 */
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
