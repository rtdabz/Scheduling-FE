import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { curriculumService } from '../../services/curriculum/curriculumService';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData, clearDataCache } from '../../lib/dataCache';
import type { Curriculum, Department } from '../../types/curriculum';

interface CurriculumPageData {
  curriculumList: Curriculum[];
  departments: Department[];
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
  const [isLoading, setIsLoading] = useState(!hasCachedData(curriculumCacheKey));

  // Role permissions
  const canManageCurriculum = useMemo(() => {
    return ['vpaa', 'dean', 'secretary', 'program_head'].includes(userRole);
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
            const [curriculumRes, deptsRes] = await Promise.all([
              curriculumService.getCurriculumList(userDeptId),
              api.get<Department[]>('/departments'),
            ]);
            return {
              curriculumList: curriculumRes,
              departments: deptsRes.data,
            };
          },
          forceRefresh
        );
        setCurriculumList(data.curriculumList);
        setDepartments(data.departments);
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

  const filteredCurriculumList = useMemo(() => {
    return curriculumList.filter((item) => {
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
  }, [curriculumList, statusFilter, departmentFilter, searchQuery]);

  const handleCreateOrUpdate = async (data: Partial<Curriculum>, editingCurriculum: Curriculum | null) => {
    try {
      if (editingCurriculum) {
        const updated = await curriculumService.updateCurriculum(editingCurriculum.id, data);
        setCurriculumList((prev) => {
          const next = prev.map((c) => {
            if (c.id === editingCurriculum.id) {
              return updated;
            }
            if (
              updated.status === 'active' &&
              c.department_id === updated.department_id &&
              c.status === 'active'
            ) {
              return { ...c, status: 'draft' as const };
            }
            return c;
          });
          setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments });
          return next;
        });
        clearDataCache();
        toast.success('Success', 'Curriculum updated successfully.');
      } else {
        const created = await curriculumService.createCurriculum(data);
        setCurriculumList((prev) => {
          const next = [created, ...prev].map((c) => {
            if (
              created.status === 'active' &&
              c.id !== created.id &&
              c.department_id === created.department_id &&
              c.status === 'active'
            ) {
              return { ...c, status: 'draft' as const };
            }
            return c;
          });
          setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments });
          return next;
        });
        clearDataCache();
        toast.success('Success', 'Curriculum created successfully.');
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
      const targetDeptId = prev.find((x) => x.id === id)?.department_id;
      const next = prev.map((c) => {
        if (c.id === id) {
          return { ...c, status: status as any };
        }
        if (
          status === 'active' &&
          c.department_id === targetDeptId &&
          c.status === 'active'
        ) {
          return { ...c, status: 'draft' as const };
        }
        return c;
      });
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments });
      return next;
    });

    toast.success(
      'Status Updated',
      `Curriculum status changed to ${status}.`
    );

    try {
      const updated = await curriculumService.updateStatus(id, status);
      setCurriculumList((prev) => {
        const next = prev.map((c) => {
          if (c.id === id) {
            return updated;
          }
          if (
            status === 'active' &&
            c.department_id === updated.department_id &&
            c.status === 'active'
          ) {
            return { ...c, status: 'draft' as const };
          }
          return c;
        });
        setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments });
        return next;
      });
      clearDataCache();
    } catch {
      setCurriculumList(previousCurriculumList);
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: previousCurriculumList, departments });
      toast.error('Error', 'Failed to update curriculum status.');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const newCurriculum = await curriculumService.duplicateCurriculum(id);
      setCurriculumList((prev) => {
        const next = [newCurriculum, ...prev];
        setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments });
        return next;
      });
      clearDataCache();
      toast.success('Success', 'Curriculum duplicated as draft.');
    } catch {
      toast.error('Error', 'Failed to duplicate curriculum.');
    }
  };

  const handleArchive = async (id: number) => {
    const target = curriculumList.find((c) => c.id === id);
    if (target && target.status === 'active') {
      toast.error('Error', 'Cannot archive an active curriculum. Please deactivate it first.');
      return;
    }

    let previousCurriculumList: Curriculum[] = [];
    setCurriculumList((prev) => {
      previousCurriculumList = prev;
      const next = prev.map((c) => (c.id === id ? { ...c, status: 'archived' as const } : c));
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: next, departments });
      return next;
    });

    toast.success('Archived', 'Curriculum has been archived.');

    try {
      await curriculumService.updateStatus(id, 'archived');
      clearDataCache();
    } catch (error: unknown) {
      setCurriculumList(previousCurriculumList);
      setCachedData<CurriculumPageData>(curriculumCacheKey, { curriculumList: previousCurriculumList, departments });
      const err = error as { response?: { data?: { message?: string } } };
      toast.error('Error', err?.response?.data?.message || 'Failed to archive curriculum.');
    }
  };

  return {
    curriculumList: filteredCurriculumList,
    rawCurriculumList: curriculumList,
    departments,
    isLoading,
    userRole,
    canManageCurriculum,
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
