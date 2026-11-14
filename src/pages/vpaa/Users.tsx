import { formatPhilippineDate } from '../../lib/philippineTime';
import { NAME_SUFFIXES, capitalizeNameInput } from '../../lib/formatters';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import { ModalButton } from '../../components/ui/ModalForm';
import { modalControl, modalError, modalHint, modalLabel, modalNotice } from '../../components/ui/modalStyles';
import SearchInput from '../../components/ui/SearchInput';
import {
  Pencil,
  Camera,
  Plus,
  Link2Off,
  Mail,
  LayoutGrid,
  List,
  Power,
  Archive,
  Trash2,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import DataTable from '../../components/ui/DataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { CREDENTIALS_MAX_LENGTH, formatPersonListName, formatPersonName, titleOptions, type PersonNameParts } from '../../lib/personName';
import { useNameOptions } from '../../hooks/useNameOptions';
import { photoDataUrl } from '../../lib/imageDataUrl';
import { fetchDesignations, type Designation } from '../../lib/designations';
import DesignationPicker from '../../components/faculty/DesignationPicker';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import { programLabel } from '../../lib/programLabel';
import FilterBar from '../../components/ui/FilterBar';

interface User {
  accountVersion?: string;
  id: number;
  name: string;
  first_name: string;
  middle_initial: string;
  last_name: string;
  suffix: string;
  honorific_prefix: string;
  credentials: string;
  username: string;
  email: string;
  role: string;
  department: string | null;
  department_id: number | null;
  program_id?: number | string | null;
  department_logo?: string | null;
  status: 'Active' | 'Inactive';
  profile_picture?: string | null;
  googleLinked: boolean;
  facultyProfileId?: number | null;
  createdAt: string;
}

type FacultyMode = 'create' | 'link' | 'none';
type TeachingChoice = Exclude<FacultyMode, 'none'>;

// Deans and program heads carry a teaching load; other roles teach only when the
// account is explicitly marked as teaching.
const TEACHING_ROLES = new Set(['Dean', 'Program Head']);

interface LinkableFaculty extends PersonNameParts {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employment_type: string | null;
  max_units: number | null;
  program_id: number | null;
  status: string | null;
}


const linkableFacultyName = (f: LinkableFaculty) => formatPersonListName(f);

interface Department {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

interface ApiDepartment {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

interface Program {
  id: number;
  department_id: number;
  major: string | null;
  code: string;
  name: string;
}

interface ApiUser {
  account_version?: string;
  id: number;
  name: string;
  first_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  honorific_prefix?: string | null;
  credentials?: string | null;
  username: string;
  email: string | null;
  role: string;
  department_id: number | null;
  program_id?: number | null;
  department: ApiDepartment | null;
  profile_picture?: string | null;
  is_active: boolean;
  google_id?: string | null;
  faculty_profile?: { id: number; administrative_role?: string | null } | null;
  created_at: string;
}

interface UsersPageData {
  users: User[];
  departments: Department[];
  programs: Program[];
}

const DISPLAY_ROLE_MAP: Record<string, string> = {
  'dean': 'Dean',
  'program_head': 'Program Head',
  'secretary': 'Secretary',
  'director': 'Director',
};

const API_ROLE_MAP: Record<string, string> = {
  'Dean': 'dean',
  'Program Head': 'program_head',
  'Secretary': 'secretary',
  'Director': 'director',
};

// Secretary and Director share one department slot: one active holder of either role per department.
const OFFICE_ROLE_LABELS = new Set(['Secretary', 'Director']);

const mapApiUser = (u: ApiUser): User => ({
  accountVersion: u.account_version,
  id: u.id,
  name: u.name,
  first_name: u.first_name ?? '',
  middle_initial: u.middle_initial ?? '',
  last_name: u.last_name ?? '',
  suffix: u.suffix ?? '',
  honorific_prefix: u.honorific_prefix ?? '',
  credentials: u.credentials ?? '',
  username: u.username,
  email: u.email || '',
  role: DISPLAY_ROLE_MAP[u.role] || u.role,
  department: u.department ? u.department.department_name : null,
  department_id: u.department_id,
  program_id: u.program_id ?? null,
  status: u.is_active ? 'Active' : 'Inactive',
  profile_picture: u.profile_picture || null,
  department_logo: u.department?.logo || null,
  googleLinked: Boolean(u.google_id),
  facultyProfileId: u.faculty_profile?.id ?? null,
  createdAt: u.created_at,
});

const FORM_LABEL = modalLabel;
const formInput = modalControl;
const FieldError = ({ id, message }: { id?: string; message: string }) =>
  message ? <p id={id ? `${id}-error` : undefined} className={modalError}>{message}</p> : null;

/** Marks a control invalid and points screen readers at its error (or its hint when valid). */
const invalidProps = (id: string, message: string, hintId?: string) => ({
  'aria-invalid': message ? true : undefined,
  'aria-describedby': message ? `${id}-error` : hintId,
});

const ROLE_HINTS: Record<string, string> = {
  'Dean': 'Deans carry a teaching load and need an instructor record.',
  'Program Head': 'Program heads are assigned to one program and carry a teaching load.',
  'Secretary': 'A department has one active Secretary or Director.',
  'Director': 'A department has one active Secretary or Director.',
};

const FormSection = ({ title, description, aside, children }: { title: string; description?: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <section aria-label={title} className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5">
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      {aside && <div className="shrink-0 pt-0.5">{aside}</div>}
    </header>
    {children}
  </section>
);

const linkableFacultyDetail = (f: LinkableFaculty) =>
  [
    f.employment_type ? f.employment_type.charAt(0).toUpperCase() + f.employment_type.slice(1) : null,
    f.max_units != null ? `${f.max_units} units` : null,
    f.status === 'inactive' ? 'Inactive' : null,
  ].filter(Boolean).join(' · ');

type FieldErrors = Partial<Record<string, string[]>>;


export default function VpaaUsers() {
  const { toast, confirm } = useToast();
  const usersCacheKey = 'page:users:actor-integrity-v1';
  const cachedUsersData = getCachedData<UsersPageData>(usersCacheKey);
  const [users, setUsers] = useState<User[]>(cachedUsersData?.users ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedUsersData?.departments ?? []);
  const [programs, setPrograms] = useState<Program[]>(cachedUsersData?.programs ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(usersCacheKey));

  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  }, [viewMode]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    first_name: '',
    middle_initial: '',
    last_name: '',
    suffix: '',
    honorific_prefix: '',
    credentials: '',
    username: '',
    email: '',
    role: 'Secretary',
    department_id: '',
    program_id: '',
    status: 'Active' as 'Active' | 'Inactive',
  });

  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [middleInitialError, setMiddleInitialError] = useState('');
  const [honorificPrefixError, setHonorificPrefixError] = useState('');
  const [credentialsError, setCredentialsError] = useState('');
  const nameOptions = useNameOptions();
  const [emailError, setEmailError] = useState('');
  const [deptError, setDeptError] = useState('');
  const [programError, setProgramError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingVersion, setEditingVersion] = useState('');

  const [facultyMode, setFacultyMode] = useState<TeachingChoice>('create');
  const [facultyModeTouched, setFacultyModeTouched] = useState(false);
  const [teachesClasses, setTeachesClasses] = useState(false);
  const [defaultMaxUnits, setDefaultMaxUnits] = useState<number | null>(null);
  const [linkFacultyId, setLinkFacultyId] = useState('');
  const [designationIds, setDesignationIds] = useState<string[]>([]);
  const [linkableFaculty, setLinkableFaculty] = useState<LinkableFaculty[]>([]);
  const [isLoadingLinkable, setIsLoadingLinkable] = useState(false);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [facultyLinkError, setFacultyLinkError] = useState('');

  const resetTeachingProfile = () => {
    setFacultyMode('create');
    setFacultyModeTouched(false);
    setTeachesClasses(false);
    setLinkFacultyId('');
    setDesignationIds([]);
    setFacultyLinkError('');
  };

  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // After validation renders its errors, move focus to the first invalid field so it is never hidden below the fold.
  const focusFirstInvalid = () => {
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  };

  const previewName = formatPersonName(formData);
  const previewInitials = `${formData.first_name.trim().charAt(0)}${formData.last_name.trim().charAt(0)}`.toUpperCase();

  const openCreateModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setIsDetailModalOpen(false);
    setFormData({ first_name: '', middle_initial: '', last_name: '', suffix: '', honorific_prefix: '', credentials: '', username: '', email: '', role: 'Secretary', department_id: '', program_id: '', status: 'Active' });
    setProfilePicture(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFirstNameError('');
    setLastNameError('');
    setMiddleInitialError('');
    setHonorificPrefixError('');
    setCredentialsError('');
    setEmailError('');
    setDeptError('');
    setProgramError('');
    resetTeachingProfile();
    setIsModalOpen(true);
  };

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

  const [selectedUserForDetail, setSelectedUserForDetail] = useState<User | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const openDetailModal = (user: User) => {
    setSelectedUserForDetail(user);
    setIsModalOpen(false);
    setIsDetailModalOpen(true);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useLiveRefresh(['users', 'departments'], () => { void fetchData(true, true); });

  useEffect(() => {
    if (!isEditMode && formData.role && formData.department_id) {
      const dept = departments.find(d => d.id === parseInt(formData.department_id));
      if (dept) {
        const roleName = formData.role
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');
        const generatedUser = `${dept.department_code}${roleName}`;
        setFormData(prev => ({
          ...prev,
          username: generatedUser.toLowerCase(),
        }));
      }
    }
  }, [formData.role, formData.department_id, departments, isEditMode]);

  const isCreatingAccount = isModalOpen && !isEditMode;

  useEffect(() => {
    if (!isCreatingAccount || !formData.department_id) {
      setLinkableFaculty([]);
      return;
    }
    let cancelled = false;
    setIsLoadingLinkable(true);
    api.get<LinkableFaculty[]>('/user/linkable-faculty', { params: { department_id: formData.department_id } })
      .then((res) => {
        if (cancelled) return;
        setLinkableFaculty(res.data);
        setLinkFacultyId((current) => (res.data.some((f) => String(f.id) === current) ? current : ''));
      })
      .catch(() => {
        if (!cancelled) setLinkableFaculty([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLinkable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCreatingAccount, formData.department_id]);

  useEffect(() => {
    if (!isCreatingAccount || designations.length > 0) return;
    fetchDesignations(true)
      .then(setDesignations)
      .catch(() => setDesignations([]));
  }, [isCreatingAccount, designations.length]);

  useEffect(() => {
    if (!isCreatingAccount || defaultMaxUnits !== null) return;
    api.get<{ default_max_units: number }>('/user/instructor-defaults')
      .then((res) => setDefaultMaxUnits(res.data.default_max_units))
      .catch(() => setDefaultMaxUnits(null));
  }, [isCreatingAccount, defaultMaxUnits]);

  const matchingInstructor = useMemo(() => {
    const first = formData.first_name.trim().toLowerCase();
    const last = formData.last_name.trim().toLowerCase();
    if (!first || !last) return null;
    return linkableFaculty.find(
      (f) => f.first_name.trim().toLowerCase() === first && f.last_name.trim().toLowerCase() === last,
    ) ?? null;
  }, [linkableFaculty, formData.first_name, formData.last_name]);

  const isTeachingRole = TEACHING_ROLES.has(formData.role);
  const teachingApplies = isTeachingRole || teachesClasses;
  const effectiveFacultyMode: FacultyMode = teachingApplies ? facultyMode : 'none';
  const duplicatesRosterInstructor = effectiveFacultyMode === 'create' && matchingInstructor !== null;

  const designationMaxUnits = facultyMode === 'link'
    ? linkableFaculty.find((f) => String(f.id) === linkFacultyId)?.max_units ?? undefined
    : defaultMaxUnits ?? undefined;

  const instructorOptions = useMemo(
    () => linkableFaculty.map((f) => ({ value: String(f.id), label: linkableFacultyName(f), detail: linkableFacultyDetail(f) })),
    [linkableFaculty],
  );

  const switchToLinkMatch = () => {
    if (!matchingInstructor) return;
    setFacultyModeTouched(true);
    setFacultyMode('link');
    setLinkFacultyId(String(matchingInstructor.id));
    setFacultyLinkError('');
  };

  useEffect(() => {
    if (!isCreatingAccount || facultyModeTouched) return;
    if (matchingInstructor) {
      setFacultyMode('link');
      setLinkFacultyId(String(matchingInstructor.id));
    } else {
      setFacultyMode('create');
      setLinkFacultyId('');
    }
  }, [isCreatingAccount, facultyModeTouched, matchingInstructor]);

  const isProgramHeadRole = formData.role === 'Program Head';
  // Early notice only; the API and database decide (another VPAA may change accounts meanwhile).
  const officeSlotHolder = useMemo(() => {
    if (formData.status !== 'Active' || !formData.department_id || !OFFICE_ROLE_LABELS.has(formData.role)) return null;
    return users.find((u) => u.id !== editingId
      && u.status === 'Active'
      && OFFICE_ROLE_LABELS.has(u.role)
      && String(u.department_id) === String(formData.department_id)) ?? null;
  }, [users, editingId, formData.status, formData.department_id, formData.role]);
  const selectedDepartmentPrograms = useMemo(
    () => programs.filter((program) => String(program.department_id) === String(formData.department_id)),
    [programs, formData.department_id]
  );

  const fetchData = async (forceRefresh = false, silent = false) => {
    if (!silent) setIsLoading(forceRefresh || !hasCachedData(usersCacheKey));
    try {
      const data = await loadCachedData<UsersPageData>(usersCacheKey, async () => {
        const [usersRes, deptsRes, programsRes] = await Promise.all([
          api.get<ApiUser[]>('/user'),
          api.get<ApiDepartment[]>('/departments'),
          api.get<Program[]>('/programs').catch(() => ({ data: [] as Program[] })),
        ]);
        return {
          users: usersRes.data.map(mapApiUser),
          departments: deptsRes.data,
          programs: programsRes.data,
        };
      }, forceRefresh);
      setUsers(data.users);
      setDepartments(data.departments);
      setPrograms(data.programs);
    } catch {
      toast.error('Error', 'Failed to load user data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let hasError = false;
    if (!formData.email.trim()) {
      setEmailError('Institutional email is required');
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setEmailError('Enter a valid email address');
      hasError = true;
    } else {
      setEmailError('');
    }
    if (!formData.last_name.trim()) {
      setLastNameError('Last name is required');
      hasError = true;
    } else if (formData.last_name.trim().length > 100) {
      setLastNameError('Last name must not exceed 100 characters');
      hasError = true;
    } else {
      setLastNameError('');
    }

    if (!formData.first_name.trim()) {
      setFirstNameError('First name is required');
      hasError = true;
    } else if (formData.first_name.trim().length > 100) {
      setFirstNameError('First name must not exceed 100 characters');
      hasError = true;
    } else {
      setFirstNameError('');
    }

    const middleInitial = formData.middle_initial.trim();
    if (middleInitial && !/^[A-Za-z]$/.test(middleInitial)) {
      setMiddleInitialError('Use a single letter');
      hasError = true;
    } else {
      setMiddleInitialError('');
    }

    if (!formData.department_id) {
      setDeptError('Department assignment is required');
      hasError = true;
    } else {
      setDeptError('');
    }

    if (isProgramHeadRole && !formData.program_id) {
      setProgramError('Program assignment is required for Program Head');
      hasError = true;
    } else {
      setProgramError('');
    }

    if (!isEditMode && effectiveFacultyMode === 'link' && !linkFacultyId) {
      setFacultyLinkError('Select the instructor this account belongs to');
      hasError = true;
    } else if (!isEditMode && duplicatesRosterInstructor) {
      setFacultyLinkError('This person is already on the roster. Link the existing instructor instead.');
      hasError = true;
    } else {
      setFacultyLinkError('');
    }

    if (hasError) {
      focusFirstInvalid();
      return;
    }

    setIsSubmitting(true);

    try {
      const apiRole = API_ROLE_MAP[formData.role] || formData.role.toLowerCase();

      if (isEditMode && editingId !== null) {
        const res = await api.put<{ message: string; data: ApiUser }>(`/user/${editingId}`, {
          expected_version: editingVersion,
          first_name: formData.first_name.trim(),
          middle_initial: formData.middle_initial.trim() || null,
          last_name: formData.last_name.trim(),
          suffix: formData.suffix || null,
          honorific_prefix: formData.honorific_prefix || null,
          credentials: formData.credentials.trim() || null,
          email: formData.email.trim(),
          role: apiRole,
          department_id: parseInt(formData.department_id),
          program_id: isProgramHeadRole ? parseInt(formData.program_id) : null,
          is_active: formData.status === 'Active',
          profile_picture: profilePicture,
        });
        const updatedUser = mapApiUser(res.data.data);
        setUsers(prev => {
          const nextUsers = prev.map(u => u.id === editingId ? updatedUser : u);
          setCachedData<UsersPageData>(usersCacheKey, { users: nextUsers, departments, programs });
          return nextUsers;
        });
        toast.success('Success', res.data.message || 'User account updated successfully');
      } else {
        const res = await api.post<{ data: ApiUser }>('/user', {
          first_name: formData.first_name.trim(),
          middle_initial: formData.middle_initial.trim() || null,
          last_name: formData.last_name.trim(),
          suffix: formData.suffix || null,
          honorific_prefix: formData.honorific_prefix || null,
          credentials: formData.credentials.trim() || null,
          username: formData.username,
          email: formData.email.trim(),
          role: apiRole,
          department_id: parseInt(formData.department_id),
          program_id: isProgramHeadRole ? parseInt(formData.program_id) : null,
          is_active: formData.status === 'Active',
          profile_picture: profilePicture,
          faculty_mode: effectiveFacultyMode,
          faculty_id: effectiveFacultyMode === 'link' ? parseInt(linkFacultyId) : null,
          designation_ids: effectiveFacultyMode !== 'none' ? designationIds.map(Number) : [],
        });
        const createdUser = mapApiUser(res.data.data);
        setUsers(prev => {
          const nextUsers = [createdUser, ...prev];
          setCachedData<UsersPageData>(usersCacheKey, { users: nextUsers, departments, programs });
          return nextUsers;
        });
        toast.success('Success', `Account @${createdUser.username} created. A setup link was emailed to ${createdUser.email}.`);
      }

      setFormData({ first_name: '', middle_initial: '', last_name: '', suffix: '', honorific_prefix: '', credentials: '', username: '', email: '', role: 'Secretary', department_id: '', program_id: '', status: 'Active' });
      resetTeachingProfile();
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingId(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; errors?: FieldErrors } } };
      const message = err?.response?.data?.message || 'Failed to save user account';
      if (showServerFieldErrors(err?.response?.data?.errors)) focusFirstInvalid();
      else toast.error('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Puts 422 messages (duplicate email, taken instructor, ...) next to their fields.
  // Returns false when none of them belongs to a visible field.
  const showServerFieldErrors = (errors?: FieldErrors) => {
    if (!errors) return false;
    const first = (key: string) => errors[key]?.[0] ?? '';
    const setters: [string[], (message: string) => void][] = [
      [['email'], setEmailError],
      [['first_name'], setFirstNameError],
      [['last_name'], setLastNameError],
      [['middle_initial'], setMiddleInitialError],
      [['honorific_prefix'], setHonorificPrefixError],
      [['credentials'], setCredentialsError],
      [['department_id'], setDeptError],
      [['program_id'], setProgramError],
      [['faculty_id', 'faculty_mode', 'designation_ids'], setFacultyLinkError],
    ];
    let shown = false;
    for (const [keys, setter] of setters) {
      const message = keys.map(first).find(Boolean);
      if (message) {
        setter(message);
        shown = true;
      }
    }
    return shown;
  };

  const handleEditClick = (user: User) => {
    setEditingVersion(user.accountVersion ?? '');
    setIsDetailModalOpen(false);
    setFormData({
      first_name: user.first_name,
      middle_initial: user.middle_initial,
      last_name: user.last_name,
      suffix: user.suffix,
      honorific_prefix: user.honorific_prefix,
      credentials: user.credentials,
      username: user.username,
      email: user.email,
      role: user.role,
      department_id: user.department_id ? user.department_id.toString() : '',
      program_id: user.program_id ? user.program_id.toString() : '',
      status: user.status,
    });
    setProfilePicture(user.profile_picture || null);
    setFirstNameError('');
    setLastNameError('');
    setMiddleInitialError('');
    setHonorificPrefixError('');
    setCredentialsError('');
    setEmailError('');
    setDeptError('');
    setProgramError('');
    setEditingId(user.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = async (id: number) => {
    setIsModalOpen(false);
    setIsDetailModalOpen(false);

    const confirmed = await confirm({
      title: 'Archive User Account',
      message: 'The account will be disabled and moved to the Archive. Its linked faculty profile and history will be preserved.',
      eyebrow: 'Archive Record',
      confirmLabel: 'Confirm Archive',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/user/${id}`);
      setUsers(prev => {
        const nextUsers = prev.filter(user => user.id !== id);
        setCachedData<UsersPageData>(usersCacheKey, { users: nextUsers, departments, programs });
        return nextUsers;
      });
      toast.success('Archived', 'User archived successfully');
    } catch (error) {
      toast.error('Archive Failed', apiErrorMessage(error, 'Failed to archive user.'));
    }
  };

  const toggleActive = async (user: User) => {
    const activate = user.status !== 'Active';
    const confirmed = await confirm({
      title: activate ? 'Activate User Account' : 'Deactivate User Account',
      message: activate
        ? `${user.name} will be able to sign in again. This fails if another active ${user.role} already holds the same assignment.`
        : `${user.name} will be signed out and unable to sign in. Another ${user.role} can then be assigned in their place.`,
      eyebrow: 'Account Status',
      confirmLabel: activate ? 'Activate' : 'Deactivate',
      variant: activate ? undefined : 'danger',
    });
    if (!confirmed) return;

    try {
      const res = await api.patch<{ data: ApiUser }>(`/user/${user.id}/status`, {
        is_active: activate,
      });
      const updatedUser = mapApiUser(res.data.data);
      setUsers(prev => {
        const nextUsers = prev.map(u => u.id === user.id ? updatedUser : u);
        setCachedData<UsersPageData>(usersCacheKey, { users: nextUsers, departments, programs });
        return nextUsers;
      });
      toast.success(activate ? 'Activated' : 'Deactivated', `${user.name} is now ${activate ? 'active' : 'inactive'}.`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error('Unable to change status', err?.response?.data?.message || 'Please try again.');
    }
  };

  const [isSendingSetupLink, setIsSendingSetupLink] = useState(false);
  const editingUser = isEditMode && editingId !== null ? users.find(u => u.id === editingId) : undefined;

  const sendSetupLink = async (user: User) => {
    if (isSendingSetupLink) return;
    setIsSendingSetupLink(true);
    try {
      const response = await api.post<{ message: string }>(`/user/${user.id}/invitation`);
      toast.success('Setup link sent', response.data.message);
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error('Unable to send setup link', axiosError.response?.data?.message || 'Please try again.');
    } finally {
      setIsSendingSetupLink(false);
    }
  };

  const unlinkGoogle = async (user: User) => {
    const confirmed = await confirm({
      title: 'Unlink Google Account',
      message: `${user.name} will have to sign in with Google again to relink it before Google login works for this account.`,
      eyebrow: 'Account Access',
      confirmLabel: 'Unlink',
      variant: 'warning',
    });
    if (!confirmed) return;

    try {
      const response = await api.delete<{ data: ApiUser }>(`/user/${user.id}/google-link`);
      const updated = mapApiUser(response.data.data);
      setUsers((previous) => {
        const nextUsers = previous.map((item) => item.id === user.id ? updated : item);
        setCachedData<UsersPageData>(usersCacheKey, { users: nextUsers, departments, programs });
        return nextUsers;
      });
      setSelectedUserForDetail(updated);
      toast.success('Google unlinked', 'The user must link Google again before using Google login.');
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error('Unable to unlink Google', axiosError.response?.data?.message || 'Please try again.');
    }
  };

  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return 'U';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        meta: { cellClassName: 'whitespace-nowrap font-bold text-gray-900' },
        cell: info => {
          const nameStr = info.getValue() as string;
          const userObj = info.row.original;
          const initials = getInitials(nameStr);
          return (
            <div className="flex items-center gap-3">
              {userObj.profile_picture ? (
                <img src={userObj.profile_picture} alt={nameStr} className="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-sm shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4e0a10] to-[#C9952A] flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0">
                  {initials}
                </div>
              )}
              <span className="font-bold text-gray-800">{nameStr}</span>
            </div>
          );
        }
      },
      {
        accessorKey: 'role',
        header: 'Role',
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: info => {
          const roleStr = info.getValue() as string;
          let badgeColor = 'bg-blue-100 text-blue-800 border border-blue-200/50';
          if (roleStr.toLowerCase() === 'secretary' || roleStr.toLowerCase() === 'director') {
            badgeColor = 'bg-green-100 text-green-800 border border-green-200/50';
          } else if (roleStr.toLowerCase() === 'program head') {
            badgeColor = 'bg-purple-100 text-purple-800 border border-purple-200/50';
          }
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider inline-block whitespace-nowrap ${badgeColor}`}>
              {roleStr}
            </span>
          );
        }
      },
      {
        accessorKey: 'department',
        header: 'Department',
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: info => {
          const deptVal = info.getValue();
          return (
            <span className="text-gray-700 text-sm font-semibold whitespace-nowrap block" title={deptVal ? (deptVal as string) : '—'}>
              {deptVal ? (deptVal as string) : '—'}
            </span>
          );
        }
      },
      {
        id: 'program',
        meta: { hideBelow: 'md' },
        accessorFn: row => programs.find(pr => String(pr.id) === String(row.program_id)) ?? null,
        header: 'Program / Major',
        cell: info => {
          const program = info.getValue() as Program | null;
          if (!program) return <span className="text-gray-400 text-sm">-</span>;
          return (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700 whitespace-nowrap">{program.code}</p>
              <p className="whitespace-nowrap text-[11px] text-gray-500" title={program.name}>{program.name}</p>
            </div>
          );
        }
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: info => {
          const statusVal = info.getValue() as string;
          const isActive = statusVal.toLowerCase() === 'active';
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-block whitespace-nowrap ${
              isActive
                ? 'bg-emerald-100 text-emerald-850 border-emerald-200/60'
                : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}>
              {statusVal}
            </span>
          );
        }
      },
      {
        accessorKey: 'createdAt',
        header: 'Created At',
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
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
        meta: { cellClassName: 'whitespace-nowrap text-right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <div className="relative group/tooltip">
              <TableActionButton
                label="Edit"
                variant="edit"
                onClick={(event) => {
                  event.stopPropagation();
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
                label={row.original.status === 'Active' ? 'Deactivate' : 'Activate'}
                variant={row.original.status === 'Active' ? 'neutral' : 'success'}
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleActive(row.original);
                }}
              >
                <Power size={17} />
              </TableActionButton>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                {row.original.status === 'Active' ? 'Deactivate' : 'Activate'}
              </span>
            </div>
            <div className="relative group/tooltip">
              <TableActionButton
                label="Archive"
                variant="archive"
                onClick={(event) => {
                  event.stopPropagation();
                  void triggerDeleteConfirmation(row.original.id);
                }}
              >
                <Archive size={17} />
              </TableActionButton>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                Archive
              </span>
            </div>
          </div>
        )
      }
    ],
    [users, departments, programs]
  );

  const table = useReactTable<User>({
    data: users,
    columns,
    state: { globalFilter, sorting, pagination },
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
      <FilterBar className="mb-6">
        <SearchInput
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search name, username, or role..."
        />

        <div className="flex items-center gap-3 justify-end ml-auto lg:ml-0">
          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1">
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

          <button
            onClick={openCreateModal}
            className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
          >
            <Plus size={15} />
            <span>Add User</span>
          </button>
        </div>
      </FilterBar>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-11 h-11 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
              </div>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <div className="col-span-full py-16 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-white font-sans">
              <p className="text-base font-semibold font-sans">No users found.</p>
              <p className="text-xs font-sans">Try adjusting your search criteria or add a new user.</p>
            </div>
          ) : (
            table.getRowModel().rows.map(row => {
              const u = row.original;
              const initials = getInitials(u.name);
              const deptLogo = u.department_logo || departments.find(d => d.id === u.department_id)?.logo || null;
              const program = programs.find(pr => String(pr.id) === String(u.program_id)) ?? null;
              let badgeColor = 'bg-blue-100 text-blue-800 border border-blue-200/50';
              if (u.role.toLowerCase() === 'secretary' || u.role.toLowerCase() === 'director') {
                badgeColor = 'bg-green-100 text-green-800 border border-green-200/50';
              } else if (u.role.toLowerCase() === 'program head') {
                badgeColor = 'bg-purple-100 text-purple-800 border border-purple-200/50';
              }

              return (
                <div
                  key={u.id}
                  onClick={() => {
                    openDetailModal(u);
                  }}
                  className={`bg-white rounded-2xl border border-gray-100 p-6 flex flex-col justify-between space-y-4 font-sans relative group shadow-sm hover:shadow-md overflow-hidden cursor-pointer ${GRID_CARD_HOVER}`}
                >
                  {deptLogo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 p-4 overflow-hidden">
                      <img
                        src={deptLogo}
                        alt="Department Watermark"
                        className="w-36 h-36 max-w-[75%] max-h-[75%] object-contain opacity-[0.32] select-none transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {u.profile_picture ? (
                          <img src={u.profile_picture} alt={u.name} className="w-11 h-11 rounded-full object-cover border border-gray-200 shadow-sm shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#4e0a10] to-[#C9952A] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                            {initials}
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-gray-800 text-sm leading-snug">{u.name}</h3>
                          <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200/60 inline-block mt-0.5">
                            @{u.username}
                          </span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeColor} shrink-0`}>
                        {u.role}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-gray-400 font-semibold shrink-0">Department:</span>
                        <span className="font-bold text-gray-700 text-right break-words max-w-[200px] leading-tight">{u.department || '—'}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-gray-400 font-semibold shrink-0">Program:</span>
                        <span className="font-bold text-gray-700 text-right break-words max-w-[200px] leading-tight">{program ? program.code : '—'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 font-semibold">Status:</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          u.status.toLowerCase() === 'active'
                            ? 'bg-emerald-100 text-emerald-850 border-emerald-200/60'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                          {u.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between relative z-10">
                    <span className="text-[10px] text-gray-400 font-medium">
                      Added {u.createdAt ? formatPhilippineDate(u.createdAt, { month: 'short', day: '2-digit', year: 'numeric' }) : '—'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(u);
                        }}
                        className="p-1.5 text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                        title="Edit User"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleActive(u);
                        }}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          u.status === 'Active' ? 'text-gray-500 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={u.status === 'Active' ? 'Deactivate User' : 'Activate User'}
                      >
                        <Power size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void triggerDeleteConfirmation(u.id);
                        }}
                        className="p-1.5 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                        title="Archive User"
                      >
                        <Archive size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <DataTable
          table={table}
          isLoading={isLoading}
          emptyTitle="No users found."
          emptyDescription="Try adjusting your search criteria or add a new user."
          totalLabel="users"
          onRowClick={openDetailModal}
          cellClassName={columnId => columnId === 'name' ? 'border-l-4 border-l-transparent' : ''}
        />
      )}

      {isModalOpen && (
        <Modal
          isOpen
          onClose={() => setIsModalOpen(false)}
          title={isEditMode ? 'Edit User Account' : 'Create New Account'}
          description={isEditMode ? 'Update the account holder, role, and department.' : 'Add the account holder, assign their role, and set up teaching if it applies.'}
          size="form"
          busy={isSubmitting}
          closeLabel="Close"
          closeOnOverlayClick={false}
          bodyClassName="flex flex-col"
        >
            <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0 flex-1">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:space-y-4 sm:px-5 sm:py-5">
                <FormSection title="Personal information" description="How the name appears on schedules, reports, and signatories.">
                  <div className="flex items-center gap-3.5 rounded-lg border border-slate-200 bg-[#FBF9F6] p-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-400 transition-colors hover:border-[#5A1220]/40 hover:text-[#5A1220] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] focus-visible:ring-offset-2 cursor-pointer"
                      aria-label={profilePicture ? 'Change profile photo' : 'Upload profile photo'}
                    >
                      {profilePicture ? (
                        <img src={profilePicture} alt="Profile preview" className="h-full w-full object-cover" />
                      ) : previewInitials ? (
                        <span className="text-base font-bold text-[#5A1220]">{previewInitials}</span>
                      ) : (
                        <Camera size={20} />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <Camera size={16} />
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${previewName ? 'text-slate-900' : 'text-slate-400'}`}>
                        {previewName || 'Name preview'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {formData.username ? `@${formData.username}` : 'Username is generated from the department and role'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded font-semibold text-[#5A1220] hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] cursor-pointer"
                        >
                          {profilePicture ? 'Change photo' : 'Upload photo'}
                        </button>
                        {profilePicture ? (
                          <button
                            type="button"
                            onClick={() => {
                              setProfilePicture(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="inline-flex items-center gap-1 rounded font-semibold text-slate-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] cursor-pointer"
                          >
                            <Trash2 size={12} aria-hidden /> Remove
                          </button>
                        ) : (
                          <span className="text-slate-400">JPEG, PNG or WEBP</span>
                        )}
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </div>

                  <div className="grid grid-cols-6 gap-x-3 gap-y-3.5 sm:grid-cols-12">
                    <div className="col-span-6 sm:col-span-5">
                      <label htmlFor="user-last-name" className={FORM_LABEL}>
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="user-last-name"
                        type="text"
                        autoComplete="off"
                        value={formData.last_name}
                        onChange={(e) => {
                          setFormData({ ...formData, last_name: capitalizeNameInput(e.target.value) });
                          setLastNameError('');
                        }}
                        placeholder="e.g. Dela Cruz"
                        className={formInput(!!lastNameError)}
                        {...invalidProps('user-last-name', lastNameError)}
                      />
                      <FieldError id="user-last-name" message={lastNameError} />
                    </div>
                    <div className="col-span-4 sm:col-span-5">
                      <label htmlFor="user-first-name" className={FORM_LABEL}>
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="user-first-name"
                        type="text"
                        autoComplete="off"
                        value={formData.first_name}
                        onChange={(e) => {
                          setFormData({ ...formData, first_name: capitalizeNameInput(e.target.value) });
                          setFirstNameError('');
                        }}
                        placeholder="e.g. Juan"
                        className={formInput(!!firstNameError)}
                        {...invalidProps('user-first-name', firstNameError)}
                      />
                      <FieldError id="user-first-name" message={firstNameError} />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <label htmlFor="user-middle-initial" className={FORM_LABEL}>M.I.</label>
                      <input
                        id="user-middle-initial"
                        type="text"
                        autoComplete="off"
                        maxLength={1}
                        value={formData.middle_initial}
                        onChange={(e) => {
                          setFormData({ ...formData, middle_initial: e.target.value.toUpperCase() });
                          setMiddleInitialError('');
                        }}
                        placeholder="D"
                        className={`${formInput(!!middleInitialError)} uppercase text-center`}
                        {...invalidProps('user-middle-initial', middleInitialError)}
                      />
                      <FieldError id="user-middle-initial" message={middleInitialError} />
                    </div>
                    <div className="col-span-3 sm:col-span-3">
                      <label htmlFor="user-suffix" className={FORM_LABEL}>Suffix</label>
                      <select
                        id="user-suffix"
                        value={formData.suffix}
                        onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                        className={`${formInput()} cursor-pointer`}
                      >
                        <option value="">None</option>
                        {NAME_SUFFIXES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3 sm:col-span-3">
                      <label htmlFor="user-honorific-prefix" className={FORM_LABEL}>Title</label>
                      <select
                        id="user-honorific-prefix"
                        value={formData.honorific_prefix}
                        onChange={(e) => {
                          setFormData({ ...formData, honorific_prefix: e.target.value });
                          setHonorificPrefixError('');
                        }}
                        className={`${formInput(!!honorificPrefixError)} cursor-pointer`}
                        {...invalidProps('user-honorific-prefix', honorificPrefixError)}
                      >
                        <option value="">None</option>
                        {titleOptions(nameOptions.honorific_prefixes, formData.honorific_prefix).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <FieldError id="user-honorific-prefix" message={honorificPrefixError} />
                    </div>
                    <div className="col-span-6 sm:col-span-6">
                      <label htmlFor="user-credentials" className={FORM_LABEL}>Credentials / Degrees</label>
                      <input
                        id="user-credentials"
                        type="text"
                        autoComplete="off"
                        maxLength={CREDENTIALS_MAX_LENGTH}
                        value={formData.credentials}
                        onChange={(e) => {
                          setFormData({ ...formData, credentials: e.target.value });
                          setCredentialsError('');
                        }}
                        placeholder="e.g. PhD, EdD"
                        className={formInput(!!credentialsError)}
                        {...invalidProps('user-credentials', credentialsError)}
                      />
                      <FieldError id="user-credentials" message={credentialsError} />
                    </div>
                    {!isEditMode && effectiveFacultyMode === 'link' && (
                      <p className={`col-span-6 sm:col-span-12 -mt-2 ${modalHint}`}>
                        Leave Title and Credentials blank to keep the linked instructor&rsquo;s saved values.
                      </p>
                    )}
                  </div>
                </FormSection>

                <FormSection title="Account details" description="Sign-in email, role, and where this account works.">
                  <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="user-email" className={FORM_LABEL}>
                        Institutional Email <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          id="user-email"
                          type="email"
                          required
                          autoComplete="off"
                          value={formData.email}
                          onChange={(e) => {
                            setFormData({ ...formData, email: e.target.value });
                            setEmailError('');
                          }}
                          placeholder="name@school.edu.ph"
                          className={`${formInput(!!emailError)} pl-9`}
                          {...invalidProps('user-email', emailError, 'user-email-hint')}
                        />
                      </div>
                      <FieldError id="user-email" message={emailError} />
                      {!emailError && (
                        <p id="user-email-hint" className={modalHint}>Google sign-in links on first login and must match this email.</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="user-role" className={FORM_LABEL}>Role</label>
                      <select
                        id="user-role"
                        value={formData.role}
                        onChange={(e) => {
                          const nextRole = e.target.value;
                          setFormData({
                            ...formData,
                            role: nextRole,
                            program_id: nextRole === 'Program Head' ? formData.program_id : '',
                          });
                          setProgramError('');
                          setFacultyLinkError('');
                        }}
                        className={`${formInput()} cursor-pointer`}
                        aria-describedby={officeSlotHolder ? 'user-role-slot-notice' : 'user-role-hint'}
                      >
                        <option value="Dean">Dean</option>
                        <option value="Program Head">Program Head</option>
                        <option value="Secretary">Secretary</option>
                        <option value="Director">Director</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="user-department" className={FORM_LABEL}>
                        Assigned Department <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="user-department"
                        value={formData.department_id}
                        onChange={(e) => {
                          setFormData({ ...formData, department_id: e.target.value, program_id: '' });
                          setDeptError('');
                          setProgramError('');
                          setFacultyLinkError('');
                        }}
                        className={`${formInput(!!deptError)} cursor-pointer ${formData.department_id ? '' : 'text-slate-400'}`}
                        {...invalidProps('user-department', deptError)}
                      >
                        <option value="">Select a department...</option>
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.id} className="text-slate-800">{dept.department_name}</option>
                        ))}
                      </select>
                      <FieldError id="user-department" message={deptError} />
                    </div>

                    <div className="sm:col-span-2 -mt-1.5">
                      {officeSlotHolder ? (
                        <p id="user-role-slot-notice" role="status" className={`rounded-lg border px-3 py-2 text-xs font-semibold leading-5 ${modalNotice.warning}`}>
                          This department already has an active {officeSlotHolder.role} ({officeSlotHolder.name}). A department has one Secretary or one Director; deactivate that account first.
                        </p>
                      ) : (
                        <p id="user-role-hint" className="text-xs leading-5 text-slate-500">{ROLE_HINTS[formData.role]}</p>
                      )}
                    </div>

                    {isProgramHeadRole && (
                      <div className="sm:col-span-2 form-reveal">
                        <label htmlFor="user-program" className={FORM_LABEL}>
                          Program / Major <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="user-program"
                          value={formData.program_id}
                          disabled={!formData.department_id}
                          onChange={(e) => {
                            setFormData({ ...formData, program_id: e.target.value });
                            setProgramError('');
                          }}
                          className={`${formInput(!!programError)} cursor-pointer`}
                          {...invalidProps('user-program', programError)}
                        >
                          <option value="">
                            {formData.department_id ? 'Select a program or major...' : 'Select a department first'}
                          </option>
                          {selectedDepartmentPrograms.map((program) => (
                            <option key={program.id} value={program.id}>
                              {programLabel(program)}
                            </option>
                          ))}
                        </select>
                        <FieldError id="user-program" message={programError} />
                        {formData.department_id && selectedDepartmentPrograms.length === 0 && !programError && (
                          <p className={modalHint}>
                            No programs yet. Add one in Department Management.
                          </p>
                        )}
                      </div>
                    )}

                    <fieldset className="sm:col-span-2">
                      <legend className={FORM_LABEL}>Status</legend>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        {(['Active', 'Inactive'] as const).map((status) => {
                          const isSelected = formData.status === status;
                          return (
                            <label
                              key={status}
                              className={`relative flex h-8 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#C9952A] ${
                                isSelected ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              <input
                                type="radio"
                                name="user-status"
                                value={status}
                                checked={isSelected}
                                onChange={() => setFormData({ ...formData, status })}
                                className="sr-only"
                              />
                              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'} ${isSelected ? '' : 'opacity-50'}`} />
                              {status}
                            </label>
                          );
                        })}
                      </div>
                      {formData.status === 'Inactive' && (
                        <p className={modalHint}>Inactive accounts can&rsquo;t sign in until they are activated.</p>
                      )}
                    </fieldset>
                  </div>
                </FormSection>

                {!isEditMode && (
                  <FormSection
                    title="Teaching profile"
                    description={isTeachingRole
                      ? `${formData.role}s carry a teaching load, so this account needs an instructor record.`
                      : 'Connects the account to an instructor record for teaching assignments.'}
                    aside={(
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isTeachingRole ? 'bg-[#5A1220]/[0.08] text-[#5A1220]' : 'bg-slate-100 text-slate-500'}`}>
                        {isTeachingRole ? 'Required' : 'Optional'}
                      </span>
                    )}
                  >
                    {!isTeachingRole && (
                      <label className="relative flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-slate-300 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#C9952A]">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-800">This account also teaches classes</span>
                          <span className="block text-xs text-slate-500">Leave off if they have no teaching load.</span>
                        </span>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={teachesClasses}
                          onChange={(e) => {
                            setTeachesClasses(e.target.checked);
                            setFacultyLinkError('');
                          }}
                          className="peer sr-only"
                        />
                        <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-[#5A1220] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4 motion-reduce:transition-none motion-reduce:after:transition-none" />
                      </label>
                    )}

                    {!teachingApplies && matchingInstructor && (
                      <p className={`rounded-lg border px-3 py-2 text-xs leading-5 ${modalNotice.warning}`}>
                        <span className="font-semibold">{linkableFacultyName(matchingInstructor)}</span> is on this department's roster. Turn on teaching to link them.
                      </p>
                    )}

                    {teachingApplies && (
                      <div className="space-y-3.5 form-reveal">
                        <div role="radiogroup" aria-label="Instructor record" className="grid gap-2 sm:grid-cols-2">
                          {([
                            { mode: 'link', title: 'Link existing instructor', hint: 'Keeps their teaching load and schedule history.' },
                            {
                              mode: 'create',
                              title: 'Create new instructor profile',
                              hint: defaultMaxUnits !== null
                                ? `Adds a full-time instructor with a ${defaultMaxUnits}-unit load.`
                                : 'Adds a full-time instructor with the default load.',
                            },
                          ] as const).map((option) => {
                            const isSelected = facultyMode === option.mode;
                            return (
                              <label
                                key={option.mode}
                                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#C9952A] ${
                                  isSelected
                                    ? 'border-[#5A1220]/50 bg-[#5A1220]/[0.04]'
                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="faculty_mode"
                                  value={option.mode}
                                  checked={isSelected}
                                  onChange={() => {
                                    setFacultyModeTouched(true);
                                    setFacultyMode(option.mode);
                                    setFacultyLinkError('');
                                  }}
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#5A1220] cursor-pointer focus:outline-none"
                                />
                                <span className="min-w-0">
                                  <span className={`block text-sm font-semibold ${isSelected ? 'text-[#5A1220]' : 'text-slate-800'}`}>{option.title}</span>
                                  <span className="block text-xs leading-5 text-slate-500">{option.hint}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>

                        {facultyMode === 'link' && (
                          <div>
                            <span className={FORM_LABEL}>
                              Instructor <span className="text-red-500">*</span>
                            </span>
                            <SearchableSelect
                              aria-label="Instructor"
                              options={instructorOptions}
                              value={linkFacultyId}
                              disabled={!formData.department_id || isLoadingLinkable}
                              hasError={!!facultyLinkError}
                              placeholder={!formData.department_id
                                ? 'Select a department first'
                                : isLoadingLinkable
                                  ? 'Loading instructors...'
                                  : 'Select an instructor...'}
                              searchPlaceholder="Search by name"
                              emptyText="No instructor matches that name"
                              onChange={(value) => {
                                setFacultyModeTouched(true);
                                setLinkFacultyId(value);
                                setFacultyLinkError('');
                              }}
                            />
                            <FieldError message={facultyLinkError} />
                            {matchingInstructor && String(matchingInstructor.id) === linkFacultyId && !facultyLinkError && (
                              <p className="mt-1 text-xs font-semibold text-[#8a6412]">
                                Matched by name to an instructor on this department's roster.
                              </p>
                            )}
                            {formData.department_id && !isLoadingLinkable && linkableFaculty.length === 0 && (
                              <p className={modalHint}>
                                Every instructor in this department is already linked to an account.
                              </p>
                            )}
                          </div>
                        )}

                        {facultyMode === 'create' && (
                          <>
                            {duplicatesRosterInstructor && matchingInstructor && (
                              <p
                                role={facultyLinkError ? 'alert' : undefined}
                                className={`rounded-lg border px-3 py-2 text-xs leading-5 ${
                                  facultyLinkError ? modalNotice.error : modalNotice.warning
                                }`}
                              >
                                <span className="font-semibold">{linkableFacultyName(matchingInstructor)}</span> is already on this department's roster.{' '}
                                <button
                                  type="button"
                                  onClick={switchToLinkMatch}
                                  className="rounded font-bold text-[#5A1220] underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] cursor-pointer"
                                >
                                  Link instead
                                </button>
                              </p>
                            )}
                            {!duplicatesRosterInstructor && <FieldError message={facultyLinkError} />}
                          </>
                        )}

                        {designations.length > 0 && (
                          <div className="border-t border-slate-100 pt-3.5">
                            <span className={FORM_LABEL}>Designations</span>
                            <DesignationPicker designations={designations} value={designationIds} onChange={setDesignationIds} maxUnits={designationMaxUnits} />
                            <p className={modalHint}>
                              {facultyMode === 'link' && designationIds.length === 0
                                ? 'Leave empty to keep the instructor\'s current designations.'
                                : 'Deans and program heads usually carry a reduced load.'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </FormSection>
                )}
              </div>

              <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-black/5 bg-[#F7F4F0] px-4 py-3 sm:px-5">
                {isEditMode && editingUser ? (
                  <ModalButton
                    className="mr-auto"
                    disabled={isSendingSetupLink || editingUser.status !== 'Active' || formData.email.trim().toLowerCase() !== editingUser.email.toLowerCase()}
                    onClick={() => sendSetupLink(editingUser)}
                    title={formData.email.trim().toLowerCase() !== editingUser.email.toLowerCase()
                      ? 'Save the new email first; saving sends the setup link to it'
                      : `Email a one-time setup link to ${editingUser.email}`}
                  >
                    <Mail size={16} /> {isSendingSetupLink ? 'Sending...' : 'Send setup link'}
                  </ModalButton>
                ) : (
                  <p className="mr-auto hidden text-xs text-slate-500 sm:block">
                    A setup link is emailed once the account is created.
                  </p>
                )}
                <ModalButton onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</ModalButton>
                <ModalButton type="submit" variant="primary" loading={isSubmitting} aria-busy={isSubmitting}>
                  {isSubmitting
                    ? (isEditMode ? 'Saving...' : 'Creating...')
                    : (isEditMode ? 'Save Changes' : 'Create Account')
                  }
                </ModalButton>
              </footer>
            </form>
        </Modal>
      )}

      {isDetailModalOpen && selectedUserForDetail && (
        <Modal
          isOpen
          onClose={() => setIsDetailModalOpen(false)}
          title={selectedUserForDetail.name}
          description={`@${selectedUserForDetail.username}`}
          leading={selectedUserForDetail.profile_picture ? (
            <img src={selectedUserForDetail.profile_picture} alt="" className="h-10 w-10 shrink-0 rounded-full border-2 border-white/20 object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white" aria-hidden="true">
              {getInitials(selectedUserForDetail.name)}
            </span>
          )}
          headerActions={<span className="rounded-full bg-[#C9952A] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{selectedUserForDetail.role}</span>}
          footer={<>
            <ModalButton
              disabled={isSendingSetupLink || selectedUserForDetail.status !== 'Active'}
              onClick={() => sendSetupLink(selectedUserForDetail)}
              title="Email a one-time link the user can open to choose a new password"
            >
              <Mail size={16} /> {isSendingSetupLink ? 'Sending...' : 'Send setup link'}
            </ModalButton>
            <ModalButton disabled={!selectedUserForDetail.googleLinked} onClick={() => unlinkGoogle(selectedUserForDetail)}>
              <Link2Off size={16} /> Unlink Google
            </ModalButton>
            <ModalButton onClick={() => setIsDetailModalOpen(false)}>Close</ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => {
                setIsDetailModalOpen(false);
                handleEditClick(selectedUserForDetail);
              }}
            >
              <Pencil size={16} /> Edit User
            </ModalButton>
          </>}
        >
          <dl className="m-4 grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:m-5">
            <div className="col-span-2">
              <dt className={`${modalLabel} mb-1`}>Email</dt>
              <dd className="break-all text-sm font-semibold text-slate-800">{selectedUserForDetail.email || '—'}</dd>
            </div>
            <div>
              <dt className={`${modalLabel} mb-1`}>Department</dt>
              <dd className="break-words text-sm font-semibold text-slate-800">{selectedUserForDetail.department || '—'}</dd>
            </div>
            <div>
              <dt className={`${modalLabel} mb-1`}>Google login</dt>
              <dd className="text-sm font-semibold text-slate-800">{selectedUserForDetail.googleLinked ? 'Linked' : 'Allowed, not linked yet'}</dd>
            </div>
            <div>
              <dt className={`${modalLabel} mb-1`}>Status</dt>
              <dd className="flex items-center gap-1.5 text-sm font-semibold capitalize text-slate-800">
                <span className={`h-2 w-2 rounded-full ${selectedUserForDetail.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
                {selectedUserForDetail.status}
              </dd>
            </div>
            <div>
              <dt className={`${modalLabel} mb-1`}>User ID</dt>
              <dd className="font-mono text-sm font-semibold text-slate-800">#{selectedUserForDetail.id}</dd>
            </div>
            <div>
              <dt className={`${modalLabel} mb-1`}>Date Created</dt>
              <dd className="text-sm font-semibold text-slate-800">
                {selectedUserForDetail.createdAt
                  ? formatPhilippineDate(selectedUserForDetail.createdAt, { month: 'short', day: '2-digit', year: 'numeric' })
                  : '—'}
              </dd>
            </div>
          </dl>
        </Modal>
      )}

    </div>
  );
}
