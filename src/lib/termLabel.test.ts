import { describe, expect, it } from 'vitest';
import { academicYearLabel, semesterLabel, termLabel } from './termLabel';

describe('semesterLabel', () => {
  it('spells out the stored enum values', () => {
    expect(semesterLabel('1st')).toBe('1st Semester');
    expect(semesterLabel('2nd')).toBe('2nd Semester');
  });

  it('titles summer instead of calling it a numbered semester', () => {
    expect(semesterLabel('summer')).toBe('Summer');
  });

  it('reads the enum case-insensitively and ignores padding', () => {
    expect(semesterLabel(' 1ST ')).toBe('1st Semester');
  });

  it('says the value is missing rather than rendering nothing', () => {
    expect(semesterLabel(null)).toBe('Unset semester');
    expect(semesterLabel('')).toBe('Unset semester');
  });

  it('titles an unrecognised value instead of dropping it', () => {
    expect(semesterLabel('trimester')).toBe('Trimester');
  });
});

describe('academicYearLabel', () => {
  it('prefixes a stored year', () => {
    expect(academicYearLabel('2026-2027')).toBe('AY 2026-2027');
  });

  it('returns nothing to append when the year is missing', () => {
    expect(academicYearLabel(null)).toBe('');
    expect(academicYearLabel('   ')).toBe('');
  });
});

describe('termLabel', () => {
  it('combines semester and academic year', () => {
    expect(termLabel({ academic_year: '2026-2027', semester: '1st' })).toBe('1st Semester, AY 2026-2027');
  });

  it('drops the year clause when there is no year', () => {
    expect(termLabel({ semester: '2nd' })).toBe('2nd Semester');
  });

  it('names the empty case so the chip never renders blank', () => {
    expect(termLabel(null)).toBe('No active term');
  });
});
