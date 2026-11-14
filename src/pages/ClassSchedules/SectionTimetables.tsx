import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, RefreshCw } from "lucide-react";
import { useLiveRevision } from "../../hooks/useLiveRefresh";
import api from "../../lib/api";
import { getCachedData, hasCachedData, setCachedData } from "../../lib/dataCache";
import { getStoredUser } from "../../lib/storedUser";
import MasterGantt from "../vpaa/calendar/MasterGantt";
import ScheduleDetailModal from "../vpaa/calendar/ScheduleDetailModal";
import {
  buildGanttDays,
  buildTimeWindow,
  dayIndexOf,
  filterVpaaApprovedSchedules,
  findOverlaps,
  type CalendarSchedule,
  type StandardHours,
} from "../vpaa/calendar/ganttLayout";
import { gridOpeningMinutes, slotCount, slotMinutes } from "../../lib/timeGrid";
import { scheduleItemToCalendar } from "./SchedulerPanel/ganttAdapter";
import {
  mapInitialData,
  type InitialDataResponse,
  type SchedulerCacheData,
} from "./SchedulerPanel/hooks/initialDataMapper";
import type { ScheduleItem } from "./SchedulerPanel/types";
import { yearLevelLabel } from "../../lib/semesterLabel";
import TruncatedDataNotice from "../../components/ui/TruncatedDataNotice";

type DeliveryModeFilter = "all" | ScheduleItem["mode"];

const emptyData: SchedulerCacheData = {
  rooms: [],
  sections: [],
  subjects: [],
  faculties: [],
  activeSemester: null,
  departments: [],
  users: [],
  schedules: [],
  fieldCourseAssignmentEnabled: false,
  fieldCourseCodes: [],
  schedulingReady: true,
  hasDean: true,
};

const formatActiveSemester = (data: SchedulerCacheData): string => {
  const semester = data.activeSemester;
  if (!semester) return "No active semester";

  const period = semester.semester === "1st"
    ? "1st Semester"
    : semester.semester === "2nd"
      ? "2nd Semester"
      : semester.semester === "summer"
        ? "Summer"
        : semester.semester;

  return `${period} AY ${semester.academic_year}`.trim();
};

