import { ArrowRight } from 'lucide-react';
import { Donut, DonutLegend, Panel, type Slice } from './DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';

/**
 * Faculty load, institution-wide.
 *
 * The donut answers "how are loads spread"; the list under it answers "who is a
 * problem", which is the part a VPAA can actually act on. Overload is a
 * compliance and cost exposure, so the names are named rather than left as a
 * slice of a ring.
 */

export interface FacultyLoadRow {
  id: number;
  name: string;
  department: string;
  assigned: number;
  max: number;
  over: number;
}

export default function FacultyLoadPanel({
  slices,
  total,
  overloaded,
  onOpen,
  className = '',
}: {
  slices: Slice[];
  total: number;
  overloaded: FacultyLoadRow[];
  onOpen: () => void;
  className?: string;
}) {
  return (
    <Panel
      title="Faculty Load Overview"
      subtitle="Teaching load spread across all active faculty."
      action="View faculty loads"
      onAction={onOpen}
      className={`flex flex-col ${className}`}
    >
      <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
        <Donut slices={slices} headline={grouped(total)} caption="Total Faculty" />
        <DonutLegend slices={slices} total={total} />
      </div>

      {overloaded.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
            Over maximum load ({grouped(overloaded.length)})
          </p>
          <ul className="mt-1.5 divide-y divide-slate-100">
            {overloaded.slice(0, 5).map(row => (
              <li key={row.id} className="flex items-center gap-2 py-1.5">
                <b className="truncate text-[12px] text-slate-700" title={row.name}>{row.name}</b>
                <span className="truncate text-[11px] font-semibold text-slate-400">{row.department}</span>
                <span className="ml-auto shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800">
                  {row.assigned} / {row.max} units
                </span>
              </li>
            ))}
          </ul>
          {overloaded.length > 5 && (
            <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
              +{grouped(overloaded.length - 5)} more over their ceiling.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="mt-auto self-start pt-3 text-xs font-bold text-primary hover:underline"
      >
        View Faculty Loads <ArrowRight className="inline h-3.5 w-3.5" />
      </button>
    </Panel>
  );
}
