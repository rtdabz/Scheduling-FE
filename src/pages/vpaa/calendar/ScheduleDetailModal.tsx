import { useEffect, useMemo, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, FlaskConical, MapPin, Presentation, User, Users, X } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import DepartmentLogo from '../../../components/ui/DepartmentLogo';
import { buttonClass } from '../../../components/ui/buttonStyles';
import { formatTime12h } from '../../../lib/timeGrid';
import { scheduleLocationLabel } from '../../../lib/scheduleLocation';
import {
  courseCodeOf,
  courseNameOf,
  filterVpaaApprovedSchedules,
  instructorNameOf,
  sessionTypeOf,
  siblingMeetingsOf,
  toMinutes,
  type CalendarSchedule,
  type OverlapEntry,
} from './ganttLayout';
import { departmentTone } from './departmentPalette';

interface ScheduleDetailModalProps {
  schedule: CalendarSchedule | null;
  allSchedules: readonly CalendarSchedule[];
  overlaps: ReadonlyMap<number, OverlapEntry[]>;
  onClose: () => void;
  onSelect: (schedule: CalendarSchedule) => void;
  appearance?: 'default' | 'workflow';
  includeUnapproved?: boolean;
}

const OVERLAP_REASON: Record<OverlapEntry['kinds'][number], string> = {
  room: 'Same room',
  instructor: 'Same instructor',
  section: 'Same section',
};

const BADGE = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase leading-4 tracking-wide';

const durationLabel = (schedule: CalendarSchedule): string => {
  const start = toMinutes(schedule.start_time);
  const end = toMinutes(schedule.end_time);
  if (start === null || end === null || end <= start) return '';
  const minutes = end - start;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} hr` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
};

/** One labelled fact. The icon sits inside the <dt> so the <dl> markup stays valid. */
function Fact({ icon, label, value, detail, muted = false }: { icon: ReactNode; label: string; value: ReactNode; detail?: ReactNode; muted?: boolean }) {
  return (
    <div className="relative min-w-0 rounded-xl border border-slate-200/80 bg-white py-2.5 pl-12 pr-3 shadow-[0_1px_0_rgb(15_23_42/0.03)]">
      <dt className="text-[10px] font-semibold uppercase leading-4 tracking-wider text-slate-500">
        <span aria-hidden="true" className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-[#5A1220]/[0.06] text-[#5A1220]">{icon}</span>
        {label}
      </dt>
      <dd className={`mt-0.5 break-words text-[13px] font-semibold leading-snug ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{value}</dd>
      {detail && <dd className="mt-0.5 break-words text-[11px] font-medium leading-4 text-slate-500">{detail}</dd>}
    </div>
  );
}

