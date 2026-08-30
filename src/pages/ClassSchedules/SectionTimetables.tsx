import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { getStoredUser } from "../../lib/storedUser";
import TimetableGrid from "./SchedulerPanel/TimetableGrid";
import {
  mapInitialData,
  type InitialDataResponse,
  type SchedulerCacheData,
} from "./SchedulerPanel/hooks/initialDataMapper";
import type { ScheduleItem } from "./SchedulerPanel/types";

type DeliveryModeFilter = "all" | ScheduleItem["mode"];

const emptyData: SchedulerCacheData = {
  rooms: [],
  sections: [],
  subjects: [],
  faculties: [],
  activeTerm: null,
  departments: [],
  users: [],
  schedules: [],
  fieldCourseAssignmentEnabled: false,
  fieldCourseCodes: [],
};

const formatActiveTerm = (data: SchedulerCacheData): string => {
  const term = data.activeTerm;
  if (!term) return "No active term";

  const semester = term.semester === "1st"
    ? "1st Semester"
    : term.semester === "2nd"
      ? "2nd Semester"
      : term.semester === "summer"
        ? "Summer"
        : term.semester;

  return `${semester} AY ${term.academic_year}`.trim();
};

export default function SectionTimetables() {
  const user = getStoredUser();
  const [data, setData] = useState<SchedulerCacheData>(emptyData);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [mode, setMode] = useState<DeliveryModeFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
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

        setData({ ...mapped, sections: sortedSections });
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
  }, [reloadKey, user?.department_id]);

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
      <div className="flex flex-col gap-3 border-y border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                  {section.name} - Year {section.yearLevel}
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
          activeTermText={formatActiveTerm(data)}
          activeTerm={data.activeTerm}
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
          handleClearAll={noOp}
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
