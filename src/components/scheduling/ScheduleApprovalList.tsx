import { useMemo } from 'react';

export interface ApprovalScheduleItem {
  id: number | string;
  section_id: number | string;
  course_id?: number | string;
  subject_id?: number | string;
  day: string;
  start_time: string;
  end_time: string;
  mode: string;
  faculty_id?: number | string | null;
  split_group_id?: string | null;
  is_hybrid?: boolean | number | string;
  meeting_index?: number | null;
  course?: { course_code?: string; course_name?: string; lecture_hours?: number | string | null; lab_hours?: number | string | null } | null;
  subject?: { subject_code?: string; subject_name?: string; lecture_hours?: number | string | null; lab_hours?: number | string | null } | null;
  faculty?: { first_name?: string; last_name?: string } | null;
  room?: { room_code?: string; building?: string | null } | null;
  department?: { department_name?: string; logo?: string | null } | null;
}

interface ScheduleApprovalListProps<T extends ApprovalScheduleItem> {
  sectionName: string;
  schedules: T[];
  getCourseCode: (item: T) => string | undefined;
  getCourseName: (item: T) => string | undefined;
  getRoomName: (item: T) => string | undefined;
  getInstructorName: (item: T) => string | undefined;
  getModeLabel: (mode: T['mode']) => string | undefined;
  formatTime: (value: string) => string;
}

const isHybrid = (item: ApprovalScheduleItem) => item.is_hybrid === true || item.is_hybrid === 1 || item.is_hybrid === '1';

const meetingKey = (item: ApprovalScheduleItem) => {
  const courseKey = item.course_id ?? item.subject_id ?? 'course';
  // A split group is the persisted relationship between hybrid meetings. Use it
  // even when one meeting's legacy payload is missing the boolean hybrid flag.
  if (item.split_group_id) return `hybrid:${item.section_id}:${courseKey}:${item.split_group_id}`;
  // Older approval payloads may expose is_hybrid without split_group_id. Within
  // one section, the course is still a safe fallback because normal offerings
  // are represented by a single schedule row.
  if (isHybrid(item)) return `hybrid-fallback:${item.section_id}:${courseKey}`;
  return `single:${item.id}`;
};

const formatHybridMeeting = <T extends ApprovalScheduleItem>(items: T[], formatTime: (value: string) => string) => {
  const meetings = [...items].sort((left, right) => (left.meeting_index ?? 99) - (right.meeting_index ?? 99));
  const days = meetings.map((item) => item.day).join('-');
  const times = meetings.map((item) => `${formatTime(item.start_time)} - ${formatTime(item.end_time)}`).join(' | ');
  return `${days}, ${times}`;
};

export function formatApprovalScheduleTime<T extends ApprovalScheduleItem>(items: T[], formatTime: (value: string) => string) {
  if (items.length === 1) {
    const [item] = items;
    return `${item.day}, ${formatTime(item.start_time)} - ${formatTime(item.end_time)}`;
  }
  return formatHybridMeeting(items, formatTime);
}

export default function ScheduleApprovalList<T extends ApprovalScheduleItem>({
  sectionName,
  schedules,
  getCourseCode,
  getCourseName,
  getRoomName,
  getInstructorName,
  getModeLabel,
  formatTime,
}: ScheduleApprovalListProps<T>) {
  const groupedSchedules = useMemo(() => {
    const groups = new Map<string, T[]>();
    schedules.forEach((item) => {
      const key = meetingKey(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return Array.from(groups.values());
  }, [schedules]);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <p className="text-xs font-black text-[#4e0a10]">{sectionName}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {groupedSchedules.map((items) => {
          const item = items[0];
          const hybrid = items.length > 1 && (items.some(isHybrid) || items.some((entry) => Boolean(entry.split_group_id)));
          const roomLabel = [...new Set(items.map(getRoomName).filter((value): value is string => Boolean(value)))].join(' | ') || 'Unassigned';
          const instructorLabel = [...new Set(items.map(getInstructorName).filter((value): value is string => Boolean(value)))].join(' | ') || 'Unassigned';
          const hasAssignedInstructor = items.every((entry) => Boolean(entry.faculty_id));
          return (
            <div key={items.map((entry) => entry.id).join('-')} className="grid grid-cols-1 gap-2 px-3 py-2.5 text-xs md:grid-cols-[1.2fr_1.2fr_0.8fr_1fr_0.7fr]">
              <div className="min-w-0">
                <p className="truncate font-black text-gray-800">{getCourseCode(item) ?? 'Course'}</p>
                <p className="truncate text-gray-500">{getCourseName(item) ?? 'Untitled course'}</p>
              </div>
              <div className="font-semibold text-gray-700">{formatApprovalScheduleTime(items, formatTime)}</div>
              <div className="truncate text-gray-600">{roomLabel}</div>
              <div className={`truncate ${hasAssignedInstructor ? 'text-gray-600' : 'font-semibold text-red-500'}`}>{instructorLabel}</div>
              <div>
                <span className="inline-flex rounded-full border border-[#C9952A]/30 bg-[#C9952A]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#4e0a10]">
                  {hybrid ? 'Hybrid' : (getModeLabel(item.mode) ?? item.mode)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
