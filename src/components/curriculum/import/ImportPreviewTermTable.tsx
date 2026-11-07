import { AlertOctagon, AlertTriangle } from 'lucide-react';
import { rowHasProblem, totalsDiffer, type GroupTotals } from '../../../lib/curriculumImport/draft';
import { HIGHLIGHT_CLASSES } from '../../../lib/curriculumImport/sheetNavigation';
import type { DraftRow, ImportIssue } from '../../../lib/curriculumImport/types';

interface ImportPreviewTermTableProps {
  headingId: string;
  rows: DraftRow[];
  group?: GroupTotals;
  /** Unassigned rows say what placement is missing. */
  showPlacement: boolean;
  issuesByRow: Map<string, ImportIssue[]>;
  onOpenRow: (rowId: string) => void;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const edited = 'underline decoration-accent decoration-dotted decoration-2 underline-offset-[3px]';

/** A value that differs from the document: marked, with the extracted value kept beside it for review. */
function Figure({ value, original, wrong = false, bold = false }: { value: number | null; original: number | null; wrong?: boolean; bold?: boolean }) {
  const changed = value !== original;
  return (
    <span className={`${value === null || wrong ? 'font-bold text-red-700' : bold ? 'font-bold text-text' : 'text-text'} ${changed ? edited : ''}`} title={changed ? `Document: ${original ?? 'blank'}` : undefined}>
      {value ?? '?'}
      {changed && <span className="sr-only"> (document: {original ?? 'blank'})</span>}
    </span>
  );
}

function CourseRow({ row, issues, onOpen, showPlacement }: { row: DraftRow; issues: ImportIssue[]; onOpen: () => void; showPlacement: boolean }) {
  const errorIssues = issues.filter((issue) => issue.severity === 'error');
  const errors = errorIssues.length;
  const notices = issues.filter((issue) => issue.severity === 'notice').length;
  const problem = rowHasProblem(row) || errors > 0;
  const attention = notices > 0 || row.source.flags.length > 0;
  const { lecture_units: lec, lab_units: lab, total_units: tu } = row;
  const mismatch = lec !== null && lab !== null && tu !== null && lec + lab !== tu;
  const code = row.code.trim();
  const title = row.title.trim();
  const prerequisites = row.prerequisites?.trim() || 'None';
  const prerequisitesChanged = (row.prerequisites ?? '') !== (row.source.prerequisites ?? '');
  const label = `Open ${code || row.row_id}${errors ? `, ${plural(errors, 'error')}` : problem ? ', has values to fix' : ''}${notices ? `, ${plural(notices, 'notice')}` : ''}`;
  const placement = !row.year_level && !row.semester ? 'No year or term' : !row.year_level ? 'No year' : !row.semester ? 'No term' : `Year ${row.year_level} is not in this curriculum`;

  return (
    <tr data-row-id={row.row_id} onClick={onOpen} className={`${HIGHLIGHT_CLASSES} cursor-pointer border-t border-border/70 align-top hover:bg-parchment/60 ${problem ? 'bg-red-50/50 [&>td:first-child]:[box-shadow:inset_3px_0_0_#ef4444]' : ''}`}>
      <td className="py-1.5 pl-1.5 pr-0 sm:pl-2.5">
        {problem
          ? <AlertOctagon size={14} className="mt-0.5 text-red-600" aria-hidden="true" />
          : attention ? <AlertTriangle size={14} className="mt-0.5 text-accent" aria-hidden="true" /> : null}
      </td>
      <td className="py-1.5 pl-1 pr-1.5 sm:pl-1.5 sm:pr-2">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpen(); }}
          aria-label={label}
          title={label}
          className={`max-w-full break-words rounded text-left font-bold underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${code ? 'text-text' : 'text-red-700'}`}
        >
          {code || 'Missing code'}
        </button>
        {row.code !== row.source.code && <p className="truncate text-[11px] text-muted" title={`Document: ${row.source.code}`}>Doc: {row.source.code || 'blank'}</p>}
      </td>
      <td className="py-1.5 pr-2 leading-snug">
        <span className={title ? 'text-text' : 'font-semibold text-red-700'}>{title || 'Missing title'}</span>
        {row.title !== row.source.title && <span className="block truncate text-[11px] text-muted" title={`Document: ${row.source.title}`}>Doc: {row.source.title || 'blank'}</span>}
        {showPlacement && <span className="block text-[11px] font-semibold text-red-700">{placement}</span>}
        <span className="block text-[11px] text-muted sm:hidden">Prereq: {prerequisites}</span>
        {mismatch && <span className="block text-[11px] font-semibold text-red-700">Lec + lab is {lec + lab}</span>}
        {errorIssues.map((issue) => <span key={issue.key} className="block text-[11px] font-semibold leading-snug text-red-700">{issue.message}</span>)}
      </td>
      <td className="py-1.5 text-center tabular-nums"><Figure value={lec} original={row.source.lec} /></td>
      <td className="py-1.5 text-center tabular-nums"><Figure value={lab} original={row.source.lab} /></td>
      <td className="py-1.5 text-center tabular-nums"><Figure value={tu} original={row.source.tu} wrong={mismatch} bold /></td>
      <td className="hidden py-1.5 pl-2 pr-2.5 sm:table-cell">
        <span className={`block truncate ${prerequisites === 'None' ? 'text-muted' : 'text-text'} ${prerequisitesChanged ? edited : ''}`} title={prerequisitesChanged ? `${prerequisites} (document: ${row.source.prerequisites ?? 'blank'})` : prerequisites}>
          {prerequisites}
        </span>
      </td>
    </tr>
  );
}

