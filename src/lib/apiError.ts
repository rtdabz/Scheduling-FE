/**
 * Turns an Axios rejection into the sentence the API actually sent.
 *
 * Every page used to `catch { toast.error('Error', 'Failed to save') }`, which
 * threw away the reason: a 422 listing the offending field, a 403 naming the
 * role restriction, a 409 explaining what still references the record. The
 * fallback stays for genuine network failures, where there is no body to read.
 */

interface ApiErrorBody {
  message?: unknown;
  error?: unknown;
  errors?: unknown;
}

const firstFieldError = (errors: unknown): string | null => {
  if (!errors || typeof errors !== 'object') return null;

  for (const value of Object.values(errors as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find(entry => typeof entry === 'string' && entry.trim());
      if (typeof first === 'string') return first.trim();
    }
  }

  return null;
};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * `fallback` is used only when the response carried nothing readable — an
 * offline browser, a proxy timeout, or a 500 with an empty body.
 */
export const apiErrorMessage = (err: unknown, fallback: string): string => {
  const response = (err as { response?: { status?: number; data?: ApiErrorBody } })?.response;

  if (!response) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  const data = response.data ?? {};
  const message = asText(data.message) ?? asText(data.error);
  const field = firstFieldError(data.errors);

  // A validation response carries a generic headline ("The given data was
  // invalid") plus the field that actually failed, so lead with the field.
  if (field && (!message || response.status === 422)) {
    return message && message !== field && response.status !== 422
      ? `${message} ${field}`
      : field;
  }

  if (message) return message;

  if (response.status === 403) return 'Your role is not permitted to make this change.';
  if (response.status === 404) return 'That record no longer exists. Refresh and try again.';

  return fallback;
};

/** Every field error, for forms that can highlight more than one input. */
export const apiFieldErrors = (err: unknown): Record<string, string> => {
  const errors = (err as { response?: { data?: ApiErrorBody } })?.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return {};

  const flattened: Record<string, string> = {};
  for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
    const text = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : null;
    if (typeof text === 'string' && text.trim()) flattened[field] = text.trim();
  }

  return flattened;
};
