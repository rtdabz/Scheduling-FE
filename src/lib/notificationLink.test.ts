import { describe, expect, it } from 'vitest';
import { notificationLink, parseLinkedSlots } from './notificationLink';

describe('notificationLink', () => {
  it('sends each role to its own page for the same notification', () => {
    expect(notificationLink('incoming_cross_department_courses', 'secretary')).toBe('/secretary/cross-department-assignments');
    expect(notificationLink('incoming_cross_department_courses', 'program_head')).toBe('/program_head/cross-department-assignments');
    expect(notificationLink('incoming_cross_department_courses', 'dean')).toBeUndefined();
    expect(notificationLink('cross_department_instructors_released', 'secretary')).toBe('/secretary/cross-department-assignments');
  });

  it('opens the approval queue for the stage that must act', () => {
    expect(notificationLink('schedule_submitted', 'dean')).toBe('/dean/schedules/approval');
    expect(notificationLink('schedule_submitted', 'secretary')).toBe('/secretary/schedules');
    expect(notificationLink('schedule_approved_by_dean', 'vpaa')).toBe('/schedules/approval');
    expect(notificationLink('schedule_approved_by_dean', 'dean')).toBe('/dean/schedules');
  });

  it('sends returned schedules back to the builder for schedulers', () => {
    expect(notificationLink('schedule_returned_by_dean', 'program_head')).toBe('/program_head/schedule-management');
    expect(notificationLink('schedule_returned_by_vpaa', 'vpaa')).toBe('/schedules/approval');
  });

  it('routes room requests to the requests page or VPAA facilities', () => {
    expect(notificationLink('room_request_approved', 'secretary')).toBe('/secretary/room-requests');
    expect(notificationLink('room_request_borrowed', 'vpaa')).toBe('/facilities');
    expect(notificationLink('room_request_approved', 'program_head')).toBeUndefined();
  });

  it('points room request notifications at the borrowed room', () => {
    expect(notificationLink('room_request_submitted', 'secretary', { room_request_id: 3, room_id: 105 })).toBe('/secretary/room-requests?room=105');
    expect(notificationLink('room_request_borrowed', 'vpaa', { room_id: 105 })).toBe('/facilities?room=105');
    expect(notificationLink('schedule_submitted', 'dean', { room_id: 105 })).toBe('/dean/schedules/approval');
  });

  it('carries the requested slots so the timetable can highlight them', () => {
    const href = notificationLink('room_request_submitted', 'secretary', {
      room_id: 105,
      windows: [
        { day: 'Monday', start_time: '07:30:00', end_time: '10:30:00' },
        { day: 'Thursday', start_time: '13:00', end_time: '16:00' },
      ],
    });
    const params = new URLSearchParams(href?.split('?')[1]);
    expect(params.get('room')).toBe('105');
    expect(parseLinkedSlots(params.get('slots'))).toEqual([
      { day: 'Monday', start_time: '07:30', end_time: '10:30' },
      { day: 'Thursday', start_time: '13:00', end_time: '16:00' },
    ]);
    expect(parseLinkedSlots('garbage,Monday@7-9')).toEqual([]);
  });

  it('has no link for unknown types or roles', () => {
    expect(notificationLink('something_new', 'secretary')).toBeUndefined();
    expect(notificationLink('schedule_activity', '')).toBeUndefined();
  });
});
