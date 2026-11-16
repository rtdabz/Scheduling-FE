import type { KeyboardEvent, ReactNode } from 'react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import { attentionLabel, groupKey, isPlaced, type GroupAttention, type GroupTotals } from '../../../lib/curriculumImport/draft';
import { TERM_LABELS, YEAR_LABELS } from '../../../lib/curriculumImport/normalize';
import type { DraftRow, PlacementTerm } from '../../../lib/curriculumImport/types';
import { HIGHLIGHT_CLASSES, jumpTo, termSectionId, UNASSIGNED_SECTION_ID, yearSectionId } from '../../../lib/curriculumImport/sheetNavigation';

/** What a step needs to draw one term's table inside the shared sheet. */
export interface SheetTerm {
  id: string;
  headingId: string;
  /** Spoken name that stays unique across the sheet, e.g. "Second Year, Summer". */
  label: string;
  /** The term's rows that pass the step's filter, in source order. */
  rows: DraftRow[];
  group?: GroupTotals;
  unassigned: boolean;
}

interface ImportCurriculumSheetProps {
  rows: DraftRow[];
  totals: GroupTotals[];
  /** Keyed `${year}-${term}`, or `unassigned`. */
  attention: Map<string, GroupAttention>;
  /** The term's table; the sheet supplies its heading, counts and placement. */
  renderTerm: (term: SheetTerm) => ReactNode;
  /** Controls in a term's heading, such as selecting its courses. */
  renderTermActions?: (term: SheetTerm) => ReactNode;
  /** Narrows the rows shown. Terms and years left with no row are hidden while a filter is on. */
  isVisible?: (row: DraftRow) => boolean;
  /** One term per line, for wide tables such as inline editing. */
  stacked?: boolean;
  /** Kept in view with the year navigation while the sheet scrolls. */
  stickyActions?: ReactNode;
  className?: string;
}

const REGULAR_TERMS: PlacementTerm[] = [1, 2];

const sumAttention = (values: (GroupAttention | undefined)[]): GroupAttention => values.reduce<GroupAttention>(
  (sum, value) => ({ errors: sum.errors + (value?.errors ?? 0), notices: sum.notices + (value?.notices ?? 0) }),
  { errors: 0, notices: 0 },
);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Error and notice counts for a year or term, as small marks beside its name. */
export function Attention({ value }: { value: GroupAttention | undefined }) {
  if (!value || (value.errors === 0 && value.notices === 0)) return null;
  return (
    <span className="flex items-center gap-1.5">
      {value.errors > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1 text-[11px] font-bold tabular-nums text-red-700" title={`${value.errors} with errors`}>
          <AlertOctagon size={11} aria-hidden="true" />{value.errors}
        </span>
      )}
      {value.notices > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded bg-accent/15 px-1 text-[11px] font-bold tabular-nums text-[#7a5410]" title={`${value.notices} notice${value.notices === 1 ? '' : 's'}`}>
          <AlertTriangle size={11} aria-hidden="true" />{value.notices}
        </span>
      )}
    </span>
  );
}

/** Arrow keys, Home and End move between the year buttons. */
const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = { ArrowRight: buttons[(index + 1) % buttons.length], ArrowLeft: buttons[(index - 1 + buttons.length) % buttons.length], Home: buttons[0], End: buttons[buttons.length - 1] }[event.key];
  if (!next || index === -1) return;
  event.preventDefault();
  next.focus();
};

/**
 * The whole curriculum laid out like the printed sheet: each year with its first and second semesters side by
 * side, and a summer term, when the document has one, as its own full-width table after that year. Built from the
 * draft's rows and groups, so any structure the document uses is shown as read. Preview and Configure share this
 * layout and each draw their own term table.
 */
