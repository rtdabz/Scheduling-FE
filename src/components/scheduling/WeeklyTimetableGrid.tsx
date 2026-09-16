import React from "react";
import { Clock } from "lucide-react";
import Skeleton from "../ui/Skeleton";
import { slotCount as gridSlotCount, slotMinutes, slotToTimeLabel } from "../../lib/timeGrid";

/**
 * Canonical grid geometry, shared by every timetable in the system.
 *
 * Each screen used to pick its own row height, header height and time-column
 * width (24/26/28/34px rows, 40/44/48/54px headers, 62/80/88/96px gutters), so
 * the same 7:00 AM-8:30 PM window rendered at a different scale in the builder,
 * the approval modals, the room view and the dashboards. Cards are positioned
 * by grid row, so a screen that overrode the row height also had to repeat that
 * number in its card `height` calculation - and the two drifted apart.
 *
 * Override these per call site only when a layout genuinely cannot fit them.
 */
export const GRID_SLOT_HEIGHT_PX = 24;
export const GRID_HEADER_HEIGHT_PX = 48;
export const GRID_TIME_COLUMN_WIDTH_PX = 80;

/**
 * The time axis is labelled in 1.5-hour bands (7:00, 8:30, 10:00 ...), the
 * standard class period. Rows underneath stay 30 minutes so 1-hour and 2-hour
 * classes still position and conflict-check exactly.
 */
const AXIS_BAND_MINUTES = 90;

// Shared by calendar views that must use the same weekday ordering as the grid.
// eslint-disable-next-line react-refresh/only-export-components
export const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

interface WeeklyTimetableGridProps {
  days?: readonly string[];
  /** Defaults to the configured 7:00 AM-8:30 PM window. */
  slotCount?: number;
  startSlot?: number;
  headerHeight?: number;
  timeColumnWidth?: number;
  slotHeight?: number;
  rowTemplate?: string;
  minWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  disabledDayIndexes?: number[];
  getTimeLabel?: (slot: number) => string;
  getDayCount?: (dayIndex: number) => number;
  renderCell?: (dayIndex: number, slot: number) => React.ReactNode;
  children?: React.ReactNode;
  isLoading?: boolean;
}

