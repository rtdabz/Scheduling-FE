import React from "react";
import { Clock } from "lucide-react";

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
  slotCount: number;
  startSlot?: number;
  headerHeight?: number;
  timeColumnWidth?: number;
  slotHeight?: number;
  rowTemplate?: string;
  minWidth?: number;
  className?: string;
  disabledDayIndexes?: number[];
  getTimeLabel: (slot: number) => string;
  getDayCount?: (dayIndex: number) => number;
  renderCell?: (dayIndex: number, slot: number) => React.ReactNode;
  children?: React.ReactNode;
}

export default function WeeklyTimetableGrid({
  days = WEEK_DAYS,
  slotCount,
  startSlot = 0,
  headerHeight = 48,
  timeColumnWidth = 80,
  slotHeight = 24,
  rowTemplate,
  minWidth = 840,
  className = "",
  disabledDayIndexes = [],
  getTimeLabel,
  getDayCount,
  renderCell,
  children,
}: WeeklyTimetableGridProps) {
  const disabledDays = new Set(disabledDayIndexes);

  return (
    <div
      className={`relative grid select-none overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
      style={{
        minWidth,
        gridTemplateColumns: `${timeColumnWidth}px repeat(${days.length}, minmax(0, 1fr))`,
        gridTemplateRows: `${headerHeight}px ${rowTemplate ?? `repeat(${slotCount}, ${slotHeight}px)`}`,
      }}
    >
      <div
        className="sticky left-0 top-0 z-30 flex items-center justify-center border-b border-r border-[#c9952a]/30 bg-gradient-to-b from-[#4e0a10] to-[#3d080c] p-2 text-center text-[10px] font-black uppercase tracking-wider text-[#c9952a]"
        style={{ gridColumn: 1, gridRow: 1 }}
      >
        <Clock className="mr-1 h-3.5 w-3.5" />
        Time
      </div>

      {days.map((day, dayIndex) => {
        const isDisabled = disabledDays.has(dayIndex);
        const count = getDayCount?.(dayIndex);

        return (
          <div
            key={day}
            className={`sticky top-0 z-20 flex flex-col items-center justify-center border-b border-r p-1.5 text-center text-xs font-bold uppercase tracking-wider ${
              isDisabled
                ? "border-slate-700/30 bg-slate-800/90 text-slate-500"
                : "border-[#c9952a]/20 border-b-[#c9952a]/30 bg-gradient-to-b from-[#4e0a10] to-[#3d080c] text-white"
            }`}
            style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
          >
            <span className="font-extrabold tracking-widest">{day}</span>
            {isDisabled ? (
              <span className="mt-0.5 rounded-full border border-slate-800/40 bg-slate-900/60 px-1.5 py-0.5 text-[8px] font-black text-slate-400">
                N/A
              </span>
            ) : count !== undefined ? (
              <span className="mt-0.5 rounded-full border border-[#c9952a]/30 bg-[#c9952a]/15 px-2 py-0.5 text-[8.5px] font-extrabold text-[#c9952a] shadow-sm">
                {count} {count === 1 ? "Class" : "Classes"}
              </span>
            ) : null}
          </div>
        );
      })}

      {Array.from({ length: slotCount }).map((_, slotOffset) => {
        const slot = startSlot + slotOffset;
        return (
          <React.Fragment key={`slot-${slot}`}>
            {slotOffset % 2 === 0 && (
              <div
                className="sticky left-0 z-10 flex items-center justify-center border-b border-r border-slate-200 bg-slate-50/90 px-1 text-[9px] font-bold text-slate-500"
                style={{
                  gridColumn: 1,
                  gridRow: `${slotOffset + 2} / span ${Math.min(2, slotCount - slotOffset)}`,
                }}
              >
                <span className="whitespace-nowrap font-extrabold text-slate-600">
                  {getTimeLabel(slot)}
                </span>
              </div>
            )}

            {days.map((_, dayIndex) => (
              <React.Fragment key={`cell-${dayIndex}-${slot}`}>
                {renderCell ? renderCell(dayIndex, slot) : (
                  <div
                    className={`border-b border-r border-slate-100 ${
                      disabledDays.has(dayIndex) ? "bg-slate-100/80" : "bg-white"
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
