import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export interface InstructorWorkload {
  id: number | string;
  first_name: string;
  last_name: string;
  /** Units already on the instructor's plate. */
  assigned: number;
  /** Ceiling after deloading. May be 0 for staff with no teaching allocation. */
  max: number;
  profile_picture?: string | null;
}

interface WorkloadDatum {
  name: string;
  initials: string;
  photo: string | null;
  progress: number;
  units: string;
}

/** Tall enough for the 28px avatar plus breathing room on either side. */
const ROW_HEIGHT = 46;
/** Avatar + name + unit count. The bar takes whatever is left. */
const AXIS_WIDTH = 196;

const toDatum = (instructor: InstructorWorkload): WorkloadDatum => {
  const first = instructor.first_name?.trim() ?? '';
  const last = instructor.last_name?.trim() ?? '';

  return {
    name: `${first} ${last}`.trim() || 'Instructor',
    initials: `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?',
    photo: instructor.profile_picture ?? null,
    // Capped so an over-allocated instructor cannot run the bar past the track.
    progress: instructor.max > 0 ? Math.min(100, Math.round((instructor.assigned / instructor.max) * 100)) : 0,
    units: `${instructor.assigned}/${instructor.max}u`,
  };
};

/**
 * Avatar, name and unit count for one instructor, drawn as the category tick so
 * it stays locked to its own bar.
 *
 * Two things here are deliberate. The row is looked up by `index` because a
 * category tick's `payload` carries only {coordinate, value, index, offset} —
 * recharts does not hand the datum to the tick, so the previous
 * `payload.payload.profilePicture` read was always undefined and every
 * instructor fell back to initials. And the contents are laid out left to right
 * from the axis origin (`x` is the tick anchor, so `-x` is the plot's left
 * edge); anchoring them to the axis line instead made each avatar's position
 * depend on the width of the name beside it, which is what made the column
 * zig-zag.
 */
function InstructorAxisTick({ x = 0, y = 0, index = 0, rows = [] }: { x?: number; y?: number; index?: number; rows?: WorkloadDatum[] }) {
  const row = rows[index];
  if (!row) return <g />;

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-x} y={-ROW_HEIGHT / 2} width={Math.max(0, x - 4)} height={ROW_HEIGHT}>
        <div className="flex h-full items-center gap-2">
          {row.photo ? (
            <img src={row.photo} alt="" className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {row.initials}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700" title={row.name}>{row.name}</span>
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-500">{row.units}</span>
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * Assigned-versus-maximum teaching load, one bar per instructor.
 *
 * `minPointSize` is load-bearing rather than cosmetic: recharts skips a bar
 * whose value is 0, and it skips that bar's background track and label with it,
 * so instructors with nothing assigned yet rendered as a bare name with no
 * track at all. A one-pixel floor keeps the row on the chart.
 */
export default function InstructorWorkloadChart({ instructors }: { instructors: InstructorWorkload[] }) {
  if (!instructors.length) {
    return <p className="mt-3 py-3 text-center text-[11px] italic text-slate-400">No faculty available to this department.</p>;
  }

  const rows = instructors.map(toDatum);

  return (
    <div className="mt-3 min-w-0" style={{ height: Math.max(3, rows.length) * ROW_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 26, left: 0, bottom: 0 }} barCategoryGap={12}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={AXIS_WIDTH}
            tick={<InstructorAxisTick rows={rows} />}
            axisLine={false}
            tickLine={false}
          />
          <Bar
            dataKey="progress"
            fill="#16a36a"
            radius={[6, 6, 6, 6]}
            barSize={12}
            minPointSize={1}
            background={{ fill: '#e2e8f0', radius: 6 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
