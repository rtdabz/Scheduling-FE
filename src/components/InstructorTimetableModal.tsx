import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Calendar, Printer, X, MapPin, Layers, CheckCircle2 } from "lucide-react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { getCachedData, loadCachedData } from "../lib/dataCache";
import WeeklyTimetableGrid from "./scheduling/WeeklyTimetableGrid";
import Skeleton from "./ui/Skeleton";
import { scheduleLocationLabel } from "../lib/scheduleLocation";

interface ApiScheduleRecord {
  id: number;
  term_id: number;
  section_id: number;
  course_id?: number | null;
  subject_id?: number | null;
  faculty_id?: number | null;
  room_id: number;
  department_id: number;
  day: string;
  start_time: string;
  end_time: string;
  mode?: string;
  is_hybrid?: boolean;
  status?: string;
  course?: {
    course_code?: string;
    course_name?: string;
    course_category?: "major" | "minor";
    units?: number;
  };
  subject?: {
    subject_code?: string;
    subject_name?: string;
    course_code?: string;
    course_name?: string;
    subject_category?: "major" | "minor";
    units?: number;
  };
  section?: {
    section_name?: string;
  };
  room?: {
    room_code?: string;
    building?: string;
  };
}

interface InstructorTimetableModalProps {
  facultyId: number;
  facultyName: string;
  departmentName?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface TimetableSlotItem {
  id: number;
  day: string;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  durationSlots: number;
  courseCode: string;
  courseName: string;
  category: "major" | "minor";
  sectionName: string;
  roomName: string;
  mode: string;
  startTime: string;
  endTime: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_MAP: Record<string, number> = {
  Monday: 0, Mon: 0,
  Tuesday: 1, Tue: 1,
  Wednesday: 2, Wed: 2,
  Thursday: 3, Thu: 3,
  Friday: 4, Fri: 4,
  Saturday: 5, Sat: 5,
  Sunday: 6, Sun: 6,
};

const parseTimeToSlot = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const totalMinutes = hours * 60 + minutes;
  return Math.max(0, Math.floor((totalMinutes - 420) / 30));
};

const slotToTimeStr12h = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};

const slotToTime24hStr = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

const getGridCardStyles = (category: "major" | "minor") => {
  if (category === "major") {
    return {
      container: "border-blue-400 border-l-blue-600 bg-blue-50 text-blue-900",
      badge: "bg-blue-100 text-blue-800 border-blue-200",
    };
  }
  return {
    container: "border-purple-400 border-l-purple-600 bg-purple-50 text-purple-900",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
  };
};

