import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronDown, DoorOpen, MapPin, X } from "lucide-react";
import {
  DAYS,
} from "../constants";
import type { Department, ScheduleItem, Room } from "../types";
import { getStoredUserDepartmentId } from "../../../../lib/storedUser";
import { gridOpeningMinutes, slotCount, slotMinutes } from "../../../../lib/timeGrid";
import { scheduleItemToCalendar } from "../ganttAdapter";
import MasterGantt, { type GanttReservation } from "../../../vpaa/calendar/MasterGantt";
import { useRoomGrants } from "../../../../hooks/useRoomGrants";
import { useModalScrollLock } from "../../../../hooks/useModalScrollLock";
import { toMinutes } from "../../../../lib/roomRequests";
import ScheduleDetailModal from "../../../vpaa/calendar/ScheduleDetailModal";
import {
  buildGanttDays,
  buildTimeWindow,
  CALENDAR_DAYS,
  findOverlaps,
  type CalendarSchedule,
  type StandardHours,
} from "../../../vpaa/calendar/ganttLayout";

interface RoomViewModalProps {
  rooms: Room[];
  isRoomViewOpen: boolean;
  setIsRoomViewOpen: (value: boolean) => void;
  roomViewRoomId: string;
  setRoomViewRoomId: (value: string) => void;
  schedules: ScheduleItem[];
  departments: Department[];
  activeSemester?: { id: number | string } | null;
}


