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
  typeLabel: string;
  location: string;
  classes: number;
  share: number;
  isUnavailable: boolean;
}

const VIRTUAL_ROOM_TYPES = ['online', 'field'];

export const isVirtualRoom = (room: Pick<UsageRoom, 'room_type'>) =>
  VIRTUAL_ROOM_TYPES.includes((room.room_type ?? '').trim().toLowerCase());

export const physicalRooms = <T extends Pick<UsageRoom, 'room_type'>>(rooms: T[]) =>
  rooms.filter(room => !isVirtualRoom(room));

const sentenceCase = (value: string) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'Room';
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
};

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

export const roomsInUse = (usage: RoomUsage[]) => usage.filter(room => room.classes > 0).length;
