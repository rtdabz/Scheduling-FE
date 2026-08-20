import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, DoorOpen, LayoutGrid, List, MapPin, X } from "lucide-react";
import {
  DAYS,
  GRID_HEADER_HEIGHT_PX,
  getGridCardStyles,
  slotToTimeStr
} from "../constants";
import type { ScheduleItem, Room } from "../types";
import WeeklyTimetableGrid from "../../../../components/scheduling/WeeklyTimetableGrid";
import { getStoredUserDepartmentId } from "../../../../lib/storedUser";

interface RoomViewModalProps {
  rooms: Room[];
  isRoomViewOpen: boolean;
  setIsRoomViewOpen: (value: boolean) => void;
  roomViewRoomId: string;
  setRoomViewRoomId: (value: string) => void;
  schedules: ScheduleItem[];
}

const SLOT_COUNT = 24;
export default function RoomViewModal({
  rooms,
  isRoomViewOpen,
  setIsRoomViewOpen,
  roomViewRoomId,
  setRoomViewRoomId,
  schedules
}: RoomViewModalProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);
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

  const sortedRoomClasses = useMemo(
    () => [...roomClasses].sort((a, b) => a.dayIndex - b.dayIndex || a.startSlot - b.startSlot),
    [roomClasses]
  );
  const listTotalPages = Math.max(1, Math.ceil(sortedRoomClasses.length / listPageSize));
  const activeListPage = Math.min(listPage, listTotalPages);
  const paginatedRoomClasses = useMemo(() => {
    const start = (activeListPage - 1) * listPageSize;
    return sortedRoomClasses.slice(start, start + listPageSize);
  }, [sortedRoomClasses, activeListPage, listPageSize]);

  useEffect(() => {
    if (!isRoomViewOpen) return;
    setListPage(1);
  }, [isRoomViewOpen, roomViewRoomId, viewMode, listPageSize]);

  const isSharedRoom = room?.roomType === "field" || room?.roomType === "online";
  const sharedRoomCapacity = Math.max(1, Number(room?.maxConcurrentClasses ?? 1) || 1);
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
            <span className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-lg text-xs font-bold ${
              peakSharedOccupancy > sharedRoomCapacity
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}>
              Department capacity {peakSharedOccupancy}/{sharedRoomCapacity}
            </span>
          )}
          <div className="ml-auto flex items-center rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Room view mode">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                viewMode === "grid" ? "bg-[#4e0a10] text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                viewMode === "list" ? "bg-[#4e0a10] text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>

        {/* Room timetable */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-3 bg-slate-50/30 [contain:layout_paint]">
          {roomClasses.length === 0 && (
            <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
              This room is fully available - no classes are booked this week.
            </div>
          )}
          {viewMode === "list" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              {roomClasses.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center px-4 text-sm font-semibold text-slate-500">
                  No classes scheduled for this room.
                </div>
              ) : (
                <>
                <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                  {paginatedRoomClasses.map((schedule) => {
                      const styles = getGridCardStyles(schedule.courseType || schedule.subjectType || "major");
                      return (
                        <div key={schedule.id} className="grid grid-cols-[4rem_6rem_minmax(0,1fr)] items-center gap-2 px-3 py-3 hover:bg-slate-50 sm:grid-cols-[6rem_8rem_minmax(0,1fr)_7rem] sm:gap-3 sm:px-4">
                          <div className="text-xs font-black uppercase text-[#4e0a10]">{DAYS[schedule.dayIndex]}</div>
                          <div className="text-xs font-semibold text-slate-500">
                            {schedule.startTime} - {schedule.endTime}
                          </div>
                          <div className={`min-w-0 flex-1 border-l-4 px-3 py-1.5 ${styles.container}`}>
                            <div className={`text-xs font-black uppercase ${styles.text}`}>
                              {schedule.courseCode || schedule.subjectCode || "Unspecified"}
                            </div>
                            <div className="truncate text-xs font-bold text-slate-700">{schedule.courseName}</div>
                            <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500 sm:hidden">{schedule.sectionName}</div>
                          </div>
                          <div className="hidden text-right text-xs font-bold text-slate-600 sm:block">{schedule.sectionName}</div>
                        </div>
                      );
                    })}
                </div>
                <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row">
                  <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                    <span className="text-xs font-semibold text-slate-500">
                      Showing {(activeListPage - 1) * listPageSize + 1}–
                      {Math.min(activeListPage * listPageSize, sortedRoomClasses.length)} of {sortedRoomClasses.length} classes
                    </span>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      Show
                      <select
                        value={listPageSize}
                        onChange={(event) => setListPageSize(Number(event.target.value))}
                        className="rounded-lg border border-slate-200 bg-white p-1 text-xs outline-none focus:ring-1 focus:ring-[#C9952A]"
                        aria-label="Classes per page"
                      >
                        {[5, 10, 25].map((pageSize) => (
                          <option key={pageSize} value={pageSize}>{pageSize}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setListPage(1)}
                      disabled={activeListPage === 1}
                      className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      onClick={() => setListPage(Math.max(1, activeListPage - 1))}
                      disabled={activeListPage === 1}
                      className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="px-1 text-xs font-bold text-slate-500">
                      Page {activeListPage} of {listTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setListPage(Math.min(listTotalPages, activeListPage + 1))}
                      disabled={activeListPage === listTotalPages}
                      className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => setListPage(listTotalPages)}
                      disabled={activeListPage === listTotalPages}
                      className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Last
                    </button>
                  </div>
                </div>
                </>
              )}
            </div>
          ) : (
          <WeeklyTimetableGrid
            days={DAYS}
            slotCount={SLOT_COUNT}
            headerHeight={GRID_HEADER_HEIGHT_PX}
            rowTemplate={`repeat(${SLOT_COUNT}, minmax(0, 1fr))`}
            minWidth={0}
            className="min-h-0 flex-1 w-full"
            getTimeLabel={slotToTimeStr}
            getDayCount={(dayIndex) => roomClasses.filter((item) => item.dayIndex === dayIndex).length}
          >
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
                  className={`relative m-0.5 rounded-lg border-2 border-l-4 px-1.5 py-1 overflow-hidden shadow-sm transform-gpu flex flex-col justify-between ${styles.container}`}
                  style={{
                    gridColumn: cellGroup.dayIndex + 2,
                    gridRow: `${cellGroup.startSlot + 2} / span ${cellGroup.durationSlots}`
                  }}
                  title={tooltipTitle}
                >
                  <div className={`flex flex-col gap-1 overflow-hidden ${isSharedRoom ? "pr-8" : ""}`}>
                    {isSharedRoom && (
                      <div className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                        exceedsCapacity ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {groupOverlapCount}/{sharedRoomCapacity}
                      </div>
                    )}
                    {subgroups.map((sub) => (
                      <div key={`${cellGroup.id}-${sub.courseCode}-${sub.sectionName}`} className="flex flex-col mb-1 last:mb-0 border-b border-dashed border-slate-100/30 last:border-b-0 pb-0.5 last:pb-0">
                        <div className={`text-xs font-black uppercase leading-tight break-words ${getGridCardStyles(sub.courseType).text}`}>
                          {sub.courseCode}
                        </div>
                        <div className="text-[11px] font-bold leading-tight text-slate-700 break-words" title={sub.sectionName}>
                          {sub.sectionName}
                        </div>
                      </div>
                    ))}
                  </div>
                  {cellGroup.durationSlots > 3 && (
                    <div className="text-[10px] text-slate-500 font-bold truncate mt-auto pt-0.5 border-t border-slate-100/30">
                      {cellGroup.startTime} - {cellGroup.endTime}
                    </div>
                  )}
                </div>
              );
            })}
          </WeeklyTimetableGrid>
          )}
        </div>
      </div>
    </div>
  );
}
