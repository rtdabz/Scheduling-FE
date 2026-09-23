import { useState } from "react";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";
import type { Course, Section, Semester } from "../types";
import YearLevelCurriculumSelector from "./YearLevelCurriculumSelector";
import { orderDays } from "./generationTypes";
import { YearLevelStateBadge } from "./YearLevelStateNotice";
import type { YearLevelScheduleState } from "./yearLevelGenerationEligibility";
import type { CourseDefaults } from "./courseClassConfig";

export type SetupDraft = {
  completed: boolean;
  /**
   * Step 1's Preferred Days, in calendar order. Empty means every day is open.
   * One choice for the whole year level: it is sent as `allowed_days` on every
   * section, and the generator places no meeting -- regular, Split Session or
   * Hybrid -- on a day left out.
   */
  preferredDays: string[];
  /** Step 2's Default Settings, for the whole year level. */
  courseDefaults: CourseDefaults;
  /** Step 2: courses unchecked in Setup Courses, left out of this run. */
  excludedCourseIds: string[];
  /** Step 2: courses saved from their own Configure panel, which the defaults skip. */
  customizedCourseIds: string[];
};

const yearLabel = (yearLevel: number) => {
  const ordinal =
    yearLevel === 1
      ? "1st"
      : yearLevel === 2
        ? "2nd"
        : yearLevel === 3
          ? "3rd"
          : "4th";

  return `BSIT ${ordinal} year`;
};

/**
 * Step 1 — scope on top, then the year level's Preferred Days.
 *
 * Course-level rules (Required Day, Preferred Room, Custom Time Duration)
 * live in each course's Configure panel in Step 2, next to the rest of that
 * course's setup. What is left here applies to the whole year level.
 */
