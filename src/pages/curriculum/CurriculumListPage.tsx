import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Skeleton from '../../components/ui/Skeleton';
import DataTable from '../../components/ui/DataTable';
import {
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  Filter,
  Plus,
  List,
  LayoutGrid,
  Eye,
  Copy,
  CheckCircle2,
  Archive,
  BookOpen,
  BookPlus,
  Printer,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useCurriculum } from '../../hooks/curriculum/useCurriculum';
import CurriculumFormModal from '../../components/curriculum/CurriculumFormModal';
import CurriculumCard from '../../components/curriculum/CurriculumCard';
import CurriculumArchiveModal from '../../components/curriculum/CurriculumArchiveModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import TableActionButton from '../../components/ui/TableActionButton';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import type { Curriculum } from '../../types/curriculum';
import { curriculumLifecycleBadge } from '../../types/curriculum';
import { curriculumService } from '../../services/curriculum/curriculumService';
import { printCurriculum } from '../../lib/curriculumPrintable';
import { useToast } from '../../context/ToastContext';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  deactivated: 'bg-slate-200 text-slate-700 border-slate-300',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

export default function CurriculumListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
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
  const [printingCurriculumId, setPrintingCurriculumId] = useState<number | null>(null);

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

  const handlePrintCurriculum = useCallback(async (item: Curriculum) => {
    if (printingCurriculumId !== null) return;

    setPrintingCurriculumId(item.id);
    try {
      const detail = await curriculumService.getCurriculumFull(item.id);
      await printCurriculum({
        curriculum: detail.curriculum,
        semesters: detail.semesters ?? [],
        program: programs.find((program) => program.id === detail.curriculum.program_id) ?? null,
      });
    } catch {
      toast.error('Print failed', 'The curriculum printable could not be generated.');
    } finally {
      setPrintingCurriculumId(null);
    }
  }, [printingCurriculumId, programs, toast]);

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
        cell: ({ row, getValue }) => {
          const val = (getValue() as string) || 'deactivated';
          // Old/new is a statement about the department's other curricula, so it
          // sits beside the status rather than replacing it — a curriculum can
          // be both "active" and "the old one".
          const lifecycle = curriculumLifecycleBadge(row.original);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  statusColors[val] || statusColors.deactivated
                }`}
              >
                {val}
              </span>
              {lifecycle && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${lifecycle.className}`}
                >
                  {lifecycle.label}
                </span>
              )}
            </div>
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
              <TableActionButton
                label="View Curriculum"
                variant="view"
                onClick={() => navigate(`${curriculumPath}?mode=view`)}
                aria-label={`View ${item.name}`}
              >
                <Eye size={15} />
              </TableActionButton>
              {canManageCurriculum && (
                <TableActionButton
                  label="Add Courses"
                  variant="success"
                  onClick={() => navigate(`${curriculumPath}?mode=edit`)}
                  aria-label={`Add courses to ${item.name}`}
                >
                  <BookPlus size={15} />
                </TableActionButton>
              )}
              <TableActionButton
                label="Print Curriculum"
                variant="print"
                onClick={() => void handlePrintCurriculum(item)}
                disabled={printingCurriculumId !== null}
                aria-label={`Print ${item.name}`}
              >
                <Printer size={15} className={printingCurriculumId === item.id ? 'animate-pulse' : ''} />
              </TableActionButton>
              {canManageCurriculum && (
                <>
                  <TableActionButton
                    label="Edit Curriculum"
                    variant="edit"
                    onClick={() => {
                      setEditingCurriculum(item);
                      setIsEditMode(true);
                      setIsFormModalOpen(true);
                    }}
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil size={15} />
                  </TableActionButton>
                  <TableActionButton
                    label="Duplicate Curriculum"
                    variant="copy"
                    onClick={() => handleDuplicate(item.id)}
                    aria-label={`Duplicate ${item.name}`}
                  >
                    <Copy size={15} />
                  </TableActionButton>
                      <TableActionButton
                        label={item.status === 'active' ? 'Deactivate' : 'Activate'}
                        variant={item.status === 'active' ? 'success' : 'danger'}
                        onClick={() =>
                          handleStatusChange(item.id, item.status === 'active' ? 'deactivated' : 'active')
                        }
                        aria-label={`${item.status === 'active' ? 'Deactivate' : 'Activate'} ${item.name}`}
                      >
                        <CheckCircle2 size={15} strokeWidth={item.status === 'active' ? 2.5 : 2} />
                      </TableActionButton>
                      {/* Archiving is offered only once a curriculum is out of
                          service; deactivate it first. */}
                      {item.status !== 'active' && (
                        <TableActionButton
                          label="Archive Curriculum"
                          variant="archive"
                          onClick={() => triggerArchiveConfirmation(item.id)}
                          aria-label={`Archive ${item.name}`}
                        >
                          <Archive size={15} />
                        </TableActionButton>
                      )}
                </>
              )}
            </div>
          );
        },
      },
    ],
    [navigate, canManageCurriculum, handleDuplicate, handleStatusChange, handleArchive, handlePrintCurriculum, printingCurriculumId, userRole]
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
    { element: '#curriculum-create-button', action: 'click' as const, taskHint: 'Click Create Curriculum to open the form.', title: 'Start a curriculum', description: 'New curricula begin from this page. Open the form to see every field.', side: 'bottom' as const },
    { element: '#curriculum-name-input', action: 'input' as const, taskHint: 'Type a curriculum name to continue.', title: 'Name the curriculum', description: 'Use the official program name and curriculum year.', side: 'bottom' as const },
    { element: '#curriculum-code-input', action: 'input' as const, taskHint: 'Type a curriculum code to continue.', title: 'Give it a code', description: 'The code appears on lists, cards, and printouts.', side: 'bottom' as const },
    { element: '#curriculum-department-select', action: 'select' as const, taskHint: 'Choose a department to continue.', title: 'Select a department', description: 'The department scopes who can manage this curriculum.', side: 'bottom' as const },
    { element: '#curriculum-program-select', action: 'select' as const, skipIfMissing: true, taskHint: 'Choose the program you want to manage.', title: 'Select a program', description: 'Programs appear after a department with programs is chosen.', side: 'bottom' as const },
    { element: '#curriculum-form', action: 'submit' as const, taskHint: 'Click Create Curriculum to save it.', title: 'Save the curriculum', description: 'Submit the form to create it. Great work — that is the whole flow.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'curriculum', isReady: true, steps: curriculumGuideSteps, mission: 'Create a Curriculum' });

  return (
    <div className="w-full">
      {/*
        Toolbar, filters and page actions share one card: the actions used to
        float in a bare strip above it, which read as though they belonged to
        the page title rather than to the list they act on.

        The row wraps instead of switching direction at a breakpoint — search,
        filters and three buttons do not fit side by side at every width, and
        wrapping lets the groups fall onto a second line inside the card while
        staying on one line whenever there is room.
      */}
      <div id="curriculum-filters" className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md mb-6 font-sans flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-[18rem]">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search curriculum name or code..."
              className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] bg-gray-50/30 focus:bg-white transition-all font-sans font-semibold text-gray-800"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
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
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>
        </div>

        {/* View mode, then the page actions. */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'grid' ? 'bg-[#5A1220] text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'list' ? 'bg-[#5A1220] text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>

          {/* Separates the view control, which only changes how the list looks,
              from the actions that change the data. */}
          <span aria-hidden="true" className="hidden h-7 w-px bg-gray-200 sm:block" />

          <WorkflowGuideButton guideId="curriculum" />

          {canManageCurriculum && (
            <>
              <button
                onClick={() => setIsArchiveOpen(true)}
                className="border border-[#4e0a10] text-[#4e0a10] hover:bg-[#4e0a10]/5 px-4 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-xs shadow-sm cursor-pointer"
                title="View Archived Curriculum"
              >
                <Archive size={16} />
                <span>Archive</span>
              </button>
              <button
                id="curriculum-create-button"
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
            </>
          )}
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
        <DataTable
          table={table}
          variant="card"
          totalLabel="curricula"
          ariaLabel="Curriculum"
          emptyState={
            <>
              <BookOpen size={36} className="mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">No curriculum found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or search criteria.</p>
            </>
          }
        />
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
                  const path = userRole === 'vpaa' ? `/curriculum/${id}?mode=view` : `/${userRole}/curriculum/${id}?mode=view`;
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
        departments={departments}
        programs={programs}
        onSubmit={async (data) => {
          const saved = await handleCreateOrUpdate(data, editingCurriculum);
          setIsFormModalOpen(false);
          if (!editingCurriculum) {
            navigate(`/curriculum/${saved.id}?mode=edit`);
          }
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
