import api from './api';
import type { PersonNameParts } from './personName';
import { FULL_DAY_NAMES, slotToTime24h } from './timeGrid';

export type RoomRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked';

export interface RoomRequestWindow {
  day: string;
  start_time: string;
  end_time: string;
}

export interface RoomRequestDepartment {
  id: number;
  code: string;
  name: string;
}

export interface RoomRequestRoom {
  id: number;
  room_code: string;
  building: string | null;
  room_type: string;
  /** The room's current owner, which can differ from the request's recorded owner. */
  department_id: number | null;
  is_archived?: boolean;
}

export interface RoomRequestSemester {
  id: number;
  academic_year: string;
  semester: string;
  is_active: boolean;
}

export interface RoomRequestDecision {
  event: string;
  occurred_at: string;
  actor: { id: number | null; name: string | null; role?: string | null } | null;
  before_status: RoomRequestStatus | null;
  after_status: RoomRequestStatus;
  remarks: string | null;
}

export interface RoomRequest {
  id: number;
  status: RoomRequestStatus;
  purpose: string | null;
  review_remarks: string | null;
  room: RoomRequestRoom | null;
  academic_semester: RoomRequestSemester | null;
  requesting_department: RoomRequestDepartment | null;
  owner_department: RoomRequestDepartment | null;
  /** The room was reassigned after this request was sent. */
  owner_changed?: boolean;
  requester: { id: number; name: string | null } | null;
  reviewer: { id: number; name: string | null } | null;
  decisions?: RoomRequestDecision[];
  reviewed_at: string | null;
  created_at: string | null;
  windows: RoomRequestWindow[];
}

export interface RoomOccupancyBlock extends RoomRequestWindow {
  kind: 'class' | 'grant';
  department_code: string | null;
  label: string;
}

export interface RoomBorrowingStatus {
  /** False until the owning department's whole timetable has final VPAA approval. */
  open: boolean;
  /** Why it is closed: before the owner's first approval, or while it recalls and revises. */
  reason?: 'awaiting_approval' | 'owner_updating' | null;
  message: string | null;
}

export interface RoomOccupancy {
  room: RoomRequestRoom;
  semester?: RoomRequestSemester;
  borrowing?: RoomBorrowingStatus;
  opening_time: string;
  closing_time: string;
  occupied: RoomOccupancyBlock[];
  schedules: RoomOccupancySchedule[];
}

export interface RoomOccupancySchedule {
  id: number;
  semester_id: number;
  /** Null when the class belongs to another department and its details are withheld. */
  section_id: number | null;
  course_id: number | null;
  faculty_id: number | null;
  room_id: number;
  department_id: number;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  start_time: string;
  end_time: string;
  mode: string;
  meeting_type?: 'lecture' | 'laboratory' | null;
  status: string;
  /** Another department's class: only its time is shown, as "Occupied". */
  is_masked?: boolean;
  section?: { id: number; section_name: string } | null;
  course?: {
    id: number;
    course_code: string;
    course_name: string;
    course_category?: 'major' | 'minor';
    units?: number | string | null;
    lecture_hours?: number | string | null;
    lab_hours?: number | string | null;
  } | null;
  faculty?: (PersonNameParts & {
    id: number;
    first_name: string;
    last_name: string;
  }) | null;
}

export interface RoomRequestInput {
  room_id: number;
  semester_id?: number;
  purpose: string;
  windows: RoomRequestWindow[];
}

export const ROOM_REQUEST_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface RoomRequestMutationResult {
  message: string;
  data: RoomRequest;
  released_schedule_count?: number;
  released_schedule_ids?: number[];
}

/** The active semester, or null when none is active. Other failures throw. */
export const fetchActiveSemester = async (): Promise<RoomRequestSemester | null> => {
  try {
    return (await api.get<RoomRequestSemester>('/semesters/active')).data ?? null;
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) return null;
    throw error;
  }
};

export const fetchRoomRequests = async (params?: { status?: RoomRequestStatus; semester_id?: number }) =>
  (await api.get<RoomRequest[]>('/room-requests', { params })).data;

/** Omitting the semester lets the server default to the active one. */
export const fetchRoomOccupancy = async (roomId: number, semesterId?: number | null) =>
  (await api.get<RoomOccupancy>(
    `/room-requests/rooms/${roomId}/occupancy`,
    semesterId ? { params: { semester_id: semesterId } } : undefined,
  )).data;

