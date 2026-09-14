import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/ui/DataTable';
import {
  Search,
  Filter,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';

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
  
  const [courses, setCourses] = useState<Course[]>(() => {
    const cached = getCachedData<CoursesPageData>(coursesCacheKey);
    return cached?.courses ?? [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    return !hasCachedData(coursesCacheKey);
  });

  // Table States
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  const [yearLevelFilter, setYearLevelFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [semesterFilter, setSemesterFilter] = useState('all');

  const filteredCourses = useMemo(() => {
    const list = courses.filter((course) => {
      const matchYear = yearLevelFilter === 'all' || course.year_level?.toString() === yearLevelFilter;
      const matchCategory = categoryFilter === 'all' || course.course_category?.toLowerCase() === categoryFilter.toLowerCase();
      const matchSemester = semesterFilter === 'all' || course.semester?.toLowerCase() === semesterFilter.toLowerCase();
      return matchYear && matchCategory && matchSemester;
    });

    const semOrder: Record<string, number> = { '1st': 1, '2nd': 2, 'summer': 3 };

    return [...list].sort((a, b) => {
      const yA = Number(a.year_level || 0);
      const yB = Number(b.year_level || 0);
      if (yA !== yB) return yA - yB;

      const sA = semOrder[a.semester?.toLowerCase() || ''] || 99;
      const sB = semOrder[b.semester?.toLowerCase() || ''] || 99;
      if (sA !== sB) return sA - sB;

      return (a.course_code || '').localeCompare(b.course_code || '');
    });
  }, [courses, yearLevelFilter, categoryFilter, semesterFilter]);

  useEffect(() => {
    fetchData();
  }, []);

  useLiveRefresh(['courses', 'curriculum'], () => { void fetchData(true); });

  const fetchData = async (silent = false) => {
    // Only show skeleton loader if we don't have any cached courses
    if (!silent && !hasCachedData(coursesCacheKey)) {
      setIsLoading(true);
    }
    try {
      // Force refresh to always get the most up-to-date active curriculum
      const data = await loadCachedData<CoursesPageData>(coursesCacheKey, async () => {
        const url = user?.department_id ? `/courses?department_id=${user.department_id}` : '/courses';
        const [coursesRes] = await Promise.all([
          api.get<ApiCourse[]>(url)
        ]);
        return {
          courses: coursesRes.data.map(mapApiCourse),
          departments: []
        };
      }, true);
      setCourses(data.courses);
    } catch {
      toast.error('Error', 'Failed to load courses data.');
    } finally {
      setIsLoading(false);
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
          accessorKey: 'year_level',
          header: 'Year Level',
          cell: info => {
            const val = (info.getValue() as string) || '';
            return <span className="font-bold text-gray-700 text-xs">{val}</span>;
          }
        },
        {
          accessorKey: 'semester',
          header: 'Semester',
          cell: info => {
            const val = (info.getValue() as string) || '';
            return <span className="font-bold text-gray-700 text-xs capitalize">{val}</span>;
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
        }
      ];
      return cols;
    },
    []
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

  const courseGuideSteps = useMemo(() => [
    { element: '#course-list-filters input[type="text"]', action: 'input' as const, taskHint: 'Type in the search box to continue.', title: 'Find a course', description: 'Search by code or name. Filter by year, category, or semester.', side: 'bottom' as const },
    { element: '#course-list-table', title: 'Check course details', description: 'Review units, category, semester, and department.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'course-list', isReady: true, steps: courseGuideSteps, mission: 'Manage Courses' });

  return (
    <div className="w-full">
      {/* Search and Filters Bar */}
      <div id="course-list-filters" className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between font-sans mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search course code, name, etc..."
            className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] bg-gray-50/30 focus:bg-white transition-all font-sans font-semibold text-gray-800"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={yearLevelFilter}
              onChange={(e) => setYearLevelFilter(e.target.value)}
              title="Filter by Year Level"
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="all">All Year Levels</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              title="Filter by Course Category"
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="all">All Categories</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              title="Filter by Semester"
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="all">All Semesters</option>
              <option value="1st">1st Semester</option>
              <option value="2nd">2nd Semester</option>
              <option value="summer">Summer</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <WorkflowGuideButton guideId="course-list" />
      <div id="course-list-table">
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="courses"
          ariaLabel="Courses"
          emptyTitle="No courses found in the active curriculum."
          emptyDescription="Ensure an active curriculum is set with assigned courses."
          cellClassName={(columnId) => (columnId === 'course_code' ? 'whitespace-nowrap' : '')}
        />
      </div>
    </div>
  );
}
