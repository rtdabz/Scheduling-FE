import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { curriculumService } from '../../services/curriculum/curriculumService';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { getStoredUser, hasStoredCapability } from '../../lib/storedUser';
import { useLiveRefresh } from '../useLiveRefresh';
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
  const user = getStoredUser();
  const userRole = user?.role?.toLowerCase() || 'user';
  const userDeptId = user?.department_id ?? null;

  const curriculumCacheKey = `page:curriculum:${userRole}:${userDeptId ?? 'all'}:${user?.program_id ?? 'all'}`;
  const cachedData = getCachedData<CurriculumPageData>(curriculumCacheKey);

  const [curriculumList, setCurriculumList] = useState<Curriculum[]>(cachedData?.curriculumList ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedData?.departments ?? []);
  const [programs, setPrograms] = useState<Program[]>(cachedData?.programs ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(curriculumCacheKey));

  const canManageCurriculum = useMemo(() => hasStoredCapability('curriculum.manage'), []);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCurriculumList = useCallback(
    async (forceRefresh = false, silent = false) => {
      if (!silent) setIsLoading(forceRefresh || !hasCachedData(curriculumCacheKey));
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

  useLiveRefresh(['curriculum', 'courses', 'departments'], () => {
    void fetchCurriculumList(true, true);
  });

  const annotatedCurriculumList = useMemo(
    () => annotateCurriculumLifecycle(curriculumList),
    [curriculumList],
  );

  const filteredCurriculumList = useMemo(() => {
    return annotatedCurriculumList.filter((item) => {
      if (item.status === 'archived') return false;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchSearch =
        searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [annotatedCurriculumList, statusFilter, searchQuery]);

  const handleCreateOrUpdate = async (data: Partial<Curriculum>, editingCurriculum: Curriculum | null): Promise<Curriculum> => {
    try {
      if (editingCurriculum) {
        const updated = await curriculumService.updateCurriculum(editingCurriculum.id, data);
        setCurriculumList((prev) => {
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
      toast.success('Status Updated', `Curriculum status changed to ${status}.`);
    } catch (error: unknown) {
      setCurriculumList(previousCurriculumList);
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: previousCurriculumList, departments, programs });
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
    rawCurriculumList: annotatedCurriculumList,
    departments,
    isLoading,
    userRole,
    canManageCurriculum,
    programs,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    fetchCurriculumList,
    handleCreateOrUpdate,
    handleStatusChange,
    handleDuplicate,
    handleArchive,
  };
}
