import { formatPhilippineDate } from '../../lib/philippineTime';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import SharedDepartmentLogo from '../../components/ui/DepartmentLogo';
import DataTable from '../../components/ui/DataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import SearchInput from '../../components/ui/SearchInput';
import Modal from '../../components/ui/Modal';
import { ModalButton, ModalField, ModalNotice, ModalState } from '../../components/ui/ModalForm';
import { modalBody, modalControl } from '../../components/ui/modalStyles';
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
import { formatPersonName } from '../../lib/personName';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import { programLabel, programMajorLabel, programName } from '../../lib/programLabel';
import FilterBar from '../../components/ui/FilterBar';
import type { UsageRoom } from '../../lib/roomUsage';
import { isDepartmentOfficeRole } from '../../lib/roles';

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

const DETAIL_PAGE_SIZE = 8;

interface Department {
  id: number;
  code: string;
  name: string;
  dean: string | null;
  secretary: string | null;
  /** Title of the department office holder: a department has one Secretary or one Director. */
  officeTitle: 'Secretary' | 'Director';
  programHeads: ProgramHead[];
  facultyCount: number;
  sectionsCount: number;
  logo?: string | null;
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
  honorific_prefix?: string | null;
  credentials?: string | null;
  employment_type: 'full-time' | 'part-time';
  department_id: number;
  program_id?: number | null;
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

/** Section title row shared by every card in the department profile. */
function ProfileSectionHeader({
  icon,
  title,
  titleId,
  count,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  titleId?: string;
  count?: number;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/[0.06] text-[#4e0a10]" aria-hidden="true">
          {icon}
        </span>
        <h3 id={titleId} className="text-[13px] font-semibold text-slate-900">{title}</h3>
        {count !== undefined && (
          <span className="min-w-6 rounded-full bg-slate-100 px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums text-slate-600">
            {count}
          </span>
        )}
      </div>
      {actions}
    </div>
  );
}

/** Previous/next pager under a paginated profile list; hidden when everything fits on one page. */
function ProfilePager({
  page,
  pageCount,
  total,
  noun,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  noun: string;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const buttonClass = 'flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors cursor-pointer hover:border-[#4e0a10]/40 hover:text-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0} aria-label={`Previous ${noun}`} className={buttonClass}>
        <ChevronLeft size={14} />
      </button>
      <span className="text-[11px] font-medium tabular-nums text-slate-500">
        {page * DETAIL_PAGE_SIZE + 1}–{Math.min((page + 1) * DETAIL_PAGE_SIZE, total)} of {total}
      </span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount - 1} aria-label={`Next ${noun}`} className={buttonClass}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

const PROFILE_CARD = 'flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4';
const SEGMENT_GROUP = 'flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5';
const segmentClass = (active: boolean) =>
  `selection-indicator rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${active ? 'shadow-xs' : 'text-slate-600 hover:text-slate-900'}`;

/** The active Secretary or Director; the API lists only active personnel. */
const officeHolder = (department: ApiDepartment) =>
  department.users?.find((user) => isDepartmentOfficeRole(user.role));

export default function Departments() {
  const { toast, confirm } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userRole = user?.role?.toLowerCase() ?? '';
  const isVpaa = userRole === 'vpaa';
  const isScopedRole = userRole === 'dean' || isDepartmentOfficeRole(userRole) || userRole === 'program_head';
  const canManageDepartments = isVpaa || !isScopedRole;
  const userDeptId = user?.department_id ?? user?.department?.id ?? null;
  const userDeptCode = user?.department?.department_code ?? null;
  const userDeptName = user?.department?.department_name ?? null;

  const departmentsCacheKey = 'page:departments:v4';
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
  const [facultyProgramFilter, setFacultyProgramFilter] = useState<Program | null>(null);
  const [facultySearch, setFacultySearch] = useState('');
  const [rooms, setRooms] = useState<UsageRoom[]>([]);
  const [activeRoomTab, setActiveRoomTab] = useState<'laboratory' | 'lecture'>('laboratory');
  const [roomPage, setRoomPage] = useState(0);
  const [isLoadingRooms, setIsLoadingRooms] = useState(isVpaa);
  const [roomsError, setRoomsError] = useState(false);

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
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);

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
    setIsProgramModalOpen(false);
    setFacultyPage(0);
    setFacultyProgramFilter(null);
    setFacultySearch('');
    setActiveRoomTab('laboratory');
    setRoomPage(0);
    closeProgramForm();
    setIsDetailModalOpen(true);
  };

  const openAddProgram = (department: Department) => {
    openDepartmentDetail(department);
    setShowProgramForm(true);
    setIsProgramModalOpen(isVpaa);
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

  const fetchRooms = useCallback(async () => {
    if (!isVpaa) return;
    setIsLoadingRooms(true);
    setRoomsError(false);
    try {
      const response = await api.get<UsageRoom[]>('/rooms');
      setRooms(Array.isArray(response.data) ? response.data : []);
    } catch {
      setRoomsError(true);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [isVpaa]);

  useEffect(() => {
    fetchDepartments();
    fetchFaculties();
  }, []);

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  useLiveRefresh(['departments', 'faculty', 'users', 'rooms'], () => {
    void fetchDepartments(true, true);
    void fetchFaculties();
    void fetchRooms();
  });

  const departmentRooms = useMemo(() => rooms
    .filter((room) => selectedDeptForDetail
      && Number(room.department_id) === selectedDeptForDetail.id
      && (room.room_type === 'laboratory' || room.room_type === 'lecture'))
    .sort((first, second) => first.room_code.localeCompare(second.room_code)),
  [rooms, selectedDeptForDetail]);
  const activeRooms = departmentRooms.filter((room) => room.room_type === activeRoomTab);
  const roomPageCount = Math.max(1, Math.ceil(activeRooms.length / DETAIL_PAGE_SIZE));
  const safeRoomPage = Math.min(roomPage, roomPageCount - 1);

  const deptFaculties = useMemo(() => {
    if (!selectedDeptForDetail) return [];
    return faculties.filter(
      (f) =>
        (f.department_id === selectedDeptForDetail.id || f.department?.id === selectedDeptForDetail.id) &&
        // Instructors without a program are shared across the department's programs.
        (facultyProgramFilter === null || f.program_id == null || Number(f.program_id) === facultyProgramFilter.id)
    );
  }, [faculties, selectedDeptForDetail, facultyProgramFilter]);

  const toggleFacultyProgramFilter = (program: Program) => {
    setFacultyProgramFilter((current) => (current?.id === program.id ? null : program));
    setFacultyPage(0);
  };

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

  const tabFaculty = activeFacultyTab === 'full-time' ? fullTimeFaculty : partTimeFaculty;
  const facultyQuery = facultySearch.trim().toLowerCase();
  const activeFaculty = facultyQuery
    ? tabFaculty.filter((faculty) => formatPersonName(faculty).toLowerCase().includes(facultyQuery))
    : tabFaculty;
  const facultyPageCount = Math.max(1, Math.ceil(activeFaculty.length / DETAIL_PAGE_SIZE));
  const safeFacultyPage = Math.min(facultyPage, facultyPageCount - 1);

  const mapDepartment = (department: ApiDepartment): Department => ({
    id: department.id,
    code: department.department_code,
    name: department.department_name,
    dean: department.users?.find((user) => user.role === 'dean')?.name ?? null,
    secretary: officeHolder(department)?.name ?? null,
    officeTitle: officeHolder(department)?.role === 'director' ? 'Director' : 'Secretary',
    programHeads: (department.users ?? [])
      .filter((user) => user.role === 'program_head')
      .map((user) => ({ name: user.name || '', program: user.program ?? null }))
      .sort((a, b) => (a.program?.code ?? '￿').localeCompare(b.program?.code ?? '￿') || a.name.localeCompare(b.name)),
    facultyCount: department.faculties_count ?? 0,
    sectionsCount: department.sections_count ?? 0,
    logo: department.logo || null,
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
        meta: { hideBelow: 'sm' },
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
        meta: { hideBelow: 'lg' },
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

  const viewToggle = (
    <div className={`flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1 ${isDepartmentOfficeRole(userRole) ? 'w-fit ml-auto mb-4' : ''}`}>
      <button
        type="button"
        onClick={() => setViewMode('grid')}
        aria-pressed={viewMode === 'grid'}
        className={`selection-indicator p-2 rounded-lg transition-all duration-200 cursor-pointer ${
          viewMode === 'grid'
            ? 'shadow-sm font-bold'
            : 'text-gray-500 hover:text-gray-800'
        }`}
        title="Grid View"
      >
        <LayoutGrid size={15} />
      </button>
      <button
        type="button"
        onClick={() => setViewMode('list')}
        aria-pressed={viewMode === 'list'}
        className={`selection-indicator p-2 rounded-lg transition-all duration-200 cursor-pointer ${
          viewMode === 'list'
            ? 'shadow-sm font-bold'
            : 'text-gray-500 hover:text-gray-800'
        }`}
        title="List View"
      >
        <List size={15} />
      </button>
    </div>
  );

  const programDirectory = selectedDeptForDetail && (
    <section className={isVpaa ? 'flex flex-col gap-3' : PROFILE_CARD}>
      <ProfileSectionHeader
        icon={<LibraryBig size={14} />}
        title={isVpaa ? 'Programs' : 'Program directory'}
        count={selectedDeptForDetail.programs.length}
        actions={canManageDepartments && (
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
      />

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

      {selectedDeptForDetail.programs.length > 0 ? <div className="space-y-2">{selectedDeptForDetail.programs.map((program) => {
        const heads = headsByProgramId.get(program.id);
        return (
          <div
            key={program.id}
            className={`flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 transition-colors ${editingProgramId === program.id
              ? 'border-[#C9952A] ring-2 ring-[#C9952A]/20'
              : 'border-slate-200 hover:border-slate-300'}`}
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
      })}</div> : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-5 text-center">
          <LibraryBig size={18} className="mx-auto mb-1.5 text-slate-300" />
          <p className="text-xs font-semibold text-slate-600">No programs added yet.</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {canManageDepartments ? 'Use Add program to add the first one.' : 'Programs appear here once they are added to the department.'}
          </p>
        </div>
      )}
    </section>
  );

  return (
    <div id="departments-page">
      {isDepartmentOfficeRole(userRole) ? viewToggle : (
        <FilterBar className="mb-6">
          <SearchInput
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search department name..."
          />

          <div className="flex items-center gap-3 justify-end ml-auto">
            {viewToggle}

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
        </FilterBar>
      )}

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

      {isModalOpen && (
        <Modal
          isOpen
          onClose={() => setIsModalOpen(false)}
          title={isEditMode ? 'Edit Department' : 'Add New Department'}
          description={isEditMode ? 'Update the department logo, name, and code.' : 'Set the department logo, name, and short code.'}
          closeOnOverlayClick={false}
          closeOnEscape={!isSubmitting}
          footer={<>
            <ModalButton onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</ModalButton>
            <ModalButton type="submit" form="department-form" variant="primary" loading={isSubmitting}>
              {isSubmitting
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save Changes' : 'Create Department')
              }
            </ModalButton>
          </>}
        >
          <form id="department-form" onSubmit={handleSubmit} noValidate className={modalBody}>
            {liveDeptDuplicate && (
              <ModalNotice tone="error">
                Duplicate detected: A department named &ldquo;{liveDeptDuplicate.name}&rdquo; already exists.
              </ModalNotice>
            )}

            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-white transition-colors hover:border-[#4e0a10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] focus-visible:ring-offset-2 cursor-pointer"
                  title="Click to upload department logo"
                  aria-label={logo ? 'Change department logo' : 'Upload department logo'}
                >
                  {logo ? (
                    <img src={logo} alt="Department Logo Preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center justify-center text-slate-400">
                      <Camera size={22} />
                      <span className="mt-1 text-[10px] font-bold uppercase tracking-wide">Upload</span>
                    </span>
                  )}
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogo(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 cursor-pointer"
                    title="Remove Logo"
                    aria-label="Remove department logo"
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
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">Department logo</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {logo ? 'Click logo to change' : 'Click to upload department logo'}
                </p>
              </div>
            </div>

            <ModalField
              label="Department Name"
              htmlFor="department-name"
              required
              error={nameError || liveDeptDuplicate ? (nameError || `A department named "${liveDeptDuplicate?.name}" already exists.`) : undefined}
            >
              <input
                id="department-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError('');
                }}
                placeholder="e.g. College of Computing Studies"
                aria-invalid={nameError || liveDeptDuplicate ? true : undefined}
                className={modalControl(Boolean(nameError || liveDeptDuplicate))}
              />
            </ModalField>
            <ModalField
              label="Department Code"
              htmlFor="department-code"
              required
              error={codeError}
              hint="Short label used across schedules, rooms and reports."
            >
              <input
                id="department-code"
                type="text"
                value={code}
                maxLength={CODE_MAX_LENGTH}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeError('');
                }}
                placeholder="e.g. CIT"
                aria-invalid={codeError ? true : undefined}
                className={`${modalControl(!!codeError)} uppercase placeholder:normal-case`}
              />
            </ModalField>
          </form>
        </Modal>
      )}

      {isDetailModalOpen && selectedDeptForDetail && (
        <Modal
          isOpen
          onClose={() => setIsDetailModalOpen(false)}
          title={selectedDeptForDetail.name}
          description="Department profile"
          size="wide"
          className="lg:h-[min(800px,calc(100vh-2rem))]"
          bodyClassName="flex flex-col gap-4 px-4 py-4 sm:px-5"
          footerClassName="sm:py-3"
          inert={isProgramModalOpen}
          closeLabel="Close department profile"
          leading={(
            <DepartmentLogo
              name={selectedDeptForDetail.name}
              logo={selectedDeptForDetail.logo}
              className="h-10 w-10 shrink-0 rounded-xl"
              iconSize={20}
            />
          )}
          headerActions={(
            <div className="flex flex-col items-end gap-1">
              <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-white">
                {selectedDeptForDetail.code}
              </span>
              <span className="whitespace-nowrap text-[11px] text-amber-100/75">
                Created{' '}
                {selectedDeptForDetail.createdAt
                  ? formatPhilippineDate(selectedDeptForDetail.createdAt, { month: 'short', day: '2-digit', year: 'numeric' })
                  : '—'}
              </span>
            </div>
          )}
          footer={<>
            {isVpaa && (
              <ModalButton
                className="mr-auto"
                onClick={() => {
                  closeProgramForm();
                  setIsProgramModalOpen(true);
                }}
              >
                <LibraryBig size={16} />
                Manage programs
              </ModalButton>
            )}
            <ModalButton onClick={() => setIsDetailModalOpen(false)}>Close</ModalButton>
            {canManageDepartments && (
              <ModalButton
                variant="primary"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  handleEditClick(selectedDeptForDetail);
                }}
              >
                <Pencil size={16} />
                <span>Edit Department</span>
              </ModalButton>
            )}
          </>}
        >
          <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Instructors', value: selectedDeptForDetail.facultyCount ?? 0, icon: <GraduationCap size={16} /> },
              { label: 'Programs', value: selectedDeptForDetail.programs.length, icon: <LibraryBig size={16} /> },
              { label: 'Sections', value: selectedDeptForDetail.sectionsCount ?? 0, icon: <LayoutGrid size={16} /> },
              isVpaa
                ? { label: 'Facilities', value: isLoadingRooms || roomsError ? '—' : departmentRooms.length, icon: <Building2 size={16} /> }
                : { label: 'Program heads', value: selectedDeptForDetail.programHeads.length, icon: <Layers size={16} /> },
            ].map((metric) => (
              <div key={metric.label} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/[0.06] text-[#4e0a10]" aria-hidden="true">
                  {metric.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-slate-500">{metric.label}</p>
                  <p className="text-lg font-semibold leading-6 tabular-nums text-slate-900">{metric.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grow gap-4 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
            <div className={`flex min-w-0 flex-col gap-4 lg:col-span-5 lg:col-start-1 lg:row-start-1 ${isVpaa ? '' : 'lg:row-span-2'}`}>
              <section className={PROFILE_CARD}>
                <ProfileSectionHeader icon={<UserRound size={14} />} title="Leadership" />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    { role: 'Dean', name: selectedDeptForDetail.dean },
                    { role: selectedDeptForDetail.officeTitle, name: selectedDeptForDetail.secretary },
                  ].map((person) => (
                    <div
                      key={person.role}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${person.name
                        ? 'border border-slate-200 bg-white'
                        : 'border border-dashed border-slate-300 bg-slate-50/60'}`}
                    >
                      <PersonInitials name={person.name} small />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{person.role}</p>
                        <p className={`truncate text-[13px] font-semibold ${person.name ? 'text-slate-800' : 'text-slate-400'}`}>
                          {person.name || 'Not assigned'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {!isVpaa && programDirectory}

              <section className={`${PROFILE_CARD} ${isVpaa ? '' : 'grow'}`}>
                <ProfileSectionHeader
                  icon={<Layers size={14} />}
                  title="Program heads"
                  count={selectedDeptForDetail.programHeads.length}
                />

                {selectedDeptForDetail.programHeads.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {selectedDeptForDetail.programHeads.map((head, index) => {
                      const program = head.program ?? null;
                      const isFiltering = program !== null && facultyProgramFilter?.id === program.id;
                      return (
                        <button
                          type="button"
                          key={`${head.name}-${program?.id ?? 'none'}-${index}`}
                          disabled={!program}
                          aria-pressed={isFiltering}
                          title={program ? (isFiltering ? 'Show all instructors' : `Show ${programLabelShort(program)} instructors`) : undefined}
                          onClick={() => program && toggleFacultyProgramFilter(program)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#C9952A]/40 ${program
                            ? 'cursor-pointer'
                            : 'cursor-default'} ${isFiltering
                            ? 'border-[#C9952A] bg-[#C9952A]/[0.08] ring-2 ring-[#C9952A]/20'
                            : `border-slate-200 bg-white ${program ? 'hover:border-slate-300 hover:bg-slate-50' : ''}`}`}
                        >
                          <PersonInitials name={head.name} accent small />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-slate-800">{head.name || 'Unnamed'}</p>
                            {head.program ? (
                              <div className="mt-0.5 flex min-w-0 items-center gap-1" title={programName(head.program)}>
                                <span className="shrink-0 rounded bg-[#C9952A]/15 px-1.5 py-px font-mono text-[10px] font-bold text-[#4e0a10]">
                                  {head.program.code}
                                </span>
                                {head.program.major && (
                                  <span className="truncate text-[11px] font-medium text-[#8b681b]">{head.program.major}</span>
                                )}
                              </div>
                            ) : (
                              <p className="mt-0.5 text-[11px] font-medium text-slate-400">No program assigned</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200" aria-hidden="true">
                      <UserRound size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700">No program heads assigned.</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                        The {selectedDeptForDetail.officeTitle.toLowerCase()} schedules every program
                        {selectedDeptForDetail.programs.length > 0 ? ' until a head is assigned:' : '.'}
                      </p>
                      {selectedDeptForDetail.programs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedDeptForDetail.programs.map((program) => (
                            <span
                              key={program.id}
                              title={programName(program)}
                              className="rounded border border-slate-200 bg-white px-1.5 py-px font-mono text-[10px] font-semibold text-slate-600"
                            >
                              {programLabelShort(program)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedDeptForDetail.programHeads.length > 0 && programsWithoutHead.length > 0 && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900">
                    <AlertTriangle size={13} className="mt-px shrink-0 text-amber-500" />
                    <span>
                      No head for{' '}
                      <span className="font-semibold">{programsWithoutHead.map(programLabelShort).join(', ')}</span>
                      {' '}— the {selectedDeptForDetail.officeTitle.toLowerCase()} schedules {programsWithoutHead.length === 1 ? 'it' : 'these'}.
                    </span>
                  </p>
                )}
              </section>
            </div>

            <section className={`${PROFILE_CARD} lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1`}>
              <ProfileSectionHeader
                icon={<GraduationCap size={14} />}
                title="Instructors"
                actions={(
                  <div className={SEGMENT_GROUP}>
                    {(['full-time', 'part-time'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        aria-pressed={activeFacultyTab === tab}
                        onClick={() => {
                          setActiveFacultyTab(tab);
                          setFacultyPage(0);
                        }}
                        className={segmentClass(activeFacultyTab === tab)}
                      >
                        {tab === 'full-time' ? 'Full-Time' : 'Part-Time'} (<span className="selection-indicator-count">{tab === 'full-time' ? fullTimeFaculty.length : partTimeFaculty.length}</span>)
                      </button>
                    ))}
                  </div>
                )}
              />

              <SearchInput
                compact
                value={facultySearch}
                onChange={(event) => {
                  setFacultySearch(event.target.value);
                  setFacultyPage(0);
                }}
                placeholder="Search instructors by name..."
                aria-label="Search instructors"
                containerClassName="relative w-full"
                className="border-slate-200"
              />

              {facultyProgramFilter && (
                <div className="flex items-center gap-2 rounded-lg border border-[#C9952A]/30 bg-[#C9952A]/[0.06] px-2.5 py-1.5">
                  <p className="min-w-0 flex-1 truncate text-[11px] text-slate-600">
                    Showing <span className="font-semibold text-[#4e0a10]">{programLabelShort(facultyProgramFilter)}</span> and department-wide instructors
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFacultyProgramFilter(null);
                      setFacultyPage(0);
                    }}
                    aria-label="Clear program filter"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors cursor-pointer hover:bg-white hover:text-[#4e0a10]"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {isLoadingFaculties ? (
                <ModalState loading title="Loading instructors..." />
              ) : activeFaculty.length === 0 ? (
                <div className="flex grow flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-8 text-center">
                  <UserRound className="mb-1.5 text-slate-300" size={20} />
                  {facultyQuery ? (
                    <>
                      <p className="text-xs font-semibold text-slate-600">No instructors match &ldquo;{facultySearch.trim()}&rdquo;.</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Check the spelling or switch tabs.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-slate-600">
                        No {activeFacultyTab === 'full-time' ? 'full-time' : 'part-time'} instructors.
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Assign instructors in Instructor Management.</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <ul className="grid content-start gap-2 sm:grid-cols-2" aria-label={activeFacultyTab === 'full-time' ? 'Full-time instructors' : 'Part-time instructors'}>
                    {activeFaculty
                      .slice(safeFacultyPage * DETAIL_PAGE_SIZE, (safeFacultyPage + 1) * DETAIL_PAGE_SIZE)
                      .map((faculty) => {
                        const fullName = formatPersonName(faculty);
                        const designationsList = (faculty.designations ?? []).map((d) => d.label || (d.parent ? `${d.parent.name} · ${d.name}` : d.name));

                        return (
                          <li
                            key={faculty.id}
                            className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50/60"
                          >
                            {faculty.profile_picture ? (
                              <img
                                src={faculty.profile_picture}
                                alt={fullName}
                                className="h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover"
                              />
                            ) : (
                              <PersonInitials name={fullName} small />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-slate-900" title={fullName}>{fullName}</p>
                              {designationsList.length > 0 ? (
                                <p className="truncate text-[11px] font-medium text-[#7b5c18]" title={designationsList.join(', ')}>
                                  {designationsList[0]}
                                  {designationsList.length > 1 && <span className="text-slate-400"> +{designationsList.length - 1}</span>}
                                </p>
                              ) : (
                                <p className="text-[11px] text-slate-400">No designation</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                  <ProfilePager
                    page={safeFacultyPage}
                    pageCount={facultyPageCount}
                    total={activeFaculty.length}
                    noun="instructors"
                    onPageChange={setFacultyPage}
                  />
                </>
              )}
            </section>

            {isVpaa && (
              <section className={`${PROFILE_CARD} lg:col-span-5 lg:col-start-1 lg:row-start-2`} aria-labelledby="department-facilities-title">
                <ProfileSectionHeader
                  icon={<Building2 size={14} />}
                  title="Facilities"
                  titleId="department-facilities-title"
                  count={isLoadingRooms || roomsError ? undefined : departmentRooms.length}
                  actions={(
                    <div className={SEGMENT_GROUP} role="group" aria-label="Facility type">
                      {(['laboratory', 'lecture'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setActiveRoomTab(tab);
                            setRoomPage(0);
                          }}
                          aria-pressed={activeRoomTab === tab}
                          className={segmentClass(activeRoomTab === tab)}
                        >
                          {tab === 'laboratory' ? 'Laboratory' : 'Lecture Room'}
                          {!isLoadingRooms && !roomsError && <>{' ('}<span className="selection-indicator-count">{departmentRooms.filter((room) => room.room_type === tab).length}</span>)</>}
                        </button>
                      ))}
                    </div>
                  )}
                />
                {isLoadingRooms ? (
                  <ModalState loading title="Loading facilities..." />
                ) : roomsError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-4 text-center" role="alert">
                    <p className="text-xs font-semibold text-rose-700">Could not load facilities.</p>
                    <button type="button" onClick={() => void fetchRooms()} className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100">
                      Retry
                    </button>
                  </div>
                ) : activeRooms.length > 0 ? (
                  <>
                    <ul className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1" aria-label={activeRoomTab === 'laboratory' ? 'Laboratory rooms' : 'Lecture rooms'}>
                      {activeRooms
                        .slice(safeRoomPage * DETAIL_PAGE_SIZE, (safeRoomPage + 1) * DETAIL_PAGE_SIZE)
                        .map((room) => (
                        <li key={room.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-slate-900" title={room.room_code}>{room.room_code}</p>
                            <p className="truncate text-[11px] text-slate-500" title={room.building || undefined}>{room.building || 'No building assigned'}</p>
                          </div>
                          {room.status === 'not available' && (
                            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Unavailable</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <ProfilePager
                      page={safeRoomPage}
                      pageCount={roomPageCount}
                      total={activeRooms.length}
                      noun="facilities"
                      onPageChange={setRoomPage}
                    />
                  </>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-4 text-center text-xs text-slate-500">
                    No {activeRoomTab === 'laboratory' ? 'laboratory' : 'lecture'} rooms.
                  </p>
                )}
              </section>
            )}
          </div>
        </Modal>
      )}
      {isVpaa && selectedDeptForDetail && (
        <Modal
          isOpen={isProgramModalOpen}
          onClose={() => setIsProgramModalOpen(false)}
          title="Manage programs"
          description={selectedDeptForDetail.name}
          busy={isSavingProgram}
          bodyClassName="p-4 sm:p-5"
        >
          {programDirectory}
        </Modal>
      )}
    </div>
  );
}
