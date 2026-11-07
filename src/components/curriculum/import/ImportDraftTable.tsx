import { useCallback, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../../ui/DataTable';
import { useDataTable } from '../../ui/useDataTable';
import { TERM_LABELS } from '../../../lib/curriculumImport/normalize';
import { rowHasProblem } from '../../../lib/curriculumImport/draft';
import type { DraftRow, ExtractionFlag, ImportIssue, PlacementTerm } from '../../../lib/curriculumImport/types';

interface ImportDraftTableProps {
  /** Unlocks every row for inline editing; otherwise the cells read as text. */
  editing?: boolean;
  rows: DraftRow[];
  issuesByRow: Map<string, ImportIssue[]>;
  onChange: (rowId: string, patch: Partial<DraftRow>) => void;
  onOpenRow: (rowId: string) => void;
  /** Names the table, e.g. by its term. */
  ariaLabel?: string;
}

const fieldBase = 'h-8 rounded-md border bg-white px-2 text-[13px] text-text transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const field = `${fieldBase} w-full`;
const ok = 'border-border hover:border-muted/50';
const bad = 'border-red-300 bg-red-50/60';
// Own width rule: the shared field is w-full, which lets unit boxes shrink to slivers in narrow tables.
const unitField = 'h-8 w-12 min-w-[3rem] shrink-0 rounded-md border bg-white px-0 text-center text-[13px] font-semibold tabular-nums text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

// Strong enough to read at a glance: red blocks the import, amber asks for a look. Distinct from the gold outline
// that "Show course" adds for a moment.
const ROW_TINT = {
  problem: 'bg-red-50 [&>td:first-child]:[box-shadow:inset_4px_0_0_#dc2626]',
  review: 'bg-amber-100/80 [&>td:first-child]:[box-shadow:inset_4px_0_0_#d97706]',
} as const;

/** Why the document's reading needs a look, in the reviewer's words. */
const FLAG_REASONS: Record<ExtractionFlag, string> = {
  suspicious_code: 'Code looks misread',
  ambiguous_units: 'Units were unclear in the document',
  blank_cell: 'A cell was blank in the document',
  credit_sum_mismatch: 'Units did not add up in the document',
  invalid_number: 'A number could not be read',
  unmapped_term: 'Term was not recognised',
  unmapped_year: 'Year was not recognised',
  malformed_row: 'Row was read with gaps',
  merged_cells: 'Read from merged cells',
};

/** Flags still worth a look: a corrected code settles a misread one. */
const openFlags = (row: DraftRow): ExtractionFlag[] => row.source.flags.filter((flag) => flag !== 'suspicious_code' || row.code === row.source.code);

const creditValue = (value: string): number | null => (value.trim() === '' ? null : Number(value));

/** Configure's Edit table: every extracted value of a term's courses, editable in place. */
export default function ImportDraftTable({ editing = false, rows, issuesByRow, onChange, onOpenRow, ariaLabel = 'Course rows to review' }: ImportDraftTableProps) {
  // Rows that need attention are tinted rather than marked with an icon, so the code column can start at the edge.
  const rowState = useCallback((row: DraftRow): 'problem' | 'review' | null => {
    const issues = issuesByRow.get(row.row_id) ?? [];
    if (rowHasProblem(row) || issues.some((issue) => issue.severity === 'error')) return 'problem';
    return issues.some((issue) => issue.severity === 'notice') || openFlags(row).length > 0 ? 'review' : null;
  }, [issuesByRow]);

  const columns = useMemo<ColumnDef<DraftRow>[]>(() => {
    return [
      {
        accessorKey: 'code',
        header: 'Course code',
        meta: { cellClassName: 'w-36' },
        cell: ({ row }) => (
          <div>
            {/* The row's tint shows its state; this says it for screen readers. */}
            {rowState(row.original) && <span className="sr-only">{rowState(row.original) === 'problem' ? 'Has values to fix. ' : 'Needs review. '}</span>}
            {editing
              ? <input aria-label={`Code for ${row.original.row_id}`} value={row.original.code} onChange={(event) => onChange(row.original.row_id, { code: event.target.value })} className={`${fieldBase} w-[8.5rem] font-semibold ${row.original.code.trim() ? ok : bad}`} />
              : <p className={`text-[13px] font-bold ${row.original.code.trim() ? 'text-text' : 'text-red-700'}`}>{row.original.code.trim() || 'Missing code'}</p>}
            {row.original.code !== row.original.source.code && <p className="mt-0.5 truncate text-[11px] text-muted" title={`Document: ${row.original.source.code}`}>Document: {row.original.source.code}</p>}
            {rowState(row.original) === 'review' && (() => {
              const flags = openFlags(row.original);
              const notice = (issuesByRow.get(row.original.row_id) ?? []).find((issue) => issue.severity === 'notice');
              const reason = flags.length > 0 ? FLAG_REASONS[flags[0]] : notice?.message;
              const suggestion = flags.includes('suspicious_code') && row.original.code_suggestion && row.original.code_suggestion !== row.original.code ? row.original.code_suggestion : null;
              return (
                <p className="mt-0.5 max-w-[8.5rem] text-[11px] font-semibold leading-snug text-amber-800" title={reason}>
                  <span className="block truncate">{reason}</span>
                  {suggestion && editing && (
                    <button type="button" onClick={() => onChange(row.original.row_id, { code: suggestion })} className="mt-0.5 rounded border border-amber-600/50 bg-white px-1.5 py-px font-bold text-amber-900 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                      Use {suggestion}
                    </button>
                  )}
                </p>
              );
            })()}
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
  }, [issuesByRow, onChange, onOpenRow, editing, rowState]);

  const table = useDataTable({ data: rows, columns, pageSize: false, getRowId: (row) => row.row_id, enableSorting: false });

  return (
    <DataTable
      table={table}
      variant="embedded"
      density="compact"
      showPagination={false}
      scrollClassName="overflow-x-auto"
      scrollAriaLabel={`${ariaLabel}, scrollable`}
      totalLabel="courses"
      ariaLabel={ariaLabel}
      emptyTitle="No courses here."
      emptyDescription="Change the filter to see more courses."
      getRowAttributes={(row) => ({ 'data-row-id': row.row_id })}
      rowClassName={(row) => {
        const state = rowState(row);
        return state ? ROW_TINT[state] : '';
      }}
    />
  );
}
