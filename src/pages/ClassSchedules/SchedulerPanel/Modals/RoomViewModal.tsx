import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, DoorOpen, MapPin, X } from "lucide-react";
import {
  DAYS,
} from "../constants";
import type { Department, ScheduleItem, Room } from "../types";
import { getStoredUserDepartmentId } from "../../../../lib/storedUser";
import { gridOpeningMinutes, slotCount, slotMinutes, slotToTime24h } from "../../../../lib/timeGrid";
import MasterGantt, { type GanttReservation } from "../../../vpaa/calendar/MasterGantt";
import { useRoomGrants } from "../../../../hooks/useRoomGrants";
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

/**
 * Stable numeric id for a schedule the scheduler has not persisted yet.
 *
 * The timeline keys blocks and the overlap map by `id`, so a placeholder must
 * never land on a real schedule's id. Real ids are positive, so hashed ones are
 * pushed negative rather than merely hashed.
 */
const placeholderGanttId = (id: string): number => {
  const hash = id.split("").reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
  return -(Math.abs(hash) + 1);
};

/** "Juan Dela Cruz" -> { first_name: "Juan", last_name: "Dela Cruz" }. */
const splitFacultyName = (name: string): { first_name: string; last_name: string } => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first_name: parts[0] ?? "", last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
};

interface RoomViewModalProps {
  rooms: Room[];
  isRoomViewOpen: boolean;
  setIsRoomViewOpen: (value: boolean) => void;
  roomViewRoomId: string;
  setRoomViewRoomId: (value: string) => void;
  schedules: ScheduleItem[];
  departments: Department[];
}


export default function RoomViewModal({
  rooms,
  isRoomViewOpen,
  setIsRoomViewOpen,
  roomViewRoomId,
  setRoomViewRoomId,
  schedules,
  departments,
}: RoomViewModalProps) {
  /**
   * The room grid renders the same window as every other timetable. It was
   * pinned at 24 slots, which cut the day off at 7:00 PM and hid any evening
   * booking in the room it was meant to prove was free. Read during render, not
   * at module scope: `/initial-data` configures the window after import.
   */
  const SLOT_COUNT = slotCount();
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);
  // Close on Escape
  useEffect(() => {
    if (!isRoomViewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsRoomViewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRoomViewOpen, setIsRoomViewOpen]);

  const room = useMemo(
    () => rooms.find((r) => r.id === roomViewRoomId),
    [rooms, roomViewRoomId]
  );

  const currentDepartmentId = useMemo(() => getStoredUserDepartmentId(), []);

  // Only a real lecture room or laboratory can be lent to another department.
  const lendableRoomId = room && (room.roomType === "lecture" || room.roomType === "laboratory") && isRoomViewOpen
    ? Number(room.id) || null
    : null;
  const { grants } = useRoomGrants(lendableRoomId);
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

  // Adapt the scheduler's compact client model to the shared VPAA timeline
  // contract. The room filter above remains the single source of truth.
  const ganttSchedules = useMemo<CalendarSchedule[]>(() => roomClasses.map((item) => {
    const department = departments.find((candidate) => Number(candidate.id) === Number(item.departmentId));
    const numericId = Number(item.id);
    const faculty = item.facultyName ? splitFacultyName(item.facultyName) : null;
    return {
      id: Number.isFinite(numericId) ? numericId : placeholderGanttId(item.id),
      /*
       * The timeline works in minutes parsed from "HH:MM", while the scheduler
       * carries 12-hour display labels ("7 AM", "1:30 PM") and slot offsets.
       * Feeding it the labels made `toMinutes` return null for every meeting,
       * so `buildGanttDays` skipped them all and the chart drew an empty week.
       * Rebuild the times from the slots, which are the model's real position.
       */
      day: CALENDAR_DAYS[item.dayIndex] ?? item.day,
      start_time: slotToTime24h(item.startSlot),
      end_time: slotToTime24h(item.startSlot + item.durationSlots),
      meeting_type: item.meetingType ?? "lecture",
      mode: item.mode,
      course_id: Number(item.courseId) || null,
      department_id: Number(item.departmentId) || null,
      department: department ? {
        id: Number(department.id),
        department_name: department.department_name,
        department_code: department.department_code,
        logo: department.logo,
      } : null,
      room_id: item.mode === "on-site" && item.roomId && item.roomId !== "tba" ? Number(item.roomId) || null : null,
      room: item.mode === "on-site" && item.roomName ? { id: Number(item.roomId) || 0, room_code: item.roomName } : null,
      faculty_id: item.facultyId ? Number(item.facultyId) || null : null,
      faculty: faculty ? { id: Number(item.facultyId) || 0, ...faculty } : null,
      section_id: Number(item.sectionId) || null,
      section: { id: Number(item.sectionId) || 0, section_name: item.sectionName, department_id: Number(item.departmentId) },
      course: { course_code: item.courseCode, course_name: item.courseName, units: item.totalUnits },
    };
  }), [roomClasses, departments]);
  const ganttDays = useMemo(() => buildGanttDays(ganttSchedules, "none", [0, 1, 2, 3, 4, 5, 6]), [ganttSchedules]);
  /* Keep the Gantt axis aligned with the scheduler's configured time grid. */
  const ganttStandardHours = useMemo<StandardHours>(() => {
    const opening = gridOpeningMinutes();
    return { opening, closing: opening + SLOT_COUNT * slotMinutes(), slotMinutes: slotMinutes() };
  }, [SLOT_COUNT]);
  const ganttTimeWindow = useMemo(
    () => buildTimeWindow(ganttStandardHours, ganttSchedules),
    [ganttStandardHours, ganttSchedules],
  );
  const ganttOverlaps = useMemo(() => findOverlaps(ganttSchedules), [ganttSchedules]);

  // Field and online rooms are shared without a limit, so the chip reports how
  // busy the room gets rather than measuring against a capacity.
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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 min-h-screen p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setIsRoomViewOpen(false); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-view-title"
        className="bg-white rounded-2xl shadow-2xl h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] sm:h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3 border-b border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-start gap-3">
            <DoorOpen className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
            <div>
              <h3 id="room-view-title" className="text-lg font-bold text-slate-900 leading-tight">
                Room Schedule
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Weekly occupancy for your department
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
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
            <button
              type="button"
              onClick={() => setIsRoomViewOpen(false)}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="px-6 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2 shrink-0">
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

        {/* Room timetable */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-3 bg-slate-50/30 [contain:layout_paint]">
          {reservations.length > 0 ? (
            <div className="mb-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-800">
              Dashed windows mark time this room is lent to another department; only that department can schedule there.
            </div>
          ) : roomClasses.length === 0 && (
            <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
              This room is fully available - no classes are booked this week.
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
        schedule={selectedSchedule}
        allSchedules={ganttSchedules}
        overlaps={ganttOverlaps}
        onClose={() => setSelectedSchedule(null)}
        onSelect={setSelectedSchedule}
      />
    </div>
  );
}
