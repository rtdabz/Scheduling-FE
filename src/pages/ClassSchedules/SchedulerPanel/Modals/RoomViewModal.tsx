import { useEffect, useMemo } from "react";
import { CalendarClock, ChevronDown, DoorOpen, MapPin, X } from "lucide-react";
import {
  DAYS,
  getGridCardStyles,
  slotToTimeStr
} from "../constants";
import type { ScheduleItem, Room } from "../types";

interface RoomViewModalProps {
  rooms: Room[];
  isRoomViewOpen: boolean;
  setIsRoomViewOpen: (value: boolean) => void;
  roomViewRoomId: string;
  setRoomViewRoomId: (value: string) => void;
  schedules: ScheduleItem[];
}

const SLOT_COUNT = 24;
const ROOM_VIEW_GRID_HEADER_HEIGHT_PX = 44;
const ROOM_VIEW_SLOT_HEIGHT_PX = 20;

export default function RoomViewModal({
  rooms,
  isRoomViewOpen,
  setIsRoomViewOpen,
  roomViewRoomId,
  setRoomViewRoomId,
  schedules
}: RoomViewModalProps) {
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

  const currentDepartmentId = useMemo(() => {
    const userJson = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!userJson) return null;

    try {
      const user = JSON.parse(userJson) as { department_id?: number | string | null };
      return user.department_id == null ? null : Number(user.department_id);
    } catch {
      return null;
    }
  }, []);

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

  const groupedRoomClasses = useMemo(() => {
    const groups: Record<string, ScheduleItem[]> = {};
    
    roomClasses.forEach((sched) => {
      const key = `${sched.dayIndex}-${sched.startSlot}-${sched.durationSlots}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(sched);
    });

    return Object.values(groups).map((group) => {
      const base = group[0];
      return {
        id: `${base.id}-${base.dayIndex}-${base.startSlot}-${base.durationSlots}`,
        dayIndex: base.dayIndex,
        startSlot: base.startSlot,
        durationSlots: base.durationSlots,
        startTime: base.startTime,
        endTime: base.endTime,
        items: group
      };
    });
  }, [roomClasses]);

  const isSharedRoom = room?.roomType === "field" || room?.roomType === "online";
  const sharedRoomCapacity = isSharedRoom ? 3 : Math.max(1, Number(room?.maxConcurrentClasses ?? 1) || 1);
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

  const slotIndexes = useMemo(
    () => Array.from({ length: SLOT_COUNT }, (_, index) => index),
    []
  );

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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
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
        <div className="px-6 py-2.5 border-b border-slate-100 flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 bg-[#4e0a10]/10 text-[#4e0a10] border border-[#4e0a10]/10 px-2.5 py-1 rounded-lg text-xs font-bold">
            <DoorOpen className="w-3.5 h-3.5" />
            {room?.name ?? "Room"}
          </span>
          <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold">
            <CalendarClock className="w-3.5 h-3.5" />
            {roomClasses.length} class{roomClasses.length !== 1 ? "es" : ""} booked
          </span>
          {isSharedRoom && (
            <span className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-lg text-xs font-bold ${
              peakSharedOccupancy > sharedRoomCapacity
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}>
              Shared capacity {peakSharedOccupancy}/{sharedRoomCapacity}
            </span>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden overscroll-contain p-3 bg-slate-50/30 [contain:layout_paint]">
          {roomClasses.length === 0 && (
            <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
              This room is fully available - no classes are booked this week.
            </div>
          )}
          <div
            className="min-w-[980px] border border-slate-200 rounded-xl overflow-hidden bg-white select-none"
            style={{
              display: "grid",
              gridTemplateColumns: "78px repeat(7, minmax(128px, 1fr))",
              gridTemplateRows: `${ROOM_VIEW_GRID_HEADER_HEIGHT_PX}px repeat(${SLOT_COUNT}, ${ROOM_VIEW_SLOT_HEIGHT_PX}px)`
            }}
          >
            {/* Corner */}
            <div
              className="bg-[#4e0a10]/5 border-r border-b border-slate-200 flex items-center justify-center text-[10px] font-bold text-[#4e0a10] uppercase tracking-wider sticky top-0 left-0 z-30"
              style={{ gridColumn: 1, gridRow: 1 }}
            >
              Time
            </div>

            {/* Day headers */}
            {DAYS.map((day, dIdx) => (
              <div
                key={day}
                className="bg-[#4e0a10]/5 border-r border-b border-slate-200 flex items-center justify-center text-xs font-extrabold text-slate-700 uppercase tracking-wider sticky top-0 z-20"
                style={{ gridColumn: dIdx + 2, gridRow: 1 }}
              >
                {day}
              </div>
            ))}

            {/* Time labels + empty cells */}
            {slotIndexes.map((t) => (
              <div key={`row-${t}`} style={{ display: "contents" }}>
                {t % 2 === 0 && (
                  <div
                    className="bg-slate-50/90 border-r border-b border-slate-200 text-[9px] font-bold text-slate-500 flex items-center justify-center sticky left-0 z-10"
                    style={{ gridColumn: 1, gridRow: `${t + 2} / span 2` }}
                  >
                    {slotToTimeStr(t)}
                  </div>
                )}
                {DAYS.map((_, d) => (
                  <div
                    key={`cell-${d}-${t}`}
                    className="border-r border-b border-slate-200"
                    style={{ gridColumn: d + 2, gridRow: t + 2 }}
                  />
                ))}
              </div>
            ))}

            {/* Booked class blocks */}
            {groupedRoomClasses.map((cellGroup) => {
              const groupEndSlot = cellGroup.startSlot + cellGroup.durationSlots;
              const groupOverlapCount = isSharedRoom
                ? roomClasses.filter((item) => {
                  const itemEndSlot = item.startSlot + item.durationSlots;
                  return item.dayIndex === cellGroup.dayIndex
                    && cellGroup.startSlot < itemEndSlot
                    && item.startSlot < groupEndSlot;
                }).length
                : cellGroup.items.length;
              const exceedsCapacity = isSharedRoom && groupOverlapCount > sharedRoomCapacity;

              // Group items by courseCode
              const subgroups: { courseCode: string; sectionName: string; courseType: ScheduleItem["courseType"] }[] = [];
              const courseMap: Record<string, string[]> = {};
              const courseTypeMap: Record<string, ScheduleItem["courseType"]> = {};

              cellGroup.items.forEach((item) => {
                const code = item.courseCode || item.subjectCode || "Unspecified";
                if (!courseMap[code]) {
                  courseMap[code] = [];
                }
                courseMap[code].push(item.sectionName);
                courseTypeMap[code] = item.courseType || item.subjectType || "major";
              });

              Object.keys(courseMap).forEach((code) => {
                const sectionsList = [...new Set(courseMap[code])].sort();
                subgroups.push({
                  courseCode: code,
                  sectionName: sectionsList.join(" | "),
                  courseType: courseTypeMap[code]
                });
              });

              const firstSub = subgroups[0];
              const styles = getGridCardStyles(firstSub?.courseType ?? "major");
              const tooltipTitle = cellGroup.items
                .map((item) => `${item.courseCode || item.subjectCode || "PE"} - ${item.sectionName} - ${item.startTime}-${item.endTime}`)
                .join("\n");

              return (
                <div
                  key={cellGroup.id}
                  className={`m-0.5 rounded-lg border-2 border-l-4 pt-2.5 px-1.5 pb-1.5 overflow-hidden shadow-sm transform-gpu flex flex-col justify-between ${styles.container}`}
                  style={{
                    gridColumn: cellGroup.dayIndex + 2,
                    gridRow: `${cellGroup.startSlot + 2} / span ${cellGroup.durationSlots}`
                  }}
                  title={tooltipTitle}
                >
                  <div className="flex flex-col gap-1 overflow-hidden">
                    {isSharedRoom && (
                      <div className={`self-start rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                        exceedsCapacity ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {groupOverlapCount}/{sharedRoomCapacity}
                      </div>
                    )}
                    {subgroups.map((sub) => (
                      <div key={`${cellGroup.id}-${sub.courseCode}-${sub.sectionName}`} className="flex flex-col mb-1 last:mb-0 border-b border-dashed border-slate-100/30 last:border-b-0 pb-0.5 last:pb-0">
                        <div className={`text-[10px] font-black uppercase truncate ${getGridCardStyles(sub.courseType).text}`}>
                          {sub.courseCode}
                        </div>
                        <div className="text-[9px] font-bold text-slate-700 truncate" title={sub.sectionName}>
                          {sub.sectionName}
                        </div>
                      </div>
                    ))}
                  </div>
                  {cellGroup.durationSlots > 3 && (
                    <div className="text-[8.5px] text-slate-400 font-bold truncate mt-auto pt-0.5 border-t border-slate-100/30">
                      {cellGroup.startTime} - {cellGroup.endTime}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
