import { describe, expect, it } from 'vitest';
import { freeWindows, subtractRanges } from './roomRequests';

const block = (day: string, start_time: string, end_time: string) => ({ day, start_time, end_time });

describe('subtractRanges', () => {
  it('returns the whole range when nothing overlaps', () => {
    expect(subtractRanges({ start: 420, end: 600 }, [{ start: 600, end: 700 }])).toEqual([{ start: 420, end: 600 }]);
  });

  it('removes exact, partial and inner overlaps', () => {
    expect(subtractRanges({ start: 420, end: 600 }, [{ start: 420, end: 600 }])).toEqual([]);
    expect(subtractRanges({ start: 420, end: 600 }, [{ start: 400, end: 510 }])).toEqual([{ start: 510, end: 600 }]);
    expect(subtractRanges({ start: 420, end: 600 }, [{ start: 450, end: 480 }, { start: 470, end: 500 }]))
      .toEqual([{ start: 420, end: 450 }, { start: 500, end: 600 }]);
  });
});

describe('freeWindows', () => {
  const opening = 7 * 60;
  const closing = 21 * 60;

  it('lists only the time clear of classes and grants on that day', () => {
    const blocks = [
      block('Monday', '07:00', '10:00'), // borrowed
      block('Monday', '13:00', '16:00'), // class
      block('Tuesday', '10:00', '13:00'),
    ];
    expect(freeWindows('Monday', blocks, opening, closing)).toEqual([
      block('Monday', '10:00', '13:00'),
      block('Monday', '16:00', '21:00'),
    ]);
  });

  it('keeps adjacent bookings apart only by real gaps, to the minute', () => {
    const blocks = [block('Monday', '07:00', '08:40'), block('Monday', '08:40', '10:00')];
    expect(freeWindows('Monday', blocks, opening, closing)).toEqual([block('Monday', '10:00', '21:00')]);
  });

  it('drops windows shorter than the minimum duration', () => {
    const blocks = [block('Monday', '07:00', '08:30'), block('Monday', '09:30', '21:00')];
    expect(freeWindows('Monday', blocks, opening, closing, 90)).toEqual([]);
    expect(freeWindows('Monday', blocks, opening, closing, 60)).toEqual([block('Monday', '08:30', '09:30')]);
  });

  it('returns nothing for a fully booked day', () => {
    expect(freeWindows('Monday', [block('Monday', '06:00', '22:00')], opening, closing)).toEqual([]);
  });
});
