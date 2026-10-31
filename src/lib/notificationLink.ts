type Role = 'vpaa' | 'dean' | 'secretary' | 'program_head';

const isDepartmentScheduler = (role: Role): boolean => role === 'secretary' || role === 'program_head';

const pageFor = (type: string, role: Role): string | null => {
  if (type.startsWith('room_request_')) {
    if (role === 'vpaa') return 'facilities';
    return role === 'secretary' ? 'room-requests' : null;
  }

  switch (type) {
    case 'incoming_cross_department_course':
    case 'incoming_cross_department_courses':
    case 'cross_department_instructors_released':
      return isDepartmentScheduler(role) ? 'cross-department-assignments' : null;
    case 'cross_department_instructor_assignments_completed':
      return isDepartmentScheduler(role) ? 'course-assignments' : null;
    case 'schedule_submitted':
      return role === 'dean' ? 'schedules/approval' : 'schedules';
    case 'schedule_approved_by_dean':
      return role === 'vpaa' ? 'schedules/approval' : 'schedules';
    case 'schedule_returned_by_dean':
    case 'schedule_returned_by_vpaa':
    case 'schedule_withdrawn':
      return isDepartmentScheduler(role) ? 'schedule-management' : 'schedules';
    case 'instructor_assigned':
    case 'instructor_assignment_completed':
      return isDepartmentScheduler(role) ? 'instructor-assignment' : 'schedules';
    case 'schedule_approved_by_vpaa':
    case 'schedule_activity':
      return 'schedules';
    default:
      return null;
  }
};

export interface LinkedSlot {
  day: string;
  start_time: string;
  end_time: string;
}

const SLOT_PATTERN = /^([A-Za-z]+)@(\d{2}:\d{2})-(\d{2}:\d{2})$/;

const encodeSlots = (windows: unknown): string =>
  (Array.isArray(windows) ? windows : [])
    .filter((window): window is LinkedSlot => {
      const slot = window as Partial<LinkedSlot> | null;
      return typeof slot?.day === 'string' && typeof slot.start_time === 'string' && typeof slot.end_time === 'string';
    })
    .map((window) => `${window.day}@${window.start_time.slice(0, 5)}-${window.end_time.slice(0, 5)}`)
    .filter((slot) => SLOT_PATTERN.test(slot))
    .join(',');

export const parseLinkedSlots = (value: string | null): LinkedSlot[] =>
  (value ?? '').split(',').flatMap((slot) => {
    const match = SLOT_PATTERN.exec(slot);
    return match ? [{ day: match[1], start_time: match[2], end_time: match[3] }] : [];
  });

const queryFor = (type: string, metadata?: Record<string, unknown> | null): string => {
  if (!type.startsWith('room_request_')) return '';
  const roomId = Number(metadata?.room_id);
  if (!Number.isInteger(roomId) || roomId <= 0) return '';
  const params = new URLSearchParams({ room: String(roomId) });
  const slots = encodeSlots(metadata?.windows);
  if (slots) params.set('slots', slots);
  return `?${params.toString()}`;
};

export const notificationLink = (
  type: string,
  role: string,
  metadata?: Record<string, unknown> | null,
): string | undefined => {
  if ((type === 'room_transfer_submitted' && role === 'dean') || (type === 'room_transfer_dean_approved' && role === 'vpaa')
    || ((type === 'room_transfer_approved' || type === 'room_transfer_rejected') && role === 'dean')) {
    const query = typeof metadata?.plan_id === 'string' ? `?room_transfer=${encodeURIComponent(metadata.plan_id)}` : '';
    return `${role === 'dean' ? '/dean' : ''}/schedules/approval${query}#schedule-approval-list`;
  }
  if ((type === 'room_transfer_approved' || type === 'room_transfer_rejected') && (role === 'secretary' || role === 'program_head')) {
    const params = new URLSearchParams({ recovery: 'open' });
    if (typeof metadata?.plan_id === 'string') params.set('room_transfer', metadata.plan_id);
    return `/${role}/schedule-management?${params}`;
  }
  if ((type === 'room_recovery' || type === 'room_recovery_applied') && (role === 'secretary' || role === 'program_head')) {
    const id = Number(metadata?.recovery_case_id);
    const semester = Number(metadata?.semester_id);
    return `/${role}/schedule-management?recovery=${Number.isInteger(id) && id > 0 ? id : 'open'}${Number.isInteger(semester) && semester > 0 ? `&recovery_semester=${semester}` : ''}`;
  }
  if (role !== 'vpaa' && role !== 'dean' && role !== 'secretary' && role !== 'program_head') return undefined;
  const page = pageFor(type, role);
  if (!page) return undefined;
  const query = queryFor(type, metadata);
  if (role === 'vpaa') return (page === 'schedules' ? '/schedules/approval' : `/${page}`) + query;
  return `/${role}/${page}${query}`;
};
