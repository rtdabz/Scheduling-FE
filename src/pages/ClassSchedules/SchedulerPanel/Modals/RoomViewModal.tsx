import { useEffect, useMemo } from "react";
import { CalendarClock, ChevronDown, DoorOpen, MapPin, X } from "lucide-react";
import {
  DAYS,
  GRID_HEADER_HEIGHT_PX,
  SLOT_HEIGHT_PX,
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

const SLOT_COUNT = 28;

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

  const roomClasses = useMemo(
    () => schedules.filter((s) => s.roomId === roomViewRoomId),
    [schedules, roomViewRoomId]
  );

  const slotIndexes = useMemo(
    () => Array.from({ length: SLOT_COUNT }, (_, index) => index),
    []
  );

  if (!isRoomViewOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 min-h-screen p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setIsRoomViewOpen(false); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-view-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-start gap-3">
            <DoorOpen className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
            <div>
              <h3 id="room-view-title" className="text-lg font-bold text-slate-900 leading-tight">
                Room Schedule
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Weekly occupancy across all sections
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
                value={roomViewRoomId}
                onChange={(e) => setRoomViewRoomId(e.target.value)}
                className="appearance-none border border-slate-300 rounded-lg pl-9 pr-9 py-2 text-sm font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] min-w-[180px]"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
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
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 bg-[#4e0a10]/10 text-[#4e0a10] border border-[#4e0a10]/10 px-2.5 py-1 rounded-lg text-xs font-bold">
            <DoorOpen className="w-3.5 h-3.5" />
            {room?.name ?? "Room"}
          </span>
          <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold">
            <CalendarClock className="w-3.5 h-3.5" />
            {roomClasses.length} class{roomClasses.length !== 1 ? "es" : ""} booked
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto overscroll-contain p-4 bg-slate-50/30 [contain:layout_paint]">
          {roomClasses.length === 0 && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              This room is fully available - no classes are booked this week.
            </div>
          )}
          <div
            className="min-w-[720px] border border-slate-200 rounded-xl overflow-hidden bg-white select-none"
            style={{
              display: "grid",
              gridTemplateColumns: "70px repeat(6, minmax(0, 1fr))",
              gridTemplateRows: `${GRID_HEADER_HEIGHT_PX}px repeat(${SLOT_COUNT}, ${SLOT_HEIGHT_PX}px)`
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
                    className="border-r border-b border-slate-100"
                    style={{ gridColumn: d + 2, gridRow: t + 2 }}
                  />
                ))}
              </div>
            ))}

            {/* Booked class blocks */}
            {roomClasses.map((sched) => {
              const styles = getGridCardStyles(sched.subjectType);
              return (
                <div
                  key={sched.id}
                  className={`m-0.5 rounded-lg border-2 border-l-4 p-1.5 overflow-hidden shadow-sm transform-gpu ${styles.container}`}
                  style={{
                    gridColumn: sched.dayIndex + 2,
                    gridRow: `${sched.startSlot + 2} / span ${sched.durationSlots}`
                  }}
                  title={`${sched.subjectCode} - ${sched.sectionName} - ${sched.startTime}-${sched.endTime}`}
                >
                  <div className={`text-[11px] font-bold uppercase truncate ${styles.text}`}>
                    {sched.subjectCode}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-600 truncate">
                    {sched.sectionName}
                  </div>
                  {sched.durationSlots > 3 && (
                    <div className="text-[9px] text-slate-400 truncate mt-0.5">
                      {sched.startTime}-{sched.endTime}
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
