import api from './api';
import { FULL_DAY_NAMES, slotToTime24h } from './timeGrid';

export type RoomRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked';

export interface RoomRequestWindow {
  day: string;
  /** HH:mm, 24-hour. */
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
  department_id: number | null;
}

export interface RoomRequest {
  id: number;
  status: RoomRequestStatus;
  purpose: string | null;
  review_remarks: string | null;
  room: RoomRequestRoom | null;
  academic_semester: { id: number; academic_year: string; semester: string; is_active: boolean } | null;
  requesting_department: RoomRequestDepartment | null;
  owner_department: RoomRequestDepartment | null;
  requester: { id: number; name: string } | null;
  reviewer: { id: number; name: string } | null;
  reviewed_at: string | null;
  created_at: string | null;
  windows: RoomRequestWindow[];
}

export interface RoomOccupancyBlock extends RoomRequestWindow {
  /** A class already placed in the room, or another department's approved grant. */
  kind: 'class' | 'grant';
  department_code: string | null;
  label: string;
}

export interface RoomOccupancy {
  room: RoomRequestRoom;
  opening_time: string;
  closing_time: string;
  occupied: RoomOccupancyBlock[];
}

export interface RoomRequestInput {
  room_id: number;
  purpose: string;
  windows: RoomRequestWindow[];
}

export const ROOM_REQUEST_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const fetchRoomRequests = async (params?: { status?: RoomRequestStatus; scope?: 'department' | 'all' }) =>
  (await api.get<RoomRequest[]>('/room-requests', { params })).data;

export const fetchRoomOccupancy = async (roomId: number) =>
  (await api.get<RoomOccupancy>(`/room-requests/rooms/${roomId}/occupancy`)).data;

export const submitRoomRequest = async (input: RoomRequestInput) =>
  (await api.post<{ message: string; data: RoomRequest }>('/room-requests', input)).data;

export const cancelRoomRequest = async (id: number) =>
  (await api.post<{ message: string; data: RoomRequest }>(`/room-requests/${id}/cancel`)).data;

export const reviewRoomRequest = async (id: number, action: 'approve' | 'reject' | 'revoke', remarks?: string) =>
  (await api.post<{ message: string; data: RoomRequest }>(`/room-requests/${id}/${action}`, { remarks: remarks || undefined })).data;

export const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** "11:00" -> "11:00 AM". */
export const formatClock = (time: string): string => {
  const total = toMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
};

export const describeWindow = (window: RoomRequestWindow): string =>
  `${window.day.slice(0, 3)} ${formatClock(window.start_time)} – ${formatClock(window.end_time)}`;

/**
 * Whether a meeting may use the room: always for the department's own and
 * shared rooms, and for a borrowed room only inside one of its granted windows
 * (the server's RoomAccessPolicy::fitsWindows).
 */
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

/** True when the proposed window overlaps anything already in the room that day. */
export const windowConflicts = (window: RoomRequestWindow, occupied: RoomOccupancyBlock[]): RoomOccupancyBlock[] => {
  const start = toMinutes(window.start_time);
  const end = toMinutes(window.end_time);
  return occupied.filter(
    (block) => block.day === window.day && toMinutes(block.start_time) < end && start < toMinutes(block.end_time),
  );
};
