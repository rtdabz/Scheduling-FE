export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

const UNRESOLVED_TTL_MS = 5 * 60 * 1000;

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

export const claimIdempotencyKey = (fingerprint: string, now = Date.now()): string => {
  const existing = keysByRequest.get(fingerprint);
  if (existing && now - existing.createdAt <= UNRESOLVED_TTL_MS) {
    return existing.key;
  }

  const key = newKey();
  keysByRequest.set(fingerprint, { key, createdAt: now });
  return key;
};

export const settleIdempotencyKey = (fingerprint: string | null | undefined): void => {
  if (fingerprint) keysByRequest.delete(fingerprint);
};

export const clearIdempotencyKeys = (): void => {
  keysByRequest.clear();
};
