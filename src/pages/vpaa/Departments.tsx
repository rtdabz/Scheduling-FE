import { formatPhilippineDate } from '../../lib/philippineTime';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import SharedDepartmentLogo from '../../components/ui/DepartmentLogo';
import DataTable from '../../components/ui/DataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import SearchInput from '../../components/ui/SearchInput';
import {
  Pencil,
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
  GraduationCap,
  UserRound,
  Building2,
  Archive,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { getCachedData, hasCachedData, isCacheFresh, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';
import api from '../../lib/api';
import { logoDataUrl } from '../../lib/imageDataUrl';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import { programLabel, programMajorLabel, programName } from '../../lib/programLabel';

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

const CODE_MAX_LENGTH = 20;

const SPECIALIZED_PROFILE_LABEL = 'Specialized rooms';

const FACULTY_PAGE_SIZE = 8;

interface Department {
  id: number;
  code: string;
  name: string;
  dean: string | null;
  secretary: string | null;
  programHeads: ProgramHead[];
  facultyCount: number;
  sectionsCount: number;
  logo?: string | null;
  schedulingProfile: 'standard' | 'laboratory_enabled';
  createdAt: string;
  programs: Program[];
}

interface Program {
  id: number;
  department_id: number;
  major?: string | null;
  code: string;
  name?: string | null;
}

interface ProgramHead {
  name: string;
  program: Program | null;
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
    program?: Program | null;
  }>;
  programs?: Program[];
}

interface ApiFacultyDesignation {
  id: number;
  name: string;
  label?: string;
  parent?: { id: number; name: string } | null;
}

interface ApiFacultyMember {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  suffix?: string | null;
  employment_type: 'full-time' | 'part-time';
  department_id: number;
  department?: { id: number; department_code?: string; department_name?: string } | null;
  profile_picture?: string | null;
  administrative_role?: string | null;
  designation?: ApiFacultyDesignation | null;
  designations?: ApiFacultyDesignation[];
}

interface DepartmentsPageData {
  departments: Department[];
}

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

const programLabelShort = (program: Program) => (program.major ? `${program.code} (${program.major})` : program.code);

function PersonInitials({ name, accent = false, small = false }: { name: string | null; accent?: boolean; small?: boolean }) {
  const words = (name ?? '').split(/\s+/).filter((word) => /^[A-Za-zÀ-ɏ]/.test(word) && !word.endsWith('.'));
  const initials = words.length > 0 ? `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase() : '';

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${small ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-xs'} ${accent
        ? 'bg-[#C9952A]/15 text-[#7b5c18]'
        : initials ? 'bg-[#4e0a10]/[0.08] text-[#4e0a10]' : 'bg-slate-100 text-slate-400'}`}
    >
      {initials || <UserRound size={16} />}
    </div>
  );
}

