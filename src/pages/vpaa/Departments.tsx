import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import {
  Pencil, 
  Trash2, 
  Search, 
  AlertTriangle, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  X,
  Loader2,
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
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';
import api from '../../lib/api';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';

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

/**
 * The code is no longer typed in here — the logo took its place on this page.
 * It is still derived from the name and saved, because Faculty, Rooms,
 * Curriculum, the sidebar and the notification feed all label departments by
 * code. "College of Computing Studies" becomes CCS, the convention the seeded
 * departments already follow.
 */
const CODE_STOPWORDS = new Set(['of', 'and', 'the', 'for', 'in', 'a', 'an']);
const CODE_MAX_LENGTH = 20; // departments.department_code is validated max:20

const deriveDepartmentCode = (departmentName: string): string => {
  const words = departmentName.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const significant = words.filter(word => !CODE_STOPWORDS.has(word.toLowerCase()));
  const initials = (significant.length > 0 ? significant : words)
    .map(word => word[0])
    .join('')
    .toUpperCase();

  return initials.slice(0, CODE_MAX_LENGTH) || 'DEPT';
};

/** The derived code, or the first free variant of it: CCS, then CCS2, CCS3… */
const firstFreeDepartmentCode = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const suffixText = String(suffix);
    const candidate = `${base.slice(0, CODE_MAX_LENGTH - suffixText.length)}${suffixText}`;
    if (!taken.has(candidate)) return candidate;
  }

  return base;
};

interface Department {
  id: number;
  code: string;          // derived from the name, e.g. "CCS" — no longer user-editable
  name: string;          // e.g. "College of Computing Studies"
  dean: string | null;   // e.g. "Dr. Juan dela Cruz" or null
  facultyCount: number;  // number
  sectionsCount: number; // number
  logo?: string | null;
  schedulingProfile: 'standard' | 'laboratory_enabled';
  createdAt: string;     // ISO date string
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
}

interface DepartmentsPageData {
  departments: Department[];
}

