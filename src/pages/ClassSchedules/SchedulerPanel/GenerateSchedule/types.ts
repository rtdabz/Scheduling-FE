import type { DeliveryMode, ScheduleStatus } from "../types";

export interface RecommendedScheduleRow {
  term_id: number;
  section_id: number;
  course_id: number;
  faculty_id: number | null;
  room_id: number;
  department_id: number;
  day: string;
  start_time: string;
  end_time: string;
  mode: DeliveryMode;
  is_hybrid?: boolean;
  preferred_pattern?: string | null;
  status?: ScheduleStatus;
}

export interface ScheduleRecommendation {
  id: number;
  rank: number;
  score: number;
  status?: "pending" | "accepted" | "rejected";
  recommended_schedules: RecommendedScheduleRow[];
}
