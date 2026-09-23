import React, { useState, useEffect, useMemo, useRef } from 'react';
import NumberInput from '../../components/ui/NumberInput';
import SegmentedLoadBar from '../../components/faculty/SegmentedLoadBar';
import SearchInput from '../../components/ui/SearchInput';
import { LOAD_LEVELS, loadLevelOf } from '../../lib/facultyLoad';
import { NAME_SUFFIXES, capitalizeNameInput, formatFacultyListName } from '../../lib/formatters';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import FacultyListTable from '../../components/faculty/FacultyListTable';
import {
  Pencil,
  Trash2,
  X,
  Plus,
  ArrowUpDown,
  Filter,
  LayoutGrid,
  List,
  Camera,
  UserRound,
} from 'lucide-react';
import api from '../../lib/api';
import { hasStoredCapability } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { apiErrorMessage } from '../../lib/apiError';
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
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  overload_units: number;
  deload_units: number;
  probono_units: number;
  assigned_units: number;
  assigned_subjects: AssignedSubject[];
  assigned_classes: AssignedClass[];
  /** Approved meetings that would lose their instructor if this record went away. */
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
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  overload_units?: number | null;
  deload_units?: number | null;
  probono_units?: number | null;
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
  employment_type: f.employment_type,
  max_units: f.max_units ?? 21,
  overload_units: f.overload_units || 0,
  deload_units: f.deload_units || 0,
  probono_units: f.probono_units || 0,
  assigned_units: f.assigned_units || 0,
  assigned_subjects: f.assigned_subjects || [],
  assigned_classes: f.assigned_classes || [],
  live_schedule_count: f.live_schedule_count ?? 0,
  required_units: f.required_units ?? Math.max(0, (f.max_units ?? 21) - (f.deload_units || 0)),
  unit_ceiling:
    f.unit_ceiling ??
    Math.max(0, (f.max_units ?? 21) - (f.deload_units || 0)) +
      (f.overload_units || 0) +
      (f.probono_units || 0),
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

/** Regular -> Overload -> Pro Bono, levelling up as the load bands fill. See loadLevelOf. */
const getWorkloadStatus = (f: FacultyMember) => LOAD_LEVELS[loadLevelOf({
  assignedUnits: f.assigned_units,
  maxUnits: f.max_units,
  deloadUnits: f.deload_units,
  overloadUnits: f.overload_units,
  probonoUnits: f.probono_units,
})];

