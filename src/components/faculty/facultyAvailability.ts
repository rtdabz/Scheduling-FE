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
  /** "standard": no custom windows, so the employment type's standard hours apply (warning only). */
  availability_mode?: 'standard' | 'custom';
  /** Custom windows: a hard limit for either employment type. */
  availabilities: AvailabilityWindow[];
  /** The employment type's standard week, clipped to operating hours. */
  standard_availabilities?: AvailabilityWindow[];
}