export default function WeeklyTimetableGrid({
  days = WEEK_DAYS,
  slotCount = gridSlotCount(),
  startSlot = 0,
  headerHeight = GRID_HEADER_HEIGHT_PX,
  timeColumnWidth = GRID_TIME_COLUMN_WIDTH_PX,
  slotHeight = GRID_SLOT_HEIGHT_PX,
  rowTemplate,
  minWidth = 840,
  className = "",
  style,
  disabledDayIndexes = [],
  getTimeLabel = slotToTimeLabel,
  getDayCount,
  renderCell,
  children,
  isLoading = false,
}: WeeklyTimetableGridProps) {
  const disabledDays = new Set(disabledDayIndexes);
  const AXIS_BAND_SLOTS = Math.max(1, Math.round(AXIS_BAND_MINUTES / slotMinutes()));

  return (
    <div
      className={`timetable-grid-root relative grid select-none overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
      style={{
        minHeight: `${headerHeight + slotCount * slotHeight}px`,
        minWidth,
        ...style,
        gridTemplateColumns: `${timeColumnWidth}px repeat(${days.length}, minmax(0, 1fr))`,
        gridTemplateRows: `${headerHeight}px ${rowTemplate ?? `repeat(${slotCount}, ${slotHeight}px)`}`,
      }}
    >
      <div
        className="timetable-grid-header sticky left-0 top-0 z-30 flex items-center justify-center border-b border-r border-[#c9952a]/30 bg-gradient-to-b from-[#4e0a10] to-[#3d080c] p-2 text-center text-[10px] font-black uppercase tracking-wider text-[#c9952a]"
        style={{ gridColumn: 1, gridRow: 1 }}
      >
        {isLoading ? <><Skeleton className="mr-1 h-3.5 w-3.5 rounded-full" /><Skeleton className="h-2.5 w-8" /></> : <><Clock className="mr-1 h-3.5 w-3.5" />Time</>}
      </div>

      {days.map((day, dayIndex) => {
        const isDisabled = disabledDays.has(dayIndex);
        const count = getDayCount?.(dayIndex);

        return (
          <div
            key={day}
            className={`timetable-grid-header sticky top-0 z-20 flex flex-col items-center justify-center border-b border-r p-1.5 text-center text-xs font-bold uppercase tracking-wider ${
              isDisabled
                ? "border-slate-700/30 bg-slate-800/90 text-slate-500"
                : "border-[#c9952a]/20 border-b-[#c9952a]/30 bg-gradient-to-b from-[#4e0a10] to-[#3d080c] text-white"
            }`}
            style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
          >
            {isLoading ? <><Skeleton className="h-3 w-14" /><Skeleton className="mt-1 h-3.5 w-12 rounded-full" /></> : <><span className="font-extrabold tracking-widest">{day}</span>
            {isDisabled ? (
              <span className="mt-0.5 rounded-full border border-slate-800/40 bg-slate-900/60 px-1.5 py-0.5 text-[8px] font-black text-slate-400">
                N/A
              </span>
            ) : count !== undefined ? (
              <span className="mt-0.5 rounded-full border border-[#c9952a]/30 bg-[#c9952a]/15 px-2 py-0.5 text-[8.5px] font-extrabold text-[#c9952a] shadow-sm">
                {count} {count === 1 ? "Class" : "Classes"}
              </span>
            ) : null}</>}
          </div>
        );
      })}

      {Array.from({ length: slotCount }).map((_, slotOffset) => {
        const slot = startSlot + slotOffset;
        // Bands are anchored to the grid opening, not to startSlot, so a
        // trimmed view still reads 7:00, 8:30, 10:00 rather than shifting.
        const slotsIntoBand = ((slot % AXIS_BAND_SLOTS) + AXIS_BAND_SLOTS) % AXIS_BAND_SLOTS;
        const bandSpan = Math.min(AXIS_BAND_SLOTS - slotsIntoBand, slotCount - slotOffset);
        const endsBand = (slotsIntoBand + 1) % AXIS_BAND_SLOTS === 0;
        return (
          <React.Fragment key={`slot-${slot}`}>
            {(slotsIntoBand === 0 || slotOffset === 0) && (
              <div
                className="sticky left-0 z-10 flex flex-col items-center justify-center border-b border-r border-slate-200 bg-slate-50/90 px-1 text-[9px] font-bold text-slate-500"
                style={{
                  gridColumn: 1,
                  gridRow: `${slotOffset + 2} / span ${bandSpan}`,
                }}
              >
                {isLoading ? <Skeleton className="h-2 w-10" /> : (
                  <>
                    <span className="whitespace-nowrap font-extrabold text-slate-600">{getTimeLabel(slot)}</span>
                    {bandSpan > 1 && (
                      <span className="whitespace-nowrap text-[8px] font-semibold text-slate-400">to {getTimeLabel(slot + bandSpan)}</span>
                    )}
                  </>
                )}
              </div>
            )}

            {days.map((_, dayIndex) => (
              <React.Fragment key={`cell-${dayIndex}-${slot}`}>
                {renderCell ? renderCell(dayIndex, slot) : (
                  <div
                    className={`border-b border-r ${endsBand ? "border-b-slate-200" : "border-b-slate-100"} border-r-slate-100 ${
                      isLoading ? "animate-pulse bg-slate-50/80" : disabledDays.has(dayIndex) ? "bg-slate-100/80" : "bg-white"
                    }`}
                    style={{ gridColumn: dayIndex + 2, gridRow: slotOffset + 2 }}
                  />
                )}
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      })}

      {children}
    </div>
  );
}
