import React, { memo } from "react";
import { AlertTriangle, CheckCircle2, Clock, MapPin, User, UserPlus, X } from "lucide-react";
import {
  getGridCardStyles,
  getGridModeBadgeClass
} from "../constants";
import type { ScheduleItem, Subject, Room } from "../types";

interface ScheduleCardProps {
  rooms: Room[];
  schedule: ScheduleItem;
  subject: Subject;
  conflict?: { conflictType: "room" | "faculty" | "section"; message: string } | null;
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
  slotHeight: number;
}

const ScheduleCard = memo(function ScheduleCard({
  rooms,
  schedule,
  subject,
  conflict,
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
  onCardClick,
  slotHeight
}: ScheduleCardProps) {
  const room = rooms.find((r) => r.id === schedule.roomId);
  const gridStyles = getGridCardStyles(subject.category);
  const modeBadgeClass = getGridModeBadgeClass(schedule.mode);
  const modeLabel = schedule.mode === "on-site"
    ? "On-Site"
    : schedule.mode === "online"
    ? "Online"
    : "Field";
  const isDraggingThis = draggedScheduleId === schedule.id;
  const hasFaculty = !!schedule.facultyId;
  const cardHeight = schedule.durationSlots * slotHeight;
  const canAssignFaculty = isPhase2Active && currentStatus !== "finalized";
  const isAwaitingFaculty = canAssignFaculty && !hasFaculty;
  const isFacultyAssigned = isPhase2Active && hasFaculty;
  const rawRoomName = (room?.name ?? schedule.roomName ?? "").trim();
  const isVirtualOrField = schedule.mode === "online" || schedule.mode === "field";
  const isRedundantRoomName =
    isVirtualOrField ||
    !rawRoomName ||
    rawRoomName.toLowerCase() === modeLabel.toLowerCase() ||
    rawRoomName.toLowerCase() === "online" ||
    rawRoomName.toLowerCase() === "field" ||
    rawRoomName.toLowerCase() === "unassigned room";
  const roomDisplayName = isRedundantRoomName ? "" : rawRoomName;

  const isCompact = schedule.durationSlots <= 2; // 1 hour (38px)
  const isMedium = schedule.durationSlots === 3;  // 1.5 hours (57px)

  return (
    <div
      draggable={isEditable && !isPhase2Active}
      onDragStart={(e) => !isPhase2Active && onDragStart(e, schedule)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick(schedule.id)}
      className={`w-full rounded-xl border-2 border-l-4 box-border relative transition-all duration-150 motion-reduce:transition-none motion-reduce:hover:scale-100 group overflow-visible ${
        isCompact ? "p-1 px-1.5" : isMedium ? "p-1.5 px-2" : "p-2 px-2.5"
      } ${gridStyles.container} ${
        isDraggingThis ? "opacity-60 scale-95 rotate-1 cursor-grabbing" : "opacity-100"
      } ${
        conflict
          ? "border-red-400 border-l-red-600 ring-2 ring-red-300/60 bg-gradient-to-br from-red-50 to-red-100/30 text-red-950 shadow z-20 hover:border-red-400"
          : isAwaitingFaculty
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
      {/* Detailed Hover Tooltip Popover */}
      <div className={`opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none absolute left-1/2 -translate-x-1/2 w-64 p-3 bg-slate-900/95 text-white rounded-xl shadow-2xl backdrop-blur-md z-50 border border-slate-700 text-xs space-y-2 leading-snug ${
        schedule.startSlot > 14 ? "bottom-full mb-2" : "top-full mt-2"
      }`}>
        <div className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent ${
          schedule.startSlot > 14
            ? "top-full border-t-8 border-t-slate-900/95"
            : "bottom-full border-b-8 border-b-slate-900/95"
        }`} />
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-2">
          <div className="min-w-0">
            <span className="font-extrabold text-[#C9952A] text-xs uppercase tracking-wider block truncate">{subject.code}</span>
            <span className="font-semibold text-slate-100 text-xs block truncate">{subject.name}</span>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full border border-slate-700 shrink-0">
            {subject.units} Units
          </span>
        </div>

        <div className="space-y-1.5 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-[#C9952A] shrink-0" />
            <span className="truncate">
              <strong className="text-slate-200">Instructor: </strong>
              {hasFaculty ? schedule.facultyName : <span className="text-amber-400 italic">Unassigned</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[#C9952A] shrink-0" />
            <span className="truncate">
              <strong className="text-slate-200">Location: </strong>
              {isRedundantRoomName ? modeLabel : roomDisplayName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#C9952A] shrink-0" />
            <span className="truncate">
              <strong className="text-slate-200">Time: </strong>
              {schedule.startTime} – {schedule.endTime}
            </span>
          </div>
        </div>

        {conflict && (
          <div className="p-2 bg-red-950/90 border border-red-500/60 rounded-lg text-red-200 text-[11px] font-semibold flex items-start gap-1.5 shadow-inner">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{conflict.message}</span>
          </div>
        )}

        <div className="pt-1.5 flex items-center gap-1.5 border-t border-slate-800">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${modeBadgeClass}`}>
            {schedule.isHybrid ? "On-Site / Online" : modeLabel}
          </span>
        </div>
      </div>

      {conflict && (
        <div className="absolute top-1 left-1 z-20 flex items-center gap-1 bg-red-600 text-white px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow-sm animate-pulse">
          <AlertTriangle className="w-3 h-3 text-white shrink-0" />
          {!isCompact && <span>Conflict</span>}
        </div>
      )}

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
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-150 w-5 h-5 rounded-md hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center hover:shadow-sm cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
          {deleteConfirmScheduleId === schedule.id && (
            <div
              className="absolute right-0 top-6 w-24 rounded-xl bg-white border border-slate-200 shadow-lg p-1.5 text-[10px] text-slate-700 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-center mb-1 text-slate-800">Remove?</div>
              <div className="flex gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => onDelete(schedule.id)}
                  className="flex-1 rounded-md bg-red-500 hover:bg-red-600 text-white py-0.5 font-bold cursor-pointer transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmScheduleId(null)}
                  className="flex-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 py-0.5 font-bold cursor-pointer transition-colors"
                >
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isFacultyAssigned && !isCompact && (
        <div className="absolute top-1 right-1 bg-green-100 rounded-full p-0.5 z-20 border border-green-200">
          <CheckCircle2 className="w-2.5 h-2.5 text-green-600" />
        </div>
      )}

      <div className="flex flex-col h-full justify-between min-w-0">
        {isCompact ? (
          <div className="flex flex-col justify-between h-full min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className={`text-[10px] font-black uppercase tracking-tight truncate min-w-0 flex-1 ${gridStyles.text}`} title={subject.code}>
                {subject.code}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                {schedule.isHybrid ? (
                  <span className="text-[7px] rounded px-1 py-0.2 font-bold bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                    Hybrid
                  </span>
                ) : (
                  <span className={`text-[7px] rounded px-1 py-0.2 font-bold shrink-0 ${modeBadgeClass}`}>
                    {modeLabel}
                  </span>
                )}
                <span className={`text-[7.5px] px-1 rounded font-bold shrink-0 ${gridStyles.badgeText}`}>
                  {subject.units}u
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[8.5px] text-slate-500 truncate mt-0.5 gap-1">
              {roomDisplayName ? (
                <span className="truncate font-semibold">{roomDisplayName}</span>
              ) : null}
              <span className={`shrink-0 text-slate-400 font-semibold ${!roomDisplayName ? "ml-auto" : ""}`}>
                {schedule.startTime}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full justify-between min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className={`text-[11px] font-black uppercase tracking-tight truncate min-w-0 flex-1 ${gridStyles.text}`} title={subject.code}>
                {subject.code}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {schedule.isHybrid ? (
                  <span className="text-[8px] rounded px-1.5 py-0.5 font-bold bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                    Hybrid
                  </span>
                ) : (
                  <span className={`text-[8px] rounded px-1 py-0.5 font-bold shrink-0 ${modeBadgeClass}`}>
                    {modeLabel}
                  </span>
                )}
                <span className={`text-[8.5px] px-1 py-0.5 rounded font-bold shrink-0 ${gridStyles.badgeText}`}>
                  {subject.units}u
                </span>
              </div>
            </div>
            
            {roomDisplayName ? (
              <div className="text-[10px] text-slate-600 font-semibold truncate mt-0.5">
                {roomDisplayName}
              </div>
            ) : null}
            
            <div className="text-[9.5px] text-slate-500 font-medium truncate mt-auto leading-none pt-0.5">
              {schedule.startTime} – {schedule.endTime}
            </div>
          </div>
        )}
      </div>

      {isAwaitingFaculty && (
        <div className={`absolute left-0 right-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-b-xl py-1 shadow-sm ${
          isCompact ? "h-1 py-0 overflow-hidden" : "text-[10px] py-1"
        }`}>
          {!isCompact && (
            <>
              <UserPlus className="w-3 h-3" />
              <span>Tap to Assign Faculty</span>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default ScheduleCard;
