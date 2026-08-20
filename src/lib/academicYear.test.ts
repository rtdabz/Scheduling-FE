import { describe, expect, it } from 'vitest';
import {
  academicYearError,
  followingYear,
  isValidAcademicYear,
  joinAcademicYear,
  sanitizeYearInput,
  splitAcademicYear,
} from './academicYear';

describe('sanitizeYearInput', () => {
  it('keeps digits only and stops at four', () => {
    expect(sanitizeYearInput('20a26')).toBe('2026');
    expect(sanitizeYearInput('20267')).toBe('2026');
    expect(sanitizeYearInput('-- ')).toBe('');
  });
});

describe('splitAcademicYear', () => {
  it('splits a stored pair', () => {
    expect(splitAcademicYear('2026-2027')).toEqual({ start: '2026', end: '2027' });
  });

  it('tolerates padding around the dash', () => {
    expect(splitAcademicYear(' 2026 - 2027 ')).toEqual({ start: '2026', end: '2027' });
  });

  it('salvages a half-written value instead of discarding it', () => {
    expect(splitAcademicYear('2026-')).toEqual({ start: '2026', end: '' });
    expect(splitAcademicYear('2026')).toEqual({ start: '2026', end: '' });
  });

  it('returns empty halves for nothing', () => {
    expect(splitAcademicYear(null)).toEqual({ start: '', end: '' });
    expect(splitAcademicYear('')).toEqual({ start: '', end: '' });
  });
});

describe('joinAcademicYear', () => {
  it('joins both halves with a dash', () => {
    expect(joinAcademicYear({ start: '2026', end: '2027' })).toBe('2026-2027');
  });

  it('refuses to build a value from one half', () => {
    expect(joinAcademicYear({ start: '2026', end: '' })).toBe('');
    expect(joinAcademicYear({ start: '', end: '2027' })).toBe('');
  });
});

describe('followingYear', () => {
  it('is the next year for a complete starting year', () => {
    expect(followingYear('2026')).toBe('2027');
    expect(followingYear('2099')).toBe('2100');
  });

  it('is empty while the starting year is incomplete', () => {
    expect(followingYear('202')).toBe('');
    expect(followingYear('')).toBe('');
  });
});

describe('isValidAcademicYear', () => {
  it('accepts consecutive years', () => {
    expect(isValidAcademicYear({ start: '2026', end: '2027' })).toBe(true);
  });

  it('rejects a gap, a reversal and an incomplete pair', () => {
    expect(isValidAcademicYear({ start: '2026', end: '2028' })).toBe(false);
    expect(isValidAcademicYear({ start: '2027', end: '2026' })).toBe(false);
    expect(isValidAcademicYear({ start: '2026', end: '' })).toBe(false);
  });
});

describe('academicYearError', () => {
  it('stays quiet for an untouched pair', () => {
    expect(academicYearError({ start: '', end: '' })).toBeNull();
  });

  it('names the offending field', () => {
    expect(academicYearError({ start: '202', end: '2027' })).toBe('Starting year must be four digits.');
    expect(academicYearError({ start: '2026', end: '20' })).toBe('End year must be four digits.');
  });

  it('states the year it expects when the pair is not consecutive', () => {
    expect(academicYearError({ start: '2026', end: '2030' })).toBe('End year must be 2027.');
  });

  it('reports nothing for a valid pair', () => {
    expect(academicYearError({ start: '2026', end: '2027' })).toBeNull();
  });
});
