import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import {
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  X,
  Loader2,
  Plus,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Award,
  BookOpen,
  Layers,
  Info
} from 'lucide-react';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface AssignedSubject {
  id: number;
  subject_code: string;
  subject_name: string;
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
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  overload_units: number;
  deload_units: number;
  probono_units: number;
  assigned_units: number;
  assigned_subjects: AssignedSubject[];
  assigned_classes: AssignedClass[];
  department_id: number;
  department: Department | null;
  status: 'active' | 'inactive';
  createdAt?: string;
}

interface ApiFacultyMember {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  overload_units?: number | null;
  deload_units?: number | null;
  probono_units?: number | null;
  assigned_units?: number | null;
  assigned_subjects?: AssignedSubject[] | null;
  assigned_classes?: AssignedClass[] | null;
  department_id: number;
  department?: Department | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface FacultyPageData {
  faculties: FacultyMember[];
  departments: Department[];
}

const mapApiFaculty = (f: ApiFacultyMember): FacultyMember => ({
  id: f.id,
  first_name: f.first_name,
  last_name: f.last_name,
  middle_name: f.middle_name,
  employment_type: f.employment_type,
  max_units: f.max_units || 21,
  overload_units: f.overload_units || 0,
  deload_units: f.deload_units || 0,
  probono_units: f.probono_units || 0,
  assigned_units: f.assigned_units || 0,
  assigned_subjects: f.assigned_subjects || [],
  assigned_classes: f.assigned_classes || [],
  department_id: f.department_id,
  department: f.department || null,
  status: f.status || 'active',
  createdAt: f.created_at
});

const getWorkloadStatus = (f: FacultyMember) => {
  const required = f.max_units - f.deload_units;
  if (f.assigned_units > required) {
    if (f.probono_units > 0) {
      return {
        label: 'Pro Bono',
        color: 'text-purple-600 bg-purple-50 border-purple-200',
        dot: 'bg-purple-500'
      };
    }
    return {
      label: 'Overloaded',
      color: 'text-red-600 bg-red-50 border-red-200',
      dot: 'bg-red-500'
    };
  }
  if (f.assigned_units === required) {
    return {
      label: 'Fully Loaded',
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      dot: 'bg-blue-500'
    };
  }
  return {
    label: 'Available',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    dot: 'bg-emerald-500'
  };
};

export default function SecretaryFaculty() {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const facultyCacheKey = `page:faculty:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  const cachedFacultyData = getCachedData<FacultyPageData>(facultyCacheKey);
  const [faculties, setFaculties] = useState<FacultyMember[]>(cachedFacultyData?.faculties ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedFacultyData?.departments ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(facultyCacheKey));

  // Filters & Sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const isDean = user?.role?.toLowerCase() === 'dean';
  const isSecretary = user?.role?.toLowerCase() === 'secretary';
  const isProgramHead = user?.role?.toLowerCase() === 'program_head';
  const canManageFaculty = isVpaa || isSecretary || isProgramHead;

  const isInstructorsPath = window.location.pathname.includes('instructors');
  const title = isInstructorsPath ? 'Instructors' : 'Faculty';

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsFaculty, setDetailsFaculty] = useState<FacultyMember | null>(null);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [employmentType, setEmploymentType] = useState<'full-time' | 'part-time'>('full-time');
  const [maxUnits, setMaxUnits] = useState<number>(21);
  const [overloadUnits, setOverloadUnits] = useState<number>(0);
  const [deloadUnits, setDeloadUnits] = useState<number>(0);
  const [probonoUnits, setProbonoUnits] = useState<number>(0);
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form error states
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [maxUnitsError, setMaxUnitsError] = useState('');
  const [departmentError, setDepartmentError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(facultyCacheKey));
    try {
      const data = await loadCachedData<FacultyPageData>(facultyCacheKey, async () => {
        const [facultiesRes, deptsRes] = await Promise.all([
          api.get<ApiFacultyMember[]>('/faculties'),
          api.get<Department[]>('/departments')
        ]);
        return {
          faculties: facultiesRes.data.map(mapApiFaculty),
          departments: deptsRes.data,
        };
      }, forceRefresh);
      setFaculties(data.faculties);
      setDepartments(data.departments);
    } catch {
      toast.error('Error', 'Failed to load faculties and departments.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (faculty: FacultyMember) => {
    setFirstName(faculty.first_name);
    setLastName(faculty.last_name);
    setMiddleName(faculty.middle_name || '');
    setEmploymentType(faculty.employment_type);
    setMaxUnits(faculty.max_units);
    setOverloadUnits(faculty.overload_units);
    setDeloadUnits(faculty.deload_units);
    setProbonoUnits(faculty.probono_units);
    setDepartmentId(faculty.department_id ? faculty.department_id.toString() : '');
    setStatus(faculty.status);

    setFirstNameError('');
    setLastNameError('');
    setMaxUnitsError('');
    setDepartmentError('');

    setEditingId(faculty.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteFaculty = async () => {
    if (idToDelete !== null) {
      try {
        await api.delete(`/faculties/${idToDelete}`);
        setFaculties(prev => {
          const nextFaculties = prev.filter(f => f.id !== idToDelete);
          setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments });
          return nextFaculties;
        });
        toast.success('Deleted', 'Instructor removed successfully');
      } catch {
        toast.error('Error', 'Failed to delete instructor');
      } finally {
        setIsDeleteModalOpen(false);
        setIdToDelete(null);
      }
    }
  };

  const handleViewDetails = (faculty: FacultyMember) => {
    setDetailsFaculty(faculty);
    setIsDetailsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedMiddle = middleName.trim();

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

    if (maxUnits <= 0) {
      setMaxUnitsError('Maximum units must be greater than 0');
      hasError = true;
    } else {
      setMaxUnitsError('');
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
      middle_name: trimmedMiddle || null,
      employment_type: employmentType,
      max_units: maxUnits,
      overload_units: overloadUnits,
      deload_units: deloadUnits,
      probono_units: probonoUnits,
      department_id: Number(deptVal),
      status
    };

    try {
      if (isEditMode && editingId !== null) {
        const res = await api.put<ApiFacultyMember>(`/faculties/${editingId}`, payload);
        const updatedFaculty = mapApiFaculty(res.data);
        setFaculties(prev => {
          const nextFaculties = prev.map(f => f.id === editingId ? updatedFaculty : f);
          setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments });
          return nextFaculties;
        });
        toast.success('Updated', 'Instructor updated successfully');
      } else {
        const res = await api.post<ApiFacultyMember>('/faculties', payload);
        const createdFaculty = mapApiFaculty(res.data);
        setFaculties(prev => {
          const nextFaculties = [createdFaculty, ...prev];
          setCachedData<FacultyPageData>(facultyCacheKey, { faculties: nextFaculties, departments });
          return nextFaculties;
        });
        toast.success('Created', 'Instructor created successfully');
      }
      setIsModalOpen(false);
    } catch {
      toast.error('Error', isEditMode ? 'Failed to update instructor' : 'Failed to create instructor');
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
        const middleInitial = f.middle_name ? `${f.middle_name.charAt(0)}.` : '';
        const fullName = `${f.last_name}, ${f.first_name} ${middleInitial}`.toLowerCase();
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

  // General workload stats summary
  const summaryStats = useMemo(() => {
    let available = 0;
    let fullyLoaded = 0;
    let overloaded = 0;
    let probono = 0;

    filteredFaculties.forEach(f => {
      const statusDetails = getWorkloadStatus(f);
      if (statusDetails.label === 'Available') available++;
      else if (statusDetails.label === 'Fully Loaded') fullyLoaded++;
      else if (statusDetails.label === 'Overloaded') overloaded++;
      else if (statusDetails.label === 'Pro Bono') probono++;
    });

    return {
      total: filteredFaculties.length,
      available,
      fullyLoaded,
      overloaded,
      probono
    };
  }, [filteredFaculties]);

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Summary Statistics Dashboard Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
        <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200">
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Instructors</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-1">{summaryStats.total}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200">
          <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 size={13} className="text-emerald-500" />
            Available
          </p>
          <p className="text-3xl font-extrabold text-emerald-700 mt-1">{summaryStats.available}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200">
          <p className="text-xs text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1">
            <Info size={13} className="text-blue-500" />
            Fully Loaded
          </p>
          <p className="text-3xl font-extrabold text-blue-700 mt-1">{summaryStats.fullyLoaded}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200">
          <p className="text-xs text-red-600 font-bold uppercase tracking-wider flex items-center gap-1">
            <AlertCircle size={13} className="text-red-500" />
            Overloaded
          </p>
          <p className="text-3xl font-extrabold text-red-700 mt-1">{summaryStats.overloaded}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 col-span-2 md:col-span-1">
          <p className="text-xs text-purple-600 font-bold uppercase tracking-wider flex items-center gap-1">
            <Award size={13} className="text-purple-500" />
            Pro Bono
          </p>
          <p className="text-3xl font-extrabold text-purple-700 mt-1">{summaryStats.probono}</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search instructors by name..."
            className="w-full pl-11 pr-4 py-2 border border-gray-200 rounded-lg outline-none text-xs focus:ring-1 focus:ring-[#C9952A] bg-gray-50/50 focus:bg-white transition-all font-sans"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Department Filter (Only for VPAA) */}
          {isVpaa && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-gray-400" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-2 py-1.5 border border-gray-250 rounded-lg outline-none text-[11px] bg-white text-gray-700 font-sans focus:ring-1 focus:ring-[#C9952A]"
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
              className="px-2 py-1.5 border border-gray-250 rounded-lg outline-none text-[11px] bg-white text-gray-700 font-sans focus:ring-1 focus:ring-[#C9952A]"
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
              className="px-2 py-1.5 border border-gray-250 rounded-lg outline-none text-[11px] bg-white text-gray-700 font-sans focus:ring-1 focus:ring-[#C9952A]"
            >
              <option value="name">Sort by Name</option>
              <option value="units">Sort by Workload Units</option>
              <option value="remaining">Sort by Remaining Units</option>
              <option value="workload">Sort by Workload %</option>
            </select>
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
                setEmploymentType('full-time');
                setMaxUnits(21);
                setOverloadUnits(0);
                setDeloadUnits(0);
                setProbonoUnits(0);
                setDepartmentId(isVpaa ? '' : (user?.department_id?.toString() || ''));
                setStatus('active');

                setFirstNameError('');
                setLastNameError('');
                setMaxUnitsError('');
                setDepartmentError('');
                setIsModalOpen(true);
              }}
              className="bg-[#4e0a10] text-white px-4 py-1.5 rounded-lg hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-1.5 font-semibold text-xs shadow-sm cursor-pointer ml-auto"
            >
              <Plus size={15} />
              <span>Add Instructor</span>
            </button>
          )}
        </div>
      </div>

      {/* Redesigned Card-based visual dashboard */}
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
          sortedFaculties.map((f) => {
            const statusDetails = getWorkloadStatus(f);
            const name = `${f.last_name}, ${f.first_name} ${f.middle_name ? f.middle_name.charAt(0) + '.' : ''}`.trim();
            const required = f.max_units - f.deload_units;
            const pct = required > 0 ? Math.round((f.assigned_units / required) * 100) : 0;
            
            let progressColor = 'bg-[#F5A623]';
            if (f.assigned_units > required) {
              progressColor = f.probono_units > 0 ? 'bg-purple-500' : 'bg-red-500';
            } else if (f.assigned_units === required) {
              progressColor = 'bg-blue-500';
            }

            const remaining = Math.max(0, required - f.assigned_units);

            return (
              <div key={f.id} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between font-sans relative group">
                <div className="space-y-4">
                  {/* Header: Name, Dept, Status */}
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm leading-snug">{name}</h3>
                      <span className="text-[10px] text-gray-500 font-semibold mt-1 block">
                        {f.department ? `${f.department.department_code} - ${f.department.department_name}` : 'No Department'}
                      </span>
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
                      <span className="text-gray-700">{f.assigned_units} / {required} Units ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Card stats / details */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-3 border-t border-gray-50 text-xs font-sans">
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
                              {sub.subject_code}
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
                <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-100 mt-4">
                  <button
                    onClick={() => handleViewDetails(f)}
                    className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline cursor-pointer"
                  >
                    View Details
                  </button>
                  {canManageFaculty && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditClick(f)}
                        className="p-1.5 text-gray-500 hover:text-[#C9952A] hover:bg-amber-50 border border-transparent hover:border-amber-100 rounded-lg cursor-pointer transition-all"
                        title="Edit Instructor"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => triggerDeleteConfirmation(f.id)}
                        className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg cursor-pointer transition-all"
                        title="Delete Instructor"
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

      {/* View Details Modal Overlay */}
      {isDetailsModalOpen && detailsFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
          <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-base font-bold text-[#1A1410] font-sans">
                  {detailsFaculty.first_name} {detailsFaculty.last_name}
                </h2>
                <span className="text-[10px] text-gray-500 font-semibold block mt-0.5 font-sans">
                  {detailsFaculty.department ? `${detailsFaculty.department.department_code} - ${detailsFaculty.department.department_name}` : 'No Department'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto font-sans">
              {/* Load Metrics Breakdown Card */}
              <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm space-y-3 font-sans">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Required Load Balance</h3>
                
                <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                  <div>
                    <span className="text-gray-400 block font-semibold">Max Units (Base)</span>
                    <span className="font-bold text-gray-800">{detailsFaculty.max_units} Units</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold">Deload Units</span>
                    <span className="font-bold text-gray-800">{detailsFaculty.deload_units} Units</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold">Overload Units</span>
                    <span className="font-bold text-gray-800">{detailsFaculty.overload_units} Units</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold">Pro Bono Units</span>
                    <span className="font-bold text-gray-800">{detailsFaculty.probono_units} Units</span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3 flex justify-between items-center text-xs font-sans">
                  <div>
                    <span className="text-gray-400 block font-semibold">Assigned Load</span>
                    <span className="font-bold text-gray-800">{detailsFaculty.assigned_units} Units</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold">Net Required Load</span>
                    <span className="font-bold text-gray-800">{detailsFaculty.max_units - detailsFaculty.deload_units} Units</span>
                  </div>
                </div>
              </div>

              {/* Assigned Subjects Panel */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-600 uppercase tracking-wider font-sans">
                  <BookOpen size={14} className="text-gray-400" />
                  <span>Assigned Subjects ({detailsFaculty.assigned_subjects.length})</span>
                </div>
                {detailsFaculty.assigned_subjects.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No assigned subjects scheduled for this term.</p>
                ) : (
                  <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-100 overflow-hidden font-sans">
                    {detailsFaculty.assigned_subjects.map(s => (
                      <div key={s.id} className="p-3 flex justify-between items-center text-xs font-sans">
                        <span className="font-mono bg-slate-50 border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold uppercase">
                          {s.subject_code}
                        </span>
                        <span className="font-semibold text-gray-600 text-right truncate max-w-[240px]" title={s.subject_name}>
                          {s.subject_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assigned Classes Panel */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-600 uppercase tracking-wider font-sans">
                  <Layers size={14} className="text-gray-400" />
                  <span>Assigned Section Classes ({detailsFaculty.assigned_classes.length})</span>
                </div>
                {detailsFaculty.assigned_classes.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No assigned classes scheduled for this term.</p>
                ) : (
                  <div className="bg-white border border-gray-100 rounded-xl p-3 flex flex-wrap gap-2 font-sans">
                    {detailsFaculty.assigned_classes.map(c => (
                      <span key={c.id} className="text-xs bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded font-bold uppercase font-sans">
                        {c.section_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-gray-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-4 py-2 border border-gray-250 bg-white rounded-xl hover:bg-gray-50 text-gray-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-[#1A1410] font-display">
                {isEditMode ? 'Edit Instructor' : 'Add New Instructor'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[80vh] overflow-y-auto font-sans">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setFirstNameError('');
                    }}
                    placeholder="John"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                      firstNameError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  />
                  {firstNameError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{firstNameError}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setLastNameError('');
                    }}
                    placeholder="Doe"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                      lastNameError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  />
                  {lastNameError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{lastNameError}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                  Middle Name
                </label>
                <input
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  placeholder="Smith"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                    Max Units <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={maxUnits}
                    onChange={(e) => {
                      setMaxUnits(Number(e.target.value));
                      setMaxUnitsError('');
                    }}
                    min="1"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                      maxUnitsError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  />
                  {maxUnitsError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{maxUnitsError}</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Deload Units
                  </label>
                  <input
                    type="number"
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
                  <input
                    type="number"
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
                  <input
                    type="number"
                    value={probonoUnits}
                    onChange={(e) => setProbonoUnits(Number(e.target.value))}
                    min="0"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                  />
                </div>
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
                    }}
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                      departmentError
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

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200/80 bg-gray-50/50 -mx-6 -mb-6 p-6 font-sans">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 font-sans"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  <span>{isEditMode ? 'Save Changes' : 'Add Instructor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-6 animate-in zoom-in-95 duration-200 font-sans">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 border border-red-100 animate-pulse font-sans">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-2 font-sans">Delete Instructor</h3>
            <p className="text-gray-500 text-sm mb-6 font-sans">
              Are you sure you want to delete this instructor? This action cannot be undone and will permanently remove this record from the database.
            </p>
            <div className="flex justify-end gap-3 font-sans">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteFaculty}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-sm font-sans"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
