import { useState } from 'react';
import Modal from '../../ui/Modal';
import { NoteText } from '../SourceNotes';
import { noteScopeLabel } from '../../../lib/curriculumImport/notes';
import { programLabel } from '../../../lib/programLabel';
import type { DraftMetadata, ExtractedMetadata, PlacementTerm, SourceNote, UnreadRegion } from '../../../lib/curriculumImport/types';
import type { Program } from '../../../types/curriculum';
import { IMPORT_HEADER_GRADIENT } from './importTheme';

export type MetadataField = 'name' | 'program_id' | 'effective_school_year' | 'cmo_number' | 'cmo_series';

export interface MetadataIssue {
  field: MetadataField;
  message: string;
}

interface ImportCurriculumDetailsModalProps {
  metadata: DraftMetadata;
  detected: ExtractedMetadata;
  programs: Program[];
  /** Program heads import only into their own program. */
  programLocked: boolean;
  code: { text: string; tag: 'Proposed' | 'Checked' | null; hint: string };
  issues: MetadataIssue[];
  /** Field to focus when opened from an error. */
  focusField: MetadataField | null;
  onChange: (patch: Partial<DraftMetadata>) => void;
  /** Notes printed on the document; reviewers can place them and add ones the extractor could not read. */
  notes: SourceNote[];
  courseCodes: Map<string, string>;
  onNotesChange: (notes: SourceNote[]) => void;
  /** Parts of the document the extractor could not read; each needs what the reviewer found there. */
  unread: UnreadRegion[];
  onUnreadChange: (unread: UnreadRegion[]) => void;
  onClose: () => void;
}

type Scope = SourceNote['scope'];

const scopeKey = (scope: Scope) => (scope.level === 'year' ? `year-${scope.year_level}`
  : scope.level === 'term' ? `term-${scope.year_level}-${scope.semester}`
    : scope.level === 'course' ? `course-${scope.row_id}` : 'curriculum');

const SCOPES: Scope[] = [
  { level: 'curriculum' },
  ...[1, 2, 3, 4].flatMap((year): Scope[] => [
    { level: 'year', year_level: year },
    ...([1, 2, 3] as PlacementTerm[]).map((semester): Scope => ({ level: 'term', year_level: year, semester })),
  ]),
];

const inputClass = 'h-9 w-full rounded-lg border bg-white px-3 text-[13px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-parchment disabled:text-muted';

/**
 * Edits the import's curriculum metadata directly in the parent draft: there is nothing to save or cancel,
 * so every way of closing keeps what was typed. The curriculum itself is created only on import.
 */
