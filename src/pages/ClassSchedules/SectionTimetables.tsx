import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, RefreshCw } from "lucide-react";
import { useLiveRevision } from "../../hooks/useLiveRefresh";
import api from "../../lib/api";
import { getCachedData, hasCachedData, setCachedData } from "../../lib/dataCache";
import { getStoredUser } from "../../lib/storedUser";
import TimetableGrid from "./SchedulerPanel/TimetableGrid";
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
  // Schedules group, so schedule writes invalidate it. A cached copy paints on
  // a revisit while the fetch below replaces it.
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
      // A cached copy stays on screen while it is replaced; a cold key or the
      // Refresh button shows the skeleton.
      if (liveRevision === 0 && (reloadKey > 0 || !hasCachedData(cacheKey))) setIsLoading(true);
      setError("");

      try {
        const response = await api.get<InitialDataResponse>("/initial-data", {
          params: { schedule_limit: 2000 },
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

  const sectionSchedules = useMemo(() => data.schedules.filter((schedule) => (
    schedule.sectionId === selectedSectionId && (mode === "all" || schedule.mode === mode)
  )), [data.schedules, mode, selectedSectionId]);

  const visibleSchedules = useMemo(() => data.schedules.filter((schedule) => (
    mode === "all" || schedule.mode === mode
  )), [data.schedules, mode]);

  const totalSubjects = useMemo(() => {
    if (!selectedSection) return 0;
    return data.subjects.filter((subject) => (
      subject.yearLevel === selectedSection.yearLevel
      && subject.semester === selectedSection.semester
    )).length;
  }, [data.subjects, selectedSection]);

  const currentStatus = sectionSchedules[0]?.status ?? "draft";
  const totalScheduled = new Set(sectionSchedules.map((schedule) => schedule.subjectId)).size;
  const noOp = useCallback(() => undefined, []);

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
        <TimetableGrid
          sections={data.sections}
          rooms={data.rooms}
          subjects={data.subjects}
          activeSemesterText={formatActiveSemester(data)}
          activeSemester={data.activeSemester}
          selectedSectionId={selectedSectionId}
          totalScheduled={totalScheduled}
          totalSubjects={totalSubjects}
          isEditable={false}
          isPhase2Active={false}
          currentStatus={currentStatus}
          schedules={visibleSchedules}
          sectionSchedules={sectionSchedules}
          hoveredCell={null}
          draggedScheduleId={null}
          deleteConfirmScheduleId={null}
          setDeleteConfirmScheduleId={noOp}
          conflictInfo={null}
          setConflictInfo={noOp}
          placementSubjectId={null}
          movingScheduleId={null}
          cancelPlacement={noOp}
          handleCellClick={noOp}
          getClassesCountForDay={(dayIndex) => sectionSchedules.filter((schedule) => schedule.dayIndex === dayIndex).length}
          getDragOverConflict={() => false}
          setIsRoomViewOpen={noOp}
          handleDragOver={noOp}
          handleDragLeave={noOp}
          handleDrop={noOp}
          handleDragStartFromCell={noOp}
          handleDragEnd={noOp}
          handleRemoveSchedule={noOp}
          handleScheduleCardClick={noOp}
          handleEditMovingSchedule={noOp}
          isLoading={isLoading}
          isReadOnlyViewer
        />
      )}
    </div>
  );
}