export default function VpaaFaculty() {
  const { toast, confirm } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const facultyCacheKey = `page:faculty:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  const cachedFacultyData = getCachedData<FacultyPageData>(facultyCacheKey);
  const [faculties, setFaculties] = useState<FacultyMember[]>(cachedFacultyData?.faculties ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedFacultyData?.departments ?? []);
  const [programs, setPrograms] = useState<Program[]>(cachedFacultyData?.programs ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(facultyCacheKey));

  // Filters & Sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  /** The instructor just created, shown and highlighted wherever the sort puts it. */
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, departmentFilter, employmentFilter, sortBy]);

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const canManageFaculty = isVpaa;
  // The roster itself (identity, department, program, status) is the VPAA's.
  // The unit allowances and the weekly availability windows are instructor
  // assignment data, so they follow schedule.assign_instructor -- naming the
  // secretary here meant a Program Head the VPAA had granted every capability
  // never saw the editors at all, matching the 403 the API used to return.
  const canEditLoad = isVpaa || hasStoredCapability('schedule.assign_instructor');
  const canEditAvailability = canEditLoad;

  const isInstructorsPath = window.location.pathname.includes('instructors');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsFaculty, setDetailsFaculty] = useState<FacultyMember | null>(null);
  const [loadEditorFaculty, setLoadEditorFaculty] = useState<FacultyMember | null>(null);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [employmentType, setEmploymentType] = useState<'full-time' | 'part-time'>('full-time');
  const [maxUnits, setMaxUnits] = useState<number>(21);
  // Which column the Load (Units) input writes to. Basic Load is the contract
  // ceiling; Overload is the allowance granted on top of it.
  const [overloadUnits, setOverloadUnits] = useState<number>(0);
  const [deloadUnits, setDeloadUnits] = useState<number>(0);
  const [probonoUnits, setProbonoUnits] = useState<number>(0);
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  // The designation list is server data, never a hardcoded set -- the picker
  // renders whatever /designations returns. Assigning one is its own
  // capability; without it the field is read-only and is never submitted,
  // because sending it unprivileged would fail the whole roster save.
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
  // An instructor's program has to belong to their own department: it exists to
  // say which majors of that department they are eligible to teach.
  const formPrograms = programs.filter(program =>
    Number(program.department_id) === Number(isVpaa ? departmentId : user?.department_id)
  );
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
            setProfilePicture(dataUrl);
          }
        } catch (err) {
          console.error('Error processing photo:', err);
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

  // Form error states
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [maxUnitsError, setMaxUnitsError] = useState('');
  const [departmentError, setDepartmentError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useLiveRefresh(['faculty', 'users'], () => { void fetchData(true, true); });

  const fetchData = async (forceRefresh = false, silent = false) => {
    if (!silent) setIsLoading(forceRefresh || !hasCachedData(facultyCacheKey));
    try {
      const data = await loadCachedData<FacultyPageData>(facultyCacheKey, async () => {
        const [facultiesRes, deptsRes, programsRes] = await Promise.all([
          api.get<ApiFacultyMember[]>('/faculties'),
          api.get<Department[]>('/departments'),
          api.get<Program[]>('/programs')
        ]);
        const rawFaculties = Array.isArray(facultiesRes.data)
          ? facultiesRes.data
          : ((facultiesRes.data as any)?.data || []);
        const rawDepts = Array.isArray(deptsRes.data)
          ? deptsRes.data
          : ((deptsRes.data as any)?.data || []);

        const rawPrograms = Array.isArray(programsRes.data)
          ? programsRes.data
          : ((programsRes.data as any)?.data || []);

        return {
          faculties: rawFaculties.map(mapApiFaculty),
          departments: rawDepts,
          programs: rawPrograms,
        };
      }, forceRefresh);
      setFaculties(data.faculties);
      setDepartments(data.departments);
      setPrograms(data.programs ?? []);
    } catch (err) {
      toast.error('Error', apiErrorMessage(err, 'Failed to load faculties and departments.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (faculty: FacultyMember) => {
    setFirstName(faculty.first_name);
    setLastName(faculty.last_name);
    setMiddleName(faculty.middle_name || '');
    setSuffix(faculty.suffix || '');
    setEmploymentType(faculty.employment_type);
    setMaxUnits(faculty.max_units);
    setOverloadUnits(faculty.overload_units);
    setDeloadUnits(faculty.deload_units);
    setProbonoUnits(faculty.probono_units);
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

    // The live-meeting caveat is part of the question, so it is folded into the
    // message the shared confirmation modal renders.
    const liveWarning = liveCount > 0
      ? `\n\n${liveCount} approved meeting${liveCount === 1 ? '' : 's'} on the timetable`
        + `${liveCount === 1 ? ' is' : ' are'} assigned to this instructor. The assignment will be`
        + ' hidden while the instructor is archived and reconnected if the record is restored.'
      : '';

    const confirmed = await confirm({
      title: 'Archive Instructor',
      message: (faculty
        ? `Archive ${faculty.first_name} ${faculty.last_name}? `
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
      setFaculties(prev => {
        const nextFaculties = prev.filter(f => f.id !== id);
        setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments, programs });
        return nextFaculties;
      });

      // Deleting an instructor nulls the faculty_id on their approved meetings
      // instead of removing them, so say how many now need a new instructor.
      const released = res.data?.released_schedule_count ?? 0;
      if (released > 0) {
        toast.warning(
          'Archived',
          `Instructor removed. ${released} approved meeting${released === 1 ? '' : 's'} `
            + `${released === 1 ? 'is' : 'are'} now unassigned and need${released === 1 ? 's' : ''} a new instructor.`
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

    // The row came from a cached list payload, but this panel is where assigned
    // load and classes are actually read, so refresh the record behind the
    // already-open modal rather than making the user wait for it.
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
      // The cached record is already on screen; a failed refresh is not worth
      // interrupting the user over.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    if (hasError) return;

    setIsSubmitting(true);
    const payload = {
      first_name: trimmedFirst,
      last_name: trimmedLast,
      middle_name: keptMiddleName(trimmedMiddle),
      suffix: suffix || null,
      employment_type: employmentType,
      department_id: Number(deptVal),
      program_id: programId ? Number(programId) : null,
      // Only sent when the account may change it. Submitting the field without
      // faculty.manage_designations is refused outright, which would block
      // every ordinary roster edit for roles that never touch designations.
      ...(canManageDesignations ? { designation_ids: designationIds.map(Number) } : {}),
      status,
      profile_picture: profilePicture,
      max_units: maxUnits,
      overload_units: overloadUnits,
      ...(!isVpaa ? {
        deload_units: deloadUnits,
        probono_units: probonoUnits,
      } : {}),
    };

    try {
      if (isEditMode && editingId !== null) {
        const res = await api.put<ApiFacultyMember>(`/faculties/${editingId}`, payload);
        const updatedFaculty = mapApiFaculty(res.data);
        setFaculties(prev => {
          const nextFaculties = prev.map(f => f.id === editingId ? updatedFaculty : f);
          setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments, programs });
          return nextFaculties;
        });
        toast.success('Updated', 'Instructor updated successfully');
      } else {
        const res = await api.post<ApiFacultyMember>('/faculties', payload);
        const createdFaculty = mapApiFaculty(res.data);
        setFaculties(prev => {
          const nextFaculties = [createdFaculty, ...prev];
          setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments, programs });
          return nextFaculties;
        });
        // The list is sorted by name and paged, so a new record rarely lands
        // on the page in view. Clear anything that could hide it; the effect
        // below then opens its page and highlights it.
        setSearchQuery('');
        setDepartmentFilter('');
        setEmploymentFilter('');
        setHighlightedId(createdFaculty.id);
        toast.success('Created', `${formatFacultyListName(createdFaculty)} was added to the list.`);
      }
      setIsModalOpen(false);
    } catch (err) {
      toast.error(
        'Error',
        apiErrorMessage(err, isEditMode ? 'Failed to update instructor' : 'Failed to create instructor')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter in-memory
  const filteredFaculties = useMemo(() => {
    // 1. Filter by role access/department
    let list = [...faculties];
    if (!isVpaa && user?.department_id) {
      list = list.filter(f => f.department_id !== null && Number(f.department_id) === Number(user.department_id));
    }

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => {
        const fullName = formatFacultyListName(f).toLowerCase();
        return fullName.includes(q);
      });
    }

    // 3. Filter by department select
    if (departmentFilter) {
      list = list.filter(f => f.department_id !== null && Number(f.department_id) === Number(departmentFilter));
    }

    // 4. Filter by employment type select
    if (employmentFilter) {
      list = list.filter(f => f.employment_type === employmentFilter);
    }

    return list;
  }, [faculties, searchQuery, departmentFilter, employmentFilter, isVpaa, user?.department_id]);

  // Sort in-memory
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
    // Deferred so it lands after the filter reset above sends the list to page 1.
    const jump = index >= 0
      ? setTimeout(() => setCurrentPage(Math.floor(index / pageSize) + 1), 0)
      : undefined;
    const fade = setTimeout(() => setHighlightedId(null), 4000);
    return () => {
      clearTimeout(jump);
      clearTimeout(fade);
    };
  }, [highlightedId, sortedFaculties, pageSize]);

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


  return (
    <div id="faculty-page" className="space-y-6 font-sans">
      {/* Search and Filters Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Search */}
        <SearchInput
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search instructors by name..."
        />

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Department Filter (Only for VPAA) */}
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

          {/* Employment Type Filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={employmentFilter}
              onChange={(e) => setEmploymentFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="">All Types</option>
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
            </select>
          </div>

          {/* Sort Dropdown */}
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

          {/* View Mode Toggle (Grid / List) */}
          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1 ml-auto lg:ml-0">
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

          {/* Add button inside filter bar */}
          {canManageFaculty && (
            <button
              onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
                setFirstName('');
                setLastName('');
                setMiddleName('');
                setSuffix('');
                setEmploymentType('full-time');
                setMaxUnits(21);
                setOverloadUnits(0);
                setDeloadUnits(0);
                setProbonoUnits(0);
                setDepartmentId(isVpaa ? '' : (user?.department_id?.toString() || ''));
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
              <Plus size={15} />
              <span>Add Instructor</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'grid' ? (
        /* Redesigned Card-based visual dashboard */
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
              <p className="text-xs font-sans">Try adjusting search parameters or add a new record.</p>
            </div>
          ) : (
            paginatedFaculties.map((f) => {
              const statusDetails = getWorkloadStatus(f);
              const name = formatFacultyListName(f);
              const required = f.max_units - f.deload_units;
              const ceiling = Math.max(0, required) + f.overload_units + f.probono_units;

              const remaining = Math.max(0, required - f.assigned_units);
              const deptLogo = f.department?.logo || departments.find(d => d.id === f.department_id)?.logo || null;

              return (
                <div key={f.id} className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md flex flex-col justify-between font-sans relative group overflow-hidden transition-shadow ${GRID_CARD_HOVER} ${f.id === highlightedId ? 'ring-2 ring-[#C9952A] ring-offset-2' : ''}`}>
                  {/* Centered Background Department Watermark Logo */}
                  {deptLogo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                      <img
                        src={deptLogo}
                        alt="Department Watermark"
                        className="w-44 h-44 object-contain opacity-[0.09]"
                      />
                    </div>
                  )}

                  <div className="space-y-4 relative z-10">

                    {/* Header: Name, Dept, Status */}
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

                    {/* Progress bar info */}
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
                        probonoUnits={f.probono_units}
                        showLegend
                      />
                    </div>

                    {/* Card stats / details */}
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
                                hint={d.deload_units ? `${d.deload_units} ${d.deload_units === 1 ? 'unit' : 'units'} deload` : null}
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

                    {/* Tags summary */}
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

                  {/* Quick Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-100 mt-4 relative z-10">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(f)}
                        className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline cursor-pointer"
                      >
                        View Details
                      </button>
                      <InstructorTimetableButton
                        facultyId={f.id}
                        facultyName={name}
                        departmentName={f.department ? `${f.department.department_code} - ${f.department.department_name}` : undefined}
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
                          className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 transition-colors hover:bg-red-100"
                          title="Archive Instructor"
                        >
                          <Trash2 size={15} />
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
        /* List View Table */
        <FacultyListTable
          faculties={paginatedFaculties}
          isLoading={isLoading}
          highlightedId={highlightedId}
          canManage={canManageFaculty}
          getDepartmentColor={getDepartmentColor}
          onView={(f) => { void handleViewDetails(f); }}
          onEdit={handleEditClick}
          onArchive={(f) => { void triggerDeleteConfirmation(f.id); }}
        />
      )}

      {/* Pagination Section */}
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

      {/* Create / Edit Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200 font-sans">
          <div className="bg-[#F7F4F0] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex max-h-[calc(100dvh-2rem)] flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 flex shrink-0 justify-between items-center bg-[#4e0a10]">
              <h2 className="text-lg font-bold text-white font-display">
                {isEditMode ? 'Edit Instructor' : 'Add New Instructor'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <form id="instructor-form" onSubmit={handleSubmit} noValidate className="p-6 min-h-0 flex-1 overflow-y-auto font-sans">
              {/* Photo Upload Section */}
              <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-200/80">
                <div className="relative group shrink-0">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 hover:border-[#5A1220] bg-white shadow-sm overflow-hidden flex items-center justify-center transition-all cursor-pointer relative"
                    title="Click to upload picture"
                  >
                    {profilePicture ? (
                      <img src={profilePicture} alt="Faculty Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 hover:text-[#5A1220] transition-colors">
                        <Camera size={20} />
                      </div>
                    )}
                  </div>
                  {profilePicture && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProfilePicture(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md transition-transform hover:scale-110 cursor-pointer"
                      title="Remove Photo"
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
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 font-sans">Profile Photo</p>
                  <p className="text-[11px] text-gray-500 font-sans">
                    {profilePicture ? 'Click the photo to change it.' : 'Optional. Click the circle to upload.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                {/* Name in the order it is written on records: last, first, middle initial, suffix. */}
                <div className="sm:col-span-2 grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_4.5rem_6.5rem]">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
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
                      className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${lastNameError
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-200 focus:ring-[#C9952A]'
                        }`}
                    />
                    {lastNameError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{lastNameError}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
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
                      className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${firstNameError
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-200 focus:ring-[#C9952A]'
                        }`}
                    />
                    {firstNameError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{firstNameError}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                      M.I.
                    </label>
                    <input
                      type="text"
                      maxLength={1}
                      value={middleName.charAt(0)}
                      onChange={(e) => setMiddleName(e.target.value.toUpperCase())}
                      placeholder="S"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white text-center uppercase font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                      Suffix
                    </label>
                    <select
                      value={suffix}
                      onChange={(e) => setSuffix(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                    >
                      <option value="">None</option>
                      {NAME_SUFFIXES.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Employment Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as 'full-time' | 'part-time')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                  >
                    <option value="full-time">Full-Time</option>
                    <option value="part-time">Part-Time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    {employmentType === 'full-time' ? 'Full-Time' : 'Part-Time'} Basic Load (Units) <span className="text-red-500">*</span>
                  </label>
                  <NumberInput
                    value={maxUnits}
                    onChange={(e) => {
                      setMaxUnits(Number(e.target.value));
                      setMaxUnitsError('');
                    }}
                    min="0"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${maxUnitsError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                      }`}
                  />
                  {maxUnitsError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{maxUnitsError}</p>}
                  <p className="text-[10px] text-gray-500 mt-1 font-semibold font-sans">The units this instructor is expected to carry each semester.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Overload (Units)
                  </label>
                  <NumberInput
                    value={overloadUnits}
                    onChange={(e) => setOverloadUnits(Number(e.target.value))}
                    min="0"
                    placeholder="0"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 font-semibold font-sans">Optional. Units granted on top of the basic load.</p>
                </div>

                {/* The load as it will be saved, band by band. */}
                <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-gray-500 font-sans">
                    <span className="uppercase tracking-wider">Load Preview</span>
                    <span className="text-gray-700">{previewLoad.assignedUnits} / {Math.max(0, maxUnits - previewLoad.deloadUnits) + overloadUnits + probonoUnits} units</span>
                  </div>
                  <SegmentedLoadBar
                    className="mt-2"
                    assignedUnits={previewLoad.assignedUnits}
                    maxUnits={maxUnits}
                    deloadUnits={previewLoad.deloadUnits}
                    overloadUnits={overloadUnits}
                    probonoUnits={probonoUnits}
                    showLegend
                  />
                </div>
                {isVpaa ? (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                      Assigned Department <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={departmentId}
                      onChange={(e) => {
                        setDepartmentId(e.target.value);
                        setDepartmentError('');
                        // A program only belongs to one department, so the previous
                        // pick is never valid for the newly chosen one.
                        setProgramId('');
                      }}
                      className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${departmentError
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-200 focus:ring-[#C9952A]'
                        }`}
                    >
                      <option value="">Select Department</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id.toString()}>
                          {dept.department_code} - {dept.department_name}
                        </option>
                      ))}
                    </select>
                    {departmentError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{departmentError}</p>}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
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
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-100 text-gray-500 text-sm outline-none cursor-not-allowed font-sans"
                    />
                  </div>
                )}

                {!isVpaa && (
                  <>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                        Deload Units
                      </label>
                      <NumberInput
                        value={deloadUnits}
                        onChange={(e) => setDeloadUnits(Number(e.target.value))}
                        min="0"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                        Overload Units
                      </label>
                      <NumberInput
                        value={overloadUnits}
                        onChange={(e) => setOverloadUnits(Number(e.target.value))}
                        min="0"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                        Pro Bono Units
                      </label>
                      <NumberInput
                        value={probonoUnits}
                        onChange={(e) => setProbonoUnits(Number(e.target.value))}
                        min="0"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                      />
                    </div>
                  </>
                )}

                {/* VPAA has no unit fields, so Program pairs with Department on one row. */}
                <div className={isVpaa ? '' : 'sm:col-span-2'}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Program / Major
                  </label>
                  <select
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                  >
                    <option value="">Not program-specific</option>
                    {formPrograms.map(program => (
                      <option key={program.id} value={program.id.toString()}>
                        {program.code} - {program.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1 font-semibold font-sans">
                    Major subjects tied to a program can only be assigned to instructors of that program.
                  </p>
                </div>
              </div>
            </form>
            {/* Form Buttons */}
            <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200/80 bg-gray-50/50 px-6 py-4 font-sans">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="instructor-form"
                disabled={isSubmitting}
                className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 font-sans"
              >
                {isSubmitting && <LoadingSpinner size={16} className="animate-spin" />}
                <span>{isEditMode ? 'Save Changes' : 'Add Instructor'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {/* Load-only editor: the secretary's write path into an instructor record. */}
      {loadEditorFaculty && (
        <FacultyLoadEditorModal
          faculty={loadEditorFaculty}
          onClose={() => setLoadEditorFaculty(null)}
          onSaved={(updated) => {
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
import LoadingSpinner from "../../components/ui/LoadingSpinner";
