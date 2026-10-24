import { roomTransferDetailChanges, type RoomTransferRequest } from './roomRecovery';
import { mapApiScheduleToItem, mapApiSections } from '../pages/ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import type { SchedulePdfInput } from '../pages/ClassSchedules/SchedulerPanel/schedulePdf';

export function roomTransferPreview(request: RoomTransferRequest): SchedulePdfInput | null {
  const changes = roomTransferDetailChanges(request);
  if (!request.preview_semester || !request.preview_department || !changes.length
    || changes.some(change => !change.preview_schedule?.course || !change.preview_schedule?.section)) return null;
  // Render copies of the stored proposal; never patch the queue's working schedule collection.
  const proposed = changes.map(change => ({ ...change.preview_schedule!,
    course: { ...change.preview_schedule!.course, course_code: change.course },
    section: { ...change.preview_schedule!.section, section_name: change.section }, day: change.after.day,
    start_time: change.after.start_time, end_time: change.after.end_time, room: { room_code: change.after.room } }));
  const sections = [...new Map(proposed.map(row => [String(row.section_id), row.section!])).values()];
  return {
    sections: mapApiSections(sections, request.preview_semester),
    allSchedules: proposed.map(row => ({ ...mapApiScheduleToItem(row), startTime: row.start_time, endTime: row.end_time })),
    selectedSectionId: String(proposed[0].section_id),
    departments: [request.preview_department],
    users: request.preview_users ?? [],
    activeSemester: request.preview_semester,
    transferPreview: {
      changes: changes.map(change => ({ scheduleId: String(change.schedule_id), room: change.before.room !== change.after.room,
        day: change.before.day !== change.after.day,
        time: change.before.start_time.slice(0, 5) !== change.after.start_time.slice(0, 5) || change.before.end_time.slice(0, 5) !== change.after.end_time.slice(0, 5) })),
    },
  };
}
