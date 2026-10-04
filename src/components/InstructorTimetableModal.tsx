import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Printer, X, CheckCircle2 } from "lucide-react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { getCachedData } from "../lib/dataCache";
import { gridOpeningMinutes, slotCount, slotMinutes } from "../lib/timeGrid";
import Skeleton from "./ui/Skeleton";
import { scheduleLocationLabel } from "../lib/scheduleLocation";
import { buildInstructorTimetablePdf, type InstructorTimetableMeeting } from "../pages/ClassSchedules/SchedulerPanel/instructorTimetablePdf";
import MasterGantt from "../pages/vpaa/calendar/MasterGantt";
import ScheduleDetailModal from "../pages/vpaa/calendar/ScheduleDetailModal";
import {
  buildGanttDays,
  buildTimeWindow,
  findOverlaps,
  type CalendarSchedule,
  type StandardHours,
} from "../pages/vpaa/calendar/ganttLayout";

interface ApiScheduleRecord {
  id: number;
  semester_id: number;
  section_id: number;
  course_id?: number | null;
  subject_id?: number | null;
  faculty_id?: number | null;
  room_id: number | null;
  department_id: number;
  day: string;
  start_time: string;
  end_time: string;
  mode?: string;
  meeting_type?: "lecture" | "laboratory" | null;
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
    id?: number;
    section_name?: string;
  };
  room?: {
    id?: number;
    room_code?: string;
    building?: string;
  };
  faculty?: { id?: number; first_name?: string; last_name?: string } | null;
  department?: CalendarSchedule["department"];
}

interface InstructorTimetableModalProps {
  facultyId: number;
  facultyName: string;
  departmentName?: string;
  departmentLogo?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const toCalendarSchedule = (s: ApiScheduleRecord): CalendarSchedule => ({
  id: s.id,
  day: s.day,
  start_time: s.start_time,
  end_time: s.end_time,
  meeting_type: s.meeting_type ?? "lecture",
  mode: s.mode ?? "on-site",
  course_id: s.course_id ?? s.subject_id ?? null,
  department_id: s.department_id ?? null,
  department: s.department ?? null,
  room_id: s.room_id ?? null,
  room: s.room?.room_code ? { id: s.room.id ?? s.room_id ?? 0, room_code: s.room.room_code, building: s.room.building ?? null } : null,
  faculty_id: s.faculty_id ?? null,
  faculty: s.faculty ? { id: s.faculty.id ?? s.faculty_id ?? 0, first_name: s.faculty.first_name ?? "", last_name: s.faculty.last_name ?? "" } : null,
  section_id: s.section_id ?? null,
  section: { id: s.section?.id ?? s.section_id ?? 0, section_name: s.section?.section_name ?? "", department_id: s.department_id },
  course: {
    course_code: s.course?.course_code ?? s.subject?.course_code ?? s.subject?.subject_code ?? "",
    course_name: s.course?.course_name ?? s.subject?.course_name ?? s.subject?.subject_name ?? "",
    units: s.course?.units ?? s.subject?.units,
  },
});

export default function InstructorTimetableModal({
  facultyId,
  facultyName,
  departmentName,
  departmentLogo,
  isOpen,
  onClose,
}: InstructorTimetableModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ApiScheduleRecord[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);

  useEffect(() => {
    if (!isOpen || !facultyId) return;

    let isMounted = true;

    const fetchFacultySchedules = async () => {
      const cached = getCachedData<ApiScheduleRecord[]>("global:schedules");
      if (!cached) {
        setLoading(true);
      }

      try {
        const res = await api.get<ApiScheduleRecord[]>("/schedules", {
          params: { faculty_id: facultyId, semester_id: "active", per_page: 1000 },
        });
        if (!isMounted) return;

        setRecords((res.data ?? []).filter(
          (s) => s.faculty_id !== null && Number(s.faculty_id) === Number(facultyId)
        ));
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

  const ganttSchedules = useMemo(() => records.map(toCalendarSchedule), [records]);
  const ganttDays = useMemo(() => buildGanttDays(ganttSchedules, "none", ALL_DAYS), [ganttSchedules]);
  const ganttStandardHours = useMemo<StandardHours>(() => {
    const opening = gridOpeningMinutes();
    return { opening, closing: opening + slotCount() * slotMinutes(), slotMinutes: slotMinutes() };
  }, []);
  const ganttTimeWindow = useMemo(
    () => buildTimeWindow(ganttStandardHours, ganttSchedules),
    [ganttStandardHours, ganttSchedules],
  );
  const ganttOverlaps = useMemo(() => findOverlaps(ganttSchedules), [ganttSchedules]);

  const handlePrintTimetable = async () => {
    if (!facultyName) return;

    try {
      const pdfSchedules: InstructorTimetableMeeting[] = records.map((s) => ({
        courseCode: s.course?.course_code ?? s.subject?.course_code ?? s.subject?.subject_code ?? "SUBJECT",
        courseName: s.course?.course_name ?? s.subject?.course_name ?? s.subject?.subject_name ?? "",
        roomName: scheduleLocationLabel(s.mode, s.room?.room_code),
        day: s.day,
        startTime: s.start_time,
        endTime: s.end_time,
        sectionName: s.section?.section_name ?? "SEC",
        mode: s.mode ?? "on-site",
        meetingType: s.meeting_type ?? null,
      }));

      const blob = await buildInstructorTimetablePdf({
        title: `INSTRUCTOR: ${facultyName.toUpperCase()}`,
        facultyName,
        departmentName: departmentName || "",
        departmentLogo: departmentLogo ?? null,
        schedules: pdfSchedules,
      });

      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      toast.error("Print Failed", "Could not generate instructor timetable PDF.");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200 font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[92vh] animate-in zoom-in-95 duration-200">
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
                {records.length} Assigned Class{records.length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePrintTimetable}
              disabled={loading || records.length === 0}
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

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-3 bg-slate-50/30 [contain:layout_paint]">
          {loading ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6" aria-busy="true" aria-label="Loading instructor timetable">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : (
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
              className="h-full min-h-[420px]"
            />
          )}
        </div>

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
            Close
          </button>
        </div>
      </div>
      <ScheduleDetailModal
        schedule={selectedSchedule}
        allSchedules={ganttSchedules}
        overlaps={ganttOverlaps}
        onClose={() => setSelectedSchedule(null)}
        onSelect={setSelectedSchedule}
      />
    </div>,
    document.body
  );
}
