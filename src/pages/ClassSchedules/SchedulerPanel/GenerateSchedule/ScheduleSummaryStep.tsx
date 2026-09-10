import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Filter,
  Loader2,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { DAYS } from "../constants";
import type { ApiScheduleRecord, Course, Section } from "../types";

type Row = {
  key: string;
  sectionId: string;
  sectionName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  day: string;
  start: string;
  end: string;
  mode: string;
  room: string;
  meeting: string;
};

const timeLabel = (value: string) => {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${displayHour}:${minuteText ?? "00"} ${suffix}`;
};

const ALL = "all";

/**
 * Step 4 — the generated timetable as a filterable list.
 *
 * A year level produces several hundred rows, so the table is the primary
 * view: a scheduler checks one section, one day, or one course at a time
 * before committing the result.
 */
export default function ScheduleSummaryStep({
  preview,
  sections,
  courses,
  roomCodeById,
  applying,
  canApply,
  onApply,
  onGenerateAgain,
  generating,
}: {
  preview: ApiScheduleRecord[];
  sections: Section[];
  courses: Course[];
  roomCodeById: Map<string, string>;
  applying: boolean;
  canApply: boolean;
  onApply: () => void;
  onGenerateAgain: () => void;
  generating: boolean;
}) {
  const [sectionFilter, setSectionFilter] = useState(ALL);
  const [dayFilter, setDayFilter] = useState(ALL);
  const [courseFilter, setCourseFilter] = useState(ALL);
  const [modeFilter, setModeFilter] = useState(ALL);

  const sectionNameById = useMemo(
    () => new Map(sections.map((section) => [String(section.id), section.name])),
    [sections],
  );
  const courseById = useMemo(
    () => new Map(courses.map((course) => [String(course.id), course])),
    [courses],
  );

  const rows = useMemo<Row[]>(
    () =>
      preview.map((record, index) => {
        const courseId = String(record.course_id ?? record.subject_id ?? "");
        const course = courseById.get(courseId);
        const roomId = record.room_id === null ? "" : String(record.room_id);

        return {
          key: `${record.id ?? "row"}-${index}`,
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

  const filtered = useMemo(
    () =>
      rows
        .filter((row) => sectionFilter === ALL || row.sectionId === sectionFilter)
        .filter((row) => dayFilter === ALL || row.day === dayFilter)
        .filter((row) => courseFilter === ALL || row.courseId === courseFilter)
        .filter((row) => modeFilter === ALL || row.mode === modeFilter)
        .sort(
          (left, right) =>
            left.sectionName.localeCompare(right.sectionName) ||
            DAYS.indexOf(left.day) - DAYS.indexOf(right.day) ||
            left.start.localeCompare(right.start),
        ),
    [courseFilter, dayFilter, modeFilter, rows, sectionFilter],
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
    modeFilter !== ALL;

  const clearFilters = () => {
    setSectionFilter(ALL);
    setDayFilter(ALL);
    setCourseFilter(ALL);
    setModeFilter(ALL);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-black text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            {rows.length} class meetings generated across {sections.length}{" "}
            section{sections.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onGenerateAgain}
              disabled={generating || applying}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Generate again
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={applying || generating || !canApply}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" /> Save &amp; View Timetable
                </>
              )}
            </button>
          </div>
        </div>
      </section>

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
            Showing {filtered.length} of {rows.length}
          </span>
        </div>
      </section>

      <div className="min-h-0 max-h-[55vh] flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
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
            {filtered.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="px-3 py-2 text-xs font-black text-slate-900">
                  {row.sectionName}
                </td>
                <td className="px-3 py-2">
                  <span className="block text-xs font-black text-slate-900">
                    {row.courseCode}
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-slate-600">
                    {row.courseName}
                    {row.meeting && ` · ${row.meeting}`}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs font-semibold text-slate-700">
                  {row.day}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-700">
                  {timeLabel(row.start)} - {timeLabel(row.end)}
                </td>
                <td className="px-3 py-2 text-xs font-semibold text-slate-700">
                  {row.room}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-700">
                    {row.mode}
                  </span>
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
