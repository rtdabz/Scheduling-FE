import { AlertOctagon, Check } from 'lucide-react';
import type { GroupTotals } from '../../../lib/curriculumImport/draft';
import { TERM_LABELS, YEAR_LABELS } from '../../../lib/curriculumImport/normalize';
import type { PlacementTerm } from '../../../lib/curriculumImport/types';

export type TermSelection = { year: number; term: PlacementTerm } | 'all';

interface ImportTermRailProps {
  totals: GroupTotals[];
  rowCount: number;
  unplacedCount: number;
  errorsByGroup: Map<string, number>;
  selection: TermSelection;
  onSelect: (selection: TermSelection) => void;
}

const TERM_SHORT: Record<PlacementTerm, string> = { 1: 'First semester', 2: 'Second semester', 3: 'Summer' };

const totalsDiffer = (group: GroupTotals) => !!group.reported
  && (group.reported.lec !== group.calculated.lec || group.reported.lab !== group.calculated.lab || group.reported.tu !== group.calculated.tu);

/**
 * Year → term navigation that doubles as the sheet's TOTAL CREDITS column: each term shows its calculated
 * units, and a printed total that disagrees is marked right in the navigation.
 */
export default function ImportTermRail({ totals, rowCount, unplacedCount, errorsByGroup, selection, onSelect }: ImportTermRailProps) {
  const isActive = (year: number, term: PlacementTerm) => selection !== 'all' && selection.year === year && selection.term === term;

  return (
    <nav aria-label="Curriculum terms" className="rounded-xl border border-border bg-parchment p-2">
      <button
        type="button"
        onClick={() => onSelect('all')}
        aria-current={selection === 'all' ? 'page' : undefined}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selection === 'all' ? 'bg-primary text-white' : 'text-text hover:bg-white'}`}
      >
        <span>All courses <span className={`font-normal ${selection === 'all' ? 'text-white/75' : 'text-muted'}`}>in source order</span></span>
        <span className="tabular-nums">{rowCount}</span>
      </button>
      {unplacedCount > 0 && (
        <p className="mx-3 mt-1 text-xs font-semibold text-red-700">{unplacedCount} without a year or term</p>
      )}

      <div className="mt-2 grid gap-x-2 gap-y-3 sm:grid-cols-2 lg:grid-cols-1">
        {[1, 2, 3, 4].map((year) => (
          <section key={year} aria-labelledby={`term-rail-year-${year}`}>
            <h3 id={`term-rail-year-${year}`} className="px-3 pb-1 font-sans text-xs font-bold text-primary">{YEAR_LABELS[year]}</h3>
            <ul className="space-y-0.5">
              {([1, 2, 3] as const).map((term) => {
                const group = totals.find((candidate) => candidate.year_level === year && candidate.semester === term);
                const active = isActive(year, term);
                const errors = errorsByGroup.get(`${year}-${term}`) ?? 0;
                if (!group) {
                  return (
                    <li key={term} className="flex items-center justify-between px-3 py-1.5 text-xs text-muted/70">
                      <span>{TERM_SHORT[term]}</span>
                      <span>Not in source</span>
                    </li>
                  );
                }
                const differs = totalsDiffer(group);
                return (
                  <li key={term}>
                    <button
                      type="button"
                      onClick={() => onSelect({ year, term })}
                      aria-current={active ? 'page' : undefined}
                      aria-label={`${YEAR_LABELS[year]}, ${TERM_LABELS[term]}: ${group.row_count} courses, ${group.calculated.tu} units${differs ? `, printed total ${group.reported?.tu ?? 'blank'}` : ''}${errors ? `, ${errors} with errors` : ''}`}
                      className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        active ? 'bg-white font-bold text-primary ring-1 ring-primary/30' : 'text-text hover:bg-white'
                      }`}
                    >
                      <span className="truncate">
                        {TERM_SHORT[term]}
                        <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">{group.row_count}</span>
                      </span>
                      <span className={`text-xs tabular-nums ${differs ? 'rounded bg-accent/15 px-1.5 font-bold text-[#7a5410]' : 'text-muted'}`}>
                        {differs ? `${group.calculated.tu} vs ${group.reported?.tu ?? '?'}` : `${group.calculated.tu} u`}
                      </span>
                      <span className="flex w-4 justify-end" aria-hidden="true">
                        {errors > 0
                          ? <AlertOctagon size={13} className="text-red-600" />
                          : !differs && group.reported
                            ? <Check size={13} className="text-emerald-700" />
                            : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-3 border-t border-border px-3 pt-2 text-[11px] leading-snug text-muted">
        Units are calculated from the rows. A gold figure means the printed total differs, shown as calculated vs printed.
      </p>
    </nav>
  );
}
