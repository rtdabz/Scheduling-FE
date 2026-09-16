import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STANDARD_HOURS,
  buildGanttDays,
  buildTimeWindow,
  dayIndexOf,
  findOverlaps,
  minutesToLabel,
  packLanes,
  percentOf,
  sessionTypeOf,
  siblingMeetingsOf,
  type CalendarSchedule,
} from './ganttLayout';

const meeting = (over: Partial<CalendarSchedule> & { id: number }): CalendarSchedule => ({
  day: 'Monday',
  start_time: '08:00:00',
  end_time: '09:30:00',
  mode: 'on-site',
  course_id: 1,
  room_id: 1,
  room: { id: 1, room_code: 'R 301' },
  faculty_id: 1,
  faculty: { id: 1, first_name: 'Grace', last_name: 'Hopper' },
  section_id: 1,
  section: { id: 1, section_name: 'BSIT 1A' },
  course: { course_code: 'IT 101', course_name: 'Introduction to IT', units: 3 },
  ...over,
});

describe('dayIndexOf', () => {
  it('reads full and three-letter day names, Monday first', () => {
    expect(dayIndexOf('Monday')).toBe(0);
    expect(dayIndexOf('thu')).toBe(3);
    expect(dayIndexOf(' Sunday ')).toBe(6);
  });

  it('rejects anything that is not a day rather than guessing', () => {
    expect(dayIndexOf('TTh')).toBe(-1);
    expect(dayIndexOf('')).toBe(-1);
    expect(dayIndexOf(null)).toBe(-1);
  });
});

describe('buildTimeWindow', () => {
  it('uses the standard hours when every class fits inside them', () => {
    expect(buildTimeWindow(DEFAULT_STANDARD_HOURS, [meeting({ id: 1 })])).toEqual({ start: 420, end: 1230 });
  });

  it('stretches to the hour to cover classes outside the standard hours', () => {
    const window = buildTimeWindow(DEFAULT_STANDARD_HOURS, [
      meeting({ id: 1, start_time: '06:30:00', end_time: '08:00:00' }),
      meeting({ id: 2, start_time: '20:00:00', end_time: '21:15:00' }),
    ]);
    expect(window).toEqual({ start: 360, end: 1320 });
  });

  it('positions minutes proportionally across the window', () => {
    const window = { start: 420, end: 1260 };
    expect(percentOf(420, window)).toBe(0);
    expect(percentOf(840, window)).toBe(50);
    expect(minutesToLabel(810)).toBe('1:30 PM');
    expect(minutesToLabel(720)).toBe('12 PM');
  });
});

describe('packLanes', () => {
  it('stacks only what actually overlaps and reuses freed lanes', () => {
    const items = [
      { schedule: meeting({ id: 1 }), start: 480, end: 570 },
      { schedule: meeting({ id: 2 }), start: 510, end: 600 },
      // Starts exactly when #1 ends, so it shares lane 0.
      { schedule: meeting({ id: 3 }), start: 570, end: 660 },
    ];
    const { blocks, laneCount } = packLanes(items);
    const laneOf = (id: number) => blocks.find((block) => block.schedule.id === id)?.lane;

    expect(laneCount).toBe(2);
    expect(laneOf(1)).toBe(0);
    expect(laneOf(2)).toBe(1);
    expect(laneOf(3)).toBe(0);
  });
});

describe('buildGanttDays', () => {
  const schedules = [
    meeting({ id: 1 }),
    meeting({ id: 2, day: 'Wednesday', room_id: 2, room: { id: 2, room_code: 'LAB 1' } }),
    meeting({ id: 3, room_id: null, room: null, mode: 'online' }),
    meeting({ id: 4, day: 'TBA' }),
  ];

  it('returns every visible day in order, including empty ones', () => {
    const days = buildGanttDays(schedules, 'none', [2, 0, 1]);
    expect(days.map((day) => day.name)).toEqual(['Monday', 'Tuesday', 'Wednesday']);
    expect(days.map((day) => day.count)).toEqual([2, 0, 1]);
  });

  it('splits a day into one row per room, with non-room groups last', () => {
    const [monday] = buildGanttDays(schedules, 'room', [0]);
    expect(monday.rows.map((row) => row.label)).toEqual(['R 301', 'Online']);
  });

  it('skips meetings with an unreadable day instead of drawing them on Monday', () => {
    const total = buildGanttDays(schedules, 'none', [0, 1, 2, 3, 4, 5, 6]).reduce((sum, day) => sum + day.count, 0);
    expect(total).toBe(3);
  });
});

describe('findOverlaps', () => {
  it('flags a shared room, instructor or section at the same time', () => {
    const overlaps = findOverlaps([
      meeting({ id: 1 }),
      meeting({ id: 2, start_time: '09:00:00', end_time: '10:00:00', faculty_id: 2, section_id: 2 }),
    ]);
    expect(overlaps.get(1)).toEqual([{ otherId: 2, kinds: ['room'] }]);
    expect(overlaps.get(2)).toEqual([{ otherId: 1, kinds: ['room'] }]);
  });

  it('ignores back-to-back classes, other days, and rooms an online class does not occupy', () => {
    const overlaps = findOverlaps([
      meeting({ id: 1 }),
      meeting({ id: 2, start_time: '09:30:00', end_time: '11:00:00' }),
      meeting({ id: 3, day: 'Tuesday' }),
      meeting({ id: 4, mode: 'online', faculty_id: 9, section_id: 9 }),
    ]);
    expect(overlaps.size).toBe(0);
  });
});

describe('session type and weekly meetings', () => {
  it('treats a missing meeting type as a lecture', () => {
    expect(sessionTypeOf({ meeting_type: null })).toBe('lecture');
    expect(sessionTypeOf({ meeting_type: 'laboratory' })).toBe('laboratory');
  });

  it('lists the other meetings of the same class and session type, in week order', () => {
    const lecture = meeting({ id: 1, day: 'Wednesday' });
    const siblings = siblingMeetingsOf(lecture, [
      lecture,
      meeting({ id: 2, day: 'Monday' }),
      meeting({ id: 3, day: 'Friday', meeting_type: 'laboratory' }),
      meeting({ id: 4, day: 'Friday', section_id: 2 }),
    ]);
    expect(siblings.map((item) => item.id)).toEqual([2, 1]);
  });
});
