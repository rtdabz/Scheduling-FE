import { useMemo, useState } from "react";
import { CheckCircle2, Filter, X } from "lucide-react";
import { DAYS } from "../constants";
import type { ApiScheduleRecord, Course, Section } from "../types";
import { buildSummaryClasses, timeRangeLabel, type SummaryMeeting } from "./summaryRows";
import GenerationChangesPanel from "./GenerationChangesPanel";
import {
  changeBadgeLabel,
  changeBadgesByClass,
  classKey,
  type GenerationChange,
  type GenerationChangeItem,
} from "./generationChanges";

const ALL = "all";

/**
 * Step 4 — the generated timetable as a filterable list.
 *
 * A year level produces several hundred rows, so the table is the primary
 * view: a scheduler checks one section, one day, or one course at a time
 * before committing the result. Save and Generate again live in the wizard
 * footer, so the table keeps the full height of the step.
 */
export default function ScheduleSummaryStep({
  preview,
  sections,
  courses,
  roomCodeById,
  changes,
}: {
  preview: ApiScheduleRecord[];
  sections: Section[];
  courses: Course[];
  roomCodeById: Map<string, string>;
  /** `null` when the run predates change reports and its changes are unknown. */
  changes: GenerationChange[] | null;
}) {
  const [sectionFilter, setSectionFilter] = useState(ALL);
  const [dayFilter, setDayFilter] = useState(ALL);
  const [courseFilter, setCourseFilter] = useState(ALL);
  const [modeFilter, setModeFilter] = useState(ALL);
  const [changedOnly, setChangedOnly] = useState(false);

  const badgesByClass = useMemo(() => changeBadgesByClass(changes ?? []), [changes]);

  const sectionNameById = useMemo(
    () => new Map(sections.map((section) => [String(section.id), section.name])),
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

  // A class matches when any of its meetings does, and is then shown whole:
  // hiding its other days would misstate when the class actually meets.
  const filtered = useMemo(
    () =>
      classes
        .filter((item) => sectionFilter === ALL || item.sectionId === sectionFilter)
        .filter((item) => courseFilter === ALL || item.courseId === courseFilter)
        .filter((item) => dayFilter === ALL || item.parts.some((part) => part.days.includes(dayFilter)))
        .filter((item) => modeFilter === ALL || item.modes.some((mode) => mode === modeFilter))
        .filter((item) => !changedOnly || badgesByClass.has(classKey(item.sectionId, item.courseId))),
    [badgesByClass, changedOnly, classes, courseFilter, dayFilter, modeFilter, sectionFilter],
  );

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

  const filtersActive =
    sectionFilter !== ALL ||
    dayFilter !== ALL ||
    courseFilter !== ALL ||
    modeFilter !== ALL ||
    changedOnly;

  const clearFilters = () => {
    setSectionFilter(ALL);
    setDayFilter(ALL);
    setCourseFilter(ALL);
    setModeFilter(ALL);
    setChangedOnly(false);
  };

  // Narrow the table to exactly one class; any other filter could hide it.
  const focusClass = (item: GenerationChangeItem) => {
    clearFilters();
    setSectionFilter(String(item.section_id));
    setCourseFilter(String(item.course_id));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
        <p className="flex items-center gap-2 text-sm font-black text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          {rows.length} class meetings generated for {classes.length} class
          {classes.length === 1 ? "" : "es"} across {sections.length} section
          {sections.length === 1 ? "" : "s"}
        </p>
      </section>

      {changes !== null && (
        <GenerationChangesPanel changes={changes} onFocusClass={focusClass} />
      )}

      <section className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <span className="flex items-center gap-1.5 pb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
            <Filter className="h-3.5 w-3.5" /> Filters
          </span>
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
            <label className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(event) => setChangedOnly(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Changed only
            </label>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="mb-0.5 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          <span className="mb-1 ml-auto text-[11px] font-bold text-slate-500">
            Showing {filtered.length} of {classes.length} classes
          </span>
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {["Section", "Course", "Day", "Time", "Room", "Mode"].map(
                (heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-slate-500"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-xs font-semibold text-slate-500"
                >
                  No class meetings match these filters.
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr key={item.key} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2.5 text-xs font-black text-slate-900">
                  {item.sectionName}
                </td>
                <td className="px-3 py-2.5">
                  <span className="block text-xs font-black text-slate-900">
                    {item.courseCode}
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-slate-600">
                    {item.courseName}
                  </span>
                  {badgesByClass.get(classKey(item.sectionId, item.courseId))?.map((change) => (
                    <span
                      key={change.kind}
                      className={`mr-1 mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                        change.severity === "critical"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {changeBadgeLabel(change)}
                    </span>
                  ))}
                </td>
                {/* One line per part, so each day lines up with its own time and room. */}
                <td className="px-3 py-2.5 text-xs font-semibold text-slate-700">
                  {item.parts.map((part, index) => (
                    <span key={index} className="block leading-5">
                      {part.dayLabel}
                    </span>
                  ))}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-700">
                  {item.parts.map((part, index) => (
                    <span key={index} className="block leading-5">
                      {timeRangeLabel(part.start, part.end)}
                      {part.meeting && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-400">
                          {part.meeting === "laboratory" ? "Lab" : part.meeting === "lecture" ? "Lec" : part.meeting}
                        </span>
                      )}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2.5 text-xs font-semibold text-slate-700">
                  {item.parts.map((part, index) => (
                    <span key={index} className="block leading-5">
                      {part.room}
                    </span>
                  ))}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[10px] font-black uppercase text-slate-700">
                  {item.modes.map((mode, index) => (
                    <span key={mode}>
                      {index > 0 && <span className="mx-1 text-slate-300">|</span>}
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{mode}</span>
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-800"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
