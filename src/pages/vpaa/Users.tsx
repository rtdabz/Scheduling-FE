import { formatPhilippineDate } from '../../lib/philippineTime';
import { NAME_SUFFIXES, capitalizeNameInput } from '../../lib/formatters';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import {
  Pencil,
  Trash2,
  Search,
  X,
  Loader2,
  Camera,
  Plus,
  Link2Off,
  LayoutGrid,
  List,
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
import { fetchDesignations, type Designation } from '../../lib/designations';
import DesignationPicker from '../../components/faculty/DesignationPicker';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import { programLabel } from '../../lib/programLabel';

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
  allowGoogleLogin: boolean;
  googleLinked: boolean;
  facultyProfileId?: number | null;
  createdAt: string;
}

/** How a new account relates to the instructor roster. Mirrors UserFacultyProfileService::MODES. */
type FacultyMode = 'create' | 'link' | 'none';

interface LinkableFaculty {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employment_type: string | null;
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
  allow_google_login: boolean;
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
  allowGoogleLogin: u.allow_google_login,
  googleLinked: Boolean(u.google_id),
  facultyProfileId: u.faculty_profile?.id ?? null,
  createdAt: u.created_at,
});

// Shared field styling for the account form, kept compact so the dialog fits
// on screen without scrolling.
const FORM_LABEL = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1';
const formInput = (hasError = false) =>
  `w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none text-sm bg-white transition-all disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 ${
    hasError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
  }`;
const FORM_READONLY = 'w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed outline-none text-sm';
const FieldError = ({ message }: { message: string }) =>
  message ? <p className="text-[11px] text-red-500 mt-0.5 font-semibold">{message}</p> : null;

