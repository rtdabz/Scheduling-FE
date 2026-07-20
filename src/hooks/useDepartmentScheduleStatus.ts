import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../lib/dataCache';

export type SectionScheduleStatus = 'draft' | 'completed' | 'submitted' | 'approved_by_dean' | 'approved';

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
}

interface StageCounts {
  draft: number;
  completed: number;
  submitted: number;
  approved_by_dean: number;
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
  const [loading, setLoading] = useState(!!departmentId && !hasCachedData(statusCacheKey));
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    if (!departmentId) return;

    let cancelled = false;

    const fetchStatus = async () => {
      setLoading(!hasCachedData(statusCacheKey));
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
          fetchKey > 0
        );
        if (!cancelled) {
          setSections(data.sections);
          setDepartmentName(data.department_name);
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
  }, [departmentId, fetchKey, statusCacheKey]);

  // ── Derived values ──

  const stageCounts: StageCounts = {
    draft: sections.filter(s => s.status === 'draft').length,
    completed: sections.filter(s => s.status === 'completed').length,
    submitted: sections.filter(s => s.status === 'submitted').length,
    approved_by_dean: sections.filter(s => s.status === 'approved_by_dean').length,
    approved: sections.filter(s => s.status === 'approved').length,
  };

  const totalSections = sections.length;

  // "Drafted" means the section has left the pure-draft stage (any status !== draft)
  const draftedCount = sections.filter(s => s.status !== 'draft').length;

  const draftingProgress =
    totalSections > 0 ? Math.round((draftedCount / totalSections) * 100) : 0;

  // Build year-level summaries for the checklist
  const presentYears = Array.from(new Set(sections.map(s => s.year_level))).sort();

  const yearLevels: YearLevelSummary[] = presentYears.map(yr => {
    const group = sections.filter(s => s.year_level === yr);
    const drafted = group.filter(s => s.status !== 'draft').length;
    return {
      year_level: yr,
      label: YEAR_LABELS[yr] ?? `Year ${yr}`,
      total: group.length,
      drafted,
      isComplete: group.length > 0 && drafted === group.length,
    };
  });

  // Submit is allowed only when every year level is complete (no drafts remaining)
  const canSubmit =
    yearLevels.length > 0 && yearLevels.every(yl => yl.isComplete);

  return {
    sections,
    departmentName,
    stageCounts,
    yearLevels,
    draftedCount,
    totalSections,
    draftingProgress,
    canSubmit,
    loading,
    error,
    refetch,
  };
}
