import { roomTransferDetailChanges, type RoomTransferRequest } from './roomRecovery';
import { mapApiScheduleToItem, mapApiSections } from '../pages/ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import type { SchedulePdfInput } from '../pages/ClassSchedules/SchedulerPanel/schedulePdf';
import type { ApiSectionRecord } from '../pages/ClassSchedules/SchedulerPanel/types';

export function roomTransferPreview(request: RoomTransferRequest): SchedulePdfInput | null {
  const changes = roomTransferDetailChanges(request);
  if (!request.preview_semester || !request.preview_department || !changes.length
    || changes.some(change => !change.preview_schedule?.course || !change.preview_schedule?.section)) return null;
  // Render copies of the stored proposal; never patch the queue's working schedule collection.
  const proposed = changes.map(change => ({ ...change.preview_schedule!,
    course: { ...change.preview_schedule!.course, course_code: change.course },
    section: { ...change.preview_schedule!.section, section_name: change.section }, day: change.after.day,
    start_time: change.after.start_time, end_time: change.after.end_time,
    room: change.mode === 'online' ? null : { room_code: change.after.room } }));
  // Print the complete section timetables, as Schedule Approval does, with the proposal applied.
  const proposedIds = new Set(proposed.map(row => String(row.id)));
  const timetable = [...proposed, ...(request.preview_schedules ?? [])
    .filter(row => !proposedIds.has(String(row.id)) && row.course && row.section)];
  const sections = [...new Map(timetable.map(row => [String(row.section_id), row.section as ApiSectionRecord])).values()];
  const mappedSections = mapApiSections(sections, request.preview_semester).sort((left, right) => left.name.localeCompare(right.name));
  return {
    sections: mappedSections,
    allSchedules: timetable.map(row => ({ ...mapApiScheduleToItem(row), startTime: row.start_time, endTime: row.end_time })),
    selectedSectionId: mappedSections[0]?.id ?? String(proposed[0].section_id),
    departments: [request.preview_department],
    users: request.preview_users ?? [],
    activeSemester: request.preview_semester,
  };
}
