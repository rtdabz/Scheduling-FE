import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  MapPin,
  Split,
} from "lucide-react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";
import ConfirmModal from "../../../../components/ui/ConfirmModal";
import { DAYS } from "../constants";
import type { Course, Section, Term } from "../types";
import YearLevelCurriculumSelector from "./YearLevelCurriculumSelector";
import { getForcedDayConcentration } from "./forcedDayConcentration";
import { setCachedData } from "../../../../lib/dataCache";
import { schedulingSettingsCacheKey } from "./generatorCache";
import {
  balancedSplitSettingsOf,
  isBalancedSplitSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import type { TimeBlockOption } from "./generationTypes";

export type ConstraintCourse = { id: number; code: string; name: string };
export type ForcedDayRule = { course_id: number; day: string };

export type ConfigurationSettings = {
  forced_day_rules?: ForcedDayRule[];
  forced_day_courses?: ConstraintCourse[];
  field_course_assignment_enabled?: boolean;
  field_course_options?: ConstraintCourse[];
  field_course_codes?: string[];
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
  lecture_lab_schedule_override_enabled?: boolean;
};

export type SetupDraft = {
  completed: boolean;
  allowedSplitCourseIds: string[];
};

/** The slice of a section's configuration this step writes. */
export type PeriodConfig = {
  preferredTimeBlock?: TimeBlockOption;
};

const DEFAULT_FORCED_DAY = "Saturday";

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
  { value: "morning", label: "Morning", range: "7:00 AM - 11:30 AM" },
  { value: "afternoon", label: "Afternoon", range: "11:30 AM - 4:00 PM" },
  { value: "evening", label: "Evening", range: "4:00 PM - 8:30 PM" },
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

/** A clickable course inside a Kanban column. Selection is a highlight. */
function CourseChip({
  code,
  name,
  selected,
  disabled,
  onClick,
  trailing,
}: {
  code: string;
  name: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border transition ${
        selected
          ? "border-[#4e0a10] bg-[#fff8e8] ring-1 ring-[#4e0a10]/25"
          : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className="flex w-full items-start gap-2 px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            selected
              ? "border-[#4e0a10] bg-[#4e0a10] text-white"
              : "border-slate-300 bg-white"
          }`}
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-black leading-tight text-slate-900">
            {code}
          </span>
          <span className="block truncate text-[11px] font-semibold leading-tight text-slate-600">
            {name}
          </span>
        </span>
      </button>
      {trailing && <div className="px-2.5 pb-2">{trailing}</div>}
    </div>
  );
}

function KanbanColumn({
  id,
  icon: Icon,
  title,
  description,
  count,
  notice,
  children,
}: {
  /** DOM id, so guided tours can anchor a step to one column. */
  id?: string;
  icon: typeof CalendarDays;
  title: string;
  description: string;
  count: number;
  notice?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white/70">
      <header className="flex items-start gap-2 border-b border-slate-200 px-3 py-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#4e0a10]/10 text-[#4e0a10]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-tight text-slate-900">
            {title}
          </p>
          <p className="text-[11px] font-semibold leading-tight text-slate-500">
            {description}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#4e0a10] px-2 py-0.5 text-[11px] font-black text-white">
          {count}
        </span>
      </header>
      {notice && (
        <p
          role="alert"
          className="flex items-start gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </p>
      )}
      <div className="min-h-[120px] max-h-[22rem] flex-1 space-y-2 overflow-y-auto p-2.5">
        {children}
      </div>
    </section>
  );
}

/**
 * Step 1 — scope on top, generation rules as a board below.
 *
 * The three rule groups used to be sequential stages, which hid two of them
 * behind the one on screen. Side by side, a scheduler can see every rule that
 * will shape the run at once, and each click is saved immediately instead of
 * waiting for a separate confirm.
 */
export default function ConfigurationStep({
  activeTerm,
  years,
  yearLevel,
  onYearChange,
  departmentId,
  sections,
  courses,
  onCurriculumApplied,
  settings,
  setSettings,
  loadingSettings,
  setupDraft,
  setSetupDraft,
  sectionId,
  actionsDisabled,
  configs,
  onConfigChange,
}: {
  activeTerm: Term | null;
  years: number[];
  yearLevel: number;
  onYearChange: (value: number) => void;
  departmentId: number | null;
  sections: Section[];
  courses: Course[];
  onCurriculumApplied: (curriculumId: number) => void | Promise<void>;
  settings: ConfigurationSettings | null;
  setSettings: (settings: ConfigurationSettings) => void;
  loadingSettings: boolean;
  setupDraft: SetupDraft;
  setSetupDraft: Dispatch<SetStateAction<SetupDraft>>;
  sectionId: string;
  actionsDisabled: boolean;
  configs: Record<string, PeriodConfig>;
  onConfigChange: (
    sectionId: string,
    change: { preferredTimeBlock: TimeBlockOption },
  ) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [pendingReplacement, setPendingReplacement] = useState<{
    courseId: string;
    courseCode: string;
    target: "forced-day" | "split";
    previous: string;
  } | null>(null);

  const forcedDayRules = Array.from(
    new Map(
      (settings?.forced_day_rules ?? []).map((rule) => [
        `${rule.course_id}:${rule.day}`,
        rule,
      ]),
    ).values(),
  );
  const forcedDayCourses = Array.from(
    new Map(
      (settings?.forced_day_courses ?? []).map((course) => [
        course.id,
        course,
      ]),
    ).values(),
  );
  const fieldCourseCodes = Array.from(
    new Set(settings?.field_course_codes ?? []),
  );
  const fieldCourseOptions = Array.from(
    new Map(
      (settings?.field_course_options ?? []).map((course) => [
        course.code,
        course,
      ]),
    ).values(),
  );

  // Field delivery requires a field-capable lecture course; anything with a
  // laboratory component stays out of this column.
  const fieldEligibleCodes = new Set(
    courses
      .filter((course) => Number(course.labHours ?? 0) <= 0)
      .map((course) => course.code),
  );
  const fieldCandidates = fieldCourseOptions.filter((course) =>
    fieldEligibleCodes.has(course.code),
  );
  const splitSettings = balancedSplitSettingsOf(settings);
  // Listed as though both split settings were on, so a column whose setting is
  // off shows the chips plus the notice that explains why they are inert --
  // rather than looking as though the scope holds nothing splittable.
  const splitCandidates = courses.filter((course) =>
    isBalancedSplitSchedulingEligible(course, {
      minorEnabled: true,
      majorLectureEnabled: true,
    }),
  );

  const forcedDayByCourseId = new Map(
    forcedDayRules.map((rule) => [Number(rule.course_id), rule.day]),
  );
  // Piling every forced course onto one day is legal but rarely intended, so
  // the column says so where the choice is made.
  const concentration = getForcedDayConcentration(forcedDayRules, [], "");
  const splitEnabled =
    splitSettings.minorEnabled || splitSettings.majorLectureEnabled;

  const patchSettings = async (
    patch: Partial<ConfigurationSettings>,
  ): Promise<boolean> => {
    if (!sectionId || !settings) return false;
    setSaving(true);
    try {
      const response = await api.patch<ConfigurationSettings>(
        "/scheduling-settings",
        patch,
        { params: { section_id: sectionId } },
      );
      // Keep the submitted values when an API response is partial or stale.
      const next = { ...settings, ...response.data, ...patch };
      setSettings(next);
      // Written through rather than evicted: the board's own save is the one
      // change the cache cannot learn about from another module, and reopening
      // the generator must show what was just saved without a refetch.
      setCachedData(schedulingSettingsCacheKey(sectionId), next);
      return true;
    } catch {
      toast.error("Save failed", "Unable to update generation constraints.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const markDirty = () =>
    setSetupDraft((current) => ({ ...current, completed: false }));

  const setForcedDay = async (courseId: number, day: string) => {
    const next = [
      ...forcedDayRules.filter((rule) => Number(rule.course_id) !== courseId),
      { course_id: courseId, day },
    ];
    markDirty();
    await patchSettings({ forced_day_rules: next });
  };

  const clearForcedDay = async (courseId: number) => {
    markDirty();
    await patchSettings({
      forced_day_rules: forcedDayRules.filter(
        (rule) => Number(rule.course_id) !== courseId,
      ),
    });
  };

  const toggleSplit = (courseId: string) => {
    markDirty();
    setSetupDraft((current) => ({
      ...current,
      completed: false,
      allowedSplitCourseIds: current.allowedSplitCourseIds.includes(courseId)
        ? current.allowedSplitCourseIds.filter((id) => id !== courseId)
        : [...current.allowedSplitCourseIds, courseId],
    }));
  };

  const toggleField = async (courseCode: string) => {
    const next = fieldCourseCodes.includes(courseCode)
      ? fieldCourseCodes.filter((code) => code !== courseCode)
      : [...fieldCourseCodes, courseCode];
    markDirty();
    await patchSettings({ field_course_codes: next });
  };

  /**
   * A course cannot be both forced onto a day and allowed to split, so
   * claiming it for one column asks before releasing it from the other.
   */
  const claimCourse = (
    courseId: string,
    courseCode: string,
    target: "forced-day" | "split",
  ) => {
    const heldByForcedDay = forcedDayByCourseId.has(Number(courseId));
    const heldBySplit = setupDraft.allowedSplitCourseIds.includes(courseId);
    const conflicting =
      target === "forced-day" ? heldBySplit : heldByForcedDay;

    if (!conflicting) {
      if (target === "forced-day") {
        if (heldByForcedDay) void clearForcedDay(Number(courseId));
        else void setForcedDay(Number(courseId), DEFAULT_FORCED_DAY);
      } else {
        toggleSplit(courseId);
      }
      return;
    }

    setPendingReplacement({
      courseId,
      courseCode,
      target,
      previous: target === "forced-day" ? "Split Session" : "Forced Day",
    });
  };

  const confirmReplacement = async () => {
    if (!pendingReplacement) return;
    const { courseId, target } = pendingReplacement;

    if (target === "forced-day") {
      setSetupDraft((current) => ({
        ...current,
        completed: false,
        allowedSplitCourseIds: current.allowedSplitCourseIds.filter(
          (id) => id !== courseId,
        ),
      }));
      await setForcedDay(Number(courseId), DEFAULT_FORCED_DAY);
    } else {
      const cleared = await patchSettings({
        forced_day_rules: forcedDayRules.filter(
          (rule) => Number(rule.course_id) !== Number(courseId),
        ),
      });
      if (cleared) toggleSplit(courseId);
    }

    setPendingReplacement(null);
  };

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

  const disabled = actionsDisabled || saving || loadingSettings;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
              Choose year level
            </span>
            <select
              id="generator-year-level"
              aria-label="Year level"
              value={yearLevel}
              disabled={actionsDisabled || years.length === 0}
              onChange={(event) => onYearChange(Number(event.target.value))}
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {yearLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Sections
              </dt>
              <dd className="text-lg font-black leading-none text-slate-900">
                {sections.length}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
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
          termId={activeTerm?.id ?? null}
          yearLevel={yearLevel}
          sections={sections}
          onApplied={onCurriculumApplied}
          disabled={actionsDisabled}
        />
      </section>

      <div
        id="generator-rules"
        className="grid min-h-0 flex-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <KanbanColumn
          id="generator-column-forced-day"
          icon={CalendarDays}
          title="Forced Day"
          description="Click a course, then pick the day it must meet."
          count={forcedDayByCourseId.size}
          notice={
            concentration
              ? `Same-day concentration warning: all ${concentration.courseCount} forced-day courses are assigned to ${concentration.day}. Room and faculty availability on that day should be reviewed.`
              : undefined
          }
        >
          {forcedDayCourses.length === 0 ? (
            <p className="px-1 py-2 text-[11px] font-semibold text-slate-500">
              No courses are available for forced-day rules in this scope.
            </p>
          ) : (
            forcedDayCourses.map((course) => {
              const day = forcedDayByCourseId.get(Number(course.id));

              return (
                <CourseChip
                  key={course.id}
                  code={course.code}
                  name={course.name}
                  selected={day !== undefined}
                  disabled={disabled}
                  onClick={() =>
                    claimCourse(String(course.id), course.code, "forced-day")
                  }
                  trailing={
                    day !== undefined ? (
                      <select
                        aria-label={`Required day for ${course.code}`}
                        value={day}
                        disabled={disabled}
                        onChange={(event) =>
                          void setForcedDay(
                            Number(course.id),
                            event.target.value,
                          )
                        }
                        className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {DAYS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : undefined
                  }
                />
              );
            })
          )}
        </KanbanColumn>

        {/*
          No enablement gate here, unlike the split column: the backend derives
          `field_course_assignment_enabled` from whether the department has any
          codes configured, so gating this column on it made the first code
          impossible to add - the only writer of the codes is right here.
        */}
        <KanbanColumn
          id="generator-column-field"
          icon={MapPin}
          title="Field Courses"
          description="Click the courses delivered in the field."
          count={fieldCourseCodes.length}
        >
          {fieldCandidates.length === 0 ? (
            <p className="px-1 py-2 text-[11px] font-semibold text-slate-500">
              No field-eligible courses in this scope. A course with laboratory
              hours cannot be delivered in the field.
            </p>
          ) : (
            fieldCandidates.map((course) => (
              <CourseChip
                key={course.code}
                code={course.code}
                name={course.name}
                selected={fieldCourseCodes.includes(course.code)}
                disabled={disabled}
                onClick={() => void toggleField(course.code)}
              />
            ))
          )}
        </KanbanColumn>

        <KanbanColumn
          id="generator-column-split"
          icon={Split}
          title="Allowed Split"
          description="Click the minor or lecture-only major courses that may split into two meetings."
          count={setupDraft.allowedSplitCourseIds.length}
          notice={
            splitEnabled
              ? undefined
              : "Enable Minor Course Split Sessions or Major Lecture Split Sessions in Settings before choosing split courses."
          }
        >
          {splitCandidates.length === 0 ? (
            <p className="px-1 py-2 text-[11px] font-semibold text-slate-500">
              No split-eligible courses in this scope.
            </p>
          ) : (
            splitCandidates.map((course) => (
              <CourseChip
                key={course.id}
                code={course.code}
                name={course.name}
                selected={setupDraft.allowedSplitCourseIds.includes(course.id)}
                disabled={
                  disabled
                  || !isBalancedSplitSchedulingEligible(course, splitSettings)
                }
                onClick={() => claimCourse(course.id, course.code, "split")}
              />
            ))
          )}
        </KanbanColumn>

        <KanbanColumn
          id="generator-column-periods"
          icon={Clock3}
          title="Preferred Meetings"
          description="Click a period to keep a section inside it."
          count={assignedPeriodCount}
        >
          {sections.length === 0 ? (
            <p className="px-1 py-2 text-[11px] font-semibold text-slate-500">
              No active sections for this year level.
            </p>
          ) : (
            sections.map((section) => {
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
            })
          )}
        </KanbanColumn>
      </div>

      {saving && (
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving constraints...
        </p>
      )}

      <ConfirmModal
        isOpen={pendingReplacement !== null}
        eyebrow="Generation Constraints"
        title={`Move ${pendingReplacement?.courseCode ?? "this course"}?`}
        message={`${pendingReplacement?.courseCode ?? "This course"} is currently set as ${pendingReplacement?.previous ?? "another rule"}. A course can only follow one of the two, so it will be removed from ${pendingReplacement?.previous ?? "the other column"}.`}
        confirmLabel="Move it"
        onConfirm={confirmReplacement}
        onCancel={() => setPendingReplacement(null)}
      />
    </div>
  );
}
