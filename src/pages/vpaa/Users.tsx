import { formatPhilippineDate } from '../../lib/philippineTime';
import { NAME_SUFFIXES, capitalizeNameInput } from '../../lib/formatters';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import SearchInput from '../../components/ui/SearchInput';
import {
  Pencil,
  X,
  Loader2,
  Camera,
  Plus,
  Link2Off,
  Mail,
  LayoutGrid,
  List,
  Power,
  Archive,
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
  id: number;
  name: string;
  first_name: string;
  middle_initial: string;
  last_name: string;
  suffix: string;
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

interface LinkableFaculty {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employment_type: string | null;
  max_units: number | null;
  program_id: number | null;
  status: string | null;
}


const linkableFacultyName = (f: LinkableFaculty) =>
  [f.last_name && `${f.last_name},`, f.first_name, f.middle_name].filter(Boolean).join(' ');

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
  id: number;
  name: string;
  first_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  suffix?: string | null;
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
};

const API_ROLE_MAP: Record<string, string> = {
  'Dean': 'dean',
  'Program Head': 'program_head',
  'Secretary': 'secretary',
};

const mapApiUser = (u: ApiUser): User => ({
  id: u.id,
  name: u.name,
  first_name: u.first_name ?? '',
  middle_initial: u.middle_initial ?? '',
  last_name: u.last_name ?? '',
  suffix: u.suffix ?? '',
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

const FORM_LABEL = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1';
const formInput = (hasError = false) =>
  `w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none text-sm bg-white transition-all disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 ${
    hasError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
  }`;
const FieldError = ({ message }: { message: string }) =>
  message ? <p className="text-[11px] text-red-500 mt-0.5 font-semibold">{message}</p> : null;

const FormSection = ({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#4e0a10]">{title}</h3>
      {aside}
    </div>
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
  const usersCacheKey = 'page:users';
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
  const [emailError, setEmailError] = useState('');
  const [deptError, setDeptError] = useState('');
  const [programError, setProgramError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    if (hasError) return;

    setIsSubmitting(true);

    try {
      const apiRole = API_ROLE_MAP[formData.role] || formData.role.toLowerCase();

      if (isEditMode && editingId !== null) {
        const res = await api.put<{ message: string; data: ApiUser }>(`/user/${editingId}`, {
          first_name: formData.first_name.trim(),
          middle_initial: formData.middle_initial.trim() || null,
          last_name: formData.last_name.trim(),
          suffix: formData.suffix || null,
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

      setFormData({ first_name: '', middle_initial: '', last_name: '', suffix: '', username: '', email: '', role: 'Secretary', department_id: '', program_id: '', status: 'Active' });
      resetTeachingProfile();
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingId(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; errors?: FieldErrors } } };
      const message = err?.response?.data?.message || 'Failed to save user account';
      if (!showServerFieldErrors(err?.response?.data?.errors)) toast.error('Error', message);
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
    setIsDetailModalOpen(false);
    setFormData({
      first_name: user.first_name,
      middle_initial: user.middle_initial,
      last_name: user.last_name,
      suffix: user.suffix,
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
      const res = await api.put<{ data: ApiUser }>(`/user/${user.id}`, {
        first_name: user.first_name,
        middle_initial: user.middle_initial || null,
        last_name: user.last_name,
        suffix: user.suffix || null,
        email: user.email,
        role: API_ROLE_MAP[user.role] || user.role.toLowerCase(),
        department_id: user.department_id,
        program_id: user.program_id,
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
          if (roleStr.toLowerCase() === 'secretary') {
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
        meta: { cellClassName: 'whitespace-nowrap' },
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
              setIsDetailModalOpen(false);
              setFormData({ first_name: '', middle_initial: '', last_name: '', suffix: '', username: '', email: '', role: 'Secretary', department_id: '', program_id: '', status: 'Active' });
              setFirstNameError('');
              setLastNameError('');
              setMiddleInitialError('');
              setEmailError('');
              setDeptError('');
              setProgramError('');
              resetTeachingProfile();
              setIsModalOpen(true);
            }}
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
              if (u.role.toLowerCase() === 'secretary') {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-form-title"
            className={`bg-[#F7F4F0] rounded-2xl w-full ${isEditMode ? 'max-w-2xl' : 'max-w-4xl'} max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200`}
          >
            <div className="px-5 py-3.5 flex justify-between items-center bg-[#4e0a10] shrink-0">
              <h2 id="user-form-title" className="text-lg font-bold text-white font-display">
                {isEditMode ? 'Edit User Account' : 'Create New Account'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0 flex-1">
              <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 grid gap-x-6 gap-y-5 ${isEditMode ? '' : 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]'}`}>
                <div className="min-w-0 space-y-5">
                  <FormSection title="Personal Information">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="relative shrink-0 self-center sm:self-start">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 hover:border-[#5A1220] bg-white overflow-hidden flex items-center justify-center transition-colors cursor-pointer"
                          title={profilePicture ? 'Change photo' : 'Upload profile photo'}
                          aria-label={profilePicture ? 'Change profile photo' : 'Upload profile photo'}
                        >
                          {profilePicture ? (
                            <img src={profilePicture} alt="Profile preview" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex flex-col items-center justify-center text-gray-400 hover:text-[#5A1220] transition-colors">
                              <Camera size={18} />
                              <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Photo</span>
                            </span>
                          )}
                        </button>
                        {profilePicture && (
                          <button
                            type="button"
                            onClick={() => {
                              setProfilePicture(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md cursor-pointer"
                            title="Remove photo"
                            aria-label="Remove photo"
                          >
                            <X size={10} />
                          </button>
                        )}
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </div>

                      <div className="grid flex-1 min-w-0 gap-3 grid-cols-2 sm:grid-cols-[1fr_1fr_3.5rem_5.5rem]">
                        <div>
                          <label htmlFor="user-last-name" className={FORM_LABEL}>
                            Last Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="user-last-name"
                            type="text"
                            value={formData.last_name}
                            onChange={(e) => {
                              setFormData({ ...formData, last_name: capitalizeNameInput(e.target.value) });
                              setLastNameError('');
                            }}
                            placeholder="e.g. Dela Cruz"
                            className={formInput(!!lastNameError)}
                          />
                          <FieldError message={lastNameError} />
                        </div>
                        <div>
                          <label htmlFor="user-first-name" className={FORM_LABEL}>
                            First Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="user-first-name"
                            type="text"
                            value={formData.first_name}
                            onChange={(e) => {
                              setFormData({ ...formData, first_name: capitalizeNameInput(e.target.value) });
                              setFirstNameError('');
                            }}
                            placeholder="e.g. Juan"
                            className={formInput(!!firstNameError)}
                          />
                          <FieldError message={firstNameError} />
                        </div>
                        <div>
                          <label htmlFor="user-middle-initial" className={FORM_LABEL}>M.I.</label>
                          <input
                            id="user-middle-initial"
                            type="text"
                            maxLength={1}
                            value={formData.middle_initial}
                            onChange={(e) => {
                              setFormData({ ...formData, middle_initial: e.target.value.toUpperCase() });
                              setMiddleInitialError('');
                            }}
                            placeholder="D"
                            className={`${formInput(!!middleInitialError)} uppercase text-center`}
                          />
                          <FieldError message={middleInitialError} />
                        </div>
                        <div>
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
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="Account Details">
                    <div>
                      <label htmlFor="user-email" className={FORM_LABEL}>
                        Institutional Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="user-email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => {
                          setFormData({ ...formData, email: e.target.value });
                          setEmailError('');
                        }}
                        placeholder="name@school.edu.ph"
                        className={formInput(!!emailError)}
                      />
                      <FieldError message={emailError} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
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
                        >
                          <option value="Dean">Dean</option>
                          <option value="Program Head">Program Head</option>
                          <option value="Secretary">Secretary</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="user-status" className={FORM_LABEL}>Status</label>
                        <select
                          id="user-status"
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Active' | 'Inactive' })}
                          className={`${formInput()} cursor-pointer`}
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>

                    <div className={`grid gap-3 ${isProgramHeadRole ? 'sm:grid-cols-2' : ''}`}>
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
                          className={`${formInput(!!deptError)} cursor-pointer`}
                        >
                          <option value="">Select a department...</option>
                          {departments.map((dept) => (
                            <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                          ))}
                        </select>
                        <FieldError message={deptError} />
                      </div>

                      {isProgramHeadRole && (
                        <div>
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
                            className={formInput(!!programError)}
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
                          <FieldError message={programError} />
                          {formData.department_id && selectedDepartmentPrograms.length === 0 && !programError && (
                            <p className="text-[11px] text-gray-500 mt-0.5 font-semibold">
                              No programs yet. Add one in Department Management.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-500">
                      Google sign-in links on first login and must match this email.
                    </p>
                  </FormSection>
                </div>

                {!isEditMode && (
                  <div className="min-w-0 lg:border-l lg:border-gray-200 lg:pl-6">
                    <FormSection
                      title="Teaching Profile"
                      aside={(
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          {isTeachingRole ? 'Required' : 'Optional'}
                        </span>
                      )}
                    >
                      {isTeachingRole ? (
                        <p className="text-[11px] text-gray-500">
                          {formData.role}s carry a teaching load, so this account needs an instructor record.
                        </p>
                      ) : (
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={teachesClasses}
                            onChange={(e) => {
                              setTeachesClasses(e.target.checked);
                              setFacultyLinkError('');
                            }}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#5A1220] cursor-pointer"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-gray-800">This account also teaches classes</span>
                            <span className="block text-[11px] text-gray-500">Leave unchecked if they have no teaching load.</span>
                          </span>
                        </label>
                      )}

                      {!teachingApplies && matchingInstructor && (
                        <p className="text-[11px] font-semibold text-[#8a6412]">
                          {linkableFacultyName(matchingInstructor)} is on this department's roster. Check the box above to link them.
                        </p>
                      )}

                      {teachingApplies && (
                        <>
                          <div role="radiogroup" aria-label="Instructor record" className="space-y-1">
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
                                  className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                                    isSelected ? 'bg-[#5A1220]/[0.06]' : 'hover:bg-white/70'
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
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#5A1220] cursor-pointer"
                                  />
                                  <span className="min-w-0">
                                    <span className={`block text-sm font-semibold ${isSelected ? 'text-[#5A1220]' : 'text-gray-800'}`}>{option.title}</span>
                                    <span className="block text-[11px] text-gray-500">{option.hint}</span>
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
                                <p className="text-[11px] text-[#8a6412] mt-0.5 font-semibold">
                                  Matched by name to an instructor on this department's roster.
                                </p>
                              )}
                              {formData.department_id && !isLoadingLinkable && linkableFaculty.length === 0 && (
                                <p className="text-[11px] text-gray-500 mt-0.5 font-semibold">
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
                                  className={`rounded-lg border px-3 py-2 text-[11px] ${
                                    facultyLinkError ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-900'
                                  }`}
                                >
                                  <span className="font-semibold">{linkableFacultyName(matchingInstructor)}</span> is already on this department's roster.{' '}
                                  <button
                                    type="button"
                                    onClick={switchToLinkMatch}
                                    className="font-bold text-[#5A1220] underline underline-offset-2 cursor-pointer"
                                  >
                                    Link instead
                                  </button>
                                </p>
                              )}
                              {!duplicatesRosterInstructor && <FieldError message={facultyLinkError} />}
                            </>
                          )}

                          {designations.length > 0 && (
                            <div>
                              <span className={FORM_LABEL}>Designations</span>
                              <DesignationPicker designations={designations} value={designationIds} onChange={setDesignationIds} maxUnits={designationMaxUnits} />
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                {facultyMode === 'link' && designationIds.length === 0
                                  ? 'Leave empty to keep the instructor\'s current designations.'
                                  : 'Deans and program heads usually carry a reduced load.'}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </FormSection>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-3 px-5 py-3.5 border-t border-gray-200/80 bg-gray-50/50 shrink-0">
                {isEditMode && editingUser && (
                  <button
                    type="button"
                    disabled={isSendingSetupLink || editingUser.status !== 'Active' || formData.email.trim().toLowerCase() !== editingUser.email.toLowerCase()}
                    onClick={() => sendSetupLink(editingUser)}
                    title={formData.email.trim().toLowerCase() !== editingUser.email.toLowerCase()
                      ? 'Save the new email first; saving sends the setup link to it'
                      : `Email a one-time setup link to ${editingUser.email}`}
                    className="mr-auto flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Mail size={14} /> {isSendingSetupLink ? 'Sending...' : 'Send setup link'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="min-w-[8rem] px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="min-w-[8rem] flex items-center justify-center gap-2 px-4 py-2 bg-[#4e0a10] text-white rounded-xl hover:bg-[#C9952A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold cursor-pointer"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isSubmitting
                    ? (isEditMode ? 'Saving...' : 'Creating...')
                    : (isEditMode ? 'Save Changes' : 'Create Account')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDetailModalOpen && selectedUserForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl relative group animate-in zoom-in-95 duration-200 font-sans">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                {selectedUserForDetail.profile_picture ? (
                  <img
                    src={selectedUserForDetail.profile_picture}
                    alt={selectedUserForDetail.name}
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4e0a10] to-[#C9952A] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                    {getInitials(selectedUserForDetail.name)}
                  </div>
                )}
                <div>
                  <h2 className="text-base font-bold text-[#1A1410] font-display">{selectedUserForDetail.name}</h2>
                  <p className="text-xs text-gray-500 font-mono">@{selectedUserForDetail.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#C9952A] text-white shadow-2xs">
                  {selectedUserForDetail.role}
                </span>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs col-span-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Email</p>
                  <p className="text-xs font-bold text-gray-700 break-all">{selectedUserForDetail.email || '—'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Department</p>
                  <p className="text-xs font-bold text-gray-800 break-words leading-relaxed">{selectedUserForDetail.department || '—'}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Google login</p>
                  <p className="text-xs font-bold text-gray-700">{selectedUserForDetail.googleLinked ? 'Linked' : 'Allowed, not linked yet'}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-700 capitalize">{selectedUserForDetail.status}</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">User ID</p>
                  <p className="text-xs font-mono font-bold text-gray-700">#{selectedUserForDetail.id}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-1 shadow-xs">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Date Created</p>
                  <p className="text-xs font-bold text-gray-700">
                    {selectedUserForDetail.createdAt
                      ? formatPhilippineDate(selectedUserForDetail.createdAt, { month: 'short', day: '2-digit', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200/80 flex flex-wrap items-center justify-end gap-3">
                <button
                  disabled={isSendingSetupLink || selectedUserForDetail.status !== 'Active'}
                  onClick={() => sendSetupLink(selectedUserForDetail)}
                  title="Email a one-time link the user can open to choose a new password"
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Mail size={14} /> {isSendingSetupLink ? 'Sending...' : 'Send setup link'}
                </button>
                <button
                  disabled={!selectedUserForDetail.googleLinked}
                  onClick={() => unlinkGoogle(selectedUserForDetail)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Link2Off size={14} /> Unlink Google
                </button>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleEditClick(selectedUserForDetail);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#5A1220] hover:bg-[#410b15] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Pencil size={14} />
                  <span>Edit User</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
