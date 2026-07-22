import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  X,
} from "lucide-react";
import axios from "axios";
import api from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from "../../lib/dataCache";

interface StoredUser {
  department_id?: number | null;
}

interface ApiErrorResponse {
  message?: string;
}

interface ApiDepartment {
  id: number;
  department_code: string;
  department_name: string;
}

interface ApiTerm {
  id: number;
  academic_year: string;
  semester: string;
  is_active: boolean | number;
}

interface ApiSubject {
  id: number;
  subject_code: string;
  subject_name: string;
  subject_category: string;
  department_id: number | null;
}

interface ApiFaculty {
  id: number;
  first_name: string;
  last_name: string;
  department_id: number;
  employment_type?: "full-time" | "part-time";
  status?: "active" | "inactive";
}

interface ApiSchedule {
  id: number;
  term_id: number;
  department_id: number;
  subject_id: number;
  faculty_id: number | null;
  day: string;
  start_time: string;
  end_time: string;
  status: string;
  section?: { section_name?: string } | null;
  room?: { room_code?: string; building?: string | null } | null;
  faculty?: { first_name?: string; last_name?: string } | null;
}

interface AssignmentResponse {
  active_term: ApiTerm | null;
  current_department_id?: number | null;
  departments: ApiDepartment[];
  subjects: ApiSubject[];
  faculties: ApiFaculty[];
  schedules: ApiSchedule[];
}

interface AssignmentUpdateResponse {
  schedule: ApiSchedule;
  schedules?: ApiSchedule[];
}

