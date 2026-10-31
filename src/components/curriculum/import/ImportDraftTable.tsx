import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertOctagon, AlertTriangle, PanelRightOpen } from 'lucide-react';
import DataTable from '../../ui/DataTable';
import { useDataTable } from '../../ui/useDataTable';
import { TERM_LABELS } from '../../../lib/curriculumImport/normalize';
import { describedTotalHours } from '../../../lib/curriculumImport/draft';
import { CONFIGURE_STATUS_LABELS, configureStatus, type ConfigureStatus } from '../../../lib/curriculumImport/configureStatus';
import type { DraftRow, ImportIssue, ImportSettings, PlacementTerm, ResolvedRow, SchedulingBasis } from '../../../lib/curriculumImport/types';

export type DraftTableMode = 'review' | 'configure';

const STATUS_TONE: Record<ConfigureStatus, string> = {
  unchecked: 'bg-parchment text-muted ring-border',
  invalid: 'bg-red-50 text-red-800 ring-red-200',
  needs_category: 'bg-accent/15 text-[#7a5410] ring-accent/40',
  override: 'bg-white text-primary ring-primary/30',
  manual: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rule: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
};

interface ImportDraftTableProps {
  mode: DraftTableMode;
  /** Preview only: unlocks every row for inline editing. */
  editing?: boolean;
  rows: DraftRow[];
  /** Codes for every draft row, so references outside the current filter still read as codes. */
  issuesByRow: Map<string, ImportIssue[]>;
  resolved: Map<string, ResolvedRow>;
  validated: boolean;
  settings: ImportSettings | null;
  selected: Set<string>;
  onToggleSelected: (rowIds: string[], selected: boolean) => void;
  onChange: (rowId: string, patch: Partial<DraftRow>) => void;
  onOpenRow: (rowId: string) => void;
}

const fieldBase = 'h-8 rounded-md border bg-white px-2 text-[13px] text-text transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const field = `${fieldBase} w-full`;
const ok = 'border-border hover:border-muted/50';
const bad = 'border-red-300 bg-red-50/60';
// Own width rule: the shared field is w-full, which lets unit boxes shrink to slivers in narrow tables.
const unitField = 'h-8 w-12 min-w-[3rem] shrink-0 rounded-md border bg-white px-0 text-center text-[13px] font-semibold tabular-nums text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const creditValue = (value: string): number | null => (value.trim() === '' ? null : Number(value));

/** Values the reviewer must fix by hand: blanks, missing placement, or units that do not add up. */
const rowHasProblem = (row: DraftRow): boolean => !row.code.trim() || !row.title.trim() || !row.year_level || !row.semester
  || row.lecture_units === null || row.lab_units === null || row.total_units === null
  || row.lecture_units + row.lab_units !== row.total_units;

