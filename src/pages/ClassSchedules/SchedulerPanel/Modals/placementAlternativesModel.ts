import type { DeliveryMode } from "../types";
import type { ApiScheduleRecord } from "../types";

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
  group_rows?: Omit<ApiScheduleRecord, "id">[];
  run_days?: string[];
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

export const groupSlotsByDay = (slots: AvailableSlot[], days: string[]): [string, AvailableSlot[]][] =>
  days
    .map((day): [string, AvailableSlot[]] => [day, slots.filter((slot) => slot.day === day)])
    .filter(([, daySlots]) => daySlots.length > 0);
