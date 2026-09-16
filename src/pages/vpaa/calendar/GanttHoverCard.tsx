import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import DepartmentLogo from '../../../components/ui/DepartmentLogo';
import { AlertTriangle, Clock, FlaskConical, MapPin, Presentation, User, Users } from 'lucide-react';
import { formatTime12h } from '../../../lib/timeGrid';
import { scheduleLocationLabel } from '../../../lib/scheduleLocation';
import { courseCodeOf, courseNameOf, instructorNameOf, sessionTypeOf, type CalendarSchedule } from './ganttLayout';
import { departmentTone } from './departmentPalette';

const CARD_WIDTH = 272;
const CARD_HEIGHT_ESTIMATE = 200;

interface GanttHoverCardProps {
  schedule: CalendarSchedule;
  /** The block's viewport rectangle, captured when the pointer or focus arrived. */
  anchor: DOMRect;
  overlap: string;
}

/**
 * Details for the timeline block under the pointer or keyboard focus.
 *
 * Portalled to the body with fixed positioning so the chart's scroll container
 * cannot clip it; it flips above the block when there is no room below.
 */
export default function GanttHoverCard({ schedule, anchor, overlap }: GanttHoverCardProps) {
  const isLab = sessionTypeOf(schedule) === 'laboratory';
  const tone = departmentTone(schedule.department?.department_code, schedule.department?.department_name);
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const fitsBelow = anchor.bottom + 8 + CARD_HEIGHT_ESTIMATE <= viewportHeight;
  const left = Math.max(8, Math.min(anchor.left, viewportWidth - CARD_WIDTH - 8));
  const position: CSSProperties = fitsBelow
    ? { left, top: anchor.bottom + 8 }
    : { left, bottom: viewportHeight - anchor.top + 8 };
  const name = courseNameOf(schedule);

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[1100] rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-white shadow-2xl"
      style={{ ...position, width: CARD_WIDTH }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 pb-2">
        <div className="min-w-0">
          <p className="font-black text-[#E8D5C4]">{courseCodeOf(schedule)}</p>
          {name && <p className="mt-0.5 text-[11px] leading-snug text-slate-300">{name}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <DepartmentLogo name={schedule.department?.department_name || schedule.department?.department_code || 'Department'} logo={schedule.department?.logo} className="h-7 w-7" iconSize={14} />
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${tone.badge}`}>
            {schedule.department?.department_code ?? 'Dept'}
          </span>
        </span>
      </div>
      <ul className="mt-2 space-y-1.5 text-[11px]">
        <li className="flex items-center gap-2">
          {isLab ? <FlaskConical className="h-3.5 w-3.5 shrink-0 text-[#C9952A]" /> : <Presentation className="h-3.5 w-3.5 shrink-0 text-[#C9952A]" />}
          <span className="font-semibold">{isLab ? 'Laboratory' : 'Lecture'}</span>
        </li>
        <li className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
          {schedule.day}, {formatTime12h(schedule.start_time)} – {formatTime12h(schedule.end_time)}
        </li>
        <li className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
          {schedule.section?.section_name ?? 'No section'}
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
          {scheduleLocationLabel(schedule.mode, schedule.room?.room_code)}
          {schedule.room?.building ? ` · ${schedule.room.building}` : ''}
        </li>
        <li className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
          {instructorNameOf(schedule) || 'Unassigned'}
        </li>
      </ul>
      {overlap && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/15 px-2 py-1.5 text-[11px] font-semibold text-red-200">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {overlap}
        </p>
      )}
      <p className="mt-2 text-[10px] text-slate-400">Click for full details</p>
    </div>,
    document.body,
  );
}
