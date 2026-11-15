import { ArrowRight } from 'lucide-react';
import { Donut, DonutLegend, Panel, type Slice } from './DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';

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
      title="Instructor Load Overview"
      subtitle="Teaching load spread across all active instructors."
      action="View instructor loads"
      onAction={onOpen}
      className={className}
    >
      <div className="grid gap-4 sm:grid-cols-[128px_minmax(0,22rem)] sm:items-center sm:gap-6">
        <Donut slices={slices} headline={grouped(total)} caption="Total Instructors" />
        <DonutLegend slices={slices} total={total} />
      </div>

      {overloaded.length > 0 && (
        <div className="mt-4 border-t border-border/70 pt-3.5">
          <p className="text-xs font-semibold text-stage-warnText">
            Over maximum load ({grouped(overloaded.length)})
          </p>
          <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
            {overloaded.slice(0, 5).map(row => (
              <li key={row.id} className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                <b className="min-w-0 truncate text-[13px] font-semibold text-text" title={row.name}>{row.name}</b>
                <span className="min-w-0 truncate text-[11px] font-medium text-muted" title={row.department}>{row.department}</span>
                <span className="ml-auto shrink-0 rounded-full bg-accent/[0.12] px-2 py-0.5 text-[11px] font-bold tabular-nums text-stage-warnText">
                  {row.assigned} / {row.max} units
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onOpen}
          className="mt-auto inline-flex items-center gap-1 self-start pt-4 text-xs font-semibold text-primary transition-colors hover:text-primary-light"
        >
          View Instructor Loads <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {overloaded.length > 5 && (
          <p className="text-[11px] font-semibold text-muted">
            +{grouped(overloaded.length - 5)} more over their ceiling.
          </p>
        )}
      </div>
    </Panel>
  );
}
