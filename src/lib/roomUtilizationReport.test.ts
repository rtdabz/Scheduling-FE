import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureTimeGrid, resetTimeGrid } from './timeGrid';
import { operatingWindowLabel, summarizeRoomUtilization } from './roomUtilizationReport';

const meeting = (overrides: Record<string, unknown>) => ({
  roomId: '1', roomName: 'SCI-101', day: 'Monday', dayIndex: 0, startSlot: 0, durationSlots: 4,
  courseCode: 'IT 101', courseName: 'Programming', sectionName: 'BSIT 1A', facultyName: 'Alice Santos',
  ...overrides,
});

describe('room utilization summary', () => {
  // 7:00 AM – 5:00 PM in 30-minute slots: 10 open hours a day, 60 a week (Mon–Sat).
  beforeEach(() => configureTimeGrid({ opening_time: '07:00', closing_time: '17:00', slot_minutes: 30 }));
  afterEach(() => resetTimeGrid());

  const room = { id: '1', name: 'SCI-101' };

  it('measures scheduled hours against weekly operating capacity', () => {
    const summary = summarizeRoomUtilization(room, [
      meeting({}), // Mon 7–9 AM
      meeting({ startSlot: 6, durationSlots: 6 }), // Mon 10 AM – 1 PM
      meeting({ day: 'Wednesday', dayIndex: 2, startSlot: 2, durationSlots: 2, roomId: '', roomName: 'SCI-101' }),
      meeting({ roomId: '2', roomName: 'LAB-201' }),
    ]);
    expect(summary.capacityHours).toBe(60);
    expect(summary.scheduledHours).toBe(6);
    expect(summary.unusedHours).toBe(54);
    expect(summary.utilization).toBe(10);
    expect(summary.meetings).toHaveLength(3);
  });

  it('lists open windows per day and the hours booked on each', () => {
    const summary = summarizeRoomUtilization(room, [
      meeting({ startSlot: 6, durationSlots: 6 }),
      meeting({}),
    ]);
    expect(summary.days.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(summary.days[0]).toEqual({ day: 'Mon', scheduledHours: 5, freeWindows: ['9 AM – 10 AM', '1 PM – 5 PM'] });
    expect(summary.days[1]).toEqual({ day: 'Tue', scheduledHours: 0, freeWindows: ['7 AM – 5 PM'] });
  });

  it('orders assigned classes by day and time with readable labels', () => {
    const summary = summarizeRoomUtilization(room, [
      meeting({ day: 'Tuesday', dayIndex: 1, facultyName: null, sectionName: '' }),
      meeting({ startSlot: 3, durationSlots: 3 }),
    ]);
    expect(summary.meetings).toEqual([
      { day: 'Mon', time: '8:30 AM – 10 AM', course: 'IT 101 · Programming', section: 'BSIT 1A', instructor: 'Alice Santos', hours: 1.5 },
      { day: 'Tue', time: '7 AM – 9 AM', course: 'IT 101 · Programming', section: '—', instructor: 'TBA', hours: 2 },
    ]);
  });

  it('counts Sunday only for a room with Sunday classes', () => {
    const summary = summarizeRoomUtilization(room, [meeting({ day: 'Sunday', dayIndex: 6 })]);
    expect(summary.days).toHaveLength(7);
    expect(summary.capacityHours).toBe(70);
  });

  it('reports an unused room as fully open', () => {
    const summary = summarizeRoomUtilization(room, []);
    expect(summary).toMatchObject({ scheduledHours: 0, utilization: 0, unusedHours: 60, meetings: [] });
    expect(summary.days.every((d) => d.freeWindows.join() === '7 AM – 5 PM')).toBe(true);
  });

  it('labels the operating window', () => {
    expect(operatingWindowLabel()).toBe('Mon–Sat, 7 AM – 5 PM');
    expect(operatingWindowLabel(true)).toBe('Mon–Sun, 7 AM – 5 PM');
  });
});