/** Preview's term table, as printed: courses with their units and prerequisites, then the TOTAL CREDITS line. */
export default function ImportPreviewTermTable({ headingId, rows, group, showPlacement, issuesByRow, onOpenRow }: ImportPreviewTermTableProps) {
  const lec = rows.reduce((sum, row) => sum + (row.lecture_units ?? 0), 0);
  const lab = rows.reduce((sum, row) => sum + (row.lab_units ?? 0), 0);
  const tu = rows.reduce((sum, row) => sum + (row.total_units ?? 0), 0);
  const differs = !!group && totalsDiffer(group);

  return (
    // Fixed columns keep code, units and prerequisites aligned across every term; the title takes the rest.
    <table className="w-full table-fixed text-[13px]" aria-labelledby={headingId}>
      <colgroup>
        <col className="w-5 sm:w-6" />
        <col className="w-[5rem] sm:w-[6.5rem]" />
        <col />
        <col className="w-8 sm:w-9" />
        <col className="w-8 sm:w-9" />
        <col className="w-8 sm:w-9" />
        <col className="hidden w-[7.5rem] sm:table-column" />
      </colgroup>
      <thead>
        <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
          <th scope="col" className="py-1.5 pl-1.5 pr-0 sm:pl-2.5"><span className="sr-only">Status</span></th>
          <th scope="col" className="py-1.5 pl-1 pr-1.5 sm:pl-1.5 sm:pr-2">Code</th>
          <th scope="col" className="py-1.5 pr-2">Course title</th>
          <th scope="col" className="py-1.5 text-center"><abbr title="Lecture units" className="no-underline">Lec</abbr></th>
          <th scope="col" className="py-1.5 text-center"><abbr title="Laboratory units" className="no-underline">Lab</abbr></th>
          <th scope="col" className="py-1.5 text-center"><abbr title="Total units" className="no-underline">TU</abbr></th>
          <th scope="col" className="hidden py-1.5 pl-2 pr-2.5 sm:table-cell">Prereq</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr className="border-t border-border/70"><td colSpan={7} className="px-3 py-3 text-center text-muted">No courses in this term. The document lists it, or its last course was moved.</td></tr>
        ) : rows.map((row) => (
          <CourseRow key={row.row_id} row={row} issues={issuesByRow.get(row.row_id) ?? []} onOpen={() => onOpenRow(row.row_id)} showPlacement={showPlacement} />
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="border-t border-border bg-parchment/40 font-bold tabular-nums text-text">
            <th scope="row" colSpan={3} className="py-1.5 pl-2.5 pr-2 text-left text-[11px] uppercase tracking-wide text-muted">
              Total credits
              {group?.reported
                ? <span className={`ml-2 rounded px-1.5 py-px normal-case tracking-normal ${differs ? 'bg-accent/15 text-[#7a5410]' : 'font-semibold'}`}>printed {group.reported.lec ?? '?'} / {group.reported.lab ?? '?'} / {group.reported.tu ?? '?'}{differs ? ', differs' : ''}</span>
                : group && <span className="ml-2 font-semibold normal-case tracking-normal">no printed total</span>}
            </th>
            <td className="py-1.5 text-center">{lec}</td>
            <td className="py-1.5 text-center">{lab}</td>
            <td className="py-1.5 text-center">{tu}</td>
            <td className="hidden sm:table-cell" />
          </tr>
        </tfoot>
      )}
    </table>
  );
}
