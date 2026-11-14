import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  GraduationCap,
  Lock,
  RotateCcw,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";
import type { Course, Section, Semester } from "../types";
import YearLevelCurriculumSelector from "./YearLevelCurriculumSelector";
import {
  availableDays,
  excludedDays,
  includedDays,
  toggleExcludedDay,
} from "./preferredDays";
import { YearLevelStateBadge } from "./YearLevelStateNotice";
import type { YearLevelScheduleState } from "./yearLevelGenerationEligibility";
import type { CourseDefaults } from "./courseClassConfig";
import { yearLabel } from "./yearLabel";

export type SetupDraft = {
  completed: boolean;
  preferredDays: string[];
  courseDefaults: CourseDefaults;
  excludedCourseIds: string[];
};

const FIELD_LABEL =
  "block text-[11px] font-black uppercase tracking-wide text-slate-500";

export default function ConfigurationStep({
  activeSemester,
  years,
  yearLevel,
  onYearChange,
  departmentId,
  sections,
  allSections = sections,
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
  allowFridaySaturdaySplit = false,
  onAllowFridaySaturdaySplitChange,
  targetSectionIds = null,
  scheduledSectionIds = new Set<string>(),
  onTargetSectionIdsChange,
  targetBlockedReason = null,
}: {
  activeSemester: Semester | null;
  years: number[];
  yearLevel: number;
  onYearChange: (value: number) => void;
  departmentId: number | null;
  sections: Section[];
  allSections?: Section[];
  courses: Course[];
  onCurriculumApplied: (curriculumId: number) => void | Promise<void>;
  yearStates: Record<number, YearLevelScheduleState>;
  yearChangeDisabled: boolean;
  actionsDisabled: boolean;
  preferredDays: string[];
  onPreferredDaysChange: (days: string[]) => void;
  requiredDayRules?: Array<{ course_id: number; day: string }>;
  sundayClassesEnabled?: boolean | null;
  canManageSundayClasses?: boolean;
  sundayClassCount?: number;
  onSundayClassesChange?: (enabled: boolean) => void | Promise<void>;
  allowFridaySaturdaySplit?: boolean;
  onAllowFridaySaturdaySplitChange?: (allowed: boolean) => void;
  targetSectionIds?: string[] | null;
  scheduledSectionIds?: Set<string>;
  onTargetSectionIdsChange?: (ids: string[] | null) => void;
  targetBlockedReason?: string | null;
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
  const openDays = availableDays(sundayClassesEnabled);
  const included = includedDays(preferredDays, openDays);
  const excluded = excludedDays(preferredDays, openDays);
  const toggleDay = (day: string) =>
    onPreferredDaysChange(toggleExcludedDay(preferredDays, day, openDays));
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
  const anyDay = excluded.length === 0;
  const fridaySaturdayExcluded = ["Friday", "Saturday"].filter(
    (day) => !included.includes(day),
  );
  const fridaySaturdayUnavailable = fridaySaturdayExcluded.length > 0;
  // An excluded Friday or Saturday cannot hold the pair, so it reads as off;
  // the saved choice comes back when both days are restored.
  const fridaySaturdayOn = allowFridaySaturdaySplit && !fridaySaturdayUnavailable;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <CardHeading
            icon={GraduationCap}
            title="Year level & curriculum"
            detail="Every later step applies to the sections of this year level."
          />

          <div className="mb-4 mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div>
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
                      {yearLabel(
                        value,
                        allSections.filter(
                          (section) => Number(section.yearLevel) === value,
                        ),
                      )}
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
                    <span className="font-black text-slate-900">
                      {sections.length}
                    </span>{" "}
                    {sections.length === 1 ? "section" : "sections"}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Courses</dt>
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  <dd>
                    <span className="font-black text-slate-900">
                      {courses.length}
                    </span>{" "}
                    {courses.length === 1 ? "course" : "courses"} this semester
                  </dd>
                </div>
              </dl>
            </div>

            {onTargetSectionIdsChange && sections.length > 0 && (
              <SectionTargetPicker
                sections={sections}
                targetSectionIds={targetSectionIds}
                scheduledSectionIds={scheduledSectionIds}
                onChange={onTargetSectionIdsChange}
                disabled={yearChangeDisabled}
                blockedReason={targetBlockedReason}
              />
            )}
          </div>

          <div className="mt-auto border-t border-slate-100 pt-4">
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
                ? "All open days are used. Click a day to exclude it."
                : `Meets only on ${included.join(", ")}. Click an excluded day to restore it.`
            }
            action={
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums ring-1 ${
                    anyDay
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-[#4e0a10]/5 text-[#4e0a10] ring-[#4e0a10]/15"
                  }`}
                >
                  {anyDay
                    ? "All days"
                    : `${included.length} of ${openDays.length} days`}
                </span>
                {!anyDay && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPreferredDaysChange([])}
                    title="Restore every excluded day"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-black text-[#4e0a10] hover:bg-[#4e0a10]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden />
                    Reset
                  </button>
                )}
              </div>
            }
          />

          <div
            role="group"
            aria-label="Preferred days"
            className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4"
          >
            {FULL_DAY_NAMES.map((day) => {
              const closed = !openDays.includes(day);
              const isExcluded = excluded.includes(day);
              const lastDay = !closed && !isExcluded && included.length === 1;
              const [StatusIcon, tone] = closed
                ? [Lock, "border-slate-200 bg-slate-100 text-slate-300"]
                : isExcluded
                  ? [
                      X,
                      "border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400 hover:bg-white hover:text-slate-600",
                    ]
                  : [
                      Check,
                      "border-[#4e0a10]/20 bg-[#4e0a10]/[0.04] text-[#4e0a10] hover:border-[#4e0a10]/40 hover:bg-[#4e0a10]/[0.08]",
                    ];

              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={isExcluded}
                  title={
                    closed
                      ? "Sunday classes are off for this department"
                      : isExcluded
                        ? `${day} is excluded. Click to restore it.`
                        : lastDay
                          ? "At least one day must stay open."
                          : `Click to exclude ${day}.`
                  }
                  disabled={disabled || closed || lastDay}
                  onClick={() => toggleDay(day)}
                  className={`flex h-9 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a7020] disabled:cursor-not-allowed ${
                    closed || lastDay ? "" : "disabled:opacity-50"
                  } ${tone}`}
                >
                  <StatusIcon
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={3}
                  />
                  <span
                    className={`truncate text-xs font-black leading-none ${
                      isExcluded ? "line-through decoration-[1.5px]" : ""
                    }`}
                  >
                    {day}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            aria-hidden
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400"
          >
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3 text-[#4e0a10]" strokeWidth={3} />
              Included
            </span>
            <span className="inline-flex items-center gap-1">
              <X className="h-3 w-3" strokeWidth={3} />
              Excluded
            </span>
            {!openDays.includes("Sunday") && (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" strokeWidth={3} />
                Closed
              </span>
            )}
          </div>

          {/* Soaks up the height matched to the curriculum card so the
              toggle rows sit at the bottom instead of leaving a gap below. */}
          <div aria-hidden className="min-h-0 flex-1" />

          {sundayClassesEnabled !== null && (
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black leading-tight text-slate-900">
                  Sunday classes
                  <span
                    className={`ml-1.5 rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wide ${
                      sundayClassesEnabled
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {sundayClassesEnabled ? "On" : "Off"}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] font-semibold leading-tight text-slate-500">
                  {sundayClassesEnabled
                    ? "Generation and manual scheduling may use Sunday."
                    : canManageSundayClasses
                      ? "Turn on to let generation and manual scheduling use Sunday."
                      : "Only the department Secretary, Director, or Program Head can turn this on."}
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
                  title={
                    sundayClassesEnabled
                      ? "Disable Sunday classes"
                      : "Enable Sunday classes"
                  }
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
          {onAllowFridaySaturdaySplitChange && (
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black leading-tight text-slate-900">
                  Split Days: Friday + Saturday
                  <span
                    className={`ml-1.5 rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wide ${
                      fridaySaturdayOn
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {fridaySaturdayOn ? "On" : "Off"}
                  </span>
                </p>
                <p
                  id="generator-friday-saturday-help"
                  className="mt-0.5 text-[11px] font-semibold leading-tight text-slate-500"
                >
                  {fridaySaturdayUnavailable
                    ? `Restore ${fridaySaturdayExcluded.join(" and ")} to pair Friday with Saturday.`
                    : "Split courses may also meet Friday + Saturday. Mon/Wed and Tue/Thu are still tried first."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={fridaySaturdayOn}
                aria-label="Allow Friday and Saturday as Paired Days"
                aria-describedby="generator-friday-saturday-help"
                disabled={disabled || fridaySaturdayUnavailable}
                onClick={() =>
                  onAllowFridaySaturdaySplitChange(!allowFridaySaturdaySplit)
                }
                title={
                  allowFridaySaturdaySplit
                    ? "Stop pairing Friday with Saturday"
                    : "Allow Friday and Saturday as paired days"
                }
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                  fridaySaturdayOn
                    ? "cursor-pointer bg-[#4e0a10]"
                    : "cursor-pointer bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    fridaySaturdayOn ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}
          {sundayClosed && sundayClassCount > 0 && (
            <Notice tone="warning">
              {sundayClassCount}{" "}
              {sundayClassCount === 1 ? "class is" : "classes are"} already on
              Sunday this semester. They stay on the timetable, but no new class
              can be placed on Sunday.
            </Notice>
          )}
          {included.length === 1 && (
            <Notice tone="warning">
              Hybrid classes meet on two different days, so one day cannot hold
              them. A Split Session falls back to a single meeting.
            </Notice>
          )}
          {excludedRequiredDays.length > 0 && (
            <Notice tone="error">
              Required Day on an excluded day:{" "}
              {excludedRequiredDays.join(", ")}. Restore the day here, or change
              the Required Day in Setup Courses.
            </Notice>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionTargetPicker({
  sections,
  targetSectionIds,
  scheduledSectionIds,
  onChange,
  disabled,
  blockedReason,
}: {
  sections: Section[];
  targetSectionIds: string[] | null;
  scheduledSectionIds: Set<string>;
  onChange: (ids: string[] | null) => void;
  disabled: boolean;
  blockedReason: string | null;
}) {
  const perSection = targetSectionIds !== null;
  const selected = new Set(targetSectionIds ?? []);
  const toggle = (id: string) =>
    onChange(
      selected.has(id)
        ? [...selected].filter((item) => item !== id)
        : [...selected, id],
    );
  const modeButton = (active: boolean) =>
    `selection-indicator rounded-md px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
      active
        ? "shadow-sm"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <>
      <div id="generator-section-target">
        <span className={FIELD_LABEL}>Generate for</span>
        <div
          role="radiogroup"
          aria-label="Generate for"
          className="mt-1.5 grid h-11 grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!perSection}
            disabled={disabled}
            onClick={() => onChange(null)}
            className={modeButton(!perSection)}
          >
            Whole year level
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={perSection}
            disabled={disabled}
            onClick={() => onChange(targetSectionIds ?? [])}
            className={modeButton(perSection)}
          >
            Selected sections
          </button>
        </div>
      </div>

      <div className="sm:col-span-2">
        {perSection && (
          <>
            <p className="mt-2 text-[11px] font-semibold leading-snug text-slate-500">
              Only the ticked sections are generated and replaced. The other
              sections keep their classes, and the new timetable is fitted
              around them.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sections.map((section) => {
                const id = String(section.id);
                const checked = selected.has(id);
                const scheduled = scheduledSectionIds.has(id);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                      checked
                        ? "border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(id)}
                      className="h-3.5 w-3.5 accent-[#4e0a10]"
                    />
                    {section.name}
                    <span
                      className={`rounded-full px-1.5 py-px text-[10px] font-black ${
                        scheduled
                          ? "bg-slate-100 text-slate-500"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {scheduled ? "Scheduled" : "New"}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        {blockedReason && <Notice tone="warning">{blockedReason}</Notice>}
      </div>
    </>
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
        <h3 className="text-sm font-black leading-tight text-slate-900">
          {title}
        </h3>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-500">
          {detail}
        </p>
      </div>
      {action}
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "error";
  children: ReactNode;
}) {
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
