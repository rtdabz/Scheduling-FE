import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronRight, Info } from 'lucide-react';
import SourceNotes from '../SourceNotes';
import ImportCoursesTable from './ImportCoursesTable';
import { noteScopeLabel } from '../../../lib/curriculumImport/notes';
import type { ImportChange, ImportDraft, ValidationResult } from '../../../lib/curriculumImport/types';
import { TABLE_HEAD, TABLE_HEAD_ROW } from '../../ui/tableStyles';
import Badge from '../../ui/Badge';

interface ImportReviewSummaryProps {
  draft: ImportDraft;
  /** A current, valid server check: the review shows exactly what the import will save. */
  validation: ValidationResult;
  programName: string;
}

const FIELD_LABELS: Record<ImportChange['field'], string> = {
  code: 'Course code',
  title: 'Title',
  lecture_units: 'Lecture units',
  lab_units: 'Laboratory units',
  total_units: 'Total units',
  units: 'Units (lec / lab / total)',
  placement: 'Year and term',
  row: 'Source row',
  category: 'Category',
};

const FLAG_LABELS: Record<string, string> = {
  suspicious_code: 'code looked unusual',
  blank_cell: 'blank cell',
  ambiguous_units: 'unclear units',
  invalid_number: 'not a number',
  credit_sum_mismatch: 'units did not add up',
  unmapped_year: 'no year read',
  unmapped_term: 'no term read',
  malformed_row: 'irregular row',
  merged_cells: 'merged cells',
  units_only: 'only total units printed',
};