export default function Departments() {
  const { toast, confirm } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userRole = user?.role?.toLowerCase() ?? '';
  const isVpaa = userRole === 'vpaa';
  const isScopedRole = userRole === 'dean' || userRole === 'secretary' || userRole === 'program_head';
  const canManageDepartments = isVpaa || !isScopedRole;
  const userDeptId = user?.department_id ?? user?.department?.id ?? null;
  const userDeptCode = user?.department?.department_code ?? null;
  const userDeptName = user?.department?.department_name ?? null;

  const departmentsCacheKey = 'page:departments:v3';
  const cachedDepartmentsData = getCachedData<DepartmentsPageData>(departmentsCacheKey);
  const [departments, setDepartments] = useState<Department[]>(cachedDepartmentsData?.departments ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(departmentsCacheKey));

  const displayedDepartments = useMemo(() => {
    if (!isScopedRole) return departments;
    return departments.filter(d => {
      if (userDeptId !== null && Number(d.id) === Number(userDeptId)) return true;
      if (userDeptCode && d.code?.toUpperCase() === userDeptCode.toUpperCase()) return true;
      if (userDeptName && d.name?.toUpperCase().trim() === userDeptName.toUpperCase().trim()) return true;
      return false;
    });
  }, [departments, isScopedRole, userDeptId, userDeptCode, userDeptName]);


  
  const [faculties, setFaculties] = useState<ApiFacultyMember[]>([]);
  const [isLoadingFaculties, setIsLoadingFaculties] = useState(false);
  const [activeFacultyTab, setActiveFacultyTab] = useState<'full-time' | 'part-time'>('full-time');
  const [facultyPage, setFacultyPage] = useState(0);
  
  const [globalFilter, setGlobalFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [newProgram, setNewProgram] = useState({ major: '', code: '', name: '' });
  const [programFormError, setProgramFormError] = useState('');
  const [isSavingProgram, setIsSavingProgram] = useState(false);

  const liveDeptDuplicate = useMemo(() => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return null;
    return departments.find((d) => (!isEditMode || d.id !== editingId) && d.name.trim().toLowerCase() === trimmed) || null;
  }, [name, departments, isEditMode, editingId]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid File', 'Please select a valid image file (JPEG, PNG, WEBP).');
      return;
    }

    logoDataUrl(file)
      .then(setLogo)
      .catch(() => toast.error('Error', 'Failed to process the logo. Try a JPEG, PNG or WEBP image.'));
  };

  const [selectedDeptForDetail, setSelectedDeptForDetail] = useState<Department | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);

  const liveProgramDuplicate = useMemo(() => {
    if (!selectedDeptForDetail || !newProgram.code.trim()) return null;
    const targetCode = newProgram.code.trim().toUpperCase();
    const targetMajor = newProgram.major.trim().toLowerCase();
    return selectedDeptForDetail.programs.find((p) =>
      p.id !== editingProgramId &&
      p.code.trim().toUpperCase() === targetCode &&
      (p.major || '').trim().toLowerCase() === targetMajor
    ) || null;
  }, [selectedDeptForDetail, newProgram.code, newProgram.major, editingProgramId]);

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
    setFacultyPage(0);
    closeProgramForm();
    setIsDetailModalOpen(true);
  };

  const openAddProgram = (department: Department) => {
    openDepartmentDetail(department);
    setShowProgramForm(true);
  };

  const fetchFaculties = async () => {
    setIsLoadingFaculties(true);
    try {
      const res = await api.get<ApiFacultyMember[]>('/faculties');
      setFaculties(Array.isArray(res.data) ? res.data : []);
    } catch {
    } finally {
      setIsLoadingFaculties(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
    fetchFaculties();
  }, []);

  useLiveRefresh(['departments', 'faculty', 'users'], () => {
    void fetchDepartments(true, true);
    void fetchFaculties();
  });

  const deptFaculties = useMemo(() => {
    if (!selectedDeptForDetail) return [];
    return faculties.filter(
      (f) => f.department_id === selectedDeptForDetail.id || f.department?.id === selectedDeptForDetail.id
    );
  }, [faculties, selectedDeptForDetail]);

  const headsByProgramId = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const head of selectedDeptForDetail?.programHeads ?? []) {
      if (!head.program) continue;
      map.set(head.program.id, [...(map.get(head.program.id) ?? []), head.name]);
    }
    return map;
  }, [selectedDeptForDetail]);

  const programsWithoutHead = useMemo(
    () => (selectedDeptForDetail?.programs ?? []).filter((program) => !headsByProgramId.has(program.id)),
    [selectedDeptForDetail, headsByProgramId]
  );

  const fullTimeFaculty = useMemo(() => {
    return deptFaculties.filter((f) => f.employment_type === 'full-time');
  }, [deptFaculties]);

  const partTimeFaculty = useMemo(() => {
    return deptFaculties.filter((f) => f.employment_type === 'part-time');
  }, [deptFaculties]);

  const activeFaculty = activeFacultyTab === 'full-time' ? fullTimeFaculty : partTimeFaculty;
  const facultyPageCount = Math.max(1, Math.ceil(activeFaculty.length / FACULTY_PAGE_SIZE));
  const safeFacultyPage = Math.min(facultyPage, facultyPageCount - 1);

  const mapDepartment = (department: ApiDepartment): Department => ({
    id: department.id,
    code: department.department_code,
    name: department.department_name,
    dean: department.users?.find((user) => user.role === 'dean')?.name ?? null,
    secretary: department.users?.find((user) => user.role === 'secretary')?.name ?? null,
    programHeads: (department.users ?? [])
      .filter((user) => user.role === 'program_head')
      .map((user) => ({ name: user.name || '', program: user.program ?? null }))
      .sort((a, b) => (a.program?.code ?? '￿').localeCompare(b.program?.code ?? '￿') || a.name.localeCompare(b.name)),
    facultyCount: department.faculties_count ?? 0,
    sectionsCount: department.sections_count ?? 0,
    logo: department.logo || null,
    schedulingProfile: department.scheduling_profile ?? 'standard',
    createdAt: department.created_at,
    programs: department.programs ?? [],
  });

  const saveProgram = async () => {
    if (!selectedDeptForDetail) return;

    const code = newProgram.code.trim();
    const name = newProgram.name.trim();
    const major = newProgram.major.trim();
    if (!code || !name) {
      setProgramFormError('Program code and name are required.');
      return;
    }

    if (liveProgramDuplicate) {
      const msg = `A program with code "${liveProgramDuplicate.code}"${liveProgramDuplicate.major ? ` (${liveProgramDuplicate.major})` : ''} already exists in this department.`;
      setProgramFormError(msg);
      toast.error('Duplicate Program', msg);
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

  const canSubmitProgram = newProgram.code.trim() !== '' && newProgram.name.trim() !== '';

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

    if (cachedData && cachedData.departments.length > 0) {
      setDepartments(cachedData.departments);
      setIsLoading(false);
      if (!forceRefresh && isCacheFresh(departmentsCacheKey)) return;
    }

    if (!silent && !cachedData?.departments.length) setIsLoading(true);
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

    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError('Department name is required');
      return;
    }

    if (trimmedName.length > 100) {
      setNameError('Department name must not exceed 100 characters');
      return;
    }

    if (liveDeptDuplicate) {
      setNameError(`A department named "${liveDeptDuplicate.name}" already exists.`);
      toast.error('Duplicate Department', `A department named "${liveDeptDuplicate.name}" already exists.`);
      return;
    }

    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedCode) {
      setCodeError('Department code is required');
      return;
    }

    if (trimmedCode.length > CODE_MAX_LENGTH) {
      setCodeError(`Department code must not exceed ${CODE_MAX_LENGTH} characters`);
      return;
    }

    const codeDuplicate = departments.find(
      (dept) => dept.id !== editingId && (dept.code || '').toUpperCase() === trimmedCode
    );
    if (codeDuplicate) {
      setCodeError(`${trimmedCode} is already used by ${codeDuplicate.name}.`);
      return;
    }

    setNameError('');
    setCodeError('');
    setIsSubmitting(true);

    try {
      const payload = {
        department_name: trimmedName,
        department_code: trimmedCode,
        logo: logo,
      };
      const response = isEditMode && editingId !== null
        ? await api.patch<ApiDepartment>(`/departments/${editingId}`, payload)
        : await api.post<ApiDepartment>('/departments', payload);
      const savedDepartment = response.data;

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
      setCode('');
      setLogo(null);
      setNameError('');
      setCodeError('');
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingId(null);
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      if (fieldErrors.department_code) setCodeError(fieldErrors.department_code);
      if (fieldErrors.department_name) setNameError(fieldErrors.department_name);
      toast.error('Error', apiErrorMessage(err, 'Failed to save department.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (dept: Department) => {
    setName(dept.name);
    setCode(dept.code || '');
    setLogo(dept.logo || null);
    setEditingId(dept.id);
    setNameError('');
    setCodeError('');
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const toggleSpecializedRooms = async (dept: Department) => {
    const nextProfile = dept.schedulingProfile === 'laboratory_enabled' ? 'standard' : 'laboratory_enabled';
    setIsSavingProfile(true);
    try {
      const response = await api.patch<ApiDepartment>(`/departments/${dept.id}`, { scheduling_profile: nextProfile });
      const saved = mapDepartment(response.data);
      setDepartments(prev => {
        const nextDepartments = prev.map(entry => (entry.id === dept.id ? saved : entry));
        setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
        return nextDepartments;
      });
      setSelectedDeptForDetail(current => (current && current.id === dept.id ? { ...current, schedulingProfile: saved.schedulingProfile } : current));
      toast.success('Success', nextProfile === 'laboratory_enabled'
        ? `${dept.name} can now use specialized rooms.`
        : `${dept.name} now uses standard scheduling.`);
    } catch (err) {
      toast.error('Error', apiErrorMessage(err, 'Failed to update the scheduling profile.'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const archiveProgram = async (program: Program) => {
    if (!selectedDeptForDetail) return;
    const confirmed = await confirm({
      title: 'Archive Program',
      message: `${program.code} will be hidden from active lists and can be restored from the Archive. A program with users, faculty, or courses cannot be archived.`,
      eyebrow: 'Archive Record',
      confirmLabel: 'Confirm Archive',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/programs/${program.id}`);
      const nextPrograms = selectedDeptForDetail.programs.filter((entry) => entry.id !== program.id);
      setDepartments((previousDepartments) => {
        const nextDepartments = previousDepartments.map((department) =>
          department.id === selectedDeptForDetail.id ? { ...department, programs: nextPrograms } : department
        );
        setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
        return nextDepartments;
      });
      setSelectedDeptForDetail({ ...selectedDeptForDetail, programs: nextPrograms });
      if (editingProgramId === program.id) closeProgramForm();
      toast.success('Archived', 'Program moved to the Archive');
    } catch (error) {
      toast.error('Archive Failed', apiErrorMessage(error, 'Could not archive the program.'));
    }
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
    } catch (error) {
      toast.error('Archive Failed', apiErrorMessage(error, 'Could not archive the department.'));
    }
  };

  const columns = useMemo<ColumnDef<Department>[]>(
    () => [
      {
        accessorKey: 'logo',
        header: 'Logo',
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
        cell: info => <span className="font-bold text-gray-800 whitespace-nowrap block" title={info.getValue() as string}>{info.getValue() as string}</span>
      },
      {
        accessorKey: 'schedulingProfile',
        header: () => <span className="whitespace-nowrap">Scheduling Profile</span>,
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: info => {
          const profile = info.getValue() as Department['schedulingProfile'];
          return (
            <span className={`inline-block whitespace-nowrap px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${profile === 'laboratory_enabled'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
              {profile === 'laboratory_enabled' ? SPECIALIZED_PROFILE_LABEL : 'Standard'}
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
        header: () => <div className="text-center">Instructor Count</div>,
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
            {canManageDepartments && (
              <>
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
                <div className="relative group/tooltip">
                  <TableActionButton
                    label="Archive"
                    variant="archive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void triggerDeleteConfirmation(row.original.id);
                    }}
                  >
                    <Archive size={17} />
                  </TableActionButton>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                    Archive
                  </span>
                </div>
              </>
            )}
          </div>
        )
      }
    ],
    [departments]
  );

  const table = useReactTable<Department>({
    data: displayedDepartments,
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
      <div className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between mb-6">

        <SearchInput
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search department name..."
        />

        <div className="flex items-center gap-3 justify-end ml-auto lg:ml-0">
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

          {canManageDepartments && (
            <button 
              onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
                setName('');
                setCode('');
                setLogo(null);
                setNameError('');
                setCodeError('');
                setIsModalOpen(true);
              }}
              className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
            >
              <Plus size={15} />
              <span>Add Department</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'grid' ? (
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
                    className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md flex flex-col justify-between space-y-4 font-sans relative group overflow-hidden cursor-pointer ${GRID_CARD_HOVER}`}
                  >
                    {dept.logo && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 p-4 overflow-hidden">
                        <img
                          src={dept.logo}
                          alt="Department Watermark"
                          className="w-36 h-36 max-w-[75%] max-h-[75%] object-contain opacity-[0.32] select-none transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    )}

                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-3">
                        <DepartmentLogo name={dept.name} logo={dept.logo} className="w-11 h-11" iconSize={20} />
                        {canManageDepartments && (
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
                              variant="archive"
                              onClick={(e) => {
                                e.stopPropagation();
                                void triggerDeleteConfirmation(dept.id);
                              }}
                            >
                              <Archive size={15} />
                            </TableActionButton>
                          </div>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-gray-900 leading-snug whitespace-nowrap truncate" title={dept.name}>
                        {dept.name}
                      </h3>
                      <p className="text-xs font-medium text-gray-500 mt-1">
                        Dean: <span className="font-semibold text-gray-700">{dept.dean || 'Not assigned'}</span>
                      </p>
                    </div>

                    <div className="relative z-10 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 font-semibold">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5" title="Instructors">
                          <UsersIcon size={14} className="text-gray-400" />
                          <span>{dept.facultyCount} Instructors</span>
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
              {liveDeptDuplicate && (
                <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 animate-in fade-in">
                  <AlertTriangle size={16} className="shrink-0 text-red-600" />
                  <span>
                    Duplicate detected: A department named &ldquo;{liveDeptDuplicate.name}&rdquo; already exists.
                  </span>
                </div>
              )}

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
                    nameError || liveDeptDuplicate
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {(nameError || liveDeptDuplicate) && (
                  <p className="text-xs text-red-500 mt-1 font-semibold">
                    {nameError || `A department named "${liveDeptDuplicate?.name}" already exists.`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Department Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={code}
                  maxLength={CODE_MAX_LENGTH}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setCodeError('');
                  }}
                  placeholder="e.g. CIT"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white uppercase transition-all ${
                    codeError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {codeError ? (
                  <p className="text-xs text-red-500 mt-1 font-semibold">{codeError}</p>
                ) : (
                  <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
                    Short label used across schedules, rooms and reports.
                  </p>
                )}
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

      {isDetailModalOpen && selectedDeptForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-[#F8F6F2] border border-white/70 rounded-[22px] max-w-6xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 font-sans">
            <div className="relative shrink-0 border-b border-slate-200/80 bg-white">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4e0a10] via-[#C9952A] to-[#4e0a10]" />
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-5 pb-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-4">
                  <DepartmentLogo
                    name={selectedDeptForDetail.name}
                    logo={selectedDeptForDetail.logo}
                    className="w-12 h-12 shrink-0 rounded-2xl shadow-sm ring-4 ring-[#C9952A]/10"
                    iconSize={23}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C9952A]">Department profile</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="text-lg font-bold text-[#1A1410] font-display leading-tight">{selectedDeptForDetail.name}</h2>
                      <span className="rounded-md bg-[#4e0a10] px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-white">
                        {selectedDeptForDetail.code}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex divide-x divide-slate-200">
                    {[
                      { label: 'Instructors', value: selectedDeptForDetail.facultyCount ?? 0 },
                      { label: 'Sections', value: selectedDeptForDetail.sectionsCount ?? 0 },
                      { label: 'Programs', value: selectedDeptForDetail.programs.length },
                      {
                        label: 'Created',
                        value: selectedDeptForDetail.createdAt
                          ? formatPhilippineDate(selectedDeptForDetail.createdAt, { month: 'short', day: '2-digit', year: 'numeric' })
                          : '-',
                      },
                    ].map((stat) => (
                      <div key={stat.label} className="px-3 first:pl-0 sm:px-4">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{stat.label}</p>
                        <p className="text-sm font-bold text-[#1A1410] font-display whitespace-nowrap">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDetailModalOpen(false)}
                    aria-label="Close department profile"
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors cursor-pointer hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 font-sans">
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5">
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <UsersIcon size={15} className="text-[#4e0a10]" />
                      <h3 className="text-sm font-bold text-[#1A1410]">Leadership</h3>
                    </div>
                    {[
                      { role: 'Dean', name: selectedDeptForDetail.dean },
                      { role: 'Secretary', name: selectedDeptForDetail.secretary },
                    ].map((person) => (
                      <div
                        key={person.role}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 ${person.name
                          ? 'border border-slate-200/80 bg-white shadow-sm'
                          : 'border border-dashed border-slate-300 bg-white/60'}`}
                      >
                        <PersonInitials name={person.name} />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{person.role}</p>
                          <p className={`truncate text-sm font-semibold ${person.name ? 'text-gray-800' : 'text-gray-400'}`}>
                            {person.name || 'Not assigned'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </section>

                  {(() => {
                    const specialized = selectedDeptForDetail.schedulingProfile === 'laboratory_enabled';
                    return (
                      <section className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Scheduling profile</p>
                          <p className="text-sm font-semibold text-gray-800">
                            {specialized ? SPECIALIZED_PROFILE_LABEL : 'Standard scheduling'}
                          </p>
                          <p className="text-[11px] leading-4 text-gray-500">
                            {specialized
                              ? 'Can use laboratories and other specialized rooms.'
                              : 'Classes use regular lecture rooms only.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={specialized}
                          aria-label="Use specialized rooms"
                          disabled={!canManageDepartments || isSavingProfile}
                          onClick={() => toggleSpecializedRooms(selectedDeptForDetail)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${
                            specialized ? 'bg-[#4e0a10]' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                              specialized ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </section>
                    );
                  })()}

                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Layers size={15} className="text-[#4e0a10]" />
                      <h3 className="text-sm font-bold text-[#1A1410]">Program heads</h3>
                      <span className="min-w-6 rounded-full bg-[#4e0a10] px-2 py-0.5 text-center text-[10px] font-bold text-white">
                        {selectedDeptForDetail.programHeads.length}
                      </span>
                    </div>

                    {selectedDeptForDetail.programHeads.length > 0 ? (
                      selectedDeptForDetail.programHeads.map((head, index) => (
                        <div
                          key={`${head.name}-${head.program?.id ?? 'none'}-${index}`}
                          className={`flex items-center gap-3 rounded-xl border border-l-4 border-slate-200/80 bg-white px-3 py-2 shadow-sm ${head.program
                            ? 'border-l-[#C9952A]'
                            : 'border-l-slate-300'}`}
                        >
                          <PersonInitials name={head.name} accent />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-gray-800">{head.name || 'Unnamed'}</p>
                            {head.program ? (
                              <div className="mt-0.5 flex min-w-0 items-center gap-1" title={programName(head.program)}>
                                <span className="shrink-0 rounded bg-[#C9952A]/15 px-1.5 py-px font-mono text-[10px] font-bold text-[#4e0a10]">
                                  {head.program.code}
                                </span>
                                {head.program.major && (
                                  <span className="truncate text-[10px] font-semibold text-[#8b681b]">{head.program.major}</span>
                                )}
                              </div>
                            ) : (
                              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">No program assigned</p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-4 text-center">
                        <p className="text-xs font-semibold text-slate-500">No program heads assigned.</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">The secretary schedules every program.</p>
                      </div>
                    )}

                    {selectedDeptForDetail.programHeads.length > 0 && programsWithoutHead.length > 0 && (
                      <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                        <AlertTriangle size={13} className="mt-px shrink-0 text-amber-500" />
                        <span>
                          No head for{' '}
                          <span className="font-semibold text-gray-700">{programsWithoutHead.map(programLabelShort).join(', ')}</span>
                          {' '}— the secretary schedules {programsWithoutHead.length === 1 ? 'it' : 'these'}.
                        </span>
                      </p>
                    )}
                  </section>
                </div>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <LibraryBig size={15} className="text-[#4e0a10]" />
                      <h3 className="text-sm font-bold text-[#1A1410]">Program directory</h3>
                      <span className="min-w-6 rounded-full bg-[#4e0a10] px-2 py-0.5 text-center text-[10px] font-bold text-white">
                        {selectedDeptForDetail.programs.length}
                      </span>
                    </div>
                    {canManageDepartments && (
                      <button
                        type="button"
                        onClick={() => (showProgramForm ? closeProgramForm() : openProgramCreateForm())}
                        className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${showProgramForm
                          ? 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          : 'bg-[#5A1220] text-white shadow-sm hover:bg-[#410b15]'}`}
                      >
                        {showProgramForm ? <X size={13} /> : <Plus size={13} />}
                        {showProgramForm ? 'Cancel' : 'Add program'}
                      </button>
                    )}
                  </div>

                  {showProgramForm && (
                    <div className="rounded-xl border border-[#C9952A]/30 bg-[#C9952A]/[0.06] p-3">
                      {liveProgramDuplicate && (
                        <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-semibold text-red-700 animate-in fade-in">
                          <AlertTriangle size={14} className="shrink-0 text-red-600" />
                          <span>
                            &ldquo;{liveProgramDuplicate.code}&rdquo;{liveProgramDuplicate.major ? ` (${liveProgramDuplicate.major})` : ''} already exists in this department.
                          </span>
                        </div>
                      )}
                      <p className="mb-2 text-xs font-bold text-[#4e0a10]">
                        {editingProgramId === null ? 'Add a program' : 'Edit program'}
                      </p>
                      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
                        <input
                          aria-label="Program code"
                          value={newProgram.code}
                          onChange={(event) => setNewProgram({ ...newProgram, code: event.target.value.toUpperCase() })}
                          onKeyDown={handleProgramFormKeyDown}
                          placeholder="Code (BSED)"
                          maxLength={50}
                          className={`w-full rounded-lg border bg-white px-2.5 py-2 text-xs font-mono outline-none transition ${liveProgramDuplicate ? 'border-red-500 focus:ring-2 focus:ring-red-200' : 'border-slate-200 focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20'}`}
                        />
                        <input
                          aria-label="Major"
                          value={newProgram.major}
                          onChange={(event) => setNewProgram({ ...newProgram, major: event.target.value })}
                          onKeyDown={handleProgramFormKeyDown}
                          placeholder="Major (optional)"
                          maxLength={255}
                          className={`w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none transition ${liveProgramDuplicate ? 'border-red-500 focus:ring-2 focus:ring-red-200' : 'border-slate-200 focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20'}`}
                        />
                        <input
                          aria-label="Program name"
                          value={newProgram.name}
                          onChange={(event) => setNewProgram({ ...newProgram, name: event.target.value })}
                          onKeyDown={handleProgramFormKeyDown}
                          placeholder="Program name (Bachelor of Secondary Education)"
                          maxLength={255}
                          className="col-span-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20"
                        />
                      </div>
                      <p className="mt-2 truncate text-[11px] text-gray-500">
                        Saved as <span className="font-semibold text-gray-700">{programPreview}</span>
                      </p>
                      <button
                        type="button"
                        onClick={saveProgram}
                        disabled={isSavingProgram || !canSubmitProgram}
                        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingProgram
                          ? <Loader2 size={13} className="animate-spin" />
                          : (editingProgramId === null ? <Plus size={13} /> : <Pencil size={12} />)}
                        {editingProgramId === null ? 'Add program' : 'Save changes'}
                      </button>
                      {programFormError && <p className="mt-1.5 text-[11px] font-semibold text-red-500">{programFormError}</p>}
                    </div>
                  )}

                  {selectedDeptForDetail.programs.length > 0 ? selectedDeptForDetail.programs.map((program) => {
                    const heads = headsByProgramId.get(program.id);
                    return (
                      <div
                        key={program.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm transition-colors ${editingProgramId === program.id
                          ? 'border-[#C9952A] ring-2 ring-[#C9952A]/20'
                          : 'border-slate-200/80 hover:border-[#C9952A]/50'}`}
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="shrink-0 text-xs font-bold text-gray-800">{program.code}</p>
                            {programMajorLabel(program) && (
                              <span className="truncate rounded-full bg-[#C9952A]/10 px-2 py-px text-[10px] font-semibold text-[#8b681b]">
                                {program.major}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-gray-500" title={program.name || undefined}>{program.name || 'Unnamed program'}</p>
                          {heads ? (
                            <p className="flex items-center gap-1 truncate text-[10px] font-semibold text-[#4e0a10]">
                              <UserRound size={11} className="shrink-0 text-[#C9952A]" />
                              {heads.join(', ')}
                            </p>
                          ) : (
                            <p className="text-[10px] text-gray-400">No program head</p>
                          )}
                        </div>
                        {canManageDepartments && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openProgramEditForm(program)}
                              aria-label={`Edit ${program.code}`}
                              title="Edit program"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-gray-400 transition-colors cursor-pointer hover:border-[#C9952A] hover:text-[#C9952A]"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void archiveProgram(program)}
                              aria-label={`Archive ${program.code}`}
                              title="Archive program"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-gray-400 transition-colors cursor-pointer hover:border-stone-400 hover:text-stone-700"
                            >
                              <Archive size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center">
                      <LibraryBig size={20} className="mx-auto mb-1.5 text-slate-300" />
                      <p className="text-xs font-semibold text-slate-500">No programs added yet.</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Use Add program to add the first one.</p>
                    </div>
                  )}
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <GraduationCap size={16} className="text-[#4e0a10]" />
                      <h3 className="text-sm font-bold text-[#1A1410]">Instructors</h3>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-gray-200/60 p-0.5">
                      {(['full-time', 'part-time'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setActiveFacultyTab(tab);
                            setFacultyPage(0);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                            activeFacultyTab === tab ? 'bg-[#4e0a10] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {tab === 'full-time' ? 'Full-Time' : 'Part-Time'} ({tab === 'full-time' ? fullTimeFaculty.length : partTimeFaculty.length})
                        </button>
                      ))}
                    </div>
                  </div>

                  {isLoadingFaculties ? (
                    <div className="py-6 text-center text-xs text-gray-400 animate-pulse">Loading instructors...</div>
                  ) : activeFaculty.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center">
                      <UserRound className="mx-auto mb-1.5 text-gray-300" size={20} />
                      <p className="text-xs font-semibold text-gray-600">
                        No {activeFacultyTab === 'full-time' ? 'full-time' : 'part-time'} instructors.
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">Assign instructors in Instructor Management.</p>
                    </div>
                  ) : (
                    <>
                      {activeFaculty
                        .slice(safeFacultyPage * FACULTY_PAGE_SIZE, (safeFacultyPage + 1) * FACULTY_PAGE_SIZE)
                        .map((faculty) => {
                          const fullName = `${faculty.first_name}${faculty.middle_name ? ' ' + faculty.middle_name[0] + '.' : ''} ${faculty.last_name}${faculty.suffix ? ' ' + faculty.suffix : ''}`;
                          const designationsList = (faculty.designations ?? []).map((d) => d.label || (d.parent ? `${d.parent.name} · ${d.name}` : d.name));

                          return (
                            <div
                              key={faculty.id}
                              className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 shadow-sm transition-colors hover:border-[#C9952A]/40"
                            >
                              {faculty.profile_picture ? (
                                <img
                                  src={faculty.profile_picture}
                                  alt={fullName}
                                  className="h-8 w-8 shrink-0 rounded-full border border-gray-200 object-cover"
                                />
                              ) : (
                                <PersonInitials name={fullName} small />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-gray-900">{fullName}</p>
                                {designationsList.length > 0 ? (
                                  <p className="truncate text-[10px] font-semibold text-[#7b5c18]" title={designationsList.join(', ')}>
                                    {designationsList[0]}
                                    {designationsList.length > 1 && <span className="text-gray-400"> +{designationsList.length - 1}</span>}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-gray-400">No designation</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      {facultyPageCount > 1 && (
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => setFacultyPage(safeFacultyPage - 1)}
                            disabled={safeFacultyPage === 0}
                            aria-label="Previous instructors"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-gray-500 transition-colors cursor-pointer hover:border-[#C9952A] hover:text-[#C9952A] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="text-[11px] font-semibold text-gray-500">
                            {safeFacultyPage * FACULTY_PAGE_SIZE + 1}–{Math.min((safeFacultyPage + 1) * FACULTY_PAGE_SIZE, activeFaculty.length)} of {activeFaculty.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setFacultyPage(safeFacultyPage + 1)}
                            disabled={safeFacultyPage >= facultyPageCount - 1}
                            aria-label="Next instructors"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-gray-500 transition-colors cursor-pointer hover:border-[#C9952A] hover:text-[#C9952A] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200/80 bg-white px-4 py-3 sm:px-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
              >
                Close
              </button>
              {canManageDepartments && (
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleEditClick(selectedDeptForDetail);
                  }}
                  className="px-5 py-2 rounded-xl bg-[#5A1220] hover:bg-[#410b15] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Pencil size={14} />
                  <span>Edit Department</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
