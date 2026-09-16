import { describe, expect, it } from 'vitest';
import { MAX_READ_RETRIES, isRetryableRead, readRetryDelayMs } from './requestRetry';

const failure = (method: string, status?: number, code?: string) => ({
  code,
  config: { method },
  response: status === undefined ? undefined : { status },
});

describe('isRetryableRead', () => {
  it('retries a read that got no answer or a gateway error', () => {
    expect(isRetryableRead(failure('get'), 0)).toBe(true);
    expect(isRetryableRead(failure('get', 503), 0)).toBe(true);
  });

  it('never retries writes', () => {
    expect(isRetryableRead(failure('post'), 0)).toBe(false);
    expect(isRetryableRead(failure('delete', 503), 0)).toBe(false);
  });

  it('leaves real answers and deliberate cancels alone', () => {
    expect(isRetryableRead(failure('get', 404), 0)).toBe(false);
    expect(isRetryableRead(failure('get', 500), 0)).toBe(false);
    expect(isRetryableRead(failure('get', undefined, 'ERR_CANCELED'), 0)).toBe(false);
  });

  it('gives up after the retry budget', () => {
    expect(isRetryableRead(failure('get'), MAX_READ_RETRIES)).toBe(false);
  });
});

describe('readRetryDelayMs', () => {
  it('backs off with bounded jitter', () => {
    expect(readRetryDelayMs(0, () => 0)).toBe(750);
    expect(readRetryDelayMs(0, () => 1)).toBe(1250);
    expect(readRetryDelayMs(1, () => 0.5)).toBe(3000);
  });
});