export default function ImportCurriculumSheet({ rows, totals, attention, renderTerm, renderTermActions, isVisible, stacked = false, stickyActions, className = '' }: ImportCurriculumSheetProps) {
  const filtering = !!isVisible;
  const shown = (list: DraftRow[]) => (isVisible ? list.filter(isVisible) : list);
  const unassigned = rows.filter((row) => !isPlaced(row));
  const years = [...new Set(totals.filter((group) => group.year_level in YEAR_LABELS).map((group) => group.year_level))].sort((a, b) => a - b);
  const rowsFor = (year: number, term: PlacementTerm) => rows.filter((row) => row.year_level === year && row.semester === term);
  const groupFor = (year: number, term: PlacementTerm) => totals.find((group) => group.year_level === year && group.semester === term);

  const card = (term: SheetTerm, all: DraftRow[], heading: string, flags: GroupAttention | undefined, tone: 'default' | 'alert' = 'default') => {
    const units = all.reduce((sum, row) => sum + (row.total_units ?? 0), 0);
    const spoken = attentionLabel(flags);
    return (
      <section key={term.id} id={term.id} tabIndex={-1} aria-labelledby={term.headingId} className={`${HIGHLIGHT_CLASSES} scroll-mt-16 overflow-hidden rounded-lg border bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${tone === 'alert' ? 'border-red-200' : 'border-border'}`}>
        <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b px-3 py-1.5 ${tone === 'alert' ? 'border-red-200 bg-red-50/70' : 'border-border bg-parchment/70'}`}>
          <div className="flex items-center gap-2">
            {renderTermActions?.(term)}
            <h4 id={term.headingId} className={`text-[13px] font-bold ${tone === 'alert' ? 'text-red-800' : 'text-primary'}`}>
              {heading}
              {spoken && <span className="sr-only">, {spoken}</span>}
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs tabular-nums text-muted">
            <Attention value={flags} />
            <span>
              {plural(all.length, 'course')} · <span className="font-bold text-text">{units} units</span>
              {filtering && term.rows.length !== all.length && <> · {term.rows.length} shown</>}
            </span>
          </div>
        </div>
        {renderTerm(term)}
      </section>
    );
  };

  const termCard = (year: number, semester: PlacementTerm) => {
    const all = rowsFor(year, semester);
    const visible = shown(all);
    if (filtering && visible.length === 0) return null;
    const id = termSectionId(year, semester);
    return card(
      { id, headingId: `${id}-heading`, label: `${YEAR_LABELS[year]}, ${TERM_LABELS[semester]}`, rows: visible, group: groupFor(year, semester), unassigned: false },
      all,
      TERM_LABELS[semester],
      attention.get(groupKey(year, semester)),
    );
  };

  const navButton = (id: string, content: ReactNode, label: string, alert = false) => (
    <button
      key={id}
      type="button"
      onClick={() => jumpTo(id)}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${alert ? 'text-red-700 hover:bg-red-50' : 'text-text hover:bg-parchment hover:text-primary'}`}
    >
      {content}
    </button>
  );

  const visibleUnassigned = shown(unassigned);
  const yearSections = years.map((year) => {
    const regular = REGULAR_TERMS.filter((term) => groupFor(year, term)).map((term) => termCard(year, term)).filter(Boolean);
    const summer = groupFor(year, 3) ? termCard(year, 3) : null;
    if (regular.length === 0 && !summer) return null;
    const yearRows = rows.filter((row) => row.year_level === year && isPlaced(row));
    const units = yearRows.reduce((sum, row) => sum + (row.total_units ?? 0), 0);
    return (
      <section key={year} id={yearSectionId(year)} tabIndex={-1} aria-labelledby={`${yearSectionId(year)}-heading`} className="scroll-mt-14 space-y-3 focus:outline-none">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b-2 border-primary/80 pb-1">
          <h3 id={`${yearSectionId(year)}-heading`} className="text-[15px] font-bold uppercase tracking-[0.12em] text-primary">{YEAR_LABELS[year]}</h3>
          <p className="text-xs tabular-nums text-muted">{plural(yearRows.length, 'course')} · {units} units</p>
        </div>
        {regular.length > 0 && <div className={`grid items-start gap-3 ${stacked ? '' : 'lg:grid-cols-2'}`}>{regular}</div>}
        {summer}
      </section>
    );
  }).filter(Boolean);

  return (
    <div className={className}>
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-white/95 px-3 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:-mx-6 sm:px-5">
        <nav aria-label="Jump to year level" className="min-w-0">
          <div onKeyDown={moveFocus} className="flex items-center gap-1 overflow-x-auto [scrollbar-width:thin]">
            {years.map((year) => {
              const count = totals.filter((group) => group.year_level === year).reduce((sum, group) => sum + group.row_count, 0);
              const flags = sumAttention(([1, 2, 3] as PlacementTerm[]).map((term) => attention.get(groupKey(year, term))));
              const extra = attentionLabel(flags);
              return navButton(
                yearSectionId(year),
                <>{YEAR_LABELS[year]}<span className="text-xs tabular-nums text-muted">{count}</span><Attention value={flags} /></>,
                `Jump to ${YEAR_LABELS[year]}: ${plural(count, 'course')}${extra ? `, ${extra}` : ''}`,
              );
            })}
            {unassigned.length > 0 && navButton(
              UNASSIGNED_SECTION_ID,
              <>Unassigned<span className="text-xs tabular-nums">({unassigned.length})</span><Attention value={attention.get('unassigned')} /></>,
              `Jump to unassigned courses: ${plural(unassigned.length, 'course')} without a valid year or term`,
              true,
            )}
          </div>
        </nav>
        {stickyActions}
      </div>

      <div className="mt-4 space-y-6">
        {visibleUnassigned.length > 0 && card(
          { id: UNASSIGNED_SECTION_ID, headingId: `${UNASSIGNED_SECTION_ID}-heading`, label: 'Unassigned courses', rows: visibleUnassigned, unassigned: true },
          unassigned,
          'Unassigned courses — set a year and term',
          attention.get('unassigned'),
          'alert',
        )}
        {yearSections}
        {yearSections.length === 0 && visibleUnassigned.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted">
            {filtering && rows.length > 0 ? 'No courses match this filter.' : 'No courses were extracted.'}
          </p>
        )}
      </div>
    </div>
  );
}
