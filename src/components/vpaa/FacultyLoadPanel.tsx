import { Panel, type Slice } from './DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';

export interface FacultyLoadRow {
  id: number;
  name: string;
  department: string;
  assigned: number;
  max: number;
  over: number;
}

const valueOf = (slices: Slice[], key: string) => slices.find(slice => slice.key === key)?.value ?? 0;

/**
 * Workload exceptions only: who is over their maximum load, and who has no
 * classes yet. The full spread lives on the Instructors page.
 */
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
  const unassigned = valueOf(slices, 'none');
  const fullLoad = valueOf(slices, 'complete');
  const withRoom = valueOf(slices, 'remaining');

  return (
    <Panel
      title="Workload exceptions"
      subtitle={`${grouped(fullLoad)} at full load and ${grouped(withRoom)} with room for more, of ${grouped(total)} active instructors.`}
      action="View instructors"
      onAction={onOpen}
      className={className}
    >
      {overloaded.length > 0 ? (
        <>
          <p className="text-[13px] font-semibold text-stage-warnText">
            Over their maximum load ({grouped(overloaded.length)})
          </p>
          <ul className="mt-1 divide-y divide-border">
            {overloaded.slice(0, 5).map(row => (
              <li key={row.id} className="flex items-center gap-2 py-2">
                <b className="truncate text-[13px] font-semibold text-text" title={row.name}>{row.name}</b>
                <span className="truncate text-[12px] text-muted">{row.department}</span>
                <span className="ml-auto shrink-0 text-[13px] font-semibold tabular-nums text-stage-warnText">
                  {row.assigned} / {row.max} units
                </span>
              </li>
            ))}
          </ul>
          {overloaded.length > 5 && (
            <p className="mt-1 text-[12px] text-muted">{grouped(overloaded.length - 5)} more are over their ceiling.</p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-stage-done">No instructor is over their maximum load.</p>
      )}
      {unassigned > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted">
          <b className="font-semibold text-text">{grouped(unassigned)}</b> {unassigned === 1 ? 'instructor has' : 'instructors have'} no classes yet.
        </p>
      )}
    </Panel>
  );
}
