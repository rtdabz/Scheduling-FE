import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import SourceNotes from '../SourceNotes';
import ImportCoursesTable from './ImportCoursesTable';
import { noteScopeLabel } from '../../../lib/curriculumImport/notes';
import type { ImportChange, ImportDraft, ValidationResult } from '../../../lib/curriculumImport/types';

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
};

const perUnitHours = (minutes: number) => {
  const hours = minutes / 60;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} hour${hours === 1 ? '' : 's'}`;
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 id={id} className="text-[15px] font-semibold text-text">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Course | Field | Original | Will be imported. Stacks into labelled cards on narrow screens. */
function ChangeTable({ changes, label }: { changes: ImportChange[]; label: string }) {
  const cell = 'px-3 py-2 align-top max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:before:mr-1.5 max-sm:before:font-semibold max-sm:before:text-muted max-sm:before:content-[attr(data-label)]';
  return (
    <table className="w-full text-left text-[13px]" aria-label={label}>
      <thead className="max-sm:sr-only">
        <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted">
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
            <tr key={`${change.row_id}-${change.field}-${change.kind}`} className={`max-sm:block max-sm:rounded-lg max-sm:border max-sm:border-border max-sm:px-3 max-sm:py-2 max-sm:mb-2 ${first ? 'sm:border-t sm:border-border' : ''}`}>
              <th scope="row" data-label="Course:" className={`${cell} font-semibold text-text`}><span className={first ? '' : 'sm:sr-only'}>{change.code}</span></th>
              <td data-label="Field:" className={`${cell} text-text`}>{FIELD_LABELS[change.field] ?? change.field}</td>
              <td data-label="Original:" className={`${cell} text-muted`}>
                <span className="whitespace-pre-wrap break-words">{change.original}</span>
                {change.draft !== null && <span className="block text-xs">Draft: {change.draft}</span>}
              </td>
              <td data-label="Will be imported:" className={`${cell} font-semibold text-text`}>
                <span className="whitespace-pre-wrap break-words">{change.imported}</span>
                {change.note && <span className="block text-xs font-normal text-muted">{change.note}</span>}
                {change.flags.length > 0 && (
                  <span className="block text-xs font-normal text-[#7a5410]">Extraction flag: {change.flags.map((flag) => FLAG_LABELS[flag] ?? flag.replace(/_/g, ' ')).join(', ')}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
    <div className="space-y-4">
      <Section id="review-curriculum" title="Curriculum">
        <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Name</dt><dd className="font-semibold text-text">{draft.metadata.name}</dd></div>
          <div><dt className="text-xs text-muted">Internal code</dt><dd aria-label="Assigned internal code" className="font-semibold text-text">{validation.metadata.code}</dd></div>
          <div><dt className="text-xs text-muted">Program</dt><dd className="font-semibold text-text">{programName}</dd></div>
          <div><dt className="text-xs text-muted">Effective school year</dt><dd className="font-semibold tabular-nums text-text">{draft.metadata.effective_school_year}</dd></div>
          <div><dt className="text-xs text-muted">CMO</dt><dd className="font-semibold text-text">{draft.metadata.cmo_number.trim() ? `CMO ${draft.metadata.cmo_number.trim()}, s. ${draft.metadata.cmo_series.trim()}` : 'Not given'}</dd></div>
          <div><dt className="text-xs text-muted">Status after import</dt><dd className="font-semibold text-text">Deactivated</dd></div>
        </dl>
      </Section>

      <Section id="review-courses" title="Courses">
        <p className="mb-2 text-[13px] text-muted">
          {validation.rows.length} courses: {created} new
          {reused.length > 0 && <>, {reused.length} existing {reused.length === 1 ? 'course' : 'courses'} reused unchanged</>}
          {inactiveReused > 0 && <> ({inactiveReused} inactive, {inactiveReused === 1 ? 'stays' : 'stay'} inactive)</>}.
        </p>
        <ImportCoursesTable rows={validation.rows} />
      </Section>

      <Section id="review-changes" title={`Changes from the document (${material.length})`}>
        {material.length === 0
          ? <p className="text-[13px] text-muted">Every imported value matches the document.</p>
          : <ChangeTable changes={material} label="Changes from the document" />}
      </Section>

      <Section id="review-classification" title="Categories and class time">
        <p className="text-[13px] text-text">
          <span className="font-semibold tabular-nums">{majors}</span> major and <span className="font-semibold tabular-nums">{validation.rows.length - majors}</span> minor courses.
          {' '}Weekly class time uses {perUnitHours(validation.settings.lecture_minutes_per_unit)} per lecture unit and {perUnitHours(validation.settings.laboratory_minutes_per_unit)} per laboratory unit.
        </p>
      </Section>

      <Section id="review-notes" title={`Notes from the document (${draft.notes.length})`}>
        {draft.notes.length === 0
          ? <p className="text-[13px] text-muted">No notes were found in the document{draft.unread.length > 0 ? ' text' : ''}.</p>
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
              <p className="mt-1 text-xs text-muted">
                {unknownColour
                  ? 'Notes marked "colour not read" are saved without a colour and shown in the default text colour; the others keep the colours read from the document.'
                  : anyColour
                    ? 'Text and colours are kept as read from the document.'
                    : 'The source gives no colours, so the notes are saved as plain text.'}
              </p>
            </>
          )}
        {resolved.length > 0 && <p className="mt-1 text-xs text-muted">{resolved.length} unread part{resolved.length === 1 ? '' : 's'} of the document {resolved.length === 1 ? 'was' : 'were'} checked by the reviewer.</p>}
      </Section>

      {notices.length > 0 && (
        <Section id="review-notices" title={`Notices (${notices.length})`}>
          <ul className="space-y-1.5">
            {notices.map((issue) => (
              <li key={issue.key} className="flex gap-2 text-[13px] text-text">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> {issue.message}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(formatting.length > 0 || warnings.length > 0) && (
        <details className="rounded-lg border border-border bg-parchment/50 px-3 py-2 text-[13px]">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Info size={15} className="text-muted" aria-hidden="true" /> Information ({formatting.length + warnings.length})
          </summary>
          {warnings.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-text">{warnings.map((issue) => <li key={issue.key}>{issue.message}</li>)}</ul>}
          {formatting.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted">Differences in spacing or capitalisation only.</p>
              <ChangeTable changes={formatting} label="Formatting-only differences" />
            </div>
          )}
        </details>
      )}
    </div>
  );
}