export const submitRoomRequest = async (input: RoomRequestInput) =>
  (await api.post<RoomRequestMutationResult>('/room-requests', input)).data;

export const cancelRoomRequest = async (id: number) =>
  (await api.post<RoomRequestMutationResult>(`/room-requests/${id}/cancel`)).data;

export const reviewRoomRequest = async (id: number, action: 'approve' | 'reject' | 'revoke', remarks?: string) =>
  (await api.post<RoomRequestMutationResult>(`/room-requests/${id}/${action}`, { remarks: remarks || undefined })).data;

/** The recorded owner, falling back to the room's current owner for older rows. */
export const getOwnerId = (request: RoomRequest): number | null =>
  request.owner_department?.id ?? request.room?.department_id ?? null;

export const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export const fromMinutes = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export const formatDuration = (minutes: number): string => {
  if (minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
};

export const formatSemester = (semester: { academic_year: string; semester: string } | null | undefined): string =>
  semester ? `${semester.semester} Semester, AY ${semester.academic_year}` : 'Semester not set';

export const formatClock = (time: string): string => {
  const total = toMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
};

export const describeWindow = (window: RoomRequestWindow): string =>
  `${window.day.slice(0, 3)} ${formatClock(window.start_time)} – ${formatClock(window.end_time)}`;

export const roomGrantFits = (
  room: { grantWindows?: RoomRequestWindow[] },
  dayIndex: number,
  startSlot: number,
  durationSlots: number,
): boolean => {
  if (!room.grantWindows) return true;
  const day = FULL_DAY_NAMES[dayIndex];
  const start = toMinutes(slotToTime24h(startSlot));
  const end = toMinutes(slotToTime24h(startSlot + durationSlots));
  return room.grantWindows.some(
    (window) => window.day === day && toMinutes(window.start_time) <= start && end <= toMinutes(window.end_time),
  );
};

/** Exact-minute overlap; never rounds boundaries to the time grid. */
export const windowConflicts = <T extends RoomRequestWindow>(window: RoomRequestWindow, occupied: T[]): T[] => {
  const start = toMinutes(window.start_time);
  const end = toMinutes(window.end_time);
  return occupied.filter(
    (block) => block.day === window.day && toMinutes(block.start_time) < end && start < toMinutes(block.end_time),
  );
};

export interface MinuteRange {
  start: number;
  end: number;
}

/** The parts of `range` not covered by any of `cuts`, in order. Touching edges do not overlap. */
export const subtractRanges = (range: MinuteRange, cuts: MinuteRange[]): MinuteRange[] => {
  const sorted = cuts
    .filter((cut) => cut.start < range.end && range.start < cut.end)
    .sort((a, b) => a.start - b.start);
  const parts: MinuteRange[] = [];
  let cursor = range.start;
  for (const cut of sorted) {
    if (cut.start > cursor) parts.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < range.end) parts.push({ start: cursor, end: range.end });
  return parts;
};

/** Requestable lengths, shortest first; a free window shorter than the first cannot be requested. */
export const REQUEST_DURATIONS = [
  { minutes: 90, label: '1.5 hours' },
  { minutes: 180, label: '3 hours' },
] as const;

/**
 * Free time on `day` within operating hours that clears every booking (classes and
 * borrowed windows), compared to the exact minute. Windows shorter than `minMinutes` are dropped.
 */
export const freeWindows = (
  day: string,
  booked: RoomRequestWindow[],
  openingMinutes: number,
  closingMinutes: number,
  minMinutes = 1,
): RoomRequestWindow[] =>
  subtractRanges(
    { start: openingMinutes, end: closingMinutes },
    booked
      .filter((block) => block.day === day)
      .map((block) => ({ start: toMinutes(block.start_time), end: toMinutes(block.end_time) })),
  )
    .filter((range) => range.end - range.start >= minMinutes)
    .map((range) => ({ day, start_time: fromMinutes(range.start), end_time: fromMinutes(range.end) }));

/**
 * Classes affected when this grant ends: the borrower's classes in
 * the room that overlap any granted window, matching the server's release rule.
 */
export const classesUnderGrant = (request: RoomRequest, schedules: RoomOccupancySchedule[]): RoomOccupancySchedule[] =>
  schedules.filter(
    (schedule) => schedule.department_id === request.requesting_department?.id
      && schedule.room_id === request.room?.id
      && (request.academic_semester == null || schedule.semester_id === request.academic_semester.id)
      && request.windows.some((window) => windowConflicts(window, [schedule]).length > 0),
  );
