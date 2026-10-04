import type { DeliveryMode } from "../types";

export interface AvailableSlot {
  day: string;
  day_index: number;
  start_slot: number;
  end_slot: number;
  start_time: string;
  end_time: string;
  mode: DeliveryMode;
  room_id: number | null;
  room_code: string;
  room_type: string;
}

export interface AvailableSlotRoom {
  room_id: number | null;
  room_code: string;
  room_type: string;
  mode: DeliveryMode;
  slot_count: number;
}

export const slotRoomKey = (entry: { mode: DeliveryMode; room_id: number | null }): string =>
  entry.room_id == null ? entry.mode : String(entry.room_id);

export const ALL_ROOMS = "__all__";

export const DELIVERY_SHORT_LABEL: Record<DeliveryMode, string> = {
  "on-site": "F2F",
  online: "Online",
  field: "Field",
};

export const ROOM_TBA = "tba";

export type ClassMode = "on-site" | "online" | "field";

export type RecommendationView = "best" | "weekdays" | "weekend";

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday"];

export const WEEKEND_NAMES = ["Friday", "Saturday", "Sunday"];

export const BEST_MATCH_LIMIT = 5;

const MODE_RANK: Record<DeliveryMode, number> = { "on-site": 0, online: 1, field: 2 };

export interface BestMatchCriteria {
  day: string;
  startSlot: number;
  roomKey: string;
  penaltyOf: (slot: AvailableSlot) => number;
}

export const rankBestMatches = (
  slots: AvailableSlot[],
  criteria: BestMatchCriteria,
  limit = BEST_MATCH_LIMIT,
): AvailableSlot[] => {
  const distance = (slot: AvailableSlot) => Math.abs(slot.start_slot - criteria.startSlot);
  const keepsRoom = (slot: AvailableSlot) => Number(slotRoomKey(slot) === criteria.roomKey);
  const ranked = slots
    .filter((slot) => slot.day === criteria.day)
    .map((slot) => ({ slot, penalty: criteria.penaltyOf(slot) }))
    .sort((left, right) => left.penalty - right.penalty
      || distance(left.slot) - distance(right.slot)
      || keepsRoom(right.slot) - keepsRoom(left.slot)
      || MODE_RANK[left.slot.mode] - MODE_RANK[right.slot.mode]
      || left.slot.start_slot - right.slot.start_slot
      || left.slot.room_code.localeCompare(right.slot.room_code));

  const seenStarts = new Set<number>();
  const best: AvailableSlot[] = [];
  for (const { slot } of ranked) {
    if (best.length >= limit) break;
    if (seenStarts.has(slot.start_slot)) continue;
    seenStarts.add(slot.start_slot);
    best.push(slot);
  }

  return best;
};

export const groupSlotsByDay = (slots: AvailableSlot[], days: string[]): [string, AvailableSlot[]][] =>
  days
    .map((day): [string, AvailableSlot[]] => [day, slots.filter((slot) => slot.day === day)])
    .filter(([, daySlots]) => daySlots.length > 0);
