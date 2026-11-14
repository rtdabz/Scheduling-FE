import ProfileAvatar from '../ui/ProfileAvatar';

export interface InstructorWorkload {
  id: number | string;
  first_name: string;
  last_name: string;
  assigned: number;
  max: number;
  profile_picture?: string | null;
}

interface WorkloadDatum {
  id: number | string;
  name: string;
  photo: string | null;
  progress: number;
  /** Uncapped share of the maximum load, so overload reads above 100%. */
  load: number;
  units: string;
  color?: string;
}

const toDatum = (instructor: InstructorWorkload, colorOf?: (instructor: InstructorWorkload) => string): WorkloadDatum => {
  const first = instructor.first_name?.trim() ?? '';
  const last = instructor.last_name?.trim() ?? '';
  const load = instructor.max > 0 ? Math.round((instructor.assigned / instructor.max) * 100) : 0;

  return {
    id: instructor.id,
    name: `${first} ${last}`.trim() || 'Instructor',
    photo: instructor.profile_picture ?? null,
    progress: Math.min(100, load),
    load,
    units: `${instructor.assigned}/${instructor.max} units`,
    color: colorOf?.(instructor),
  };
};

interface InstructorWorkloadChartProps {
  instructors: InstructorWorkload[];
  /** Frames each instructor in its own bordered card instead of a plain row. */
  cards?: boolean;
  /** Compact analytics rows: small avatar, thin bar and the uncapped load %. */
  dense?: boolean;
  /** Bar color per instructor, so rows can share a chart's status palette. */
  colorOf?: (instructor: InstructorWorkload) => string;
}

export default function InstructorWorkloadChart({ instructors, cards = false, dense = false, colorOf }: InstructorWorkloadChartProps) {
  if (!instructors.length) {
    return <p className="py-4 text-center text-[13px] text-muted">No instructors available to this department.</p>;
  }

  if (dense) {
    return (
      <ul className="-mx-2 min-w-0 space-y-0.5">
        {instructors.map(instructor => toDatum(instructor, colorOf)).map(row => (
          <li key={row.id} className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-parchment">
            <ProfileAvatar src={row.photo} className="h-7 w-7 shrink-0 rounded-full border border-border" iconClassName="h-3.5 w-3.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13px] font-medium leading-5 text-text" title={row.name}>{row.name}</span>
                <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted">
                  {row.units}
                  <span className="ml-1.5 inline-block min-w-[2.25rem] text-right font-semibold text-text">{row.load}%</span>
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${row.name} workload`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={row.progress}
                aria-valuetext={`${row.units}, ${row.load}% of maximum load`}
                className="mt-1 h-1 w-full overflow-hidden rounded-full bg-stage-idle"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out ${row.color ? '' : row.progress >= 100 ? 'bg-stage-done' : 'bg-accent'}`}
                  style={{ width: `${row.progress}%`, backgroundColor: row.color }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={`min-w-0 ${cards ? 'space-y-2.5' : 'space-y-4'}`}>
      {instructors.map(instructor => toDatum(instructor)).map((row) => (
        <li key={row.id} className={`flex min-w-0 items-center gap-3 ${cards ? 'rounded-xl border border-border/70 px-4 py-3' : ''}`}>
          <ProfileAvatar src={row.photo} className="h-9 w-9 shrink-0 rounded-full border border-border" iconClassName="h-4 w-4" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] font-semibold leading-5 text-text" title={row.name}>{row.name}</span>
              <span className={`shrink-0 whitespace-nowrap text-xs font-medium tabular-nums ${row.progress >= 100 ? 'text-stage-done' : 'text-muted'}`}>{row.units}</span>
            </div>
            <div
              role="progressbar"
              aria-label={`${row.name} workload`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.progress}
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stage-idle"
            >
              <div className={`h-full rounded-full ${row.progress >= 100 ? 'bg-stage-done' : 'bg-accent'}`} style={{ width: `${row.progress}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
