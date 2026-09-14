/**
 * Decodes the refusal an assignment endpoint sends when the only thing wrong is
 * the instructor's own conflict: double-booked at that time, or outside a
 * part-timer's availability.
 *
 * Those can be assigned over on purpose. The server answers 422 with
 * `can_override_conflicts: true`, and the caller asks the user before re-sending
 * the same request with `override_conflicts: true`. Any other refusal -- an
 * ineligible instructor, a room or section clash -- comes back with the flag
 * false and must still be shown as an error.
 */

/** Request key the assignment endpoints read. */
export const OVERRIDE_CONFLICTS_FLAG = 'override_conflicts';

export interface ConflictOverrideQuestion {
  message: string;
  /** Each clash the server reported, in plain words. */
  details: string[];
}

export const conflictOverrideFrom = (err: unknown): ConflictOverrideQuestion | null => {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (!response || response.status !== 422) return null;

  const data = response.data as
    | { message?: unknown; can_override_conflicts?: unknown; violations?: unknown }
    | undefined;
  if (data?.can_override_conflicts !== true) return null;

  const details = Array.isArray(data.violations)
    ? [...new Set(
      data.violations
        .map((violation) => (violation as { message?: unknown })?.message)
        .filter((message): message is string => typeof message === 'string' && message.trim() !== '')
        .map((message) => message.trim()),
    )]
    : [];

  return {
    message: typeof data.message === 'string' && data.message.trim()
      ? data.message.trim()
      : 'The instructor already has a conflict at this time.',
    details,
  };
};

/** The confirmation text shown before assigning anyway. */
export const conflictOverridePrompt = (question: ConflictOverrideQuestion): string =>
  [
    ...question.details.slice(0, 3),
    question.details.length > 3 ? `…and ${question.details.length - 3} more.` : '',
    'Assign this instructor anyway?',
  ].filter(Boolean).join('\n');
