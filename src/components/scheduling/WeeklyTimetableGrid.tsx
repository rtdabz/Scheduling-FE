import React from "react";
import { Clock } from "lucide-react";
import Skeleton from "../ui/Skeleton";
import { slotCount as gridSlotCount, slotMinutes, slotToTimeLabel } from "../../lib/timeGrid";
import { TIMETABLE_CELL_STATE, timetableCellBorderClass } from "./timetableStyles";

export const GRID_SLOT_HEIGHT_PX = 24;
/** The day row sits directly under the timetable's title bar and continues it. */
export const GRID_HEADER_HEIGHT_PX = 40;
export const GRID_TIME_COLUMN_WIDTH_PX = 72;

const AXIS_BAND_MINUTES = 90;

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
  /** Keep the day row pinned while the grid scrolls. Defaults to true. */
  stickyHeader?: boolean;
}

/**
 * The weekly timetable grid used everywhere, styled as the Schedule Management timetable.
 * It renders flush: place it inside a TimetablePanel, whose frame and maroon title bar the
 * day row continues. Headers are layered above the cards so they stay readable on scroll.
 */
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
  stickyHeader = true,
}: WeeklyTimetableGridProps) {
  const disabledDays = new Set(disabledDayIndexes);
  // Pin the day row to the top of the scroll area, or let it scroll away with the grid.
  const headerPosition = stickyHeader ? "sticky top-0" : "relative";
  const AXIS_BAND_SLOTS = Math.max(1, Math.round(AXIS_BAND_MINUTES / slotMinutes()));

  return (
    <div
      className={`timetable-grid-root relative grid select-none font-sans overflow-visible bg-white ${className}`}
      style={{
        minHeight: `${headerHeight + slotCount * slotHeight}px`,
        minWidth,
        ...style,
        gridTemplateColumns: `${timeColumnWidth}px repeat(${days.length}, minmax(0, 1fr))`,
        gridTemplateRows: `${headerHeight}px ${rowTemplate ?? `repeat(${slotCount}, ${slotHeight}px)`}`,
      }}
    >
      {/* One left-to-right band behind the whole day row, so it continues the panel's title bar
          without per-cell seams. The cells above it stay transparent. */}
      <div
        aria-hidden="true"
        className={`bg-wicars-header ${headerPosition} z-[29] border-b border-[#c9952a]/30`}
        style={{ gridColumn: "1 / -1", gridRow: 1 }}
      />
      <div
        className={`timetable-grid-header sticky left-0 ${stickyHeader ? "top-0" : ""} z-[35] flex items-center justify-center border-r border-[#c9952a]/15 bg-[#36060b] px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-white/65`}
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
            className={`timetable-grid-header ${headerPosition} z-30 flex flex-col items-center justify-center border-r px-1 text-center text-[11px] font-semibold uppercase tracking-wider ${
              isDisabled
                ? "border-slate-700/30 bg-slate-800/90 text-slate-500"
                : `border-[#c9952a]/15 text-white ${dayIndex === days.length - 1 ? "border-r-transparent" : ""}`
            }`}
            style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
          >
            {isLoading ? <><Skeleton className="h-3 w-14" /><Skeleton className="mt-1 h-3.5 w-12 rounded-full" /></> : <><span className="max-w-full truncate leading-tight">{day}</span>
            {isDisabled ? (
              <span className="mt-0.5 rounded-full border border-slate-800/40 bg-slate-900/60 px-1.5 py-0.5 text-[8px] font-black text-slate-400">
                N/A
              </span>
            ) : count !== undefined ? (
              <span className={`mt-0.5 text-[10px] font-medium normal-case leading-tight tracking-normal tabular-nums ${count === 0 ? "text-white/40" : "text-[#e8d5c4]"}`}>
                {count} {count === 1 ? "class" : "classes"}
              </span>
            ) : null}</>}
          </div>
        );
      })}

      {Array.from({ length: slotCount }).map((_, slotOffset) => {
        const slot = startSlot + slotOffset;
        const slotsIntoBand = ((slot % AXIS_BAND_SLOTS) + AXIS_BAND_SLOTS) % AXIS_BAND_SLOTS;
        const bandSpan = Math.min(AXIS_BAND_SLOTS - slotsIntoBand, slotCount - slotOffset);
        return (
          <React.Fragment key={`slot-${slot}`}>
            {(slotsIntoBand === 0 || slotOffset === 0) && (
              <div
                className="sticky left-0 z-[25] flex flex-col items-center justify-start border-b border-r border-slate-200 bg-[#faf7f3] px-1 pt-1.5 text-[10px] font-semibold tabular-nums text-slate-500"
                style={{
                  gridColumn: 1,
                  gridRow: `${slotOffset + 2} / span ${bandSpan}`,
                }}
              >
                {isLoading ? <Skeleton className="h-2 w-10" /> : (
                  <>
                    <span className="whitespace-nowrap text-slate-700">{getTimeLabel(slot)}</span>
                    {bandSpan > 1 && (
                      <span className="whitespace-nowrap text-[9px] font-medium text-slate-400">to {getTimeLabel(slot + bandSpan)}</span>
                    )}
                  </>
                )}
              </div>
            )}

            {days.map((_, dayIndex) => (
              <React.Fragment key={`cell-${dayIndex}-${slot}`}>
                {renderCell ? renderCell(dayIndex, slot) : (
                  <div
                    className={`${timetableCellBorderClass(slot)} ${
                      isLoading ? "animate-pulse bg-slate-50/80" : disabledDays.has(dayIndex) ? "bg-slate-100/80" : TIMETABLE_CELL_STATE.idle
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
