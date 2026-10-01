import type { DeliveryMode, Room, ScheduleStatus } from "../types";

/*
 * Shapes and helpers the placement dialog and its alternatives panel share.
 * Kept apart from the components so both files stay component-only.
 */

export interface DropRecommendationRow {
  semester_id: number;
  section_id: number;
  course_id: number;
  faculty_id: number | null;
  room_id: number | null;
  department_id: number;
  day: string;
  start_time: string;
  end_time: string;
  mode: DeliveryMode;
  is_hybrid: boolean;
  preferred_pattern: string | null;
  /** Present on saved rows; recommendations may leave it out. */
  meeting_type?: string | null;
  status: ScheduleStatus;
}

export interface DropRecommendation {
  /** Lets select save exactly this previewed plan instead of solving again. */
  plan_id?: string;
  rank: number;
  score: number;
  schedules: DropRecommendationRow[];
}

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

export interface ConfigurationConfirmation {
  schema_version: 1;
  configuration_fingerprint: string;
  confirmed_warning_rule_ids: string[];
}

export interface ConfigurationConfirmationError {
  error_code?: string;
  message?: string;
  configuration_confirmation?: {
    schema_version?: number;
    configuration_fingerprint?: string;
    required_warning_rule_ids?: string[];
  };
}

export type ConfigurationConfirmationPrompt = NonNullable<ConfigurationConfirmationError["configuration_confirmation"]>;

/**
 * Identity for the room filter. Online carries no room id, so the mode stands
 * in for one — keying on `room_id` alone folded Online into the "all" bucket.
 */
export const slotRoomKey = (entry: { mode: DeliveryMode; room_id: number | null }): string =>
  entry.room_id == null ? entry.mode : String(entry.room_id);

/** "All rooms" in the room filter, which is not a room id. */
export const ALL_ROOMS = "__all__";

/** Two meetings at one start time: a Split Session or a Hybrid Split. */
export const isSameTimePairRecommendation = (recommendation: DropRecommendation): boolean =>
  recommendation.schedules.length === 2
  && recommendation.schedules[0].start_time === recommendation.schedules[1].start_time
  && recommendation.schedules[0].day !== recommendation.schedules[1].day;

/** Short delivery names, for the "F2F | Online" shape of a split. */
export const DELIVERY_SHORT_LABEL: Record<DeliveryMode, string> = {
  "on-site": "F2F",
  online: "Online",
  field: "Field",
};

export const getRecommendationRoomLabel = (row: DropRecommendationRow, rooms: Room[]): string => {
  const room = rooms.find((item) => Number(item.id) === row.room_id);
  if (room) return room.name;
  if (row.mode === "online") return "Online";
  if (row.mode === "field") return "Field";
  if (row.room_id == null) return "Room TBA";
  return "Recommended room";
};

/** A room chosen as "to be assigned later". */
export const ROOM_TBA = "tba";

/** A meeting's delivery as the placement dialog offers it. */
export type ClassMode = "on-site" | "online" | "field";
