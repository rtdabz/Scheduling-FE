import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/ui/DataTable';
import CourseCategoryBadge from '../../components/curriculum/CourseCategoryBadge';
import SearchInput from '../../components/ui/SearchInput';
import { Filter } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import FilterBar from '../../components/ui/FilterBar';

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

const YEAR_FILTERS = [
  { value: 'all', label: 'All' },
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

export default function CourseManager() {
  const { toast } = useToast();
  const user = getStoredUser();
  const coursesCacheKey = `page:courses:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  
  const [courses, setCourses] = useState<Course[]>(() => {
    const cached = getCachedData<CoursesPageData>(coursesCacheKey);
    return cached?.courses ?? [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    return !hasCachedData(coursesCacheKey);
  });
  const [loadError, setLoadError] = useState(false);


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
    if (!silent && !hasCachedData(coursesCacheKey)) {
      setIsLoading(true);
    }
    try {
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
      setLoadError(false);
    } catch {
      setLoadError(true);
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
          size: 130,
          cell: info => (
            <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
              {info.getValue() as string}
            </span>
          )
        },
        {
          accessorKey: 'course_name',
          header: 'Course Name',
          size: 320,
          cell: info => {
            const name = info.getValue() as string;
            return <span className="block font-bold text-gray-800 break-words">{name}</span>;
          }
        },
        {
          accessorKey: 'course_category',
          header: 'Category',
          size: 110,
          cell: info => {
            const raw = (info.getValue() as string) || '';
            const val = raw.toLowerCase() === 'major' ? 'major' : 'minor';
            return <CourseCategoryBadge category={val} />;
          }
        },
        {
          accessorKey: 'units',
          header: 'Units',
          size: 90,
          cell: info => {
            const val = info.getValue() as number;
            return <span className="font-bold text-gray-700 text-xs">{val} {val === 1 ? 'unit' : 'units'}</span>;
          }
        },
        {
          id: 'hours',
          header: 'Lec / Lab',
          size: 100,
          accessorFn: row => `${row.lecture_hours} / ${row.lab_hours}`,
          cell: info => <span className="text-gray-600 font-medium text-xs">{info.getValue() as string}</span>
        },
        {
          accessorKey: 'year_level',
          header: 'Year Level',
          size: 100,
          cell: info => {
            const val = (info.getValue() as string) || '';
            return <span className="font-bold text-gray-700 text-xs">{val}</span>;
          }
        },
        {
          accessorKey: 'semester',
          header: 'Semester',
          size: 100,
          cell: info => {
            const val = (info.getValue() as string) || '';
            return <span className="font-bold text-gray-700 text-xs capitalize">{val}</span>;
          }
        },

        {
          accessorKey: 'department',
          header: 'Department',
          size: 120,
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

  useWorkflowGuide({
    id: 'course-list', isReady: !isLoading, mission: 'Browse Courses',
    variant: loadError ? 'unavailable' : courses.length ? 'browse' : 'empty',
    steps: () => loadError ? [{ id: 'unavailable', element: '#course-list-table', title: 'Courses could not be refreshed', description: 'The course list may be missing or outdated. Reload the page to retry before relying on these details.' }] : [
      { id: 'find', element: '#course-list-search', title: 'Find a course', description: 'Search by code or name, then filter by year, category or semester. Searching is optional; you can review help without changing the current results.' },
      { id: 'details', element: '#course-list-table', title: 'Review course details', description: courses.length ? 'Review units, category, semester and department. If no rows match, clear the search and filters. This page shows existing course records.' : 'There are no course records to browse yet. Courses must be added through curriculum management before they appear here.' },
    ],
  });

  return (
    <div className="w-full">
      <FilterBar id="course-list-filters" className="mb-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3 lg:flex-nowrap">
          <SearchInput
            id="course-list-search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search course code, name, etc..."
            containerClassName="relative min-w-[200px] flex-1 lg:w-72 lg:flex-none"
          />
          <div className="flex shrink-0 flex-wrap items-center gap-1.5" role="group" aria-label="Year level">
            {YEAR_FILTERS.map(({ value, label }) => {
              const count = value === 'all' ? courses.length : courses.filter((course) => course.year_level?.toString() === value).length;
              const selected = yearLevelFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setYearLevelFilter(value)}
                  aria-pressed={selected}
                  className={`selection-indicator flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${selected ? '' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-[#5A1220]'}`}
                >
                  {label}
                  <span className="selection-indicator-count rounded-full px-1.5 text-[10px] tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
      </FilterBar>

      <WorkflowGuideButton guideId="course-list" />
      <div id="course-list-table">
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="courses"
          ariaLabel="Courses"
          emptyTitle="No courses found in the active curriculum."
          emptyDescription="Ensure an active curriculum is set with assigned courses."
          scrollClassName="overflow-x-auto"
          tableClassName="table-fixed min-w-[1070px]"
          cellClassName={(columnId) => columnId === 'course_name' ? 'whitespace-normal' : 'whitespace-nowrap overflow-hidden'}
        />
      </div>
    </div>
  );
}