const perUnitHours = (minutes: number) => {
  const hours = minutes / 60;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} hour${hours === 1 ? '' : 's'}`;
};

/** A titled block of the review. The count shows as a quiet tag; screen readers hear it as "Title (n)". */
function Section({ id, title, count, aside, children }: { id: string; title: string; count?: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 id={id} aria-label={count === undefined ? undefined : `${title} (${count})`} className="flex items-center gap-2 text-sm font-semibold text-text">
          {title}
          {count !== undefined && <span aria-hidden="true" className="rounded-md bg-black/[0.05] px-1.5 py-px text-[11px] font-semibold tabular-nums text-muted">{count}</span>}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children, ariaLabel }: { label: string; children: ReactNode; ariaLabel?: string }) {
  return (
    <div className="min-w-0 bg-white px-4 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd aria-label={ariaLabel} className="mt-0.5 break-words text-[13px] font-semibold text-text">{children}</dd>
    </div>
  );
}

const quietBox = 'rounded-lg border border-dashed border-border bg-white/60 px-3 py-2.5 text-[13px] text-muted';

/**
 * Course | Field | Original | Will be imported. Material changes highlight the imported value and set the
 * original back; formatting-only differences (`subtle`) stay plain. Stacks into labelled cards on narrow screens.
 */
function ChangeTable({ changes, label, subtle = false }: { changes: ImportChange[]; label: string; subtle?: boolean }) {
  const cell = 'px-3 py-1.5 align-top max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:before:mr-1.5 max-sm:before:font-semibold max-sm:before:text-muted max-sm:before:content-[attr(data-label)]';
  return (
    <div className="sm:overflow-hidden sm:rounded-lg sm:border sm:border-border sm:bg-white">
      <table className="w-full text-left text-[13px] sm:table-fixed" aria-label={label}>
        <colgroup>
          <col className="sm:w-28" />
          <col className="sm:w-36" />
          <col />
          <col />
        </colgroup>
        <thead className="max-sm:sr-only">
          <tr className={`${TABLE_HEAD} ${TABLE_HEAD_ROW}`}>
            <th scope="col" className="px-3 py-2">Course</th>
            <th scope="col" className="px-3 py-2">Field</th>
            <th scope="col" className="px-3 py-2">Original</th>
            <th scope="col" className="px-3 py-2">Will be imported</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change, index) => {
            const first = index === 0 || changes[index - 1].row_id !== change.row_id;
            return (
              <tr
                key={`${change.row_id}-${change.field}-${change.kind}`}
                className={`max-sm:mb-2 max-sm:block max-sm:rounded-lg max-sm:border max-sm:border-border max-sm:bg-white max-sm:px-3 max-sm:py-2 sm:transition-colors sm:hover:bg-gray-50/70 ${first && index > 0 ? 'sm:border-t sm:border-gray-200' : ''}`}
              >
                <th scope="row" data-label="Course:" className={`${cell} font-semibold text-text`}><span className={first ? '' : 'sm:sr-only'}>{change.code}</span></th>
                <td data-label="Field:" className={`${cell} text-muted`}>{FIELD_LABELS[change.field] ?? change.field}</td>
                <td data-label="Original:" className={`${cell} text-muted`}>
                  <span className={`whitespace-pre-wrap break-words ${subtle ? '' : 'decoration-[#7A6E67]/50 sm:line-through'}`}>{change.original}</span>
                  {change.draft !== null && <span className="mt-0.5 block text-[11px]">Draft: {change.draft}</span>}
                </td>
                <td data-label="Will be imported:" className={`${cell} sm:border-l sm:border-gray-100 ${subtle ? 'text-text' : 'text-[#3d2a07]'}`}>
                  <span className={`whitespace-pre-wrap break-words ${subtle ? '' : 'rounded bg-[#C9952A]/[0.14] px-1 py-px font-semibold [box-decoration-break:clone]'}`}>{change.imported}</span>
                  {change.note && <span className="mt-0.5 block text-[11px] font-normal text-muted">{change.note}</span>}
                  {change.flags.length > 0 && (
                    <span className="mt-0.5 block text-[11px] font-normal text-[#7a5410]">Extraction flag: {change.flags.map((flag) => FLAG_LABELS[flag] ?? flag.replace(/_/g, ' ')).join(', ')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The formal review: an automatically generated account of what "Confirm and import" will create, taken from
 * the server's validation of the whole draft (the same data the commit uses). It asks for no explanations.
 */
export default function ImportReviewSummary({ draft, validation, programName }: ImportReviewSummaryProps) {
  const reused = validation.rows.filter((row) => row.catalog.action === 'reuse');
  const inactiveReused = reused.filter((row) => row.catalog.course?.status !== 'active').length;
  const created = validation.rows.length - reused.length;
  const material = validation.changes.filter((change) => !change.formatting);
  const formatting = validation.changes.filter((change) => change.formatting);
  const notices = validation.issues.filter((issue) => issue.severity === 'notice');
  const warnings = validation.issues.filter((issue) => issue.severity === 'warning');
  const majors = validation.rows.filter((row) => row.category === 'major').length;
  const codes = new Map(validation.rows.map((row) => [row.row_id, row.code]));
  const unknownColour = draft.notes.some((note) => note.flags.includes('color_unknown'));
  const anyColour = draft.notes.some((note) => note.runs.some((run) => run.color !== null));
  const resolved = draft.unread.filter((region) => region.resolution);

  return (
    <div className="space-y-5">
      <section aria-labelledby="review-curriculum" className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="border-b border-border bg-gradient-to-r from-[#4e0a10]/[0.05] via-[#C9952A]/[0.03] to-transparent px-4 py-3">
          <h3 id="review-curriculum" className="text-[11px] font-semibold uppercase tracking-wide text-[#7a1520]">Curriculum</h3>
          <p className="mt-0.5 break-words text-base font-semibold leading-6 text-text">{draft.metadata.name}</p>
          <p className="text-xs text-muted">Program: <span className="font-medium text-text">{programName}</span></p>
        </div>
        <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Internal code" ariaLabel="Assigned internal code">{validation.metadata.code}</Fact>
          <Fact label="Effective school year"><span className="tabular-nums">{draft.metadata.effective_school_year}</span></Fact>
          <Fact label="CMO">{draft.metadata.cmo_number.trim() ? `CMO ${draft.metadata.cmo_number.trim()}, s. ${draft.metadata.cmo_series.trim()}` : <span className="font-normal text-muted">Not given</span>}</Fact>
          <Fact label="Status after import"><Badge tone="neutral" dot>Deactivated</Badge></Fact>
        </dl>
      </section>

      <Section id="review-courses" title="Courses">
        <p className="-mt-1 mb-2.5 text-[13px] text-muted">
          {validation.rows.length} courses: {created} new
          {reused.length > 0 && <>, {reused.length} existing {reused.length === 1 ? 'course' : 'courses'} reused unchanged</>}
          {inactiveReused > 0 && <> ({inactiveReused} inactive, {inactiveReused === 1 ? 'stays' : 'stay'} inactive)</>}.
        </p>
        <ImportCoursesTable rows={validation.rows} />
      </Section>

      <Section
        id="review-changes"
        title="Changes from the document"
        count={material.length}
        aside={material.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#C9952A]/30" aria-hidden="true" /> Highlighted values replace the document&apos;s
          </p>
        )}
      >
        {material.length === 0
          ? <p className={`flex items-center gap-2 ${quietBox}`}><Check size={15} className="text-emerald-600" aria-hidden="true" /> Every imported value matches the document.</p>
          : <ChangeTable changes={material} label="Changes from the document" />}
      </Section>

      <Section id="review-classification" title="Categories and class time">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
          <Fact label="Major courses"><span className="tabular-nums">{majors}</span></Fact>
          <Fact label="Minor courses"><span className="tabular-nums">{validation.rows.length - majors}</span></Fact>
          <Fact label="Lecture unit">{perUnitHours(validation.settings.lecture_minutes_per_unit)} weekly</Fact>
          <Fact label="Laboratory unit">{perUnitHours(validation.settings.laboratory_minutes_per_unit)} weekly</Fact>
        </dl>
      </Section>

      <Section id="review-notes" title="Notes from the document" count={draft.notes.length}>
        {draft.notes.length === 0
          ? <p className={quietBox}>No notes were found in the document{draft.unread.length > 0 ? ' text' : ''}.</p>
          : (
            <>
              <SourceNotes
                title="Saved with the curriculum"
                notes={draft.notes.map((note) => ({
                  ...note,
                  label: [
                    noteScopeLabel(note.scope, note.scope.level === 'course' ? codes.get(note.scope.row_id) : null),
                    note.flags.includes('manual') ? 'typed by the reviewer' : null,
                    note.flags.includes('color_unknown') ? 'colour not read' : null,
                  ].filter(Boolean).join(', '),
                }))}
              />
              <p className="mt-1.5 text-xs text-muted">
                {unknownColour
                  ? 'Notes marked "colour not read" are saved without a colour and shown in the default text colour; the others keep the colours read from the document.'
                  : anyColour
                    ? 'Text and colours are kept as read from the document.'
                    : 'The source gives no colours, so the notes are saved as plain text.'}
              </p>
            </>
          )}
        {resolved.length > 0 && <p className="mt-1.5 text-xs text-muted">{resolved.length} unread part{resolved.length === 1 ? '' : 's'} of the document {resolved.length === 1 ? 'was' : 'were'} checked by the reviewer.</p>}
      </Section>

      {notices.length > 0 && (
        <Section id="review-notices" title="Notices" count={notices.length}>
          <ul className="divide-y divide-[#C9952A]/15 overflow-hidden rounded-lg border border-[#C9952A]/30 bg-[#C9952A]/[0.05]">
            {notices.map((issue) => (
              <li key={issue.key} className="flex gap-2.5 px-3 py-2 text-[13px] text-text">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> {issue.message}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(formatting.length > 0 || warnings.length > 0) && (
        <details className="group rounded-lg border border-border bg-white text-[13px]">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 font-semibold text-text hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
            <ChevronRight size={15} className="text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
            <Info size={15} className="text-muted" aria-hidden="true" /> Information ({formatting.length + warnings.length})
          </summary>
          <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
            {warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-text">{warnings.map((issue) => <li key={issue.key}>{issue.message}</li>)}</ul>}
            {formatting.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-muted">Differences in spacing or capitalisation only.</p>
                <ChangeTable subtle changes={formatting} label="Formatting-only differences" />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
