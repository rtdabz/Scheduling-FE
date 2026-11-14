import { describe, expect, it } from 'vitest';
import { isOutsideFacultyAvailability } from './useConflict';
import { timeToSlot } from '../../../../lib/timeGrid';
import type { Faculty } from '../types';

const weekdays = (start: string, end: string) =>
  [0, 1, 2, 3, 4].map((day_index) => ({ day_index, start_time: start, end_time: end }));

const FULL_TIME_DEFAULT = weekdays('07:00:00', '20:30:00');
const PART_TIME_DEFAULT = [...weekdays('17:30:00', '20:30:00'), { day_index: 5, start_time: '07:00:00', end_time: '20:30:00' }];

const faculty = (overrides: Record<string, unknown> = {}): Faculty =>
  ({
    id: '1',
    name: 'Ana Cruz',
    employmentType: 'part-time',
    availabilities: [],
    standardAvailabilities: PART_TIME_DEFAULT,
    ...overrides,
  }) as unknown as Faculty;

/** Reads a meeting the way the grid does, so the test states times not slots. */
const outside = (f: Faculty | undefined, dayIndex: number, start: string, end: string) =>
  isOutsideFacultyAvailability(f, dayIndex, timeToSlot(start), timeToSlot(end) - timeToSlot(start));

/**
 * These pin the scheduler grid to the backend rule: availability is the
 * employment type's default week plus any added windows.
 */
describe('isOutsideFacultyAvailability', () => {
  it('follows the part-time default: weekday evenings and Saturday', () => {
    const partTimer = faculty();

    expect(outside(partTimer, 0, '17:30', '20:30')).toBe(false);
    expect(outside(partTimer, 5, '07:00', '08:30')).toBe(false);
    expect(outside(partTimer, 0, '08:00', '09:30')).toBe(true);
    expect(outside(partTimer, 0, '16:30', '17:30')).toBe(true);
    expect(outside(partTimer, 6, '08:00', '09:30')).toBe(true);
  });

  it('follows the full-time default: weekdays 7:00 AM-8:30 PM, not Saturday', () => {
    const fullTimer = faculty({ employmentType: 'full-time', standardAvailabilities: FULL_TIME_DEFAULT });

    expect(outside(fullTimer, 0, '16:00', '19:00')).toBe(false);
    expect(outside(fullTimer, 4, '07:00', '20:30')).toBe(false);
    expect(outside(fullTimer, 5, '08:00', '09:30')).toBe(true);
  });

  it('adds windows on top of the default without replacing it', () => {
    const partTimer = faculty({ availabilities: [{ day_index: 0, start_time: '07:00:00', end_time: '11:00:00' }] });

    expect(outside(partTimer, 0, '08:00', '11:00')).toBe(false);
    expect(outside(partTimer, 0, '17:30', '20:30')).toBe(false);
    expect(outside(partTimer, 0, '10:00', '12:00')).toBe(true);
  });

  it('joins an added window to an adjacent default', () => {
    const partTimer = faculty({ availabilities: [{ day_index: 0, start_time: '14:00:00', end_time: '17:30:00' }] });

    expect(outside(partTimer, 0, '16:00', '18:00')).toBe(false);
  });

  it('does not restrict a missing instructor or a payload without default hours', () => {
    expect(outside(undefined, 0, '08:00', '09:30')).toBe(false);
    expect(outside(faculty({ standardAvailabilities: undefined }), 0, '08:00', '09:30')).toBe(false);
  });
});