export default function ConfigurationStep({
  activeSemester,
  years,
  yearLevel,
  onYearChange,
  departmentId,
  sections,
  courses,
  onCurriculumApplied,
  yearStates,
  yearChangeDisabled,
  actionsDisabled,
  preferredDays,
  onPreferredDaysChange,
  requiredDayRules = [],
  sundayClassesEnabled = null,
  canManageSundayClasses = false,
  sundayClassCount = 0,
  onSundayClassesChange,
}: {
  activeSemester: Semester | null;
  years: number[];
  yearLevel: number;
  onYearChange: (value: number) => void;
  departmentId: number | null;
  sections: Section[];
  courses: Course[];
  onCurriculumApplied: (curriculumId: number) => void | Promise<void>;
  yearStates: Record<number, YearLevelScheduleState>;
  /**
   * Kept apart from `actionsDisabled`: a locked year level disables its rules,
   * but the picker must stay usable or the user is stuck on that year level.
   */
  yearChangeDisabled: boolean;
  actionsDisabled: boolean;
  preferredDays: string[];
  onPreferredDaysChange: (days: string[]) => void;
  /** The department's Required Days, to flag one the chosen days leave out. */
  requiredDayRules?: Array<{ course_id: number; day: string }>;
  /**
   * The department's Sunday Classes setting; null while it loads. Off, the
   * generator and manual scheduling place nothing on Sunday.
   */
  sundayClassesEnabled?: boolean | null;
  /** Only the department secretary may change it. */
  canManageSundayClasses?: boolean;
  /** Classes already on Sunday, which stay when Sunday is turned off. */
  sundayClassCount?: number;
  onSundayClassesChange?: (enabled: boolean) => void | Promise<void>;
}) {
  const [savingSunday, setSavingSunday] = useState(false);
  const sundayClosed = sundayClassesEnabled === false;
  const toggleSundayClasses = async () => {
    if (!onSundayClassesChange || sundayClassesEnabled === null) return;
    setSavingSunday(true);
    try {
      await onSundayClassesChange(!sundayClassesEnabled);
    } finally {
      setSavingSunday(false);
    }
  };
  const toggleDay = (day: string) =>
    onPreferredDaysChange(
      orderDays(
        preferredDays.includes(day)
          ? preferredDays.filter((item) => item !== day)
          : [...preferredDays, day],
      ),
    );
  // The server refuses a run whose Preferred Days leave out a course's
  // Required Day; saying so here saves the round trip.
  const excludedRequiredDays =
    preferredDays.length === 0
      ? []
      : requiredDayRules.flatMap((rule) => {
          const course = courses.find(
            (item) => Number(item.id) === Number(rule.course_id),
          );
          return course && !preferredDays.includes(rule.day)
            ? [`${course.code} (${rule.day})`]
            : [];
        });

  const disabled = actionsDisabled;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label
            htmlFor="generator-year-level"
            className="block text-[11px] font-black uppercase tracking-wide text-slate-500"
          >
            Choose year level
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select
              id="generator-year-level"
              aria-label="Year level"
              value={yearLevel}
              disabled={yearChangeDisabled || years.length === 0}
              onChange={(event) => onYearChange(Number(event.target.value))}
              className="h-11 min-w-[9rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {yearLabel(value)}
                </option>
              ))}
            </select>
            <YearLevelStateBadge state={yearStates[yearLevel] ?? null} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-2 text-center">
            <div className="min-w-[6rem] flex-1 rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Sections
              </dt>
              <dd className="text-lg font-black leading-none text-slate-900">
                {sections.length}
              </dd>
            </div>
            <div className="min-w-[6rem] flex-1 rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Courses
              </dt>
              <dd className="text-lg font-black leading-none text-slate-900">
                {courses.length}
              </dd>
            </div>
          </dl>
        </div>

        <YearLevelCurriculumSelector
          departmentId={departmentId}
          semesterId={activeSemester?.id ?? null}
          yearLevel={yearLevel}
          sections={sections}
          onApplied={onCurriculumApplied}
          disabled={actionsDisabled}
        />
      </section>

      <section
        id="generator-preferred-days"
        className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5"
      >
        <div className="flex flex-wrap items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#4e0a10]/10 text-[#4e0a10]">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight text-slate-900">
              Preferred Days
            </p>
            <p className="text-[11px] font-semibold leading-tight text-slate-500">
              {preferredDays.length === 0
                ? sundayClosed
                  ? "Any day from Monday to Saturday. Pick days to schedule this year level only on them."
                  : "Any day. Pick days to schedule this year level only on them."
                : `Every class, including Split Session and Hybrid, meets only on ${preferredDays.join(", ")}.`}
            </p>
          </div>
          {preferredDays.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPreferredDaysChange([])}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-black text-[#4e0a10] hover:bg-[#4e0a10]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
        <div
          role="group"
          aria-label="Preferred days"
          className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-7"
        >
          {FULL_DAY_NAMES.map((day) => {
            const selected = preferredDays.includes(day);
            const closed = day === "Sunday" && sundayClosed && !selected;

            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                title={closed ? "Sunday classes are not enabled for this department" : day}
                disabled={disabled || closed}
                onClick={() => toggleDay(day)}
                className={`rounded-md border px-1 py-1.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {day.slice(0, 3)}
              </button>
            );
          })}
        </div>
        {sundayClassesEnabled !== null && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black leading-tight text-slate-900">
                Sunday classes
              </p>
              <p className="text-[11px] font-semibold leading-tight text-slate-500">
                {sundayClassesEnabled
                  ? "On. Generation and manual scheduling may use Sunday."
                  : canManageSundayClasses
                    ? "Off. Turn on after the dean approves Sunday classes for this department."
                    : "Off. Only the department secretary can turn on Sunday classes."}
              </p>
            </div>
            {canManageSundayClasses && onSundayClassesChange && (
              <button
                type="button"
                role="switch"
                aria-checked={sundayClassesEnabled}
                aria-label="Sunday classes"
                disabled={savingSunday}
                onClick={() => void toggleSundayClasses()}
                title={sundayClassesEnabled ? "Disable Sunday classes" : "Enable Sunday classes"}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  savingSunday
                    ? "cursor-not-allowed bg-gray-200 opacity-50"
                    : sundayClassesEnabled
                      ? "cursor-pointer bg-[#4e0a10]"
                      : "cursor-pointer bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    sundayClassesEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            )}
          </div>
        )}
        {sundayClosed && sundayClassCount > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold leading-tight text-amber-800">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {sundayClassCount} {sundayClassCount === 1 ? "class is" : "classes are"} already on Sunday this semester.
            They stay on the timetable, but no new class can be placed on Sunday.
          </p>
        )}
        {preferredDays.length === 1 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold leading-tight text-amber-800">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Hybrid classes meet on two different days, so one day cannot hold them.
            A Split Session falls back to a single meeting.
          </p>
        )}
        {excludedRequiredDays.length > 0 && (
          <p
            role="alert"
            className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold leading-tight text-red-700"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Required Day not in the Preferred Days: {excludedRequiredDays.join(", ")}.
            Add the day here, or change the Required Day in Setup Courses.
          </p>
        )}
      </section>
    </div>
  );
}
