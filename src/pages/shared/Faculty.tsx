import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import NumberInput from '../../components/ui/NumberInput';
import SegmentedLoadBar from '../../components/faculty/SegmentedLoadBar';
import SearchInput from '../../components/ui/SearchInput';
import { LOAD_LEVELS, UNAVAILABLE_STATUS, loadLevelOf } from '../../lib/facultyLoad';
import { NAME_SUFFIXES, capitalizeNameInput, formatFacultyListName } from '../../lib/formatters';
import Modal from '../../components/ui/Modal';
import { ModalButton, ModalNotice } from '../../components/ui/ModalForm';
import { modalBody, modalControl, modalError, modalHint, modalLabel } from '../../components/ui/modalStyles';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import FacultyListTable from '../../components/faculty/FacultyListTable';
import {
  Pencil,
  X,
  Plus,
  ArrowUpDown,
  Filter,
  LayoutGrid,
  List,
  Camera,
  UserRound,
  Archive,
} from 'lucide-react';
import api from '../../lib/api';
import { programLabel } from '../../lib/programLabel';
import { photoDataUrl } from '../../lib/imageDataUrl';
import { getStoredUser, hasStoredCapability } from '../../lib/storedUser';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';
import { CREDENTIALS_MAX_LENGTH, formatPersonName, titleOptions } from '../../lib/personName';
import { useNameOptions } from '../../hooks/useNameOptions';
import { fetchInstitutionSettings, type InstitutionSettings } from '../../lib/institutionSettings';
import { summarizeWeek } from '../../lib/availabilityWindows';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import InstructorTimetableButton from '../../components/InstructorTimetableButton';
import FacultyRoleBadge, { type FacultyAdministrativeRole } from '../../components/faculty/FacultyRoleBadge';
import { designationLabel, fetchDesignations, totalDeload, type Designation } from '../../lib/designations';
import DesignationPicker from '../../components/faculty/DesignationPicker';
import FacultyDetailsModal from '../../components/faculty/FacultyDetailsModal';
import FacultyLoadEditorModal from '../../components/faculty/FacultyLoadEditorModal';

const DEPARTMENT_COLORS: Record<string, string> = {
  'INFORMATION TECHNOLOGY':      'bg-blue-100 border-blue-400 text-blue-900',
  'CIT':                         'bg-blue-100 border-blue-400 text-blue-900',
  'IT':                          'bg-blue-100 border-blue-400 text-blue-900',
  'ARTS AND SCIENCE':            'bg-red-100 border-red-400 text-red-900',
  'CAS':                         'bg-red-100 border-red-400 text-red-900',
  'HOSPITALITY MANAGEMENT':      'bg-green-100 border-green-400 text-green-900',
  'CHM':                         'bg-green-100 border-green-400 text-green-900',
  'MIDWIFERY':                   'bg-emerald-100 border-emerald-600 text-emerald-900',
  'LIBRARY INFORMATION SCIENCE': 'bg-pink-100 border-pink-400 text-pink-900',
  'BLIS':                        'bg-pink-100 border-pink-400 text-pink-900',
  'LIS':                         'bg-pink-100 border-pink-400 text-pink-900',
  'EDUCATION':                   'bg-orange-100 border-orange-400 text-orange-900',
  'CED':                         'bg-orange-100 border-orange-400 text-orange-900',
  'CRIMINAL JUSTICE':            'bg-red-200 border-red-800 text-red-950',
  'CCJPS':                       'bg-red-200 border-red-800 text-red-950',
  'CRIM':                        'bg-red-200 border-red-800 text-red-950',
  'BUSINESS ADMINISTRATION':     'bg-emerald-100 border-emerald-400 text-emerald-900',
  'CBA':                         'bg-emerald-100 border-emerald-400 text-emerald-900',
};

const getDepartmentColor = (nameOrCode?: string) => {
  if (!nameOrCode) return 'bg-[#C9952A]/10 border-[#C9952A]/20 text-[#C9952A]';
  const normalized = nameOrCode.toUpperCase().trim();
  for (const [key, val] of Object.entries(DEPARTMENT_COLORS)) {
    if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
      return val;
    }
  }
  return 'bg-[#C9952A]/10 border-[#C9952A]/20 text-[#C9952A]';
};

