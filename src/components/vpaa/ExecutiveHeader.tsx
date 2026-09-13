import { CalendarRange, Printer, RotateCcw } from 'lucide-react';
import { formatPhilippineDate } from '../../lib/philippineTime';
import { termLabel, type LabelledTerm } from '../../lib/termLabel';
import { relativeAge } from '../../lib/vpaaOverview';

/**
 * Which term these figures describe, how fresh they are, and how to take them
 * away.
 *
 * The dashboard reads through a session cache, so without a stamp there is no
 * way to tell a live figure from one loaded an hour ago — and no way to say
 * which academic term a "68% complete" refers to.
 */
export default function ExecutiveHeader({
  term,
  generatedAt,
  now,
  refreshing,
  onRefresh,
  onPrint,
}: {
  term: LabelledTerm | null;
  generatedAt: string | null;
  now: Date;
  refreshing: boolean;
  onRefresh: () => void;
  onPrint: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm print:border-0 print:shadow-none">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CalendarRange className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-bold leading-tight text-primary">Institutional Overview</h1>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-600">
          {termLabel(term)}
          {term ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Active</span> : null}
        </p>
      </div>

      <p className="text-right text-[11px] font-semibold leading-tight text-slate-500">
        <span className="block">Figures as of</span>
        <span className="block text-slate-700">
          {generatedAt
            ? `${formatPhilippineDate(generatedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${relativeAge(generatedAt, now)}`
            : '—'}
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition hover:border-primary/30 hover:text-primary disabled:opacity-50"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition hover:border-primary/30 hover:text-primary"
        >
          <Printer className="h-3.5 w-3.5" />
          Print briefing
        </button>
      </div>
    </section>
  );
}
