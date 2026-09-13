import { AlertTriangle, CalendarX, ChevronRight, DoorOpen, UserX } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import {
  SCHEDULE_STAGE_LABELS,
  type SectionOverview,
} from '../../hooks/useScheduleOverview';

const STRIP_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

interface Props {
  sections: SectionOverview[];
  isLoading: boolean;
  onOpen: (sectionId: number) => void;
}

const stageStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  revision: 'bg-amber-50 text-amber-800 border-amber-200',
  completed: 'bg-sky-50 text-sky-800 border-sky-200',
  submitted: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  approved_by_dean: 'bg-violet-50 text-violet-800 border-violet-200',
  conditionally_approved: 'bg-violet-50 text-violet-800 border-violet-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

/**
 * Meetings per weekday. A section whose week is lopsided shows it here without
 * anyone having to open the grid to find out.
 */
function DayLoadStrip({ dayLoad }: { dayLoad: Record<string, number> }) {
  const peak = Math.max(1, ...STRIP_DAYS.map((day) => dayLoad[day] ?? 0));

  return (
    <div className="flex items-end gap-1" aria-hidden="true">
      {STRIP_DAYS.map((day) => {
        const count = dayLoad[day] ?? 0;
        return (
          <div key={day} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-8 w-full items-end rounded-sm bg-slate-100">
              <div
                className={`w-full rounded-sm ${count > 0 ? 'bg-[#C9952A]' : 'bg-transparent'}`}
                style={{ height: `${count === 0 ? 0 : Math.max(18, (count / peak) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] font-bold uppercase text-slate-400">{day.slice(0, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Flag({ icon: Icon, count, label }: { icon: typeof AlertTriangle; count: number; label: string; }) {
  if (count === 0) return null;

  const isConflict = label === 'conflicts';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
        isConflict
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-amber-50 text-amber-800 border-amber-200'
      }`}
    >
      <Icon className="w-3 h-3" />
      {count} {label}
    </span>
  );
}

export default function SectionOverviewCards({ sections, isLoading, onOpen }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400 italic">
        This department has no active sections for the term.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sections.map((section) => {
        const isEmpty = section.meetings === 0;

        return (
          <div
            key={section.id}
            role="button"
            tabIndex={isEmpty ? -1 : 0}
            aria-disabled={isEmpty}
            onClick={() => !isEmpty && onOpen(section.id)}
            onKeyDown={(event) => {
              if (!isEmpty && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onOpen(section.id);
              }
            }}
            className={`group rounded-2xl border bg-white p-4 text-left shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#C9952A]/40 ${
              isEmpty
                ? 'border-dashed border-slate-200 opacity-70 cursor-default'
                : 'border-slate-200/80 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md cursor-pointer'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800 leading-tight">{section.code}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Year {section.year_level}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${stageStyles[section.status] ?? stageStyles.draft}`}>
                {SCHEDULE_STAGE_LABELS[section.status] ?? section.status}
              </span>
            </div>

            <div className="mt-3">
              <DayLoadStrip dayLoad={section.day_load} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {isEmpty ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  <CalendarX className="w-3 h-3" />
                  Not scheduled yet
                </span>
              ) : (
                <>
                  <Flag icon={AlertTriangle} count={section.conflicts.total} label="conflicts" />
                  <Flag icon={UserX} count={section.unassigned_faculty} label="no faculty" />
                  <Flag icon={DoorOpen} count={section.unassigned_rooms} label="no room" />
                </>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <p className="text-[11px] font-semibold text-slate-400">
                {section.classes} class{section.classes === 1 ? '' : 'es'}
                <span className="mx-1.5 text-slate-300">·</span>
                {section.meetings} meeting{section.meetings === 1 ? '' : 's'}
              </p>
              {!isEmpty && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#4e0a10] opacity-0 transition-opacity group-hover:opacity-100">
                  Timetable
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
