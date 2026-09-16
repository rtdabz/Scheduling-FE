import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimIdempotencyKey,
  clearIdempotencyKeys,
  settleIdempotencyKey,
  writeFingerprint,
} from './idempotency';

describe('writeFingerprint', () => {
  it('ignores reads and auth handshakes', () => {
    expect(writeFingerprint({ method: 'get', url: '/schedules' })).toBeNull();
    expect(writeFingerprint({ method: 'post', url: '/login', data: { a: 1 } })).toBeNull();
    expect(writeFingerprint({ method: 'post', url: '/broadcasting/auth' })).toBeNull();
  });

  it('skips uploads, whose bodies cannot be compared', () => {
    expect(writeFingerprint({ method: 'post', url: '/departments/1/logo', data: new FormData() })).toBeNull();
  });

  it('distinguishes writes by method, url and payload', () => {
    const base = writeFingerprint({ method: 'post', url: '/schedules', data: { room: 1 } });
    expect(base).not.toBeNull();
    expect(writeFingerprint({ method: 'post', url: '/schedules', data: { room: 1 } })).toBe(base);
    expect(writeFingerprint({ method: 'post', url: '/schedules', data: { room: 2 } })).not.toBe(base);
    expect(writeFingerprint({ method: 'put', url: '/schedules', data: { room: 1 } })).not.toBe(base);
  });
});

describe('claimIdempotencyKey', () => {
  beforeEach(() => clearIdempotencyKeys());

  it('reuses the key of an unanswered identical write', () => {
    const first = claimIdempotencyKey('post /schedules {}');
    expect(claimIdempotencyKey('post /schedules {}')).toBe(first);
  });

  it('issues a fresh key once the server has answered', () => {
    const first = claimIdempotencyKey('post /schedules {}');
    settleIdempotencyKey('post /schedules {}');
    expect(claimIdempotencyKey('post /schedules {}')).not.toBe(first);
  });

  it('stops reusing a key after the replay window', () => {
    const now = Date.now();
    const first = claimIdempotencyKey('post /schedules {}', now);
    expect(claimIdempotencyKey('post /schedules {}', now + 6 * 60 * 1000)).not.toBe(first);
  });
});
