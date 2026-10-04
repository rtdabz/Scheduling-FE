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
