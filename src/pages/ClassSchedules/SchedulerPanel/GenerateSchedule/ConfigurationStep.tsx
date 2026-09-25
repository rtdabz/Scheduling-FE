import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Users,
  type LucideIcon,
} from "lucide-react";
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

const FIELD_LABEL =
  "block text-[11px] font-black uppercase tracking-wide text-slate-500";

/**
 * Step 1 — two cards side by side: what to schedule (year level and
 * curriculum) and when (the year level's Preferred Days).
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
  // No pick means every open day is allowed, so the tiles show "Open" rather
  // than looking switched off.
  const anyDay = preferredDays.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <CardHeading
            icon={GraduationCap}
            title="Year level & curriculum"
            detail="Every later step applies to the sections of this year level."
          />

          <div className="mt-4">
            <label htmlFor="generator-year-level" className={FIELD_LABEL}>
              Year level
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <select
                id="generator-year-level"
                aria-label="Year level"
                value={yearLevel}
                disabled={yearChangeDisabled || years.length === 0}
                onChange={(event) => onYearChange(Number(event.target.value))}
                className="h-11 min-w-[9rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {years.map((value) => (
                  <option key={value} value={value}>
                    {yearLabel(value)}
                  </option>
                ))}
              </select>
              <YearLevelStateBadge state={yearStates[yearLevel] ?? null} />
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Sections</dt>
                <Users className="h-3.5 w-3.5" aria-hidden />
                <dd>
                  <span className="font-black text-slate-900">{sections.length}</span>{" "}
                  {sections.length === 1 ? "section" : "sections"}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Courses</dt>
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                <dd>
                  <span className="font-black text-slate-900">{courses.length}</span>{" "}
                  {courses.length === 1 ? "course" : "courses"} this semester
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <YearLevelCurriculumSelector
              departmentId={departmentId}
              semesterId={activeSemester?.id ?? null}
              yearLevel={yearLevel}
              sections={sections}
              onApplied={onCurriculumApplied}
              disabled={actionsDisabled}
            />
          </div>
        </section>

        <section
          id="generator-preferred-days"
          className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <CardHeading
            icon={CalendarDays}
            title="Preferred Days"
            detail={
              anyDay
                ? sundayClosed
                  ? "Any day from Monday to Saturday. Pick days to schedule this year level only on them."
                  : "Any day. Pick days to schedule this year level only on them."
                : `Every class, including Split Session and Hybrid, meets only on ${preferredDays.join(", ")}.`
            }
            action={
              anyDay ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">
                  Any day
                </span>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-[#4e0a10]/10 px-2.5 py-1 text-[11px] font-black text-[#4e0a10]">
                    {preferredDays.length} {preferredDays.length === 1 ? "day" : "days"}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPreferredDaysChange([])}
                    className="rounded-md px-2 py-1 text-[11px] font-black text-[#4e0a10] hover:bg-[#4e0a10]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              )
            }
          />

          <div
            role="group"
            aria-label="Preferred days"
            className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-7"
          >
            {FULL_DAY_NAMES.map((day) => {
              const selected = preferredDays.includes(day);
              const closed = day === "Sunday" && sundayClosed && !selected;
              const [status, tone, statusTone] = closed
                ? ["Closed", "border-slate-200 bg-slate-100 text-slate-400", ""]
                : selected
                  ? ["Picked", "border-[#4e0a10] bg-[#4e0a10] text-white shadow-sm", "text-white/75"]
                  : anyDay
                    ? [
                        "Open",
                        "border-emerald-200 bg-emerald-50/60 text-slate-800 hover:border-emerald-300 hover:bg-emerald-50",
                        "text-emerald-700",
                      ]
                    : [
                        "Skipped",
                        "border-dashed border-slate-300 bg-white text-slate-400 hover:border-[#4e0a10]/40 hover:text-slate-700",
                        "",
                      ];

              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selected}
                  title={closed ? "Sunday classes are not enabled for this department" : day}
                  disabled={disabled || closed}
                  onClick={() => toggleDay(day)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 transition disabled:cursor-not-allowed ${
                    closed ? "" : "disabled:opacity-50"
                  } ${tone}`}
                >
                  <span className="text-sm font-black leading-none">{day.slice(0, 3)}</span>
                  {/* Hidden from the accessible name, which stays the short day. */}
                  <span
                    aria-hidden
                    className={`text-[10px] font-bold uppercase leading-none tracking-wide ${statusTone}`}
                  >
                    {status}
                  </span>
                </button>
              );
            })}
          </div>

          {sundayClassesEnabled !== null && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black leading-tight text-slate-900">
                  Sunday classes
                </p>
                <p className="mt-0.5 text-[11px] font-semibold leading-tight text-slate-500">
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
            <Notice tone="warning">
              {sundayClassCount} {sundayClassCount === 1 ? "class is" : "classes are"} already on Sunday this semester.
              They stay on the timetable, but no new class can be placed on Sunday.
            </Notice>
          )}
          {preferredDays.length === 1 && (
            <Notice tone="warning">
              Hybrid classes meet on two different days, so one day cannot hold them.
              A Split Session falls back to a single meeting.
            </Notice>
          )}
          {excludedRequiredDays.length > 0 && (
            <Notice tone="error">
              Required Day not in the Preferred Days: {excludedRequiredDays.join(", ")}.
              Add the day here, or change the Required Day in Setup Courses.
            </Notice>
          )}
        </section>
      </div>
    </div>
  );
}

function CardHeading({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/10 text-[#4e0a10]">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-black leading-tight text-slate-900">{title}</h3>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-500">{detail}</p>
      </div>
      {action}
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={`mt-2 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-[11px] font-semibold leading-tight ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
