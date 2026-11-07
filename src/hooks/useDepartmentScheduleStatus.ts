import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../lib/dataCache';
import { useLiveRevision } from './useLiveRefresh';

export type SectionScheduleStatus = 'draft' | 'completed' | 'submitted' | 'approved_by_dean' | 'conditionally_approved' | 'approved' | 'revision';

export interface SectionStatusItem {
  id: number;
  code: string;
  year_level: number;
  status: SectionScheduleStatus;
}

export interface YearLevelSummary {
  year_level: number;
  label: string;
  total: number;
  drafted: number;
  isComplete: boolean;
}

export interface DepartmentScheduleStatusData {
  department_id: number;
  department_name: string;
  sections: SectionStatusItem[];
  has_dean?: boolean;
  cross_department_pending?: number;
  cross_department_unlocked?: boolean;
}

export const DEAN_REQUIRED_MESSAGE =
  'Submission unavailable. Please assign a Department Dean before submitting the schedule.';

export const CROSS_DEPARTMENT_LOCKED_MESSAGE =
  'Cross-Department assignments will be available once all schedules are approved by the VPAA.';

interface StageCounts {
  draft: number;
  revision: number;
  completed: number;
  submitted: number;
  approved_by_dean: number;
  conditionally_approved: number;
  approved: number;
}

interface UseDepartmentScheduleStatusReturn {
  sections: SectionStatusItem[];
  departmentName: string;
  stageCounts: StageCounts;
  yearLevels: YearLevelSummary[];
  draftedCount: number;
  totalSections: number;
  draftingProgress: number;
  canSubmit: boolean;
  hasDean: boolean;
  crossDepartmentPending: number;
  /** True once every schedule of the department has final VPAA approval. */
  crossDepartmentUnlocked: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const YEAR_LABELS: Record<number, string> = {
  1: '1st year',
  2: '2nd year',
  3: '3rd year',
  4: '4th year',
};

export function useDepartmentScheduleStatus(
  departmentId: number | null | undefined
): UseDepartmentScheduleStatusReturn {
  const statusCacheKey = departmentId ? `department-schedule-status:${departmentId}` : '';
  const cachedStatus = statusCacheKey ? getCachedData<DepartmentScheduleStatusData>(statusCacheKey) : undefined;
  const [sections, setSections] = useState<SectionStatusItem[]>(cachedStatus?.sections ?? []);
  const [departmentName, setDepartmentName] = useState(cachedStatus?.department_name ?? '');
  const [hasDean, setHasDean] = useState(cachedStatus?.has_dean ?? true);
  const [crossDepartmentPending, setCrossDepartmentPending] = useState(cachedStatus?.cross_department_pending ?? 0);
  const [crossDepartmentUnlocked, setCrossDepartmentUnlocked] = useState(cachedStatus?.cross_department_unlocked ?? false);
  const [loading, setLoading] = useState(!!departmentId && !hasCachedData(statusCacheKey));
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);
  const liveRevision = useLiveRevision(['approvals', 'schedules', 'sections']);

  useEffect(() => {
    if (!departmentId) return;

    let cancelled = false;

    const fetchStatus = async () => {
      setLoading(liveRevision === 0 && !hasCachedData(statusCacheKey));
      setError(null);
      try {
        const data = await loadCachedData<DepartmentScheduleStatusData>(
          statusCacheKey,
          async () => {
            const res = await api.get<DepartmentScheduleStatusData>(
              `/departments/${departmentId}/schedule-status`
            );
            return res.data;
          },
          true
        );
        if (!cancelled) {
          setSections(data.sections);
          setDepartmentName(data.department_name);
          setHasDean(data.has_dean ?? true);
          setCrossDepartmentPending(data.cross_department_pending ?? 0);
          setCrossDepartmentUnlocked(data.cross_department_unlocked ?? false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load department schedule status.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const timeoutId = window.setTimeout(fetchStatus, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [departmentId, fetchKey, statusCacheKey, liveRevision]);

  const stageCounts: StageCounts = useMemo(() => ({
    draft: sections.filter(s => s.status === 'draft' || s.status === 'revision').length,
    revision: sections.filter(s => s.status === 'revision').length,
    completed: sections.filter(s => s.status === 'completed').length,
    submitted: sections.filter(s => s.status === 'submitted').length,
    approved_by_dean: sections.filter(s => s.status === 'approved_by_dean').length,
    conditionally_approved: sections.filter(s => s.status === 'conditionally_approved').length,
    approved: sections.filter(s => s.status === 'approved').length,
  }), [sections]);

  const totalSections = sections.length;

  const draftedCount = useMemo(() => sections.filter(s => s.status !== 'draft' && s.status !== 'revision').length, [sections]);

  const draftingProgress = useMemo(() =>
    totalSections > 0 ? Math.round((draftedCount / totalSections) * 100) : 0
  , [totalSections, draftedCount]);

  const yearLevels: YearLevelSummary[] = useMemo(() => {
    const presentYears = Array.from(new Set(sections.map(s => s.year_level))).sort();
    return presentYears.map(yr => {
      const group = sections.filter(s => s.year_level === yr);
      const drafted = group.filter(s => s.status !== 'draft' && s.status !== 'revision').length;
      return {
        year_level: yr,
        label: YEAR_LABELS[yr] ?? `Year ${yr}`,
        total: group.length,
        drafted,
        isComplete: group.length > 0 && drafted === group.length,
      };
    });
  }, [sections]);

  const canSubmit = useMemo(() =>
    hasDean && yearLevels.length > 0 && yearLevels.every(yl => yl.isComplete)
  , [hasDean, yearLevels]);

  return {
    sections,
    departmentName,
    stageCounts,
    yearLevels,
    draftedCount,
    totalSections,
    draftingProgress,
    canSubmit,
    hasDean,
    crossDepartmentPending,
    crossDepartmentUnlocked,
    loading,
    error,
    refetch,
  };
}