export default function SectionTimetables() {
  const user = getStoredUser();
  const cacheKey = `scheduler:section-timetables:${user?.department_id ?? "all"}`;
  const [cached] = useState(() => getCachedData<SchedulerCacheData>(cacheKey));
  const [data, setData] = useState<SchedulerCacheData>(cached ?? emptyData);
  const [selectedSectionId, setSelectedSectionId] = useState(cached?.sections[0]?.id ?? "");
  const [mode, setMode] = useState<DeliveryModeFilter>("all");
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const liveRevision = useLiveRevision(["schedules", "sections"]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (liveRevision === 0 && (reloadKey > 0 || !hasCachedData(cacheKey))) setIsLoading(true);
      setError("");

      try {
        const response = await api.get<InitialDataResponse>("/initial-data", {
          params: { schedule_limit: 2000, view: "gantt" },
          signal: controller.signal,
        });
        const mapped = mapInitialData(response.data, {
          isVpaa: false,
          userDepartmentId: user?.department_id ?? null,
        });
        const sortedSections = [...mapped.sections].sort((left, right) => (
          left.yearLevel - right.yearLevel || left.name.localeCompare(right.name)
        ));

        const next = { ...mapped, sections: sortedSections };
        setCachedData<SchedulerCacheData>(cacheKey, next);
        setData(next);
        setSelectedSectionId((current) => (
          sortedSections.some((section) => section.id === current)
            ? current
            : sortedSections[0]?.id ?? ""
        ));
      } catch {
        if (controller.signal.aborted) return;
        setError("The section timetables could not be loaded. Please try again.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [cacheKey, reloadKey, user?.department_id, liveRevision]);

  const selectedSection = useMemo(
    () => data.sections.find((section) => section.id === selectedSectionId) ?? null,
    [data.sections, selectedSectionId],
  );

  const approvedSchedules = useMemo(() => filterVpaaApprovedSchedules(data.schedules), [data.schedules]);
  const sectionSchedules = useMemo(() => approvedSchedules.filter((schedule) => (
    schedule.sectionId === selectedSectionId && (mode === "all" || schedule.mode === mode)
  )), [approvedSchedules, mode, selectedSectionId]);

  const visibleSchedules = useMemo(() => approvedSchedules.filter((schedule) => (
    mode === "all" || schedule.mode === mode
  )), [approvedSchedules, mode]);

  const totalSubjects = useMemo(() => {
    if (!selectedSection) return 0;
    return data.subjects.filter((subject) => (
      subject.yearLevel === selectedSection.yearLevel
      && subject.semester === selectedSection.semester
    )).length;
  }, [data.subjects, selectedSection]);

  const totalScheduled = new Set(sectionSchedules.map((schedule) => schedule.subjectId)).size;
  const unplaced = Math.max(0, totalSubjects - totalScheduled);
  const placedPercent = totalSubjects > 0 ? Math.min(100, Math.round((totalScheduled / totalSubjects) * 100)) : 0;

  // The same Gantt chart as the dashboards and the master calendar.
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<ReadonlySet<number>>(new Set());
  const [now] = useState(() => new Date());
  const ganttSchedules = useMemo<CalendarSchedule[]>(
    () => sectionSchedules.map((schedule) => scheduleItemToCalendar(schedule, data.departments)),
    [sectionSchedules, data.departments],
  );
  // Overlaps are checked against every loaded class, not only this section's.
  const allGanttSchedules = useMemo<CalendarSchedule[]>(
    () => visibleSchedules.map((schedule) => scheduleItemToCalendar(schedule, data.departments)),
    [visibleSchedules, data.departments],
  );
  const ganttDays = useMemo(() => {
    const dayIndexes = ganttSchedules.some((schedule) => dayIndexOf(schedule.day) === 6)
      ? [0, 1, 2, 3, 4, 5, 6]
      : [0, 1, 2, 3, 4, 5];
    return buildGanttDays(ganttSchedules, "none", dayIndexes);
  }, [ganttSchedules]);
  const standardHours = useMemo<StandardHours>(() => {
    const opening = gridOpeningMinutes();
    return { opening, closing: opening + slotCount() * slotMinutes(), slotMinutes: slotMinutes() };
    // The time grid is configured by the data load, so recompute when it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const timeWindow = useMemo(() => buildTimeWindow(standardHours, ganttSchedules), [standardHours, ganttSchedules]);
  const overlaps = useMemo(() => findOverlaps(allGanttSchedules), [allGanttSchedules]);
  const toggleDay = useCallback((day: number) => setCollapsedDays((current) => {
    const next = new Set(current);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    return next;
  }), []);

  return (
    <div className="mt-6 space-y-4">
      <div id="section-timetables-filters" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-600">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#4e0a10]" />
            <span className="sr-only">Section</span>
            <select
              value={selectedSectionId}
              onChange={(event) => setSelectedSectionId(event.target.value)}
              disabled={isLoading || data.sections.length === 0}
              className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#4e0a10] disabled:bg-slate-100 sm:min-w-56"
            >
              {data.sections.length === 0 && <option value="">No sections available</option>}
              {data.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name} - {yearLevelLabel(section.yearLevel)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>Mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as DeliveryModeFilter)}
              disabled={isLoading}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#4e0a10] disabled:bg-slate-100"
            >
              <option value="all">All Modes</option>
              <option value="on-site">On-Site</option>
              <option value="online">Online</option>
              <option value="field">Field</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={isLoading}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {!error && data.schedulesTruncated && (
        <TruncatedDataNotice className="mb-3">
          The department has more class meetings than can be loaded at once, so some timetables below may be missing classes.
        </TruncatedDataNotice>
      )}

      {error ? (
        <div className="flex min-h-80 flex-col items-center justify-center border border-rose-200 bg-rose-50 px-6 text-center">
          <AlertCircle className="mb-3 h-9 w-9 text-rose-500" />
          <h2 className="text-sm font-black text-rose-900">Unable to load timetables</h2>
          <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#4e0a10] px-4 text-xs font-bold text-white hover:bg-[#6b0e17]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : (
        <section aria-label="Section timetable" className="rounded-xl border border-border bg-white p-5">
          <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="truncate font-sans text-[15px] font-semibold leading-5 tracking-tight text-text">
                {selectedSection ? `${selectedSection.name} · ${yearLevelLabel(selectedSection.yearLevel)}` : "No section selected"}
              </h2>
              <p className="mt-1 text-xs text-muted">{formatActiveSemester(data)}</p>
            </div>
            <div className="ml-auto flex items-center gap-2.5" title={`${totalScheduled} placed, ${unplaced} unplaced`}>
              <span className="text-xs font-medium tabular-nums text-muted">
                <span className="font-semibold text-text">{totalScheduled}</span>/{totalSubjects} placed
              </span>
              <span
                role="progressbar"
                aria-label="Courses placed"
                aria-valuemin={0}
                aria-valuemax={totalSubjects}
                aria-valuenow={totalScheduled}
                className="block h-1.5 w-24 overflow-hidden rounded-full bg-stage-idle"
              >
                <span className={`block h-full rounded-full ${unplaced === 0 && totalSubjects > 0 ? "bg-stage-done" : "bg-accent"}`} style={{ width: `${placedPercent}%` }} />
              </span>
            </div>
          </header>

          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-border bg-parchment/60 text-xs font-medium text-muted" role="status">
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              Loading timetable…
            </div>
          ) : (
            <MasterGantt
              days={ganttDays}
              timeWindow={timeWindow}
              standardHours={standardHours}
              groupBy="none"
              zoom="fit"
              density="comfortable"
              overlaps={overlaps}
              collapsedDays={collapsedDays}
              onToggleDay={toggleDay}
              onSelect={setSelectedSchedule}
              selectedId={selectedSchedule?.id}
              now={now}
              className="max-h-[calc(100vh-17rem)] min-h-[420px]"
            />
          )}
          <ScheduleDetailModal
            schedule={selectedSchedule}
            allSchedules={allGanttSchedules}
            overlaps={overlaps}
            onClose={() => setSelectedSchedule(null)}
            onSelect={setSelectedSchedule}
          />
        </section>
      )}
    </div>
  );
}
