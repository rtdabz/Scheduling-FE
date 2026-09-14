import { AlertTriangle, ArrowRight, CheckCircle2, DoorOpen, UserX, X } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import {
  SCHEDULE_STAGE_LABELS,
  type ConflictBreakdown,
  type SectionScheduleStage,
} from '../../hooks/useScheduleOverview';
import type { OverviewFocus } from './DepartmentOverviewCards';

/**
 * The figures for whatever the All Schedules screen is currently scoped to:
 * every department, one department, or one section.
 *
 * Every problem figure is counted in meetings (one weekly session: an MWF class
 * is three), so each card says "of N meetings" rather than sitting next to a
 * class count it can exceed.
 */
export interface ScopeStats {
  sectionsScheduled: number;
  sectionsTotal: number;
  classes: number;
  meetings: number;
  unassignedFaculty: number;
  unassignedRooms: number;
  conflicts: ConflictBreakdown;
  /** Only at section scope, where a single stage is meaningful. */
  status?: SectionScheduleStage;
}

interface Props {
  scopeLabel: string;
  level: 'institution' | 'department' | 'section';
  stats: ScopeStats | null;
  isLoading: boolean;
  focus: OverviewFocus | null;
  onFocusChange: (focus: OverviewFocus | null) => void;
}

const plural = (count: number, word: string) => (
  `${count} ${word}${count === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`
);

function IssueCard({
  icon: Icon,
  title,
  count,
  detail,
  clearLabel,
  actionLabel,
  tone,
  isActive,
  onClick,
}: {
  icon: typeof AlertTriangle;
  title: string;
  count: number;
  detail: string;
  clearLabel: string;
  actionLabel: string;
  tone: 'warning' | 'danger';
  isActive: boolean;
  onClick: () => void;
}) {
  // Nothing to show means nothing to click: render it as a calm, static card
  // instead of a button that lifts on hover and then does nothing.
  if (count === 0 && !isActive) {
    return (
      <div className="flex min-h-[112px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
        <p className="text-xs font-bold text-slate-500">{title}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          {clearLabel}
        </p>
      </div>
    );
  }

  const palette = tone === 'danger'
    ? { card: 'border-rose-200 bg-rose-50/40 hover:bg-rose-50', number: 'text-rose-700', icon: 'text-rose-500', ring: 'ring-rose-400' }
    : { card: 'border-amber-200 bg-amber-50/40 hover:bg-amber-50', number: 'text-amber-700', icon: 'text-amber-500', ring: 'ring-amber-400' };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`group flex min-h-[112px] flex-col justify-between rounded-2xl border px-4 py-3.5 text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]/50 ${palette.card} ${
        isActive ? `ring-2 ${palette.ring} shadow-md` : 'shadow-sm hover:shadow-md'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-600">{title}</p>
        <Icon className={`h-4 w-4 ${palette.icon}`} />
      </div>
      <div className="mt-1">
        <p className={`text-2xl font-black leading-none ${palette.number}`}>{count}</p>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">{detail}</p>
      </div>
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#4e0a10]">
        {isActive ? (
          <>
            <X className="h-3.5 w-3.5" />
            Showing these · clear
          </>
        ) : (
          <>
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </p>
    </button>
  );
}

export default function ScheduleScopeSummary({ scopeLabel, level, stats, isLoading, focus, onFocusChange }: Props) {
  if (isLoading && !stats) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (!stats) return null;

  const toggle = (next: OverviewFocus) => onFocusChange(focus === next ? null : next);
  const target = level === 'institution' ? 'departments' : level === 'department' ? 'sections' : 'meetings';
  const readiness = stats.sectionsTotal === 0 ? 0 : Math.round((stats.sectionsScheduled / stats.sectionsTotal) * 100);
  const overridden = stats.conflicts.overridden ?? 0;
  const conflictKinds = [
    stats.conflicts.faculty > 0 ? `${stats.conflicts.faculty} faculty` : '',
    stats.conflicts.room > 0 ? `${stats.conflicts.room} room` : '',
    stats.conflicts.section > 0 ? `${stats.conflicts.section} section` : '',
  ].filter(Boolean).join(' · ');

  return (
    <section aria-label={`Summary for ${scopeLabel}`} className="space-y-2">
      <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
        Summary · <span className="text-[#4e0a10]">{scopeLabel}</span>
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-h-[112px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
          {level === 'section' ? (
            <>
              <p className="text-xs font-bold text-slate-500">Schedule status</p>
              <p className="mt-1 text-lg font-black leading-tight text-[#4e0a10]">
                {stats.status ? SCHEDULE_STAGE_LABELS[stats.status] : 'Not started'}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-bold text-slate-500">Sections with a schedule</p>
                <p className="text-xs font-bold text-slate-400">{readiness}%</p>
              </div>
              <p className="mt-1 text-2xl font-black leading-none text-[#4e0a10]">
                {stats.sectionsScheduled}
                <span className="text-sm font-bold text-slate-400"> of {stats.sectionsTotal}</span>
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${readiness === 100 ? 'bg-emerald-500' : 'bg-[#C9952A]'}`}
                  style={{ width: `${readiness}%` }}
                />
              </div>
            </>
          )}
          <p className="mt-2 text-[11px] font-semibold text-slate-500" title="A meeting is one weekly session: a class held Mon/Wed/Fri is 3 meetings.">
            {plural(stats.classes, 'class')} · {plural(stats.meetings, 'weekly meeting')}
          </p>
        </div>

        <IssueCard
          icon={UserX}
          title="Missing faculty"
          count={stats.unassignedFaculty}
          detail={`of ${plural(stats.meetings, 'meeting')} have no instructor`}
          clearLabel="Every meeting has an instructor"
          actionLabel={`Show affected ${target}`}
          tone="warning"
          isActive={focus === 'missing-faculty'}
          onClick={() => toggle('missing-faculty')}
        />
        <IssueCard
          icon={DoorOpen}
          title="Missing room"
          count={stats.unassignedRooms}
          detail={`of ${plural(stats.meetings, 'meeting')} have no room`}
          clearLabel="Every on-site meeting has a room"
          actionLabel={`Show affected ${target}`}
          tone="warning"
          isActive={focus === 'missing-room'}
          onClick={() => toggle('missing-room')}
        />
        <IssueCard
          icon={AlertTriangle}
          title="Conflicts"
          count={stats.conflicts.total}
          detail={[
            conflictKinds ? `meetings clash (${conflictKinds})` : 'meetings clash',
            overridden > 0 ? `· ${overridden} overridden` : '',
          ].filter(Boolean).join(' ')}
          clearLabel={overridden > 0 ? `No open conflicts · ${overridden} overridden` : 'No double-bookings'}
          actionLabel={`Show affected ${target}`}
          tone="danger"
          isActive={focus === 'conflicts'}
          onClick={() => toggle('conflicts')}
        />
      </div>

      <p className="text-[11px] font-medium text-slate-400">
        A <strong className="font-bold text-slate-500">conflict</strong> is two meetings at the same time that share an
        instructor, a room, or a section. Counts are in weekly meetings, so a Mon/Wed/Fri class counts as 3.
      </p>
    </section>
  );
}
