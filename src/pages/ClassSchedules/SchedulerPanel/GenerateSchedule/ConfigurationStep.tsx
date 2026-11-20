import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Lock,
  RotateCcw,
  Users,
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

/** Step 1. Styles: generator.css (`.gen-*`) and the shared `.workflow-*` controls. */
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
  lockedSectionIds = new Set<string>(),
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
  lockedSectionIds?: Set<string>;
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
  const canToggleSunday = canManageSundayClasses && Boolean(onSundayClassesChange);

  return (
    <div className="gen-config-host">
      <div className="gen-config">
        <section aria-labelledby="generator-scope-title" className="workflow-panel gen-panel">
          <PanelHeading
            id="generator-scope-title"
            icon={GraduationCap}
            title="Year level & curriculum"
            detail="Every later step applies to the sections of this year level."
          />

          <SettingRow label="Year level" htmlFor="generator-year-level">
            <div className="flex min-w-0 items-center gap-2">
              <select
                id="generator-year-level"
                aria-label="Year level"
                value={yearLevel}
                disabled={yearChangeDisabled || years.length === 0}
                onChange={(event) => onYearChange(Number(event.target.value))}
                className="gen-select min-w-[9rem] flex-1"
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
            <dl className="gen-meta">
              <div>
                <dt className="sr-only">Sections</dt>
                <Users className="h-3.5 w-3.5" aria-hidden />
                <dd>
                  <strong>{sections.length}</strong>{" "}
                  {sections.length === 1 ? "section" : "sections"}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Courses</dt>
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                <dd>
                  <strong>{courses.length}</strong>{" "}
                  {courses.length === 1 ? "course" : "courses"} this semester
                </dd>
              </div>
            </dl>
          </SettingRow>

          {onTargetSectionIdsChange && sections.length > 0 && (
            <SectionTargetPicker
              sections={sections}
              targetSectionIds={targetSectionIds}
              scheduledSectionIds={scheduledSectionIds}
              lockedSectionIds={lockedSectionIds}
              onChange={onTargetSectionIdsChange}
              disabled={yearChangeDisabled}
              blockedReason={targetBlockedReason}
            />
          )}

          <SettingRow
            label="Curriculum"
            hint="Applied to every section of this year level."
          >
            <YearLevelCurriculumSelector
              departmentId={departmentId}
              semesterId={activeSemester?.id ?? null}
              yearLevel={yearLevel}
              sections={sections}
              onApplied={onCurriculumApplied}
              disabled={actionsDisabled}
              hideLabel
            />
          </SettingRow>
        </section>

        <section
          id="generator-preferred-days"
          aria-labelledby="generator-days-title"
          className="workflow-panel gen-panel"
        >
          <PanelHeading
            id="generator-days-title"
            icon={CalendarDays}
            title="Preferred Days"
            detail={
              anyDay
                ? "All open days are used. Click a day to exclude it."
                : `Meets only on ${included.join(", ")}. Click an excluded day to restore it.`
            }
            action={
              <>
                <span className="gen-chip" data-tone={anyDay ? "positive" : "brand"}>
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
                    className="gen-link-button"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden />
                    Reset
                  </button>
                )}
              </>
            }
          />

          <div role="group" aria-label="Preferred days" className="gen-week">
            {FULL_DAY_NAMES.map((day) => {
              const closed = !openDays.includes(day);
              const isExcluded = excluded.includes(day);
              const lastDay = !closed && !isExcluded && included.length === 1;
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={day}
                  aria-pressed={isExcluded}
                  data-state={closed ? "closed" : isExcluded ? "excluded" : "included"}
                  data-busy={disabled && !closed}
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
                  className="gen-day"
                >
                  <span className="gen-day-name" aria-hidden>
                    {day.slice(0, 3)}
                  </span>
                  {closed ? (
                    <Lock className="h-3 w-3" aria-hidden />
                  ) : (
                    <span className="gen-day-mark" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>

          {sundayClassesEnabled !== null && (
            <div className="gen-rule">
              <div className="gen-rule-text">
                <p className="gen-rule-title">
                  Sunday classes
                  {/* Without a switch to show the state, a chip does. */}
                  {!canToggleSunday && (
                    <span className="gen-chip" data-tone={sundayClassesEnabled ? "positive" : "neutral"}>
                      {sundayClassesEnabled ? "On" : "Off"}
                    </span>
                  )}
                </p>
                <p className="gen-row-hint">
                  {sundayClassesEnabled
                    ? "Generation and manual scheduling may use Sunday."
                    : canManageSundayClasses
                      ? "Turn on to let generation and manual scheduling use Sunday."
                      : "Only the department Secretary, Director, or Program Head can turn this on."}
                </p>
              </div>
              {canToggleSunday && (
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
                  className="workflow-switch"
                >
                  <span aria-hidden />
                </button>
              )}
            </div>
          )}
          {onAllowFridaySaturdaySplitChange && (
            <div className="gen-rule">
              <div className="gen-rule-text">
                <p className="gen-rule-title">Split Days: Friday + Saturday</p>
                <p id="generator-friday-saturday-help" className="gen-row-hint">
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
                className="workflow-switch"
              >
                <span aria-hidden />
              </button>
            </div>
          )}

          <div className="gen-notices">
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
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionTargetPicker({
  sections,
  targetSectionIds,
  scheduledSectionIds,
  lockedSectionIds,
  onChange,
  disabled,
  blockedReason,
}: {
  sections: Section[];
  targetSectionIds: string[] | null;
  scheduledSectionIds: Set<string>;
  lockedSectionIds: Set<string>;
  onChange: (ids: string[] | null) => void;
  disabled: boolean;
  blockedReason: string | null;
}) {
  const perSection = targetSectionIds !== null;
  const selected = new Set(targetSectionIds ?? []);
  const isLocked = (section: Section) => lockedSectionIds.has(String(section.id));
  const hasLocked = sections.some(isLocked);
  // A year level with locked sections can only be generated section by section.
  const wholeYearDisabled = disabled || (hasLocked && !sections.every(isLocked));
  const toggle = (id: string) =>
    onChange(
      selected.has(id)
        ? [...selected].filter((item) => item !== id)
        : [...selected, id],
    );

  return (
    <SettingRow
      id="generator-section-target"
      label="Generate for"
      labelId="generator-section-target-label"
    >
      <div
        role="radiogroup"
        aria-label="Generate for"
        className="workflow-segmented self-start"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!perSection}
          disabled={wholeYearDisabled}
          title={
            wholeYearDisabled && !disabled
              ? "Some sections are under review or approved. Generate the remaining sections instead."
              : undefined
          }
          onClick={() => onChange(null)}
        >
          Whole year level
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={perSection}
          disabled={disabled}
          onClick={() => onChange(targetSectionIds ?? [])}
        >
          Selected sections
        </button>
      </div>

      {perSection && (
        <>
          <p className="gen-row-hint">
            Only the ticked sections are generated and replaced. The other
            sections keep their classes, and the new timetable is fitted
            around them.
            {hasLocked &&
              " Locked sections are under review or approved and can't be regenerated."}
          </p>
          <div className="gen-section-list">
            {sections.map((section) => {
              const id = String(section.id);
              const checked = selected.has(id);
              const scheduled = scheduledSectionIds.has(id);
              const locked = lockedSectionIds.has(id);
              return (
                <label
                  key={id}
                  title={
                    locked
                      ? "Already scheduled and under review or approved. Its classes are kept."
                      : undefined
                  }
                  data-checked={checked && !locked}
                  data-locked={locked}
                  data-disabled={disabled && !locked}
                  className="gen-section"
                >
                  {locked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null}
                  <input
                    type="checkbox"
                    checked={checked && !locked}
                    disabled={disabled || locked}
                    onChange={() => toggle(id)}
                    className={locked ? "sr-only" : undefined}
                  />
                  {section.name}
                  <span
                    className="gen-section-tag"
                    data-tone={!locked && !scheduled ? "new" : undefined}
                  >
                    {locked ? "Locked" : scheduled ? "Scheduled" : "New"}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {blockedReason && <Notice tone="warning">{blockedReason}</Notice>}
    </SettingRow>
  );
}

function PanelHeading({
  id,
  icon: Icon,
  title,
  detail,
  action,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="gen-panel-head">
      <span className="gen-panel-icon">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={id} className="gen-panel-title">
          {title}
        </h3>
        <p className="gen-panel-detail">{detail}</p>
      </div>
      {action && <div className="gen-panel-action">{action}</div>}
    </div>
  );
}

/** One settings row: the label sits beside its control on wide panels and above it on narrow ones. */
function SettingRow({
  id,
  label,
  labelId,
  htmlFor,
  hint,
  children,
}: {
  id?: string;
  label: string;
  labelId?: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="gen-row">
      <div>
        {htmlFor ? (
          <label id={labelId} htmlFor={htmlFor} className="gen-row-label block">
            {label}
          </label>
        ) : (
          <p id={labelId} className="gen-row-label">
            {label}
          </p>
        )}
        {hint && <p className="gen-row-hint">{hint}</p>}
      </div>
      <div className="gen-row-control">{children}</div>
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
      data-tone={tone}
      className="gen-notice"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
