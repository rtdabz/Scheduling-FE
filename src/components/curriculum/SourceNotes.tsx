import { FileText } from 'lucide-react';
import { noteSegments } from '../../lib/curriculumImport/notes';
import type { NoteRun } from '../../types/curriculum';

export interface DisplayNote {
  id: string;
  text: string;
  runs: NoteRun[];
  /** Shown before the text, in the interface colour, e.g. "Second Semester" or "Course IT 101". */
  label?: string;
}

interface SourceNotesProps {
  notes: DisplayNote[];
  title?: string;
  className?: string;
}

/** The note's text in its printed colours. Text is escaped by React; colours are validated #RRGGBB values only. */
export function NoteText({ note }: { note: Pick<DisplayNote, 'text' | 'runs'> }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {noteSegments(note).map((segment, index) => (
        <span key={index} style={segment.color ? { color: segment.color } : undefined}>{segment.text}</span>
      ))}
    </span>
  );
}

/**
 * Notes printed on the curriculum document, shown as content on a light surface. They are deliberately
 * styled unlike validation errors: red source text is the document's own colour, not a problem.
 */
export default function SourceNotes({ notes, title = 'From the curriculum document', className = '' }: SourceNotesProps) {
  if (notes.length === 0) return null;
  return (
    <section aria-label={title} className={`rounded-lg border border-border bg-white px-3 py-2 ${className}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        <FileText size={12} aria-hidden="true" /> {title}
      </p>
      <ul className="mt-1 space-y-1.5">
        {notes.map((note) => (
          <li key={note.id} className="text-[13px] leading-snug text-text">
            {note.label && <span className="mr-1.5 text-xs font-semibold text-muted">{note.label}:</span>}
            <NoteText note={note} />
          </li>
        ))}
      </ul>
    </section>
  );
}
