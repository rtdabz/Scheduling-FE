/**
 * Idempotency keys for writes, so a save resent after a slow connection gave
 * up is never applied twice.
 *
 * Every write gets a key. If the server answers (success or failure) the key
 * is forgotten, so a deliberate repeat later is a new request. If the request
 * ends with no answer at all — a timeout or a dropped connection — the key is
 * kept, and pressing Save again with the identical payload resends it. The
 * backend (App\Http\Middleware\IdempotentRequests) then replays the first
 * outcome if it did go through, or runs the write if it never arrived.
 */

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Kept below the backend's 10-minute replay window. */
const UNRESOLVED_TTL_MS = 5 * 60 * 1000;

/** Auth handshakes are not user edits and must never be replayed. */
const EXCLUDED_URLS = new Set([
  '/login',
  '/logout',
  '/forgot-password',
  '/reset-password',
  '/auth/google/exchange',
  '/broadcasting/auth',
]);

interface PendingKey {
  key: string;
  createdAt: number;
}

const keysByRequest = new Map<string, PendingKey>();

const newKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // randomUUID needs a secure context; a LAN address over plain HTTP has only
  // getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

interface WriteRequest {
  method?: string;
  url?: string;
  params?: unknown;
  data?: unknown;
}

/**
 * Identifies "the same write", or null when this request should not carry a
 * key: reads, auth endpoints, and bodies that cannot be compared (uploads).
 */
export const writeFingerprint = ({ method, url, params, data }: WriteRequest): string | null => {
  const verb = (method ?? 'get').toLowerCase();
  if (verb === 'get' || verb === 'head' || verb === 'options') return null;
  if (!url || EXCLUDED_URLS.has(url)) return null;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return null;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return null;

  try {
    return `${verb} ${url} ${JSON.stringify(params ?? null)} ${typeof data === 'string' ? data : JSON.stringify(data ?? null)}`;
  } catch {
    return null;
  }
};

/** The key to send: the unanswered one for this exact write, or a fresh one. */
export const claimIdempotencyKey = (fingerprint: string, now = Date.now()): string => {
  const existing = keysByRequest.get(fingerprint);
  if (existing && now - existing.createdAt <= UNRESOLVED_TTL_MS) {
    return existing.key;
  }

  const key = newKey();
  keysByRequest.set(fingerprint, { key, createdAt: now });
  return key;
};

/** The server answered, so this write's outcome is known. */
export const settleIdempotencyKey = (fingerprint: string | null | undefined): void => {
  if (fingerprint) keysByRequest.delete(fingerprint);
};

export const clearIdempotencyKeys = (): void => {
  keysByRequest.clear();
};
