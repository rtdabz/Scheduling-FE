import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import TeachingLoad from "../pages/ClassSchedules/SchedulerPanel/TeachingLoad";
import type {
  ApiDepartmentRecord,
  ApiFacultyRecord,
  ApiScheduleRecord,
  ApiSectionRecord,
  ApiSubjectRecord,
  ApiTermRecord,
  Department,
  Faculty,
  ScheduleItem,
  Section,
  Subject,
  Term,
  UserSummary,
  YearLevel,
} from "../pages/ClassSchedules/SchedulerPanel/types";

interface InitialTeachingLoadData {
  active_term: ApiTermRecord | null;
  departments: ApiDepartmentRecord[];
  faculties: ApiFacultyRecord[];
  schedules: ApiScheduleRecord[];
  sections: ApiSectionRecord[];
  subjects: ApiSubjectRecord[];
  users: UserSummary[];
}

interface TeachingLoadData {
  activeTerm: Term | null;
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

const normalizeYearLevel = (value: string | number): YearLevel => {
  const year = Number(value);
  return year === 1 || year === 2 || year === 3 || year === 4 ? year : 1;
};

const mapInitialData = (data: InitialTeachingLoadData): TeachingLoadData => ({
  activeTerm: data.active_term,
  departments: data.departments,
  users: data.users,
  faculties: data.faculties.map((faculty) => ({
    id: String(faculty.id),
    name: `${faculty.first_name} ${faculty.last_name}`,
    employmentType: faculty.employment_type,
    departmentId: faculty.department_id,
    departmentCode: faculty.department?.department_code,
    departmentName: faculty.department?.department_name,
    maxUnits: faculty.max_units ? Number(faculty.max_units) : undefined,
    status: faculty.status,
  })),
  subjects: data.subjects.map((subject) => ({
    id: String(subject.id),
    code: subject.subject_code,
    name: subject.subject_name,
    units: subject.units,
    lectureHours: Number(subject.lecture_hours ?? 0),
    labHours: Number(subject.lab_hours ?? 0),
    category: subject.subject_category,
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
    termId: section.term_id,
    status: section.status ?? "active",
  })),
  schedules: data.schedules.map((schedule) => {
    const startSlot = timeToSlot(schedule.start_time);
    const endSlot = timeToSlot(schedule.end_time);
    return {
      id: String(schedule.id),
      termId: Number(schedule.term_id),
      departmentId: Number(schedule.department_id),
      subjectId: String(schedule.subject_id),
      subjectCode: schedule.subject?.subject_code ?? "",
      subjectName: schedule.subject?.subject_name ?? "",
      subjectType: schedule.subject?.subject_category ?? "major",
      lectureUnits: Number(schedule.subject?.lecture_hours ?? 0),
      laboratoryUnits: Number(schedule.subject?.lab_hours ?? 0),
      totalUnits: Number(schedule.subject?.units ?? 0),
      sectionName: schedule.section?.section_name ?? "",
      roomName: schedule.room?.room_name || schedule.room?.room_code || "",
      day: schedule.day,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      mode: schedule.mode ?? "on-site",
      facultyName: schedule.faculty
        ? `${schedule.faculty.first_name ?? ""} ${schedule.faculty.last_name ?? ""}`.trim()
        : null,
      facultyId: schedule.faculty_id ? String(schedule.faculty_id) : null,
      status: schedule.status,
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

export default function InstructorTeachingLoadButton({ facultyId }: InstructorTeachingLoadButtonProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [teachingLoadData, setTeachingLoadData] = useState<TeachingLoadData | null>(null);

  const handlePrint = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await api.get<InitialTeachingLoadData>("/initial-data");
      setTeachingLoadData(mapInitialData(response.data));
      setIsPrinting(true);
    } catch {
      toast.error("Print Failed", "Teaching-load data could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePrint()}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#4e0a10]/20 px-2.5 py-1.5 text-xs font-bold text-[#4e0a10] transition-colors hover:border-[#4e0a10]/40 hover:bg-[#4e0a10]/5 disabled:cursor-wait disabled:opacity-60"
        title="Print Teaching Load"
      >
        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
        Print
      </button>

      {teachingLoadData && (
        <TeachingLoad
          faculties={teachingLoadData.faculties}
          allSchedules={teachingLoadData.schedules}
          subjects={teachingLoadData.subjects}
          isTeachingLoadOpen={isPrinting}
          setIsTeachingLoadOpen={setIsPrinting}
          sections={teachingLoadData.sections}
          activeTerm={teachingLoadData.activeTerm}
          users={teachingLoadData.users}
          departments={teachingLoadData.departments}
          selectedSectionId=""
          selectedFacultyId={String(facultyId)}
        />
      )}
    </>
  );
}
