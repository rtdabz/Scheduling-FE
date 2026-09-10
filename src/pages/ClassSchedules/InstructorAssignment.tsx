import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  UserMinus,
} from "lucide-react";
import axios from "axios";
import api from "../../lib/api";
import { yearLevelLabel } from "../../lib/termLabel";
import { useToast } from "../../context/ToastContext";
import Skeleton from "../../components/ui/Skeleton";
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from "../../lib/dataCache";
import { apiErrorMessage } from "../../lib/apiError";
import { overloadConfirmationFrom } from "../../lib/overloadConfirmation";
import type { LoadTier, OverloadConfirmation } from "../../lib/overloadConfirmation";
import OverloadConfirmationModal from "../../components/faculty/OverloadConfirmationModal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import WeeklyTimetableGrid from "../../components/scheduling/WeeklyTimetableGrid";
import { gridOpeningMinutes, slotCount, slotMinutes } from "../../lib/timeGrid";
import WorkflowGuideButton from "../../components/help/WorkflowGuideButton";
import { useWorkflowGuide } from "../../hooks/useWorkflowGuide";
import FacultyModal from "./SchedulerPanel/Modals/FacultyModal";
import type {
  Faculty,
  FacultyAssignmentPopupState,
  ScheduleItem,
  Subject,
} from "./SchedulerPanel/types";
import { INSTRUCTOR_ASSIGNABLE_STATUSES } from "./SchedulerPanel/types";

interface StoredUser {
  department_id?: number | null;
  program_id?: number | null;
  role?: string;
}

interface ApiErrorResponse {
  message?: string;
}

interface ApiDepartment {
  id: number;
  department_code: string;
  department_name: string;
  logo?: string | null;
}

interface ApiTerm {
  id: number;
  academic_year: string;
  semester: string;
  is_active: boolean | number;
}

interface ApiSubject {
  id: number;
  course_code?: string;
  subject_code: string;
  course_name?: string;
  subject_name: string;
  course_category?: string;
  subject_category: string;
  units?: number | null;
  lecture_hours?: number | null;
  lab_hours?: number | null;
  semester?: string;
  year_level?: number | string | null;
  room_type_required?: string | null;
  status?: "active" | "inactive";
  department_id: number | null;
  teaching_department_id?: number | null;
  teaching_program_id?: number | null;
  program_id?: number | null;
  program?: { id?: number; code?: string; name?: string } | null;
  department?: ApiDepartment | null;
  teaching_department?: ApiDepartment | null;
}

interface ApiFaculty {
  id: number;
  first_name: string;
  last_name: string;
  department_id: number;
  program_id?: number | null;
  employment_type?: "full-time" | "part-time";
  status?: "active" | "inactive";
  // Live load, decorated by the API so the picker reads the same numbers the
  // overload gate projects from rather than guessing at a ceiling.
  max_units?: number | null;
  deload_units?: number | null;
  overload_units?: number | null;
  probono_units?: number | null;
  assigned_units?: number | null;
  profile_picture?: string | null;
  department?: ApiDepartment | null;
  program?: { id?: number; code?: string; name?: string } | null;
  required_units?: number | null;
  unit_ceiling?: number | null;
  availabilities?: Array<{
    day_index: number;
    start_time: string;
    end_time: string;
  }>;
}

interface ApiSchedule {
  id: number;
  term_id: number;
  department_id: number;
  course_id?: number;
  /** Legacy API alias retained for compatibility with older payloads. */
  subject_id?: number;
  faculty_id: number | null;
  faculty_assignment_done?: boolean | number;
  section_id?: number;
  room_id?: number | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: "on-site" | "online" | "field";
  is_hybrid?: boolean | number;
  preferred_pattern?: string | null;
  split_group_id?: string | null;
  meeting_type?: "lecture" | "laboratory" | null;
  meeting_index?: number | null;
  status: string;
  section?: { section_name?: string } | null;
  room?: { room_code?: string; building?: string | null } | null;
  faculty?: { first_name?: string; last_name?: string } | null;
}
interface ApiIncomingCourse {
  id: number;
  course_code: string;
  course_name: string;
  units?: number | null;
  year_level?: number | null;
  department?: ApiDepartment | null;
}

interface AssignmentResponse {
  active_term: ApiTerm | null;
  current_department_id?: number | null;
  departments: ApiDepartment[];
  subjects: ApiSubject[];
  faculties: ApiFaculty[];
  schedules: ApiSchedule[];
  incoming_courses?: ApiIncomingCourse[];
}

interface AssignmentWarning {
  rule: string;
  severity: string;
  message: string;
}

/** The load the instructor carries now that the assignment is committed. */
interface AssignmentLoad {
  faculty_id: number;
  projected_units: number;
  basic_load: number;
  unit_ceiling: number;
  tier: LoadTier;
  tier_label: string;
}

interface AssignmentUpdateResponse {
  schedule: ApiSchedule;
  schedules?: ApiSchedule[];
  /** Soft rules the assignment broke without being refused, e.g. a unit ceiling. */
  warnings?: AssignmentWarning[];
  load?: AssignmentLoad | null;
}

interface AssignmentSchedule extends ApiSchedule {
  subject: ApiSubject;
  department: ApiDepartment;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ASSIGNMENT_STATUSES = [...INSTRUCTOR_ASSIGNABLE_STATUSES, "finalized"];

const getStoredUser = (): StoredUser => {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return {};
  }
};

