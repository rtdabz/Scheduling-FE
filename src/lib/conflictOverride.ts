export const OVERRIDE_CONFLICTS_FLAG = 'override_conflicts';

export interface ConflictOverrideQuestion {
  message: string;
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

export const conflictOverridePrompt = (question: ConflictOverrideQuestion): string =>
  [
    ...question.details.slice(0, 3),
    question.details.length > 3 ? `…and ${question.details.length - 3} more.` : '',
    'Assign this instructor anyway?',
  ].filter(Boolean).join('\n');
