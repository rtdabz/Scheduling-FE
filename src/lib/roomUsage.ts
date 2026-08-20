/**
 * Room inventory as the dashboard needs to show it: physical rooms only, busiest
 * first, with the number of classes each one carries.
 *
 * Two shapes in the rooms table drive this. ONLINE and FIELD are virtual
 * placeholder rows (department_id null) that exist so an online or field class
 * has something to point at — they are not rooms anyone assigns, and asking
 * whether they are "booked" is meaningless, so they are kept out of the
 * inventory entirely and counted as delivery modes instead. And there is no
 * capacity column, so nothing here reports seats; building and status are the
 * real columns worth showing.
 */

export interface UsageRoom {
  id: number;
  room_code: string;
  room_type: string;
  building?: string | null;
  status?: string | null;
  department_id?: number | null;
}

export interface RoomUsage {
  id: number;
  code: string;
  /** Room type in sentence case, e.g. "Laboratory". */
  typeLabel: string;
  /** Building name, or a dash when the row has none. */
  location: string;
  /** Classes scheduled into this room. */
  classes: number;
  /** Share of the busiest room's load, 0-100, for the inline bar. */
  share: number;
  /** status is anything other than available — the room cannot take classes. */
  isUnavailable: boolean;
}

const VIRTUAL_ROOM_TYPES = ['online', 'field'];

/** A placeholder row standing in for a delivery mode rather than a real room. */
export const isVirtualRoom = (room: Pick<UsageRoom, 'room_type'>) =>
  VIRTUAL_ROOM_TYPES.includes((room.room_type ?? '').trim().toLowerCase());

export const physicalRooms = <T extends Pick<UsageRoom, 'room_type'>>(rooms: T[]) =>
  rooms.filter(room => !isVirtualRoom(room));

const sentenceCase = (value: string) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'Room';
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
};

/**
 * @param rooms every room visible to the department, virtual rows included
 * @param classesByRoom how many classes sit in each room id
 */
export const buildRoomUsage = (rooms: UsageRoom[], classesByRoom: Map<number, number>): RoomUsage[] => {
  const rows = physicalRooms(rooms).map(room => ({
    id: room.id,
    code: room.room_code || `Room ${room.id}`,
    typeLabel: sentenceCase(room.room_type),
    location: room.building?.trim() || '—',
    classes: classesByRoom.get(room.id) ?? 0,
    share: 0,
    isUnavailable: Boolean(room.status) && room.status!.trim().toLowerCase() !== 'available',
  }));

  const busiest = rows.reduce((most, row) => Math.max(most, row.classes), 0);

  return rows
    .map(row => ({ ...row, share: busiest > 0 ? Math.round((row.classes / busiest) * 100) : 0 }))
    .sort((a, b) => b.classes - a.classes || a.code.localeCompare(b.code));
};

/** Rooms carrying at least one class. */
export const roomsInUse = (usage: RoomUsage[]) => usage.filter(room => room.classes > 0).length;
