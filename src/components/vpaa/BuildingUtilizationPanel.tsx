import { Panel } from './DashboardPrimitives';
import { EmptyNote } from '../dashboard/Ledger';
import { BarRow } from '../dashboard/Analytics';
import { STAGE } from '../../lib/dashboardStage';
import { grouped } from '../../lib/dashboardFormat';
import type { VpaaInsights } from '../../lib/vpaaInsights';

/**
 * A summary of campus room use: booked hours overall and per building, and the
 * rooms nobody uses. Room-by-room detail lives in Reports. One bar colour only:
 * no utilization threshold is an agreed institutional limit.
 */
export default function BuildingUtilizationPanel({
  insights,
  state,
  onRetry,
  onOpenDetails,
  className = '',
}: {
  insights: VpaaInsights | null;
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  onOpenDetails: () => void;
  className?: string;
}) {
  const utilization = insights?.utilization;
  const used = utilization?.buildings.filter(row => row.rooms_in_use > 0 || row.meetings > 0) ?? [];
  const idle = utilization?.buildings.filter(row => row.rooms_in_use === 0 && row.meetings === 0) ?? [];

  return (
    <Panel
      title="Room use"
      subtitle="Share of operating hours that rooms are booked."
      action="Open reports"
      onAction={onOpenDetails}
      className={className}
    >
      {state === 'loading' ? <EmptyNote>Measuring room use…</EmptyNote>
        : state === 'error' || !utilization ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-md bg-accent/10 px-3 py-2.5 text-[12px] text-stage-warnText">
            <span className="flex-1">Room use could not be loaded.</span>
            <button type="button" onClick={onRetry} className="focus-ring rounded font-semibold underline-offset-4 hover:underline">Retry</button>
          </div>
        ) : utilization.rooms_total === 0 ? <EmptyNote>No rooms are set up yet.</EmptyNote> : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <b className="text-[26px] font-semibold leading-none tabular-nums text-primary">{utilization.average_utilization}%</b>
              <span className="text-[13px] text-muted">
                average booked · {grouped(utilization.rooms_in_use)} of {grouped(utilization.rooms_total)} rooms in use
              </span>
            </div>
            {used.length > 0 && <ul className="mt-4 space-y-3">
              {used.map(row => (
                <BarRow
                  key={row.building}
                  label={row.building}
                  sublabel={`${row.rooms_in_use} of ${row.rooms} rooms`}
                  value={row.utilization}
                  valueLabel={`${row.utilization}% booked`}
                  color={STAGE.approved}
                  title={`${row.rooms_in_use} of ${row.rooms} rooms in use, ${row.meetings} classes`}
                />
              ))}
            </ul>}
            {(idle.length > 0 || utilization.idle_room_count > 0) && (
              <div className="mt-4 space-y-1 border-t border-border pt-2.5 text-[12px] leading-relaxed text-muted">
                {idle.length > 0 && <p>No classes in {idle.map(row => row.building).join(', ')}.</p>}
                {utilization.idle_room_count > 0 && <p>{grouped(utilization.idle_room_count)} {utilization.idle_room_count === 1 ? 'room is' : 'rooms are'} unused this semester.</p>}
              </div>
            )}
          </>
        )}
    </Panel>
  );
}
