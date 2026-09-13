import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Panel } from './DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';
import type { VpaaInsights } from '../../lib/vpaaInsights';

/**
 * Room utilisation, per building.
 *
 * Utilisation is booked minutes against the institution's own operating window,
 * not against a flat 24 hours — "62%" means 62% of the hours the campus actually
 * runs, which is the only figure a capital-planning conversation can use.
 *
 * A Dean sees this for their own rooms. Buildings are shared, so the campus-wide
 * rollup only exists here.
 */

const COLUMNS = 'minmax(0,1.3fr) minmax(0,1fr) 64px 72px';

const barFill = (utilization: number) => {
  if (utilization >= 85) return '#e11d48';
  if (utilization >= 65) return '#f59e0b';
  return '#16a36a';
};

export default function BuildingUtilizationPanel({
  insights,
  loading,
  onOpenRooms,
  className = '',
}: {
  insights: VpaaInsights;
  loading: boolean;
  onOpenRooms: () => void;
  className?: string;
}) {
  const { utilization } = insights;

  return (
    <Panel
      title="Room Utilisation by Building"
      subtitle="Share of campus operating hours each building is booked for."
      action="View all rooms"
      onAction={onOpenRooms}
      className={`flex flex-col ${className}`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Rooms" value={grouped(utilization.rooms_total)} />
        <Figure label="In use" value={grouped(utilization.rooms_in_use)} />
        <Figure label="Idle" value={grouped(utilization.idle_room_count)} />
        <Figure label="Avg. load" value={`${utilization.average_utilization}%`} />
      </div>

      {loading && <p className="mt-4 py-6 text-center text-xs italic text-slate-400">Measuring room usage…</p>}

      {!loading && utilization.buildings.length === 0 && (
        <p className="mt-4 py-6 text-center text-xs italic text-slate-400">No rooms are configured yet.</p>
      )}

      {!loading && utilization.buildings.length > 0 && (
        <div className="-mx-1 mt-3 overflow-x-auto px-1 sm:overflow-x-visible">
          <div className="min-w-[380px] sm:min-w-0">
            <div
              className="grid gap-2 border-b border-slate-100 pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400"
              style={{ gridTemplateColumns: COLUMNS }}
            >
              <span>Building</span>
              <span>Utilisation</span>
              <span className="text-right">Rooms</span>
              <span className="text-right">Classes</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {utilization.buildings.map(row => (
                <li key={row.building} className="grid items-center gap-2 py-2" style={{ gridTemplateColumns: COLUMNS }}>
                  <b className="truncate text-[12px] text-slate-700" title={row.building}>{row.building}</b>
                  <span className="h-6 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[{ value: row.utilization, label: `${row.utilization}%` }]}
                        layout="vertical"
                        margin={{ top: 4, right: 38, left: 0, bottom: 4 }}
                      >
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" hide />
                        <Bar
                          dataKey="value"
                          fill={barFill(row.utilization)}
                          radius={[5, 5, 5, 5]}
                          barSize={9}
                          background={{ fill: '#e2e8f0', radius: 5 }}
                        >
                          <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </span>
                  <span className="text-right text-[11px] font-semibold tabular-nums text-slate-500">
                    {grouped(row.rooms_in_use)} / {grouped(row.rooms)}
                  </span>
                  <span className="text-right text-[11px] font-semibold tabular-nums text-slate-500">{grouped(row.meetings)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!loading && utilization.idle_rooms.length > 0 && (
        <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] font-semibold leading-relaxed text-slate-500">
          <b className="text-slate-700">Unused this term:</b>{' '}
          {utilization.idle_rooms.map(room => room.room_code).join(', ')}
          {utilization.idle_room_count > utilization.idle_rooms.length &&
            ` +${utilization.idle_room_count - utilization.idle_rooms.length} more`}
        </p>
      )}
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2 text-center">
      <b className="block text-base leading-none tabular-nums text-primary">{value}</b>
      <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-slate-500" title={label}>{label}</span>
    </div>
  );
}
