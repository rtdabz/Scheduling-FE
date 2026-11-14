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
      className={`flex flex-col ${className}`}
    >
      <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
        <Donut slices={slices} headline={grouped(total)} caption="Total Instructors" />
        <DonutLegend slices={slices} total={total} />
      </div>

      {overloaded.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-stage-warnText">
            Over maximum load ({grouped(overloaded.length)})
          </p>
          <ul className="mt-2.5 space-y-2">
            {overloaded.slice(0, 5).map(row => (
              <li key={row.id} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2">
                <b className="truncate text-[13px] text-text" title={row.name}>{row.name}</b>
                <span className="truncate text-[11px] font-semibold text-muted">{row.department}</span>
                <span className="ml-auto shrink-0 rounded-full bg-accent/[0.12] px-2 py-0.5 text-[11px] font-bold tabular-nums text-stage-warnText">
                  {row.assigned} / {row.max} units
                </span>
              </li>
            ))}
          </ul>
          {overloaded.length > 5 && (
            <p className="mt-1.5 text-[11px] font-semibold text-muted">
              +{grouped(overloaded.length - 5)} more over their ceiling.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="mt-auto inline-flex items-center gap-1 self-start pt-4 text-xs font-semibold text-primary transition-colors hover:text-primary-light"
      >
        View Instructor Loads <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </Panel>
  );
}