interface Department {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

interface Program {
  id: number;
  code: string;
  name: string;
  major?: string | null;
  department_id: number;
}

interface AssignedSubject {
  id: number;
  course_code?: string;
  course_name?: string;
  subject_code?: string;
  subject_name?: string;
}

interface AssignedClass {
  id: number;
  section_name: string;
}

interface FacultyMember {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix?: string | null;
  honorific_prefix?: string | null;
  credentials?: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  overload_units: number;
  deload_units: number;
  assigned_units: number;
  assigned_subjects: AssignedSubject[];
  assigned_classes: AssignedClass[];
  live_schedule_count: number;
  required_units: number;
  unit_ceiling: number;
  department_id: number;
  department: Department | null;
  program_id: number | null;
  program: Program | null;
  status: 'active' | 'inactive';
  profile_picture?: string | null;
  administrative_role?: FacultyAdministrativeRole | null;
  designations?: Designation[];
  createdAt?: string;
}

interface ApiFacultyMember {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix?: string | null;
  honorific_prefix?: string | null;
  credentials?: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  overload_units?: number | null;
  deload_units?: number | null;
  assigned_units?: number | null;
  assigned_subjects?: AssignedSubject[] | null;
  assigned_classes?: AssignedClass[] | null;
  live_schedule_count?: number | null;
  required_units?: number | null;
  unit_ceiling?: number | null;
  department_id: number;
  department?: Department | null;
  program_id?: number | null;
  program?: Program | null;
  status: 'active' | 'inactive';
  profile_picture?: string | null;
  administrative_role?: FacultyAdministrativeRole | null;
  designations?: Designation[];
  created_at: string;
  updated_at: string;
}

interface FacultyPageData {
  faculties: FacultyMember[];
  departments: Department[];
  programs: Program[];
}

const mapApiFaculty = (f: ApiFacultyMember): FacultyMember => ({
  id: f.id,
  first_name: f.first_name,
  last_name: f.last_name,
  middle_name: f.middle_name,
  suffix: f.suffix ?? null,
  honorific_prefix: f.honorific_prefix ?? null,
  credentials: f.credentials ?? null,
  employment_type: f.employment_type,
  max_units: f.max_units ?? 21,
  overload_units: f.overload_units || 0,
  deload_units: f.deload_units || 0,
  assigned_units: f.assigned_units || 0,
  assigned_subjects: f.assigned_subjects || [],
  assigned_classes: f.assigned_classes || [],
  live_schedule_count: f.live_schedule_count ?? 0,
  required_units: f.required_units ?? Math.max(0, (f.max_units ?? 21) - (f.deload_units || 0)),
  unit_ceiling:
    f.unit_ceiling ??
    Math.max(0, (f.max_units ?? 21) - (f.deload_units || 0)) +
      (f.overload_units || 0),
  department_id: f.department_id,
  department: f.department || null,
  program_id: f.program_id ?? null,
  program: f.program || null,
  status: f.status || 'active',
  profile_picture: f.profile_picture || null,
  administrative_role: f.administrative_role || null,
  designations: f.designations ?? [],
  createdAt: f.created_at
});

const getWorkloadStatus = (f: FacultyMember) => f.status === 'inactive' ? UNAVAILABLE_STATUS : LOAD_LEVELS[loadLevelOf({
  assignedUnits: f.assigned_units,
  maxUnits: f.max_units,
  deloadUnits: f.deload_units,
  overloadUnits: f.overload_units,
})];

type ListPayload<T> = T[] | { data?: T[] } | null | undefined;
const listOf = <T,>(payload: ListPayload<T>): T[] => (Array.isArray(payload) ? payload : payload?.data ?? []);

const EMPLOYMENT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
];

