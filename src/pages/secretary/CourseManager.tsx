import React, { useState, useEffect, useMemo } from 'react';
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
  Filter
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
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData, clearCachedKey } from '../../lib/dataCache';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface Course {
  id: number;
  course_code: string;
  course_name: string;
  lecture_hours: number;
  lab_hours: number;
  units: number;
  course_category: 'major' | 'minor';
  room_type_required: 'lecture' | 'laboratory' | 'field' | 'online';
  year_level: '1' | '2' | '3' | '4';
  semester: '1st' | '2nd' | 'summer';
  department_id: number | null;
  department: Department | null;
  status: 'active' | 'inactive';
  created_at?: string;
}

interface ApiCourse {
  id: number;
  course_code?: string;
  subject_code?: string;
  course_name?: string;
  subject_name?: string;
  lecture_hours: number;
  lab_hours: number;
  units: number;
  course_category?: 'major' | 'minor';
  subject_category?: 'major' | 'minor';
  room_type_required: 'lecture' | 'laboratory' | 'field' | 'online';
  year_level: '1' | '2' | '3' | '4';
  semester: '1st' | '2nd' | 'summer';
  department_id: number | null;
  department: Department | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface CoursesPageData {
  courses: Course[];
  departments: Department[];
}

const mapApiCourse = (s: ApiCourse): Course => ({
  id: s.id,
  course_code: s.course_code || s.subject_code || '',
  course_name: s.course_name || s.subject_name || '',
  lecture_hours: s.lecture_hours || 0,
  lab_hours: s.lab_hours || 0,
  units: s.units || 0,
  course_category: ((s.course_category || s.subject_category) as string) === 'major' ? 'major' : 'minor',
  room_type_required: s.room_type_required,
  year_level: s.year_level,
  semester: s.semester,
  department_id: s.department_id,
  department: s.department,
  status: s.status,
  created_at: s.created_at
});

export default function CourseManager() {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const coursesCacheKey = `page:courses:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  const cachedCoursesData = getCachedData<CoursesPageData>(coursesCacheKey);
  const [courses, setCourses] = useState<Course[]>(cachedCoursesData?.courses ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedCoursesData?.departments ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(coursesCacheKey));

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const isDean = user?.role?.toLowerCase() === 'dean';
  const isSecretary = user?.role?.toLowerCase() === 'secretary';
  const canManageCourses = isVpaa || isDean || isSecretary;

  // Filter States
  const [yearLevelFilter, setYearLevelFilter] = useState<string>('all');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');

  // Table States
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      const matchYear = yearLevelFilter === 'all' || c.year_level?.toString() === yearLevelFilter;
      const matchSem = semesterFilter === 'all' || c.semester === semesterFilter;
      return matchYear && matchSem;
    });
  }, [courses, yearLevelFilter, semesterFilter]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);

  // Form state
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [lectureHours, setLectureHours] = useState<number>(3);
  const [labHours, setLabHours] = useState<number>(0);
  const [units, setUnits] = useState<number>(3);
  const [courseCategory, setCourseCategory] = useState<'major' | 'minor'>('major');
  const [roomTypeRequired, setRoomTypeRequired] = useState<'lecture' | 'laboratory' | 'field' | 'online'>('lecture');
  const [yearLevel, setYearLevel] = useState<'1' | '2' | '3' | '4'>('1');
  const [semester, setSemester] = useState<'1st' | '2nd' | 'summer'>('1st');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error states
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');
  const [unitsError, setUnitsError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(coursesCacheKey));
    try {
      const data = await loadCachedData<CoursesPageData>(coursesCacheKey, async () => {
        const url = user?.department_id ? `/courses?department_id=${user.department_id}` : '/courses';
        const [coursesRes, deptsRes] = await Promise.all([
          api.get<ApiCourse[]>(url),
          api.get<Department[]>('/departments')
        ]);
        return {
          courses: coursesRes.data.map(mapApiCourse),
          departments: deptsRes.data,
        };
      }, forceRefresh);
      setCourses(data.courses);
      setDepartments(data.departments);
    } catch {
      toast.error('Error', 'Failed to load courses and departments data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const trimmedCode = courseCode.trim();
    const trimmedName = courseName.trim();

    if (!trimmedCode) {
      setCodeError('Course code is required');
      hasError = true;
    } else if (trimmedCode.length > 50) {
      setCodeError('Course code must not exceed 50 characters');
      hasError = true;
    } else {
      setCodeError('');
    }

    if (!trimmedName) {
      setNameError('Course name is required');
      hasError = true;
    } else if (trimmedName.length > 100) {
      setNameError('Course name must not exceed 100 characters');
      hasError = true;
    } else {
      setNameError('');
    }

    if (units < 0) {
      setUnitsError('Units cannot be negative');
      hasError = true;
    } else {
      setUnitsError('');
    }

    if (hasError) return;

    setIsSubmitting(true);

    try {
      const payload = {
        course_code: trimmedCode,
        course_name: trimmedName,
        lecture_hours: Number(lectureHours),
        lab_hours: Number(labHours),
        units: Number(units),
        course_category: courseCategory,
        room_type_required: roomTypeRequired,
        year_level: yearLevel,
        semester,
        department_id: isVpaa ? (departmentId ? parseInt(departmentId) : null) : (user?.department_id ? Number(user.department_id) : null),
        status
      };

      if (isEditMode && editingId !== null) {
        const res = await api.put<ApiCourse>(`/courses/${editingId}`, payload);
        const updatedCourse = mapApiCourse(res.data);
        setCourses(prev => {
          const nextCourses = prev.map(s => s.id === editingId ? updatedCourse : s);
          setCachedData<CoursesPageData>(coursesCacheKey, { courses: nextCourses, departments });
          return nextCourses;
        });
        toast.success('Success', 'Course updated successfully');
      } else {
        const res = await api.post<ApiCourse>('/courses', payload);
        const createdCourse = mapApiCourse(res.data);
        setCourses(prev => {
          const nextCourses = [createdCourse, ...prev];
          setCachedData<CoursesPageData>(coursesCacheKey, { courses: nextCourses, departments });
          return nextCourses;
        });
        toast.success('Success', 'Course created successfully');
      }

      setIsModalOpen(false);
      resetForm();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string, errors?: Record<string, string[]> } } };
      const apiErrors = err?.response?.data?.errors;
      if (apiErrors && (apiErrors.course_code || apiErrors.subject_code)) {
        setCodeError(apiErrors.course_code?.[0] || apiErrors.subject_code?.[0] || 'Code error');
      } else {
        const message = err?.response?.data?.message || 'Failed to save course';
        toast.error('Error', message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCourseCode('');
    setCourseName('');
    setLectureHours(3);
    setLabHours(0);
    setUnits(3);
    setCourseCategory('major');
    setRoomTypeRequired('lecture');
    setYearLevel('1');
    setSemester('1st');
    setDepartmentId(isVpaa ? '' : (user?.department_id?.toString() || ''));
    setStatus('active');
    setCodeError('');
    setNameError('');
    setUnitsError('');
    setEditingId(null);
    setIsEditMode(false);
  };

  const handleEditClick = (course: Course) => {
    setCourseCode(course.course_code);
    setCourseName(course.course_name);
    setLectureHours(course.lecture_hours);
    setLabHours(course.lab_hours);
    setUnits(course.units);
    setCourseCategory(course.course_category);
    setRoomTypeRequired(course.room_type_required);
    setYearLevel(course.year_level);
    setSemester(course.semester);
    setDepartmentId(course.department_id ? course.department_id.toString() : '');
    setStatus(course.status);
    setCodeError('');
    setNameError('');
    setUnitsError('');
    setEditingId(course.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteCourse = async () => {
    if (idToDelete !== null) {
      try {
        await api.delete(`/courses/${idToDelete}`);
        setCourses(prev => {
          const nextCourses = prev.filter(s => s.id !== idToDelete);
          setCachedData<CoursesPageData>(coursesCacheKey, { courses: nextCourses, departments });
          return nextCourses;
        });
        toast.success('Deleted', 'Course removed successfully');
      } catch {
        toast.error('Error', 'Failed to delete course');
      } finally {
        setIsDeleteModalOpen(false);
        setIdToDelete(null);
      }
    }
  };

  const columns = useMemo<ColumnDef<Course>[]>(
    () => {
      const cols: ColumnDef<Course>[] = [
        {
          accessorKey: 'course_code',
          header: 'Code',
          cell: info => (
            <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
              {info.getValue() as string}
            </span>
          )
        },
        {
          accessorKey: 'course_name',
          header: 'Course Name',
          cell: info => <span className="font-bold text-gray-800">{info.getValue() as string}</span>
        },
        {
          id: 'year_sem',
          header: 'Yr & Sem',
          accessorFn: row => `${row.year_level} - ${row.semester}`,
          cell: info => <span className="text-gray-600 font-medium text-xs">{info.getValue() as string}</span>
        },
        {
          accessorKey: 'course_category',
          header: 'Category',
          cell: info => {
            const raw = (info.getValue() as string) || '';
            const val = raw.toLowerCase() === 'major' ? 'major' : 'minor';
            const badgeColor = val === 'minor'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-rose-50 text-rose-700 border-rose-200';
            return (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                {val}
              </span>
            );
          }
        },
        {
          accessorKey: 'units',
          header: 'Units',
          cell: info => <span className="font-bold text-gray-700 text-xs">{info.getValue() as number}</span>
        },
        {
          id: 'hours',
          header: 'Lec / Lab Hours',
          accessorFn: row => `${row.lecture_hours} / ${row.lab_hours}`,
          cell: info => <span className="text-gray-600 font-medium text-xs">{info.getValue() as string} hrs</span>
        },
        {
          accessorKey: 'room_type_required',
          header: 'Room Type',
          cell: info => {
            const val = (info.getValue() as string) || '';
            let badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
            if (val === 'laboratory') {
              badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
            } else if (val === 'online') {
              badgeColor = 'bg-green-50 text-green-700 border-green-200';
            } else if (val === 'field') {
              badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
            }
            return (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                {val}
              </span>
            );
          }
        },
        {
          accessorKey: 'department',
          header: 'Department',
          cell: info => {
            const dept = info.getValue() as Department | null;
            return (
              <span className="text-gray-700 font-semibold text-xs">
                {dept ? dept.department_code : 'General / All'}
              </span>
            );
          }
        },
        {
          accessorKey: 'status',
          header: 'Status',
          cell: info => {
            const val = (info.getValue() as string) || 'active';
            let badgeColor = 'bg-green-50 text-green-700 border-green-200';
            if (val === 'inactive') {
              badgeColor = 'bg-red-50 text-red-700 border-red-200';
            }
            return (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                {val}
              </span>
            );
          }
        }
      ];

      if (canManageCourses) {
        cols.push({
          id: 'actions',
          header: () => <div className="text-right">Actions</div>,
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1.5">
              <div className="relative group">
                <button
                  onClick={() => handleEditClick(row.original)}
                  className="p-2 text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Pencil size={17} />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                  Edit
                </span>
              </div>
              <div className="relative group">
                <button
                  onClick={() => triggerDeleteConfirmation(row.original.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 size={17} />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                  Delete
                </span>
              </div>
            </div>
          )
        });
      }

      return cols;
    },
    [canManageCourses]
  );

  const table = useReactTable<Course>({
    data: filteredCourses,
    columns,
    state: {
      globalFilter,
      sorting,
      pagination
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div className="w-full">
      {/* Top Bar Section */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search course code, name, etc..."
              className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm shadow-sm bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm">
              <Filter size={14} className="text-gray-400" />
              <span className="text-gray-500">Year:</span>
              <select
                value={yearLevelFilter}
                onChange={(e) => setYearLevelFilter(e.target.value)}
                className="bg-transparent outline-none font-bold text-[#4e0a10] cursor-pointer"
              >
                <option value="all">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm">
              <Filter size={14} className="text-gray-400" />
              <span className="text-gray-500">Sem:</span>
              <select
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
                className="bg-transparent outline-none font-bold text-[#4e0a10] cursor-pointer"
              >
                <option value="all">All Semesters</option>
                <option value="1st">1st Sem</option>
                <option value="2nd">2nd Sem</option>
                <option value="summer">Summer</option>
              </select>
            </div>
          </div>
        </div>
        {canManageCourses && (
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="bg-[#4e0a10] text-white px-5 py-2.5 rounded-xl hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm shrink-0"
          >
            <span className="text-lg leading-none">+</span> Add Course
          </button>
        )}
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="bg-gray-50/75 border-b border-gray-100">
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
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-8" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-20 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16 rounded-full" />
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
                  <td colSpan={10} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-base font-semibold">No courses found.</p>
                      <p className="text-xs">Try adjusting your search criteria or add a new course.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`transition-colors h-12 hover:bg-gray-50/70 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                    }`}
                  >
                    {row.getVisibleCells().map(cell => {
                      const isNoWrap = ['course_code', 'actions'].includes(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          className={`px-4 py-2.5 align-middle text-xs ${
                            isNoWrap ? 'whitespace-nowrap' : ''
                          }`}
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
                )} of {table.getFilteredRowModel().rows.length} courses
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

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-[#1A1410] font-display">
                {isEditMode ? 'Edit Course' : 'Add New Course'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Course Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={courseCode}
                    onChange={(e) => {
                      setCourseCode(e.target.value.toUpperCase());
                      setCodeError('');
                    }}
                    placeholder="e.g. CS-401"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                      codeError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  />
                  {codeError && <p className="text-xs text-red-500 mt-1 font-semibold">{codeError}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Course Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => {
                      setCourseName(e.target.value);
                      setNameError('');
                    }}
                    placeholder="e.g. Software Engineering"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                      nameError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  />
                  {nameError && <p className="text-xs text-red-500 mt-1 font-semibold">{nameError}</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Lec Hours
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={lectureHours}
                    onChange={(e) => {
                      const newLec = parseInt(e.target.value) || 0;
                      setLectureHours(newLec);
                      setUnits(newLec + labHours);
                      setUnitsError('');
                    }}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Lab Hours
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={labHours}
                    onChange={(e) => {
                      const newLab = parseInt(e.target.value) || 0;
                      setLabHours(newLab);
                      setUnits(lectureHours + newLab);
                      setUnitsError('');
                    }}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Units <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={units}
                    onChange={(e) => {
                      setUnits(parseInt(e.target.value) || 0);
                      setUnitsError('');
                    }}
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                      unitsError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Course Category
                  </label>
                  <select
                    value={courseCategory}
                    onChange={(e) => setCourseCategory(e.target.value as 'major' | 'minor')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Room Type Required
                  </label>
                  <select
                    value={roomTypeRequired}
                    onChange={(e) => setRoomTypeRequired(e.target.value as 'lecture' | 'laboratory' | 'field' | 'online')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="lecture">Lecture</option>
                    <option value="laboratory">Laboratory</option>
                    <option value="field">Field</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Year Level
                  </label>
                  <select
                    value={yearLevel}
                    onChange={(e) => setYearLevel(e.target.value as '1' | '2' | '3' | '4')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                    <option value="4">4th Year</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Semester
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value as '1st' | '2nd' | 'summer')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="1st">1st Semester</option>
                    <option value="2nd">2nd Semester</option>
                    <option value="summer">Summer</option>
                  </select>
                </div>
              </div>

              {isVpaa && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Department
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="">General / All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.department_code} - {dept.department_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-[#4e0a10] hover:bg-[#C9952A] text-white font-semibold text-sm rounded-xl transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEditMode ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Course?</h3>
            <p className="text-xs text-gray-500 mb-6">
              Are you sure you want to delete this course? This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCourse}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
