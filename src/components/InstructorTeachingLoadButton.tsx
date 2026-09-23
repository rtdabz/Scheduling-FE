import { designationLabel } from "../lib/designations";
import { useState } from "react";
import { Printer } from "lucide-react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import TeachingLoad from "../pages/ClassSchedules/SchedulerPanel/TeachingLoad";
import type {
  ApiCourseRecord,
  ApiDepartmentRecord,
  ApiFacultyRecord,
  ApiScheduleRecord,
  ApiSectionRecord,
  ApiSubjectRecord,
  ApiSemesterRecord,
  Department,
  Faculty,
  ScheduleItem,
  Section,
  Subject,
  Semester,
  UserSummary,
  YearLevel,
} from "../pages/ClassSchedules/SchedulerPanel/types";
import { normalizeAdministrativePost } from "../pages/ClassSchedules/SchedulerPanel/types";

interface InitialTeachingLoadData {
  active_semester: ApiSemesterRecord | null;
  departments: ApiDepartmentRecord[];
  faculties: ApiFacultyRecord[];
  schedules: ApiScheduleRecord[];
  sections: ApiSectionRecord[];
  courses?: ApiCourseRecord[];
  subjects?: ApiSubjectRecord[];
  users: UserSummary[];
}

interface TeachingLoadData {
  activeSemester: Semester | null;
  departments: Department[];
  faculties: Faculty[];
  schedules: ScheduleItem[];
  sections: Section[];
  subjects: Subject[];
  users: UserSummary[];
}

interface InstructorTeachingLoadButtonProps {
  facultyId: number;
}

const dayIndexes: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

const timeToSlot = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return Math.max(0, Math.floor(((hours * 60 + minutes) - 420) / 30));
};

const unitsOrUndefined = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeYearLevel = (value: string | number): YearLevel => {
  const year = Number(value);
  return year === 1 || year === 2 || year === 3 || year === 4 ? year : 1;
};

const mapInitialData = (data: InitialTeachingLoadData): TeachingLoadData => ({
  activeSemester: data.active_semester,
  departments: data.departments,
  users: data.users,
  faculties: data.faculties.map((faculty) => ({
    id: String(faculty.id),
    name: `${faculty.first_name} ${faculty.last_name}`,
    employmentType: faculty.employment_type,
    administrativeRole: normalizeAdministrativePost(faculty.administrative_role),
    designations: (faculty.designations ?? []).map(designationLabel),
    departmentId: faculty.department_id,
    departmentCode: faculty.department?.department_code,
    departmentName: faculty.department?.department_name,
    // The load sheet splits subjects by these bands. 0 is a real allowance
    // (an overload-only instructor has a Basic Load of 0), so none of them may
    // fall back when they are zero.
    maxUnits: unitsOrUndefined(faculty.max_units),
    deloadUnits: unitsOrUndefined(faculty.deload_units),
    overloadUnits: unitsOrUndefined(faculty.overload_units),
    probonoUnits: unitsOrUndefined(faculty.probono_units),
    requiredUnits: unitsOrUndefined(faculty.required_units),
    status: faculty.status,
  })),
  subjects: (data.courses ?? data.subjects ?? []).map((subject: ApiCourseRecord) => ({
    id: String(subject.id),
    code: subject.course_code ?? subject.subject_code ?? "",
    name: subject.course_name ?? subject.subject_name ?? "",
    units: subject.units,
    lectureHours: Number(subject.lecture_hours ?? 0),
    labHours: Number(subject.lab_hours ?? 0),
    category: subject.course_category ?? subject.subject_category ?? "major",
    semester: subject.semester,
    departmentId: subject.department_id,
    yearLevel: normalizeYearLevel(subject.year_level),
    roomTypeRequired: subject.room_type_required,
    status: subject.status ?? "active",
  })),
  sections: data.sections.map((section) => ({
    id: String(section.id),
    name: section.section_name,
    yearLevel: normalizeYearLevel(section.year_level),
    semester: section.semester,
    departmentId: section.department_id,
    semesterId: section.semester_id,
    status: section.status ?? "active",
  })),
  schedules: data.schedules.map((schedule) => {
    const startSlot = timeToSlot(schedule.start_time);
    const endSlot = timeToSlot(schedule.end_time);
    const course = schedule.course ?? schedule.subject;
    const courseId = schedule.course_id ?? schedule.subject_id;
    return {
      id: String(schedule.id),
      semesterId: Number(schedule.semester_id),
      departmentId: Number(schedule.department_id),
      courseId: String(courseId),
      courseCode: course?.course_code ?? course?.subject_code ?? "",
      courseName: course?.course_name ?? course?.subject_name ?? "",
      courseType: course?.course_category ?? course?.subject_category ?? "major",
      subjectId: String(schedule.subject_id),
      subjectCode: course?.subject_code ?? "",
      subjectName: course?.subject_name ?? "",
      subjectType: course?.subject_category ?? "major",
      lectureUnits: Number(course?.lecture_hours ?? 0),
      laboratoryUnits: Number(course?.lab_hours ?? 0),
      totalUnits: Number(course?.units ?? 0),
      sectionName: schedule.section?.section_name ?? "",
      // Building first, then the room: "Building 4 · CL 1".
      roomName: [schedule.room?.building, schedule.room?.room_code]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" · "),
      day: schedule.day,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      mode: schedule.mode ?? "on-site",
      facultyName: schedule.faculty
        ? `${schedule.faculty.first_name ?? ""} ${schedule.faculty.last_name ?? ""}`.trim()
        : null,
      facultyId: schedule.faculty_id ? String(schedule.faculty_id) : null,
      status: schedule.status,
      facultyConflictOverride: Boolean(schedule.faculty_conflict_override),
      dayIndex: dayIndexes[schedule.day] ?? 0,
      startSlot,
      durationSlots: Math.max(1, endSlot - startSlot),
      sectionId: String(schedule.section_id),
      roomId: String(schedule.room_id),
      isHybrid: Boolean(schedule.is_hybrid),
      preferredPattern: schedule.preferred_pattern ?? null,
    };
  }),
});