const formatTime = (value: string): string => {
  const [hourValue, minuteValue] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute === 0 ? `${displayHour} ${suffix}` : `${displayHour}:${minuteValue} ${suffix}`;
};

const timeToMinutes = (value: string): number => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const isPartTimeOutsideAvailability = (faculty: ApiFaculty, schedule: ApiSchedule): boolean => {
  if (faculty.employment_type !== "part-time") return false;

  const dayIndexMap: Record<string, number> = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };
  const dayIndex = dayIndexMap[schedule.day] ?? -1;

  // Mirrors RuleEngine's part_time_faculty_availability: the meeting has to fit
  // inside a recorded window for that day, and no window for the day - including
  // no windows at all - counts as outside availability. The old guess of
  // "weekday mornings only" disagreed with the server in both directions.
  const dayAvailabilities = (faculty.availabilities ?? []).filter(
    (a) => Number(a.day_index) === dayIndex
  );
  if (dayAvailabilities.length === 0) return true;

  const attemptStart = timeToMinutes(schedule.start_time);
  const attemptEnd = timeToMinutes(schedule.end_time);

  return !dayAvailabilities.some((window) => {
    const windowStart = timeToMinutes(window.start_time);
    const windowEnd = timeToMinutes(window.end_time);
    return attemptStart >= windowStart && attemptEnd <= windowEnd;
  });
};

const getRoomName = (schedule: ApiSchedule): string =>
  schedule.room?.room_code || "Room not set";

const getFacultyName = (schedule: ApiSchedule): string | null => {
  if (!schedule.faculty) return null;
  return [schedule.faculty.first_name, schedule.faculty.last_name].filter(Boolean).join(" ") || null;
};

