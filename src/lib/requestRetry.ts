/**
 * When the API client may quietly resend a request that failed in transit.
 *
 * Only reads are retried. A read that never got an answer, or hit a gateway
 * error while the server was briefly unreachable, is safe to ask again, and on
 * a patchy connection the second attempt usually succeeds before the user
 * notices. Writes are never resent automatically; they rely on idempotency
 * keys and the user pressing Save again (see idempotency.ts).
 */

export const MAX_READ_RETRIES = 2;

/** Gateway statuses a proxy returns while the app server is unreachable. */
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

  // Aborted on purpose: navigation away, sign-out, a superseded poll.
  if (failure?.code === 'ERR_CANCELED') return false;

  const status = failure?.response?.status;
  if (status === undefined) return true;
  return TRANSIENT_STATUSES.has(status);
};

/** About 1s, then 3s, with jitter so many tabs do not retry in lockstep. */
export const readRetryDelayMs = (attempt: number, random: () => number = Math.random): number => {
  const base = attempt === 0 ? 1000 : 3000;
  return Math.round(base * (0.75 + random() * 0.5));
};
