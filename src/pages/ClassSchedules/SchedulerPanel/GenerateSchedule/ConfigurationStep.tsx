import { AlertTriangle, CalendarDays, Clock3 } from "lucide-react";
import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";
import type { Course, Section, Semester } from "../types";
import YearLevelCurriculumSelector from "./YearLevelCurriculumSelector";
import { orderDays, PERIOD_RANGES, type TimeBlockOption } from "./generationTypes";
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

/** The slice of a section's configuration this step writes. */
export type PeriodConfig = {
  preferredTimeBlock?: TimeBlockOption;
};

/**
 * The teaching periods a section can be restricted to. These are wall-clock
 * windows, and the generator treats an assignment as a hard limit rather than
 * a nudge: a section placed in Morning never receives an afternoon class.
 */
const PERIOD_OPTIONS: Array<{
  value: Exclude<TimeBlockOption, "flexible">;
  label: string;
  range: string;
}> = [
  { value: "morning", label: "Morning", range: PERIOD_RANGES.morning },
  { value: "afternoon", label: "Afternoon", range: PERIOD_RANGES.afternoon },
  { value: "evening", label: "Evening", range: PERIOD_RANGES.evening },
];

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
 * Step 1 — scope on top, the year level's Preferred Days, then the
 * section-level Preferred Meetings board.
 *
 * Course-level rules (Required Day, Preferred Room, Custom Time Duration)
 * live in each course's Configure panel in Step 2, next to the rest of that
 * course's setup. What is left here applies to whole sections.
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
  configs,
  onConfigChange,
  preferredDays,
  onPreferredDaysChange,
  requiredDayRules = [],
  sundayOnlineOnly = null,
  onSundayOnlineOnlyChange,
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
  configs: Record<string, PeriodConfig>;
  onConfigChange: (
    sectionId: string,
    change: { preferredTimeBlock: TimeBlockOption },
  ) => void;
  preferredDays: string[];
  onPreferredDaysChange: (days: string[]) => void;
  /** The department's Required Days, to flag one the chosen days leave out. */
  requiredDayRules?: Array<{ course_id: number; day: string }>;
  /**
   * The department's Sunday rule for major courses; null while it loads.
   * Minor courses never meet on Sunday, and field NSTP keeps its own rule.
   */
  sundayOnlineOnly?: boolean | null;
  onSundayOnlineOnlyChange?: (onlineOnly: boolean) => void;
}) {
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

  const periodOf = (id: string): TimeBlockOption =>
    configs[id]?.preferredTimeBlock ?? "flexible";
  const assignedPeriodCount = sections.filter(
    (section) => periodOf(section.id) !== "flexible",
  ).length;
  // Clicking the period a section already has clears it back to any time.
  const togglePeriod = (id: string, value: TimeBlockOption) =>
    onConfigChange(id, {
      preferredTimeBlock: periodOf(id) === value ? "flexible" : value,
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
                ? "Any day. Pick days to schedule this year level only on them."
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

            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                title={day}
                disabled={disabled}
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
        {sundayOnlineOnly !== null && onSundayOnlineOnlyChange && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black leading-tight text-slate-900">
                Sunday classes
              </p>
              <p className="text-[11px] font-semibold leading-tight text-slate-500">
                {preferredDays.length > 0 && !preferredDays.includes("Sunday")
                  ? "Sunday is not in the Preferred Days, so this run places nothing on it."
                  : sundayOnlineOnly
                    ? "Major courses may meet on Sunday online only. Minor courses never meet on Sunday."
                    : "Major courses may meet on Sunday face-to-face or online. Minor courses never meet on Sunday."}
              </p>
            </div>
            <div
              role="group"
              aria-label="Sunday classes"
              className="grid shrink-0 grid-cols-2 gap-1"
            >
              {[
                { onlineOnly: true, label: "Online only" },
                { onlineOnly: false, label: "Face-to-face" },
              ].map((option) => {
                const selected = sundayOnlineOnly === option.onlineOnly;

                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => {
                      if (!selected) onSundayOnlineOnlyChange(option.onlineOnly);
                    }}
                    className={`rounded-md border px-2 py-1 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section
        id="generator-rules"
        className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white/70"
      >
        <header
          id="generator-column-periods"
          className="flex items-start gap-2 border-b border-slate-200 px-3 py-2.5"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#4e0a10]/10 text-[#4e0a10]">
            <Clock3 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight text-slate-900">
              Preferred Meetings
            </p>
            <p className="text-[11px] font-semibold leading-tight text-slate-500">
              Click a period to keep a section inside it. Required Day and Preferred Room are
              set per course in Setup Courses.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#4e0a10] px-2 py-0.5 text-[11px] font-black text-white">
            {assignedPeriodCount}
          </span>
        </header>
        <div className="max-h-[22rem] min-h-[120px] flex-1 overflow-y-auto p-2.5">
          {sections.length === 0 ? (
            <p className="px-1 py-2 text-[11px] font-semibold text-slate-500">
              No active sections for this year level.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {sections.map((section) => {
                const period = periodOf(section.id);
                const active = PERIOD_OPTIONS.find(
                  (option) => option.value === period,
                );

                return (
                  <div
                    key={section.id}
                    className={`rounded-lg border p-2 transition ${
                      active
                        ? "border-[#4e0a10] bg-[#fff8e8] ring-1 ring-[#4e0a10]/25"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <p className="truncate text-xs font-black leading-tight text-slate-900">
                      {section.name}
                    </p>
                    <div
                      role="group"
                      aria-label={`Preferred meeting period for ${section.name}`}
                      className="mt-1.5 grid grid-cols-3 gap-1"
                    >
                      {PERIOD_OPTIONS.map((option) => {
                        const selected = period === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            title={`${option.label}: ${option.range}`}
                            disabled={disabled}
                            onClick={() =>
                              togglePeriod(section.id, option.value)
                            }
                            className={`rounded-md border px-1 py-1 text-[10px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              selected
                                ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[10px] font-semibold leading-tight text-slate-500">
                      {active ? active.range : "Any time within operating hours"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
