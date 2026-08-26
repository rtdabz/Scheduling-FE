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
import CurriculumArchiveModal from '../../components/curriculum/CurriculumArchiveModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import type { Curriculum } from '../../types/curriculum';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

export default function CurriculumListPage() {
  const navigate = useNavigate();
  const {
    curriculumList,
    rawCurriculumList,
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
    programs,
  } = useCurriculum();

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

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

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const triggerArchiveConfirmation = (id: number) => {
    const target = rawCurriculumList.find((c) => c.id === id);
    if (!target) return;

    setConfirmModal({
      isOpen: true,
      title: 'Archive Curriculum',
      message: `Are you sure you want to archive "${target.name}"?\n\nThis will remove it from the active list. You can restore it later from the Archive.`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await handleArchive(id);
      },
    });
  };

  const gridFilteredCurriculumList = useMemo(() => {
    let result = [...curriculumList];

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'code') return a.code.localeCompare(b.code);
      if (sortBy === 'courses') return b.courses_count - a.courses_count;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return result;
  }, [curriculumList, sortBy]);

  const gridTotalPages = Math.ceil(gridFilteredCurriculumList.length / gridPageSize) || 1;
  const gridPaginatedCurriculumList = useMemo(() => {
    const start = (gridPage - 1) * gridPageSize;
    return gridFilteredCurriculumList.slice(start, start + gridPageSize);
  }, [gridFilteredCurriculumList, gridPage, gridPageSize]);

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
          const curriculumPath = userRole === 'vpaa' ? `/curriculum/${item.id}` : `/${userRole}/curriculum/${item.id}`;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <button
                type="button"
                onClick={() => navigate(curriculumPath)}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="View Curriculum"
                aria-label={`View ${item.name}`}
              >
                <Eye size={15} />
              </button>
              {canManageCurriculum && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCurriculum(item);
                      setIsEditMode(true);
                      setIsFormModalOpen(true);
                    }}
                    className="p-1.5 text-gray-500 hover:text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                    title="Edit Curriculum"
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(item.id)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="Duplicate Curriculum"
                    aria-label={`Duplicate ${item.name}`}
                  >
                    <Copy size={15} />
                  </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleStatusChange(item.id, item.status === 'active' ? 'draft' : 'active')
                        }
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          item.status === 'active'
                            ? 'text-emerald-600 hover:bg-emerald-50'
                            : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={item.status === 'active' ? 'Deactivate' : 'Activate'}
                        aria-label={`${item.status === 'active' ? 'Deactivate' : 'Activate'} ${item.name}`}
                      >
                        <CheckCircle2 size={15} />
                      </button>
                      {item.status !== 'active' && (
                        <button
                          type="button"
                          onClick={() => triggerArchiveConfirmation(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Archive Curriculum"
                          aria-label={`Archive ${item.name}`}
                        >
                          <Archive size={15} />
                        </button>
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
    data: curriculumList,
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

  const curriculumGuideSteps = useMemo(() => [
    { element: '#curriculum-actions', title: 'Create or view a curriculum', description: 'Add a curriculum or open the visual curriculum view.', side: 'bottom' as const },
    { element: '#curriculum-filters', title: 'Find a curriculum', description: 'Search or filter by department and status.', side: 'bottom' as const },
    { element: '#curriculum-list', title: 'Manage the curriculum', description: 'Open a curriculum to edit its courses. Publish it before assigning teaching departments.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'curriculum', isReady: true, steps: curriculumGuideSteps });

  return (
    <div className="w-full">
      {/* Top Banner */}
      <div id="curriculum-actions" className="mb-6 flex flex-col items-end gap-4 sm:flex-row sm:items-center sm:justify-end">
        {canManageCurriculum && (
          <div className="flex items-center gap-2 shrink-0">
            <WorkflowGuideButton guideId="curriculum" />
            <button
              onClick={() => navigate('/curriculum-view')}
              className="border border-[#C9952A] text-[#4e0a10] bg-amber-50/50 hover:bg-amber-100 px-4 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 font-bold text-xs shadow-sm cursor-pointer"
              title="View Visual Curriculum Map (CMO Prescribed)"
            >
              <BookOpen size={16} className="text-[#C9952A]" />
              <span>Curriculum View</span>
            </button>
            <button
              onClick={() => setIsArchiveOpen(true)}
              className="border border-[#4e0a10] text-[#4e0a10] hover:bg-[#4e0a10]/5 px-4 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-xs shadow-sm cursor-pointer"
              title="View Archived Curriculum"
            >
              <Archive size={16} />
              <span>Archive</span>
            </button>
            <button
              onClick={() => {
                setEditingCurriculum(null);
                setIsEditMode(false);
                setIsFormModalOpen(true);
              }}
              className="bg-[#4e0a10] text-white px-5 py-2.5 rounded-xl hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm cursor-pointer"
            >
              <Plus size={16} />
              Create Curriculum
            </button>
          </div>
        )}
        {!canManageCurriculum && <WorkflowGuideButton guideId="curriculum" />}
      </div>

      {/* Toolbar & Filters */}
      <div id="curriculum-filters" className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
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
            </select>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-gray-100/90 border border-gray-200 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-[#5A1220] text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-[#5A1220] text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div id="curriculum-list">
      {isLoading ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4 animate-pulse">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="pt-4 border-t border-gray-100 flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        )
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
                      <p className="font-semibold text-gray-600">No curriculum found</p>
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
          {gridPaginatedCurriculumList.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-400">
              <BookOpen size={36} className="mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">No curriculum found</p>
            </div>
          ) : (
            gridPaginatedCurriculumList.map((item) => (
              <CurriculumCard
                key={item.id}
                curriculum={item}
                canEdit={canManageCurriculum}
                onView={(id) => {
                  const path = userRole === 'vpaa' ? `/curriculum/${id}` : `/${userRole}/curriculum/${id}`;
                  navigate(path);
                }}
                onEdit={(c) => {
                  setEditingCurriculum(c);
                  setIsEditMode(true);
                  setIsFormModalOpen(true);
                }}
                onDuplicate={handleDuplicate}
                onStatusChange={handleStatusChange}
                onArchive={triggerArchiveConfirmation}
              />
            ))
          )}
        </div>
      )}
      </div>

      {/* Curriculum Form Modal */}
      <CurriculumFormModal
        isOpen={isFormModalOpen}
        isEditMode={isEditMode}
        curriculum={editingCurriculum}
        onClose={() => setIsFormModalOpen(false)}
        programs={programs.filter((program) => !editingCurriculum || program.department_id === editingCurriculum.department_id)}
        onSubmit={async (data) => {
          await handleCreateOrUpdate(data, editingCurriculum);
          setIsFormModalOpen(false);
        }}
      />

      {/* Curriculum Archive Modal */}
      <CurriculumArchiveModal
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        curriculumList={rawCurriculumList}
        onRestore={handleStatusChange}
      />

      {/* Confirm Action Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        confirmLabel="Archive"
        variant="maroon"
      />
    </div>
  );
}
