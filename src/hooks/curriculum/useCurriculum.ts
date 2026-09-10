import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { curriculumService } from '../../services/curriculum/curriculumService';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import type { Curriculum, Department, Program } from '../../types/curriculum';
import { annotateCurriculumLifecycle } from '../../types/curriculum';

interface CurriculumPageData {
  curriculumList: Curriculum[];
  departments: Department[];
  programs: Program[];
}

export function useCurriculum() {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userRole = user?.role?.toLowerCase() || 'user';
  const userDeptId = user?.department_id ?? null;

  const curriculumCacheKey = `page:curriculum:${userRole}:${userDeptId ?? 'all'}`;
  const cachedData = getCachedData<CurriculumPageData>(curriculumCacheKey);

  const [curriculumList, setCurriculumList] = useState<Curriculum[]>(cachedData?.curriculumList ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedData?.departments ?? []);
  const [programs, setPrograms] = useState<Program[]>(cachedData?.programs ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(curriculumCacheKey));

  // Role permissions
  const canManageCurriculum = useMemo(() => {
    return userRole === 'vpaa';
  }, [userRole]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCurriculumList = useCallback(
    async (forceRefresh = false) => {
      setIsLoading(forceRefresh || !hasCachedData(curriculumCacheKey));
      try {
        const data = await loadCachedData<CurriculumPageData>(
          curriculumCacheKey,
          async () => {
            const [curriculumRes, deptsRes, programsRes] = await Promise.all([
              curriculumService.getCurriculumList(userDeptId),
              api.get<Department[]>('/departments'),
              api.get<Program[]>('/programs'),
            ]);
            return {
              curriculumList: curriculumRes,
              departments: deptsRes.data,
              programs: programsRes.data,
            };
          },
          forceRefresh
        );
        setCurriculumList(data.curriculumList);
        setDepartments(data.departments);
        setPrograms(data.programs);
      } catch {
        toast.error('Error', 'Failed to load curriculum data.');
      } finally {
        setIsLoading(false);
      }
    },
    [curriculumCacheKey, userDeptId, toast]
  );

  useEffect(() => {
    fetchCurriculumList();
  }, [fetchCurriculumList]);

  // Ranked before filtering: new-vs-old is relative to a curriculum's siblings,
  // and a status filter would hide the ones the ranking depends on.
  const annotatedCurriculumList = useMemo(
    () => annotateCurriculumLifecycle(curriculumList),
    [curriculumList],
  );

  const filteredCurriculumList = useMemo(() => {
    return annotatedCurriculumList.filter((item) => {
      if (item.status === 'archived') return false;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchDept =
        departmentFilter === 'all' || item.department_id?.toString() === departmentFilter;
      const matchSearch =
        searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchDept && matchSearch;
    });
  }, [annotatedCurriculumList, statusFilter, departmentFilter, searchQuery]);

  const handleCreateOrUpdate = async (data: Partial<Curriculum>, editingCurriculum: Curriculum | null): Promise<Curriculum> => {
    try {
      if (editingCurriculum) {
        const updated = await curriculumService.updateCurriculum(editingCurriculum.id, data);
        setCurriculumList((prev) => {
          // Activating no longer demotes the department's other curricula: a
          // department mid-transition runs the old and the new one side by side,
          // and each year level chooses which it follows.
          const next = prev.map((c) => (c.id === editingCurriculum.id ? updated : c));
          setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments, programs });
          return next;
        });
        invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
        toast.success('Success', 'Curriculum updated successfully.');
        return updated;
      } else {
        const created = await curriculumService.createCurriculum(data);
        setCurriculumList((prev) => {
          // A new active curriculum joins the department's existing ones rather
          // than replacing them.
          const next = [created, ...prev];
          setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments, programs });
          return next;
        });
        invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
        toast.success('Success', 'Curriculum created successfully.');
        return created;
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error('Error', err?.response?.data?.message || 'Failed to save curriculum.');
      throw error;
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    let previousCurriculumList: Curriculum[] = [];
    setCurriculumList((prev) => {
      previousCurriculumList = prev;
      // Only the row that was clicked changes. Activating a curriculum used to
      // demote its department's other active one here, mirroring a backend rule
      // that no longer exists — a department may now run several at once.
      const next = prev.map((c) => (c.id === id ? { ...c, status: status as Curriculum['status'] } : c));
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments, programs });
      return next;
    });

    try {
      const updated = await curriculumService.updateStatus(id, status);
      setCurriculumList((prev) => {
        const next = prev.map((c) => (c.id === id ? updated : c));
        setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments, programs });
        return next;
      });
      invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
      // No refetch: one row changed, and annotateCurriculumLifecycle re-ranks
      // the new/old badges from the list already in state. Reloading the table
      // for this would replace it with a skeleton for a single-row edit.
      toast.success('Status Updated', `Curriculum status changed to ${status}.`);
    } catch (error: unknown) {
      setCurriculumList(previousCurriculumList);
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: previousCurriculumList, departments, programs });
      // The server refuses to retire a curriculum that cohorts still follow, and
      // its message names them. Show that instead of a generic failure.
      const err = error as { response?: { data?: { message?: string } } };
      toast.error('Error', err?.response?.data?.message || 'Failed to update curriculum status.');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const newCurriculum = await curriculumService.duplicateCurriculum(id);
      setCurriculumList((prev) => {
        const next = [newCurriculum, ...prev];
        setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments, programs });
        return next;
      });
      invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
      toast.success('Success', 'Curriculum duplicated. The copy is deactivated until you activate it.');
    } catch {
      toast.error('Error', 'Failed to duplicate curriculum.');
    }
  };

  const handleArchive = async (id: number) => {
    // Both views hide Archive while a curriculum is active, so this is only
    // reached for a deactivated one. The server is the real guard either way: it
    // refuses to retire a curriculum that cohorts still follow, and its message
    // names them — surfaced in the catch below.
    let previousCurriculumList: Curriculum[] = [];
    setCurriculumList((prev) => {
      previousCurriculumList = prev;
      const next = prev.map((c) => (c.id === id ? { ...c, status: 'archived' as const } : c));
        setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments, programs });
      return next;
    });

    try {
      await curriculumService.updateStatus(id, 'archived');
      invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
      // Announced only once the server has accepted it. Archiving can be
      // refused — a cohort may still follow this curriculum — and claiming
      // success first would be immediately contradicted by the error.
      toast.success('Archived', 'Curriculum has been archived.');
    } catch (error: unknown) {
      setCurriculumList(previousCurriculumList);
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: previousCurriculumList, departments, programs });
      const err = error as { response?: { data?: { message?: string } } };
      toast.error('Error', err?.response?.data?.message || 'Failed to archive curriculum.');
    }
  };

  return {
    curriculumList: filteredCurriculumList,
    // Unfiltered but still ranked, so the archive view badges rows the same way
    // the main table does.
    rawCurriculumList: annotatedCurriculumList,
    departments,
    isLoading,
    userRole,
    canManageCurriculum,
    programs,
    statusFilter,
    setStatusFilter,
    departmentFilter,
    setDepartmentFilter,
    searchQuery,
    setSearchQuery,
    fetchCurriculumList,
    handleCreateOrUpdate,
    handleStatusChange,
    handleDuplicate,
    handleArchive,
  };
}
