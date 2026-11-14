import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Panel } from './DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';
import type { VpaaInsights } from '../../lib/vpaaInsights';

const COLUMNS = 'minmax(0,1.3fr) minmax(0,1fr) 64px 72px';

const barFill = (utilization: number) => {
  if (utilization >= 85) return '#B4432F';
  if (utilization >= 65) return '#C9952A';
  return '#3F7D58';
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

      {loading && <p className="mt-4 py-6 text-center text-xs text-muted">Measuring room usage…</p>}

      {!loading && utilization.buildings.length === 0 && (
        <p className="mt-4 py-6 text-center text-xs text-muted">No rooms are configured yet.</p>
      )}

      {!loading && utilization.buildings.length > 0 && (
        <div className="-mx-1 mt-3 overflow-x-auto px-1 sm:overflow-x-visible">
          <div className="min-w-[380px] sm:min-w-0">
            <div
              className="grid gap-2 px-3 pb-2 text-[11px] font-bold text-muted"
              style={{ gridTemplateColumns: COLUMNS }}
            >
              <span>Building</span>
              <span>Utilisation</span>
              <span className="text-right">Rooms</span>
              <span className="text-right">Classes</span>
            </div>
            <ul className="space-y-2">
              {utilization.buildings.map(row => (
                <li key={row.building} className="grid items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5" style={{ gridTemplateColumns: COLUMNS }}>
                  <b className="truncate text-[13px] text-text" title={row.building}>{row.building}</b>
                  <span className="h-6 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[{ value: row.utilization, label: `${row.utilization}%` }]}
                        layout="vertical"
                        margin={{ top: 4, right: 42, left: 0, bottom: 4 }}
                      >
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" hide />
                        <Bar
                          dataKey="value"
                          fill={barFill(row.utilization)}
                          radius={[4, 4, 4, 4]}
                          barSize={6}
                          background={{ fill: '#E6DED5', radius: 4 }}
                        >
                          <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 11, fontWeight: 600, fill: '#7A6E67' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </span>
                  <span className="text-right text-[11px] font-semibold tabular-nums text-muted">
                    {grouped(row.rooms_in_use)} / {grouped(row.rooms)}
                  </span>
                  <span className="text-right text-[11px] font-semibold tabular-nums text-muted">{grouped(row.meetings)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!loading && utilization.idle_rooms.length > 0 && (
        <p className="mt-3 pt-1 text-[11px] font-semibold leading-relaxed text-muted">
          <b className="text-text">Unused this semester:</b>{' '}
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
    <div className="min-w-0 rounded-xl bg-parchment/70 px-3 py-2.5 text-center">
      <span className="block text-lg font-bold leading-none tabular-nums text-text">{value}</span>
      <span className="mt-1.5 block truncate text-[11px] font-medium text-muted" title={label}>{label}</span>
    </div>
  );
}
