import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Printer } from "lucide-react";
import Modal from "./ui/Modal";
import { ModalButton } from "./ui/ModalForm";
import api from "../lib/api";
import { buildExportFilename } from "../lib/exportFile";
import { openPdfPreview } from "../lib/pdfPreview";
import { useToast } from "../context/ToastContext";
import { useActiveSemester } from "../hooks/useActiveSemester";
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
  filterVpaaApprovedSchedules,
  withCalendarDepartments,
  type CalendarDepartment,
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
  status: s.status,
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
  const { semester: activeSemester } = useActiveSemester();
  const [loading, setLoading] = useState(true);
  const [loadedFacultyId, setLoadedFacultyId] = useState<number | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printingRef = useRef(false);
  const [records, setRecords] = useState<ApiScheduleRecord[]>([]);
  const [departments, setDepartments] = useState<CalendarDepartment[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);

  useEffect(() => {
    if (!isOpen || !facultyId) return;

    let isMounted = true;

    const fetchFacultySchedules = async () => {
      setLoading(true);
      setLoadedFacultyId(null);
      setRecords([]);

      try {
        const [res, departmentRes] = await Promise.all([
          api.get<ApiScheduleRecord[]>("/schedules", {
            params: { faculty_id: facultyId, semester_id: "active", per_page: 1000, view: "gantt" },
          }),
          api.get<CalendarDepartment[]>("/departments").catch(() => ({ data: [] })),
        ]);
        if (!isMounted) return;

        setLoadedFacultyId(facultyId);
        setDepartments(Array.isArray(departmentRes.data) ? departmentRes.data : []);
        setRecords(filterVpaaApprovedSchedules(res.data ?? []).filter(
          (s) => s.faculty_id !== null && Number(s.faculty_id) === Number(facultyId)
        ));
      } catch {
        if (!isMounted) return;
        toast.error("Error", "Failed to load instructor timetable.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchFacultySchedules();

    return () => {
      isMounted = false;
    };
  }, [isOpen, facultyId, toast]);

  const ganttSchedules = useMemo(() => withCalendarDepartments(records.map(toCalendarSchedule), departments), [records, departments]);
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
    if (!facultyName || loading || loadedFacultyId !== facultyId || printingRef.current || records.length === 0) return;
    printingRef.current = true;
    setIsPrinting(true);
    const preview = openPdfPreview();
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
        activeSemester,
      });

      await preview.show(blob, buildExportFilename('pdf', 'instructor-timetable', facultyName));
    } catch {
      preview.close();
      toast.error("Print Failed", "Could not generate instructor timetable PDF.");
    } finally {
      printingRef.current = false;
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={`${facultyName} - View Schedule`}
        description={departmentName || "Instructor Schedule"}
        icon={<Calendar size={18} />}
        size="xl"
        className="h-[92dvh] !max-w-6xl"
        bodyClassName="flex flex-col !overflow-hidden p-3 [contain:layout_paint]"
        footerClassName="!justify-between"
        headerActions={<>
          <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">
            {records.length} Assigned Class{records.length !== 1 ? "es" : ""}
          </span>
          <button
            type="button"
            onClick={handlePrintTimetable}
            disabled={loading || loadedFacultyId !== facultyId || isPrinting || records.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-[#4e0a10] transition-colors hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isPrinting ? "Preparing..." : "Print Timetable"}</span>
          </button>
        </>}
        footer={<>
          <p className="text-xs text-slate-500">Weekly schedule, Monday to Sunday</p>
          <ModalButton onClick={onClose}>Close</ModalButton>
        </>}
      >
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
      </Modal>
      <ScheduleDetailModal
        schedule={selectedSchedule}
        allSchedules={ganttSchedules}
        overlaps={ganttOverlaps}
        onClose={() => setSelectedSchedule(null)}
        onSelect={setSelectedSchedule}
      />
    </>
  );
}
