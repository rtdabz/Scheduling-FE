import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { getCachedData, hasCachedData, setCachedData } from '../lib/dataCache';

/**
 * Aggregated schedule counts for the All Schedules screen.
 *
 * These deliberately do not come from `/initial-data`: that payload is capped,
 * so counting its rows reports a slice of the term as the whole of it. Every
 * figure here is aggregated server-side over the entire active term.
 */

export type SectionScheduleStage =
  | 'draft'
  | 'revision'
  | 'completed'
  | 'submitted'
  | 'approved_by_dean'
  | 'conditionally_approved'
  | 'approved';

export interface ConflictBreakdown {
  faculty: number;
  room: number;
  section: number;
  /** Meetings in at least one conflict, counted once however many kinds they trip. */
  total: number;
}

export interface SectionOverview {
  id: number;
  code: string;
  year_level: number;
  department_id: number;
  program_id: number | null;
  status: SectionScheduleStage;
  /** Distinct section/course pairs. */
  classes: number;
  /** `schedules` rows: an MWF class is three. */
  meetings: number;
  unassigned_faculty: number;
  unassigned_rooms: number;
  conflicts: ConflictBreakdown;
  day_load: Record<string, number>;
}

export interface DepartmentOverview {
  department_id: number;
  code: string;
  name: string;
  sections_total: number;
  sections_scheduled: number;
  classes: number;
  meetings: number;
  unassigned_faculty: number;
  unassigned_rooms: number;
  conflicts: ConflictBreakdown;
  status: SectionScheduleStage;
  sections: SectionOverview[];
}

export interface ScheduleOverviewTotals {
  departments: number;
  sections_total: number;
  sections_scheduled: number;
  classes: number;
  meetings: number;
  unassigned_faculty: number;
  unassigned_rooms: number;
  conflicts: number;
}

export interface ScheduleOverviewData {
  term: { id: number; academic_year?: string; semester?: string } | null;
  departments: DepartmentOverview[];
  totals: ScheduleOverviewTotals;
}

const CACHE_KEY = 'page:schedule-overview';

export const SCHEDULE_STAGE_LABELS: Record<SectionScheduleStage, string> = {
  draft: 'Drafting',
  revision: 'For revision',
  completed: 'Ready to submit',
  submitted: 'With the Dean',
  approved_by_dean: 'With the VPAA',
  conditionally_approved: 'Conditionally approved',
  approved: 'Approved',
};

export function useScheduleOverview() {
  const cached = getCachedData<ScheduleOverviewData>(CACHE_KEY);
  const [data, setData] = useState<ScheduleOverviewData | undefined>(cached);
  const [isLoading, setIsLoading] = useState(!hasCachedData(CACHE_KEY));
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refresh = useCallback(() => setFetchKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    const fetchOverview = async () => {
      // A cached payload is already on screen, so only a refresh shows a
      // spinner; the first load starts in the loading state already.
      if (fetchKey > 0) setIsLoading(true);
      try {
        const response = await api.get<ScheduleOverviewData>('/departments/schedule-overview');
        if (cancelled) return;
        setData(response.data);
        setCachedData(CACHE_KEY, response.data);
        setError(null);
      } catch {
        // A stale cache beats an empty screen, but the caller still needs to
        // know the numbers on it are not current.
        if (!cancelled) setError('Could not load the schedule overview.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchOverview();

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  return {
    data,
    departments: data?.departments ?? [],
    totals: data?.totals,
    term: data?.term ?? null,
    isLoading,
    error,
    refresh,
  };
}
