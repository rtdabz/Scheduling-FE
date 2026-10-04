import TableActionButton from "../../components/ui/TableActionButton";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Eye,
  LayoutList,
  Search,
  UserMinus,
} from "lucide-react";
import axios from "axios";
import api from "../../lib/api";
import { yearLevelLabel } from "../../lib/semesterLabel";
import { useToast } from "../../context/ToastContext";
import { OVERRIDE_CONFLICTS_FLAG, conflictOverrideFrom, conflictOverridePrompt } from "../../lib/conflictOverride";
import {
  fetchConflicts,
  fetchInstructorRecommendations,
  fetchResolvedConflicts,
  type ConflictRule,
  type InstructorRecommendation,
} from "../../lib/conflicts";
import ResolveConflictModal from "./SchedulerPanel/Modals/ResolveConflictModal";

const FACULTY_CONFLICT_ONLY: ConflictRule[] = ["faculty_conflict"];
import Skeleton from "../../components/ui/Skeleton";
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from "../../lib/dataCache";
import { useLiveRevision } from "../../hooks/useLiveRefresh";
import { invalidateCacheGroups } from "../../lib/cacheGroups";
import { publishLiveTopics } from "../../lib/liveUpdates";
import { apiErrorMessage } from "../../lib/apiError";
import { overloadConfirmationFrom } from "../../lib/overloadConfirmation";
import { availabilityWarningMessage, coveredContinuously } from "../../lib/availabilityWindows";
import type { LoadTier, OverloadConfirmation } from "../../lib/overloadConfirmation";
import OverloadConfirmationModal from "../../components/faculty/OverloadConfirmationModal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import WeeklyTimetableGrid from "../../components/scheduling/WeeklyTimetableGrid";
import { gridOpeningMinutes, slotCount, slotMinutes } from "../../lib/timeGrid";
import WorkflowGuideButton from "../../components/help/WorkflowGuideButton";
import { useWorkflowGuide } from "../../hooks/useWorkflowGuide";
import MasterGantt from "../vpaa/calendar/MasterGantt";
import {
  buildGanttDays,
  buildTimeWindow,
  dayIndexOf,
  findOverlaps,
  type CalendarSchedule,
  type StandardHours,
} from "../vpaa/calendar/ganttLayout";
import type { ZoomLevel } from "../vpaa/calendar/ganttPresentation";
import FacultyModal from "./SchedulerPanel/Modals/FacultyModal";
import AssignmentWorklist from "./AssignmentWorklist";
import type { WorklistClass } from "./AssignmentWorklist";
import { eligibleFacultiesForSubject, requiredTeachingProgramId } from "./SchedulerPanel/facultyEligibility";
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

interface ApiSemester {
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
  semester_id: number;
  department_id: number;
  course_id?: number;
  subject_id?: number;
  faculty_id: number | null;
  faculty_assignment_done?: boolean | number;
  faculty_conflict_override?: boolean | number;
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
  teaching_source_program?: { id?: number; code?: string | null; major?: string | null } | null;
}

const sourceProgramLabel = (program?: ApiIncomingCourse['teaching_source_program']): string | null => {
  const code = program?.code?.trim();
  if (!code) return null;
  const major = program?.major?.trim();
  return major ? `${code}-${major}` : code;
};

interface AssignmentResponse {
  active_semester: ApiSemester | null;
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
  warnings?: AssignmentWarning[];
  load?: AssignmentLoad | null;
}

interface AssignmentSchedule extends ApiSchedule {
  subject: ApiSubject;
  department: ApiDepartment;
}

const VIEW_MODE_STORAGE_KEY = "instructor-assignment:view";

type AssignmentView = "list" | "grid";

const storedViewMode = (): AssignmentView => {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
};

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

  const recorded = faculty.availabilities ?? [];
  if (recorded.length === 0) return false;
  const dayAvailabilities = recorded.filter(
    (a) => Number(a.day_index) === dayIndex
  );
  if (dayAvailabilities.length === 0) return true;

  return !coveredContinuously(
    dayAvailabilities.map((window): [number, number] => [
      timeToMinutes(window.start_time),
      timeToMinutes(window.end_time),
    ]),
    timeToMinutes(schedule.start_time),
    timeToMinutes(schedule.end_time)
  );
};

const getRoomName = (schedule: ApiSchedule): string =>
  schedule.room?.room_code || "Room not set";

const getFacultyName = (schedule: ApiSchedule): string | null => {
  if (!schedule.faculty) return null;
  return [schedule.faculty.first_name, schedule.faculty.last_name].filter(Boolean).join(" ") || null;
};

