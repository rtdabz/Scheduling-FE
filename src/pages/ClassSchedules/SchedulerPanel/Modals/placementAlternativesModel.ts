import type { DeliveryMode } from "../types";

/*
 * Shapes and helpers the placement dialog and its alternatives panel share.
 * Kept apart from the components so both files stay component-only.
 */

/** One placement the Rule Engine accepts, from /available-slots. */
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

/**
 * Identity for the room filter. Online carries no room id, so the mode stands
 * in for one — keying on `room_id` alone folded Online into the "all" bucket.
 */
export const slotRoomKey = (entry: { mode: DeliveryMode; room_id: number | null }): string =>
  entry.room_id == null ? entry.mode : String(entry.room_id);

/** "All rooms" in the room filter, which is not a room id. */
export const ALL_ROOMS = "__all__";

/** Short delivery names, for the "F2F | Online" shape of a split. */
export const DELIVERY_SHORT_LABEL: Record<DeliveryMode, string> = {
  "on-site": "F2F",
  online: "Online",
  field: "Field",
};

/** A room chosen as "to be assigned later". */
export const ROOM_TBA = "tba";

/** A meeting's delivery as the placement dialog offers it. */
export type ClassMode = "on-site" | "online" | "field";

/**
 * How the alternatives panel slices the valid placements: the best few on the
 * requested day, then everything Monday to Thursday, then the late week.
 */
export type RecommendationView = "best" | "weekdays" | "weekend";

/** Days the Weekdays view lists. */
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday"];

/**
 * Days the Weekend view lists. Sunday appears only for a department that holds
 * Sunday classes -- the server offers no Sunday slot otherwise.
 */
export const WEEKEND_NAMES = ["Friday", "Saturday", "Sunday"];

/** Best Match shows this many options at most. */
export const BEST_MATCH_LIMIT = 5;

/** A room before online before field, when nothing else separates two slots. */
const MODE_RANK: Record<DeliveryMode, number> = { "on-site": 0, online: 1, field: 2 };

export interface BestMatchCriteria {
  /** The requested day, by full name. */
  day: string;
  /** The start the meeting currently asks for. */
  startSlot: number;
  /** The meeting's room as the form holds it: a room id, "online" or "field". */
  roomKey: string;
  /** What placing the meeting in this slot costs in soft preferences; lower is better. */
  penaltyOf: (slot: AvailableSlot) => number;
}

/**
 * The most suitable room and time on the requested day, best first.
 *
 * Every slot is already one the Rule Engine accepts -- a free room of the
 * required type, no section, room or instructor clash, inside operating hours
 * -- so the ranking only decides between valid options: fewest soft-preference
 * notes (the ones the Schedule Generator optimises), then the start nearest the
 * one asked for, then keeping the chosen room, then on-site delivery. One
 * option per start time: five rooms at the same hour are not five choices.
 */
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

/** Day -> its slots, for the given days in calendar order; empty days are left out. */
export const groupSlotsByDay = (slots: AvailableSlot[], days: string[]): [string, AvailableSlot[]][] =>
  days
    .map((day): [string, AvailableSlot[]] => [day, slots.filter((slot) => slot.day === day)])
    .filter(([, daySlots]) => daySlots.length > 0);