/** The logo, or a department-tinted placeholder when none has been uploaded. */
function DepartmentLogo({
  name,
  logo,
  className,
  iconSize,
}: {
  name: string;
  logo?: string | null;
  className: string;
  iconSize: number;
}) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={`${name} logo`}
        className={`${className} rounded-full object-cover border border-gray-200 bg-white shadow-2xs shrink-0`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${name} — no logo uploaded`}
      title={`${name} — no logo uploaded`}
      className={`${className} rounded-full border flex items-center justify-center shrink-0 shadow-2xs ${getDepartmentColor(name || '').bg}`}
    >
      <Building2 size={iconSize} />
    </div>
  );
}

export default function Departments() {
  const { toast } = useToast();
  const departmentsCacheKey = 'page:departments';
  const cachedDepartmentsData = getCachedData<DepartmentsPageData>(departmentsCacheKey);
  const [departments, setDepartments] = useState<Department[]>(cachedDepartmentsData?.departments ?? []);
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
  const [editingName, setEditingName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [schedulingProfile, setSchedulingProfile] = useState<'standard' | 'laboratory_enabled'>('standard');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  });

  const fetchDepartments = async (forceRefresh = false) => {
    const cachedData = getCachedData<DepartmentsPageData>(departmentsCacheKey);

    if (!forceRefresh && cachedData && cachedData.departments.length > 0) {
      setDepartments(cachedData.departments);
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
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError('Department name is required');
      return;
    }

    if (trimmedName.length > 100) {
      setNameError('Department name must not exceed 100 characters');
      return;
    }

    setNameError('');
    setIsSubmitting(true);

    // Derive on create, and again on rename so the code keeps tracking the name.
    // A logo-only edit leaves it alone, so a hand-picked code (CED for College of
    // Education) is not quietly rewritten to CE.
    const needsCode = !isEditMode || trimmedName !== editingName;
    const baseCode = deriveDepartmentCode(trimmedName);
    const takenCodes = new Set(
      departments
        .filter(dept => dept.id !== editingId)
        .map(dept => (dept.code || '').toUpperCase())
        .filter(Boolean)
    );

    try {
      let saved: ApiDepartment | null = null;
      let lastError: unknown = null;

      // `unique:departments,department_code` also counts soft-deleted rows, so a
      // department deleted and re-added under the same name still clashes. The
      // code is not on the form any more, so there is nothing for the user to
      // correct — take the next free variant instead of dead-ending on a 422.
      for (let attempt = 0; attempt < 5 && saved === null; attempt += 1) {
        const departmentCode = firstFreeDepartmentCode(baseCode, takenCodes);
        const payload = {
          department_name: trimmedName,
          logo: logo,
          scheduling_profile: schedulingProfile,
          ...(needsCode ? { department_code: departmentCode } : {}),
        };

        try {
          const response = isEditMode && editingId !== null
            ? await api.patch<ApiDepartment>(`/departments/${editingId}`, payload)
            : await api.post<ApiDepartment>('/departments', payload);
          saved = response.data;
        } catch (err) {
          lastError = err;
          if (!needsCode || !apiFieldErrors(err).department_code) throw err;
          takenCodes.add(departmentCode);
        }
      }

      if (saved === null) throw lastError;
      const savedDepartment = saved;

      if (isEditMode && editingId !== null) {
        setDepartments(prev => {
          const nextDepartments = prev.map(dept =>
            dept.id === editingId ? mapDepartment(savedDepartment) : dept
          );
          setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
          return nextDepartments;
        });
        toast.success('Success', 'Department updated successfully');
      } else {
        setDepartments(prev => {
          const nextDepartments = [mapDepartment(savedDepartment), ...prev];
          setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
          return nextDepartments;
        });
        toast.success('Success', 'Department created successfully');
      }

      setName('');
      setEditingName('');
      setLogo(null);
      setSchedulingProfile('standard');
      setNameError('');
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingId(null);
    } catch (err) {
      toast.error('Error', apiErrorMessage(err, 'Failed to save department.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (dept: Department) => {
    setName(dept.name);
    setEditingName(dept.name);
    setLogo(dept.logo || null);
    setSchedulingProfile(dept.schedulingProfile);
    setEditingId(dept.id);
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

  // Define Columns for TanStack Table
  const columns = useMemo<ColumnDef<Department>[]>(
    () => [
      {
        accessorKey: 'logo',
        header: 'Logo',
        // A base64 data URI is meaningless to sort by and would match every
        // search term, so the column is display-only.
        enableSorting: false,
        enableGlobalFilter: false,
        cell: info => {
          const dept = info.row.original;
          return <DepartmentLogo name={dept.name} logo={dept.logo} className="w-9 h-9" iconSize={16} />;
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
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${profile === 'laboratory_enabled'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
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
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search department name..."
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
              setEditingName('');
              setLogo(null);
              setSchedulingProfile('standard');
              setNameError('');
              setIsModalOpen(true);
            }}
            className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
          >
            <Plus size={15} />
            <span>Add Department</span>
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        /* Grid View Cards */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-sm animate-pulse">
                  <div className="flex justify-between items-start">
                    <Skeleton className="h-11 w-11 rounded-full" />
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
                return (
                  <div
                    key={dept.id}
                    onClick={() => {
                      setSelectedDeptForDetail(dept);
                      setIsDetailModalOpen(true);
                    }}
                    className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md flex flex-col justify-between space-y-4 font-sans relative group cursor-pointer ${GRID_CARD_HOVER}`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <DepartmentLogo name={dept.name} logo={dept.logo} className="w-11 h-11" iconSize={20} />
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

                      <h3 className="text-base font-bold text-gray-900 leading-snug">
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="bg-gray-50/80 border-b border-gray-200">
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
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr 
                      key={`skeleton-row-${index}`} 
                      className={`h-12 border-b border-gray-100 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                      }`}
                    >
                      <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                        <Skeleton className="h-9 w-9 rounded-full" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs">
                        <Skeleton className="h-4 w-48" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs">
                        <Skeleton className="h-5 w-28 rounded-full" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs">
                        <Skeleton className="h-4 w-8 mx-auto" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs">
                        <Skeleton className="h-4 w-8 mx-auto" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-8 w-8 rounded-lg" />
                          <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-gray-400">
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
                        const isNoWrap = ['logo', 'createdAt', 'actions'].includes(cell.column.id);
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
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
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

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-gray-800 font-display">Delete Department</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Are you sure you want to delete this department? This action is permanent and cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteDepartment}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Department Detail Modal */}
      {isDetailModalOpen && selectedDeptForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative group animate-in zoom-in-95 duration-200 font-sans">
            {/* Header Banner */}
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <DepartmentLogo
                  name={selectedDeptForDetail.name}
                  logo={selectedDeptForDetail.logo}
                  className="w-10 h-10"
                  iconSize={20}
                />
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
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Scheduling Profile</p>
                  <p className="text-xs font-bold text-gray-800">
                    {selectedDeptForDetail.schedulingProfile === 'laboratory_enabled' ? 'Laboratory-enabled' : 'Standard'}
                  </p>
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
    </div>
  );
}
