import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { curriculumService } from '../../services/curriculum/curriculumService';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import type { Curriculum, Department } from '../../types/curriculum';

interface CurriculaPageData {
  curricula: Curriculum[];
  departments: Department[];
}

export function useCurriculum() {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userRole = user?.role?.toLowerCase() || 'user';
  const userDeptId = user?.department_id ?? null;

  const curriculaCacheKey = `page:curricula:${userRole}:${userDeptId ?? 'all'}`;
  const cachedData = getCachedData<CurriculaPageData>(curriculaCacheKey);

  const [curricula, setCurricula] = useState<Curriculum[]>(cachedData?.curricula ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedData?.departments ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(curriculaCacheKey));

  // Role permissions
  const canManageCurriculum = useMemo(() => {
    return ['vpaa', 'dean', 'secretary', 'program_head'].includes(userRole);
  }, [userRole]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCurricula = useCallback(
    async (forceRefresh = false) => {
      setIsLoading(forceRefresh || !hasCachedData(curriculaCacheKey));
      try {
        const data = await loadCachedData<CurriculaPageData>(
          curriculaCacheKey,
          async () => {
            const [curriculaRes, deptsRes] = await Promise.all([
              curriculumService.getCurricula(userDeptId),
              api.get<Department[]>('/departments'),
            ]);
            return {
              curricula: curriculaRes,
              departments: deptsRes.data,
            };
          },
          forceRefresh
        );
        setCurricula(data.curricula);
        setDepartments(data.departments);
      } catch {
        toast.error('Error', 'Failed to load curricula data.');
      } finally {
        setIsLoading(false);
      }
    },
    [curriculaCacheKey, userDeptId, toast]
  );

  useEffect(() => {
    fetchCurricula();
  }, [fetchCurricula]);

  const filteredCurricula = useMemo(() => {
    return curricula.filter((item) => {
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchDept =
        departmentFilter === 'all' || item.department_id?.toString() === departmentFilter;
      const matchSearch =
        searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchDept && matchSearch;
    });
  }, [curricula, statusFilter, departmentFilter, searchQuery]);

  const handleCreateOrUpdate = async (data: Partial<Curriculum>, editingCurriculum: Curriculum | null) => {
    try {
      if (editingCurriculum) {
        const updated = await curriculumService.updateCurriculum(editingCurriculum.id, data);
        setCurricula((prev) => {
          const next = prev.map((c) => (c.id === editingCurriculum.id ? updated : c));
          setCachedData<CurriculaPageData>(curriculaCacheKey, { curricula: next, departments });
          return next;
        });
        toast.success('Success', 'Curriculum updated successfully.');
      } else {
        const created = await curriculumService.createCurriculum(data);
        setCurricula((prev) => {
          const next = [created, ...prev];
          setCachedData<CurriculaPageData>(curriculaCacheKey, { curricula: next, departments });
          return next;
        });
        toast.success('Success', 'Curriculum created successfully.');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error('Error', err?.response?.data?.message || 'Failed to save curriculum.');
      throw error;
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      const updated = await curriculumService.updateStatus(id, status);
      setCurricula((prev) => {
        const next = prev.map((c) => (c.id === id ? updated : c));
        setCachedData<CurriculaPageData>(curriculaCacheKey, { curricula: next, departments });
        return next;
      });
      toast.success(
        'Status Updated',
        `Curriculum status changed to ${status}.`
      );
    } catch {
      toast.error('Error', 'Failed to update curriculum status.');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const newCurriculum = await curriculumService.duplicateCurriculum(id);
      setCurricula((prev) => {
        const next = [newCurriculum, ...prev];
        setCachedData<CurriculaPageData>(curriculaCacheKey, { curricula: next, departments });
        return next;
      });
      toast.success('Success', 'Curriculum duplicated as draft.');
    } catch {
      toast.error('Error', 'Failed to duplicate curriculum.');
    }
  };

  const handleArchive = async (id: number) => {
    try {
      await curriculumService.updateStatus(id, 'archived');
      setCurricula((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, status: 'archived' as const } : c));
        setCachedData<CurriculaPageData>(curriculaCacheKey, { curricula: next, departments });
        return next;
      });
      toast.success('Archived', 'Curriculum has been archived.');
    } catch {
      toast.error('Error', 'Failed to archive curriculum.');
    }
  };

  return {
    curricula: filteredCurricula,
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
    fetchCurricula,
    handleCreateOrUpdate,
    handleStatusChange,
    handleDuplicate,
    handleArchive,
  };
}