export default function InstructorTimetableModal({
  facultyId,
  facultyName,
  departmentName,
  isOpen,
  onClose,
}: InstructorTimetableModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isComfortView, setIsComfortView] = useState(false);
  const [schedules, setSchedules] = useState<TimetableSlotItem[]>([]);

  const slotHeight = isComfortView ? 34 : 26;

  useEffect(() => {
    if (!isOpen || !facultyId) return;

    let isMounted = true;

    const fetchFacultySchedules = async () => {
      const cached = getCachedData<ApiScheduleRecord[]>("global:schedules");
      if (!cached) {
        setLoading(true);
      }

      try {
        const res = await api.get<ApiScheduleRecord[]>("/schedules");
        const rawData = res.data ?? [];

        if (!isMounted) return;

        const facultySchedules = rawData.filter(
          (s) => s.faculty_id !== null && Number(s.faculty_id) === Number(facultyId)
        );

        const mapped: TimetableSlotItem[] = facultySchedules.map((s) => {
          const dayIndex = DAY_MAP[s.day] ?? 0;
          const startSlot = parseTimeToSlot(s.start_time);
          const endSlot = parseTimeToSlot(s.end_time);
          const durationSlots = Math.max(1, endSlot - startSlot);

          const courseCode = s.course?.course_code ?? s.subject?.course_code ?? s.subject?.subject_code ?? "SUBJECT";
          const courseName = s.course?.course_name ?? s.subject?.course_name ?? s.subject?.subject_name ?? "";
          const category = s.course?.course_category ?? s.subject?.subject_category ?? "major";
          const sectionName = s.section?.section_name ?? "SEC";
          const roomName = scheduleLocationLabel(s.mode, s.room?.room_code);

          return {
            id: s.id,
            day: s.day,
            dayIndex,
            startSlot,
            endSlot,
            durationSlots,
            courseCode,
            courseName,
            category,
            sectionName,
            roomName,
            mode: s.mode ?? "on-site",
            startTime: s.start_time,
            endTime: s.end_time,
          };
        });

        setSchedules(mapped);
      } catch {
        toast.error("Error", "Failed to load instructor timetable.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchFacultySchedules();

    return () => {
      isMounted = false;
    };
  }, [isOpen, facultyId]);

  const getClassesCountForDay = (dIdx: number) => {
    return schedules.filter((s) => s.dayIndex === dIdx).length;
  };

  // Generate HTML Print Document matching the exact layout requested by user
  const handlePrintTimetable = () => {
    if (!facultyName) return;

    const nameParts = facultyName.trim().split(/\s+/);
    let lastName = nameParts[nameParts.length - 1] || "INSTRUCTOR";
    let firstName = nameParts.slice(0, nameParts.length - 1).join(" ") || "";
    if (nameParts.length === 1) {
      lastName = nameParts[0];
      firstName = "";
    }
    const formattedTitleName = firstName
      ? `${lastName.toUpperCase()}_${firstName.toUpperCase()}`
      : lastName.toUpperCase();

    const totalSlots = 24;

    const gridCells: (TimetableSlotItem | null)[][] = Array.from({ length: totalSlots }, () =>
      Array(7).fill(null)
    );

    const cellSkip: boolean[][] = Array.from({ length: totalSlots }, () =>
      Array(7).fill(false)
    );

    schedules.forEach((item) => {
      if (item.dayIndex >= 0 && item.dayIndex < 7 && item.startSlot >= 0 && item.startSlot < totalSlots) {
        gridCells[item.startSlot][item.dayIndex] = item;
        for (let i = 1; i < item.durationSlots; i++) {
          if (item.startSlot + i < totalSlots) {
            cellSkip[item.startSlot + i][item.dayIndex] = true;
          }
        }
      }
    });

    let tableRowsHtml = "";
    for (let slot = 0; slot < totalSlots; slot++) {
      const timeStr = slotToTime24hStr(slot);
      tableRowsHtml += `<tr><td class="time-cell">${timeStr}</td>`;

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        if (cellSkip[slot][dayIdx]) {
          continue;
        }

        const item = gridCells[slot][dayIdx];
        if (item) {
          const rowSpan = item.durationSlots;
          tableRowsHtml += `
            <td rowspan="${rowSpan}" class="schedule-cell ${item.category === "major" ? "major-cell" : "minor-cell"}">
              <div class="course-code">${item.courseCode}</div>
              <div class="section-name">${item.sectionName}</div>
              <div class="room-name">${item.roomName}</div>
            </td>
          `;
        } else {
          tableRowsHtml += `<td class="empty-cell"></td>`;
        }
      }
      tableRowsHtml += `</tr>`;
    }

    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Timetable - ${formattedTitleName}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 8mm;
            }
            body {
              font-family: 'Arial', sans-serif;
              margin: 0;
              padding: 10px;
              color: #1a1a1a;
              background-color: #ffffff;
            }
            .header-banner {
              background-color: #4e0a10;
              color: #ffffff;
              text-align: center;
              padding: 10px;
              font-size: 20px;
              font-weight: 900;
              letter-spacing: 1px;
              text-transform: uppercase;
              border: 2px solid #36070b;
              margin-bottom: 10px;
            }
            .dept-subtitle {
              font-size: 12px;
              font-weight: normal;
              margin-top: 3px;
              color: #f3d38c;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th {
              background-color: #f1f5f9;
              border: 1px solid #64748b;
              padding: 6px;
              font-size: 11px;
              font-weight: 800;
              text-align: center;
              text-transform: uppercase;
            }
            th.time-header {
              width: 55px;
              background-color: #e2e8f0;
            }
            td {
              border: 1px solid #cbd5e1;
              font-size: 10px;
              text-align: center;
              vertical-align: middle;
              height: 18px;
            }
            td.time-cell {
              font-weight: bold;
              background-color: #f8fafc;
              color: #334155;
              font-size: 9px;
            }
            td.empty-cell {
              background-color: #ffffff;
            }
            td.schedule-cell {
              font-weight: bold;
              padding: 4px 2px;
            }
            td.major-cell {
              background-color: #dbeafe;
              border-color: #3b82f6;
              color: #1e40af;
            }
            td.minor-cell {
              background-color: #f3e8ff;
              border-color: #a855f7;
              color: #6b21a8;
            }
            .course-code {
              font-size: 11px;
              font-weight: 900;
              line-height: 1.1;
            }
            .section-name {
              font-size: 10px;
              font-weight: 800;
              margin-top: 2px;
            }
            .room-name {
              font-size: 9px;
              font-weight: 600;
              margin-top: 1px;
              opacity: 0.9;
            }
          </style>
        </head>
        <body>
          <div class="header-banner">
            INSTRUCTOR: ${formattedTitleName}
            ${departmentName ? `<div class="dept-subtitle">${departmentName}</div>` : ""}
          </div>
          <table>
            <thead>
              <tr>
                <th class="time-header">TIME</th>
                <th>MONDAY</th>
                <th>TUESDAY</th>
                <th>WEDNESDAY</th>
                <th>THURSDAY</th>
                <th>FRIDAY</th>
                <th>SATURDAY</th>
                <th>SUNDAY</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      toast.error("Error", "Pop-up blocked. Please allow pop-ups to print the timetable.");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Top Control Bar matching Schedule Builder TimetableGrid Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/50 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#4e0a10]" />
              {facultyName} - View Schedule
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="bg-[#4e0a10]/15 text-[#4e0a10] border border-[#4e0a10]/10 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase">
                {departmentName || "Instructor Schedule"}
              </span>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md text-[10px] font-bold">
                {schedules.length} Assigned Class{schedules.length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsComfortView(!isComfortView)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 shadow-xs border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 cursor-pointer"
            >
              {isComfortView ? "Compact View" : "Comfort View"}
            </button>
            <button
              type="button"
              onClick={handlePrintTimetable}
              disabled={loading || schedules.length === 0}
              className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Timetable</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / CSS Grid Matching Schedule Builder TimetableGrid */}
        <div className="flex-1 overflow-auto bg-slate-50/20 p-4 font-sans relative [transform:translateZ(0)] will-change-scroll">
          {loading ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6" aria-busy="true" aria-label="Loading instructor timetable">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <WeeklyTimetableGrid
                days={DAYS}
                slotCount={24}
                slotHeight={slotHeight}
                headerHeight={40}
                minWidth={900}
                getTimeLabel={slotToTimeStr12h}
                getDayCount={getClassesCountForDay}
              >
                {/* Schedule Cards placed using CSS Grid matching Schedule Builder ScheduleCard */}
                {schedules.map((schedule) => {
                  const cardStyles = getGridCardStyles(schedule.category);
                  const cardHeight = schedule.durationSlots * slotHeight;

                  return (
                    <div
                      key={schedule.id}
                      className={`rounded-xl border-2 border-l-4 box-border relative shadow-sm hover:shadow-md transition-all duration-150 p-2 overflow-hidden flex flex-col justify-between cursor-default z-20 ${cardStyles.container}`}
                      style={{
                        gridColumn: schedule.dayIndex + 2,
                        gridRow: `${schedule.startSlot + 2} / span ${schedule.durationSlots}`,
                        height: `${cardHeight}px`,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-black text-xs uppercase tracking-tight truncate">
                            {schedule.courseCode}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${cardStyles.badge}`}>
                            {schedule.sectionName}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold opacity-80 truncate mt-0.5" title={schedule.courseName}>
                          {schedule.courseName}
                        </p>
                      </div>

                      {cardHeight > 50 && (
                        <div className="flex items-center justify-between text-[9px] font-bold pt-1 border-t border-black/10 mt-1">
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-[#4e0a10] shrink-0" />
                            {schedule.roomName}
                          </span>
                          <span className="font-mono opacity-80 shrink-0">
                            {slotToTimeStr12h(schedule.startSlot)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </WeeklyTimetableGrid>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center font-sans">
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Weekly schedule for 7 days (Monday – Sunday)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-slate-300 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
          >
            Close Grid
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