interface AssignmentSchedule extends ApiSchedule {
  subject: ApiSubject;
  department: ApiDepartment;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ASSIGNMENT_STATUSES = ["approved", "faculty_assignment", "finalized"];

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
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteValue} ${suffix}`;
};

const timeToMinutes = (value: string): number => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const isPartTimeOutsideAvailability = (faculty: ApiFaculty, schedule: ApiSchedule): boolean =>
  faculty.employment_type === "part-time" &&
  schedule.day !== "Saturday" &&
  timeToMinutes(schedule.start_time) < 17 * 60;

const getRoomName = (schedule: ApiSchedule): string =>
  schedule.room?.room_code || schedule.room?.building || "Room not set";

const getFacultyName = (schedule: ApiSchedule): string | null => {
  if (!schedule.faculty) return null;
  return [schedule.faculty.first_name, schedule.faculty.last_name].filter(Boolean).join(" ") || null;
};

export default function InstructorAssignment() {
  const user = getStoredUser();
  const assignmentsCacheKey = `page:instructor-assignments:${user.department_id ?? "all"}`;
  const cachedAssignmentData = getCachedData<AssignmentResponse>(assignmentsCacheKey);
  const [departments, setDepartments] = useState<ApiDepartment[]>(cachedAssignmentData?.departments ?? []);
  const [subjects, setSubjects] = useState<ApiSubject[]>(cachedAssignmentData?.subjects ?? []);
  const [faculties, setFaculties] = useState<ApiFaculty[]>(cachedAssignmentData?.faculties ?? []);
  const [schedules, setSchedules] = useState<ApiSchedule[]>(cachedAssignmentData?.schedules ?? []);
  const [activeTerm, setActiveTerm] = useState<ApiTerm | null>(cachedAssignmentData?.active_term ?? null);
  const [currentDepartmentId, setCurrentDepartmentId] = useState<number | null>(user.department_id ?? null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState("all");
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [isLoading, setIsLoading] = useState(!hasCachedData(assignmentsCacheKey));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

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
        });

        if (!active) return;
        setDepartments(data.departments);
        setSubjects(data.subjects);
        setFaculties(data.faculties);
        setSchedules(data.schedules);
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
  }, [assignmentsCacheKey, user.department_id]);

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [Number(subject.id), subject])),
    [subjects],
  );
  const departmentMap = useMemo(
    () => new Map(departments.map((department) => [Number(department.id), department])),
    [departments],
  );

  const assignmentSchedules = useMemo<AssignmentSchedule[]>(() => schedules.flatMap((schedule) => {
    const subject = subjectMap.get(Number(schedule.subject_id));
    const department = departmentMap.get(Number(schedule.department_id));
    if (
      !subject ||
      !department ||
      Number(subject.department_id) !== Number(currentDepartmentId) ||
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
    .filter((item) => item.schedules.length > 0), [assignmentSchedules, departments]);

  const selectedDepartment = selectedDepartmentId
    ? departmentMap.get(selectedDepartmentId) ?? null
    : null;
  const departmentSchedules = assignmentSchedules.filter(
    (schedule) => Number(schedule.department_id) === Number(selectedDepartmentId),
  );
  const sections = [...new Set(departmentSchedules.map(
    (schedule) => schedule.section?.section_name || "Unspecified section",
  ))].sort();
  const visibleSchedules = departmentSchedules.filter((schedule) =>
    selectedSection === "all" || schedule.section?.section_name === selectedSection,
  );
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
          startSlot: Math.max(0, Math.floor((startMinutes - 7 * 60) / 30)),
          durationSlots: Math.max(1, Math.ceil((endMinutes - startMinutes) / 30)),
          lane,
        };
      });
      const laneCount = Math.max(1, laneEndTimes.length);
      layouts.push(...dayLayouts.map((layout) => ({ ...layout, laneCount })));
    });

    return layouts;
  }, [visibleSchedules]);
  const selectedSchedule = assignmentSchedules.find(
    (schedule) => schedule.id === selectedScheduleId,
  ) ?? null;
  const eligibleFaculty = faculties.filter((faculty) =>
    Number(faculty.department_id) === Number(currentDepartmentId) && faculty.status !== "inactive",
  );

  const openDepartment = (departmentId: number) => {
    setSelectedDepartmentId(departmentId);
    setSelectedSection("all");
  };

  const openAssignment = (schedule: AssignmentSchedule) => {
    if (schedule.status === "finalized") return;
    setSelectedScheduleId(schedule.id);
    setSelectedFacultyId(schedule.faculty_id ? String(schedule.faculty_id) : "");
    setError("");
  };

  const closeAssignment = () => {
    if (isSaving) return;
    setSelectedScheduleId(null);
    setSelectedFacultyId("");
  };

  const saveAssignment = async () => {
    if (!selectedSchedule || !selectedFacultyId) {
      setError("Select an instructor before saving.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await api.patch<AssignmentUpdateResponse>(`/instructor-assignments/${selectedSchedule.id}`, {
        faculty_id: Number(selectedFacultyId),
      });
      setSchedules((current) => {
        const updatedSchedules = response.data.schedules ?? [response.data.schedule];
        const updatedScheduleMap = new Map(updatedSchedules.map((schedule) => [schedule.id, schedule]));
        const nextSchedules = current.map((schedule) => updatedScheduleMap.get(schedule.id) ?? schedule);
        setCachedData<AssignmentResponse>(assignmentsCacheKey, {
          active_term: activeTerm,
          current_department_id: currentDepartmentId,
          departments,
          subjects,
          faculties,
          schedules: nextSchedules,
        });
        return nextSchedules;
      });
      setSelectedScheduleId(null);
      setSelectedFacultyId("");
    } catch {
      setError("Unable to assign the instructor. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading instructor assignments">
        <header className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.3fr_1fr]">
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
          <div className="mb-3 flex items-end justify-between gap-3">
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
        <header className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.3fr_1fr]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[#C9952A]/25 bg-[#C9952A]/10 text-[#4e0a10]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active assignment term</p>
              <h2 className="mt-1 text-sm font-black text-[#4e0a10]">
                {activeTerm ? `${activeTerm.semester} Semester · AY ${activeTerm.academic_year}` : "No active term selected"}
              </h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                Use this workspace to assign instructors from your department to approved schedules offered to other departments.
              </p>
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

      {!selectedDepartment ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Receiving Departments</h2>
              <p className="text-xs font-medium text-slate-500">Open a department timetable to assign instructors for subjects offered by your department.</p>
            </div>
            <span className="whitespace-nowrap text-xs font-bold text-slate-500">{offeringDepartments.length} departments</span>
          </div>

          {offeringDepartments.length === 0 ? (
            <div className="py-10 text-center">
              <h3 className="text-sm font-black text-[#4e0a10]">No approved offered-subject schedules yet.</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Department blocks will appear here when approved schedules need instructors from your department.
              </p>
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
                    onClick={() => openDepartment(department.id)}
                    className={`group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#C9952A]/60 hover:shadow-md ${
                      items.length >= 4 ? "xl:row-span-2" : ""
                    } ${items.length >= 7 ? "xl:col-span-2" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4e0a10] text-[#E8D5C4]">
                        <Building2 className="h-5 w-5" />
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
                onClick={() => setSelectedDepartmentId(null)}
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
                  {activeTerm && <span>{activeTerm.semester} Semester · AY {activeTerm.academic_year}</span>}
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C9952A]" /> Needs instructor</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Assigned</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="assignment-section-filter">Section</label>
              <select
                id="assignment-section-filter"
                value={selectedSection}
                onChange={(event) => setSelectedSection(event.target.value)}
                className="h-9 min-w-40 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#C9952A]"
              >
                <option value="all">All sections</option>
                {sections.map((section) => <option key={section}>{section}</option>)}
              </select>
              <span className="flex h-9 items-center rounded-xl bg-[#4e0a10] px-3 text-xs font-bold text-[#E8D5C4]">
                {departmentSchedules.filter((schedule) => schedule.faculty_id).length} of {departmentSchedules.length} assigned
              </span>
            </div>
          </div>

          <div className="overflow-x-auto p-3">
            <div className="max-h-[calc(100vh-13.5rem)] min-w-[900px] overflow-auto rounded-xl border border-slate-200 bg-white">
              <div
                className="relative grid select-none"
                style={{
                  gridTemplateColumns: "72px repeat(6, minmax(138px, 1fr))",
                  gridTemplateRows: "40px repeat(28, 24px)",
                }}
              >
                <div
                  className="sticky left-0 top-0 z-30 flex items-center justify-center border-b border-r border-white/15 bg-[#4e0a10] text-[10px] font-black uppercase text-[#E8D5C4]"
                  style={{ gridColumn: 1, gridRow: 1 }}
                >
                  <Clock3 className="mr-1 h-3.5 w-3.5" /> Time
                </div>

                {DAYS.map((day, dayIndex) => (
                  <div
                    key={day}
                    className="sticky top-0 z-20 flex items-center justify-center border-b border-r border-white/15 bg-[#4e0a10] text-[11px] font-black uppercase text-[#E8D5C4] last:border-r-0"
                    style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                  >
                    {day}
                  </div>
                ))}

                {Array.from({ length: 28 }, (_, slot) => (
                  <div key={`time-row-${slot}`} className="contents">
                    {slot % 2 === 0 && (
                      <div
                        className="sticky left-0 z-10 flex items-start justify-end border-b border-r border-slate-200 bg-slate-50 px-2 pt-1 text-[9px] font-bold text-slate-500"
                        style={{ gridColumn: 1, gridRow: `${slot + 2} / span 2` }}
                      >
                        {formatTime(`${String(7 + slot / 2).padStart(2, "0")}:00:00`)}
                      </div>
                    )}
                    {DAYS.map((day, dayIndex) => (
                      <div
                        key={`${day}-${slot}`}
                        className={`border-b border-r border-slate-200 ${slot % 2 === 0 ? "bg-white" : "bg-slate-50/45"}`}
                        style={{ gridColumn: dayIndex + 2, gridRow: slot + 2 }}
                      />
                    ))}
                  </div>
                ))}

                {scheduleLayouts.map(({ schedule, dayIndex, startSlot, durationSlots, lane, laneCount }) => {
                  const facultyName = getFacultyName(schedule);
                  const isFinalized = schedule.status === "finalized";
                  return (
                    <button
                      key={schedule.id}
                      type="button"
                      onClick={() => openAssignment(schedule)}
                      disabled={isFinalized}
                      aria-label={`${schedule.subject.subject_code}, ${schedule.section?.section_name}, ${formatTime(schedule.start_time)} to ${formatTime(schedule.end_time)}, ${facultyName || "needs instructor"}`}
                      className={`z-10 m-0.5 min-w-0 overflow-hidden rounded-lg border border-l-4 px-2 py-1.5 text-left shadow-sm transition-colors ${
                        facultyName
                          ? "border-emerald-200 border-l-emerald-600 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                          : "border-amber-200 border-l-[#C9952A] bg-amber-50 text-amber-950 hover:bg-amber-100"
                      } ${isFinalized ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
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
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 bg-[#F7F4F0] p-5">
              <div>
                <h2 className="text-base font-black text-[#4e0a10]">Assign Instructor</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedSchedule.subject.subject_code} · {selectedSchedule.subject.subject_name}
                </p>
              </div>
              <button type="button" onClick={closeAssignment} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Close assignment dialog">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                <div><div className="font-semibold text-slate-400">Section</div><div className="mt-1 font-bold text-slate-700">{selectedSchedule.section?.section_name}</div></div>
                <div><div className="font-semibold text-slate-400">Offering department</div><div className="mt-1 font-bold text-slate-700">{selectedSchedule.department.department_code}</div></div>
                <div><div className="font-semibold text-slate-400">Schedule</div><div className="mt-1 font-bold text-slate-700">{selectedSchedule.day}, {formatTime(selectedSchedule.start_time)}</div></div>
                <div><div className="font-semibold text-slate-400">Room</div><div className="mt-1 font-bold text-slate-700">{getRoomName(selectedSchedule)}</div></div>
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Eligible instructor
                <select
                  value={selectedFacultyId}
                  onChange={(event) => setSelectedFacultyId(event.target.value)}
                  disabled={isSaving}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#C9952A]"
                >
                  <option value="">Select an instructor</option>
                {eligibleFaculty.map((faculty) => (
                    <option
                      key={faculty.id}
                      value={faculty.id}
                      disabled={selectedSchedule ? isPartTimeOutsideAvailability(faculty, selectedSchedule) : false}
                    >
                      {faculty.first_name} {faculty.last_name}
                      {selectedSchedule && isPartTimeOutsideAvailability(faculty, selectedSchedule) ? " - Available after 5 PM or Saturday" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeAssignment} disabled={isSaving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={() => void saveAssignment()} disabled={isSaving} className="flex items-center gap-2 rounded-xl bg-[#4e0a10] px-4 py-2.5 text-xs font-bold text-[#E8D5C4] hover:bg-[#3a0809] disabled:opacity-70">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {isSaving ? "Saving..." : "Assign Instructor"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
