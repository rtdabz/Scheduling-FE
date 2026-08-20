import { describe, expect, it } from 'vitest';
import { isPartTimeOutsideAvailability } from './useConflict';
import { timeToSlot } from '../../../../lib/timeGrid';
import type { Faculty } from '../types';

const faculty = (overrides: Record<string, unknown> = {}): Faculty =>
  ({
    id: 1,
    first_name: 'Ana',
    last_name: 'Cruz',
    employmentType: 'part-time',
    availabilities: [],
    ...overrides,
  }) as unknown as Faculty;

/** Reads a meeting the way the grid does, so the test states times not slots. */
const meeting = (start: string, end: string) => ({
  startSlot: timeToSlot(start),
  durationSlots: timeToSlot(end) - timeToSlot(start),
});

const outside = (f: Faculty | undefined, dayIndex: number, start: string, end: string) => {
  const { startSlot, durationSlots } = meeting(start, end);
  return isPartTimeOutsideAvailability(f, dayIndex, startSlot, durationSlots);
};

const MONDAY_AFTERNOON = [{ day_index: 0, start_time: '13:00:00', end_time: '17:00:00' }];

/**
 * These pin the frontend to RuleEngine's part_time_faculty_availability. The
 * grid used to guess "weekday mornings only" for an instructor with no recorded
 * windows, which offered slots the server then refused.
 */
describe('isPartTimeOutsideAvailability', () => {
  it('blocks every slot for a part-timer with no recorded windows', () => {
    const noWindows = faculty();

    expect(outside(noWindows, 0, '08:00', '09:30')).toBe(true);
    expect(outside(noWindows, 2, '14:00', '15:30')).toBe(true);
    expect(outside(noWindows, 5, '10:00', '11:30')).toBe(true);
  });

  it('never restricts a full-time instructor', () => {
    expect(outside(faculty({ employmentType: 'full-time' }), 0, '08:00', '09:30')).toBe(false);
  });

  it('allows a meeting that fits inside a window for that day', () => {
    const afternoon = faculty({ availabilities: MONDAY_AFTERNOON });

    expect(outside(afternoon, 0, '13:00', '14:30')).toBe(false);
    expect(outside(afternoon, 0, '15:30', '17:00')).toBe(false);
  });

  it('rejects a meeting that starts before or runs past the window', () => {
    const afternoon = faculty({ availabilities: MONDAY_AFTERNOON });

    expect(outside(afternoon, 0, '08:00', '09:30')).toBe(true);
    expect(outside(afternoon, 0, '16:00', '18:00')).toBe(true);
  });

  it('treats a day with no window as unavailable even when other days have one', () => {
    expect(outside(faculty({ availabilities: MONDAY_AFTERNOON }), 1, '13:00', '14:30')).toBe(true);
  });

  it('does not restrict a missing instructor', () => {
    expect(outside(undefined, 0, '08:00', '09:30')).toBe(false);
  });
});
