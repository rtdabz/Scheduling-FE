import React, { memo } from "react";
import { CheckCircle2, Clock, MapPin, User, UserPlus, X } from "lucide-react";
import {
  getGridCardStyles,
  getGridModeBadgeClass,
  SLOT_HEIGHT_PX
} from "../constants";
import type { ScheduleItem, Subject, Room } from "../types";

interface ScheduleCardProps {
  rooms: Room[];
  schedule: ScheduleItem;
  subject: Subject;
  isEditable: boolean;
  isPhase2Active: boolean;
  currentStatus: ScheduleItem["status"];
  draggedScheduleId: string | null;
  isMoving: boolean;
  deleteConfirmScheduleId: string | null;
  setDeleteConfirmScheduleId: (id: string | null) => void;
  onDragStart: (e: React.DragEvent, s: ScheduleItem) => void;
  onDragEnd: () => void;
  onDelete: (id: string) => void;
  onCardClick: (id: string) => void;
}

const ScheduleCard = memo(function ScheduleCard({
  rooms,
  schedule,
  subject,
  isEditable,
  isPhase2Active,
  currentStatus,
  draggedScheduleId,
  isMoving,
  deleteConfirmScheduleId,
  setDeleteConfirmScheduleId,
  onDragStart,
  onDragEnd,
  onDelete,
  onCardClick
}: ScheduleCardProps) {
  const room = rooms.find((r) => r.id === schedule.roomId);
  const gridStyles = getGridCardStyles(subject.category);
  const modeBadgeClass = getGridModeBadgeClass(schedule.mode);
  const isDraggingThis = draggedScheduleId === schedule.id;
  const hasFaculty = !!schedule.facultyId;
  const cardHeight = schedule.durationSlots * SLOT_HEIGHT_PX;
  const showBottomRow = cardHeight > 80;
  const canAssignFaculty = isPhase2Active && currentStatus !== "finalized";
  const isAwaitingFaculty = canAssignFaculty && !hasFaculty;
  const isFacultyAssigned = isPhase2Active && hasFaculty;

  return (
    <div
      draggable={isEditable && !isPhase2Active}
      onDragStart={(e) => !isPhase2Active && onDragStart(e, schedule)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick(schedule.id)}
      className={`w-full rounded-xl border-2 border-l-4 box-border relative shadow-sm hover:shadow-md hover:scale-[1.02] hover:z-10 transition-all duration-150 motion-reduce:transition-none motion-reduce:hover:scale-100 group overflow-hidden p-2 ${gridStyles.container} ${
        isDraggingThis ? "opacity-60 scale-95 rotate-1 cursor-grabbing" : "opacity-100"
      } ${
        isAwaitingFaculty
          ? "border-orange-400 ring-2 ring-orange-300 cursor-pointer"
          : isFacultyAssigned
          ? "cursor-pointer"
          : isEditable
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-not-allowed"
      } ${isMoving ? "ring-4 ring-blue-500 ring-offset-1 z-20" : ""} ${currentStatus === "finalized" ? "cursor-default" : ""}`}
      style={{
        gridColumn: schedule.dayIndex + 2,
        gridRow: `${schedule.startSlot + 2} / span ${schedule.durationSlots}`,
        height: `${cardHeight}px`,
      }}
    >
      {isEditable && !isPhase2Active && (
        <div className="absolute top-1 right-1 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirmScheduleId(schedule.id);
            }}
            aria-label={`Remove ${subject.code}`}
            title="Remove Schedule"
            className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-sm ring-1 ring-white transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {deleteConfirmScheduleId === schedule.id && (
            <div
              className="absolute right-0 top-5 w-20 rounded-lg bg-white border border-slate-200 shadow-md p-1 text-[10px] text-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-center mb-1">Delete?</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onDelete(schedule.id)}
                  className="flex-1 rounded bg-red-500 hover:bg-red-600 text-white py-0.5 font-bold"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmScheduleId(null)}
                  className="flex-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 py-0.5 font-bold"
                >
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isFacultyAssigned && (
        <div className="absolute top-1 right-1 bg-green-100 rounded-full p-0.5 z-20">
          <CheckCircle2 className="w-3 h-3 text-green-600" />
        </div>
      )}

      <div className="flex flex-col h-full justify-between min-w-0">
        <div className="min-w-0">
          <div className="flex flex-row justify-between items-start gap-2">
            <span className={`text-xs font-bold uppercase tracking-wide truncate ${gridStyles.text}`}>
              {subject.code}
            </span>
            <div className="flex gap-1 shrink-0 pr-7">
              <span className={`text-[10px] bg-white/70 rounded-full px-1.5 py-0.5 font-bold ${gridStyles.badgeText}`}>
                {subject.units}u
              </span>
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${modeBadgeClass}`}>
                {schedule.mode === "on-site" ? "On-Site" : schedule.mode === "online" ? "Online" : "Field"}
              </span>
            </div>
          </div>
          <div className="text-[11px] font-medium text-gray-700 mt-0.5 truncate" title={subject.name}>
            {subject.name}
          </div>
        </div>

        {showBottomRow && (
          <div className="mt-auto border-t border-white/50 pt-1 space-y-0.5 overflow-hidden">
            {isPhase2Active && (
              <div className="flex items-center gap-1 truncate">
                <User className="w-3 h-3 shrink-0 text-gray-400" />
                {hasFaculty ? (
                  <span className="text-[10px] text-gray-500 truncate">{schedule.facultyName}</span>
                ) : (
                  <span className="text-[10px] text-gray-400 italic truncate">No Faculty</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0 text-gray-400" />
              <span className="text-[10px] text-gray-500 truncate">{room?.name ?? schedule.roomName}</span>
            </div>
            <div className="flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 shrink-0 text-gray-400" />
              <span className="text-[10px] text-gray-500 truncate">{schedule.startTime} – {schedule.endTime}</span>
            </div>
          </div>
        )}
      </div>
      {isAwaitingFaculty && (
        <div className="absolute left-0 right-0 bottom-0 flex items-center justify-center gap-1 bg-orange-500 text-white text-[10px] font-bold rounded-b-xl py-1">
          <UserPlus className="w-3 h-3" />
          <span>Tap to Assign Faculty</span>
        </div>
      )}
    </div>
  );
});

export default ScheduleCard;
