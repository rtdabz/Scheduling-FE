import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
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
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';

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

  const filteredCourses = useMemo(() => {
    return courses;
  }, [courses]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Only show skeleton loader if we don't have any cached courses
    if (!hasCachedData(coursesCacheKey)) {
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
        </div>
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
                      <Skeleton className="h-4 w-8" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-12" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-20 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16" />
                    </td>
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-base font-semibold">No courses found in the active curriculum.</p>
                      <p className="text-xs">Ensure an active curriculum is set with assigned courses.</p>
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
                      const isNoWrap = ['course_code'].includes(cell.column.id);
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
    </div>
  );
}
