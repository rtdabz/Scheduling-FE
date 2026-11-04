import type { KeyboardEvent } from 'react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import { groupKey, selectionForYear, totalsDiffer, type GroupAttention, type GroupTotals, type PreviewSelection } from '../../../lib/curriculumImport/draft';
import { YEAR_LABELS } from '../../../lib/curriculumImport/normalize';
import type { PlacementTerm } from '../../../lib/curriculumImport/types';

interface ImportTermTabsProps {
  totals: GroupTotals[];
  unassignedCount: number;
  /** Keyed `${year}-${term}`, or `unassigned`. */
  attention: Map<string, GroupAttention>;
  selection: PreviewSelection;
  panelId: string;
  onSelect: (selection: PreviewSelection) => void;
}

const YEARS = [1, 2, 3, 4];
const TERMS = [1, 2, 3] as const;
const TERM_TAB_LABELS: Record<PlacementTerm, string> = { 1: 'First semester', 2: 'Second semester', 3: 'Summer' };

/** Arrow keys, Home and End move between enabled tabs and select them, as a single tab stop per row. */
const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([aria-disabled="true"])')];
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const next = {
    ArrowRight: tabs[(index + 1) % tabs.length],
    ArrowLeft: tabs[(index - 1 + tabs.length) % tabs.length],
    Home: tabs[0],
    End: tabs[tabs.length - 1],
  }[event.key];
  if (!next || index === -1) return;
  event.preventDefault();
  next.focus();
  next.click();
};

function Attention({ value }: { value: GroupAttention | undefined }) {
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

const attentionLabel = (value: GroupAttention | undefined) => [
  value?.errors ? `${value.errors} with errors` : null,
  value?.notices ? `${value.notices} notice${value.notices === 1 ? '' : 's'}` : null,
].filter(Boolean).join(', ');

const tabClass = (active: boolean, disabled: boolean) => `-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
  active
    ? 'border-primary font-bold text-primary'
    : disabled
      ? 'cursor-not-allowed border-transparent text-muted/60'
      : 'border-transparent font-semibold text-muted hover:border-primary/30 hover:text-text'
}`;

/**
 * Year and term tabs for the Preview step. Counts and units come from the live draft, so edits and moves
 * update them immediately; a term emptied while selected stays selectable until the reviewer leaves it.
 */
export default function ImportTermTabs({ totals, unassignedCount, attention, selection, panelId, onSelect }: ImportTermTabsProps) {
  const activeYear = selection === 'unassigned' ? null : selection.year;
  const activeTerm = selection === 'unassigned' ? null : selection.term;

  const yearAttention = (year: number): GroupAttention => TERMS.reduce((sum, term) => {
    const value = attention.get(groupKey(year, term));
    return { errors: sum.errors + (value?.errors ?? 0), notices: sum.notices + (value?.notices ?? 0) };
  }, { errors: 0, notices: 0 });

  return (
    <div className="space-y-1">
      <div role="tablist" aria-label="Year level" onKeyDown={moveFocus} className="flex overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:thin]">
        {YEARS.map((year) => {
          const groups = totals.filter((group) => group.year_level === year);
          const active = activeYear === year;
          const disabled = groups.length === 0 && !active;
          const count = groups.reduce((sum, group) => sum + group.row_count, 0);
          const flags = yearAttention(year);
          return (
            <button
              key={year}
              type="button"
              role="tab"
              id={`import-year-tab-${year}`}
              aria-selected={active}
              aria-controls={panelId}
              aria-disabled={disabled || undefined}
              aria-label={`${YEAR_LABELS[year]}: ${disabled ? 'not in source' : `${count} courses`}${attentionLabel(flags) ? `, ${attentionLabel(flags)}` : ''}`}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                if (disabled || active) return;
                const next = selectionForYear(totals, year, activeTerm);
                if (next) onSelect(next);
              }}
              className={tabClass(active, disabled)}
            >
              {YEAR_LABELS[year]}
              <span className={`text-xs tabular-nums ${active ? 'text-primary/70' : 'text-muted'}`}>{disabled ? '—' : count}</span>
              <Attention value={flags} />
            </button>
          );
        })}
        {(unassignedCount > 0 || selection === 'unassigned') && (
          <button
            type="button"
            role="tab"
            id="import-year-tab-unassigned"
            aria-selected={selection === 'unassigned'}
            aria-controls={panelId}
            aria-label={`Unassigned: ${unassignedCount} courses without a valid year or term${attentionLabel(attention.get('unassigned')) ? `, ${attentionLabel(attention.get('unassigned'))}` : ''}`}
            tabIndex={selection === 'unassigned' ? 0 : -1}
            onClick={() => onSelect('unassigned')}
            className={`${tabClass(selection === 'unassigned', false)} ml-auto ${unassignedCount > 0 && selection !== 'unassigned' ? 'text-red-700' : ''}`}
          >
            Unassigned
            <span className="text-xs tabular-nums">({unassignedCount})</span>
            <Attention value={attention.get('unassigned')} />
          </button>
        )}
      </div>

      {activeYear !== null && activeTerm !== null && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
          <label className="flex items-center gap-2 text-[13px] font-semibold text-text">
            Semester
            <select
              aria-controls={panelId}
              value={activeTerm}
              onChange={(event) => onSelect({ year: activeYear, term: Number(event.target.value) as PlacementTerm })}
              className="h-9 rounded-lg border border-border bg-white px-3 text-[13px] font-semibold text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {TERMS.map((term) => {
                const group = totals.find((candidate) => candidate.year_level === activeYear && candidate.semester === term);
                // A term emptied while selected stays choosable until the reviewer leaves it.
                const disabled = !group && activeTerm !== term;
                const flags = attentionLabel(attention.get(groupKey(activeYear, term)));
                return (
                  <option key={term} value={term} disabled={disabled}>
                    {TERM_TAB_LABELS[term]} {disabled
                      ? '(not in source)'
                      : `(${group?.row_count ?? 0}${group && totalsDiffer(group) ? ', printed total differs' : ''}${flags ? `, ${flags}` : ''})`}
                  </option>
                );
              })}
            </select>
          </label>
          <Attention value={attention.get(groupKey(activeYear, activeTerm))} />
        </div>
      )}
    </div>
  );
}
