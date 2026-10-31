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
  units: string;
}

const toDatum = (instructor: InstructorWorkload): WorkloadDatum => {
  const first = instructor.first_name?.trim() ?? '';
  const last = instructor.last_name?.trim() ?? '';

  return {
    id: instructor.id,
    name: `${first} ${last}`.trim() || 'Instructor',
    photo: instructor.profile_picture ?? null,
    progress: instructor.max > 0 ? Math.min(100, Math.round((instructor.assigned / instructor.max) * 100)) : 0,
    units: `${instructor.assigned}/${instructor.max} units`,
  };
};

export default function InstructorWorkloadChart({ instructors }: { instructors: InstructorWorkload[] }) {
  if (!instructors.length) {
    return <p className="py-4 text-center text-[13px] text-muted">No instructors available to this department.</p>;
  }

  return (
    <ul className="min-w-0 space-y-3.5">
      {instructors.map(toDatum).map((row) => (
        <li key={row.id} className="flex min-w-0 items-center gap-2.5">
          <ProfileAvatar src={row.photo} className="h-8 w-8 shrink-0 rounded-full border border-border" iconClassName="h-4 w-4" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-text" title={row.name}>{row.name}</span>
              <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-muted">{row.units}</span>
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
