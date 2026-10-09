import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { getCachedData, hasCachedData, setCachedData } from '../lib/dataCache';
import { useLiveRevision } from './useLiveRefresh';

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
  total: number;
}

export interface SectionOverview {
  id: number;
  code: string;
  year_level: number;
  department_id: number;
  program_id: number | null;
  status: SectionScheduleStage;
  classes: number;
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
  semester: { id: number; academic_year?: string; semester?: string } | null;
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
  const liveRevision = useLiveRevision(['approvals', 'schedules', 'sections']);

  useEffect(() => {
    let cancelled = false;

    const fetchOverview = async () => {
      if (fetchKey > 0) setIsLoading(true);
      try {
        const response = await api.get<ScheduleOverviewData>('/departments/schedule-overview');
        if (cancelled) return;
        setData(response.data);
        setCachedData(CACHE_KEY, response.data);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load the schedule overview.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchOverview();

    return () => {
      cancelled = true;
    };
  }, [fetchKey, liveRevision]);

  return {
    data,
    departments: data?.departments ?? [],
    totals: data?.totals,
    semester: data?.semester ?? null,
    isLoading,
    error,
    refresh,
  };
}
