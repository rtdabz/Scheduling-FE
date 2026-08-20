/**
 * Shapes returned by `/faculties/{id}/availabilities`, shared by the viewer
 * panel and the editor so the two cannot drift apart.
 */

export interface AvailabilityWindow {
  id?: number;
  day_index: number;
  day_label?: string | null;
  start_time: string;
  end_time: string;
}

export interface AvailabilityResponse {
  faculty_id: number;
  employment_type: 'full-time' | 'part-time';
  opening_time: string;
  closing_time: string;
  availabilities: AvailabilityWindow[];
}