const hours = (minutes: number) => `${(minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;

export default function ImportDraftTable({ mode, editing = false, rows, issuesByRow, resolved, validated, settings, selected, onToggleSelected, onChange, onOpenRow }: ImportDraftTableProps) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.row_id));
  const someSelected = rows.some((row) => selected.has(row.row_id));

  const columns = useMemo<ColumnDef<DraftRow>[]>(() => {
    const reviewColumn: ColumnDef<DraftRow> = {
      id: 'issues',
      header: () => <span className="sr-only">Review</span>,
      enableSorting: false,
      meta: { cellClassName: 'w-10' },
      cell: ({ row }) => {
        const issues = issuesByRow.get(row.original.row_id) ?? [];
        const errors = issues.filter((issue) => issue.severity === 'error').length;
        const open = issues.filter((issue) => issue.severity === 'review' && !issue.acknowledged).length;
        const flagged = row.original.source.flags.length > 0;
        const label = `Open ${row.original.code || row.original.row_id}${errors ? `, ${errors} error${errors === 1 ? '' : 's'}` : ''}${open ? `, ${open} to review` : ''}`;
        return (
          <button type="button" onClick={() => onOpenRow(row.original.row_id)} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-parchment hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {errors > 0
              ? <AlertOctagon size={16} className="text-red-600" />
              : open > 0 || flagged
                ? <AlertTriangle size={16} className="text-accent" />
                : <PanelRightOpen size={16} />}
          </button>
        );
      },
    };

    if (mode === 'review') {
      return [
        {
          id: 'state',
          header: () => <span className="sr-only">Status</span>,
          enableSorting: false,
          meta: { cellClassName: 'w-8' },
          cell: ({ row }) => {
            const issues = issuesByRow.get(row.original.row_id) ?? [];
            const errors = issues.filter((issue) => issue.severity === 'error').length;
            const attention = issues.some((issue) => issue.severity === 'review' && !issue.acknowledged) || row.original.source.flags.length > 0;
            const problem = rowHasProblem(row.original) || errors > 0;
            if (problem) return <AlertOctagon size={16} className="text-red-600" role="img" aria-label={errors ? `${errors} error${errors === 1 ? '' : 's'}` : 'Has values to fix'} />;
            if (attention) return <AlertTriangle size={16} className="text-accent" role="img" aria-label="Needs review" />;
            return null;
          },
        },
        {
          accessorKey: 'code',
          header: 'Course code',
          meta: { cellClassName: 'w-36' },
          cell: ({ row }) => (
            <div>
              {editing
                ? <input aria-label={`Code for ${row.original.row_id}`} value={row.original.code} onChange={(event) => onChange(row.original.row_id, { code: event.target.value })} className={`${fieldBase} w-[8.5rem] font-semibold ${row.original.code.trim() ? ok : bad}`} />
                : <p className={`text-[13px] font-bold ${row.original.code.trim() ? 'text-text' : 'text-red-700'}`}>{row.original.code.trim() || 'Missing code'}</p>}
              {row.original.code !== row.original.source.code && <p className="mt-0.5 truncate text-[11px] text-muted" title={`Document: ${row.original.source.code}`}>Document: {row.original.source.code}</p>}
            </div>
          ),
        },
        {
          accessorKey: 'title',
          header: 'Course title',
          cell: ({ row }) => (editing
            ? <input aria-label={`Title for ${row.original.row_id}`} value={row.original.title} onChange={(event) => onChange(row.original.row_id, { title: event.target.value })} className={`${field} min-w-[14rem] ${row.original.title.trim() ? ok : bad}`} />
            : <p className={`min-w-[10rem] max-w-[14rem] text-[13px] leading-snug ${row.original.title.trim() ? 'text-text' : 'font-semibold text-red-700'}`}>{row.original.title.trim() || 'Missing title'}</p>),
        },
        {
          id: 'placement',
          header: 'Year and term',
          enableSorting: false,
          cell: ({ row }) => {
            const { year_level: year, semester: term } = row.original;
            if (editing) {
              return (
                <div className="flex gap-1.5">
                  <select aria-label={`Year for ${row.original.row_id}`} value={year ?? ''} onChange={(event) => onChange(row.original.row_id, { year_level: event.target.value ? Number(event.target.value) : null })} className={`${fieldBase} w-[5.75rem] shrink-0 ${year ? ok : bad}`}>
                    <option value="">Year</option>
                    {[1, 2, 3, 4].map((option) => <option key={option} value={option}>Year {option}</option>)}
                  </select>
                  <select aria-label={`Term for ${row.original.row_id}`} value={term ?? ''} onChange={(event) => onChange(row.original.row_id, { semester: event.target.value ? (Number(event.target.value) as PlacementTerm) : null })} className={`${fieldBase} w-[9.75rem] shrink-0 ${term ? ok : bad}`}>
                    <option value="">Term</option>
                    {([1, 2, 3] as const).map((option) => <option key={option} value={option}>{TERM_LABELS[option]}</option>)}
                  </select>
                </div>
              );
            }
            return year && term
              ? <p className="whitespace-nowrap text-[13px] leading-tight text-text">Year {year}<span className="block text-xs text-muted">{TERM_LABELS[term].replace('Semester', 'semester')}</span></p>
              : <p className="whitespace-nowrap text-[13px] font-semibold text-red-700">{!year && !term ? 'No year or term' : !year ? 'No year' : 'No term'}</p>;
          },
        },
        {
          id: 'units',
          header: () => <span title="Lecture + laboratory = total units">Units</span>,
          enableSorting: false,
          meta: { align: 'center' },
          cell: ({ row }) => {
            const { lecture_units: lec, lab_units: lab, total_units: tu } = row.original;
            const mismatch = lec !== null && lab !== null && tu !== null && lec + lab !== tu;
            const notes = (
              <>
                {mismatch && <p className="text-[11px] font-semibold text-red-700">Lec + lab is {(lec ?? 0) + (lab ?? 0)}</p>}
                {[lec, lab, tu].includes(null) && <p className="text-[11px] font-semibold text-red-700">Blank unit</p>}
              </>
            );
            if (editing) {
              const input = (key: 'lecture_units' | 'lab_units' | 'total_units', value: number | null, label: string) => (
                <input
                  aria-label={`${label} for ${row.original.row_id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={value ?? ''}
                  placeholder="—"
                  onChange={(event) => onChange(row.original.row_id, { [key]: creditValue(event.target.value) })}
                  className={`${unitField} ${value === null || (key === 'total_units' && mismatch) ? bad : ok}`}
                />
              );
              return (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {input('lecture_units', lec, 'Lecture units')}
                    <span aria-hidden="true" className="text-muted">+</span>
                    {input('lab_units', lab, 'Laboratory units')}
                    <span aria-hidden="true" className="text-muted">=</span>
                    {input('total_units', tu, 'Total units')}
                  </div>
                  {notes}
                </div>
              );
            }
            const figure = (value: number | null, wrong = false) => (
              <span className={`inline-block min-w-[1.1rem] text-center ${value === null || wrong ? 'font-bold text-red-700' : ''}`}>{value ?? '?'}</span>
            );
            return (
              <div className="whitespace-nowrap text-center">
                <p className="text-[14px] tabular-nums text-text" aria-label={`${lec ?? 'blank'} lecture plus ${lab ?? 'blank'} laboratory equals ${tu ?? 'blank'} total units`}>
                  {figure(lec)}<span aria-hidden="true" className="px-1 text-muted">+</span>{figure(lab)}<span aria-hidden="true" className="px-1 text-muted">=</span><span className="font-bold">{figure(tu, mismatch)}</span>
                </p>
                {notes}
              </div>
            );
          },
        },
        {
          id: 'prerequisites',
          header: 'Prerequisites',
          enableSorting: false,
          cell: ({ row }) => {
            const text = row.original.prerequisites?.trim() || 'None';
            return (
              <button type="button" onClick={() => onOpenRow(row.original.row_id)} aria-label={`Prerequisites for ${row.original.code || 'course'}: ${text}`} title={text} className="flex h-8 max-w-[10rem] items-center rounded-md px-2 text-left text-[13px] text-text hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <span className="truncate">{text}</span>
              </button>
            );
          },
        },
      ];
    }

    return [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            aria-label="Select all courses in this view"
            checked={allSelected}
            ref={(element) => { if (element) element.indeterminate = !allSelected && someSelected; }}
            onChange={(event) => onToggleSelected(rows.map((row) => row.row_id), event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        ),
        enableSorting: false,
        meta: { cellClassName: 'w-8' },
        cell: ({ row }) => (
          <input type="checkbox" aria-label={`Select ${row.original.code}`} checked={selected.has(row.original.row_id)} onChange={(event) => onToggleSelected([row.original.row_id], event.target.checked)} className="h-4 w-4 accent-primary" />
        ),
      },
      reviewColumn,
      {
        accessorKey: 'code',
        header: 'Course',
        cell: ({ row }) => (
          <div className="w-[13rem]" title={row.original.title}>
            <p className="text-[13px] font-bold text-text">{row.original.code}</p>
            <p className="truncate text-xs text-muted">{row.original.title}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => {
          const status = configureStatus(row.original, resolved.get(row.original.row_id), issuesByRow.get(row.original.row_id), validated);
          return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${STATUS_TONE[status]}`}>{CONFIGURE_STATUS_LABELS[status]}</span>;
        },
      },
      {
        id: 'category',
        header: 'Category',
        enableSorting: false,
        cell: ({ row }) => {
          const rule = resolved.get(row.original.row_id)?.rule;
          const status = configureStatus(row.original, resolved.get(row.original.row_id), issuesByRow.get(row.original.row_id), validated);
          return (
            <div className="w-40">
              <select aria-label={`Category for ${row.original.code}`} value={row.original.category ?? ''} onChange={(event) => onChange(row.original.row_id, { category: (event.target.value || null) as DraftRow['category'] })} className={`${field} ${status === 'needs_category' || (validated && !rule && row.original.category === null) ? bad : ok}`}>
                <option value="">{rule ? `Use rule (${rule.category === 'major' ? 'Major' : 'Minor'})` : validated ? 'Choose a category' : 'Use department rule'}</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {rule ? `${rule.match_kind === 'exact' ? 'Exact code' : 'Prefix'} ${rule.match_value}` : validated ? 'No rule matches' : 'Rule shown after validation'}
              </p>
            </div>
          );
        },
      },
      {
        id: 'catalog',
        header: 'Course record',
        enableSorting: false,
        cell: ({ row }) => {
          const catalog = resolved.get(row.original.row_id)?.catalog;
          if (!catalog) return <span className="text-xs text-muted">—</span>;
          const label = catalog.action === 'create' ? 'New course' : catalog.action === 'reuse' ? 'Uses existing' : 'Conflicts with existing';
          const tone = catalog.action === 'blocked' ? 'text-red-700' : catalog.action === 'reuse' ? 'text-primary' : 'text-text';
          return <span className={`whitespace-nowrap text-xs font-semibold ${tone}`}>{label}</span>;
        },
      },
      {
        id: 'time',
        header: 'Weekly class time',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          if (row.original.scheduling_basis === 'total_hours') return <span className="text-xs text-muted">Total hours basis</span>;
          if (!settings) return <span className="text-xs text-muted">—</span>;
          const lecture = (row.original.lecture_units ?? 0) * settings.lecture_minutes_per_unit;
          const lab = (row.original.lab_units ?? 0) * settings.laboratory_minutes_per_unit;
          return (
            <div className="whitespace-nowrap text-right tabular-nums">
              <p className="text-[13px] font-bold text-text">{hours(lecture + lab)}</p>
              <p className="text-[11px] text-muted">{hours(lecture)} lec, {hours(lab)} lab</p>
            </div>
          );
        },
      },
      {
        id: 'basis',
        header: 'Scheduled as',
        enableSorting: false,
        cell: ({ row }) => {
          const described = describedTotalHours(row.original);
          const missing = described !== null && row.original.scheduling_basis === null;
          return (
            <div className="w-40">
              <div className="flex gap-1">
                <select aria-label={`Scheduling basis for ${row.original.code}`} value={row.original.scheduling_basis ?? ''} onChange={(event) => onChange(row.original.row_id, { scheduling_basis: (event.target.value || null) as SchedulingBasis | null, total_hours: event.target.value === 'total_hours' ? row.original.total_hours ?? described : null })} className={`${field} ${missing ? bad : ok}`}>
                  <option value="">{described !== null ? 'Choose a basis' : 'Weekly (default)'}</option>
                  <option value="weekly">Weekly from units</option>
                  <option value="total_hours">Total hours</option>
                </select>
                {row.original.scheduling_basis === 'total_hours' && (
                  <input aria-label={`Total hours for ${row.original.code}`} type="number" min={1} value={row.original.total_hours ?? ''} onChange={(event) => onChange(row.original.row_id, { total_hours: event.target.value ? Number(event.target.value) : null })} className={`${fieldBase} w-16 shrink-0 tabular-nums ${row.original.total_hours ? ok : bad}`} />
                )}
              </div>
              {described !== null && <p className="mt-0.5 text-[11px] text-muted">Source says {described} hours</p>}
            </div>
          );
        },
      },
    ];
  }, [mode, issuesByRow, resolved, validated, settings, selected, allSelected, someSelected, rows, onChange, onOpenRow, onToggleSelected, editing]);

  const table = useDataTable({ data: rows, columns, pageSize: false, getRowId: (row) => row.row_id, enableSorting: false });

  return (
    <DataTable
      table={table}
      variant="embedded"
      density="compact"
      showPagination={false}
      scrollClassName="overflow-x-auto"
      scrollAriaLabel={mode === 'review' ? 'Course rows, scrollable' : 'Course configuration, scrollable'}
      totalLabel="courses"
      ariaLabel={mode === 'review' ? 'Course rows to review' : 'Course classification and class time'}
      emptyTitle="No courses here."
      emptyDescription="Choose another term, or change the filter."
      getRowAttributes={(row) => ({ 'data-row-id': row.row_id })}
      rowClassName={(row) => ((issuesByRow.get(row.row_id) ?? []).some((issue) => issue.severity === 'error') || (mode === 'review' && rowHasProblem(row))
        ? 'bg-red-50/50 [&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-red-500'
        : selected.has(row.row_id) && mode === 'configure' ? 'bg-primary/[0.04]' : '')}
    />
  );
}