export default function RoomViewModal({
  rooms,
  isRoomViewOpen,
  setIsRoomViewOpen,
  roomViewRoomId,
  setRoomViewRoomId,
  schedules,
  departments,
  activeSemester,
}: RoomViewModalProps) {
  const SLOT_COUNT = slotCount();
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalScrollLock(isRoomViewOpen);

  useEffect(() => {
    if (!isRoomViewOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [isRoomViewOpen]);

  useEffect(() => {
    if (!isRoomViewOpen || selectedSchedule) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsRoomViewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRoomViewOpen, selectedSchedule, setIsRoomViewOpen]);

  const room = useMemo(
    () => rooms.find((r) => r.id === roomViewRoomId),
    [rooms, roomViewRoomId]
  );

  const currentDepartmentId = useMemo(() => getStoredUserDepartmentId(), []);

  const lendableRoomId = room && (room.roomType === "lecture" || room.roomType === "laboratory") && isRoomViewOpen
    ? Number(room.id) || null
    : null;
  const { grants } = useRoomGrants(lendableRoomId, activeSemester ? Number(activeSemester.id) || null : null);
  const reservations = useMemo<GanttReservation[]>(() => grants
    .map((grant) => ({
      dayIndex: CALENDAR_DAYS.indexOf(grant.day as (typeof CALENDAR_DAYS)[number]),
      start: toMinutes(grant.start_time),
      end: toMinutes(grant.end_time),
      label: `Borrowed by ${grant.department_code ?? "another department"}`,
    }))
    .filter((reservation) => reservation.dayIndex >= 0), [grants]);

  const roomClasses = useMemo(() => {
    return schedules.filter((s) => {
      const isSharedRoom = room?.roomType === "online" || room?.roomType === "field";
      if (isSharedRoom && currentDepartmentId !== null && Number(s.departmentId) !== currentDepartmentId) {
        return false;
      }

      if (room?.roomType === "online") {
        return s.roomId === "online" || s.mode === "online";
      }
      if (room?.roomType === "field") {
        return s.roomId === "field" || s.mode === "field";
      }
      return s.roomId === roomViewRoomId;
    });
  }, [schedules, roomViewRoomId, room, currentDepartmentId]);

  const ganttSchedules = useMemo<CalendarSchedule[]>(
    () => roomClasses.map((item) => scheduleItemToCalendar(item, departments)),
    [roomClasses, departments],
  );
  // Room Schedule reviews the working timetable before approval; other Gantt views publish approved classes.
  const ganttDays = useMemo(() => buildGanttDays(ganttSchedules, "none", [0, 1, 2, 3, 4, 5, 6], true), [ganttSchedules]);
  const ganttStandardHours = useMemo<StandardHours>(() => {
    const opening = gridOpeningMinutes();
    return { opening, closing: opening + SLOT_COUNT * slotMinutes(), slotMinutes: slotMinutes() };
  }, [SLOT_COUNT]);
  const ganttTimeWindow = useMemo(
    () => buildTimeWindow(ganttStandardHours, ganttSchedules, true),
    [ganttStandardHours, ganttSchedules],
  );
  const ganttOverlaps = useMemo(() => findOverlaps(ganttSchedules, true), [ganttSchedules]);

  const isSharedRoom = room?.roomType === "field" || room?.roomType === "online";
  const peakSharedOccupancy = useMemo(() => {
    if (!isSharedRoom) return 0;

    let peak = 0;
    DAYS.forEach((_, dayIndex) => {
      const events: Array<[number, number]> = [];
      roomClasses
        .filter((item) => item.dayIndex === dayIndex)
        .forEach((item) => {
          events.push([item.startSlot, 1], [item.startSlot + item.durationSlots, -1]);
        });

      events.sort((left, right) => left[0] - right[0] || left[1] - right[1]);

      let concurrent = 0;
      events.forEach(([, delta]) => {
        concurrent += delta;
        peak = Math.max(peak, concurrent);
      });
    });

    return peak;
  }, [isSharedRoom, roomClasses]);

  if (!isRoomViewOpen) return null;

  return (
    <div
      className="scheduler-dialog-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) setIsRoomViewOpen(false); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        data-workflow-guide-scope="room-schedule"
        aria-labelledby="room-view-title"
        aria-describedby="room-view-description"
        className="scheduler-dialog h-[calc(100dvh-1rem)] w-full sm:h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <div className="scheduler-dialog-header flex items-start justify-between gap-3 shrink-0">
          <div className="flex min-w-0 items-start gap-3">
            <span className="scheduler-dialog-icon"><DoorOpen className="w-5 h-5" /></span>
            <div className="min-w-0">
              <p className="scheduler-dialog-eyebrow">Room occupancy</p>
              <h3 id="room-view-title" className="scheduler-dialog-title">
                Room Schedule
              </h3>
              <p id="room-view-description" className="scheduler-dialog-description">
                Review weekly room schedules, including drafts
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setIsRoomViewOpen(false)}
            aria-label="Close"
            className="scheduler-dialog-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative w-full sm:mr-auto sm:w-64">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
                aria-label="Room schedule"
                value={roomViewRoomId}
                onChange={(e) => setRoomViewRoomId(e.target.value)}
                className="w-full appearance-none border border-slate-300 rounded-lg pl-9 pr-9 py-2 text-sm font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10]"
              >
                {rooms.map((r) => {
                  const isUnavailable = r.status === "not available";
                  return (
                    <option key={r.id} value={r.id} className={isUnavailable ? "text-slate-400 italic" : ""}>
                      {r.name}{isUnavailable ? " — (Not Available)" : ""}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          <span className="flex items-center gap-1.5 bg-[#4e0a10]/10 text-[#4e0a10] border border-[#4e0a10]/10 px-2.5 py-1 rounded-lg text-xs font-bold">
            <DoorOpen className="w-3.5 h-3.5" />
            {room?.name ?? "Room"}
          </span>
          <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold">
            <CalendarClock className="w-3.5 h-3.5" />
            {roomClasses.length} class{roomClasses.length !== 1 ? "es" : ""} booked
          </span>
          {isSharedRoom && (
            <span className="flex items-center gap-1.5 border px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
              Up to {peakSharedOccupancy} at once · no limit
            </span>
          )}
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-auto p-3 bg-slate-50/30 [contain:layout_paint]">
          {reservations.length > 0 ? (
            <div className="mb-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-800">
              Dashed windows mark time this room is lent to another department; only that department can schedule there.
            </div>
          ) : roomClasses.length === 0 && (
            <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
              No classes are scheduled in this room this week.
            </div>
          )}
          {roomClasses.length > 0 && (
            <div role="status" className={`mb-2 rounded-xl border px-4 py-2 text-xs font-semibold ${ganttOverlaps.size > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {ganttOverlaps.size > 0
                ? `${ganttOverlaps.size} classes have overlaps in this room. Red outlines mark affected classes; select one to review the details.`
                : "No overlapping classes in this room."}
            </div>
          )}
          <MasterGantt
            days={ganttDays}
            timeWindow={ganttTimeWindow}
            standardHours={ganttStandardHours}
            groupBy="none"
            zoom="fit"
            lockHorizontalScroll
            density="comfortable"
            overlaps={ganttOverlaps}
            collapsedDays={new Set()}
            onToggleDay={() => undefined}
            onSelect={setSelectedSchedule}
            now={new Date()}
            fillHeight
            reservations={reservations}
            className="h-full min-h-[420px]"
          />
        </div>
      </div>
      <ScheduleDetailModal
        appearance="workflow"
        includeUnapproved
        schedule={selectedSchedule}
        allSchedules={ganttSchedules}
        overlaps={ganttOverlaps}
        onClose={() => setSelectedSchedule(null)}
        onSelect={setSelectedSchedule}
      />
    </div>
  );
}