export default function Faculty() {
  const { toast, confirm } = useToast();
  const user = getStoredUser();
  const userRole = user?.role?.toLowerCase() ?? '';
  const userProgramId = user?.program_id ?? null;
  const facultyCacheKey = `page:faculty:${userRole || 'user'}:${user?.department_id ?? 'all'}:${userProgramId ?? 'all'}`;
  const cachedFacultyData = getCachedData<FacultyPageData>(facultyCacheKey);
  const [faculties, setFaculties] = useState<FacultyMember[]>(cachedFacultyData?.faculties ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedFacultyData?.departments ?? []);
  const [programs, setPrograms] = useState<Program[]>(cachedFacultyData?.programs ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(facultyCacheKey));
  const [loadError, setLoadError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const filterKey = [searchQuery, departmentFilter, employmentFilter, sortBy].join('|');
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const currentPage = pageState.filterKey === filterKey ? pageState.page : 1;
  const setCurrentPage = useCallback((next: number | ((page: number) => number)) => {
    setPageState((prev) => {
      const base = prev.filterKey === filterKey ? prev.page : 1;
      return { filterKey, page: typeof next === 'function' ? next(base) : next };
    });
  }, [filterKey]);
  const [pageSize, setPageSize] = useState(6);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const isVpaa = userRole === 'vpaa';
  const isProgramHead = userRole === 'program_head';
  const canManageFaculty = isVpaa;
  const canEditLoad = isVpaa || hasStoredCapability('schedule.assign_instructor');
  const canEditAvailability = !isVpaa && canEditLoad;

  const isInstructorsPath = window.location.pathname.includes('instructors');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsFaculty, setDetailsFaculty] = useState<FacultyMember | null>(null);
  const [loadEditorFaculty, setLoadEditorFaculty] = useState<FacultyMember | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [honorificPrefix, setHonorificPrefix] = useState('');
  const [credentials, setCredentials] = useState('');
  const [affixErrors, setAffixErrors] = useState<{ honorific_prefix?: string; credentials?: string }>({});
  const nameOptions = useNameOptions();
  const [employmentType, setEmploymentType] = useState<'full-time' | 'part-time'>('full-time');
  const [defaultAvailability, setDefaultAvailability] = useState<InstitutionSettings['default_faculty_availability']>();
  useEffect(() => {
    let active = true;
    // Display only: without it the form still works and defaults still apply.
    void Promise.resolve()
      .then(fetchInstitutionSettings)
      .then(settings => {
        if (active) setDefaultAvailability(settings.default_faculty_availability);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const [maxUnits, setMaxUnits] = useState<number>(21);
  const [overloadUnits, setOverloadUnits] = useState<number>(0);
  const [deloadUnits, setDeloadUnits] = useState<number>(0);
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [designationIds, setDesignationIds] = useState<string[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const canManageDesignations = hasStoredCapability('faculty.manage_designations');

  useEffect(() => {
    let active = true;
    fetchDesignations(true)
      .then((list) => { if (active) setDesignations(list); })
      .catch(() => { if (active) setDesignations([]); });
    return () => { active = false; };
  }, []);
  const formPrograms = programs.filter(program =>
    Number(program.department_id) === Number(isVpaa ? departmentId : user?.department_id)
  );
  // One program in the department → it is the only valid choice, so select it automatically
  // (same as sections). Several programs → the user picks one, or leaves it unset.
  const singleFormProgram = formPrograms.length === 1 ? formPrograms[0] : null;
  const effectiveProgramId = singleFormProgram ? String(singleFormProgram.id) : programId;
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid File', 'Please select a valid image file (JPEG, PNG, WEBP).');
      return;
    }

    photoDataUrl(file)
      .then(setProfilePicture)
      .catch(() => toast.error('Error', 'Failed to process the photo. Try a JPEG, PNG or WEBP image.'));
  };

  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [maxUnitsError, setMaxUnitsError] = useState('');
  const [departmentError, setDepartmentError] = useState('');

  const effectiveDeptVal = isVpaa ? departmentId : (user?.department_id?.toString() || '');

  const liveInstructorDuplicate = useMemo(() => {
    const trimmedFirst = firstName.trim().toLowerCase();
    const trimmedLast = lastName.trim().toLowerCase();
    if (!trimmedFirst || !trimmedLast) return null;

    return faculties.find((f) => {
      if (isEditMode && f.id === editingId) return false;
      const fFirst = (f.first_name || '').trim().toLowerCase();
      const fLast = (f.last_name || '').trim().toLowerCase();
      if (fFirst !== trimmedFirst || fLast !== trimmedLast) return false;
      if (effectiveDeptVal && f.department_id) {
        return String(f.department_id) === String(effectiveDeptVal);
      }
      return true;
    }) || null;
  }, [faculties, isEditMode, editingId, firstName, lastName, effectiveDeptVal]);

  const fetchData = async (forceRefresh = false, silent = false) => {
    if (!silent) setIsLoading(forceRefresh || !hasCachedData(facultyCacheKey));
    try {
      const data = await loadCachedData<FacultyPageData>(facultyCacheKey, async () => {
        const [facultiesRes, deptsRes, programsRes] = await Promise.all([
          api.get<ListPayload<ApiFacultyMember>>('/faculties'),
          api.get<ListPayload<Department>>('/departments'),
          api.get<ListPayload<Program>>('/programs')
        ]);
        const rawFaculties = listOf(facultiesRes.data);
        const rawDepts = listOf(deptsRes.data);
        const rawPrograms = listOf(programsRes.data);

        return {
          faculties: rawFaculties.map(mapApiFaculty),
          departments: rawDepts,
          programs: rawPrograms,
        };
      }, forceRefresh);
      setFaculties(data.faculties);
      setDepartments(data.departments);
      setPrograms(data.programs ?? []);
      setLoadError(false);
    } catch (err) {
      setLoadError(true);
      toast.error('Error', apiErrorMessage(err, 'Failed to load faculties and departments.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLiveRefresh(['faculty', 'users'], () => { void fetchData(true, true); });

  const handleEditClick = (faculty: FacultyMember) => {
    setFirstName(faculty.first_name);
    setLastName(faculty.last_name);
    setMiddleName(faculty.middle_name || '');
    setSuffix(faculty.suffix || '');
    setHonorificPrefix(faculty.honorific_prefix || '');
    setCredentials(faculty.credentials || '');
    setAffixErrors({});
    setEmploymentType(faculty.employment_type);
    setMaxUnits(faculty.max_units);
    setOverloadUnits(faculty.overload_units);
    setDeloadUnits(faculty.deload_units);
    setDepartmentId(faculty.department_id ? faculty.department_id.toString() : '');
    setProgramId(faculty.program_id ? faculty.program_id.toString() : '');
    setDesignationIds((faculty.designations ?? []).map((d) => d.id.toString()));
    setStatus(faculty.status);
    setProfilePicture(faculty.profile_picture || null);

    setFirstNameError('');
    setLastNameError('');
    setMaxUnitsError('');
    setDepartmentError('');

    setEditingId(faculty.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = async (id: number) => {
    const faculty = faculties.find(f => f.id === id) ?? null;
    const liveCount = faculty?.live_schedule_count ?? 0;

    const liveWarning = liveCount > 0
      ? `\n\n${liveCount} approved meeting${liveCount === 1 ? '' : 's'} on the timetable`
        + `${liveCount === 1 ? ' is' : ' are'} assigned to this instructor. The assignment will be`
        + ' hidden while the instructor is archived and reconnected if the record is restored.'
      : '';

    const confirmed = await confirm({
      title: 'Archive Instructor',
      message: (faculty
        ? `Archive ${formatPersonName(faculty)}? `
        : 'Archive this instructor? ')
        + 'The record can be restored from the Archive.'
        + liveWarning,
      eyebrow: 'Archive Record',
      confirmLabel: 'Confirm Archive',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const res = await api.delete<{ released_schedule_count?: number }>(`/faculties/${id}`);
      invalidateCacheGroups('faculty', 'departments', 'assignments', 'schedules', 'dashboards');
      setFaculties(prev => {
        const nextFaculties = prev.filter(f => f.id !== id);
        setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments, programs });
        return nextFaculties;
      });

      const released = res.data?.released_schedule_count ?? 0;
      if (released > 0) {
        toast.warning(
          'Archived',
          `Instructor archived. Assignments for ${released} approved meeting${released === 1 ? '' : 's'} `
            + 'are preserved for restoration and hidden while the instructor is archived.'
        );
      } else {
        toast.success('Archived', 'Instructor archived successfully');
      }
    } catch (err) {
      toast.error('Error', apiErrorMessage(err, 'Failed to archive instructor'));
    }
  };

  const handleViewDetails = async (faculty: FacultyMember) => {
    setDetailsFaculty(faculty);
    setIsDetailsModalOpen(true);

    try {
      const res = await api.get<ApiFacultyMember>(`/faculties/${faculty.id}`);
      const fresh = mapApiFaculty(res.data);
      setDetailsFaculty(current => (current && current.id === fresh.id ? fresh : current));
      setFaculties(prev => {
        const nextFaculties = prev.map(f => (f.id === fresh.id ? fresh : f));
        setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments, programs });
        return nextFaculties;
      });
    } catch {
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let hasError = false;
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedMiddle = middleName.trim();
    const editedMiddleName = faculties.find((f) => f.id === editingId)?.middle_name ?? null;
    const keptMiddleName = (initial: string) => {
      if (!initial) return null;
      return editedMiddleName && editedMiddleName.charAt(0).toUpperCase() === initial ? editedMiddleName : initial;
    };

    if (!trimmedFirst) {
      setFirstNameError('First name is required');
      hasError = true;
    } else {
      setFirstNameError('');
    }

    if (!trimmedLast) {
      setLastNameError('Last name is required');
      hasError = true;
    } else {
      setLastNameError('');
    }

    const deptVal = isVpaa ? departmentId : (user?.department_id?.toString() || '');
    if (!deptVal) {
      setDepartmentError('Department is required');
      hasError = true;
    } else {
      setDepartmentError('');
    }

    if (liveInstructorDuplicate) {
      const dupDept = departments.find((d) => d.id === liveInstructorDuplicate.department_id)?.department_name;
      const msg = `An instructor named "${liveInstructorDuplicate.first_name} ${liveInstructorDuplicate.last_name}" already exists${dupDept ? ` in ${dupDept}` : ''}.`;
      setLastNameError(msg);
      toast.error('Duplicate Instructor', msg);
      hasError = true;
    }

    if (hasError) return;

    setIsSubmitting(true);
    const payload = {
      first_name: trimmedFirst,
      last_name: trimmedLast,
      middle_name: keptMiddleName(trimmedMiddle),
      suffix: suffix || null,
      honorific_prefix: honorificPrefix || null,
      credentials: credentials.trim() || null,
      employment_type: employmentType,
      department_id: Number(deptVal),
      program_id: effectiveProgramId ? Number(effectiveProgramId) : null,
      ...(canManageDesignations ? { designation_ids: designationIds.map(Number) } : {}),
      status,
      profile_picture: profilePicture,
      max_units: maxUnits,
      overload_units: overloadUnits,
      ...(!isVpaa ? {
        deload_units: deloadUnits,
      } : {}),
    };

    try {
      if (isEditMode && editingId !== null) {
        const res = await api.put<ApiFacultyMember>(`/faculties/${editingId}`, payload);
        invalidateCacheGroups('faculty', 'departments', 'assignments', 'schedules', 'dashboards');
        const updatedFaculty = mapApiFaculty(res.data);
        setFaculties(prev => {
          const nextFaculties = prev.map(f => f.id === editingId ? updatedFaculty : f);
          setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments, programs });
          return nextFaculties;
        });
        toast.success('Updated', 'Instructor updated successfully');
      } else {
        const res = await api.post<ApiFacultyMember>('/faculties', payload);
        invalidateCacheGroups('faculty', 'departments', 'assignments', 'schedules', 'dashboards');
        const createdFaculty = mapApiFaculty(res.data);
        setFaculties(prev => {
          const nextFaculties = [createdFaculty, ...prev];
          setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments, programs });
          return nextFaculties;
        });
        setSearchQuery('');
        setDepartmentFilter('');
        setEmploymentFilter('');
        setHighlightedId(createdFaculty.id);
        toast.success('Created', `${formatFacultyListName(createdFaculty)} was added to the list.`);
      }
      setIsModalOpen(false);
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      setAffixErrors({ honorific_prefix: fieldErrors.honorific_prefix, credentials: fieldErrors.credentials });
      toast.error(
        'Error',
        apiErrorMessage(err, isEditMode ? 'Failed to update instructor' : 'Failed to create instructor')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredFaculties = useMemo(() => {
    let list = [...faculties];
    if (!isVpaa && user?.department_id) {
      list = list.filter(f => f.department_id !== null && Number(f.department_id) === Number(user.department_id));
    }

    if (isProgramHead) {
      list = list.filter(f => userProgramId !== null && Number(f.program_id) === Number(userProgramId));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => {
        const fullName = formatFacultyListName(f).toLowerCase();
        return fullName.includes(q);
      });
    }

    if (departmentFilter) {
      list = list.filter(f => f.department_id !== null && Number(f.department_id) === Number(departmentFilter));
    }

    if (employmentFilter) {
      list = list.filter(f => f.employment_type === employmentFilter);
    }

    return list;
  }, [faculties, searchQuery, departmentFilter, employmentFilter, isVpaa, isProgramHead, userProgramId, user?.department_id]);

  const sortedFaculties = useMemo(() => {
    const list = [...filteredFaculties];
    list.sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = `${a.last_name}, ${a.first_name}`.toLowerCase();
        const nameB = `${b.last_name}, ${b.first_name}`.toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === 'units') {
        return b.assigned_units - a.assigned_units;
      }
      if (sortBy === 'remaining') {
        const reqA = Math.max(0, a.max_units - a.deload_units - a.assigned_units);
        const reqB = Math.max(0, b.max_units - b.deload_units - b.assigned_units);
        return reqB - reqA;
      }
      if (sortBy === 'workload') {
        const pctA = (a.max_units - a.deload_units) > 0 ? (a.assigned_units / (a.max_units - a.deload_units)) : 0;
        const pctB = (b.max_units - b.deload_units) > 0 ? (b.assigned_units / (b.max_units - b.deload_units)) : 0;
        return pctB - pctA;
      }
      return 0;
    });
    return list;
  }, [filteredFaculties, sortBy]);

  useEffect(() => {
    if (highlightedId === null) return;
    const index = sortedFaculties.findIndex((f) => f.id === highlightedId);
    const jump = index >= 0
      ? setTimeout(() => setCurrentPage(Math.floor(index / pageSize) + 1), 0)
      : undefined;
    const fade = setTimeout(() => setHighlightedId(null), 4000);
    return () => {
      clearTimeout(jump);
      clearTimeout(fade);
    };
  }, [highlightedId, sortedFaculties, pageSize, setCurrentPage]);

  const editingDesignations = faculties.find((f) => f.id === editingId)?.designations ?? [];
  const previewLoad = {

    assignedUnits: faculties.find((f) => f.id === editingId)?.assigned_units ?? 0,

    deloadUnits: designationIds.length ? totalDeload(designationIds, [...designations, ...editingDesignations]) : deloadUnits,

  };

  const totalItems = sortedFaculties.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const activePage = Math.min(currentPage, Math.max(1, totalPages));

  const paginatedFaculties = useMemo(() => {
    const startIndex = (activePage - 1) * pageSize;
    return sortedFaculties.slice(startIndex, startIndex + pageSize);
  }, [sortedFaculties, activePage, pageSize]);


  const showGuide = isDepartmentOfficeRole(userRole);
  useWorkflowGuide({
    id: 'instructors', isReady: showGuide && !isLoading, mission: 'Find an Instructor',
    variant: isDetailsModalOpen ? 'details' : loadError ? 'unavailable' : `${viewMode}-${sortedFaculties.length ? 'results' : 'empty'}`,
    steps: () => {
      const details = { id: 'details', element: '[aria-labelledby="faculty-details-title"]', title: 'Review the instructor', description: 'Review teaching load, classes and availability. Any editing controls save through their normal workflow; finishing help does not change the instructor.' };
      if (isDetailsModalOpen) return [details];
      if (loadError) return [{ id: 'unavailable', element: '#instructors-workspace', title: 'Instructor information could not be refreshed', description: 'The list may be unavailable or outdated. Reload the page to retry before relying on workload or availability.' }];
      return [
        { id: 'find', element: '#instructors-search', title: 'Find an instructor', description: 'Search by name. Use the employment type filter and workload sorting, or switch between List and Grid without changing instructor records.' },
        ...(paginatedFaculties.length > 0 ? [
          { id: 'open-details', element: '[data-tour="view-details"]', action: 'click' as const, isSatisfied: () => document.querySelector('[aria-labelledby="faculty-details-title"]') !== null, taskHint: 'Open an instructor to review their details.', title: 'Open an instructor', description: 'Use View to inspect the instructor’s teaching load and timetable.' },
          details,
        ] : [{ id: 'empty', element: '#instructors-workspace', title: 'No instructors match', description: 'Clear the name search or employment type filter. If the list is still empty, instructors must be added before you can view their details.' }]),
      ];
    },
  });

  return (
    <div id="faculty-page" className="space-y-6 font-sans">
      <FilterBar id="instructors-filters">
        <div className="flex min-w-0 flex-wrap items-center gap-3 lg:flex-nowrap">
          <SearchInput
            id="instructors-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search instructors by name..."
            containerClassName="relative min-w-[200px] flex-1 lg:w-72 lg:flex-none"
          />
          <div className="flex shrink-0 flex-wrap items-center gap-1.5" role="group" aria-label="Instructor type">
            {EMPLOYMENT_FILTERS.map(({ value, label }) => {
              const selected = employmentFilter === value;
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => setEmploymentFilter(value)}
                  aria-pressed={selected}
                  className={`selection-indicator rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${selected ? '' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-[#5A1220]'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isVpaa && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-gray-400" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.department_code}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={13} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="name">Sort by Name</option>
              <option value="units">Sort by Workload Units</option>
              <option value="remaining">Sort by Remaining Units</option>
              <option value="workload">Sort by Workload %</option>
            </select>
          </div>

          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1 ml-auto lg:ml-0">
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

          {canManageFaculty && (
            <button
              id="instructors-add-button"
              type="button"
              onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
                setFirstName('');
                setLastName('');
                setMiddleName('');
                setSuffix('');
                setHonorificPrefix('');
                setCredentials('');
                setAffixErrors({});
                setEmploymentType('full-time');
                setMaxUnits(21);
                setOverloadUnits(0);
                setDeloadUnits(0);
                setDepartmentId('');
                setProgramId('');
                setDesignationIds([]);
                setStatus('active');
                setProfilePicture(null);
                setFirstNameError('');
                setLastNameError('');
                setMaxUnitsError('');
                setDepartmentError('');
                setIsModalOpen(true);
              }}
              className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer ml-auto whitespace-nowrap"
            >
              <Plus size={15} aria-hidden="true" />
              <span>Add Instructor</span>
            </button>
          )}
        </div>
      </FilterBar>

      {showGuide && <WorkflowGuideButton guideId="instructors" />}
      <div id="instructors-workspace">
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full rounded-full" />
                <div className="space-y-2 pt-2 border-t border-gray-50">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))
          ) : sortedFaculties.length === 0 ? (
            <div className="col-span-full py-16 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-white">
              <p className="text-base font-semibold font-sans">No instructors found.</p>
              <p className="text-xs font-sans">Try adjusting search parameters.</p>
            </div>
          ) : (
            paginatedFaculties.map((f) => {
              const statusDetails = getWorkloadStatus(f);
              const name = formatFacultyListName(f);
              const required = f.max_units - f.deload_units;
              const ceiling = Math.max(0, required) + f.overload_units;

              const remaining = Math.max(0, required - f.assigned_units);
              const deptLogo = f.department?.logo || departments.find(d => d.id === f.department_id)?.logo || null;

              return (
                <div key={f.id} className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md flex flex-col justify-between font-sans relative group overflow-hidden transition-shadow ${GRID_CARD_HOVER} ${f.id === highlightedId ? 'ring-2 ring-[#C9952A] ring-offset-2' : ''}`}>
                  {deptLogo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 p-4 overflow-hidden">
                      <img
                        src={deptLogo}
                        alt="Department Watermark"
                        className="w-36 h-36 max-w-[75%] max-h-[75%] object-contain opacity-[0.32] select-none transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}

                  <div className="space-y-4 relative z-10">

                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-start gap-3">
                        {f.profile_picture ? (
                          <img src={f.profile_picture} alt={name} className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-2xs shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                            <UserRound className="w-5 h-5" aria-hidden="true" />
                          </div>
                        )}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-gray-800 text-sm leading-snug">{name}</h3>
                            {f.department?.department_code && (
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-2xs ${getDepartmentColor(f.department.department_code || f.department.department_name)}`}>
                                {f.department.department_code}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-500 font-semibold block">
                            {f.department?.department_name || 'No Department'}
                          </span>
                          <FacultyRoleBadge role={f.administrative_role} />
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 flex-shrink-0 ${statusDetails.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDetails.dot}`} />
                        {statusDetails.label}
                      </span>
                    </div>

                    <div className="space-y-1.5 font-sans pt-1">
                      <div className="flex justify-between text-xs font-semibold text-gray-500">
                        <span>Workload Progress</span>
                        <span className="text-gray-700">{f.assigned_units} / {ceiling} Units</span>
                      </div>
                      <SegmentedLoadBar
                        assignedUnits={f.assigned_units}
                        maxUnits={f.max_units}
                        deloadUnits={f.deload_units}
                        overloadUnits={f.overload_units}
                        showLegend
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-3 border-t border-gray-50 text-xs font-sans">
                      <div className="col-span-2">
                        <span className="text-gray-400 font-semibold block text-[10px] uppercase mb-1">Designation</span>
                        {(f.designations ?? []).length === 0 ? (
                          <span className="font-bold text-gray-400 text-xs">—</span>
                        ) : (
                          <div className="mt-1 flex flex-col gap-2 min-w-0">
                            {(f.designations ?? []).map((d) => (
                              <FacultyRoleBadge
                                key={d.id}
                                label={designationLabel(d)}
                                tone="gold"
                                stacked
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold block text-[10px] uppercase">Employment</span>
                        <span className="font-bold text-gray-700 capitalize">{f.employment_type}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold block text-[10px] uppercase">Remaining Units</span>
                        <span className="font-bold text-gray-700">{remaining} Units</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold block text-[10px] uppercase">Assigned Subjects</span>
                        <span className="font-bold text-gray-700">{f.assigned_subjects.length} Subjects</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold block text-[10px] uppercase">Assigned Classes</span>
                        <span className="font-bold text-gray-700">{f.assigned_classes.length} Classes</span>
                      </div>
                    </div>

                    {(f.assigned_subjects.length > 0 || f.assigned_classes.length > 0) && (
                      <div className="space-y-2 pt-2 border-t border-gray-50 font-sans">
                        {f.assigned_subjects.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mr-1">Subjects:</span>
                            {f.assigned_subjects.slice(0, 3).map(sub => (
                              <span key={sub.id} className="text-[9px] bg-slate-50 border border-slate-200 text-slate-600 rounded px-1 py-0.5 font-mono uppercase font-semibold">
                                {sub.course_code || sub.subject_code}
                              </span>
                            ))}
                            {f.assigned_subjects.length > 3 && (
                              <span className="text-[9px] text-gray-400 font-semibold">+{f.assigned_subjects.length - 3} more</span>
                            )}
                          </div>
                        )}
                        {f.assigned_classes.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mr-1">Classes:</span>
                            {f.assigned_classes.slice(0, 3).map(c => (
                              <span key={c.id} className="text-[9px] bg-slate-50 border border-slate-200 text-slate-600 rounded px-1 py-0.5 font-mono uppercase font-semibold">
                                {c.section_name}
                              </span>
                            ))}
                            {f.assigned_classes.length > 3 && (
                              <span className="text-[9px] text-gray-400 font-semibold">+{f.assigned_classes.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-100 mt-4 relative z-10">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(f)}
                        data-tour="view-details"
                        className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline cursor-pointer"
                      >
                        View Details
                      </button>
                      <InstructorTimetableButton
                        facultyId={f.id}
                        facultyName={name}
                        departmentName={f.department ? `${f.department.department_code} - ${f.department.department_name}` : undefined}
                        departmentLogo={f.department?.logo ?? null}
                      />
                    </div>
                    {canManageFaculty && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditClick(f)}
                          className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 transition-colors hover:bg-amber-100"
                          title="Edit Instructor"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => { void triggerDeleteConfirmation(f.id); }}
                          className="rounded-lg border border-stone-300 bg-stone-100 p-1.5 text-stone-700 transition-colors hover:bg-stone-200"
                          title="Archive Instructor"
                        >
                          <Archive size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <FacultyListTable
          faculties={paginatedFaculties}
          isLoading={isLoading}
          highlightedId={highlightedId}
          canManage={canManageFaculty}
          getDepartmentColor={getDepartmentColor}
          onView={(f) => { void handleViewDetails(f); }}
          onEdit={handleEditClick}
          onArchive={(f) => { void triggerDeleteConfirmation(f.id); }}
          viewDetailsTourId="view-details"
        />
      )}
      </div>

      {totalItems > 0 && (
        <div className="px-6 py-4 border border-gray-100 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 bg-white shadow-sm mt-6">
          <div className="flex items-center gap-4">
            <div className="text-xs font-semibold text-gray-500">
              Showing {(activePage - 1) * pageSize + 1}–
              {Math.min(activePage * pageSize, totalItems)} of {totalItems} {isInstructorsPath ? 'instructors' : 'faculty'}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-semibold">Show</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-xs border border-gray-200 rounded-lg p-1 bg-white outline-none focus:ring-1 focus:ring-[#C9952A]"
              >
                {[6, 12, 24, 48].map(size => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={activePage === 1}
              className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={activePage === 1}
              className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
            >
              Prev
            </button>
            <span className="text-xs font-semibold text-gray-500 font-sans">
              Page {activePage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={activePage === totalPages}
              className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={activePage === totalPages}
              className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {isDetailsModalOpen && detailsFaculty && (
        <FacultyDetailsModal
          faculty={detailsFaculty}
          onClose={() => setIsDetailsModalOpen(false)}
          onEditLoad={canEditLoad && !canManageFaculty ? () => setLoadEditorFaculty(detailsFaculty) : undefined}
          canEditAvailability={canEditAvailability}
          onNotify={(kind, title, message) =>
            kind === 'success' ? toast.success(title, message) : toast.error(title, message)
          }
        />
      )}

      {isModalOpen && (
        <Modal
          isOpen
          onClose={() => setIsModalOpen(false)}
          title={isEditMode ? 'Edit Instructor' : 'Add New Instructor'}
          description={isEditMode ? 'Update the instructor profile, designations, and teaching load.' : 'Set the instructor profile, designations, and teaching load.'}
          size="lg"
          closeOnOverlayClick={false}
          closeOnEscape={!isSubmitting}
          footer={<>
            <ModalButton onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</ModalButton>
            <ModalButton type="submit" form="instructor-form" variant="primary" loading={isSubmitting}>
              {isEditMode ? 'Save Changes' : 'Add Instructor'}
            </ModalButton>
          </>}
        >
            <form id="instructor-form" onSubmit={handleSubmit} noValidate className={modalBody}>
              {liveInstructorDuplicate && (
                <ModalNotice tone="error">
                  Duplicate detected: An instructor named &ldquo;{liveInstructorDuplicate.first_name} {liveInstructorDuplicate.last_name}&rdquo; already exists{liveInstructorDuplicate.department_id && departments.find((d) => d.id === liveInstructorDuplicate.department_id) ? ` in ${departments.find((d) => d.id === liveInstructorDuplicate.department_id)?.department_name}` : ''}.
                </ModalNotice>
              )}

              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-white transition-colors hover:border-[#4e0a10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] focus-visible:ring-offset-2 cursor-pointer"
                    title="Click to upload picture"
                    aria-label={profilePicture ? 'Change profile photo' : 'Upload profile photo'}
                  >
                    {profilePicture ? (
                      <img src={profilePicture} alt="Instructor Preview" className="h-full w-full object-cover" />
                    ) : (
                      <Camera size={20} className="text-slate-400" />
                    )}
                  </button>
                  {profilePicture && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfilePicture(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 cursor-pointer"
                      title="Remove Photo"
                      aria-label="Remove photo"
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
                  className="hidden"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Profile Photo</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {profilePicture ? 'Click the photo to change it.' : 'Optional. Click the circle to upload.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <div className="sm:col-span-2 grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_4.5rem_6.5rem]">
                  <div>
                    <label className={modalLabel}>
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(capitalizeNameInput(e.target.value));
                        setLastNameError('');
                      }}
                      placeholder="Doe"
                      className={modalControl(Boolean(lastNameError || liveInstructorDuplicate))}
                    />
                    {(lastNameError || liveInstructorDuplicate) && (
                      <p className={modalError}>
                        {lastNameError || `Duplicate: "${liveInstructorDuplicate?.first_name} ${liveInstructorDuplicate?.last_name}" is already registered.`}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={modalLabel}>
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(capitalizeNameInput(e.target.value));
                        setFirstNameError('');
                      }}
                      placeholder="John"
                      className={modalControl(Boolean(firstNameError || liveInstructorDuplicate))}
                    />
                    {firstNameError && <p className={modalError}>{firstNameError}</p>}
                  </div>

                  <div>
                    <label className={modalLabel}>
                      M.I.
                    </label>
                    <input
                      type="text"
                      maxLength={1}
                      value={middleName.charAt(0)}
                      onChange={(e) => setMiddleName(e.target.value.toUpperCase())}
                      placeholder="S"
                      className={`${modalControl()} text-center uppercase`}
                    />
                  </div>

                  <div>
                    <label className={modalLabel}>
                      Suffix
                    </label>
                    <select
                      value={suffix}
                      onChange={(e) => setSuffix(e.target.value)}
                      className={modalControl()}
                    >
                      <option value="">None</option>
                      {NAME_SUFFIXES.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
                  <div>
                    <label htmlFor="faculty-honorific-prefix" className={modalLabel}>
                      Title
                    </label>
                    <select
                      id="faculty-honorific-prefix"
                      value={honorificPrefix}
                      onChange={(e) => {
                        setHonorificPrefix(e.target.value);
                        setAffixErrors((prev) => ({ ...prev, honorific_prefix: undefined }));
                      }}
                      className={modalControl(Boolean(affixErrors.honorific_prefix))}
                    >
                      <option value="">None</option>
                      {titleOptions(nameOptions.honorific_prefixes, honorificPrefix).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    {affixErrors.honorific_prefix && <p className={modalError}>{affixErrors.honorific_prefix}</p>}
                  </div>

                  <div>
                    <label htmlFor="faculty-credentials" className={modalLabel}>
                      Credentials / Degrees
                    </label>
                    <input
                      id="faculty-credentials"
                      type="text"
                      maxLength={CREDENTIALS_MAX_LENGTH}
                      value={credentials}
                      onChange={(e) => {
                        setCredentials(e.target.value);
                        setAffixErrors((prev) => ({ ...prev, credentials: undefined }));
                      }}
                      placeholder="e.g. PhD, EdD"
                      className={modalControl(Boolean(affixErrors.credentials))}
                    />
                    {affixErrors.credentials && <p className={modalError}>{affixErrors.credentials}</p>}
                  </div>
                </div>

                <div>
                  <label className={modalLabel}>
                  Designations
                </label>
                <DesignationPicker
                  designations={designations}
                  held={editingDesignations}
                  value={designationIds}
                  onChange={setDesignationIds}
                  disabled={!canManageDesignations}
                  maxUnits={maxUnits}
                />
                </div>

                <div>
                  <label className={modalLabel}>
                    Employment Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as 'full-time' | 'part-time')}
                    className={modalControl()}
                  >
                    <option value="full-time">Full-Time</option>
                    <option value="part-time">Part-Time</option>
                  </select>
                  {defaultAvailability?.[employmentType]?.length ? (
                    <p className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-700">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Default availability (applied automatically)</span>
                      {summarizeWeek(defaultAvailability[employmentType] ?? [])}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className={modalLabel}>
                    {employmentType === 'full-time' ? 'Full-Time' : 'Part-Time'} Basic Load (Units) <span className="text-red-500">*</span>
                  </label>
                  <NumberInput
                    value={maxUnits}
                    onChange={(e) => {
                      setMaxUnits(Number(e.target.value));
                      setMaxUnitsError('');
                    }}
                    min="0"
                    className={modalControl(Boolean(maxUnitsError))}
                  />
                  {maxUnitsError
                    ? <p className={modalError}>{maxUnitsError}</p>
                    : <p className={modalHint}>The units this instructor is expected to carry each semester.</p>}
                </div>

                <div>
                  <label className={modalLabel}>
                    Overload (Units)
                  </label>
                  <NumberInput
                    value={overloadUnits}
                    onChange={(e) => setOverloadUnits(Number(e.target.value))}
                    min="0"
                    placeholder="0"
                    className={modalControl()}
                  />
                  <p className={modalHint}>Optional. Units granted on top of the basic load.</p>
                </div>

                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500">
                    <span className="uppercase tracking-wide">Load Preview</span>
                    <span className="text-sm tabular-nums text-slate-800">{previewLoad.assignedUnits} / {Math.max(0, maxUnits - previewLoad.deloadUnits) + overloadUnits} units</span>
                  </div>
                  <SegmentedLoadBar
                    className="mt-2"
                    assignedUnits={previewLoad.assignedUnits}
                    maxUnits={maxUnits}
                    deloadUnits={previewLoad.deloadUnits}
                    overloadUnits={overloadUnits}
                    showLegend
                  />
                </div>
                {isVpaa ? (
                  <div>
                    <label className={modalLabel}>
                      Assigned Department <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={departmentId}
                      onChange={(e) => {
                        setDepartmentId(e.target.value);
                        setDepartmentError('');
                        setProgramId('');
                      }}
                      className={modalControl(Boolean(departmentError))}
                    >
                      <option value="">Select Department</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id.toString()}>
                          {dept.department_code} - {dept.department_name}
                        </option>
                      ))}
                    </select>
                    {departmentError && <p className={modalError}>{departmentError}</p>}
                  </div>
                ) : (
                  <div>
                    <label className={modalLabel}>
                      Department
                    </label>
                    <input
                      type="text"
                      disabled
                      value={
                        departments.find(d => d.id === user?.department_id)
                          ? `${departments.find(d => d.id === user?.department_id)?.department_code} - ${departments.find(d => d.id === user?.department_id)?.department_name}`
                          : 'No Department Assigned'
                      }
                      className={modalControl()}
                    />
                  </div>
                )}

                {!isVpaa && (
                  <>
                    <div>
                      <label className={modalLabel}>
                        Deload Units
                      </label>
                      <NumberInput
                        value={deloadUnits}
                        onChange={(e) => setDeloadUnits(Number(e.target.value))}
                        min="0"
                        className={modalControl()}
                      />
                    </div>
                    <div>
                      <label className={modalLabel}>
                        Overload Units
                      </label>
                      <NumberInput
                        value={overloadUnits}
                        onChange={(e) => setOverloadUnits(Number(e.target.value))}
                        min="0"
                        className={modalControl()}
                      />
                    </div>
                  </>
                )}

                <div className={isVpaa ? '' : 'sm:col-span-2'}>
                  <label className={modalLabel}>
                    Program / Major
                  </label>
                  <select
                    value={effectiveProgramId}
                    onChange={(e) => setProgramId(e.target.value)}
                    disabled={Boolean(singleFormProgram)}
                    className={modalControl()}
                  >
                    {!singleFormProgram && <option value="">No Specific Program</option>}
                    {formPrograms.map(program => (
                      <option key={program.id} value={program.id.toString()}>
                        {programLabel(program)}
                      </option>
                    ))}
                  </select>
                  <p className={modalHint}>
                    {singleFormProgram
                      ? 'Selected automatically. This is the only program in the department.'
                      : 'Major subjects tied to a program can only be assigned to instructors of that program. With No Specific Program, the instructor can teach the department\'s other subjects.'}
                  </p>
                </div>
              </div>
            </form>
        </Modal>
      )}

      {loadEditorFaculty && (
        <FacultyLoadEditorModal
          faculty={loadEditorFaculty}
          onClose={() => setLoadEditorFaculty(null)}
          onSaved={(updated) => {
            invalidateCacheGroups('faculty', 'departments', 'assignments', 'schedules', 'dashboards');
            const fresh = mapApiFaculty(updated as ApiFacultyMember);
            setFaculties(prev => {
              const nextFaculties = prev.map(f => (f.id === fresh.id ? fresh : f));
              setCachedData<FacultyPageData>(facultyCacheKey, {
                faculties: nextFaculties,
                departments,
                programs,
              });
              return nextFaculties;
            });
            setDetailsFaculty(current => (current && current.id === fresh.id ? fresh : current));
            toast.success('Updated', 'Teaching load updated successfully');
          }}
          onError={(message) => toast.error('Error', message)}
        />
      )}
    </div>
  );
}
import FilterBar from '../../components/ui/FilterBar';
import { isDepartmentOfficeRole } from '../../lib/roles';
