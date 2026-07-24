import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Skeleton from '../../components/ui/Skeleton';
import {
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Plus,
  List,
  LayoutGrid,
  Eye,
  Copy,
  CheckCircle2,
  Archive,
  BookOpen,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useCurriculum } from '../../hooks/curriculum/useCurriculum';
import CurriculumFormModal from '../../components/curriculum/CurriculumFormModal';
import CurriculumCard from '../../components/curriculum/CurriculumCard';
import type { Curriculum } from '../../types/curriculum';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

export default function CurriculumListPage() {
  const navigate = useNavigate();
  const {
    curricula,
    departments,
    isLoading,
    userRole,
    canManageCurriculum,
    statusFilter,
    setStatusFilter,
    departmentFilter,
    setDepartmentFilter,
    searchQuery,
    setSearchQuery,
    handleCreateOrUpdate,
    handleStatusChange,
    handleDuplicate,
    handleArchive,
  } = useCurriculum();

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Academic year filter
  const [academicYearFilter, setAcademicYearFilter] = useState<string>('all');

  // Table states
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  // Grid view pagination & sorting
  const [gridPage, setGridPage] = useState(1);
  const [gridPageSize, setGridPageSize] = useState(9);
  const [sortBy, setSortBy] = useState('date');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCurriculum, setEditingCurriculum] = useState<Curriculum | null>(null);

  const academicYears = useMemo(() => {
    const set = new Set<string>();
    curricula.forEach((c) => {
      if (c.academic_year) set.add(c.academic_year);
    });
    return Array.from(set).sort().reverse();
  }, [curricula]);

  const filteredCurriculaList = useMemo(() => {
    return curricula.filter((c) => {
      const matchYear = academicYearFilter === 'all' || c.academic_year === academicYearFilter;
      return matchYear;
    });
  }, [curricula, academicYearFilter]);

  const gridFilteredCurricula = useMemo(() => {
    let result = [...filteredCurriculaList];

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'code') return a.code.localeCompare(b.code);
      if (sortBy === 'courses') return b.courses_count - a.courses_count;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return result;
  }, [filteredCurriculaList, sortBy]);

  const gridTotalPages = Math.ceil(gridFilteredCurricula.length / gridPageSize) || 1;
  const gridPaginatedCurricula = useMemo(() => {
    const start = (gridPage - 1) * gridPageSize;
    return gridFilteredCurricula.slice(start, start + gridPageSize);
  }, [gridFilteredCurricula, gridPage, gridPageSize]);

  const columns = useMemo<ColumnDef<Curriculum>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: (info) => (
          <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Curriculum Name',
        cell: (info) => <span className="font-bold text-gray-800">{info.getValue() as string}</span>,
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: (info) => {
          const dept = info.getValue() as Curriculum['department'];
          return (
            <span className="text-gray-700 font-semibold text-xs">
              {dept ? dept.department_code : 'N/A'}
            </span>
          );
        },
      },
      {
        accessorKey: 'curriculum_version',
        header: 'Version',
        cell: (info) => (
          <span className="text-gray-600 font-medium text-xs">
            {(info.getValue() as string) || 'N/A'}
          </span>
        ),
      },
      {
        accessorKey: 'academic_year',
        header: 'Academic Year',
        cell: (info) => (
          <span className="text-gray-600 font-medium text-xs">
            {(info.getValue() as string) || 'N/A'}
          </span>
        ),
      },
      {
        accessorKey: 'effective_school_year',
        header: 'Effective Year',
        cell: (info) => (
          <span className="text-gray-700 font-semibold text-xs">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'courses_count',
        header: 'Courses',
        cell: (info) => (
          <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-full text-xs font-bold">
            {info.getValue() as number}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (info) => {
          const val = (info.getValue() as string) || 'draft';
          return (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                statusColors[val] || statusColors.draft
              }`}
            >
              {val}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate(`/secretary/curricula/${item.id}`)}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="View Curriculum"
              >
                <Eye size={15} />
              </button>
              {canManageCurriculum && (
                <>
                  <button
                    onClick={() => {
                      setEditingCurriculum(item);
                      setIsEditMode(true);
                      setIsFormModalOpen(true);
                    }}
                    className="p-1.5 text-gray-500 hover:text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                    title="Edit Curriculum"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDuplicate(item.id)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="Duplicate Curriculum"
                  >
                    <Copy size={15} />
                  </button>
                  {item.status !== 'archived' && (
                    <>
                      <button
                        onClick={() =>
                          handleStatusChange(item.id, item.status === 'active' ? 'draft' : 'active')
                        }
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          item.status === 'active'
                            ? 'text-emerald-600 hover:bg-emerald-50'
                            : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={item.status === 'active' ? 'Deactivate' : 'Activate'}
                      >
                        <CheckCircle2 size={15} />
                      </button>
                      <button
                        onClick={() => handleArchive(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Archive Curriculum"
                      >
                        <Archive size={15} />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          );
        },
      },
    ],
    [navigate, canManageCurriculum, handleDuplicate, handleStatusChange, handleArchive]
  );

  const table = useReactTable({
    data: filteredCurriculaList,
    columns,
    state: {
      globalFilter: searchQuery,
      sorting,
      pagination,
    },
    onGlobalFilterChange: setSearchQuery,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="w-full">
      {/* Top Banner */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1410] font-display">Curriculum Management</h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage academic curricula, course structures, and active program frameworks.
          </p>
        </div>

        {canManageCurriculum && (
          <button
            onClick={() => {
              setEditingCurriculum(null);
              setIsEditMode(false);
              setIsFormModalOpen(true);
            }}
            className="bg-[#4e0a10] text-white px-5 py-2.5 rounded-xl hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm shrink-0 cursor-pointer"
          >
            <Plus size={16} />
            Create Curriculum
          </button>
        )}
      </div>

      {/* Toolbar & Filters */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search curriculum name or code..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#C9952A] bg-white"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700">
            <Filter size={14} className="text-gray-400" />
            <span className="text-gray-500">Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-transparent outline-none font-bold text-[#4e0a10] cursor-pointer"
            >
              <option value="all">All Depts</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.department_code}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700">
            <Filter size={14} className="text-gray-400" />
            <span className="text-gray-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent outline-none font-bold text-[#4e0a10] cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-[#4e0a10] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-[#4e0a10] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl w-full" />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="bg-gray-50/75 border-b border-gray-100">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <ArrowUp size={12} className="text-[#C9952A]" />,
                            desc: <ArrowDown size={12} className="text-[#C9952A]" />,
                          }[header.column.getIsSorted() as string] ?? (
                            <ArrowUpDown size={12} className="text-gray-300" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-5 py-12 text-center text-gray-400">
                      <BookOpen size={36} className="mx-auto text-gray-300 mb-2" />
                      <p className="font-semibold text-gray-600">No curricula found</p>
                      <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or search criteria.</p>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-5 py-3.5 text-xs text-gray-700">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gridPaginatedCurricula.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-400">
              <BookOpen size={36} className="mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">No curricula found</p>
            </div>
          ) : (
            gridPaginatedCurricula.map((item) => (
              <CurriculumCard
                key={item.id}
                curriculum={item}
                canEdit={canManageCurriculum}
                onView={(id) => navigate(`/secretary/curricula/${id}`)}
                onEdit={(c) => {
                  setEditingCurriculum(c);
                  setIsEditMode(true);
                  setIsFormModalOpen(true);
                }}
                onDuplicate={handleDuplicate}
                onStatusChange={handleStatusChange}
                onArchive={handleArchive}
              />
            ))
          )}
        </div>
      )}

      {/* Curriculum Form Modal */}
      <CurriculumFormModal
        isOpen={isFormModalOpen}
        isEditMode={isEditMode}
        curriculum={editingCurriculum}
        departments={departments}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={async (data) => {
          await handleCreateOrUpdate(data, editingCurriculum);
          setIsFormModalOpen(false);
        }}
      />
    </div>
  );
}
