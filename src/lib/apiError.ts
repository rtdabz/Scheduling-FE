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

export const apiErrorMessage = (err: unknown, fallback: string): string => {
  const failure = err as {
    config?: { method?: string };
    response?: { status?: number; data?: ApiErrorBody };
  };
  const response = failure?.response;

  if (!response) {
    const method = (failure?.config?.method ?? 'get').toLowerCase();
    if (method !== 'get' && method !== 'head') {
      return 'The connection dropped before the server replied, so this change may already be saved. Refresh to check, or try again. It will not be saved twice.';
    }
    return 'Could not reach the server. Check your connection and try again.';
  }

  const data = response.data ?? {};
  const message = asText(data.message) ?? asText(data.error);
  const field = firstFieldError(data.errors);

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