function InstructorAssignmentTimetableSkeleton({
  hasFooter,
}: {
  hasFooter: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-busy="true" aria-label="Loading instructor assignments">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div>
            <Skeleton className="h-4 w-64 max-w-[70vw]" />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="h-2 w-24" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-40 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      </div>

      <div id="instructor-assignment-timetable" className="overflow-x-auto p-3">
        <div className="max-h-[calc(100vh-13.5rem)] overflow-auto rounded-xl bg-white">
          <WeeklyTimetableGrid
            days={DAYS}
            slotCount={slotCount()}
            minWidth={1120}
            isLoading
          >
            {[
              { id: "assignment-skeleton-1", dayIndex: 0, startSlot: 2, durationSlots: 4 },
              { id: "assignment-skeleton-2", dayIndex: 2, startSlot: 7, durationSlots: 3 },
              { id: "assignment-skeleton-3", dayIndex: 4, startSlot: 11, durationSlots: 4 },
            ].map((item) => (
              <div
                key={item.id}
                className="z-10 box-border flex h-full flex-col justify-between overflow-hidden rounded-xl border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 shadow-sm animate-pulse"
                style={{
                  gridColumn: item.dayIndex + 2,
                  gridRow: `${item.startSlot + 2} / span ${item.durationSlots}`,
                  height: `${item.durationSlots * 24 - 4}px`,
                }}
              >
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <Skeleton className="mb-1.5 h-3 w-16" />
                    <Skeleton className="mb-1 h-2.5 w-24" />
                    <Skeleton className="h-2 w-12" />
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <Skeleton className="h-3.5 w-12 rounded-full" />
                    <Skeleton className="h-3.5 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </WeeklyTimetableGrid>
        </div>
      </div>
      {hasFooter && (
        <div className="flex justify-end border-t border-slate-200 bg-slate-50/70 px-4 py-3">
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      )}
    </section>
  );
}

interface ClearSectionResponse {
  schedules_updated: number;
  courses_cleared: number;
  schedules: ApiSchedule[];
  faculties: ApiFaculty[];
}

interface InstructorAssignmentProps {
  assignmentLocked?: boolean;
  headerActions?: ReactNode;
  footerActions?: ReactNode;
  onWorkspaceStateChange?: (state: InstructorAssignmentWorkspaceState) => void;
  workflowGuideId?: string | null;
  onWorkflowReady?: () => void;
  refreshToken?: number;
}

export interface InstructorAssignmentWorkspaceState {
  selectedDepartmentId: number | null;
  scheduleIds: number[];
  allAssigned: boolean;
  assignmentDone: boolean;
}

export default function InstructorAssignment({ assignmentLocked, headerActions, footerActions, onWorkspaceStateChange, workflowGuideId = "instructor-assignment", onWorkflowReady, refreshToken = 0 }: InstructorAssignmentProps = {}) {
  const { toast } = useToast();
  const user = getStoredUser();
  const assignmentsCacheKey = `page:instructor-assignments:v5:${user.department_id ?? "all"}:${user.program_id ?? "all"}`;
  const cachedAssignmentData = getCachedData<AssignmentResponse>(assignmentsCacheKey);
  const [departments, setDepartments] = useState<ApiDepartment[]>(cachedAssignmentData?.departments ?? []);
  const [subjects, setSubjects] = useState<ApiSubject[]>(cachedAssignmentData?.subjects ?? []);
  const [faculties, setFaculties] = useState<ApiFaculty[]>(cachedAssignmentData?.faculties ?? []);
  const [schedules, setSchedules] = useState<ApiSchedule[]>(cachedAssignmentData?.schedules ?? []);
  const [incomingCourses, setIncomingCourses] = useState<ApiIncomingCourse[]>(cachedAssignmentData?.incoming_courses ?? []);
  const [activeTerm, setActiveTerm] = useState<ApiTerm | null>(cachedAssignmentData?.active_term ?? null);
  const [currentDepartmentId, setCurrentDepartmentId] = useState<number | null>(user.department_id ?? null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState("all");
  const [facultyAssignmentPopup, setFacultyAssignmentPopup] = useState<FacultyAssignmentPopupState | null>(null);
  // The assignment the server is asking about, kept whole so confirming replays
  // exactly what the user reviewed.
  const [overloadPrompt, setOverloadPrompt] = useState<{
    confirmation: OverloadConfirmation;
    schedule: AssignmentSchedule;
    facultyId: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(!hasCachedData(assignmentsCacheKey));
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingSection, setIsClearingSection] = useState(false);
  const [clearSectionTarget, setClearSectionTarget] = useState<{
    id: number;
    name: string;
    assignedCount: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<AssignmentWarning[]>([]);
  const instructorGuideSteps = useMemo(() => [
    { element: "#instructor-assignment-overview", title: "Review approved schedules", description: "This page shows approved classes that still need your instructors.", side: "bottom" as const },
    { element: '[data-tour="department-card"]', waitFor: "#instructor-assignment-departments", action: "click" as const, taskHint: "Click a department card to continue.", title: "Choose a department", description: "Open a department with classes that need your instructors.", side: "top" as const },
    { element: "#assignment-section-filter", action: "select" as const, taskHint: "Change the section filter to continue.", title: "Filter by section", description: "Show one section at a time when needed.", side: "bottom" as const },
    { element: '#instructor-assignment-timetable button[aria-label$="needs instructor"]:not([disabled])', waitFor: "#instructor-assignment-timetable", action: "click" as const, skipIfMissing: true, taskHint: "Click a highlighted class that needs an instructor.", title: "Select an unassigned class", description: "Choose a class without an instructor to see eligible faculty.", side: "top" as const },
  ], []);
  useWorkflowGuide({ id: "instructor-assignment", isReady: !isLoading && workflowGuideId === "instructor-assignment", steps: instructorGuideSteps, mission: "Staff the Classes" });

  useEffect(() => {
    if (!isLoading) onWorkflowReady?.();
  }, [isLoading, onWorkflowReady]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(assignmentsCacheKey);
      setIsLoading(shouldShowSkeleton);
      setError("");
      try {
        const data = await loadCachedData<AssignmentResponse>(assignmentsCacheKey, async () => {
          const response = await api.get<AssignmentResponse>("/instructor-assignments");
          return response.data;
        }, refreshToken > 0);

        if (!active) return;
        setDepartments(data.departments);
        setSubjects(data.subjects);
        setFaculties(data.faculties);
        setSchedules(data.schedules);
        setIncomingCourses(data.incoming_courses ?? []);
        setActiveTerm(data.active_term);
        setCurrentDepartmentId(data.current_department_id ?? user.department_id ?? null);
      } catch (loadError) {
        if (!active) return;
        const message = axios.isAxiosError<ApiErrorResponse>(loadError)
          ? loadError.response?.data?.message
          : null;
        setError(message || "Unable to load instructor assignment data.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [assignmentsCacheKey, refreshToken, user.department_id]);

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [Number(subject.id), subject])),
    [subjects],
  );
  const departmentMap = useMemo(
    () => new Map(departments.map((department) => [Number(department.id), department])),
    [departments],
  );

  const assignmentSchedules = useMemo<AssignmentSchedule[]>(() => schedules.flatMap((schedule) => {
    // schedules.course_id is the canonical database/API field. Some older
    // payloads used subject_id, so accept both without dropping valid rows.
    const courseId = Number(schedule.course_id ?? schedule.subject_id ?? 0);
    const subject = subjectMap.get(courseId);
    // Delegated schedules are owned by the source department while the course's
    // teaching department is the receiving department. Older payloads can omit
    // the schedule department relation, so retain the source department from the
    // course record as a compatibility fallback.
    const department = departmentMap.get(Number(schedule.department_id))
      ?? (subject?.department_id != null ? departmentMap.get(Number(subject.department_id)) : null)
      ?? subject?.department
      ?? null;
    if (
      !subject ||
      !department ||
      Number(subject.teaching_department_id ?? subject.department_id) !== Number(currentDepartmentId) ||
      !ASSIGNMENT_STATUSES.includes(schedule.status)
    ) {
      return [];
    }
    return [{ ...schedule, subject, department }];
  }), [currentDepartmentId, departmentMap, schedules, subjectMap]);

  const offeringDepartments = useMemo(() => departments
    .map((department) => ({
      department,
      schedules: assignmentSchedules.filter(
        (schedule) => Number(schedule.department_id) === Number(department.id),
      ),
    }))
    .filter((item) => (
      Number(item.department.id) !== Number(currentDepartmentId)
      && item.schedules.length > 0
    )), [assignmentSchedules, currentDepartmentId, departments]);

  const selectedDepartment = selectedDepartmentId
    ? departmentMap.get(selectedDepartmentId) ?? null
    : null;
  const departmentSchedules = useMemo(
    () => assignmentSchedules.filter(
      (schedule) => Number(schedule.department_id) === Number(selectedDepartmentId),
    ),
    [assignmentSchedules, selectedDepartmentId],
  );
  useEffect(() => {
    onWorkspaceStateChange?.({
      selectedDepartmentId,
      scheduleIds: departmentSchedules.map((schedule) => schedule.id),
      allAssigned: departmentSchedules.length > 0 && departmentSchedules.every((schedule) => schedule.faculty_id !== null),
      assignmentDone: departmentSchedules.length > 0 && departmentSchedules.every((schedule) => Boolean(schedule.faculty_assignment_done)),
    });
  }, [departmentSchedules, onWorkspaceStateChange, selectedDepartmentId]);
  const sections = [...new Set(departmentSchedules.map(
    (schedule) => schedule.section?.section_name || "Unspecified section",
  ))].sort();
  const visibleSchedules = departmentSchedules.filter((schedule) =>
    selectedSection === "all" || schedule.section?.section_name === selectedSection,
  );
  const clearableSectionSchedules = selectedSection === "all"
    ? []
    : visibleSchedules.filter((schedule) => (
        schedule.faculty_id !== null
        && schedule.status !== "finalized"
        && !Boolean(schedule.faculty_assignment_done)
      ));
  const scheduleLayouts = useMemo(() => {
    const layouts: Array<{
      schedule: AssignmentSchedule;
      dayIndex: number;
      startSlot: number;
      durationSlots: number;
      lane: number;
      laneCount: number;
    }> = [];

    DAYS.forEach((day, dayIndex) => {
      const daySchedules = visibleSchedules
        .filter((schedule) => schedule.day === day)
        .sort((left, right) => timeToMinutes(left.start_time) - timeToMinutes(right.start_time));
      const laneEndTimes: number[] = [];
      const dayLayouts = daySchedules.map((schedule) => {
        const startMinutes = timeToMinutes(schedule.start_time);
        const endMinutes = timeToMinutes(schedule.end_time);
        let lane = laneEndTimes.findIndex((endTime) => endTime <= startMinutes);
        if (lane === -1) {
          lane = laneEndTimes.length;
          laneEndTimes.push(endMinutes);
        } else {
          laneEndTimes[lane] = endMinutes;
        }

        return {
          schedule,
          dayIndex,
          startSlot: Math.max(0, Math.floor((startMinutes - gridOpeningMinutes()) / slotMinutes())),
          durationSlots: Math.max(1, Math.ceil((endMinutes - startMinutes) / slotMinutes())),
          lane,
        };
      });
      const laneCount = Math.max(1, laneEndTimes.length);
      layouts.push(...dayLayouts.map((layout) => ({ ...layout, laneCount })));
    });

    return layouts;
  }, [visibleSchedules]);
  const selectedSchedule = assignmentSchedules.find(
    (schedule) => String(schedule.id) === facultyAssignmentPopup?.scheduleId,
  ) ?? null;

  const modalSubjects = useMemo<Subject[]>(() => subjects.map((subject) => ({
    id: String(subject.id),
    code: subject.course_code ?? subject.subject_code,
    name: subject.course_name ?? subject.subject_name,
    units: Number(subject.units ?? 0),
    lectureHours: Number(subject.lecture_hours ?? 0),
    labHours: Number(subject.lab_hours ?? 0),
    category: (subject.course_category ?? subject.subject_category) === "major" ? "major" : "minor",
    semester: subject.semester === "2nd" || subject.semester === "summer" ? subject.semester : "1st",
    departmentId: subject.department_id,
    teachingDepartmentId: subject.teaching_department_id ?? null,
    teachingDepartmentCode: subject.teaching_department?.department_code,
    teachingDepartmentName: subject.teaching_department?.department_name,
    teachingProgramId: subject.teaching_program_id ?? null,
    programId: subject.program_id ?? null,
    programCode: subject.program?.code ?? null,
    yearLevel: ([1, 2, 3, 4].includes(Number(subject.year_level)) ? Number(subject.year_level) : 1) as 1 | 2 | 3 | 4,
    roomTypeRequired: subject.room_type_required === "laboratory"
      || subject.room_type_required === "field"
      || subject.room_type_required === "online"
      ? subject.room_type_required
      : "lecture",
    status: subject.status ?? "active",
  })), [subjects]);

  const modalFaculties = useMemo<Faculty[]>(() => faculties.map((faculty) => ({
    id: String(faculty.id),
    name: `${faculty.first_name} ${faculty.last_name}`,
    profilePicture: faculty.profile_picture ?? null,
    employmentType: faculty.employment_type,
    departmentId: faculty.department_id,
    departmentCode: faculty.department?.department_code,
    departmentName: faculty.department?.department_name,
    programId: faculty.program_id ?? null,
    programCode: faculty.program?.code ?? null,
    maxUnits: faculty.max_units ?? undefined,
    deloadUnits: faculty.deload_units ?? undefined,
    overloadUnits: faculty.overload_units ?? undefined,
    probonoUnits: faculty.probono_units ?? undefined,
    assignedUnits: faculty.assigned_units ?? undefined,
    requiredUnits: faculty.required_units ?? undefined,
    unitCeiling: faculty.unit_ceiling ?? undefined,
    status: faculty.status,
    availabilities: (faculty.availabilities ?? []).map((availability, index) => ({
      id: index,
      faculty_id: faculty.id,
      ...availability,
    })),
  })), [faculties]);

  const modalSchedules = useMemo<ScheduleItem[]>(() => assignmentSchedules.map((schedule) => {
    const subject = schedule.subject;
    const startMinutes = timeToMinutes(schedule.start_time);
    const endMinutes = timeToMinutes(schedule.end_time);
    return {
      id: String(schedule.id),
      termId: Number(schedule.term_id),
      departmentId: Number(schedule.department_id),
      courseId: String(subject.id),
      subjectId: String(subject.id),
      courseCode: subject.course_code ?? subject.subject_code,
      subjectCode: subject.course_code ?? subject.subject_code,
      courseName: subject.course_name ?? subject.subject_name,
      subjectName: subject.course_name ?? subject.subject_name,
      courseType: (subject.course_category ?? subject.subject_category) === "major" ? "major" : "minor",
      subjectType: (subject.course_category ?? subject.subject_category) === "major" ? "major" : "minor",
      lectureUnits: Number(subject.lecture_hours ?? 0),
      laboratoryUnits: Number(subject.lab_hours ?? 0),
      totalUnits: Number(subject.units ?? 0),
      sectionName: schedule.section?.section_name ?? "Unspecified section",
      roomName: getRoomName(schedule),
      day: schedule.day,
      startTime: formatTime(schedule.start_time),
      endTime: formatTime(schedule.end_time),
      mode: schedule.mode ?? "on-site",
      facultyName: getFacultyName(schedule),
      facultyId: schedule.faculty_id === null ? null : String(schedule.faculty_id),
      facultyAssignmentDone: Boolean(schedule.faculty_assignment_done),
      status: schedule.status as ScheduleItem["status"],
      dayIndex: DAYS.indexOf(schedule.day),
      startSlot: Math.max(0, Math.floor((startMinutes - gridOpeningMinutes()) / slotMinutes())),
      durationSlots: Math.max(1, Math.ceil((endMinutes - startMinutes) / slotMinutes())),
      sectionId: String(schedule.section_id ?? schedule.section?.section_name ?? ""),
      roomId: schedule.room_id === null || schedule.room_id === undefined ? "" : String(schedule.room_id),
      isHybrid: Boolean(schedule.is_hybrid),
      preferredPattern: schedule.preferred_pattern ?? null,
      splitGroupId: schedule.split_group_id ?? null,
      meetingType: schedule.meeting_type ?? null,
      meetingIndex: schedule.meeting_index ?? 1,
    };
  }), [assignmentSchedules]);

  const openDepartment = (departmentId: number) => {
    if (assignmentLocked) return;
    setSelectedDepartmentId(departmentId);
    setSelectedSection("all");
  };

  const openAssignment = (schedule: AssignmentSchedule) => {
    if (assignmentLocked || schedule.status === "finalized" || Boolean(schedule.faculty_assignment_done)) return;
    setFacultyAssignmentPopup({
      scheduleId: String(schedule.id),
      facultyId: schedule.faculty_id ? String(schedule.faculty_id) : "",
    });
    setError("");
    setWarnings([]);
  };

  const closeAssignment = () => {
    if (isSaving) return;
    setFacultyAssignmentPopup(null);
  };

  /**
   * The one request path. An overload is confirmed by replaying the same call with
   * the flag set, so the assignment that gets written is the one the confirmation
   * described.
   */
  const submitAssignment = async (
    schedule: AssignmentSchedule,
    facultyId: number | null,
    confirmOverload: boolean
  ) => {
    setIsSaving(true);
    setError("");
    try {
      const response = await api.patch<AssignmentUpdateResponse>(`/instructor-assignments/${schedule.id}`, {
        faculty_id: facultyId,
        ...(confirmOverload ? { confirm_overload: true } : {}),
      });
      // Soft rules do not refuse the assignment, so the reason has to be shown
      // after the save rather than blocking it.
      setWarnings(response.data.warnings ?? []);

      const load = response.data.load;
      // The picker's load hint is now a save behind, so move it forward here
      // instead of refetching the whole page payload.
      const nextFaculties = load
        ? faculties.map((faculty) =>
            faculty.id === load.faculty_id
              ? { ...faculty, assigned_units: load.projected_units }
              : faculty
          )
        : faculties;

      const updatedSchedules = response.data.schedules ?? [response.data.schedule];
      const updatedScheduleMap = new Map(updatedSchedules.map((updated) => [updated.id, updated]));
      const nextSchedules = schedules.map((current) => updatedScheduleMap.get(current.id) ?? current);

      setFaculties(nextFaculties);
      setSchedules(nextSchedules);
      setCachedData<AssignmentResponse>(assignmentsCacheKey, {
        active_term: activeTerm,
        current_department_id: currentDepartmentId,
        departments,
        subjects,
        faculties: nextFaculties,
        schedules: nextSchedules,
        incoming_courses: incomingCourses,
      });

      setOverloadPrompt(null);
      setFacultyAssignmentPopup(null);
      toast.success(
        facultyId === null ? "Instructor Removed" : "Instructor Assigned",
        facultyId === null
          ? "The instructor assignment was removed successfully."
          : "The instructor was assigned successfully.",
      );
    } catch (err) {
      // Past the Basic Load the server asks rather than refuses, so this is a
      // question to put to the user — not an error to report.
      const confirmation = overloadConfirmationFrom(err);
      if (confirmation && facultyId !== null) {
        setOverloadPrompt({ confirmation, schedule, facultyId });
        return;
      }

      setOverloadPrompt(null);
      setError(apiErrorMessage(err, "Unable to assign the instructor. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const saveAssignment = () => {
    if (!selectedSchedule || !facultyAssignmentPopup?.facultyId) {
      setError("Select an instructor before saving.");
      return;
    }

    void submitAssignment(selectedSchedule, Number(facultyAssignmentPopup.facultyId), false);
  };

  const removeAssignment = () => {
    if (!selectedSchedule?.faculty_id) return;
    void submitAssignment(selectedSchedule, null, false);
  };

  const requestClearSection = () => {
    const sectionId = Number(clearableSectionSchedules[0]?.section_id ?? 0);
    if (!sectionId || selectedSection === "all" || clearableSectionSchedules.length === 0) return;
    setClearSectionTarget({
      id: sectionId,
      name: selectedSection,
      assignedCount: clearableSectionSchedules.length,
    });
  };

  const clearSectionInstructors = async () => {
    if (!clearSectionTarget || isClearingSection) return;
    setIsClearingSection(true);
    setError("");
    try {
      const response = await api.delete<ClearSectionResponse>(
        `/instructor-assignments/sections/${clearSectionTarget.id}`,
      );
      const updatedScheduleMap = new Map(response.data.schedules.map((schedule) => [schedule.id, schedule]));
      const updatedFacultyMap = new Map(response.data.faculties.map((faculty) => [faculty.id, faculty]));
      const nextSchedules = schedules.map((schedule) => updatedScheduleMap.get(schedule.id) ?? schedule);
      const nextFaculties = faculties.map((faculty) => updatedFacultyMap.get(faculty.id) ?? faculty);

      setSchedules(nextSchedules);
      setFaculties(nextFaculties);
      setCachedData<AssignmentResponse>(assignmentsCacheKey, {
        active_term: activeTerm,
        current_department_id: currentDepartmentId,
        departments,
        subjects,
        faculties: nextFaculties,
        schedules: nextSchedules,
        incoming_courses: incomingCourses,
      });
      setClearSectionTarget(null);
      toast.success(
        "Instructors Cleared",
        `${response.data.courses_cleared} course ${response.data.courses_cleared === 1 ? "assignment was" : "assignments were"} cleared for ${selectedSection}.`,
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Unable to clear the section's instructors. Please try again."));
    } finally {
      setIsClearingSection(false);
    }
  };

  const handlePopupFacultyChange = (facultyId: string) => {
    if (!facultyAssignmentPopup) return;
    setFacultyAssignmentPopup({ ...facultyAssignmentPopup, facultyId });
    setError("");
  };

  const checkModalFacultyConflict = (facultyId: string, scheduleId: string): string | null => {
    const faculty = faculties.find((item) => String(item.id) === facultyId);
    const schedule = assignmentSchedules.find((item) => String(item.id) === scheduleId);
    if (!faculty || !schedule) return null;

    if (isPartTimeOutsideAvailability(faculty, schedule)) {
      return `Outside the instructor's availability on ${schedule.day}.`;
    }

    const start = timeToMinutes(schedule.start_time);
    const end = timeToMinutes(schedule.end_time);
    const conflict = schedules.some((item) => (
      String(item.id) !== scheduleId
      && String(item.faculty_id ?? "") === facultyId
      && Number(item.term_id) === Number(schedule.term_id)
      && item.day === schedule.day
      && start < timeToMinutes(item.end_time)
      && timeToMinutes(item.start_time) < end
    ));

    return conflict ? "Instructor has an overlapping class at this time." : null;
  };

  if (isLoading && selectedDepartmentId !== null) {
    return (
      <InstructorAssignmentTimetableSkeleton
        hasFooter={Boolean(footerActions)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading instructor assignments">
        <header id="instructor-assignment-overview" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.3fr_1fr]">
          <div className="flex items-start gap-3">
            <Skeleton className="h-11 w-11 flex-shrink-0 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="mt-2 h-4 w-56 max-w-full" />
              <Skeleton className="mt-2 h-3 w-full max-w-xl" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-[4.25rem] rounded-xl" />
            <Skeleton className="h-[4.25rem] rounded-xl" />
            <Skeleton className="h-[4.25rem] rounded-xl" />
          </div>
        </header>

        <section>
          <div id="instructor-assignment-departments" className="mb-3 flex items-end justify-between gap-3">
            <div>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-2 h-3 w-96 max-w-full" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>

          <div className="grid auto-rows-[minmax(8rem,auto)] gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.25fr_1fr_0.85fr]">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${
                  index === 1 || index === 4 ? "xl:row-span-2" : ""
                } ${index === 5 ? "xl:col-span-2" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton className="h-5 w-5 rounded-md" />
                </div>
                <Skeleton className="mt-4 h-6 w-16" />
                <Skeleton className="mt-2 h-3 w-40" />
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={selectedDepartment ? "space-y-3" : "space-y-6"}>
      {!selectedDepartment && (
        <header id="instructor-assignment-overview" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.3fr_1fr]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[#C9952A]/25 bg-[#C9952A]/10 text-[#4e0a10]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active assignment term</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 text-xs font-bold shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {activeTerm ? `${activeTerm.semester} Semester · AY ${activeTerm.academic_year}` : "No active term selected"}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">
                Use this workspace to assign instructors from your department to approved schedules for courses assigned to your department.
              </p>
              {workflowGuideId === "instructor-assignment" && <WorkflowGuideButton guideId="instructor-assignment" />}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Departments</p>
              <p className="mt-1 text-lg font-black text-slate-900">{offeringDepartments.length}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Pending</p>
              <p className="mt-1 text-lg font-black text-amber-700">
                {assignmentSchedules.filter((schedule) => !schedule.faculty_id).length}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Assigned</p>
              <p className="mt-1 text-lg font-black text-emerald-700">
                {assignmentSchedules.filter((schedule) => schedule.faculty_id).length}
              </p>
            </div>
          </div>
        </header>
      )}

      {error && !selectedSchedule && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-bold">Assignment saved with a warning</p>
              {warnings.map((warning) => (
                <p key={warning.rule + warning.message} className="text-xs font-semibold">
                  {warning.message}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setWarnings([])}
              className="text-xs font-bold text-amber-700 hover:text-amber-900"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!selectedDepartment ? (
        <section>
          <div id="instructor-assignment-departments" className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Receiving Departments</h2>
              <p className="text-xs font-medium text-slate-500">Open a source department timetable to assign your instructors to courses assigned to your department.</p>
            </div>
            <span className="whitespace-nowrap text-xs font-bold text-slate-500">{offeringDepartments.length} departments</span>
          </div>

          {offeringDepartments.length === 0 ? (
            <div className="py-10 text-center">
              {incomingCourses.length > 0 ? (
                <div className="mx-auto max-w-3xl text-left">
                  <h3 className="text-sm font-black text-[#4e0a10]">Incoming courses awaiting schedules</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">These courses were assigned to your department, but no approved schedule exists yet. Create the section schedule in Schedule Builder first; it will then appear here for instructor assignment.</p>
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {incomingCourses.map((course) => (
                      <div key={course.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                        <div><p className="text-sm font-black text-slate-900">{course.course_code} · {course.course_name}</p><p className="text-xs text-slate-500">Source: {course.department?.department_code ?? course.department?.department_name ?? 'Shared'} · {course.units ?? 0} units · {yearLevelLabel(course.year_level)}</p></div>
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">Schedule required</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <><h3 className="text-sm font-black text-[#4e0a10]">No incoming courses or approved schedules yet.</h3><p className="mt-1 text-xs font-medium text-slate-500">Assigned courses will appear here after a schedule is created and approved.</p></>}
            </div>
          ) : (
            <div className="grid auto-rows-[minmax(8rem,auto)] gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.25fr_1fr_0.85fr]">
              {offeringDepartments.map(({ department, schedules: items }) => {
                const pending = items.filter((schedule) => !schedule.faculty_id).length;
                const assigned = items.length - pending;
                return (
                  <button
                    key={department.id}
                    type="button"
                    data-tour="department-card"
                    onClick={() => openDepartment(department.id)}
                    className={`group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#C9952A]/60 hover:shadow-md ${
                      items.length >= 4 ? "xl:row-span-2" : ""
                    } ${items.length >= 7 ? "xl:col-span-2" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-[#4e0a10] text-[#E8D5C4]">
                        {department.logo ? <img src={department.logo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5" />}
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#C9952A]" />
                    </div>
                    <div className="mt-4">
                      <div className="text-lg font-black text-[#4e0a10]">{department.department_code}</div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">{department.department_name}</div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-bold">
                      <span className="text-slate-500">{items.length} offered-subject schedules</span>
                      <span className={pending ? "text-amber-700" : "text-emerald-700"}>
                        {pending ? `${pending} pending` : `${assigned} assigned`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => !assignmentLocked && setSelectedDepartmentId(null)}
                disabled={Boolean(assignmentLocked)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#C9952A] hover:text-[#4e0a10]"
                aria-label="Back to departments"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="flex items-center gap-2 text-base font-black text-[#4e0a10]">
                  <CalendarDays className="h-4 w-4 text-[#C9952A]" />
                  {selectedDepartment.department_code} Instructor Assignment
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500">
                  {activeTerm && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      {activeTerm.semester} Semester &bull; AY {activeTerm.academic_year}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C9952A]" /> Needs instructor</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Assigned</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {headerActions}
              <label className="sr-only" htmlFor="assignment-section-filter">Section</label>
              <select
                id="assignment-section-filter"
                value={selectedSection}
                onChange={(event) => setSelectedSection(event.target.value)}
                disabled={assignmentLocked}
                className="h-9 min-w-40 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#C9952A]"
              >
                <option value="all">All sections</option>
                {sections.map((section) => <option key={section}>{section}</option>)}
              </select>
              {selectedSection !== "all" && (
                <button
                  type="button"
                  onClick={requestClearSection}
                  disabled={Boolean(assignmentLocked) || isSaving || isClearingSection || clearableSectionSchedules.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Remove every instructor assignment you can manage in this section"
                >
                  <UserMinus className="h-4 w-4" />
                  Clear Instructor
                </button>
              )}
              <span className="flex h-9 items-center rounded-xl bg-[#4e0a10] px-3 text-xs font-bold text-[#E8D5C4]">
                {departmentSchedules.filter((schedule) => schedule.faculty_id).length} of {departmentSchedules.length} assigned
              </span>
            </div>
          </div>

          <div id="instructor-assignment-timetable" className="overflow-x-auto p-3">
            <div className="max-h-[calc(100vh-13.5rem)] overflow-auto rounded-xl bg-white">
              <WeeklyTimetableGrid
                days={DAYS}
                slotCount={slotCount()}
                minWidth={1120}
                getDayCount={(dayIndex) => visibleSchedules.filter(
                  (schedule) => schedule.day === DAYS[dayIndex],
                ).length}
              >
                {scheduleLayouts.map(({ schedule, dayIndex, startSlot, durationSlots, lane, laneCount }) => {
                  const facultyName = getFacultyName(schedule);
                  const isFinalized = schedule.status === "finalized" || (assignmentLocked ?? Boolean(schedule.faculty_assignment_done));
                  return (
                    <button
                      key={schedule.id}
                      type="button"
                      onClick={() => openAssignment(schedule)}
                      disabled={assignmentLocked || isFinalized}
                      aria-label={`${schedule.subject.subject_code}, ${schedule.section?.section_name}, ${formatTime(schedule.start_time)} to ${formatTime(schedule.end_time)}, ${facultyName || "needs instructor"}`}
                      className={`z-10 m-0.5 flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border-2 border-l-4 px-2 py-1.5 text-left shadow-sm transition-all hover:shadow-md ${
                        facultyName
                          ? "border-emerald-200 border-l-emerald-600 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                          : "border-amber-200 border-l-[#C9952A] bg-amber-50 text-amber-950 hover:bg-amber-100"
                      } ${assignmentLocked || isFinalized ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: `${startSlot + 2} / span ${durationSlots}`,
                        height: `${durationSlots * 24 - 4}px`,
                        width: `calc(${100 / laneCount}% - 4px)`,
                        transform: `translateX(${lane * 100}%)`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[10px] font-black">{schedule.subject.subject_code} · {schedule.section?.section_name}</span>
                        {facultyName && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-700" />}
                      </div>
                      <div className="mt-0.5 truncate text-[9px] font-semibold opacity-75">
                        {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)} · {getRoomName(schedule)}
                      </div>
                      <div className="mt-0.5 truncate text-[9px] font-bold">{facultyName || "Assign instructor"}</div>
                    </button>
                  );
                })}
              </WeeklyTimetableGrid>
            </div>
          </div>
          {footerActions && (
            <div className="flex justify-end border-t border-slate-200 bg-slate-50/70 px-4 py-3">
              {footerActions}
            </div>
          )}
        </section>
      )}

      <FacultyModal
        facultyAssignmentPopup={facultyAssignmentPopup}
        facultyActionSlotId={isSaving && facultyAssignmentPopup ? facultyAssignmentPopup.scheduleId : null}
        schedules={modalSchedules}
        popupConflictWarning={facultyAssignmentPopup?.facultyId
          ? checkModalFacultyConflict(facultyAssignmentPopup.facultyId, facultyAssignmentPopup.scheduleId) ?? ""
          : ""}
        popupValidationError={error}
        setFacultyAssignmentPopup={(value) => {
          if (isSaving) return;
          setFacultyAssignmentPopup(value);
          if (value === null) closeAssignment();
        }}
        handlePopupFacultyChange={handlePopupFacultyChange}
        handleAssignFaculty={(event) => {
          event.preventDefault();
          saveAssignment();
        }}
        handleRemoveFaculty={removeAssignment}
        canManageScheduleFaculty={() => !assignmentLocked}
        getFacultyRestrictionMessage={() => "Only the assigned teaching department can change this instructor."}
        checkFacultyConflict={checkModalFacultyConflict}
        subjects={modalSubjects}
        faculties={modalFaculties}
      />

      <ConfirmModal
        isOpen={clearSectionTarget !== null}
        eyebrow="Section Instructor Assignment"
        title="Clear all instructors?"
        message={clearSectionTarget
          ? `Remove all ${clearSectionTarget.assignedCount} assigned course sessions/components from ${clearSectionTarget.name}? Timetable placements and approval status will remain unchanged.`
          : ""}
        confirmLabel="Clear Instructors"
        variant="danger"
        isConfirming={isClearingSection}
        onConfirm={clearSectionInstructors}
        onCancel={() => !isClearingSection && setClearSectionTarget(null)}
      />

      {overloadPrompt && (
        <OverloadConfirmationModal
          confirmation={overloadPrompt.confirmation}
          isSaving={isSaving}
          onConfirm={() =>
            void submitAssignment(overloadPrompt.schedule, overloadPrompt.facultyId, true)
          }
          // "No" sends nothing, so the drawer is left exactly as the user had it:
          // the instructor is still only selected, never assigned.
          onCancel={() => setOverloadPrompt(null)}
        />
      )}
    </div>
  );
}
