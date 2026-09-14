import { AlertTriangle, ChevronRight, DoorOpen, UserX } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import { getDeptAccentClass } from '../../lib/departmentTheme';
import {
  SCHEDULE_STAGE_LABELS,
  type DepartmentOverview,
} from '../../hooks/useScheduleOverview';

/** What a chip asks the drill-down to pre-filter on when it is clicked. */
export type OverviewFocus = 'conflicts' | 'missing-faculty' | 'missing-room';

interface Props {
  departments: DepartmentOverview[];
  isLoading: boolean;
  /**
   * `focus` carries the reason the user clicked, so opening a department from
   * its "3 conflicts" chip lands on the conflicting sections rather than on an
   * unfiltered list they have to narrow down again.
   */
  onOpen: (departmentId: number, focus?: OverviewFocus) => void;
}

type Tone = 'clear' | 'warning' | 'danger';

const toneStyles: Record<Tone, { band: string; label: string; chip: string }> = {
  clear: {
    band: 'bg-emerald-500',
    label: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    chip: 'text-slate-500 bg-slate-50 border-slate-200',
  },
  warning: {
    band: 'bg-amber-500',
    label: 'text-amber-800 bg-amber-50 border-amber-200',
    chip: 'text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100',
  },
  danger: {
    band: 'bg-rose-500',
    label: 'text-rose-800 bg-rose-50 border-rose-200',
    chip: 'text-rose-800 bg-rose-50 border-rose-200 hover:bg-rose-100',
  },
};

const departmentTone = (department: DepartmentOverview): Tone => {
  if (department.conflicts.total > 0) return 'danger';
  if (
    department.unassigned_faculty > 0 ||
    department.unassigned_rooms > 0 ||
    department.sections_scheduled < department.sections_total
  ) {
    return 'warning';
  }
  return 'clear';
};

const toneLabel = (department: DepartmentOverview, tone: Tone): string => {
  if (department.sections_total === 0) return 'No sections';
  if (tone === 'danger') return 'Conflicts';
  if (tone === 'warning') return 'Needs attention';
  return SCHEDULE_STAGE_LABELS[department.status] ?? 'On track';
};

function Chip({
  icon: Icon,
  count,
  label,
  tone,
  onClick,
}: {
  icon: typeof AlertTriangle;
  count: number;
  label: string;
  tone: Tone;
  onClick: () => void;
}) {
  const shared = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors';

  // A zero chip has nothing to drill into. It stays visible so the three
  // figures can be compared at a glance, but as plain text: a disabled button
  // would swallow the click instead of letting it open the card behind it.
  if (count === 0) {
    return (
      <span className={`${shared} text-slate-400 bg-slate-50 border-slate-200`}>
        <Icon className="w-3.5 h-3.5" />
        {count} {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`${shared} ${toneStyles[tone].chip} cursor-pointer`}
    >
      <Icon className="w-3.5 h-3.5" />
      {count} {label}
    </button>
  );
}

export default function DepartmentOverviewCards({ departments, isLoading, onOpen }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Skeleton key={item} className="h-48 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400 italic">
        No departments to show for the active semester.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {departments.map((department) => {
        const tone = departmentTone(department);
        const readiness = department.sections_total === 0
          ? 0
          : Math.round((department.sections_scheduled / department.sections_total) * 100);

        return (
          <div
            key={department.department_id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(department.department_id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(department.department_id);
              }
            }}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 pl-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#C9952A]/40 cursor-pointer"
          >
            <span className={`absolute inset-y-0 left-0 w-1.5 ${getDeptAccentClass(department.code, department.name)}`} />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-black text-[#4e0a10] leading-tight">{department.code}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{department.name}</p>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${toneStyles[tone].label}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${toneStyles[tone].band}`} />
                {toneLabel(department, tone)}
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Sections scheduled</p>
                <p className="text-xs font-bold text-slate-600">
                  {department.sections_scheduled} / {department.sections_total}
                </p>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${readiness === 100 ? 'bg-emerald-500' : 'bg-[#C9952A]'}`}
                  style={{ width: `${readiness}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Chip icon={AlertTriangle} count={department.conflicts.total} label="conflicts" tone="danger" onClick={() => onOpen(department.department_id, 'conflicts')} />
              <Chip icon={UserX} count={department.unassigned_faculty} label="no faculty" tone="warning" onClick={() => onOpen(department.department_id, 'missing-faculty')} />
              <Chip icon={DoorOpen} count={department.unassigned_rooms} label="no room" tone="warning" onClick={() => onOpen(department.department_id, 'missing-room')} />
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <p className="text-[11px] font-semibold text-slate-400">
                {department.classes} class{department.classes === 1 ? '' : 'es'}
                <span className="mx-1.5 text-slate-300">·</span>
                {department.meetings} meeting{department.meetings === 1 ? '' : 's'}
              </p>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#4e0a10] transition-transform group-hover:translate-x-0.5">
                Open
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
