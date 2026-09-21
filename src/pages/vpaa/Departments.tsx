import { formatPhilippineDate } from '../../lib/philippineTime';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import SharedDepartmentLogo from '../../components/ui/DepartmentLogo';
import DataTable from '../../components/ui/DataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import {
  Pencil,
  Trash2,
  Search,
  X,
  Loader2,
  LayoutGrid,
  List,
  Users as UsersIcon,
  Layers,
  Plus,
  Camera,
  LibraryBig,
  Eye,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';
import api from '../../lib/api';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import { programLabel, programMajorLabel } from '../../lib/programLabel';

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
  secretary: string | null;
  programHeads: string[];
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
  major?: string | null;
  code: string;
  name?: string | null;
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
    role?: string;
  }>;
  programs?: Program[];
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
  return <SharedDepartmentLogo name={name} logo={logo} className={className} iconSize={iconSize} fallbackClassName={getDepartmentColor(name || '').bg} />;
}

export default function Departments() {
  const { toast, confirm } = useToast();
  const departmentsCacheKey = 'page:departments:v2';
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
  
  // Form state
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [schedulingProfile, setSchedulingProfile] = useState<'standard' | 'laboratory_enabled'>('standard');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  const [newProgram, setNewProgram] = useState({ major: '', code: '', name: '' });
  const [programFormError, setProgramFormError] = useState('');
  const [isSavingProgram, setIsSavingProgram] = useState(false);

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
  const [showProgramForm, setShowProgramForm] = useState(false);
  /** Null while the form is adding a program; the program's id while editing one. */
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);

  const closeProgramForm = () => {
    setShowProgramForm(false);
    setEditingProgramId(null);
    setNewProgram({ major: '', code: '', name: '' });
    setProgramFormError('');
  };

  const openProgramCreateForm = () => {
    setEditingProgramId(null);
    setNewProgram({ major: '', code: '', name: '' });
    setProgramFormError('');
    setShowProgramForm(true);
  };

  const openProgramEditForm = (program: Program) => {
    setEditingProgramId(program.id);
    setNewProgram({ code: program.code, name: program.name ?? '', major: program.major ?? '' });
    setProgramFormError('');
    setShowProgramForm(true);
  };

  const openDepartmentDetail = (department: Department) => {
    setSelectedDeptForDetail(department);
    closeProgramForm();
    setIsDetailModalOpen(true);
  };

  const openAddProgram = (department: Department) => {
    // Reuse the department detail form so the new program is always linked to
    // the department represented by the row action.
    openDepartmentDetail(department);
    setShowProgramForm(true);
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  useLiveRefresh(['departments', 'faculty', 'users'], () => { void fetchDepartments(true, true); });

  const mapDepartment = (department: ApiDepartment): Department => ({
    id: department.id,
    code: department.department_code,
    name: department.department_name,
    dean: department.users?.find((user) => user.role === 'dean')?.name ?? department.users?.[0]?.name ?? null,
    secretary: department.users?.find((user) => user.role === 'secretary')?.name ?? null,
    programHeads: department.users?.filter((user) => user.role === 'program_head').map((user) => user.name || '') ?? [],
    facultyCount: department.faculties_count ?? 0,
    sectionsCount: department.sections_count ?? 0,
    logo: department.logo || null,
    schedulingProfile: department.scheduling_profile ?? 'standard',
    createdAt: department.created_at,
    programs: department.programs ?? [],
  });

  /**
   * Adds a program, or saves the one being edited. Both paths land in the same
   * place -- the department's directory, re-sorted -- so they share a handler
   * rather than drifting apart over the cache and the detail copy.
   */
  const saveProgram = async () => {
    if (!selectedDeptForDetail) return;

    const code = newProgram.code.trim();
    const name = newProgram.name.trim();
    const major = newProgram.major.trim();
    if (!code || !name) {
      setProgramFormError('Program code and name are required.');
      return;
    }

    setIsSavingProgram(true);
    setProgramFormError('');
    try {
      const saved = editingProgramId === null
        ? (await api.post<{ data: Program }>('/programs', {
          department_id: selectedDeptForDetail.id,
          code,
          name,
          major,
        })).data.data
        : (await api.patch<{ data: Program }>(`/programs/${editingProgramId}`, {
          code,
          name,
          major,
        })).data.data;

      const withoutSaved = selectedDeptForDetail.programs.filter((program) => program.id !== saved.id);
      const nextPrograms = [...withoutSaved, saved].sort((first, second) =>
        first.code.localeCompare(second.code) || (first.major ?? '').localeCompare(second.major ?? '')
      );

      setDepartments((previousDepartments) => {
        const nextDepartments = previousDepartments.map((department) =>
          department.id === selectedDeptForDetail.id ? { ...department, programs: nextPrograms } : department
        );
        setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
        return nextDepartments;
      });
      setSelectedDeptForDetail({ ...selectedDeptForDetail, programs: nextPrograms });

      if (editingProgramId === null) {
        setNewProgram({ major: '', code: '', name: '' });
        toast.success('Program Added', 'The program is now available under this department.');
      } else {
        closeProgramForm();
        toast.success('Program Updated', 'The program now reads the same everywhere it appears.');
      }
    } catch (error) {
      setProgramFormError(apiErrorMessage(error, 'Failed to save program.'));
    } finally {
      setIsSavingProgram(false);
    }
  };

  // Code and name are what make a program readable in every other screen, so the
  // form refuses to submit without them; the major stays genuinely optional.
  const canSubmitProgram = newProgram.code.trim() !== '' && newProgram.name.trim() !== '';

  // The major changes what the program is called everywhere else, so the form
  // shows the resulting label before it is saved.
  const programPreview = programLabel(
    { code: newProgram.code.trim(), name: newProgram.name.trim(), major: newProgram.major.trim() },
    'Unnamed program'
  );

  const handleProgramFormKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    if (!isSavingProgram && canSubmitProgram) void saveProgram();
  };

  const fetchDepartments = async (forceRefresh = false, silent = false) => {
    const cachedData = getCachedData<DepartmentsPageData>(departmentsCacheKey);

    if (!forceRefresh && cachedData && cachedData.departments.length > 0) {
      setDepartments(cachedData.departments);
      setIsLoading(false);
      return;
    }

    if (!silent) setIsLoading(true);
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

  const triggerDeleteConfirmation = async (id: number) => {
    const confirmed = await confirm({
      title: 'Archive Department',
      message: 'This department will be hidden from active lists and can be restored from the Archive.',
      eyebrow: 'Archive Record',
      confirmLabel: 'Confirm Archive',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/departments/${id}`);
      setDepartments(prev => {
        const nextDepartments = prev.filter(dept => dept.id !== id);
        setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
        return nextDepartments;
      });
      toast.success('Archived', 'Department moved to the Archive');
    } catch {
      toast.error('Archive Failed', 'Could not archive the department.');
    }
  };

  // Define Columns for TanStack Table
  const columns = useMemo<ColumnDef<Department>[]>(
    () => [
      {
        accessorKey: 'logo',
        header: 'Logo',
        // A base64 data URI is meaningless to sort by and would match every
        // search semester, so the column is display-only.
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
        cell: info => <span className="font-bold text-gray-800">{info.getValue() as string}</span>
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
            return formatPhilippineDate(val, { month: 'short', day: '2-digit', year: 'numeric' });
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
              <TableActionButton
                label="View Details"
                variant="view"
                onClick={(e) => {
                  e.stopPropagation();
                  openDepartmentDetail(row.original);
                }}
              >
                <Eye size={17} />
              </TableActionButton>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                View Details
              </span>
            </div>
            <div className="relative group/tooltip">
              <TableActionButton
                label="Add Program"
                variant="success"
                onClick={(e) => {
                  e.stopPropagation();
                  openAddProgram(row.original);
                }}
              >
                <span className="relative inline-flex items-center justify-center">
                  <LibraryBig size={17} />
                  <Plus size={9} strokeWidth={3} className="absolute -right-1.5 -bottom-1.5 rounded-full bg-green-50" />
                </span>
              </TableActionButton>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                Add Program
              </span>
            </div>
            {/* Edit Button */}
            <div className="relative group/tooltip">
              <TableActionButton
                label="Edit"
                variant="edit"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick(row.original);
                }}
              >
                <Pencil size={17} />
              </TableActionButton>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                Edit
              </span>
            </div>
            {/* Delete Button */}
            <div className="relative group/tooltip">
              <TableActionButton
                label="Archive"
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  void triggerDeleteConfirmation(row.original.id);
                }}
              >
                <Trash2 size={17} />
              </TableActionButton>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                Archive
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
    <div id="departments-page">
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
                    onClick={() => openDepartmentDetail(dept)}
                    className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md flex flex-col justify-between space-y-4 font-sans relative group cursor-pointer ${GRID_CARD_HOVER}`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <DepartmentLogo name={dept.name} logo={dept.logo} className="w-11 h-11" iconSize={20} />
                        <div className="flex items-center gap-1.5">
                          <TableActionButton
                            label="Add Program"
                            variant="success"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAddProgram(dept);
                            }}
                          >
                            <span className="relative inline-flex items-center justify-center">
                              <LibraryBig size={15} />
                              <Plus size={8} strokeWidth={3} className="absolute -right-1.5 -bottom-1.5 rounded-full bg-green-50" />
                            </span>
                          </TableActionButton>
                          <TableActionButton
                            label="Edit Department"
                            variant="edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(dept);
                            }}
                          >
                            <Pencil size={15} />
                          </TableActionButton>
                          <TableActionButton
                            label="Archive Department"
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              void triggerDeleteConfirmation(dept.id);
                            }}
                          >
                            <Trash2 size={15} />
                          </TableActionButton>
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
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="departments"
          ariaLabel="Departments"
          emptyTitle="No departments found."
          emptyDescription="Try adjusting your search criteria or add a new department."
          onRowClick={(dept) => {
            setSelectedDeptForDetail(dept);
            setIsDetailModalOpen(true);
          }}
          cellClassName={(columnId) => (['logo', 'createdAt', 'actions'].includes(columnId) ? 'whitespace-nowrap' : '')}
        />
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex max-h-[calc(100dvh-2rem)] flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 flex shrink-0 justify-between items-center bg-[#4e0a10] relative overflow-hidden">
              <h2 className="text-lg font-bold text-white font-display">
                {isEditMode ? 'Edit Department' : 'Add New Department'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer relative z-10"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 min-h-0 flex-1 overflow-y-auto">
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

      {/* Department Detail Modal */}
      {isDetailModalOpen && selectedDeptForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-[#F8F6F2] border border-white/70 rounded-[22px] max-w-3xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 font-sans">
            {/* Header Banner */}
            <div className="relative shrink-0 overflow-hidden border-b border-slate-200/80 bg-white px-7 py-5">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4e0a10] via-[#C9952A] to-[#4e0a10]" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <DepartmentLogo
                    name={selectedDeptForDetail.name}
                    logo={selectedDeptForDetail.logo}
                    className="w-12 h-12 rounded-2xl shadow-sm"
                    iconSize={23}
                  />
                  <div className="min-w-0">
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#C9952A]">Department profile</p>
                    <h2 className="text-lg font-bold text-[#1A1410] font-display break-words leading-tight">{selectedDeptForDetail.name}</h2>
                    <p className="mt-0.5 text-xs text-gray-500 font-medium">
                      {selectedDeptForDetail.code} &middot; Dean <span className="text-gray-700">{selectedDeptForDetail.dean || 'Not assigned'}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  aria-label="Close department profile"
                  className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body - scrolls on its own so the header and the actions stay put. */}
            <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Instructors', value: String(selectedDeptForDetail.facultyCount ?? 0) },
                  { label: 'Sections', value: String(selectedDeptForDetail.sectionsCount ?? 0) },
                  {
                    label: 'Scheduling profile',
                    value: selectedDeptForDetail.schedulingProfile === 'laboratory_enabled' ? 'Laboratory-enabled' : 'Standard',
                  },
                  {
                    label: 'Date created',
                    value: selectedDeptForDetail.createdAt
                      ? formatPhilippineDate(selectedDeptForDetail.createdAt, { month: 'short', day: '2-digit', year: 'numeric' })
                      : '-',
                  },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-xl border border-gray-200/80 bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{tile.label}</p>
                    <p className="mt-1 text-xs font-bold text-gray-800">{tile.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Secretary</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">{selectedDeptForDetail.secretary || 'Not assigned'}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Program heads</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {selectedDeptForDetail.programHeads.length > 0 ? selectedDeptForDetail.programHeads.join(', ') : 'Not assigned'}
                  </p>
                </div>
              </div>

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <LibraryBig size={16} className="text-[#4e0a10]" />
                      <p className="text-sm font-bold text-[#1A1410]">Program directory</p>
                      <span className="min-w-6 rounded-full bg-[#4e0a10] px-2 py-0.5 text-center text-[10px] font-bold text-white">
                        {selectedDeptForDetail.programs.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Programs offered by this department. Each major is its own program, so one code can appear more than once.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => (showProgramForm ? closeProgramForm() : openProgramCreateForm())}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${showProgramForm
                      ? 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      : 'bg-[#4e0a10] text-white shadow-sm hover:bg-[#C9952A]'}`}
                  >
                    {showProgramForm ? <X size={14} /> : <Plus size={14} />}
                    {showProgramForm ? 'Cancel' : 'Add program'}
                  </button>
                </div>

                {showProgramForm && (
                  <div className="rounded-2xl border border-[#C9952A]/30 bg-[#C9952A]/[0.06] p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4e0a10] text-white">
                        {editingProgramId === null ? <Plus size={15} /> : <Pencil size={13} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#4e0a10]">
                          {editingProgramId === null ? 'Add a program' : 'Edit program'}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {editingProgramId === null
                            ? 'Use the official code and program name.'
                            : 'Renaming a program changes how it reads in every schedule and curriculum.'}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                      <label className="text-[11px] font-bold text-gray-500">
                        Program code
                        <input
                          aria-label="Program code"
                          value={newProgram.code}
                          onChange={(event) => setNewProgram({ ...newProgram, code: event.target.value.toUpperCase() })}
                          onKeyDown={handleProgramFormKeyDown}
                          placeholder="BSED"
                          maxLength={50}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20"
                        />
                      </label>
                      <label className="text-[11px] font-bold text-gray-500">
                        Program name
                        <input
                          aria-label="Program name"
                          value={newProgram.name}
                          onChange={(event) => setNewProgram({ ...newProgram, name: event.target.value })}
                          onKeyDown={handleProgramFormKeyDown}
                          placeholder="Bachelor of Secondary Education"
                          maxLength={255}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20"
                        />
                      </label>
                      <label className="text-[11px] font-bold text-gray-500 sm:col-span-2">
                        Major <span className="font-normal text-gray-400">(optional - leave blank when the program has no majors)</span>
                        <input
                          aria-label="Major"
                          value={newProgram.major}
                          onChange={(event) => setNewProgram({ ...newProgram, major: event.target.value })}
                          onKeyDown={handleProgramFormKeyDown}
                          placeholder="English"
                          maxLength={255}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20"
                        />
                      </label>
                    </div>
                    <p className="mt-2.5 text-[11px] text-gray-500">
                      Saved as <span className="font-semibold text-gray-700">{programPreview}</span>
                    </p>
                    <button
                      type="button"
                      onClick={saveProgram}
                      disabled={isSavingProgram || !canSubmitProgram}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4e0a10] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingProgram
                        ? <Loader2 size={14} className="animate-spin" />
                        : (editingProgramId === null ? <Plus size={14} /> : <Pencil size={13} />)}
                      {editingProgramId === null ? 'Add program' : 'Save changes'}
                    </button>
                    {programFormError && <p className="mt-2 text-xs font-semibold text-red-500">{programFormError}</p>}
                  </div>
                )}

                <div className="space-y-2">
                  {selectedDeptForDetail.programs.length > 0 ? selectedDeptForDetail.programs.map((program) => (
                    <div
                      key={program.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm transition-colors ${editingProgramId === program.id
                        ? 'border-[#C9952A] ring-2 ring-[#C9952A]/20'
                        : 'border-slate-200/80 hover:border-[#C9952A]/50'}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/[0.07] text-[#4e0a10]">
                          <LibraryBig size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800">{program.code}</p>
                          <p className="truncate text-[11px] text-gray-500">{program.name || 'Unnamed program'}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {programMajorLabel(program) && (
                          <span className="rounded-full bg-[#C9952A]/10 px-2.5 py-1 text-[10px] font-semibold text-[#8b681b]">
                            {programMajorLabel(program)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openProgramEditForm(program)}
                          aria-label={`Edit ${program.code}`}
                          title="Edit program"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-gray-400 transition-colors cursor-pointer hover:border-[#C9952A] hover:text-[#C9952A]"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-7 text-center">
                      <LibraryBig size={22} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-xs font-semibold text-slate-500">No programs added yet.</p>
                      <p className="mt-1 text-[11px] text-slate-400">Use Add program to add the first program to this department&apos;s directory.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Action Buttons */}
            <div className="shrink-0 border-t border-gray-200/80 bg-[#F8F6F2] px-7 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
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
      )}
    </div>
  );
}