const timetableFrameClass = (scrollableTimetable: boolean): string => (scrollableTimetable
  ? "max-h-[calc(100vh-13.5rem)] overflow-auto rounded-xl bg-white"
  : "rounded-xl bg-white");

function InstructorAssignmentTimetableSkeleton({
  hasFooter,
  scrollableTimetable,
}: {
  hasFooter: boolean;
  scrollableTimetable: boolean;
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
        <div className={timetableFrameClass(scrollableTimetable)}>
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
  scrollableTimetable?: boolean;
}

export interface InstructorAssignmentWorkspaceState {
  selectedDepartmentId: number | null;
  scheduleIds: number[];
  allAssigned: boolean;
  assignmentDone: boolean;
}

export default function InstructorAssignment({ assignmentLocked, headerActions, footerActions, onWorkspaceStateChange, workflowGuideId = "instructor-assignment", onWorkflowReady, refreshToken = 0, scrollableTimetable = true }: InstructorAssignmentProps = {}) {
  const { toast, confirm } = useToast();
  const user = getStoredUser();
  const assignmentsCacheKey = `page:instructor-assignments:v5:${user.department_id ?? "all"}:${user.program_id ?? "all"}`;
  const cachedAssignmentData = getCachedData<AssignmentResponse>(assignmentsCacheKey);
  const [departments, setDepartments] = useState<ApiDepartment[]>(cachedAssignmentData?.departments ?? []);
  const [subjects, setSubjects] = useState<ApiSubject[]>(cachedAssignmentData?.subjects ?? []);
  const [faculties, setFaculties] = useState<ApiFaculty[]>(cachedAssignmentData?.faculties ?? []);
  const [schedules, setSchedules] = useState<ApiSchedule[]>(cachedAssignmentData?.schedules ?? []);
  const [incomingCourses, setIncomingCourses] = useState<ApiIncomingCourse[]>(cachedAssignmentData?.incoming_courses ?? []);
  const [activeSemester, setActiveSemester] = useState<ApiSemester | null>(cachedAssignmentData?.active_semester ?? null);
  const [currentDepartmentId, setCurrentDepartmentId] = useState<number | null>(user.department_id ?? null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const autoOpenedRef = useRef(false);
  const [selectedSection, setSelectedSection] = useState("all");
  const [facultyConflictCount, setFacultyConflictCount] = useState(0);
  const [facultyResolvedCount, setFacultyResolvedCount] = useState(0);
  const [isConflictsOpen, setIsConflictsOpen] = useState(false);
  const [conflictsRevision, setConflictsRevision] = useState(0);
  const conflictFacultyOptions = useMemo(
    () => faculties.map((faculty) => ({
      id: Number(faculty.id),
      label: `${faculty.first_name} ${faculty.last_name}`.trim(),
    })),
    [faculties],
  );
  const [viewMode, setViewMode] = useState<AssignmentView>(storedViewMode);
  const [ganttZoom, setGanttZoom] = useState<ZoomLevel>("fit");
  const [collapsedGanttDays, setCollapsedGanttDays] = useState<ReadonlySet<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "assigned">("all");
  const [facultyAssignmentPopup, setFacultyAssignmentPopup] = useState<FacultyAssignmentPopupState | null>(null);
  const [refusedConflict, setRefusedConflict] = useState<{
    scheduleId: string;
    facultyId: string;
    message: string;
  } | null>(null);
  const [instructorRecommendations, setInstructorRecommendations] = useState<{
    scheduleId: string;
    options: InstructorRecommendation[];
    failed: boolean;
  } | null>(null);
  const recommendationsForRef = useRef<string | null>(null);
  const [overloadPrompt, setOverloadPrompt] = useState<{
    confirmation: OverloadConfirmation;
    schedule: AssignmentSchedule;
    facultyId: number;
    overrideConflicts: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(!hasCachedData(assignmentsCacheKey));
  const [isSaving, setIsSaving] = useState(false);
  const [savingScheduleId, setSavingScheduleId] = useState<number | null>(null);
  const [isClearingSection, setIsClearingSection] = useState(false);
  const [clearSectionTarget, setClearSectionTarget] = useState<{
    sectionIds: number[];
    name: string;
    assignedCount: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<AssignmentWarning[]>([]);
  const instructorGuideSteps = useMemo(() => [
    { element: "#instructor-assignment-overview", title: "Review approved schedules", description: "This page shows approved classes that still need your instructors.", side: "bottom" as const },
    { element: '[data-tour="department-card"]', waitFor: "#instructor-assignment-departments", action: "click" as const, taskHint: "Click a department card to continue.", title: "Choose a department", description: "Open a department with classes that need your instructors.", side: "top" as const },
    { element: "#assignment-section-filter", action: "select" as const, taskHint: "Change the section filter to continue.", title: "Filter by section", description: "Show one section at a time when needed.", side: "bottom" as const },
    { element: "#assignment-status-filter", action: "select" as const, skipIfMissing: true, taskHint: "Choose \"Needs instructor\" to continue.", title: "Show only what is left", description: "Narrow the list to classes that still have nobody assigned.", side: "bottom" as const },
    { element: "#instructor-assignment-worklist select[id^='worklist-faculty-']:not([disabled])", waitFor: "#instructor-assignment-worklist", skipIfMissing: true, title: "Assign an instructor", description: "Pick an eligible instructor straight from the row — it saves as you choose.", side: "top" as const },
  ], []);
  useWorkflowGuide({ id: "instructor-assignment", isReady: !isLoading && workflowGuideId === "instructor-assignment", steps: instructorGuideSteps, mission: "Staff the Classes" });

  useEffect(() => {
    if (!isLoading) onWorkflowReady?.();
  }, [isLoading, onWorkflowReady]);

  const liveRevision = useLiveRevision(["assignments", "schedules", "faculty"]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = liveRevision === 0 && !hasCachedData(assignmentsCacheKey);
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
        setActiveSemester(data.active_semester);
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
  }, [assignmentsCacheKey, refreshToken, user.department_id, liveRevision, conflictsRevision]);

  useEffect(() => {
    const semesterId = activeSemester ? Number(activeSemester.id) : null;
    if (semesterId === null || assignmentLocked) return;

    const controller = new AbortController();
    void fetchConflicts({
      semesterId,
      departmentId: selectedDepartmentId ?? currentDepartmentId,
      signal: controller.signal,
    })
      .then((conflicts) => setFacultyConflictCount(
        conflicts.filter((conflict) => conflict.rule === "faculty_conflict").length,
      ))
      .catch(() => undefined);
    void fetchResolvedConflicts({
      semesterId,
      departmentId: selectedDepartmentId ?? currentDepartmentId,
      signal: controller.signal,
    })
      .then((entries) => setFacultyResolvedCount(
        entries.filter((entry) => entry.rule === "faculty_conflict" && entry.status !== "reopened").length,
      ))
      .catch(() => undefined);

    return () => controller.abort();
  }, [activeSemester, assignmentLocked, currentDepartmentId, selectedDepartmentId, schedules]);

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [Number(subject.id), subject])),
    [subjects],
  );
  const departmentMap = useMemo(
    () => new Map(departments.map((department) => [Number(department.id), department])),
    [departments],
  );

  const assignmentSchedules = useMemo<AssignmentSchedule[]>(() => schedules.flatMap((schedule) => {
    const courseId = Number(schedule.course_id ?? schedule.subject_id ?? 0);
    const subject = subjectMap.get(courseId);
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

  const awaitingIncomingCourses = useMemo(
    () => incomingCourses.filter((course) => !assignmentSchedules.some(
      (schedule) => Number(schedule.course_id ?? schedule.subject_id ?? 0) === Number(course.id),
    )),
    [assignmentSchedules, incomingCourses],
  );

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
  const offeredSchedules = useMemo(
    () => offeringDepartments.flatMap((item) => item.schedules),
    [offeringDepartments],
  );

  useEffect(() => {
    if (autoOpenedRef.current || selectedDepartmentId !== null || isLoading) return;
    const requested = Number(new URLSearchParams(window.location.search).get("department"));
    const deepLinked = offeringDepartments.find(
      (item) => Number(item.department.id) === requested,
    );
    if (deepLinked) {
      autoOpenedRef.current = true;
      setSelectedDepartmentId(Number(deepLinked.department.id));
    }
  }, [assignmentLocked, isLoading, offeringDepartments, selectedDepartmentId]);
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
  const sectionSchedules = departmentSchedules.filter((schedule) =>
    selectedSection === "all" || schedule.section?.section_name === selectedSection,
  );
  const visibleSchedules = sectionSchedules.filter((schedule) => {
    if (statusFilter === "pending" && schedule.faculty_id !== null) return false;
    if (statusFilter === "assigned" && schedule.faculty_id === null) return false;
    const query = searchQuery.trim().toLowerCase();
    if (query === "") return true;
    return [
      schedule.subject.course_code ?? schedule.subject.subject_code,
      schedule.subject.course_name ?? schedule.subject.subject_name,
      schedule.section?.section_name,
      getRoomName(schedule),
      getFacultyName(schedule),
    ].some((field) => (field ?? "").toLowerCase().includes(query));
  });
  const clearableSectionSchedules = sectionSchedules.filter((schedule) => (
    schedule.faculty_id !== null
    && schedule.status !== "finalized"
    && !schedule.faculty_assignment_done
  ));
  const ganttSchedules = useMemo<CalendarSchedule[]>(() => visibleSchedules.map((schedule) => ({
    id: schedule.id,
    day: schedule.day,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
    meeting_type: schedule.meeting_type ?? "lecture",
    mode: schedule.mode ?? "on-site",
    course_id: schedule.course_id ?? schedule.subject_id ?? null,
    department_id: schedule.department_id,
    department: schedule.department,
    room_id: schedule.room_id ?? null,
    room: schedule.room?.room_code
      ? { id: schedule.room_id ?? 0, room_code: schedule.room.room_code, building: schedule.room.building ?? null }
      : null,
    faculty_id: schedule.faculty_id,
    faculty: schedule.faculty && schedule.faculty_id !== null
      ? { id: schedule.faculty_id, first_name: schedule.faculty.first_name ?? "", last_name: schedule.faculty.last_name ?? "" }
      : null,
    section_id: schedule.section_id ?? null,
    section: { id: schedule.section_id ?? 0, section_name: schedule.section?.section_name ?? "Unspecified section", department_id: schedule.department_id },
    course: {
      course_code: schedule.subject.course_code ?? schedule.subject.subject_code,
      course_name: schedule.subject.course_name ?? schedule.subject.subject_name,
      units: schedule.subject.units ?? undefined,
    },
  })), [visibleSchedules]);
  const ganttDays = useMemo(() => {
    const dayIndexes = ganttSchedules.some((schedule) => dayIndexOf(schedule.day) === 6)
      ? [0, 1, 2, 3, 4, 5, 6]
      : [0, 1, 2, 3, 4, 5];
    return buildGanttDays(ganttSchedules, "none", dayIndexes);
  }, [ganttSchedules]);
  const ganttStandardHours = useMemo<StandardHours>(() => {
    const opening = gridOpeningMinutes();
    return { opening, closing: opening + slotCount() * slotMinutes(), slotMinutes: slotMinutes() };
  }, []);
  const ganttTimeWindow = useMemo(
    () => buildTimeWindow(ganttStandardHours, ganttSchedules),
    [ganttStandardHours, ganttSchedules],
  );
  const ganttOverlaps = useMemo(() => findOverlaps(ganttSchedules), [ganttSchedules]);
  const ganttNow = useMemo(() => new Date(), []);
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
      semesterId: Number(schedule.semester_id),
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
      facultyConflictOverride: Boolean(schedule.faculty_conflict_override),
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

  const changeViewMode = (next: AssignmentView) => {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    } catch {
    }
  };
  const openDepartment = (departmentId: number) => {
    setSelectedDepartmentId(departmentId);
    setSelectedSection("all");
  };

  const resetConflictHelp = () => {
    setRefusedConflict(null);
    setInstructorRecommendations(null);
    recommendationsForRef.current = null;
  };

  const openAssignment = (schedule: AssignmentSchedule) => {
    if (assignmentLocked || schedule.status === "finalized" || Boolean(schedule.faculty_assignment_done)) return;
    resetConflictHelp();
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
    resetConflictHelp();
  };

  const submitAssignment = async (
    schedule: AssignmentSchedule,
    facultyId: number | null,
    confirmOverload: boolean,
    overrideConflicts = false
  ) => {
    setIsSaving(true);
    setSavingScheduleId(schedule.id);
    setError("");
    try {
      const response = await api.patch<AssignmentUpdateResponse>(`/instructor-assignments/${schedule.id}`, {
        faculty_id: facultyId,
        ...(confirmOverload ? { confirm_overload: true } : {}),
        ...(overrideConflicts && facultyId !== null ? { [OVERRIDE_CONFLICTS_FLAG]: true } : {}),
      });
      setWarnings(response.data.warnings ?? []);

      const load = response.data.load;
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
        active_semester: activeSemester,
        current_department_id: currentDepartmentId,
        departments,
        subjects,
        faculties: nextFaculties,
        schedules: nextSchedules,
        incoming_courses: incomingCourses,
      });

      invalidateAssignmentDependents();
      setOverloadPrompt(null);
      setFacultyAssignmentPopup(null);
      resetConflictHelp();
      toast.success(
        facultyId === null ? "Instructor Removed" : "Instructor Assigned",
        facultyId === null
          ? "The instructor assignment was removed successfully."
          : "The instructor was assigned successfully.",
      );
    } catch (err) {
      const confirmation = overloadConfirmationFrom(err);
      if (confirmation && facultyId !== null) {
        setOverloadPrompt({ confirmation, schedule, facultyId, overrideConflicts });
        return;
      }

      const question = facultyId === null || overrideConflicts ? null : conflictOverrideFrom(err);
      if (question && facultyId !== null) {
        setIsSaving(false);
        setSavingScheduleId(null);
        if (facultyAssignmentPopup?.scheduleId !== String(schedule.id)) {
          resetConflictHelp();
          setRefusedConflict({
            scheduleId: String(schedule.id),
            facultyId: String(facultyId),
            message: question.details.join(" ") || question.message,
          });
          setFacultyAssignmentPopup({ scheduleId: String(schedule.id), facultyId: String(facultyId) });
          return;
        }
        const proceed = await confirm({
          title: "Instructor has a conflict",
          message: conflictOverridePrompt(question),
          eyebrow: "Instructor conflict",
          confirmLabel: "Assign anyway",
        });
        if (proceed) await submitAssignment(schedule, facultyId, confirmOverload, true);
        return;
      }

      setOverloadPrompt(null);
      setError(apiErrorMessage(err, "Unable to assign the instructor. Please try again."));
    } finally {
      setIsSaving(false);
      setSavingScheduleId(null);
    }
  };

  const saveAssignment = () => {
    if (!selectedSchedule || !facultyAssignmentPopup?.facultyId) {
      setError("Select an instructor before saving.");
      return;
    }

    const facultyId = Number(facultyAssignmentPopup.facultyId);
    void submitAssignment(selectedSchedule, facultyId, false);
  };

  const removeAssignment = () => {
    if (!selectedSchedule?.faculty_id) return;
    void submitAssignment(selectedSchedule, null, false);
  };

  const departmentClassTotals = useMemo(() => {
    const assignedByClass = new Map<string, boolean>();
    for (const schedule of departmentSchedules) {
      const key = [
        schedule.semester_id,
        schedule.section_id ?? schedule.section?.section_name ?? "none",
        schedule.subject.id,
      ].join(":");
      assignedByClass.set(key, (assignedByClass.get(key) ?? true) && schedule.faculty_id !== null);
    }
    const total = assignedByClass.size;
    const assigned = [...assignedByClass.values()].filter(Boolean).length;
    return { total, assigned };
  }, [departmentSchedules]);
  const assignFromWorklist = (scheduleId: number, facultyId: number | null) => {
    const schedule = assignmentSchedules.find((item) => Number(item.id) === scheduleId);
    if (!schedule || assignmentLocked) return;
    setError("");
    setWarnings([]);
    void submitAssignment(schedule, facultyId, false);
  };
  const invalidateAssignmentDependents = () => {
    invalidateCacheGroups("faculty", "schedules", "dashboards");
    publishLiveTopics(["schedules"]);
  };

  const requestClearSection = () => {
    const sectionIds = [...new Set(
      clearableSectionSchedules.map((schedule) => Number(schedule.section_id ?? 0)).filter((id) => id > 0),
    )];
    if (sectionIds.length === 0) return;
    setClearSectionTarget({
      sectionIds,
      name: selectedSection === "all" ? "all sections" : selectedSection,
      assignedCount: clearableSectionSchedules.length,
    });
  };

  const clearSectionInstructors = async () => {
    if (!clearSectionTarget || isClearingSection) return;
    setIsClearingSection(true);
    setError("");
    try {
      const response = await api.post<ClearSectionResponse>("/instructor-assignments/clear", {
        section_ids: clearSectionTarget.sectionIds,
      });
      const updatedScheduleMap = new Map(response.data.schedules.map((schedule) => [schedule.id, schedule]));
      const updatedFacultyMap = new Map(response.data.faculties.map((faculty) => [faculty.id, faculty]));
      const nextSchedules = schedules.map((schedule) => updatedScheduleMap.get(schedule.id) ?? schedule);
      const nextFaculties = faculties.map((faculty) => updatedFacultyMap.get(faculty.id) ?? faculty);

      setSchedules(nextSchedules);
      setFaculties(nextFaculties);
      setCachedData<AssignmentResponse>(assignmentsCacheKey, {
        active_semester: activeSemester,
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
        `${response.data.courses_cleared} course ${response.data.courses_cleared === 1 ? "assignment was" : "assignments were"} cleared for ${clearSectionTarget.name}.`,
      );
      invalidateAssignmentDependents();
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
      return availabilityWarningMessage(`${faculty.first_name} ${faculty.last_name}`.trim());
    }

    const start = timeToMinutes(schedule.start_time);
    const end = timeToMinutes(schedule.end_time);
    const conflict = schedules.some((item) => (
      String(item.id) !== scheduleId
      && String(item.faculty_id ?? "") === facultyId
      && Number(item.semester_id) === Number(schedule.semester_id)
      && item.day === schedule.day
      && start < timeToMinutes(item.end_time)
      && timeToMinutes(item.start_time) < end
    ));

    return conflict ? "Instructor has an overlapping class at this time." : null;
  };

  const worklistClasses = useMemo<WorklistClass[]>(() => {
    const grouped = new Map<string, AssignmentSchedule[]>();
    for (const schedule of visibleSchedules) {
      const key = [
        schedule.semester_id,
        schedule.section_id ?? schedule.section?.section_name ?? "none",
        schedule.subject.id,
      ].join(":");
      grouped.set(key, [...(grouped.get(key) ?? []), schedule]);
    }

    return [...grouped.entries()].map(([key, meetings]) => {
      const [primary] = meetings;
      const subject = modalSubjects.find((item) => item.id === String(primary.subject.id)) ?? null;
      const eligible = eligibleFacultiesForSubject(
        modalFaculties,
        subject,
        Number(primary.department_id),
      );
      const requiredProgramId = requiredTeachingProgramId(subject);

      return {
        key,
        scheduleId: primary.id,
        courseCode: primary.subject.course_code ?? primary.subject.subject_code,
        courseName: primary.subject.course_name ?? primary.subject.subject_name,
        units: Number(primary.subject.units ?? 0),
        sectionName: primary.section?.section_name ?? "Unspecified section",
        facultyId: primary.faculty_id,
        facultyName: getFacultyName(primary),
        locked: Boolean(assignmentLocked)
          || primary.status === "finalized"
          || Boolean(primary.faculty_assignment_done),
        meetings: meetings
          .slice()
          .sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day))
          .map((meeting) => ({
            id: meeting.id,
            day: meeting.day,
            startTime: formatTime(meeting.start_time),
            endTime: formatTime(meeting.end_time),
            roomName: getRoomName(meeting),
          })),
        eligible: eligible.map((faculty) => ({
          id: Number(faculty.id),
          name: faculty.name,
          employmentType: faculty.employmentType,
          conflict: checkModalFacultyConflict(faculty.id, String(primary.id))
            ? "already scheduled"
            : null,
        })),
        restrictionNote: requiredProgramId === null
          ? null
          : `Only ${subject?.programCode ?? "the assigned"} program instructors can teach this course.`,
      };
    }).sort((left, right) => left.courseCode.localeCompare(right.courseCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentLocked, modalFaculties, modalSubjects, visibleSchedules]);

  const popupConflictWarning = facultyAssignmentPopup?.facultyId
    ? checkModalFacultyConflict(facultyAssignmentPopup.facultyId, facultyAssignmentPopup.scheduleId)
      ?? (refusedConflict?.scheduleId === facultyAssignmentPopup.scheduleId
        && refusedConflict.facultyId === facultyAssignmentPopup.facultyId
        ? refusedConflict.message
        : "")
    : "";
  const recommendationScheduleId = facultyAssignmentPopup && popupConflictWarning
    ? facultyAssignmentPopup.scheduleId
    : null;

  useEffect(() => {
    if (recommendationScheduleId === null || recommendationsForRef.current === recommendationScheduleId) return;
    const scheduleId = recommendationScheduleId;
    recommendationsForRef.current = scheduleId;

    void fetchInstructorRecommendations(scheduleId)
      .then((options) => {
        if (recommendationsForRef.current === scheduleId) {
          setInstructorRecommendations({ scheduleId, options, failed: false });
        }
      })
      .catch(() => {
        if (recommendationsForRef.current === scheduleId) {
          setInstructorRecommendations({ scheduleId, options: [], failed: true });
        }
      });
  }, [recommendationScheduleId]);

  if (isLoading && selectedDepartmentId !== null) {
    return (
      <InstructorAssignmentTimetableSkeleton
        hasFooter={Boolean(footerActions)}
        scrollableTimetable={scrollableTimetable}
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

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-4 w-24" />
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active assignment semester</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 text-xs font-bold shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {activeSemester ? `${activeSemester.semester} Semester · AY ${activeSemester.academic_year}` : "No active semester selected"}
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
                {offeredSchedules.filter((schedule) => !schedule.faculty_id).length}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Assigned</p>
              <p className="mt-1 text-lg font-black text-emerald-700">
                {offeredSchedules.filter((schedule) => schedule.faculty_id).length}
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

          {awaitingIncomingCourses.length > 0 && (
                <div className={`text-left ${offeringDepartments.length === 0 ? 'mx-auto max-w-3xl py-10' : 'mb-3'}`}>
                  <h3 className="text-sm font-black text-[#4e0a10]">Incoming courses awaiting schedules</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">These courses were assigned to your department, but no approved schedule exists yet. Create the section schedule in Schedule Builder first; it will then appear here for instructor assignment.</p>
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {awaitingIncomingCourses.map((course) => (
                      <div key={course.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                        <div><p className="text-sm font-black text-slate-900">{course.course_code} · {course.course_name}</p><p className="text-xs text-slate-500">Source: {sourceProgramLabel(course.teaching_source_program) ?? course.department?.department_code ?? course.department?.department_name ?? 'Shared'} · {course.units ?? 0} units · {yearLevelLabel(course.year_level)}</p></div>
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">Schedule required</span>
                      </div>
                    ))}
                  </div>
                </div>
          )}
          {offeringDepartments.length === 0 ? (
            awaitingIncomingCourses.length === 0 && (
              <div className="py-10 text-center"><h3 className="text-sm font-black text-[#4e0a10]">No incoming courses or approved schedules yet.</h3><p className="mt-1 text-xs font-medium text-slate-500">Assigned courses will appear here after a schedule is created and approved.</p></div>
            )
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Schedules</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3 text-right">Assigned</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {offeringDepartments.map(({ department, schedules: items }) => {
                    const pending = items.filter((schedule) => !schedule.faculty_id).length;
                    const assigned = items.length - pending;
                    return (
                      <tr
                        key={department.id}
                        data-tour="department-card"
                        tabIndex={0}
                        onClick={() => openDepartment(department.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDepartment(department.id);
                          }
                        }}
                        className="group cursor-pointer transition-colors hover:bg-[#C9952A]/5 focus:bg-[#C9952A]/5 focus:outline-none"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#4e0a10] text-[#E8D5C4]">
                              {department.logo ? <img src={department.logo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-4 w-4" />}
                            </div>
                            <div>
                              <div className="font-black text-[#4e0a10]">{department.department_code}</div>
                              <div className="text-xs font-semibold text-slate-500">{department.department_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-600">{items.length}</td>
                        <td className={`px-4 py-3 text-right font-bold ${pending ? "text-amber-700" : "text-slate-400"}`}>{pending}</td>
                        <td className={`px-4 py-3 text-right font-bold ${assigned ? "text-emerald-700" : "text-slate-400"}`}>{assigned}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                          <TableActionButton
                            label={`View ${department.department_code} timetable`}
                            variant="view"
                            onClick={(event) => { event.stopPropagation(); openDepartment(department.id); }}
                          >
                            <Eye size={17} />
                          </TableActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedDepartmentId(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#C9952A] hover:text-[#4e0a10]"
                aria-label="Back to departments"
                title="Back to departments"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="flex items-center gap-2 text-base font-black text-[#4e0a10]">
                  <CalendarDays className="h-4 w-4 text-[#C9952A]" />
                  {offeringDepartments.length > 1 ? (
                    <>
                      <label className="sr-only" htmlFor="assignment-department-switcher">Source department</label>
                      <select
                        id="assignment-department-switcher"
                        value={String(selectedDepartment.id)}
                        onChange={(event) => openDepartment(Number(event.target.value))}
                        className="-ml-1 rounded-lg border border-transparent bg-transparent py-0.5 pl-1 pr-6 text-base font-black text-[#4e0a10] outline-none transition-colors hover:border-slate-200 focus:border-[#C9952A]"
                      >
                        {offeringDepartments.map(({ department }) => (
                          <option key={department.id} value={department.id}>
                            {department.department_code}
                          </option>
                        ))}
                      </select>
                      Instructor Assignment
                    </>
                  ) : (
                    `${selectedDepartment.department_code} Instructor Assignment`
                  )}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500">
                  {activeSemester && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      {activeSemester.semester} Semester &bull; AY {activeSemester.academic_year}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C9952A]" /> Needs instructor</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Assigned</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {headerActions}
              <span className="flex h-9 items-center rounded-xl bg-[#4e0a10] px-3 text-xs font-bold text-[#E8D5C4]">
                {departmentClassTotals.assigned} of {departmentClassTotals.total} classes assigned
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <label className="sr-only" htmlFor="assignment-search">Search classes</label>
                <input
                  id="assignment-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search course, section, room, instructor"
                  className="h-9 w-64 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#C9952A]"
                />
              </div>
              <label className="sr-only" htmlFor="assignment-status-filter">Assignment status</label>
              <select
                id="assignment-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#C9952A]"
              >
                <option value="all">All classes</option>
                <option value="pending">Needs instructor</option>
                <option value="assigned">Assigned</option>
              </select>
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
              <button
                type="button"
                onClick={requestClearSection}
                disabled={Boolean(assignmentLocked) || isSaving || isClearingSection || clearableSectionSchedules.length === 0}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={selectedSection === "all"
                  ? "Remove every instructor assignment you can manage in all sections"
                  : "Remove every instructor assignment you can manage in this section"}
              >
                <UserMinus className="h-4 w-4" />
                {selectedSection === "all" ? "Clear All Instructors" : "Clear Instructor"}
              </button>
              {(facultyConflictCount > 0 || facultyResolvedCount > 0) && activeSemester && !assignmentLocked && (
                <button
                  type="button"
                  onClick={() => setIsConflictsOpen(true)}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${
                    facultyConflictCount > 0
                      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
                  title={facultyConflictCount > 0
                    ? "An instructor is booked for two classes at the same time"
                    : "Every instructor conflict this semester has been resolved"}
                >
                  {facultyConflictCount > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  Instructor Conflicts
                  {facultyConflictCount > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-black leading-4 text-white">
                      {facultyConflictCount} open
                    </span>
                  )}
                  {facultyResolvedCount > 0 && (
                    <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-black leading-4 text-white">
                      {facultyResolvedCount} resolved
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {([
                { id: "list" as const, label: "List", Icon: LayoutList },
                { id: "grid" as const, label: "Grid", Icon: CalendarRange },
              ]).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeViewMode(id)}
                  aria-pressed={viewMode === id}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition-colors ${
                    viewMode === id
                      ? "bg-white text-[#4e0a10] shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {viewMode === "list" ? (
            <div id="instructor-assignment-worklist" className="max-h-[calc(100vh-16rem)] overflow-y-auto p-3">
              <AssignmentWorklist
                classes={worklistClasses}
                busyScheduleId={isSaving && facultyAssignmentPopup === null ? savingScheduleId : null}
                onAssign={assignFromWorklist}
                emptyMessage={departmentSchedules.length === 0
                  ? "No classes from this department need your instructors."
                  : "No class matches these filters."}
              />
            </div>
          ) : (
          <div id="instructor-assignment-timetable" className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="Timeline zoom"
                value={ganttZoom}
                onChange={(event) => setGanttZoom(event.target.value as ZoomLevel)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
              >
                <option value="fit">Fit</option>
                <option value="normal">1×</option>
                <option value="wide">2×</option>
              </select>
              <span className="ml-auto text-xs font-semibold text-slate-500">
                {assignmentLocked ? "Assignments are locked." : "Select a class to assign its instructor."}
              </span>
            </div>
            <MasterGantt
              days={ganttDays}
              timeWindow={ganttTimeWindow}
              standardHours={ganttStandardHours}
              groupBy="none"
              zoom={ganttZoom}
              density="compact"
              highlightAssigned
              overlaps={ganttOverlaps}
              collapsedDays={collapsedGanttDays}
              onToggleDay={(day) => setCollapsedGanttDays((current) => {
                const next = new Set(current);
                if (next.has(day)) next.delete(day);
                else next.add(day);
                return next;
              })}
              onSelect={(calendarSchedule) => {
                const schedule = visibleSchedules.find((item) => item.id === calendarSchedule.id);
                if (schedule) openAssignment(schedule);
              }}
              now={ganttNow}
              className={scrollableTimetable ? "max-h-[calc(100vh-16rem)]" : undefined}
            />
          </div>
          )}
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
        popupConflictWarning={popupConflictWarning}
        recommendedInstructors={instructorRecommendations?.failed
          ? undefined
          : instructorRecommendations?.scheduleId === facultyAssignmentPopup?.scheduleId
            ? instructorRecommendations?.options ?? null
            : null}
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
            void submitAssignment(overloadPrompt.schedule, overloadPrompt.facultyId, true, overloadPrompt.overrideConflicts)
          }
          onCancel={() => setOverloadPrompt(null)}
        />
      )}

      {isConflictsOpen && (
        <ResolveConflictModal
          isOpen
          onClose={() => setIsConflictsOpen(false)}
          semesterId={activeSemester ? Number(activeSemester.id) : null}
          departmentId={selectedDepartmentId ?? currentDepartmentId}
          rooms={[]}
          faculties={conflictFacultyOptions}
          canUpdateSchedule={!assignmentLocked}
          canAssignInstructor={!assignmentLocked}
          rules={FACULTY_CONFLICT_ONLY}
          initialTab={facultyConflictCount > 0 ? "open" : "resolved"}
          onResolved={() => setConflictsRevision((revision) => revision + 1)}
        />
      )}
    </div>
  );
}
