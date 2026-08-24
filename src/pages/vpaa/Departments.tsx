import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import ConfirmModal from '../../components/ui/ConfirmModal';
import {
  Pencil, 
  Trash2, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  X,
  LayoutGrid,
  Building2,
  List,
  Users as UsersIcon,
  Layers,
  Plus,
  Camera
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';

const DEPARTMENT_COLORS: Record<string, { bg: string; modal: string }> = {
  'INFORMATION TECHNOLOGY':      { bg: 'bg-blue-100 border-blue-400 text-blue-900',          modal: 'bg-blue-600'    },
  'ARTS AND SCIENCE':            { bg: 'bg-red-100 border-red-400 text-red-900',             modal: 'bg-red-600'     },
  'HOSPITALITY MANAGEMENT':      { bg: 'bg-green-100 border-green-400 text-green-900',       modal: 'bg-green-500'   },
  'MIDWIFERY':                   { bg: 'bg-emerald-100 border-emerald-600 text-emerald-900', modal: 'bg-emerald-700' },
  'LIBRARY INFORMATION SCIENCE': { bg: 'bg-pink-100 border-pink-400 text-pink-900',          modal: 'bg-pink-500'    },
  'EDUCATION':                   { bg: 'bg-orange-100 border-orange-400 text-orange-900',    modal: 'bg-orange-500'  },
  'CRIMINAL JUSTICE':            { bg: 'bg-red-200 border-red-800 text-red-950',             modal: 'bg-red-900'     },
};

const getDepartmentColor = (name: string) => {
  const normalized = name.toUpperCase().trim();
  for (const key of Object.keys(DEPARTMENT_COLORS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return DEPARTMENT_COLORS[key];
    }
  }
  return { 
    bg: 'bg-[#C9952A]/10 border-[#C9952A]/20 text-[#C9952A]', 
    modal: 'bg-[#4e0a10] hover:bg-[#C9952A]' 
  };
};

interface Department {
  id: number;
  code: string;          // e.g. "CCS"
  name: string;          // e.g. "College of Computing Studies"
  dean: string | null;   // e.g. "Dr. Juan dela Cruz" or null
  facultyCount: number;  // number
  sectionsCount: number; // number
  logo?: string | null;
  schedulingProfile: 'standard' | 'laboratory_enabled';
  createdAt: string;     // ISO date string
  programs: Program[];
}

interface Program {
  id: number;
  department_id: number;
  cluster: string | null;
  code: string;
  name: string | null;
}

interface ApiDepartment {
  id: number;
  department_code: string;
  department_name: string;
  logo?: string | null;
  scheduling_profile?: 'standard' | 'laboratory_enabled';
  created_at: string;
  faculties_count?: number;
  sections_count?: number;
  users?: Array<{
    name?: string;
  }>;
  programs?: Program[];
}

interface DepartmentsPageData {
  departments: Department[];
}

export default function Departments() {
  const { toast } = useToast();
  const departmentsCacheKey = 'page:departments';
  const cachedDepartmentsData = getCachedData<DepartmentsPageData>(departmentsCacheKey);
  const [departments, setDepartments] = useState<Department[]>(
    (cachedDepartmentsData?.departments ?? []).map(department => ({ ...department, programs: department.programs ?? [] }))
  );
  const [isLoading, setIsLoading] = useState(!hasCachedData(departmentsCacheKey));
  
  // Table & View States
  const [globalFilter, setGlobalFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [schedulingProfile, setSchedulingProfile] = useState<'standard' | 'laboratory_enabled'>('standard');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid File', 'Please select a valid image file (JPEG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 300;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setLogo(dataUrl);
          }
        } catch (err) {
          console.error('Error processing logo:', err);
          toast.error('Error', 'Failed to process image');
        }
      };
      img.onerror = () => {
        toast.error('Error', 'Failed to load image file');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const [selectedDeptForDetail, setSelectedDeptForDetail] = useState<Department | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const mapDepartment = (department: ApiDepartment): Department => ({
    id: department.id,
    code: department.department_code,
    name: department.department_name,
    dean: department.users?.[0]?.name ?? null,
    facultyCount: department.faculties_count ?? 0,
    sectionsCount: department.sections_count ?? 0,
    logo: department.logo || null,
    schedulingProfile: department.scheduling_profile ?? 'standard',
    createdAt: department.created_at,
    programs: department.programs ?? [],
  });

  const fetchDepartments = async (forceRefresh = false) => {
    const cachedData = getCachedData<DepartmentsPageData>(departmentsCacheKey);

    if (!forceRefresh && cachedData && cachedData.departments.length > 0) {
      setDepartments(cachedData.departments.map(department => ({ ...department, programs: department.programs ?? [] })));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get<ApiDepartment[]>('/departments');
      const mappedDepartments = response.data.map(mapDepartment);
      setDepartments(mappedDepartments);
      setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: mappedDepartments });
    } catch {
      toast.error('Load Failed', 'Could not load departments from the database.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Input Validation
    let hasError = false;
    const trimmedCode = code.trim();
    const trimmedName = name.trim();

    if (!trimmedCode) {
      setCodeError('Department code is required');
      hasError = true;
    } else if (trimmedCode.length > 10) {
      setCodeError('Department code must not exceed 10 characters');
      hasError = true;
    } else {
      setCodeError('');
    }

    if (!trimmedName) {
      setNameError('Department name is required');
      hasError = true;
    } else if (trimmedName.length > 100) {
      setNameError('Department name must not exceed 100 characters');
      hasError = true;
    } else {
      setNameError('');
    }

    if (hasError) return;

    setIsSubmitting(true);

    try {
      const payload = {
        department_name: trimmedName,
        department_code: trimmedCode,
        logo: logo,
        scheduling_profile: schedulingProfile,
      };

      if (isEditMode && editingId !== null) {
        const response = await api.patch<ApiDepartment>(`/departments/${editingId}`, payload);
        setDepartments(prev => {
          const nextDepartments = prev.map(dept =>
            dept.id === editingId ? mapDepartment(response.data) : dept
          );
          setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
          return nextDepartments;
        });
        toast.success('Success', 'Department updated successfully');
      } else {
        const response = await api.post<ApiDepartment>('/departments', payload);
        const createdDepartment = mapDepartment(response.data);
        setDepartments(prev => {
          const nextDepartments = [createdDepartment, ...prev];
          setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
          return nextDepartments;
        });
        setSelectedDeptForDetail(createdDepartment);
        setIsDetailModalOpen(true);
        toast.success('Success', 'Department created successfully');
      }

      setName('');
      setCode('');
      setLogo(null);
      setSchedulingProfile('standard');
      setCodeError('');
      setNameError('');
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingId(null);
    } catch {
      toast.error('Error', 'Failed to save department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (dept: Department) => {
    setName(dept.name);
    setCode(dept.code);
    setLogo(dept.logo || null);
    setSchedulingProfile(dept.schedulingProfile);
    setEditingId(dept.id);
    setCodeError('');
    setNameError('');
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteDepartment = async () => {
    if (idToDelete !== null) {
      try {
        await api.delete(`/departments/${idToDelete}`);
        setDepartments(prev => {
          const nextDepartments = prev.filter(dept => dept.id !== idToDelete);
          setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
          return nextDepartments;
        });
        toast.success('Deleted', 'Department removed');
        setIsDeleteModalOpen(false);
        setIdToDelete(null);
      } catch {
        toast.error('Delete Failed', 'Could not delete the department.');
      }
    }
  };

  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [programDepartment, setProgramDepartment] = useState<Department | null>(null);
  const [programEditingId, setProgramEditingId] = useState<number | null>(null);
  const [programCluster, setProgramCluster] = useState('');
  const [programCode, setProgramCode] = useState('');
  const [programName, setProgramName] = useState('');
  const [isProgramSubmitting, setIsProgramSubmitting] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<{ department: Department; program: Program } | null>(null);

  const openProgramModal = (department: Department, program?: Program) => {
    setProgramDepartment(department);
    setProgramEditingId(program?.id ?? null);
    setProgramCluster(program?.cluster ?? '');
    setProgramCode(program?.code ?? '');
    setProgramName(program?.name ?? '');
    setIsProgramModalOpen(true);
  };

  const submitProgram = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!programDepartment || !programCode.trim()) return;
    setIsProgramSubmitting(true);
    try {
      const payload = { department_id: programDepartment.id, cluster: programCluster.trim() || null, code: programCode.trim(), name: programName.trim() || null };
      const response = programEditingId
        ? await api.patch<{ data: Program }>(`/programs/${programEditingId}`, payload)
        : await api.post<{ data: Program }>('/programs', payload);
      const saved = response.data.data;
      const nextDepartments = departments.map(department => department.id !== programDepartment.id ? department : {
        ...department,
        programs: programEditingId
          ? department.programs.map(program => program.id === saved.id ? saved : program)
          : [...department.programs, saved].sort((a, b) => (a.cluster ?? '').localeCompare(b.cluster ?? '') || a.code.localeCompare(b.code)),
      });
      setDepartments(nextDepartments);
      setSelectedDeptForDetail(nextDepartments.find(department => department.id === programDepartment.id) ?? null);
      setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
      toast.success('Success', programEditingId ? 'Program updated successfully.' : 'Program added successfully.');
      setIsProgramModalOpen(false);
    } catch (error) {
      toast.error('Error', apiErrorMessage(error, 'Failed to save program.'));
    } finally {
      setIsProgramSubmitting(false);
    }
  };

  const deleteProgram = async () => {
    if (!programToDelete) return;
    const { department, program } = programToDelete;
    setProgramToDelete(null);

    try {
      await api.delete(`/programs/${program.id}`);
      const nextDepartments = departments.map(item => item.id === department.id ? { ...item, programs: item.programs.filter(value => value.id !== program.id) } : item);
      setDepartments(nextDepartments);
      setSelectedDeptForDetail(nextDepartments.find(item => item.id === department.id) ?? null);
      setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
      toast.success('Deleted', 'Program removed.');
    } catch (error) {
      toast.error('Delete Failed', apiErrorMessage(error, 'Could not delete the program.'));
    }
  };

  // Define Columns for TanStack Table
  const columns = useMemo<ColumnDef<Department>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: info => {
          const dept = info.row.original;
          const colors = getDepartmentColor(dept.name || '');
          return (
            <div className="flex items-center gap-2.5">
              {dept.logo ? (
                <img src={dept.logo} alt={dept.name} className="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-2xs shrink-0" />
              ) : null}
              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border ${colors.bg}`}>
                {info.getValue() as string}
              </span>
            </div>
          );
        }
      },
      {
        accessorKey: 'name',
        header: 'Department Name',
        cell: info => <span className="font-bold text-gray-800 group-hover:text-[#C9952A] transition-colors">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'schedulingProfile',
        header: 'Scheduling Profile',
        cell: info => {
          const profile = info.getValue() as Department['schedulingProfile'];
          return (
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border bg-transparent ${profile === 'laboratory_enabled'
              ? 'border-amber-200 text-amber-800'
              : 'border-slate-200 text-slate-700'}`}>
              {profile === 'laboratory_enabled' ? 'Laboratory-enabled' : 'Standard'}
            </span>
          );
        },
      },
      {
        accessorKey: 'dean',
        header: 'Dean',
        cell: info => {
          const val = info.getValue();
          return <span>{val ? (val as string) : '—'}</span>;
        }
      },
      {
        id: 'programs',
        header: 'Programs',
        enableSorting: false,
        cell: ({ row }) => {
          const programs = row.original.programs ?? [];
          if (programs.length === 0) {
            return <span className="text-gray-400">—</span>;
          }

          const visiblePrograms = programs.slice(0, 3);
          const remainingCount = programs.length - visiblePrograms.length;

          return (
            <div className="flex max-w-[190px] flex-wrap items-center gap-1.5">
              {visiblePrograms.map(program => (
                <span
                  key={program.id}
                  title={`${program.cluster ? `${program.cluster}: ` : ''}${program.name || program.code}`}
                  className="rounded-md border border-[#5A1220]/15 bg-[#5A1220]/5 px-2 py-0.5 text-[10px] font-bold font-mono text-[#5A1220]"
                >
                  {program.code}
                </span>
              ))}
              {remainingCount > 0 && (
                <span className="text-[10px] font-semibold text-gray-500">+{remainingCount} more</span>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'facultyCount',
        header: () => <div className="text-center">Faculty Count</div>,
        cell: info => <div className="text-center text-sm font-semibold text-gray-700">{info.getValue() as number}</div>
      },
      {
        accessorKey: 'sectionsCount',
        header: () => <div className="text-center">Sections Count</div>,
        cell: info => <div className="text-center text-sm font-semibold text-gray-700">{info.getValue() as number}</div>
      },
      {
        accessorKey: 'createdAt',
        header: 'Created At',
        cell: info => {
          const val = info.getValue() as string;
          if (!val) return '—';
          try {
            const date = new Date(val);
            return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          } catch {
            return '—';
          }
        }
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <div className="relative group/tooltip">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDeptForDetail(row.original);
                  setIsDetailModalOpen(true);
                }}
                className="p-2 text-[#5A1220] hover:bg-[#5A1220]/10 rounded-lg transition-colors cursor-pointer"
                aria-label="Manage programs"
              >
                <Layers size={17} />
              </button>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                Manage Programs
              </span>
            </div>
            {/* Edit Button */}
            <div className="relative group/tooltip">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick(row.original);
                }}
                className="p-2 text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
              >
                <Pencil size={17} />
              </button>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                Edit
              </span>
            </div>
            {/* Delete Button */}
            <div className="relative group/tooltip">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  triggerDeleteConfirmation(row.original.id);
                }}
                className="p-2 text-red-500 hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 size={17} />
              </button>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                Delete
              </span>
            </div>
          </div>
        )
      }
    ],
    [departments]
  );

  // TanStack Table Instance
  const table = useReactTable<Department>({
    data: departments,
    columns,
    state: {
      globalFilter,
      sorting,
      pagination,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      {/* Search and Actions Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between mb-6">
        {isLoading ? (
          <>
            <Skeleton className="h-[42px] w-full max-w-sm rounded-xl" />
            <div className="flex items-center gap-3 justify-end ml-auto lg:ml-0">
              <Skeleton className="h-[42px] w-[82px] rounded-xl" />
              <Skeleton className="h-[42px] w-[156px] rounded-xl" />
            </div>
          </>
        ) : (
          <>
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search department name or code..."
                className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] bg-gray-50/30 focus:bg-white transition-all font-sans font-semibold text-gray-800"
              />
            </div>

            {/* Action Group: View Mode Toggle + Add Department */}
            <div className="flex items-center gap-3 justify-end ml-auto lg:ml-0">
              {/* View Mode Toggle (Grid / List) */}
              <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-[#5A1220] text-white shadow-sm font-bold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-[#5A1220] text-white shadow-sm font-bold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  title="List View"
                >
                  <List size={15} />
                </button>
              </div>

              <button
                onClick={() => {
                  setIsEditMode(false);
                  setEditingId(null);
                  setName('');
                  setCode('');
                  setLogo(null);
                  setSchedulingProfile('standard');
                  setCodeError('');
                  setNameError('');
                  setIsModalOpen(true);
                }}
                className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
              >
                <Plus size={15} />
                <span>Add Department</span>
              </button>
            </div>
          </>
        )}
      </div>

      {viewMode === 'grid' ? (
        /* Grid View Cards */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-sm animate-pulse">
                  <div className="flex justify-between items-start">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-8 w-16 rounded-lg" />
                  </div>
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-32" />
                  <div className="pt-4 border-t border-gray-100 flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <div className="col-span-full py-16 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-white">
                <p className="text-base font-semibold font-sans">No departments found.</p>
                <p className="text-xs font-sans">Try adjusting search parameters or add a new record.</p>
              </div>
            ) : (
              table.getRowModel().rows.map(row => {
                const dept = row.original;
                const colors = getDepartmentColor(dept.name);
                return (
                  <div
                    key={dept.id}
                    onClick={() => {
                      setSelectedDeptForDetail(dept);
                      setIsDetailModalOpen(true);
                    }}
                    className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 font-sans relative group cursor-pointer hover:border-[#C9952A]/40"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2.5">
                          {dept.logo && (
                            <img src={dept.logo} alt={dept.name} className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-2xs shrink-0" />
                          )}
                          <span className={`px-3 py-1 text-xs font-extrabold rounded-full border shadow-2xs ${colors.bg}`}>
                            {dept.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(dept);
                            }}
                            className="p-1.5 text-gray-400 hover:text-[#C9952A] hover:bg-amber-50 rounded-lg transition-all cursor-pointer"
                            title="Edit Department"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerDeleteConfirmation(dept.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                            title="Delete Department"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-gray-900 leading-snug group-hover:text-[#5A1220] transition-colors">
                        {dept.name}
                      </h3>
                      <p className="text-xs font-medium text-gray-500 mt-1">
                        Dean: <span className="font-semibold text-gray-700">{dept.dean || 'Not assigned'}</span>
                      </p>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 font-semibold">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5" title="Instructors">
                          <UsersIcon size={14} className="text-gray-400" />
                          <span>{dept.facultyCount} Faculty</span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Sections">
                          <Layers size={14} className="text-gray-400" />
                          <span>{dept.sectionsCount} Sections</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Section for Grid View */}
          {table.getFilteredRowModel().rows.length > 0 && (
            <div className="px-6 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="text-xs font-semibold text-gray-500">
                  Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                    table.getFilteredRowModel().rows.length
                  )} of {table.getFilteredRowModel().rows.length} departments
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-semibold">Show</span>
                  <select
                    value={table.getState().pagination.pageSize}
                    onChange={e => {
                      table.setPageSize(Number(e.target.value));
                    }}
                    className="text-xs border border-gray-200 rounded-lg p-1 bg-white outline-none focus:ring-1 focus:ring-[#C9952A]"
                  >
                    {[10, 25, 50].map(pageSize => (
                      <option key={pageSize} value={pageSize}>
                        {pageSize}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  First
                </button>
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  Prev
                </button>
                <span className="text-xs font-bold text-gray-500 px-1">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
                </span>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  Next
                </button>
                <button
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Table Section */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="bg-gray-50/75 border-b border-gray-100">
                    {headerGroup.headers.map(header => (
                      <th 
                        key={header.id} 
                        className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-gray-500 select-none"
                      >
                        {header.isPlaceholder ? null : (
                          <div className="flex items-center">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <button
                                onClick={header.column.getToggleSortingHandler()}
                                className="ml-1.5 text-gray-400 hover:text-gray-600 inline-flex items-center cursor-pointer"
                              >
                                {header.column.getIsSorted() === 'asc' ? (
                                  <ArrowUp size={13} className="text-[#C9952A]" />
                                ) : header.column.getIsSorted() === 'desc' ? (
                                  <ArrowDown size={13} className="text-[#C9952A]" />
                                ) : (
                                  <ArrowUpDown size={13} />
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <tr 
                      key={`skeleton-row-${index}`} 
                      className={`h-12 border-b border-gray-100 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                      }`}
                    >
                      <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <Skeleton className="h-6 w-12 rounded-full" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <Skeleton className="h-4 w-44" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex max-w-[190px] flex-wrap gap-1.5">
                          <Skeleton className="h-5 w-20 rounded-md" />
                          <Skeleton className="h-5 w-20 rounded-md" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-center">
                        <Skeleton className="h-4 w-8 mx-auto" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-center">
                        <Skeleton className="h-4 w-8 mx-auto" />
                      </td>
                      <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-4 py-2.5 align-middle whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1.5">
                          <Skeleton className="h-8 w-8 rounded-lg" />
                          <Skeleton className="h-8 w-8 rounded-lg" />
                          <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-16 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="text-base font-semibold">No departments found.</p>
                        <p className="text-xs">Try adjusting your search criteria or add a new department.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row, index) => (
                    <tr 
                      key={row.id} 
                      onClick={() => {
                        setSelectedDeptForDetail(row.original);
                        setIsDetailModalOpen(true);
                      }}
                      className={`group hover:bg-[#5A1220]/5 transition-all duration-200 cursor-pointer ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                      }`}
                    >
                      {row.getVisibleCells().map((cell, cellIdx) => {
                        const isNoWrap = ['code', 'createdAt', 'actions'].includes(cell.column.id);
                        return (
                          <td 
                            key={cell.id} 
                            className={`px-4 py-2.5 align-middle text-xs ${
                              isNoWrap ? 'whitespace-nowrap' : ''
                            } ${cellIdx === 0 ? 'border-l-4 border-l-transparent group-hover:border-l-[#C9952A] transition-all' : ''}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        {/* Pagination Section */}
        {table.getFilteredRowModel().rows.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/30">
            <div className="flex items-center gap-4">
              <div className="text-xs font-semibold text-gray-500">
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length
                )} of {table.getFilteredRowModel().rows.length} departments
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-semibold">Show</span>
                <select
                  value={table.getState().pagination.pageSize}
                  onChange={e => {
                    table.setPageSize(Number(e.target.value));
                  }}
                  className="text-xs border border-gray-200 rounded-lg p-1 bg-white outline-none focus:ring-1 focus:ring-[#C9952A]"
                >
                  {[10, 25, 50].map(pageSize => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                First
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                Prev
              </button>
              <span className="text-xs font-bold text-gray-500 px-1">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                Next
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50 relative overflow-hidden">
              <h2 className="text-lg font-bold text-[#1A1410] font-display">
                {isEditMode ? 'Edit Department' : 'Add New Department'}
              </h2>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)} 
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors relative z-10"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
              {/* Photo / Logo Upload Picker */}
              <div className="flex flex-col items-center justify-center space-y-2 pb-2 border-b border-gray-200/80">
                <div className="relative">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 hover:border-[#5A1220] bg-white shadow-sm overflow-hidden flex items-center justify-center transition-all cursor-pointer relative"
                    title="Click to upload department logo"
                  >
                    {logo ? (
                      <img src={logo} alt="Department Logo Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 hover:text-[#5A1220] transition-colors">
                        <Camera size={26} />
                        <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">Upload</span>
                      </div>
                    )}
                  </div>
                  {logo && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLogo(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md transition-transform hover:scale-110 cursor-pointer"
                      title="Remove Logo"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                  className="hidden"
                />
                <p className="text-[10px] font-semibold text-gray-500 font-sans">
                  {logo ? 'Click logo to change' : 'Click to upload department logo'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Department Code <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setCodeError('');
                  }}
                  placeholder="e.g. CCS"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                    codeError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {codeError && <p className="text-xs text-red-500 mt-1 font-semibold">{codeError}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError('');
                  }}
                  placeholder="e.g. College of Computing Studies"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                    nameError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {nameError && <p className="text-xs text-red-500 mt-1 font-semibold">{nameError}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Scheduling Profile
                </label>
                <select
                  value={schedulingProfile}
                  onChange={(event) => setSchedulingProfile(event.target.value as 'standard' | 'laboratory_enabled')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white transition-all"
                >
                  <option value="standard">Standard</option>
                  <option value="laboratory_enabled">Laboratory-enabled</option>
                </select>
                <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
                  Choose Laboratory-enabled for departments whose active curriculum contains laboratory courses.
                </p>
              </div>
              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4e0a10] hover:bg-[#C9952A] text-white rounded-xl transition-colors disabled:opacity-50 text-sm font-semibold cursor-pointer"
                >
                  {isSubmitting && <LoadingSpinner size={16} className="animate-spin" />}
                  {isSubmitting 
                    ? (isEditMode ? 'Saving...' : 'Creating...') 
                    : (isEditMode ? 'Save Changes' : 'Create Department')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <ConfirmModal isOpen={isDeleteModalOpen} eyebrow="Permanent Action" title="Delete Department" message="Are you sure you want to delete this department? This action is permanent and cannot be undone." confirmLabel="Delete" variant="danger" onCancel={() => setIsDeleteModalOpen(false)} onConfirm={confirmDeleteDepartment} />
      {/* Department Detail Modal */}
      {isDetailModalOpen && selectedDeptForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl max-w-lg max-h-[90vh] w-full overflow-y-auto shadow-2xl relative group animate-in zoom-in-95 duration-200 font-sans">
            {/* Header Banner */}
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                {selectedDeptForDetail.logo ? (
                  <img
                    src={selectedDeptForDetail.logo}
                    alt={selectedDeptForDetail.name}
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-2xs shrink-0 bg-white"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4e0a10] to-[#C9952A] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                    <Building2 size={20} />
                  </div>
                )}
                <div>
                  <h2 className="text-base font-bold text-[#1A1410] font-display break-words leading-tight">{selectedDeptForDetail.name}</h2>
                  <p className="text-xs text-gray-500 font-medium">Dean: {selectedDeptForDetail.dean || 'Not Assigned'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Faculty Count</p>
                  <p className="text-xs font-bold text-gray-800">{selectedDeptForDetail.facultyCount ?? 0} Instructors</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Sections Count</p>
                  <p className="text-xs font-bold text-gray-800">{selectedDeptForDetail.sectionsCount ?? 0} Sections</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Department Code</p>
                  <p className="text-xs font-mono font-bold text-gray-800">{selectedDeptForDetail.code}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Date Created</p>
                  <p className="text-xs font-bold text-gray-700">
                    {selectedDeptForDetail.createdAt
                      ? new Date(selectedDeptForDetail.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200/80 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Programs and Majors</h3>
                  <button
                    type="button"
                    onClick={() => openProgramModal(selectedDeptForDetail)}
                    className="px-3 py-1.5 rounded-lg bg-[#5A1220] text-white text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <Plus size={13} /> Add Program
                  </button>
                </div>
                {(selectedDeptForDetail.programs ?? []).length === 0 ? (
                  <p className="text-xs text-gray-500">No programs have been added.</p>
                ) : (
                  <div className="space-y-3">
                    {Array.from(new Set((selectedDeptForDetail.programs ?? []).map(program => program.cluster || 'Other'))).map(cluster => (
                      <div key={cluster}>
                        <p className="text-[11px] font-bold text-[#5A1220] mb-1">{cluster}</p>
                        <div className="space-y-1">
                          {(selectedDeptForDetail.programs ?? []).filter(program => (program.cluster || 'Other') === cluster).map(program => (
                            <div key={program.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-800">{program.name || program.cluster || program.code}</p>
                                <p className="text-[10px] font-mono text-gray-500">{program.code}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => openProgramModal(selectedDeptForDetail, program)} className="p-1.5 text-gray-400 hover:text-[#C9952A]" title="Edit program"><Pencil size={13} /></button>
                                <button type="button" onClick={() => setProgramToDelete({ department: selectedDeptForDetail, program })} className="p-1.5 text-gray-400 hover:text-red-500" title="Delete program"><Trash2 size={13} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-200/80 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleEditClick(selectedDeptForDetail);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#5A1220] hover:bg-[#410b15] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Pencil size={14} />
                  <span>Edit Department</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isProgramModalOpen && programDepartment && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-[#F7F4F0] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1A1410]">{programEditingId ? 'Edit Program' : 'Add Program'}</h2>
              <button type="button" onClick={() => setIsProgramModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <form onSubmit={submitProgram} className="p-6 space-y-4">
              <p className="text-xs text-gray-500">Department: <strong>{programDepartment.name}</strong></p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Cluster / Degree</label>
                <input value={programCluster} onChange={event => setProgramCluster(event.target.value)} placeholder="e.g. BSEd" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Program Code *</label>
                <input required value={programCode} onChange={event => setProgramCode(event.target.value.toUpperCase())} placeholder="e.g. BSED-ENG" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Program / Major Name <span className="normal-case font-semibold text-gray-400">(optional)</span></label>
                <input value={programName} onChange={event => setProgramName(event.target.value)} placeholder="e.g. Major in English" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsProgramModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={isProgramSubmitting} className="flex-1 px-4 py-2.5 bg-[#4e0a10] text-white rounded-xl text-sm font-semibold disabled:opacity-50">{isProgramSubmitting ? 'Saving...' : 'Save Program'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      <ConfirmModal
        isOpen={programToDelete !== null}
        eyebrow="Permanent Action"
        title="Delete Program or Major"
        message={`Are you sure you want to delete "${programToDelete?.program.name ?? ''}"?\n\nThis action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setProgramToDelete(null)}
        onConfirm={() => { void deleteProgram(); }}
      />
    </div>
  );
}
import LoadingSpinner from "../../components/ui/LoadingSpinner";
