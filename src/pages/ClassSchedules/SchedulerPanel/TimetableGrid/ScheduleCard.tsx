import { memo } from "react";
import { AlertTriangle, CheckCircle2, UserPlus, X } from "lucide-react";
import {
  getGridCardStyles,
  getGridModeBadgeClass
} from "../constants";
import type { ScheduleItem, Subject, Room } from "../types";
import TimetableCardTooltip from "../../../../components/scheduling/TimetableCardTooltip";

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
  slotHeight?: number;
  isWideView?: boolean;
}

/**
 * A placed class in the timetable grid.
 *
 * This used to hold two parallel ~200-line JSX trees selected by `isWideView`,
 * with the hover tooltip duplicated verbatim between them. The tooltip now comes
 * from the shared TimetableCardTooltip, and the layout differences are the
 * handful of conditionals below.
 *
 * The wide layout never uses the compact or medium density tiers, so those are
 * gated on `!isWideView` to keep rendering identical to the split version.
 */
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
  slotHeight,
  isWideView = false
}: ScheduleCardProps) {
  const room = rooms.find((r) => r.id === schedule.roomId);
  const gridStyles = getGridCardStyles(subject.category);
  const modeBadgeClass = getGridModeBadgeClass(schedule.mode);
  const modeLabel = schedule.mode === "on-site"
    ? "On-Site"
    : schedule.mode === "online"
    ? "Online"
    : "Field";
  const inferredMeetingType = schedule.meetingType
    ?? (Number(subject.labHours ?? 0) > 0 ? "laboratory" : "lecture");
  const meetingTypeLabel = inferredMeetingType === "laboratory"
    ? "LAB"
    : inferredMeetingType === "lecture"
    ? "LEC"
    : "";
  const displayModeLabel = schedule.isHybrid
    ? meetingTypeLabel ? `Hybrid ${meetingTypeLabel}` : "Hybrid"
    : meetingTypeLabel && schedule.mode === "on-site"
    ? `${modeLabel} ${meetingTypeLabel}`
    : modeLabel;
  const isDraggingThis = draggedScheduleId === schedule.id;
  const hasFaculty = !!schedule.facultyId;
  const cardHeight = schedule.durationSlots * (slotHeight ?? 0);
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

  // Density tiers apply to the narrow layout only.
  const isCompact = !isWideView && schedule.durationSlots <= 2; // 1 hour (38px)
  const isMedium = !isWideView && schedule.durationSlots === 3; // 1.5 hours (57px)

  const paddingClasses = isWideView
    ? `p-2.5 px-3 ${isAwaitingFaculty ? "pb-8" : ""}`
    : isCompact
    ? `p-1 px-1.5 ${isAwaitingFaculty ? "pr-7" : ""}`
    : isMedium
    ? `p-1.5 px-2 ${isAwaitingFaculty ? "pb-7" : ""}`
    : `p-2 px-2.5 ${isAwaitingFaculty ? "pb-7" : ""}`;

  return (
    <div
      draggable={isEditable && !isPhase2Active}
      onDragStart={(e) => !isPhase2Active && onDragStart(e, schedule)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick(schedule.id)}
      className={`w-full rounded-xl border-2 border-l-4 box-border relative transition-all duration-150 motion-reduce:transition-none motion-reduce:hover:scale-100 group overflow-visible ${
        slotHeight ? "" : "h-full"
      } ${paddingClasses} ${gridStyles.container} ${
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
        ...(slotHeight ? { height: `${cardHeight}px` } : {}),
      }}
    >
      <TimetableCardTooltip
        placement="vertical"
        verticalAlign={(schedule.startSlot + schedule.durationSlots) > 12 ? "above" : "below"}
        code={subject.code}
        name={subject.name}
        badge={`${subject.units} Units`}
        instructor={hasFaculty ? schedule.facultyName : <span className="text-amber-400 italic">Unassigned</span>}
        location={isRedundantRoomName ? modeLabel : roomDisplayName}
        time={`${schedule.startTime} – ${schedule.endTime}`}
      >
        {conflict && (
          <div className="p-2 bg-red-950/90 border border-red-500/60 rounded-lg text-red-200 text-[11px] font-semibold flex items-start gap-1.5 shadow-inner">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{conflict.message}</span>
          </div>
        )}

        <div className="pt-1.5 flex items-center gap-1.5 border-t border-slate-800">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${modeBadgeClass}`}>
            {displayModeLabel}
          </span>
        </div>
      </TimetableCardTooltip>

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

      {isCompact ? (
        <div className="flex flex-col justify-between h-full min-w-0">
          <div className="flex items-start justify-between gap-1 min-w-0">
            <span className={`text-[10px] font-black uppercase tracking-tight break-words whitespace-normal min-w-0 flex-1 leading-tight ${gridStyles.text}`} title={subject.code}>
              {subject.code}
            </span>
            <div className="flex flex-wrap items-start justify-end gap-0.5 shrink-0 max-w-[58%]">
              <span
                className={`text-[7px] rounded px-1 py-0.2 font-bold break-words whitespace-normal text-right leading-tight ${
                  schedule.isHybrid ? "bg-blue-50 text-blue-700 border border-blue-100" : modeBadgeClass
                }`}
              >
                {displayModeLabel}
              </span>
              <span className={`text-[7.5px] px-1 rounded font-bold ${gridStyles.badgeText}`}>
                {subject.units}u
              </span>
            </div>
          </div>
          <div className="flex items-start justify-between text-[8.5px] text-slate-500 mt-0.5 gap-1">
            {roomDisplayName ? (
              <span className="break-words whitespace-normal font-semibold leading-tight min-w-0">{roomDisplayName}</span>
            ) : null}
            <span className={`shrink-0 text-slate-400 font-semibold ${!roomDisplayName ? "ml-auto" : ""}`}>
              {schedule.startTime}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full justify-between min-w-0">
          <div className={`flex items-start justify-between min-w-0 ${isWideView ? "gap-1.5" : "gap-1"}`}>
            <span
              className={`min-w-0 flex-1 truncate whitespace-nowrap font-black uppercase tracking-tight ${
                isWideView ? "text-[12px]" : "text-[11px] leading-tight"
              } ${gridStyles.text}`}
              title={subject.code}
            >
              {subject.code}
            </span>
            <span
              className={`shrink-0 whitespace-nowrap rounded py-0.5 text-[8px] font-bold ${
                isWideView ? "" : "text-right leading-tight"
              } ${
                schedule.isHybrid
                  ? "border border-blue-100 bg-blue-50 px-1.5 text-blue-700"
                  : `px-1 ${modeBadgeClass}`
              }`}
            >
              {displayModeLabel}
            </span>
          </div>

          <div className="mt-0.5 flex min-w-0 items-start justify-between gap-1">
            {roomDisplayName ? (
              <div className={`min-w-0 break-words text-[10px] font-semibold text-slate-600 ${isWideView ? "" : "leading-tight"}`}>
                {roomDisplayName}
              </div>
            ) : <span />}
            <span className={`shrink-0 rounded px-1 py-0.5 text-[8.5px] font-bold leading-none ${gridStyles.badgeText}`}>
              {subject.units}u
            </span>
          </div>

          <div className={`text-[9.5px] text-slate-500 font-medium mt-auto pt-0.5 break-words ${isWideView ? "leading-none" : "whitespace-normal leading-tight"}`}>
            {hasFaculty && schedule.facultyName && (
              <div className="truncate font-bold text-emerald-800" title={schedule.facultyName}>
                {schedule.facultyName}
              </div>
            )}
            {schedule.startTime} – {schedule.endTime}
          </div>
        </div>
      )}

      {isAwaitingFaculty && (
        <div
          className={
            isWideView
              ? "absolute bottom-1.5 right-1.5 flex h-6 items-center gap-1 rounded-lg border border-orange-600/20 bg-orange-500 px-2 text-[9px] font-bold text-white shadow-sm transition-colors group-hover:bg-orange-600"
              : `absolute bottom-1 right-1 flex items-center justify-center rounded-lg border border-orange-600/20 bg-orange-500 font-bold text-white shadow-sm transition-colors group-hover:bg-orange-600 ${
                  isCompact ? "h-5 w-5" : "h-5 gap-1 px-1.5 text-[8.5px]"
                }`
          }
          title="Assign faculty"
        >
          <UserPlus className="h-3 w-3 shrink-0" />
          {!isCompact && <span>Assign Faculty</span>}
        </div>
      )}
    </div>
  );
});

export default ScheduleCard;