export default function ScheduleDetailModal({ schedule: selectedSchedule, allSchedules, overlaps, onClose, onSelect, appearance = 'default', includeUnapproved = false }: ScheduleDetailModalProps) {
  const visibleSchedules = useMemo(() => includeUnapproved ? allSchedules : filterVpaaApprovedSchedules(allSchedules), [allSchedules, includeUnapproved]);
  const schedule = selectedSchedule ? visibleSchedules.find((item) => item.id === selectedSchedule.id) : null;
  const siblings = useMemo(() => (schedule ? siblingMeetingsOf(schedule, visibleSchedules, includeUnapproved) : []), [schedule, visibleSchedules, includeUnapproved]);
  const byId = useMemo(() => new Map(visibleSchedules.map((item) => [item.id, item])), [visibleSchedules]);
  useEffect(() => {
    if (selectedSchedule && !schedule) onClose();
  }, [selectedSchedule, schedule, onClose]);

  if (!schedule) return null;

  const workflow = appearance === 'workflow';
  const isLab = sessionTypeOf(schedule) === 'laboratory';
  const tone = departmentTone(schedule.department?.department_code, schedule.department?.department_name);
  const units = schedule.course?.units ?? schedule.subject?.units;
  const overlapEntries = (overlaps.get(schedule.id) ?? []).filter((entry) => byId.has(entry.otherId));
  const name = courseNameOf(schedule);
  const duration = durationLabel(schedule);
  const sectionName = schedule.section?.section_name;
  const instructor = instructorNameOf(schedule);
  const departmentName = schedule.department?.department_name;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Class Schedule Details"
      size="md"
      appearance={appearance}
      eyebrow="Schedule details"
      icon={workflow ? <CalendarClock size={21} /> : undefined}
      leading={workflow ? undefined : (
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#F5A623]/35 bg-white/[0.06] text-[#F5A623]">
          <CalendarClock size={16} />
        </span>
      )}
      headerClassName="!items-center border-b border-[#F5A623]/25 bg-[#5A1220] !py-2.5 sm:!py-3"
      titleClassName="text-[15px] font-semibold leading-6 tracking-tight text-white"
      showCloseButton={workflow}
      headerActions={workflow ? undefined : (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
        >
          <X size={16} />
        </button>
      )}
      footerClassName={workflow ? '' : '!border-slate-200/80 !bg-white !py-2.5 sm:!py-3'}
      footer={
        <button type="button" onClick={onClose} data-variant="primary" className={workflow ? 'scheduler-dialog-button' : buttonClass({ variant: 'primary', size: 'sm', className: 'min-w-[5.5rem]' })}>
          Close
        </button>
      }
    >
      <div className="space-y-3 p-3.5 sm:p-4">
        <section className="rounded-xl border border-slate-200/80 bg-white p-3.5">
          <div className="flex items-start gap-3">
            <DepartmentLogo name={departmentName || schedule.department?.department_code || 'Department'} logo={schedule.department?.logo} className="h-10 w-10 shrink-0" iconSize={18} />
            <div className="min-w-0 flex-1">
              {departmentName && <p className="truncate text-[10px] font-semibold uppercase leading-4 tracking-wider text-slate-500" title={departmentName}>{departmentName}</p>}
              <h3 className="break-words text-lg font-bold leading-tight tracking-tight text-slate-950">{courseCodeOf(schedule)}</h3>
              {name && <p className="mt-0.5 break-words text-[13px] font-medium leading-snug text-slate-600">{name}</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
            <span className={`${BADGE} ${tone.badge}`}>{schedule.department?.department_code ?? 'Dept'}</span>
            <span className={`${BADGE} ${isLab ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200'}`}>
              {isLab ? <FlaskConical className="h-3 w-3" aria-hidden="true" /> : <Presentation className="h-3 w-3" aria-hidden="true" />}
              {isLab ? 'Laboratory' : 'Lecture'}
            </span>
            {units ? <span className={`${BADGE} bg-[#F5A623]/[0.12] text-[#8a5a12] ring-1 ring-inset ring-[#F5A623]/35`}>{units} units</span> : null}
          </div>
        </section>

        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Fact
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            label="Day & time"
            value={`${schedule.day}, ${formatTime12h(schedule.start_time)} – ${formatTime12h(schedule.end_time)}`}
            detail={duration || undefined}
          />
          <Fact icon={<Users className="h-3.5 w-3.5" />} label="Section" value={sectionName ?? 'No section'} muted={!sectionName} />
          <Fact icon={<User className="h-3.5 w-3.5" />} label="Instructor" value={instructor || 'Unassigned'} muted={!instructor} />
          <Fact
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Room"
            value={scheduleLocationLabel(schedule.mode, schedule.room?.room_code)}
            detail={schedule.room?.building || undefined}
          />
        </dl>

        {overlapEntries.length > 0 && (
          <section className="rounded-xl border border-red-200 bg-red-50/70 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-red-800">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Overlapping classes ({overlapEntries.length})
            </h4>
            <p className="mt-0.5 text-[11px] leading-4 text-red-700/80">Shares this time slot with the classes below. Some may be intentional, such as an approved instructor override.</p>
            <ul className="mt-2 space-y-1">
              {overlapEntries.map((entry) => {
                const other = byId.get(entry.otherId);
                if (!other) return null;
                return (
                  <li key={entry.otherId}>
                    <button type="button" onClick={() => onSelect(other)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-left text-xs transition-colors hover:border-red-200 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                      <span className="min-w-0 truncate font-semibold text-slate-800">
                        {courseCodeOf(other)} · {other.section?.section_name ?? 'No section'}
                        <span className="ml-1.5 font-medium text-slate-500">{formatTime12h(other.start_time)} – {formatTime12h(other.end_time)}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-red-700">{entry.kinds.map((kind) => OVERLAP_REASON[kind]).join(', ')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {siblings.length > 1 && (
          <section className="rounded-xl border border-slate-200/80 bg-white p-3">
            <h4 className="text-[10px] font-semibold uppercase leading-4 tracking-wider text-slate-500">Weekly meetings of this {isLab ? 'laboratory' : 'lecture'}</h4>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {siblings.map((meeting) => {
                const isCurrent = meeting.id === schedule.id;
                return (
                  <li key={meeting.id}>
                    <button
                      type="button"
                      disabled={isCurrent}
                      aria-pressed={isCurrent}
                      onClick={() => onSelect(meeting)}
                      className={`selection-indicator rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${isCurrent ? '' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'}`}
                    >
                      {meeting.day.slice(0, 3)} {formatTime12h(meeting.start_time)} · {scheduleLocationLabel(meeting.mode, meeting.room?.room_code)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
