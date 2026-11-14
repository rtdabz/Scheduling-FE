import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Skeleton from '../../components/ui/Skeleton';
import DataTable from '../../components/ui/DataTable';
import SearchInput from '../../components/ui/SearchInput';
import {
  Pencil,
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
  FileUp,
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
import CurriculumDetailModal from '../../components/curriculum/CurriculumDetailModal';
import CurriculumStatusTabs, { type CurriculumStatusTab } from '../../components/curriculum/CurriculumStatusTabs';
import ConfirmModal from '../../components/ui/ConfirmModal';
import TableActionButton from '../../components/ui/TableActionButton';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import type { Curriculum } from '../../types/curriculum';
import { curriculumLifecycleBadge } from '../../types/curriculum';
import { curriculumService } from '../../services/curriculum/curriculumService';
import { printCurriculum } from '../../lib/curriculumPrintable';
import { useToast } from '../../context/ToastContext';
import { canAuthorCurriculum } from '../../lib/curriculumAccess';
import { getStoredUserDepartmentId, hasStoredCapability } from '../../lib/storedUser';
import CurriculumReviewPage from './CurriculumReviewPage';
import { isDepartmentOfficeRole } from '../../lib/roles';

const GRID_PAGE_SIZE = 9;

// Archived curricula stay in the Archive modal, so the Secretary's buttons cover only the listed statuses.
const secretaryStatusTabs: CurriculumStatusTab[] = [
  { id: 'active', label: 'Active' },
  { id: 'deactivated', label: 'Deactivated' },
];

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  deactivated: 'bg-slate-200 text-slate-700 border-slate-300',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

export default function CurriculumListPage() {
  return hasStoredCapability('curriculum.manage') ? <CurriculumManagePage /> : <CurriculumReviewPage />;
}

function CurriculumManagePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    curriculumList,
    rawCurriculumList,
    isLoading,
    loadError,
    userRole,
    canManageCurriculum,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    handleCreateOrUpdate,
    handleStatusChange,
    handleDuplicate,
    handleArchive,
    programs,
  } = useCurriculum();

  const curriculumPathFor = useCallback(
    (curriculumId: number) => (userRole === 'vpaa' ? `/curriculum/${curriculumId}` : `/${userRole}/curriculum/${curriculumId}`),
    [userRole],
  );

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  // `?view=archived` (linked from the system Archive) opens archived curricula; restoring stays permission-gated.
  const [searchParams, setSearchParams] = useSearchParams();
  const [isArchiveOpen, setIsArchiveOpen] = useState(() => searchParams.get('view') === 'archived');
  const closeArchive = useCallback(() => {
    setIsArchiveOpen(false);
    if (searchParams.has('view')) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('view');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [printingCurriculumId, setPrintingCurriculumId] = useState<number | null>(null);
  const [viewCurriculumId, setViewCurriculumId] = useState<number | null>(null);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const [gridPage, setGridPage] = useState(1);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCurriculum, setEditingCurriculum] = useState<Curriculum | null>(null);

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
      message: `Are you sure you want to archive "${target.name}"?\n\nThis will remove it from the active list. You can restore it later from Archived curricula (the Archive button on this page). Curricula do not appear in the system Archive.`,
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

  const gridFilteredCurriculumList = useMemo(
    () => [...curriculumList].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [curriculumList],
  );

  const gridTotalPages = Math.ceil(gridFilteredCurriculumList.length / GRID_PAGE_SIZE) || 1;
  const currentGridPage = Math.min(gridPage, gridTotalPages);
  const gridPaginatedCurriculumList = useMemo(() => {
    const start = (currentGridPage - 1) * GRID_PAGE_SIZE;
    return gridFilteredCurriculumList.slice(start, start + GRID_PAGE_SIZE);
  }, [gridFilteredCurriculumList, currentGridPage]);

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
        meta: { hideBelow: 'md' },
        header: 'Effective Year',
        cell: (info) => (
          <span className="text-gray-700 font-semibold text-xs">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'courses_count',
        meta: { hideBelow: 'sm' },
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
          const lifecycle = curriculumLifecycleBadge(row.original);
          return (
            <div className="flex flex-nowrap items-center gap-1.5">
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
          const curriculumPath = curriculumPathFor(item.id);
          const canAuthor = canManageCurriculum && canAuthorCurriculum(item);
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <TableActionButton
                label="View Curriculum"
                variant="view"
                onClick={() => setViewCurriculumId(item.id)}
                aria-label={`View ${item.name}`}
              >
                <Eye size={15} />
              </TableActionButton>
              {canAuthor && (
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
              {canAuthor && (
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
    [navigate, canManageCurriculum, handleDuplicate, handleStatusChange, handleArchive, handlePrintCurriculum, printingCurriculumId, curriculumPathFor]
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

  // The department office (Secretary or Director) adds curricula through Import only; manual creation and search are hidden for it.
  const isDepartmentOffice = isDepartmentOfficeRole(userRole);

  const statusCounts = useMemo(() => ({
    active: rawCurriculumList.filter((item) => item.status === 'active').length,
    deactivated: rawCurriculumList.filter((item) => item.status === 'deactivated').length,
  }), [rawCurriculumList]);

  const selectStatus = (status: string) => {
    setStatusFilter(status);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    setGridPage(1);
  };

  useWorkflowGuide({
    id: 'curriculum', isReady: !isLoading, mission: 'Manage Curricula',
    variant: isFormModalOpen ? (isEditMode ? 'edit' : 'create') : viewCurriculumId !== null ? 'preview' : isArchiveOpen ? 'archive' : loadError ? 'unavailable' : isDepartmentOffice ? 'import' : 'manage',
    steps: () => {
      const formSteps = [
        { id: 'name', element: '#curriculum-name-input', title: 'Use the official curriculum name', description: 'The curriculum name is required. Review the fields without changing them if you are only learning the workflow.' },
        { id: 'code', element: '#curriculum-code-input', title: 'Enter the CMO number', description: 'CMO No. is required and appears as the curriculum code in lists and printouts.' },
        { id: 'effective-year', element: '#curriculum-effective-year', title: 'Set the effective school year', description: 'Both years are required. Enter a four-digit starting year; the ending year must be the next year. The form fills the ending year when a complete starting year is entered.' },
        ...(userRole !== 'program_head' && programs.some((program) => program.department_id === (isFormModalOpen && isEditMode ? editingCurriculum?.department_id ?? getStoredUserDepartmentId() : getStoredUserDepartmentId())) ? [{ id: 'program', element: '#curriculum-program-select', title: 'Check the program', description: 'Choose the applicable program or major. This field is optional in this form; Program Heads use their existing program scope.' }] : []),
        { id: 'save', element: '#curriculum-save', title: 'Save through the normal form', description: 'Create Curriculum or Save Changes validates the fields and sends them to the server. Errors leave the form available for correction. Finishing help does not save a curriculum; use Cancel to leave the form without saving.' },
      ];
      if (isFormModalOpen) return formSteps;
      if (viewCurriculumId !== null) return [{ id: 'preview', element: '#curriculum-detail-preview', title: 'Review the curriculum document', description: 'The preview prepares the selected curriculum document. Wait for it to load; any preparation error appears here. Close returns to the list. Reviewing or closing the preview does not change the curriculum.' }];
      if (isArchiveOpen) return [{ id: 'archive', element: '#curriculum-archive-dialog', title: 'Review archived curricula', description: 'Search archived curricula here. Restore, when your access allows it, saves a status change back to Deactivated. Finishing this guide does not restore or activate a curriculum.' }];
      if (loadError) return [{ id: 'unavailable', element: '#curriculum-list', title: 'Curricula could not be refreshed', description: 'The list may be missing or outdated. Reload this page to retry before relying on its status or editing a curriculum.' }];
      return [
        { id: 'browse', element: '#curriculum-list', title: curriculumList.length ? 'Review existing curricula' : 'No curricula match', description: curriculumList.length ? 'Review the current List or Grid results and open View to inspect courses. Status, search and other filters affect these results.' : 'Clear the current filters or search to look for existing curricula. Import or creation is available only with management access.' },
        ...(!canManageCurriculum ? [] : isDepartmentOffice ? [{ id: 'import', element: '#curriculum-import-button', title: 'Import on the next page', description: 'Import opens a separate page for PDF, CSV, XLSX or DOCX files. Finish this guide before opening it, then review and confirm the parsed curriculum there. Opening that page does not import or save a file.' }] : [
          { id: 'open-form', element: '#curriculum-create-button', action: 'click' as const, isSatisfied: () => document.querySelector('#curriculum-form') !== null, taskHint: 'Open Create Curriculum to review the required fields.', title: 'Review the creation form', description: 'Opening the form does not save a curriculum.' },
          ...formSteps,
        ]),
      ];
    },
  });

  return (
    <div className="w-full">
      <div id="curriculum-filters" className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md mb-6 font-sans flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-[18rem]">
          {isDepartmentOffice && (
            <CurriculumStatusTabs
              id="curriculum-status-tabs"
              className="flex flex-wrap gap-2"
              tabs={secretaryStatusTabs}
              selected={statusFilter === 'deactivated' ? 'deactivated' : 'active'}
              counts={statusCounts}
              onSelect={selectStatus}
            />
          )}

          {!isDepartmentOffice && (
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search curriculum name or code..."
            />
          )}

          {!isDepartmentOffice && (
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
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1">
            <button
              type="button"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              className={`selection-indicator p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'grid' ? 'shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`selection-indicator p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'list' ? 'shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>

          <span aria-hidden="true" className="hidden h-7 w-px bg-gray-200 sm:block" />

          <WorkflowGuideButton guideId="curriculum" />

          {canManageCurriculum && (
            <>
              <button
                onClick={() => setIsArchiveOpen(true)}
                className="border border-[#5A1220] text-[#5A1220] hover:bg-[#5A1220]/5 px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
                title="View Archived Curriculum"
              >
                <Archive size={15} />
                <span>Archive</span>
              </button>
              {userRole !== 'vpaa' && (
                <button
                  id="curriculum-import-button"
                  onClick={() => navigate(`/${userRole}/curriculum/import`)}
                  className="border border-[#5A1220] text-[#5A1220] hover:bg-[#5A1220]/5 px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
                  title="Import a curriculum from a PDF, CSV, XLSX, or DOCX file"
                >
                  <FileUp size={15} />
                  <span>Import</span>
                </button>
              )}
              {!isDepartmentOffice && (
                <button
                  id="curriculum-create-button"
                  onClick={() => {
                    setEditingCurriculum(null);
                    setIsEditMode(false);
                    setIsFormModalOpen(true);
                  }}
                  className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap"
                >
                  <Plus size={15} />
                  <span>Create Curriculum</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

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
          onRowClick={(item) => setViewCurriculumId(item.id)}
          scrollClassName="overflow-x-auto"
          cellClassName={() => 'whitespace-nowrap'}
          emptyState={
            <>
              <BookOpen size={36} className="mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">No curriculum found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or search criteria.</p>
            </>
          }
        />
      ) : (
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
                canEdit={canManageCurriculum && canAuthorCurriculum(item)}
                onView={setViewCurriculumId}
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
          {gridTotalPages > 1 && (
            <nav aria-label="Curriculum pages" className="col-span-full flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-3 text-xs font-semibold text-gray-500 shadow-sm">
              <span>
                Page {currentGridPage} of {gridTotalPages} · {gridFilteredCurriculumList.length} curricula
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={() => setGridPage(currentGridPage - 1)} disabled={currentGridPage <= 1} className="rounded-lg border border-gray-200 px-3 py-1.5 font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <button type="button" onClick={() => setGridPage(currentGridPage + 1)} disabled={currentGridPage >= gridTotalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </span>
            </nav>
          )}
        </div>
      )}
      </div>

      <CurriculumFormModal
        isOpen={isFormModalOpen}
        isEditMode={isEditMode}
        curriculum={editingCurriculum}
        onClose={() => setIsFormModalOpen(false)}
        programs={programs}
        onSubmit={async (data) => {
          const saved = await handleCreateOrUpdate(data, editingCurriculum);
          setIsFormModalOpen(false);
          if (!editingCurriculum) {
            navigate(`${curriculumPathFor(saved.id)}?mode=edit`);
          }
        }}
      />

      <CurriculumDetailModal
        isOpen={viewCurriculumId !== null}
        curriculumId={viewCurriculumId}
        programs={programs}
        onClose={() => setViewCurriculumId(null)}
      />

      <CurriculumArchiveModal
        isOpen={isArchiveOpen}
        onClose={closeArchive}
        curriculumList={rawCurriculumList}
        onRestore={handleStatusChange}
        canRestore={canAuthorCurriculum}
      />

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
