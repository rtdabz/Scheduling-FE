import { describe, expect, it } from 'vitest';
import { isOutsideAvailability, summarizeWeek } from './availabilityWindows';

const weekdays = (start: string, end: string) =>
  [0, 1, 2, 3, 4].map((day_index) => ({ day_index, start_time: start, end_time: end }));

const PART_TIME = [...weekdays('17:30:00', '20:30:00'), { day_index: 5, start_time: '07:00:00', end_time: '20:30:00' }];
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const meeting = (dayIndex: number, start: string, end: string) => ({ dayIndex, startMinutes: minutes(start), endMinutes: minutes(end) });

describe('isOutsideAvailability', () => {
  it('accepts the default plus a separate morning window on the same day', () => {
    const partTimer = {
      standardAvailabilities: PART_TIME,
      availabilities: [{ day_index: 0, start_time: '07:00', end_time: '11:00' }],
    };

    expect(isOutsideAvailability(partTimer, meeting(0, '07:00', '11:00'))).toBe(false);
    expect(isOutsideAvailability(partTimer, meeting(0, '17:30', '20:30'))).toBe(false);
    expect(isOutsideAvailability(partTimer, meeting(0, '11:00', '12:00'))).toBe(true);
  });

  it('reads the day name when a window has no day_index (older payloads)', () => {
    const partTimer = {
      standardAvailabilities: PART_TIME,
      availabilities: [{ day: 'Monday', start_time: '07:00:00', end_time: '17:30:00' }],
    };

    expect(isOutsideAvailability(partTimer, meeting(0, '16:00', '17:00'))).toBe(false);
    expect(isOutsideAvailability(partTimer, meeting(2, '07:00', '09:00'))).toBe(true);
  });

  it('extends a full-timer onto Saturday with an added window', () => {
    const fullTimer = {
      standardAvailabilities: weekdays('07:00:00', '20:30:00'),
      availabilities: [{ day: 'Saturday', start_time: '08:00:00', end_time: '12:00:00' }],
    };

    expect(isOutsideAvailability(fullTimer, meeting(5, '09:00', '11:00'))).toBe(false);
    expect(isOutsideAvailability(fullTimer, meeting(5, '13:00', '14:00'))).toBe(true);
  });
});

describe('summarizeWeek', () => {
  it('groups consecutive days with identical hours', () => {
    expect(summarizeWeek(PART_TIME)).toBe('Mon–Fri 5:30 PM–8:30 PM · Sat 7:00 AM–8:30 PM');
  });
});