export default function ImportCurriculumDetailsModal({ metadata, detected, programs, programLocked, code, issues, focusField, onChange, notes, courseCodes, onNotesChange, unread, onUnreadChange, onClose }: ImportCurriculumDetailsModalProps) {
  const program = programs.find((candidate) => candidate.id === metadata.program_id) ?? null;
  const [transcription, setTranscription] = useState('');
  const placeNote = (id: string, scope: Scope) => onNotesChange(notes.map((note) => (note.id === id ? { ...note, scope } : note)));
  // Typed by the reviewer: no source text, no colour, and marked as such everywhere it is kept.
  const addNote = () => {
    const text = transcription.trim();
    if (!text) return;
    const next = Math.max(0, ...notes.map((note) => Number(note.id.match(/^m(\d+)$/)?.[1] ?? 0))) + 1;
    onNotesChange([...notes, { id: `m${next}`, source_text: null, text, runs: [{ length: [...text].length, color: null }], scope: { level: 'curriculum' }, provenance: null, flags: ['manual'] }]);
    setTranscription('');
  };
  const field = (name: MetadataField) => {
    const errors = issues.filter((issue) => issue.field === name);
    return {
      id: `import-details-${name}`,
      'aria-invalid': errors.length > 0 || undefined,
      'aria-describedby': errors.length > 0 ? `import-details-${name}-error` : undefined,
      'data-autofocus': focusField === name || undefined,
      className: `${inputClass} mt-1 ${errors.length > 0 ? 'border-red-300 bg-red-50/60' : 'border-border'}`,
    };
  };
  const error = (name: MetadataField) => {
    const errors = issues.filter((issue) => issue.field === name);
    return errors.length > 0 && <span id={`import-details-${name}-error`} className="mt-1 block text-xs font-semibold text-red-700">{errors.map((issue) => issue.message).join(' ')}</span>;
  };
  const label = 'block text-[13px] font-semibold text-text';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Curriculum details"
      description="Applies to the curriculum this import creates."
      size="lg"
      headerClassName={IMPORT_HEADER_GRADIENT}
      footer={(
        <>
          <p className="mr-auto text-xs text-muted">Changes are kept in this draft as you type. The curriculum is created only when you import.</p>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-5 text-[13px] font-bold text-white hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Done</button>
        </>
      )}
    >
      <div className="grid gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div className="sm:col-span-2">
          <label htmlFor="import-details-name" className={label}>Curriculum name <span className="text-red-700" aria-hidden="true">*</span></label>
          <input {...field('name')} value={metadata.name} onChange={(event) => onChange({ name: event.target.value })} />
          {error('name')}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="import-details-program_id" className={label}>Program</label>
          <select {...field('program_id')} value={metadata.program_id ?? ''} disabled={programLocked} onChange={(event) => onChange({ program_id: event.target.value ? Number(event.target.value) : null })}>
            <option value="">All programs in the department</option>
            {programs.map((candidate) => <option key={candidate.id} value={candidate.id}>{programLabel(candidate)}</option>)}
          </select>
          {programLocked && <span className="mt-1 block text-xs text-muted">Program heads import into their own program.</span>}
          {detected.program_text && <span className="mt-1 block text-xs text-muted">From the document: {detected.program_text}{!program ? '. No matching program is selected.' : ''}</span>}
          {error('program_id')}
        </div>
        <div>
          <label htmlFor="import-details-effective_school_year" className={label}>Effective school year <span className="text-red-700" aria-hidden="true">*</span></label>
          <input {...field('effective_school_year')} value={metadata.effective_school_year} placeholder="2020-2021" onChange={(event) => onChange({ effective_school_year: event.target.value })} />
          {error('effective_school_year')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="import-details-cmo_number" className={label}>CMO number</label>
            <input {...field('cmo_number')} value={metadata.cmo_number} onChange={(event) => onChange({ cmo_number: event.target.value })} />
            {error('cmo_number')}
          </div>
          <div>
            <label htmlFor="import-details-cmo_series" className={label}>Series</label>
            <input {...field('cmo_series')} value={metadata.cmo_series} inputMode="numeric" placeholder="2015" onChange={(event) => onChange({ cmo_series: event.target.value })} />
            {error('cmo_series')}
          </div>
        </div>
        <div className="sm:col-span-2">
          <span className={label}>Internal code</span>
          <p className="mt-1 flex min-h-9 items-center gap-2 rounded-lg border border-border bg-white/60 px-3 text-[13px]">
            <span aria-label="Internal code" className="font-semibold text-text">{code.text}</span>
            {code.tag === 'Proposed' && <span className="rounded bg-accent/15 px-1.5 text-[11px] font-bold text-[#7a5410]">Proposed</span>}
            {code.tag === 'Checked' && <span className="rounded bg-emerald-50 px-1.5 text-[11px] font-bold text-emerald-800">Checked</span>}
          </p>
          <span className="mt-1 block text-xs text-muted">{code.hint}</span>
        </div>
        <section aria-labelledby="import-details-notes" className="sm:col-span-2">
          <h3 id="import-details-notes" className="text-[13px] font-semibold text-text">
            Notes from the document <span className="font-normal text-muted tabular-nums">({notes.length})</span>
          </h3>
          <p className="text-xs text-muted">Kept exactly as printed, in their colours, and shown with the curriculum. They are never turned into courses or rules.</p>
          {notes.length === 0 && <p className="mt-2 text-xs text-muted">No notes were found in the document.</p>}
          <ul className="mt-2 space-y-2">
            {notes.map((note, index) => (
              <li key={note.id} className="rounded-lg border border-border bg-white px-3 py-2">
                <p className="text-[13px] leading-snug text-text"><NoteText note={note} /></p>
                {note.source_text !== null && note.source_text !== note.text && (
                  <p className="mt-1 text-[11px] text-muted">As printed: <span className="whitespace-pre-wrap break-words">{note.source_text}</span></p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <label className="flex items-center gap-1.5">
                    Shown with
                    <select
                      aria-label={`Placement of note ${index + 1}`}
                      value={scopeKey(note.scope)}
                      onChange={(event) => placeNote(note.id, [...SCOPES, note.scope].find((scope) => scopeKey(scope) === event.target.value) ?? note.scope)}
                      className="h-8 rounded-md border border-border bg-white px-2 text-xs text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {note.scope.level === 'course' && <option value={scopeKey(note.scope)}>{noteScopeLabel(note.scope, courseCodes.get(note.scope.row_id))}</option>}
                      {SCOPES.map((scope) => <option key={scopeKey(scope)} value={scopeKey(scope)}>{noteScopeLabel(scope)}</option>)}
                    </select>
                  </label>
                  {note.provenance?.kind === 'pdf' && <span>Page {note.provenance.page}</span>}
                  {note.flags.includes('color_unknown') && <span>Colour could not be read from the document</span>}
                  {note.flags.includes('manual') && (
                    <>
                      <span>Typed by the reviewer</span>
                      <button type="button" onClick={() => onNotesChange(notes.filter((candidate) => candidate.id !== note.id))} className="font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Remove</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {unread.length > 0 && (
            <fieldset className="mt-3 rounded-lg border border-accent/40 bg-accent/[0.07] px-3 py-2">
              <legend className="px-1 text-[13px] font-semibold text-text">Parts of the document that were not read ({unread.length})</legend>
              <p className="text-xs text-muted">Check each one in the document. If it holds a note, type it in below; the import stays blocked until each is answered.</p>
              <ul className="mt-2 space-y-2">
                {unread.map((region, index) => (
                  <li key={index} className="text-[13px] text-text">
                    <p>
                      {region.page ? `Page ${region.page}: ` : ''}
                      {region.reason === 'image' ? 'an image in the course area' : `text not recognised: "${region.text ?? ''}"`}
                    </p>
                    <div role="radiogroup" aria-label={`What part ${index + 1} of the document holds`} className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {([['transcribed', 'I typed its note in'], ['no_note', 'It holds no note']] as const).map(([value, text]) => (
                        <label key={value} className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`unread-${index}`}
                            checked={region.resolution === value}
                            onChange={() => onUnreadChange(unread.map((candidate, at) => (at === index ? { ...candidate, resolution: value } : candidate)))}
                            className="accent-primary"
                          />
                          {text}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <div className="mt-3">
            <label htmlFor="import-details-new-note" className={label}>Add a note the extractor could not read</label>
            <span className="block text-xs text-muted">For example text in an image. Type it exactly as printed.</span>
            <textarea id="import-details-new-note" value={transcription} onChange={(event) => setTranscription(event.target.value)} rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button type="button" onClick={addNote} disabled={!transcription.trim()} className="mt-1 inline-flex h-8 items-center rounded-lg border border-primary bg-white px-3 text-xs font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50">Add note</button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
