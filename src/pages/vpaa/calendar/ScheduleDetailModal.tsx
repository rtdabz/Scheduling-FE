import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, FlaskConical, MapPin, Presentation, User, Users } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import DepartmentLogo from '../../../components/ui/DepartmentLogo';
import { formatTime12h } from '../../../lib/timeGrid';
import { scheduleLocationLabel } from '../../../lib/scheduleLocation';
import {
  courseCodeOf,
  courseNameOf,
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
  /** Every loaded meeting, unfiltered, so sibling meetings hidden by a filter still list. */
  allSchedules: readonly CalendarSchedule[];
  overlaps: ReadonlyMap<number, OverlapEntry[]>;
  onClose: () => void;
  onSelect: (schedule: CalendarSchedule) => void;
}

const OVERLAP_REASON: Record<OverlapEntry['kinds'][number], string> = {
  room: 'Same room',
  instructor: 'Same instructor',
  section: 'Same section',
};

const durationLabel = (schedule: CalendarSchedule): string => {
  const start = toMinutes(schedule.start_time);
  const end = toMinutes(schedule.end_time);
  if (start === null || end === null || end <= start) return '';
  const minutes = end - start;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} hr` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
};

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{icon}{label}</dt>
      <dd className="mt-1 text-sm font-bold text-slate-900">{children}</dd>
    </div>
  );
}

export default function ScheduleDetailModal({ schedule, allSchedules, overlaps, onClose, onSelect }: ScheduleDetailModalProps) {
  const siblings = useMemo(() => (schedule ? siblingMeetingsOf(schedule, allSchedules) : []), [schedule, allSchedules]);
  const byId = useMemo(() => new Map(allSchedules.map((item) => [item.id, item])), [allSchedules]);

  if (!schedule) return null;

  const isLab = sessionTypeOf(schedule) === 'laboratory';
  const tone = departmentTone(schedule.department?.department_code, schedule.department?.department_name);
  const units = schedule.course?.units ?? schedule.subject?.units;
  const overlapEntries = overlaps.get(schedule.id) ?? [];
  const name = courseNameOf(schedule);

  return (
    <Modal isOpen onClose={onClose} title="Class Schedule Details" size="md" footer={
      <button type="button" onClick={onClose} className="rounded-xl bg-[#5A1220] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#410b15]">
        Close
      </button>
    }>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <DepartmentLogo name={schedule.department?.department_name || schedule.department?.department_code || 'Department'} logo={schedule.department?.logo} className="h-8 w-8" iconSize={16} />
            <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${tone.badge}`}>{schedule.department?.department_code ?? 'Dept'}</span>
            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black uppercase ${isLab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300'}`}>
              {isLab ? <FlaskConical className="h-3 w-3" /> : <Presentation className="h-3 w-3" />}
              {isLab ? 'Laboratory' : 'Lecture'}
            </span>
            {units ? <span className="rounded bg-[#C9952A]/15 px-2 py-0.5 text-[10px] font-black text-[#7a5a14]">{units} units</span> : null}
          </div>
          <h3 className="mt-2 text-lg font-extrabold leading-tight text-slate-950">{courseCodeOf(schedule)}</h3>
          {name && <p className="text-sm font-medium text-slate-600">{name}</p>}
          {schedule.department?.department_name && <p className="mt-1 text-[11px] font-semibold text-slate-400">{schedule.department.department_name}</p>}
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact icon={<CalendarClock className="h-3 w-3" />} label="Day & time">
            {schedule.day}, {formatTime12h(schedule.start_time)} – {formatTime12h(schedule.end_time)}
            {durationLabel(schedule) && <span className="block text-[11px] font-semibold text-slate-500">{durationLabel(schedule)}</span>}
          </Fact>
          <Fact icon={<Users className="h-3 w-3" />} label="Section">{schedule.section?.section_name ?? 'No section'}</Fact>
          <Fact icon={<User className="h-3 w-3" />} label="Instructor">{instructorNameOf(schedule) || 'Unassigned'}</Fact>
          <Fact icon={<MapPin className="h-3 w-3" />} label="Room">
            {scheduleLocationLabel(schedule.mode, schedule.room?.room_code)}
            {schedule.room?.building && <span className="block text-[11px] font-semibold text-slate-500">{schedule.room.building}</span>}
          </Fact>
        </dl>

        {overlapEntries.length > 0 && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-black text-red-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              Overlapping classes ({overlapEntries.length})
            </h4>
            <p className="mt-0.5 text-[11px] text-red-700/80">Shares this time slot with the classes below. Some may be intentional, such as an approved instructor override.</p>
            <ul className="mt-2 space-y-1.5">
              {overlapEntries.map((entry) => {
                const other = byId.get(entry.otherId);
                if (!other) return null;
                return (
                  <li key={entry.otherId}>
                    <button type="button" onClick={() => onSelect(other)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left text-xs ring-1 ring-red-100 transition-colors hover:bg-red-100/40">
                      <span className="min-w-0 truncate font-bold text-slate-800">
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
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Weekly meetings of this {isLab ? 'laboratory' : 'lecture'}</h4>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {siblings.map((meeting) => {
                const isCurrent = meeting.id === schedule.id;
                return (
                  <li key={meeting.id}>
                    <button
                      type="button"
                      disabled={isCurrent}
                      onClick={() => onSelect(meeting)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${isCurrent ? 'bg-[#5A1220] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
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
