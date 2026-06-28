import type React from "react";
import { AlertTriangle, Plus } from "lucide-react";

interface GridCellProps {
  dayIndex: number;
  timeIndex: number;
  isHovered: boolean;
  hasConflict: boolean;
  isEditable: boolean;
  isPhase2Active: boolean;
  onDragOver: (e: React.DragEvent, d: number, t: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, d: number, t: number) => void;
}

export default function GridCell({
  dayIndex,
  timeIndex,
  isHovered,
  hasConflict,
  isEditable,
  isPhase2Active,
  onDragOver,
  onDragLeave,
  onDrop
}: GridCellProps) {
  return (
    <div
      onDragOver={(e) => isEditable && !isPhase2Active && onDragOver(e, dayIndex, timeIndex)}
      onDragLeave={onDragLeave}
      onDrop={(e) => isEditable && !isPhase2Active && onDrop(e, dayIndex, timeIndex)}
      className={`border-r border-b border-slate-100 transition-all duration-150 relative flex items-center justify-center ${
        isHovered
          ? hasConflict
            ? "bg-rose-100 ring-2 ring-rose-500/20 ring-inset"
            : "bg-blue-50 ring-2 ring-blue-500/20 ring-inset"
          : "bg-white"
      }`}
      style={{ gridColumn: dayIndex + 2, gridRow: timeIndex + 2 }}
    >
      {isHovered && (
        <span className={`text-[9px] font-extrabold select-none pointer-events-none flex items-center gap-0.5 ${hasConflict ? "text-rose-600" : "text-blue-600"}`}>
          {hasConflict
            ? <><AlertTriangle className="w-2.5 h-2.5" /> Conflict</>
            : <><Plus className="w-2.5 h-2.5" /> Place</>
          }
        </span>
      )}
    </div>
  );
}
