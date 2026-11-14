import { memo } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { TIMETABLE_CELL_STATE } from "../../../../components/scheduling/timetableStyles";

interface GridCellProps {
  dayIndex: number;
  timeIndex: number;
  isHovered: boolean;
  hasConflict: boolean;
  isEditable: boolean;
  isPhase2Active: boolean;
  isPlacementMode: boolean;
  /** The slot closes a 1 hour 30 minute time band, so its bottom line is drawn stronger. */
  endsBand?: boolean;
  onDragOver: (e: React.DragEvent, d: number, t: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, d: number, t: number) => void;
  onCellClick: (d: number, t: number) => void;
}

const GridCell = memo(function GridCell({
  dayIndex,
  timeIndex,
  isHovered,
  hasConflict,
  isEditable,
  isPhase2Active,
  isPlacementMode,
  endsBand = true,
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
      data-slot-state={isHovered ? (hasConflict ? "invalid" : "target") : clickable ? "available" : undefined}
      // Quiet day dividers; a faint line every 30 minutes and a firmer one closing each 1.5-hour band.
      className={`group relative flex items-center justify-center border-b border-r border-r-slate-100 transition-colors duration-100 motion-reduce:transition-none ${
        endsBand ? "border-b-slate-200" : "border-b-slate-100/80"
      } ${
        isHovered
          ? hasConflict ? TIMETABLE_CELL_STATE.conflict : TIMETABLE_CELL_STATE.target
          : clickable ? TIMETABLE_CELL_STATE.available : TIMETABLE_CELL_STATE.idle
      }`}
      style={{ gridColumn: dayIndex + 2, gridRow: timeIndex + 2 }}
    >
      {isHovered && (
        <span className={`text-[11px] font-bold select-none pointer-events-none flex items-center gap-0.5 ${hasConflict ? "text-rose-700" : "text-[#8a5a12]"}`}>
          {hasConflict
            ? <><AlertTriangle className="w-3 h-3" /> Conflict</>
            : <><Plus className="w-3 h-3" /> Place</>
          }
        </span>
      )}
      {!isHovered && clickable && (
        <span className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 text-[11px] font-bold text-[#8a5a12] select-none pointer-events-none flex items-center gap-0.5 transition-opacity duration-150">
          <Plus className="w-3 h-3" /> Place here
        </span>
      )}
    </div>
  );
});

export default GridCell;