const TEACHING_OPTIONS: { mode: FacultyMode; title: string; hint: string }[] = [
  { mode: 'link', title: 'Link existing instructor', hint: 'Use the roster record, keeping its load and class history.' },
  { mode: 'create', title: 'Create new instructor profile', hint: 'Adds a new full-time instructor (21 units) to the roster.' },
  { mode: 'none', title: 'Non-teaching account', hint: 'No instructor profile. Classes cannot be assigned to this account.' },
];


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
    password: '',
    role: 'Secretary',
    department_id: '',
    program_id: '',
    status: 'Active' as 'Active' | 'Inactive',
    allow_google_login: false,
  });

  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [middleInitialError, setMiddleInitialError] = useState('');
  const [deptError, setDeptError] = useState('');
  const [programError, setProgramError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Teaching profile. Kept apart from formData because it only exists on create:
  // an edit syncs whatever profile the account already has.
  const [facultyMode, setFacultyMode] = useState<FacultyMode>('create');
  // Until the VPAA picks a mode, a name match on the roster may switch it to
  // `link`; once they choose, the suggestion never overrides them.
  const [facultyModeTouched, setFacultyModeTouched] = useState(false);
  const [linkFacultyId, setLinkFacultyId] = useState('');
  const [designationIds, setDesignationIds] = useState<string[]>([]);
  const [linkableFaculty, setLinkableFaculty] = useState<LinkableFaculty[]>([]);
  const [isLoadingLinkable, setIsLoadingLinkable] = useState(false);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [facultyLinkError, setFacultyLinkError] = useState('');

  const resetTeachingProfile = () => {
    setFacultyMode('create');
    setFacultyModeTouched(false);
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

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
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
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const [selectedUserForDetail, setSelectedUserForDetail] = useState<User | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Keep modal states mutually exclusive so dialogs can never stack over one another.
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
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        const temporaryPassword = `Wi${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}A9`;
        setFormData(prev => ({
          ...prev,
          username: generatedUser.toLowerCase(),
          password: temporaryPassword,
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
        // A selection from the previous department is not linkable here.
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

  const matchingInstructor = useMemo(() => {
    const first = formData.first_name.trim().toLowerCase();
    const last = formData.last_name.trim().toLowerCase();
    if (!first || !last) return null;
    return linkableFaculty.find(
      (f) => f.first_name.trim().toLowerCase() === first && f.last_name.trim().toLowerCase() === last,
    ) ?? null;
  }, [linkableFaculty, formData.first_name, formData.last_name]);

  // Suggest linking when the person already appears on the roster, so the
  // default path does not create a second instructor for them.
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

    let hasError = false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      toast.error('Email required', 'Enter a valid institutional email address.');
      hasError = true;
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

    // The API stores a single initial: one letter, no punctuation.
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

    if (!isEditMode && facultyMode === 'link' && !linkFacultyId) {
      setFacultyLinkError('Select the instructor this account belongs to');
      hasError = true;
    } else {
      setFacultyLinkError('');
    }

    if (hasError) return;

    setIsSubmitting(true);

    try {
      const apiRole = API_ROLE_MAP[formData.role] || formData.role.toLowerCase();

      if (isEditMode && editingId !== null) {
        const res = await api.put<{ data: ApiUser }>(`/user/${editingId}`, {
          first_name: formData.first_name.trim(),
          middle_initial: formData.middle_initial.trim() || null,
          last_name: formData.last_name.trim(),
          suffix: formData.suffix || null,
          email: formData.email.trim(),
          password: formData.password,
          role: apiRole,
          department_id: parseInt(formData.department_id),
          program_id: isProgramHeadRole ? parseInt(formData.program_id) : null,
          is_active: formData.status === 'Active',
          allow_google_login: formData.allow_google_login,
          profile_picture: profilePicture,
        });
        const updatedUser = mapApiUser(res.data.data);
        setUsers(prev => {
          const nextUsers = prev.map(u => u.id === editingId ? updatedUser : u);
          setCachedData<UsersPageData>(usersCacheKey, { users: nextUsers, departments, programs });
          return nextUsers;
        });
        toast.success('Success', 'User account updated successfully');
      } else {
        const res = await api.post<{ data: ApiUser }>('/user', {
          first_name: formData.first_name.trim(),
          middle_initial: formData.middle_initial.trim() || null,
          last_name: formData.last_name.trim(),
          suffix: formData.suffix || null,
          username: formData.username,
          email: formData.email.trim(),
          password: formData.password,
          role: apiRole,
          department_id: parseInt(formData.department_id),
          program_id: isProgramHeadRole ? parseInt(formData.program_id) : null,
          is_active: formData.status === 'Active',
          allow_google_login: formData.allow_google_login,
          profile_picture: profilePicture,
          faculty_mode: facultyMode,
          faculty_id: facultyMode === 'link' ? parseInt(linkFacultyId) : null,
          designation_ids: facultyMode !== 'none' ? designationIds.map(Number) : [],
        });
        const createdUser = mapApiUser(res.data.data);
        setUsers(prev => {
          const nextUsers = [createdUser, ...prev];
          setCachedData<UsersPageData>(usersCacheKey, { users: nextUsers, departments, programs });
          return nextUsers;
        });
        toast.success('Success', 'User account created successfully');
      }

      setFormData({ first_name: '', middle_initial: '', last_name: '', suffix: '', username: '', email: '', password: '', role: 'Secretary', department_id: '', program_id: '', status: 'Active', allow_google_login: false });
      resetTeachingProfile();
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingId(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err?.response?.data?.message || 'Failed to save user account';
      toast.error('Error', message);
    } finally {
      setIsSubmitting(false);
    }
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
      password: '••••••••',
      role: user.role,
      department_id: user.department_id ? user.department_id.toString() : '',
      program_id: user.program_id ? user.program_id.toString() : '',
      status: user.status,
      allow_google_login: user.allowGoogleLogin,
    });
    setProfilePicture(user.profile_picture || null);
    setFirstNameError('');
    setLastNameError('');
    setMiddleInitialError('');
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
    } catch {
      toast.error('Error', 'Failed to archive user');
    }
  };

  const unlinkGoogle = async (user: User) => {
    try {
      const response = await api.delete<{ data: ApiUser }>(`/user/${user.id}/google-link`);
      const updated = mapApiUser(response.data.data);
      setUsers((previous) => previous.map((item) => item.id === user.id ? updated : item));
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
        accessorKey: 'username',
        header: 'Username',
        cell: info => (
          <span className="font-mono text-xs text-gray-600 bg-gray-100/80 px-2 py-1 rounded border border-gray-200/50">
            {info.getValue() as string}
          </span>
        )
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: info => {
          const roleStr = info.getValue() as string;
          let badgeColor = 'bg-blue-100 text-blue-800 border border-blue-200/50';
          if (roleStr.toLowerCase() === 'secretary') {
            badgeColor = 'bg-green-100 text-green-800 border border-green-200/50';
          } else if (roleStr.toLowerCase() === 'program head') {
            badgeColor = 'bg-purple-100 text-purple-800 border border-purple-200/50';
          }
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${badgeColor}`}>
              {roleStr}
            </span>
          );
        }
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: info => {
          const deptVal = info.getValue();
          return <span className="text-gray-600 text-sm">{deptVal ? (deptVal as string) : '—'}</span>;
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
              <p className="text-sm font-semibold text-gray-700">{program.code}</p>
              <p className="max-w-44 truncate text-[11px] text-gray-500">{program.name}</p>
            </div>
          );
        }
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: info => {
          const statusVal = info.getValue() as string;
          const isActive = statusVal.toLowerCase() === 'active';
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
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
                label="Archive"
                variant="danger"
                onClick={(event) => {
                  event.stopPropagation();
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
      {/* Search and Actions Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between font-sans mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search name, username, or role..."
            className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] bg-gray-50/30 focus:bg-white transition-all font-sans font-semibold text-gray-800"
          />
        </div>

        {/* Action Group: View Mode Toggle + Add User */}
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
              setIsDetailModalOpen(false);
              setFormData({ first_name: '', middle_initial: '', last_name: '', suffix: '', username: '', email: '', password: '', role: 'Secretary', department_id: '', program_id: '', status: 'Active', allow_google_login: false });
              setFirstNameError('');
              setLastNameError('');
              setMiddleInitialError('');
              setDeptError('');
              resetTeachingProfile();
              setIsModalOpen(true);
            }}
            className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
          >
            <Plus size={15} />
            <span>Add User</span>
          </button>
        </div>
      </div>

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
                          void triggerDeleteConfirmation(u.id);
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Archive User"
                      >
                        <Trash2 size={16} />
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
          <div className={`bg-[#F7F4F0] rounded-2xl w-full ${isEditMode ? 'max-w-2xl' : 'max-w-5xl'} max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200`}>
            <div className="px-5 py-3.5 flex justify-between items-center bg-[#4e0a10] shrink-0">
              <h2 className="text-lg font-bold text-white font-display">
                {isEditMode ? 'Edit User Account' : 'Create New Account'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0 flex-1">
              {/* Very short viewports (phones) still get a scrollable body; desktop layouts fit without it. */}
              <div className={`min-h-0 flex-1 overflow-y-auto p-5 grid gap-5 ${isEditMode ? '' : 'lg:grid-cols-[1.15fr_1fr]'}`}>
                {/* Account details */}
                <div className="space-y-3">
                  <div className="flex gap-4 items-start">
                    <div className="relative shrink-0">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-[4.5rem] h-[4.5rem] rounded-full border-2 border-dashed border-gray-300 hover:border-[#5A1220] bg-white shadow-sm overflow-hidden flex items-center justify-center transition-all cursor-pointer"
                        title={profilePicture ? 'Click photo to change' : 'Click to upload user profile photo'}
                      >
                        {profilePicture ? (
                          <img src={profilePicture} alt="User Preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-400 hover:text-[#5A1220] transition-colors">
                            <Camera size={20} />
                            <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Photo</span>
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

                    <div className="grid gap-3 grid-cols-[1fr_1fr_3.5rem_5.5rem] flex-1 min-w-0">
                      <div>
                        <label className={FORM_LABEL}>
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
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
                        <label className={FORM_LABEL}>
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
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
                        <label className={FORM_LABEL}>M.I.</label>
                        <input
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
                        <label className={FORM_LABEL}>Suffix</label>
                        <select
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

                  <div>
                    <label className={FORM_LABEL}>
                      Institutional Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="name@school.edu.ph"
                      className={formInput()}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={FORM_LABEL}>Username</label>
                      <input
                        type="text"
                        value={formData.username}
                        readOnly
                        placeholder={isEditMode ? '' : 'Auto-generated'}
                        className={`${FORM_READONLY} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL}>Password</label>
                      <input type="text" value={formData.password} readOnly placeholder={isEditMode ? '' : 'Auto-generated'} className={FORM_READONLY} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={FORM_LABEL}>Role</label>
                      <select
                        value={formData.role}
                        onChange={(e) => {
                          const nextRole = e.target.value;
                          setFormData({
                            ...formData,
                            role: nextRole,
                            program_id: nextRole === 'Program Head' ? formData.program_id : '',
                          });
                          setProgramError('');
                        }}
                        className={`${formInput()} cursor-pointer`}
                      >
                        <option value="Dean">Dean</option>
                        <option value="Program Head">Program Head</option>
                        <option value="Secretary">Secretary</option>
                      </select>
                    </div>
                    <div>
                      <label className={FORM_LABEL}>Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Active' | 'Inactive' })}
                        className={`${formInput()} cursor-pointer`}
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className={`grid gap-3 ${isProgramHeadRole ? 'grid-cols-2' : ''}`}>
                    <div>
                      <label className={FORM_LABEL}>
                        Assigned Department <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.department_id}
                        onChange={(e) => {
                          setFormData({ ...formData, department_id: e.target.value, program_id: '' });
                          setDeptError('');
                          setProgramError('');
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
                        <label className={FORM_LABEL}>
                          Program / Major <span className="text-red-500">*</span>
                        </label>
                        <select
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

                  <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={formData.allow_google_login} onChange={(e) => setFormData({ ...formData, allow_google_login: e.target.checked })} className="h-4 w-4 accent-[#5A1220] shrink-0" />
                    <span className="text-sm font-bold text-gray-800">Allow Google login</span>
                    <span className="text-[11px] text-gray-500 truncate">Links on first sign-in; must match the email above.</span>
                  </label>
                </div>

                {/* Teaching profile (create only) */}
                {!isEditMode && (
                  <section className="rounded-xl border border-[#C9952A]/25 bg-white/70 p-4 space-y-3 self-start w-full">
                    <div>
                      <h3 className="text-sm font-bold text-[#4e0a10]">Teaching Profile</h3>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Link the person if they are already on the instructor roster, so they are not scheduled twice.
                      </p>
                    </div>

                    <div role="radiogroup" aria-label="Teaching profile" className="grid gap-2">
                      {TEACHING_OPTIONS.map((option) => (
                        <label
                          key={option.mode}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            facultyMode === option.mode ? 'border-[#5A1220] bg-[#5A1220]/5' : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="faculty_mode"
                            value={option.mode}
                            checked={facultyMode === option.mode}
                            onChange={() => {
                              setFacultyModeTouched(true);
                              setFacultyMode(option.mode);
                              setFacultyLinkError('');
                            }}
                            className="mt-0.5 h-4 w-4 accent-[#5A1220]"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-gray-800">{option.title}</span>
                            <span className="block text-[11px] text-gray-500">{option.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>

                    {facultyMode === 'link' && (
                      <div>
                        <label className={FORM_LABEL}>
                          Instructor <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={linkFacultyId}
                          disabled={!formData.department_id || isLoadingLinkable}
                          onChange={(e) => {
                            setFacultyModeTouched(true);
                            setLinkFacultyId(e.target.value);
                            setFacultyLinkError('');
                          }}
                          className={formInput(!!facultyLinkError)}
                        >
                          <option value="">
                            {!formData.department_id
                              ? 'Select a department first'
                              : isLoadingLinkable
                                ? 'Loading instructors...'
                                : 'Select an instructor...'}
                          </option>
                          {linkableFaculty.map((f) => (
                            <option key={f.id} value={f.id}>
                              {linkableFacultyName(f)}{f.status === 'inactive' ? ' (inactive)' : ''}
                            </option>
                          ))}
                        </select>
                        <FieldError message={facultyLinkError} />
                        {matchingInstructor && String(matchingInstructor.id) === linkFacultyId && !facultyLinkError && (
                          <p className="text-[11px] text-[#8a6412] mt-0.5 font-semibold">
                            Matched by name to an instructor already on this department's roster.
                          </p>
                        )}
                        {formData.department_id && !isLoadingLinkable && linkableFaculty.length === 0 && (
                          <p className="text-[11px] text-gray-500 mt-0.5 font-semibold">
                            Every instructor in this department is already linked to an account.
                          </p>
                        )}
                      </div>
                    )}

                    {facultyMode !== 'none' && designations.length > 0 && (
                      <div>
                        <label className={FORM_LABEL}>Designations</label>
                        <DesignationPicker designations={designations} value={designationIds} onChange={setDesignationIds} />
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {facultyMode === 'link' && designationIds.length === 0
                            ? 'Leave empty to keep the instructor\'s current designations.'
                            : 'Deans and program heads usually carry a reduced load.'}
                        </p>
                      </div>
                    )}
                  </section>
                )}
              </div>

              <div className="flex justify-end gap-3 px-5 py-3.5 border-t border-gray-200/80 bg-gray-50/50 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-w-[8rem] px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-w-[8rem] flex items-center justify-center gap-2 px-4 py-2 bg-[#4e0a10] text-white rounded-xl hover:bg-[#C9952A] transition-colors disabled:opacity-50 text-sm font-semibold cursor-pointer"
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

      {/* User Detail Modal */}
      {isDetailModalOpen && selectedUserForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl relative group animate-in zoom-in-95 duration-200 font-sans">
            {/* Header Banner */}
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

            {/* Modal Body */}
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
                  <p className="text-xs font-bold text-gray-700">{selectedUserForDetail.googleLinked ? 'Linked' : selectedUserForDetail.allowGoogleLogin ? 'Approved, not linked' : 'Disabled'}</p>
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

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-200/80 flex flex-wrap items-center justify-end gap-3">
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