import { buildInstructorTimetablePdf } from "../pages/ClassSchedules/SchedulerPanel/instructorTimetablePdf";
import LoadingSpinner from "./ui/LoadingSpinner";

export default function InstructorTeachingLoadButton({ facultyId }: InstructorTeachingLoadButtonProps) {
  const { toast } = useToast();
  // Which button is working, so only that one shows a spinner; both stay disabled meanwhile.
  const [loadingAction, setLoadingAction] = useState<"schedule" | "load" | null>(null);
  const isLoading = loadingAction !== null;
  const [isPrinting, setIsPrinting] = useState(false);
  const [teachingLoadData, setTeachingLoadData] = useState<TeachingLoadData | null>(null);

  const handlePrintLoad = async () => {
    if (isLoading) return;
    setLoadingAction("load");

    try {
      const response = await api.get<InitialTeachingLoadData>("/initial-data");
      setTeachingLoadData(mapInitialData(response.data));
      setIsPrinting(true);
    } catch {
      toast.error("Print Failed", "Teaching-load data could not be loaded.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePrintGrid = async () => {
    if (isLoading) return;
    setLoadingAction("schedule");
    try {
      const response = await api.get<InitialTeachingLoadData>("/initial-data");
      const data = mapInitialData(response.data);
      const faculty = data.faculties.find((f) => Number(f.id) === Number(facultyId));
      if (!faculty) {
        toast.warning("Faculty Not Found", "Instructor information could not be located.");
        return;
      }
      const facultySchedules = data.schedules.filter((s) => Number(s.facultyId) === Number(facultyId));
      const dept = data.departments.find((d) => Number(d.id) === Number(faculty.departmentId));
      const blob = await buildInstructorTimetablePdf({
        title: `INSTRUCTOR: ${faculty.name.toUpperCase()}`,
        facultyName: faculty.name,
        departmentCode: dept?.department_code ?? faculty.departmentCode ?? "",
        departmentName: dept?.department_name ?? faculty.departmentName ?? "",
        departmentLogo: dept?.logo ?? null,
        schedules: facultySchedules,
        activeSemester: data.activeSemester,
      });
      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      toast.error("Print Failed", "Instructor timetable could not be generated.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handlePrintGrid()}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60 cursor-pointer"
        title="Print Instructor Schedule"
      >
        {loadingAction === "schedule" ? <LoadingSpinner size={14} className="animate-spin" /> : <Printer size={14} />}
        Print Schedule
      </button>

      <button
        type="button"
        onClick={() => void handlePrintLoad()}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 cursor-pointer"
        title="Print Official Teaching Load Form"
      >
        {loadingAction === "load" ? <LoadingSpinner size={14} className="animate-spin" /> : <Printer size={14} />}
        Print Load Sheet
      </button>

      {teachingLoadData && (
        <TeachingLoad
          faculties={teachingLoadData.faculties}
          allSchedules={teachingLoadData.schedules}
          isTeachingLoadOpen={isPrinting}
          setIsTeachingLoadOpen={setIsPrinting}
          sections={teachingLoadData.sections}
          activeSemester={teachingLoadData.activeSemester}
          users={teachingLoadData.users}
          departments={teachingLoadData.departments}
          selectedSectionId=""
          selectedFacultyId={String(facultyId)}
        />
      )}
    </div>
  );
}
