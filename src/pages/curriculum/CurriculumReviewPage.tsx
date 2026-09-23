import { useCallback, useMemo, useState } from 'react';
import { Eye, Printer } from 'lucide-react';
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
import CurriculumDetailModal from '../../components/curriculum/CurriculumDetailModal';
import { useCurriculum } from '../../hooks/curriculum/useCurriculum';
import { curriculumService } from '../../services/curriculum/curriculumService';
import { printCurriculum } from '../../lib/curriculumPrintable';
import { useToast } from '../../context/ToastContext';
import type { Curriculum, CurriculumStatus } from '../../types/curriculum';
import { curriculumLifecycleBadge } from '../../types/curriculum';

type ReviewTab = CurriculumStatus;

const reviewTabs: Array<{ id: ReviewTab; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'deactivated', label: 'Deactivated' },
  { id: 'archived', label: 'Archived' },
];

const statusBadges: Record<CurriculumStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200/60',
  deactivated: 'bg-slate-200 text-slate-700 border-slate-300',
  archived: 'bg-red-100 text-red-800 border-red-200/60',
};

const selectClassName =
  'px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors';

/**
 * The Dean's and the VPAA's curriculum screen. Both review curricula without
 * changing them, so the page follows Schedule Approval: status tabs with counts,
 * a filter card, a table, and a View action that opens a read-only preview.
 * Authoring stays on the secretary's page behind `curriculum.manage`.
 */
export default function CurriculumReviewPage() {
  const { toast } = useToast();
  const { rawCurriculumList, departments, programs, isLoading } = useCurriculum();

  const [selectedTab, setSelectedTab] = useState<ReviewTab>('active');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [viewCurriculumId, setViewCurriculumId] = useState<number | null>(null);
  const [printingCurriculumId, setPrintingCurriculumId] = useState<number | null>(null);

  const departmentName = useCallback(
    (item: Curriculum) =>
      item.department?.department_name
      ?? departments.find((dept) => dept.id === item.department_id)?.department_name
      ?? '—',
    [departments],
  );

  // A dean's list is already scoped to one department; the filter only earns
  // its place when the list spans several.
  const listedDepartments = useMemo(() => {
    const ids = new Set(rawCurriculumList.map((item) => item.department_id));
    return departments.filter((dept) => ids.has(dept.id));
  }, [departments, rawCurriculumList]);

  const effectiveYears = useMemo(
    () => Array.from(new Set(rawCurriculumList.map((item) => item.effective_school_year))).sort().reverse(),
    [rawCurriculumList],
  );

  const matchesFilters = useCallback(
    (item: Curriculum) =>
      (selectedDept === 'all' || String(item.department_id) === selectedDept)
      && (selectedYear === 'all' || item.effective_school_year === selectedYear),
    [selectedDept, selectedYear],
  );

  const filteredData = useMemo(
    () => rawCurriculumList.filter((item) => item.status === selectedTab && matchesFilters(item)),
    [rawCurriculumList, selectedTab, matchesFilters],
  );

  const tabCounts = useMemo(
    () => reviewTabs.reduce<Record<ReviewTab, number>>((counts, tab) => {
      counts[tab.id] = rawCurriculumList.filter((item) => item.status === tab.id && matchesFilters(item)).length;
      return counts;
    }, { active: 0, deactivated: 0, archived: 0 }),
    [rawCurriculumList, matchesFilters],
  );

  const resetPage = () => setPagination((prev) => ({ ...prev, pageIndex: 0 }));

  const resetFilters = () => {
    setSelectedTab('active');
    setSelectedDept('all');
    setSelectedYear('all');
    resetPage();
  };

  const handlePrint = useCallback(async (item: Curriculum) => {
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
        header: 'Curriculum',
        cell: (info) => <span className="font-bold text-gray-800">{info.getValue() as string}</span>,
      },
      {
        id: 'department',
        accessorFn: (row) => departmentName(row),
        header: 'Department',
        cell: (info) => <span className="text-gray-600 font-medium">{info.getValue() as string}</span>,
      },
      {
        accessorKey: 'effective_school_year',
        header: 'Effective Year',
        cell: (info) => <span className="text-gray-500 font-medium">{info.getValue() as string}</span>,
      },
      {
        accessorKey: 'courses_count',
        header: () => <div className="text-center">Courses</div>,
        cell: (info) => <div className="text-center font-semibold text-gray-700">{info.getValue() as number}</div>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row, getValue }) => {
          const status = getValue() as CurriculumStatus;
          const lifecycle = curriculumLifecycleBadge(row.original);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${statusBadges[status] ?? statusBadges.deactivated}`}>
                {status}
              </span>
              {lifecycle && (
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider whitespace-nowrap ${lifecycle.className}`}>
                  {lifecycle.label}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex justify-end gap-1.5">
              <TableActionButton
                label="View"
                variant="view"
                onClick={() => setViewCurriculumId(item.id)}
                aria-label={`View ${item.name}`}
              >
                <Eye size={17} />
              </TableActionButton>
              <TableActionButton
                label="Print"
                variant="print"
                onClick={() => void handlePrint(item)}
                disabled={printingCurriculumId !== null}
                aria-label={`Print ${item.name}`}
              >
                <Printer size={17} className={printingCurriculumId === item.id ? 'animate-pulse' : ''} />
              </TableActionButton>
            </div>
          );
        },
      },
    ],
    [departmentName, handlePrint, printingCurriculumId],
  );

  const table = useReactTable<Curriculum>({
    data: filteredData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="relative">
      <div id="curriculum-review-tabs" className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-gray-150/70 bg-white p-2 shadow-sm">
        {reviewTabs.map((tab) => {
          const active = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedTab(tab.id);
                resetPage();
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${active ? 'bg-[#4e0a10] text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-[#4e0a10]/5 hover:text-[#4e0a10]'}`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>{tabCounts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      <div id="curriculum-review-filters" className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          {listedDepartments.length > 1 && (
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                resetPage();
              }}
              className={selectClassName}
            >
              <option value="all">All Departments</option>
              {listedDepartments.map((dept) => (
                <option key={dept.id} value={String(dept.id)}>{dept.department_name}</option>
              ))}
            </select>
          )}

          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              resetPage();
            }}
            className={selectClassName}
          >
            <option value="all">All Effective Years</option>
            {effectiveYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all duration-200 cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      <div id="curriculum-review-list">
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="curricula"
          ariaLabel="Curricula"
          emptyTitle="No curricula found."
          emptyDescription="Adjust your department or year filters and try again."
          cellClassName={(columnId) => (['effective_school_year', 'courses_count', 'status', 'actions'].includes(columnId) ? 'whitespace-nowrap' : '')}
        />
      </div>

      <CurriculumDetailModal
        isOpen={viewCurriculumId !== null}
        curriculumId={viewCurriculumId}
        programs={programs}
        onClose={() => setViewCurriculumId(null)}
      />
    </div>
  );
}
