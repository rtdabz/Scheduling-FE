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
  /** Whether an active Dean is assigned to this department. */
  has_dean?: boolean;
  /**
   * Delegated classes still without an instructor. Counted server-side because
   * they sit in other departments' sections, so the dashboard's own schedule
   * rows never contain them.
   */
  cross_department_pending?: number;
}

/** Shown wherever submitting is blocked for want of a Dean. */
export const DEAN_REQUIRED_MESSAGE =
  'Submission unavailable. Please assign a Department Dean before submitting the schedule.';

interface StageCounts {
  /** draft + revision — sections that still need drafting work */
  draft: number;
  /** returned by the dean for revision (subset of `draft`) */
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
  /** False when no active Dean is assigned; submitting is refused server-side. */
  hasDean: boolean;
  /** Delegated classes from other departments that still need an instructor. */
  crossDepartmentPending: number;
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
  // Assume a Dean until told otherwise, so a stale cache or a failed fetch never
  // blocks submitting on its own -- the backend is the authority either way.
  const [hasDean, setHasDean] = useState(cachedStatus?.has_dean ?? true);
  const [crossDepartmentPending, setCrossDepartmentPending] = useState(cachedStatus?.cross_department_pending ?? 0);
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

  // ── Derived values ──

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

  // "Drafted" means the section has left the draft stage (status is neither draft nor revision)
  const draftedCount = useMemo(() => sections.filter(s => s.status !== 'draft' && s.status !== 'revision').length, [sections]);

  const draftingProgress = useMemo(() =>
    totalSections > 0 ? Math.round((draftedCount / totalSections) * 100) : 0
  , [totalSections, draftedCount]);

  // Build year-level summaries for the checklist
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

  // Submit is allowed only when every year level is complete (no drafts
  // remaining) and the department has a Dean to receive the submission.
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
    loading,
    error,
    refetch,
  };
}
