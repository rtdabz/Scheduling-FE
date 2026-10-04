export const MAX_READ_RETRIES = 2;

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

interface FailedRequest {
  code?: string;
  config?: { method?: string };
  response?: { status?: number };
}

export const isRetryableRead = (error: unknown, attempt: number): boolean => {
  if (attempt >= MAX_READ_RETRIES) return false;

  const failure = error as FailedRequest | undefined;
  const method = (failure?.config?.method ?? 'get').toLowerCase();
  if (method !== 'get' && method !== 'head') return false;

  if (failure?.code === 'ERR_CANCELED') return false;

  const status = failure?.response?.status;
  if (status === undefined) return true;
  return TRANSIENT_STATUSES.has(status);
};

export const readRetryDelayMs = (attempt: number, random: () => number = Math.random): number => {
  const base = attempt === 0 ? 1000 : 3000;
  return Math.round(base * (0.75 + random() * 0.5));
};
