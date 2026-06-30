import type React from "react";
import { AlertTriangle, Plus } from "lucide-react";

interface GridCellProps {
  dayIndex: number;
  timeIndex: number;
  isHovered: boolean;
  hasConflict: boolean;
  isEditable: boolean;
  isPhase2Active: boolean;
  isPlacementMode: boolean;
  onDragOver: (e: React.DragEvent, d: number, t: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, d: number, t: number) => void;
  onCellClick: (d: number, t: number) => void;
}

export default function GridCell({
  dayIndex,
  timeIndex,
  isHovered,
  hasConflict,
  isEditable,
  isPhase2Active,
  isPlacementMode,
  onDragOver,
  onDragLeave,
  onDrop,
  onCellClick
}: GridCellProps) {
  const clickable = isEditable && !isPhase2Active && isPlacementMode;

  return (
    <div
      onDragOver={(e) => isEditable && !isPhase2Active && onDragOver(e, dayIndex, timeIndex)}
      onDragLeave={onDragLeave}
      onDrop={(e) => isEditable && !isPhase2Active && onDrop(e, dayIndex, timeIndex)}
      onClick={() => clickable && onCellClick(dayIndex, timeIndex)}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Place here on day ${dayIndex + 1}, slot ${timeIndex + 1}` : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onCellClick(dayIndex, timeIndex);
        }
      }}
      className={`group border-r border-b border-slate-100 transition-all duration-150 relative flex items-center justify-center ${
        isHovered
          ? hasConflict
            ? "bg-rose-100 ring-2 ring-rose-500/20 ring-inset"
            : "bg-blue-50 ring-2 ring-blue-500/20 ring-inset"
          : clickable
          ? "bg-blue-50/30 cursor-pointer hover:bg-blue-100 hover:ring-2 hover:ring-blue-500/40 hover:ring-inset focus:outline-none focus:bg-blue-100 focus:ring-2 focus:ring-blue-500/50 focus:ring-inset"
          : "bg-white"
      }`}
      style={{ gridColumn: dayIndex + 2, gridRow: timeIndex + 2 }}
    >
      {isHovered && (
        <span className={`text-[11px] font-extrabold select-none pointer-events-none flex items-center gap-0.5 ${hasConflict ? "text-rose-600" : "text-blue-600"}`}>
          {hasConflict
            ? <><AlertTriangle className="w-3 h-3" /> Conflict</>
            : <><Plus className="w-3 h-3" /> Place</>
          }
        </span>
      )}
      {!isHovered && clickable && (
        <span className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 text-[11px] font-extrabold text-blue-700 select-none pointer-events-none flex items-center gap-0.5 transition-opacity duration-150">
          <Plus className="w-3 h-3" /> Place here
        </span>
      )}
    </div>
  );
}
