import type { GroupTotals } from '../../../lib/curriculumImport/draft';
import { TERM_LABELS, YEAR_LABELS } from '../../../lib/curriculumImport/normalize';

interface ImportCreditLedgerProps {
  totals: GroupTotals[];
  rowCount: number;
}

type Triple = { lec: number | null; lab: number | null; tu: number | null };

const triple = (value: Triple | null) => (value ? `${value.lec ?? '?'} / ${value.lab ?? '?'} / ${value.tu ?? '?'}` : null);

const differs = (group: GroupTotals) => !!group.reported
  && (group.reported.lec !== group.calculated.lec || group.reported.lab !== group.calculated.lab || group.reported.tu !== group.calculated.tu);

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Printed against calculated units per term, laid out like the sheet's TOTAL CREDITS lines. */
export default function ImportCreditLedger({ totals, rowCount }: ImportCreditLedgerProps) {
  const calculatedTu = totals.reduce((sum, group) => sum + group.calculated.tu, 0);
  const printedGroups = totals.filter((group) => group.reported);
  const printedTu = printedGroups.reduce((sum, group) => sum + (group.reported?.tu ?? 0), 0);
  const mismatches = totals.filter(differs);
  const years = [...new Set(totals.map((group) => group.year_level))];

  return (
    <section aria-labelledby="credit-ledger-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="credit-ledger-heading" className="text-base font-semibold text-text">Credit totals</h3>
        <p className="text-[13px] text-muted">
          {mismatches.length === 0
            ? 'Every printed total matches its courses.'
            : `${mismatches.length} term${mismatches.length === 1 ? '' : 's'} disagree${mismatches.length === 1 ? 's' : ''} with the printed total.`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[40rem] text-[13px]">
          <thead className="bg-parchment text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Term</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Courses</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Printed <span className="font-normal">lec / lab / TU</span></th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Calculated <span className="font-normal">lec / lab / TU</span></th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">TU difference</th>
            </tr>
          </thead>
          {years.map((year) => (
            <tbody key={year} className="border-t border-border">
              <tr>
                <th scope="rowgroup" colSpan={5} className="bg-white px-4 pb-1 pt-3 text-left text-xs font-bold text-primary">{YEAR_LABELS[year]}</th>
              </tr>
              {totals.filter((group) => group.year_level === year).map((group) => {
                const mismatch = differs(group);
                const difference = group.reported?.tu == null ? null : group.calculated.tu - group.reported.tu;
                return (
                  <tr key={`${group.year_level}-${group.semester}`} className={mismatch ? 'bg-accent/10' : ''}>
                    <th scope="row" className="px-4 py-1.5 text-left font-normal text-text">{TERM_LABELS[group.semester]}</th>
                    <td className="px-3 py-1.5 text-right tabular-nums">{group.row_count}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{triple(group.reported) ?? 'not printed'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${mismatch ? 'font-bold text-text' : ''}`}>{triple(group.calculated)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {group.row_count === 0
                        ? <span className="text-muted">empty, not created</span>
                        : difference === null
                          ? <span className="text-muted">no printed total</span>
                          : difference === 0 && !mismatch
                            ? <span className="text-emerald-700">matches</span>
                            : <span className="font-bold text-[#7a5410]">{signed(difference)}{difference === 0 ? ' (lec/lab differ)' : ''}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot className="border-t-2 border-primary/30 bg-parchment font-bold">
            <tr>
              <th scope="row" className="px-4 py-2 text-left">All terms</th>
              <td className="px-3 py-2 text-right tabular-nums">{rowCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{printedGroups.length ? `${printedTu} TU` : '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{calculatedTu} TU</td>
              <td className="px-4 py-2 text-right tabular-nums">{printedGroups.length ? (calculatedTu - printedTu === 0 ? 'matches' : signed(calculatedTu - printedTu)) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {printedGroups.length > 0 && printedGroups.length < totals.filter((group) => group.row_count > 0).length && (
        <p className="text-xs text-muted">The printed figure sums only the terms that print a total.</p>
      )}
    </section>
  );
}
