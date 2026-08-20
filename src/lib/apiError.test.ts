import { describe, expect, it } from 'vitest';
import { apiErrorMessage, apiFieldErrors } from './apiError';

const rejection = (status: number, data: unknown) => ({ response: { status, data } });

describe('apiErrorMessage', () => {
  it('prefers the failing field over a generic 422 headline', () => {
    const err = rejection(422, {
      message: 'The given data was invalid.',
      errors: { program_id: ['The selected program belongs to another department.'] },
    });

    expect(apiErrorMessage(err, 'fallback')).toBe(
      'The selected program belongs to another department.'
    );
  });

  it('surfaces the role message a 403 carries', () => {
    const err = rejection(403, {
      message: 'Your role may only update the teaching load allowances.',
      errors: { role: ['Not permitted to change last_name.'] },
    });

    expect(apiErrorMessage(err, 'fallback')).toContain('teaching load allowances');
  });

  it('reads a plain message with no field errors', () => {
    expect(apiErrorMessage(rejection(409, { message: 'Still referenced.' }), 'fallback')).toBe(
      'Still referenced.'
    );
  });

  it('explains a missing response rather than using the fallback', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toContain('Could not reach');
  });

  it('falls back only when the body says nothing', () => {
    expect(apiErrorMessage(rejection(500, {}), 'Failed to delete instructor')).toBe(
      'Failed to delete instructor'
    );
  });

  it('describes a bare 403 with no body', () => {
    expect(apiErrorMessage(rejection(403, {}), 'fallback')).toContain('not permitted');
  });
});

describe('apiFieldErrors', () => {
  it('flattens the first message per field', () => {
    const err = rejection(422, {
      errors: { max_units: ['Must be at least 1.', 'ignored'], deload_units: 'Too high.' },
    });

    expect(apiFieldErrors(err)).toEqual({
      max_units: 'Must be at least 1.',
      deload_units: 'Too high.',
    });
  });

  it('returns nothing when there are no field errors', () => {
    expect(apiFieldErrors(rejection(500, { message: 'boom' }))).toEqual({});
  });
});
