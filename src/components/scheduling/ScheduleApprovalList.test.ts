import { describe, expect, it } from 'vitest';
import { formatApprovalScheduleTime, type ApprovalScheduleItem } from './ScheduleApprovalList';

const formatTime = (value: string) => value.slice(0, 5);

describe('formatApprovalScheduleTime', () => {
  it('keeps a normal meeting in the existing day and time format', () => {
    const item: ApprovalScheduleItem = {
      id: 1,
      section_id: 10,
      day: 'Monday',
      start_time: '07:00:00',
      end_time: '10:00:00',
      mode: 'on-site',
    };

    expect(formatApprovalScheduleTime([item], formatTime)).toBe('Monday, 07:00 - 10:00');
  });

  it('combines hybrid meetings into one table value', () => {
    const base = {
      section_id: 10,
      course_id: 20,
      mode: 'on-site',
      is_hybrid: true,
      split_group_id: 'split-1',
    } as const;

    const first: ApprovalScheduleItem = { ...base, id: 1, day: 'Monday', start_time: '07:00:00', end_time: '09:00:00', meeting_index: 1 };
    const second: ApprovalScheduleItem = { ...base, id: 2, day: 'Wednesday', start_time: '10:00:00', end_time: '12:00:00', meeting_index: 2 };

    expect(formatApprovalScheduleTime([second, first], formatTime)).toBe('Monday-Wednesday, 07:00 - 09:00 | 10:00 - 12:00');
  });

  it('formats different hybrid meeting durations without repeating the course', () => {
    const first: ApprovalScheduleItem = {
      id: 1,
      section_id: 10,
      course_id: 20,
      day: 'Monday',
      start_time: '07:00:00',
      end_time: '10:00:00',
      mode: 'on-site',
      is_hybrid: true,
      meeting_index: 1,
    };
    const second: ApprovalScheduleItem = {
      ...first,
      id: 2,
      day: 'Thursday',
      end_time: '09:00:00',
      mode: 'online',
      meeting_index: 2,
    };

    expect(formatApprovalScheduleTime([first, second], formatTime)).toBe('Monday-Thursday, 07:00 - 10:00 | 07:00 - 09:00');
  });
});
