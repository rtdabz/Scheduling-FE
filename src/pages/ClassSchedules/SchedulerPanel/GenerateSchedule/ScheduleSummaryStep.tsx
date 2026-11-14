import { useMemo, useState, type ReactNode } from "react";
import { Lightbulb, X } from "lucide-react";
import { DAYS } from "../constants";
import type { ApiScheduleRecord, Course, Section } from "../types";
import { buildSummaryClasses, type SummaryMeeting } from "./summaryRows";
import ClassSummaryTable from "../../../../components/scheduling/ClassSummaryTable";
import GenerationChangesPanel from "./GenerationChangesPanel";
import {
  changeBadgeLabel,
  changeBadgesByClass,
  classKey,
  type GenerationChange,
  type GenerationChangeItem,
} from "./generationChanges";
import type { GenerationRecommendation } from "./yearLevelGenerationFailure";
import RecommendationList from "./RecommendationList";
import CollapsibleNotice from "./CollapsibleNotice";
import { groupRecommendations } from "./recommendationGroups";
import SearchField from "../components/SearchField";

const ALL = "all";

export default function ScheduleSummaryStep({
  preview,
  sections,
  courses,
  roomCodeById,
  changes,
  recommendations = [],
  onApplyRecommendation,
  applying = false,
  unplacedCount = 0,
  attention = null,
  attentionKeys,
}: {
  preview: ApiScheduleRecord[];
  sections: Section[];
  courses: Course[];
  roomCodeById: Map<string, string>;
  changes: GenerationChange[] | null;
  recommendations?: GenerationRecommendation[];
  onApplyRecommendation?: (recommendation: GenerationRecommendation) => void;
  applying?: boolean;
  unplacedCount?: number;
  attention?: ReactNode;
  attentionKeys?: Set<string>;
}) {
  const [sectionFilter, setSectionFilter] = useState(ALL);
  const [dayFilter, setDayFilter] = useState(ALL);
  const [courseFilter, setCourseFilter] = useState(ALL);
  const [modeFilter, setModeFilter] = useState(ALL);
  const [changedOnly, setChangedOnly] = useState(false);
  const [search, setSearch] = useState("");

  const badgesByClass = useMemo(
    () => changeBadgesByClass(changes ?? []),
    [changes],
  );

  const sectionNameById = useMemo(
    () =>
      new Map(sections.map((section) => [String(section.id), section.name])),
    [sections],
  );
  const courseById = useMemo(
    () => new Map(courses.map((course) => [String(course.id), course])),
    [courses],
  );

  const rows = useMemo<SummaryMeeting[]>(
    () =>
      preview.map((record) => {
        const courseId = String(record.course_id ?? record.subject_id ?? "");
        const course = courseById.get(courseId);
        const roomId = record.room_id === null ? "" : String(record.room_id);

        return {
          sectionId: String(record.section_id),
          sectionName:
            sectionNameById.get(String(record.section_id)) ??
            `Section ${record.section_id}`,
          courseId,
          courseCode:
            course?.code ??
            record.course?.course_code ??
            record.course?.subject_code ??
            courseId,
          courseName: course?.name ?? record.course?.course_name ?? "",
          day: record.day,
          start: record.start_time.slice(0, 5),
          end: record.end_time.slice(0, 5),
          mode: record.mode ?? "on-site",
          room:
            record.mode === "online"
              ? "Online"
              : (roomCodeById.get(roomId) ?? "TBA"),
          meeting: record.meeting_type ?? "",
        };
      }),
    [courseById, preview, roomCodeById, sectionNameById],
  );

  const classes = useMemo(() => buildSummaryClasses(rows), [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return classes
      .filter(
        (item) =>
          !query ||
          `${item.courseCode} ${item.courseName} ${item.sectionName}`
            .toLowerCase()
            .includes(query),
      )
      .filter(
        (item) => sectionFilter === ALL || item.sectionId === sectionFilter,
      )
      .filter((item) => courseFilter === ALL || item.courseId === courseFilter)
      .filter(
        (item) =>
          dayFilter === ALL ||
          item.parts.some((part) => part.days.includes(dayFilter)),
      )
      .filter(
        (item) =>
          modeFilter === ALL || item.modes.some((mode) => mode === modeFilter),
      )
      .filter(
        (item) =>
          !changedOnly ||
          badgesByClass.has(classKey(item.sectionId, item.courseId)),
      );
  }, [
    badgesByClass,
    changedOnly,
    classes,
    courseFilter,
    dayFilter,
    modeFilter,
    search,
    sectionFilter,
  ]);

  const usedCourses = useMemo(
    () =>
      Array.from(
        new Map(rows.map((row) => [row.courseId, row.courseCode])).entries(),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [rows],
  );
  const usedDays = useMemo(
    () => DAYS.filter((day) => rows.some((row) => row.day === day)),
    [rows],
  );
  const usedModes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.mode))).sort(),
    [rows],
  );

  // The same grouping the list renders, so the header count matches what opens below it.
  const suggestionGroups = useMemo(() => groupRecommendations(recommendations), [recommendations]);
  const suggestionCount = suggestionGroups.groups.length + suggestionGroups.manual.length;
  const hasSuggestions = suggestionCount > 0 || suggestionGroups.resolved.length > 0;

  const filtersActive =
    sectionFilter !== ALL ||
    dayFilter !== ALL ||
    courseFilter !== ALL ||
    modeFilter !== ALL ||
    changedOnly ||
    search.trim() !== "";

  const clearFilters = () => {
    setSectionFilter(ALL);
    setDayFilter(ALL);
    setCourseFilter(ALL);
    setModeFilter(ALL);
    setChangedOnly(false);
    setSearch("");
  };

  const focusClass = (item: GenerationChangeItem) => {
    clearFilters();
    setSectionFilter(String(item.section_id));
    setCourseFilter(String(item.course_id));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <GenerationChangesPanel
        summary={
          // Three separate stats so meetings, classes and sections read as distinct figures.
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-[13px]">
            <span>
              <strong className="text-base font-bold tabular-nums text-[#4A0D16]">
                {rows.length}
              </strong>{" "}
              class meetings generated
            </span>
            <span aria-hidden="true" className="h-4 w-px bg-[#701522]/20" />
            <span>
              <strong className="text-base font-bold tabular-nums text-[#4A0D16]">
                {classes.length}
              </strong>{" "}
              class{classes.length === 1 ? "" : "es"}
            </span>
            <span aria-hidden="true" className="h-4 w-px bg-[#701522]/20" />
            <span>
              <strong className="text-base font-bold tabular-nums text-[#4A0D16]">
                {sections.length}
              </strong>{" "}
              section{sections.length === 1 ? "" : "s"}
            </span>
            {unplacedCount > 0 && (
              <span className="rounded-full border border-[#F5A623]/45 bg-[#F5A623]/10 px-2 py-0.5 text-[11px] font-semibold text-[#8A5A12]">
                {unplacedCount} course{unplacedCount === 1 ? "" : "s"} not
                placed yet
              </span>
            )}
          </span>
        }
        changes={changes}
        onFocusClass={focusClass}
      />

      {attention}

      {hasSuggestions && !attention && (
        // Optional improvements: one line until opened, so the generated timetable stays in view.
        <CollapsibleNotice
          icon={Lightbulb}
          label="Suggestions"
          count={suggestionCount}
          description="Optional changes that may improve this timetable"
          tone="suggestion"
          className="shrink-0"
        >
          <RecommendationList
            recommendations={recommendations}
            heading="Suggestions"
            busy={applying}
            onApply={onApplyRecommendation}
            embedded
          />
        </CollapsibleNotice>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex min-h-[24rem] min-w-0 flex-1 flex-col gap-2 lg:min-h-0">
          <section
            aria-label="Filter the generated schedule"
            className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-[#E8DFD6] bg-white px-3 py-2"
          >
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search course or section..."
              clearLabel="Clear schedule search"
              className="w-full sm:w-60"
              inputClassName="h-8 !py-0 border-[#E8DFD6] focus:ring-[#701522]/15 focus:border-[#701522]"
            />
            <FilterSelect
              label="Section"
              value={sectionFilter}
              onChange={setSectionFilter}
              options={sections.map((section) => [
                String(section.id),
                section.name,
              ])}
              allLabel="All sections"
            />
            <FilterSelect
              label="Day"
              value={dayFilter}
              onChange={setDayFilter}
              options={usedDays.map((day) => [day, day])}
              allLabel="All days"
            />
            <FilterSelect
              label="Course"
              value={courseFilter}
              onChange={setCourseFilter}
              options={usedCourses}
              allLabel="All courses"
            />
            <FilterSelect
              label="Mode"
              value={modeFilter}
              onChange={setModeFilter}
              options={usedModes.map((mode) => [mode, mode])}
              allLabel="All modes"
            />
            {badgesByClass.size > 0 && (
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11px] font-semibold text-[#3f342e] transition hover:bg-[#F7F4F0]">
                <input
                  type="checkbox"
                  checked={changedOnly}
                  onChange={(event) => setChangedOnly(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[#DDD2C7] accent-[#701522]"
                />
                Changed only
              </label>
            )}
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[#701522] transition hover:bg-[#F5E9EA]"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
            <span className="ml-auto whitespace-nowrap text-[11px] font-medium tabular-nums text-[#6b5f57]">
              Showing{" "}
              <strong className="font-bold text-[#4A0D16]">
                {filtered.length}
              </strong>{" "}
              of {classes.length} classes
            </span>
          </section>

          <ClassSummaryTable
            classes={filtered}
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E8DFD6] bg-white shadow-[0_1px_2px_rgb(74_13_22/0.04)]"
            scrollClassName="min-h-0 flex-1 overflow-auto"
            isRowFlagged={(item) =>
              attentionKeys?.has(
                `${Number(item.sectionId)}:${Number(item.courseId)}`,
              ) ?? false
            }
            renderCourseExtras={(item) => [
              attentionKeys?.has(
                `${Number(item.sectionId)}:${Number(item.courseId)}`,
              ) ? (
                <span
                  key="attention"
                  className="mr-1 mt-1 inline-block rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700 ring-1 ring-inset ring-rose-200"
                >
                  Needs fix
                </span>
              ) : null,
              ...(badgesByClass
                .get(classKey(item.sectionId, item.courseId))
                ?.map((change) => (
                  <span
                    key={change.kind}
                    className={`mr-1 mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${
                      change.severity === "critical"
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : "bg-[#F5A623]/10 text-[#8A5A12] ring-[#F5A623]/40"
                    }`}
                  >
                    {changeBadgeLabel(change)}
                  </span>
                )) ?? []),
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  allLabel: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-8 max-w-[11rem] rounded-md border px-2 text-[11px] font-semibold outline-none transition focus:border-[#701522] focus:ring-2 focus:ring-[#701522]/15 ${
        value === ALL
          ? "border-[#E8DFD6] bg-white text-[#5b4f48] hover:border-[#DDD2C7]"
          : "border-[#701522]/40 bg-[#F5E9EA] text-[#4A0D16]"
      }`}
    >
      <option value={ALL}>{allLabel}</option>
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  );
}
