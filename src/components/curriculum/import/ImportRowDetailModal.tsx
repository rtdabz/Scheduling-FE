import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from '../../ui/Modal';
import SourceCropPreview from './SourceCropPreview';
import { TERM_LABELS } from '../../../lib/curriculumImport/normalize';
import type { DraftRow, ImportIssue, PlacementTerm } from '../../../lib/curriculumImport/types';

interface ImportRowDetailModalProps {
  row: DraftRow | null;
  issues: ImportIssue[];
  bytes: ArrayBuffer | null;
  onClose: () => void;
  onChange: (rowId: string, patch: Partial<DraftRow>) => void;
}

const field = 'h-10 rounded-lg border bg-white px-3 text-[14px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const okBorder = 'border-border';
const badBorder = 'border-red-300 bg-red-50/60';
const unitBox = `${field} w-16 shrink-0 px-0 text-center text-[16px] font-bold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

const creditValue = (value: string): number | null => (value.trim() === '' ? null : Number(value));
const docValue = (value: number | null) => (value === null || Number.isNaN(value) ? 'blank' : String(value));

function FieldLabel({ htmlFor, children, edited }: { htmlFor?: string; children: ReactNode; edited?: boolean }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-text">{children}</label>
      {edited && <span className="rounded bg-accent/15 px-1.5 py-px text-[10px] font-bold text-[#7a5410]">Edited</span>}
    </div>
  );
}

export default function ImportRowDetailModal({ row, issues, bytes, onClose, onChange }: ImportRowDetailModalProps) {
  if (!row) return null;

  const id = row.row_id;
  const { lecture_units: lec, lab_units: lab, total_units: tu, source } = row;
  const sum = lec !== null && lab !== null ? lec + lab : null;
  const mismatch = sum !== null && tu !== null && sum !== tu;
  const blankUnit = [lec, lab, tu].includes(null);
  // Lecture and laboratory drive the total; the total stays editable and a mismatch is still reported.
  const setComponent = (key: 'lecture_units' | 'lab_units', value: number | null) => {
    const next = { lecture_units: lec, lab_units: lab, [key]: value };
    onChange(id, { [key]: value, total_units: next.lecture_units !== null && next.lab_units !== null ? next.lecture_units + next.lab_units : tu });
  };

  const prerequisitesEdited = (row.prerequisites ?? '') !== (source.prerequisites ?? '');

  const localProblems = [
    !row.code.trim() && 'course code',
    !row.title.trim() && 'course title',
    !row.year_level && 'year',
    !row.semester && 'term',
    blankUnit && 'blank units',
    mismatch && 'units that do not add up',
  ].filter(Boolean) as string[];
  const errors = issues.filter((issue) => issue.severity === 'error');
  const reviews = issues.filter((issue) => issue.severity === 'review' && !issue.acknowledged);
  const toFix = localProblems.length;

  const footerStatus = toFix > 0
    ? <span className="flex items-center gap-1.5 text-red-700"><AlertOctagon size={15} aria-hidden="true" /> {toFix} thing{toFix === 1 ? '' : 's'} still to complete</span>
    : <span className="flex items-center gap-1.5 text-emerald-800"><CheckCircle2 size={15} aria-hidden="true" /> Changes apply as you type</span>;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit ${row.code || 'course'}`}
      description="Compare with the document and correct what was read. The original values stay on record."
      size="lg"
      footer={(
        <>
          <p className="mr-auto text-[13px] font-semibold" role="status">{footerStatus}</p>
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-lg bg-primary px-6 text-[13px] font-bold text-white hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            Done
          </button>
        </>
      )}
    >
      <div className="space-y-5 px-4 py-5 sm:px-5">
        {(errors.length > 0 || reviews.length > 0) && (
          <section aria-label="Checks for this course" className="space-y-1.5">
            {errors.map((issue) => (
              <p key={issue.key} className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                <AlertOctagon size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {issue.message}
              </p>
            ))}
            {reviews.map((issue) => (
              <p key={issue.key} className="flex gap-2 rounded-lg border border-accent/40 bg-accent/[0.07] px-3 py-2 text-[13px] text-text">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> {issue.message}
              </p>
            ))}
          </section>
        )}

        <section aria-labelledby={`details-${id}`} className="rounded-xl border border-border bg-white p-4">
          <h3 id={`details-${id}`} className="text-[15px] font-semibold text-text">Course details</h3>

          <div className="mt-3 grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div>
              <FieldLabel htmlFor={`code-${id}`} edited={row.code !== source.code}>Course code</FieldLabel>
              <input id={`code-${id}`} autoFocus value={row.code} onChange={(event) => onChange(id, { code: event.target.value })} className={`${field} w-full font-semibold ${row.code.trim() ? okBorder : badBorder}`} />
              <p className="mt-1 truncate text-xs text-muted">Document: {source.code || 'blank'}</p>
            </div>
            <div>
              <FieldLabel htmlFor={`title-${id}`} edited={row.title !== source.title}>Course title</FieldLabel>
              <input id={`title-${id}`} value={row.title} onChange={(event) => onChange(id, { title: event.target.value })} className={`${field} w-full ${row.title.trim() ? okBorder : badBorder}`} />
              <p className="mt-1 truncate text-xs text-muted">Document: {source.title || 'blank'}</p>
            </div>
          </div>

          {row.code_suggestion && row.code !== row.code_suggestion && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/[0.07] px-3 py-2 text-[13px] text-text">
              <p><span className="font-bold">{source.code}</span> has look-alike characters. The document also mentions <span className="font-bold">{row.code_suggestion}</span>.</p>
              <button type="button" onClick={() => onChange(id, { code: row.code_suggestion! })} className="h-8 rounded-md border border-primary bg-white px-3 text-xs font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                Use {row.code_suggestion}
              </button>
            </div>
          )}

          <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex gap-3">
              <div>
                <FieldLabel htmlFor={`year-${id}`}>Year level</FieldLabel>
                <select id={`year-${id}`} value={row.year_level ?? ''} onChange={(event) => onChange(id, { year_level: event.target.value ? Number(event.target.value) : null })} className={`${field} w-28 ${row.year_level ? okBorder : badBorder}`}>
                  <option value="">Choose</option>
                  {[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor={`term-${id}`}>Term</FieldLabel>
                <select id={`term-${id}`} value={row.semester ?? ''} onChange={(event) => onChange(id, { semester: event.target.value ? (Number(event.target.value) as PlacementTerm) : null })} className={`${field} w-44 ${row.semester ? okBorder : badBorder}`}>
                  <option value="">Choose</option>
                  {([1, 2, 3] as const).map((term) => <option key={term} value={term}>{TERM_LABELS[term]}</option>)}
                </select>
              </div>
            </div>

            <fieldset className="min-w-0">
              <legend className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-text">
                Units
                {(lec !== source.lec || lab !== source.lab || tu !== source.tu) && <span className="rounded bg-accent/15 px-1.5 py-px text-[10px] font-bold text-[#7a5410]">Edited</span>}
              </legend>
              <div className="flex flex-wrap items-start gap-2">
                {([
                  ['lecture_units', 'Lecture', lec, source.lec],
                  ['lab_units', 'Laboratory', lab, source.lab],
                  ['total_units', 'Total', tu, source.tu],
                ] as const).map(([key, label, value, original], index) => (
                  <div key={key} className="flex items-start gap-2">
                    {index > 0 && <span aria-hidden="true" className="pt-2.5 text-[15px] text-muted">{index === 1 ? '+' : '='}</span>}
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={value ?? ''}
                        placeholder="—"
                        aria-label={`${label} units`}
                        onChange={(event) => (key === 'total_units' ? onChange(id, { total_units: creditValue(event.target.value) }) : setComponent(key, creditValue(event.target.value)))}
                        className={`${unitBox} ${value === null || (key === 'total_units' && mismatch) ? badBorder : okBorder} ${key === 'total_units' ? 'bg-parchment' : ''}`}
                      />
                      <span className="mt-1 text-[11px] font-semibold text-text">{label}</span>
                      <span className="text-[11px] tabular-nums text-muted">doc {docValue(original)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {mismatch && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-red-700">
                  Lecture + laboratory is {sum}, but the total is {tu}.
                  <button type="button" onClick={() => onChange(id, { total_units: sum })} className="rounded-md border border-red-300 bg-white px-2 py-0.5 font-bold hover:bg-red-50">Set total to {sum}</button>
                </p>
              )}
              {blankUnit && <p className="mt-2 text-xs font-semibold text-red-700">A blank unit is not zero. Enter the value from the curriculum.</p>}
            </fieldset>
          </div>
          {localProblems.length > 0 && <p className="mt-3 text-xs font-semibold text-red-700">Still needed: {localProblems.join(', ')}.</p>}
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section aria-labelledby={`source-${id}`} className="min-w-0">
            <h3 id={`source-${id}`} className="mb-2 text-[15px] font-semibold text-text">From the document</h3>
            <SourceCropPreview bytes={bytes} source={source} />
          </section>

          <section aria-labelledby={`prerequisite-${id}`} className="min-w-0">
            <h3 id={`prerequisite-${id}`} className="mb-2 text-[15px] font-semibold text-text">Prerequisite</h3>
            <FieldLabel htmlFor={`prerequisites-${id}`} edited={prerequisitesEdited}>As written in the curriculum</FieldLabel>
            <textarea
              id={`prerequisites-${id}`}
              value={row.prerequisites ?? ''}
              onChange={(event) => onChange(id, { prerequisites: event.target.value === '' ? null : event.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="None"
              className={`w-full rounded-lg border bg-white px-3 py-2 text-[13px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${okBorder}`}
            />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="min-w-0 break-words">Document: {source.prerequisites || 'none given'}</span>
              {prerequisitesEdited && (
                <button type="button" onClick={() => onChange(id, { prerequisites: source.prerequisites })} className="rounded-md border border-border bg-white px-2 py-0.5 font-bold text-text hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  Use document text
                </button>
              )}
            </p>
            <p className="mt-2 text-xs text-muted">Stored for reference only. Fix reading errors here; prerequisites do not affect scheduling.</p>
          </section>
        </div>
      </div>
    </Modal>
  );
}
