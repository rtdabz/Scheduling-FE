/**
 * Institution-wide aggregates from `GET /vpaa/dashboard-insights`.
 *
 * These cannot be derived in the browser from `/initial-data`: that payload caps
 * its `schedules` array, so campus-wide utilisation measured from it would be
 * understated. The server counts over every meeting in the active semester and sends
 * back a few kilobytes of totals.
 */

export interface BuildingUtilization {
  building: string;
  rooms: number;
  rooms_in_use: number;
  meetings: number;
  booked_hours: number;
  utilization: number;
}

export interface RoomUtilizationRow {
  id: number;
  room_code: string;
  building: string | null;
  room_type: string;
  meetings: number;
  booked_minutes: number;
  utilization: number;
  is_unavailable: boolean;
}

export interface VpaaInsights {
  semester_id: number | null;
  generated_at: string;
  utilization: {
    open_minutes_per_day: number;
    rooms_total: number;
    rooms_in_use: number;
    rooms_unavailable: number;
    average_utilization: number;
    buildings: BuildingUtilization[];
    busiest_rooms: RoomUtilizationRow[];
    idle_rooms: RoomUtilizationRow[];
    idle_room_count: number;
  };
  peak_load: {
    days: string[];
    hours: number[];
    matrix: Record<string, number[]>;
    peak: number;
    peak_day: string | null;
    peak_hour: number | null;
  };
  coverage: {
    sections_with_schedule: number;
    classes_without_instructor: number;
    sections_without_instructor: number;
    classes_without_room: number;
    departments_with_gaps: number;
  };
}

export const EMPTY_INSIGHTS: VpaaInsights = {
  semester_id: null,
  generated_at: '',
  utilization: {
    open_minutes_per_day: 0,
    rooms_total: 0,
    rooms_in_use: 0,
    rooms_unavailable: 0,
    average_utilization: 0,
    buildings: [],
    busiest_rooms: [],
    idle_rooms: [],
    idle_room_count: 0,
  },
  peak_load: { days: [], hours: [], matrix: {}, peak: 0, peak_day: null, peak_hour: null },
  coverage: {
    sections_with_schedule: 0,
    classes_without_instructor: 0,
    sections_without_instructor: 0,
    classes_without_room: 0,
    departments_with_gaps: 0,
  },
};

/** "14" -> "2 PM". The heatmap axis, in the 12-hour clock a reader expects. */
export const hourLabel = (hour: number) => {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
};
