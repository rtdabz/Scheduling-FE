import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  DoorOpen,
  FlaskConical,
  Layers,
  MapPin,
  Minus,
  Search,
  Settings2,
} from "lucide-react";
import type { Course, Section } from "../types";
import {
  isBalancedSplitSchedulingEligible,
  isConfiguredFieldCourse,
  isHybridSplitEligible,
  isHybridSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import type { LaboratoryDurationSettings } from "../courseSlotPlan";
import type { PeriodOption, TimeBlockOption } from "./generationTypes";
import { fieldPeriodWarning, PERIOD_LABELS, periodRunsPastFieldEnd } from "./generationTypes";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../../../../components/ui/DataTable";
import { useDataTable } from "../../../../components/ui/useDataTable";
import ConfigureClassSidebar from "./ConfigureClassSidebar";
import CourseDefaultsSidebar from "./CourseDefaultsSidebar";
import { getForcedDayConcentration } from "./forcedDayConcentration";
import type {
  ClassConfiguration,
  CourseClassConfig,
  CourseDefaults,
  DeliveryMode,
  PreferredRoomOption,
} from "./courseClassConfig";
import {
  applyCourseDefaults,
  EMPTY_COURSE_DEFAULTS,
  defaultDurationMinutes,
  durationLabel,
  durationShape,
  formatHours,
  hybridLaboratoryMinutes,
  inferInitialCourseClassConfig,
  isIntegratedShape,
  isDurationEditable,
  meetingParts,
  syncCourseConfigToSectionConfigs,
} from "./courseClassConfig";

export type CourseSetupConfig = {
  courseIds: string[];
  splitCourseIds: string[];
  gecSplitCourseIds: string[];
  hybridSplitCourseIds?: string[];
  modesByCourseId?: Record<string, "automatic" | "on-site" | "online" | "field">;
  /** Custom Time Duration: weekly minutes, only where it differs from the course's. */
  durationMinutesByCourseId?: Record<string, number>;
  /** Preferred Room: a room id the generator tries first. */
  preferredRoomsByCourseId?: Record<string, string>;
  /** Integrated Hybrid: the online lecture's and on-site laboratory's minutes. */
  componentMinutesByCourseId?: Record<string, { lecture: number; laboratory: number }>;
  /** Set on the Configuration step; shown here as read-only context. */
  preferredTimeBlock?: TimeBlockOption;
  /** Configure's per-course Preferred Meeting; see CourseClassConfig.preferredPeriods. */
  preferredPeriodsByCourseId?: Record<string, PeriodOption[]>;
};

export type RequiredDayRule = { course_id: number; day: string };

export type SetupCoursesSettings = LaboratoryDurationSettings & {
  field_course_codes?: string[];
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
  lecture_lab_schedule_override_enabled?: boolean;
  /** Required Day, stored as the department's forced-day rules. */
  forced_day_rules?: RequiredDayRule[];
  preferred_room_options?: PreferredRoomOption[];
};

type SetupCourseTableRow = {
  course: Course;
  /** Unchecked courses are left out of this run. */
  included: boolean;
  isField: boolean;
  config: CourseClassConfig;
  eligibility: {
    regular: boolean;
    split: boolean;
    integrated: boolean;
  };
};

/**
 * What kind of course this is, at a glance.
 */
const courseIcon = (course: Course, isField: boolean) => {
  if (isField) return MapPin;
  if (Number(course.labHours ?? 0) > 0) return FlaskConical;
  return course.category === "minor" ? BookMarked : BookOpen;
};

/**
 * Step 2: Setup Courses
 *
 * Full-width course configuration table with:
 * - Single-select checkboxes: Regular [ ], Split [ ], Integrated [ ]
 * - Delivery Mode dropdown (On-Site, Online, Hybrid)
 * - Duration display
 * - Configure button that opens the slide-over sidebar outside the modal:
 *   Class Component, Custom Time Duration, Required Day (optional),
 *   Preferred Room (optional) and the section scope
 */
export default function SetupCoursesStep({
  courses,
  sections,
  configs,
  onConfigChange,
  settings,
  onRequiredDayChange,
  onFieldCourseChange,
  defaults = EMPTY_COURSE_DEFAULTS,
  onDefaultsChange,
  excludedCourseIds = [],
  onExcludedChange,
  customizedCourseIds = [],
  onCustomizedChange,
  defaultsOpen = false,
  onDefaultsClose,
  actionsDisabled,
}: {
  courses: Course[];
  sections: Section[];
  configs: Record<string, CourseSetupConfig>;
  onConfigChange: (
    sectionId: string,
    change: Partial<CourseSetupConfig>,
  ) => void;
  settings: SetupCoursesSettings | null;
  /**
   * Required Day is a department rule rather than a section setting, so it
   * is saved straight to the scheduling settings instead of the wizard draft.
   */
  onRequiredDayChange?: (courseId: string, day: string | null) => void | Promise<unknown>;
  /**
   * Field status is a department rule too: a course becomes a field course
   * when a field room is its Preferred Room, and stops being one when not.
   */
  onFieldCourseChange?: (courseCode: string, isField: boolean) => void | Promise<unknown>;
  /** Default Settings: applied to every course without Configure settings of its own. */
  defaults?: CourseDefaults;
  onDefaultsChange?: (next: CourseDefaults) => void;
  /** Courses unchecked in the table, left out of this run. */
  excludedCourseIds?: string[];
  onExcludedChange?: (courseIds: string[]) => void;
  /** Courses saved from their own Configure panel, which the defaults skip. */
  customizedCourseIds?: string[];
  onCustomizedChange?: (courseIds: string[]) => void;
  /** The Default Settings sidebar, opened from the gear in the wizard header. */
  defaultsOpen?: boolean;
  onDefaultsClose?: () => void;
  actionsDisabled: boolean;
}) {
  const [configuringCourseId, setConfiguringCourseId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [configFilter, setConfigFilter] = useState<
    "all" | "regular" | "split" | "integrated"
  >("all");

  const fieldCourseCodes = useMemo(
    () => new Set(settings?.field_course_codes ?? []),
    [settings?.field_course_codes],
  );
  const requiredDayRules = useMemo(
    () => settings?.forced_day_rules ?? [],
    [settings?.forced_day_rules],
  );
  const requiredDays = useMemo(
    () => new Map(requiredDayRules.map((rule) => [String(rule.course_id), rule.day])),
    [requiredDayRules],
  );
  const roomOptions = useMemo(
    () => settings?.preferred_room_options ?? [],
    [settings?.preferred_room_options],
  );
  const roomCodeById = useMemo(
    () => new Map(roomOptions.map((room) => [String(room.id), room.room_code])),
    [roomOptions],
  );
  // Piling every Required Day onto one day is legal but rarely intended.
  const concentration = getForcedDayConcentration(requiredDayRules, [], "");
  const infer = (course: Course) =>
    inferInitialCourseClassConfig(
      course,
      configs,
      sections,
      fieldCourseCodes,
      requiredDays.get(course.id) ?? null,
    );

  const hybridEnabled =
    true;
  const minorSplitEnabled = true;
  const majorLectureSplitEnabled = true;
  const splitSettings = useMemo(
    () => ({
      minorEnabled: minorSplitEnabled,
      majorLectureEnabled: majorLectureSplitEnabled,
    }),
    [majorLectureSplitEnabled, minorSplitEnabled],
  );

  // Local state dictionary storing course-level configurations
  const [courseConfigs, setCourseConfigs] = useState<
    Record<string, CourseClassConfig>
  >(() => {
    const initial: Record<string, CourseClassConfig> = {};
    for (const course of courses) {
      initial[course.id] = infer(course);
    }
    return initial;
  });

  // Keep courseConfigs in sync when course list changes or new courses appear
  useEffect(() => {
    setCourseConfigs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const course of courses) {
        if (!next[course.id]) {
          next[course.id] = inferInitialCourseClassConfig(
            course,
            configs,
            sections,
            fieldCourseCodes,
            requiredDays.get(course.id) ?? null,
          );
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [configs, courses, fieldCourseCodes, requiredDays, sections]);

  /**
   * The course's working configuration. Required Day is read from the
   * department rules every time, so a save elsewhere never shows stale here.
   */
  const configFor = (course: Course): CourseClassConfig => ({
    ...(courseConfigs[course.id] ?? infer(course)),
    requiredDay: requiredDays.get(course.id) ?? null,
  });

  const excluded = useMemo(() => new Set(excludedCourseIds), [excludedCourseIds]);
  const customized = useMemo(() => new Set(customizedCourseIds), [customizedCourseIds]);

  /**
   * Default Settings for every course without its own Configure settings,
   * written in one pass. Syncing course by course would let each call rebuild
   * a section's duration and room maps from the same stale snapshot, so every
   * course but the last would lose its change.
   */
  const applyDefaultsToCourses = (nextDefaults: CourseDefaults, nextCustomized: Set<string>) => {
    const working: Record<string, CourseSetupConfig> = { ...configs };
    const touched = new Set<string>();
    const nextCourseConfigs = { ...courseConfigs };
    for (const course of courses) {
      if (nextCustomized.has(course.id)) continue;
      const next = applyCourseDefaults(configFor(course), course, nextDefaults, settings).config;
      nextCourseConfigs[course.id] = next;
      syncCourseConfigToSectionConfigs(
        course,
        next,
        sections,
        working,
        (sectionId, change) => {
          working[sectionId] = { ...working[sectionId], ...change };
          touched.add(sectionId);
        },
        settings,
      );
    }
    setCourseConfigs(nextCourseConfigs);
    for (const sectionId of touched) {
      const merged = working[sectionId];
      onConfigChange(sectionId, {
        splitCourseIds: merged.splitCourseIds,
        gecSplitCourseIds: merged.gecSplitCourseIds,
        hybridSplitCourseIds: merged.hybridSplitCourseIds,
        modesByCourseId: merged.modesByCourseId,
        durationMinutesByCourseId: merged.durationMinutesByCourseId,
        preferredRoomsByCourseId: merged.preferredRoomsByCourseId,
        componentMinutesByCourseId: merged.componentMinutesByCourseId,
        preferredPeriodsByCourseId: merged.preferredPeriodsByCourseId,
      });
    }
  };

  const changeDefaults = (next: CourseDefaults) => {
    onDefaultsChange?.(next);
    if (
      next.lectureMinutes !== defaults.lectureMinutes ||
      next.laboratoryMinutes !== defaults.laboratoryMinutes
    ) {
      applyDefaultsToCourses(next, customized);
    }
  };

  const resetCustomized = () => {
    onCustomizedChange?.([]);
    applyDefaultsToCourses(defaults, new Set());
  };

  const setIncluded = (courseIds: string[], include: boolean) => {
    const next = new Set(excluded);
    for (const id of courseIds) {
      if (include) next.delete(id);
      else next.add(id);
    }
    onExcludedChange?.(courses.map((course) => course.id).filter((id) => next.has(id)));
  };

  // Handle saving a course's configuration from the sidebar or direct table controls.
  // A course saved from its own Configure panel keeps those settings; any
  // other change still follows the Default Settings.
  const updateCourseConfig = (
    course: Course,
    changedConfig: CourseClassConfig,
    { fromConfigure = false }: { fromConfigure?: boolean } = {},
  ) => {
    const ownSettings = fromConfigure || customized.has(course.id);
    const updatedConfig = ownSettings
      ? changedConfig
      : applyCourseDefaults(changedConfig, course, defaults, settings).config;
    if (fromConfigure && !customized.has(course.id)) {
      onCustomizedChange?.([...customizedCourseIds, course.id]);
    }
    setCourseConfigs((prev) => ({
      ...prev,
      [course.id]: updatedConfig,
    }));

    // Maintain 100% downstream compatibility with Review & Generate and CSP solver
    syncCourseConfigToSectionConfigs(
      course,
      updatedConfig,
      sections,
      configs,
      onConfigChange,
      settings,
    );

    if ((updatedConfig.requiredDay ?? null) !== (requiredDays.get(course.id) ?? null)) {
      void onRequiredDayChange?.(course.id, updatedConfig.requiredDay);
    }

    const nowField = updatedConfig.component === "field";
    if (
      course.roomTypeRequired !== "field" &&
      nowField !== isConfiguredFieldCourse(course, fieldCourseCodes)
    ) {
      void onFieldCourseChange?.(course.code, nowField);
    }
  };

  /**
   * A change of shape resets the duration to the course's own: a length
   * chosen for one meeting means something different split over two, and
   * both Hybrid shapes have fixed lengths.
   */
  const withShapeDuration = (
    course: Course,
    current: CourseClassConfig,
    next: CourseClassConfig,
  ): CourseClassConfig =>
    durationShape(next) === durationShape(current)
      ? next
      : {
          ...next,
          durationMinutes: defaultDurationMinutes(course),
          lectureMinutes: undefined,
          laboratoryMinutes: undefined,
        };

  const handleSelectConfiguration = (
    course: Course,
    targetConfigType: ClassConfiguration,
  ) => {
    const current = configFor(course);

    let nextDelivery: DeliveryMode = current.delivery;
    let nextHybridType = current.hybridType;

    if (targetConfigType === "regular") {
      if (nextDelivery === "hybrid") nextDelivery = "onsite";
      nextHybridType = undefined;
    } else if (targetConfigType === "split") {
      if (nextDelivery === "online") nextDelivery = "onsite";
      if (nextDelivery === "hybrid" && !isHybridSplitEligible(course)) nextDelivery = "onsite";
      nextHybridType = nextDelivery === "hybrid" ? "split" : undefined;
    } else if (targetConfigType === "integrated") {
      if (nextDelivery === "online") nextDelivery = "hybrid";
      nextHybridType = nextDelivery === "hybrid" ? "laboratory" : undefined;
    }

    updateCourseConfig(
      course,
      withShapeDuration(course, current, {
        ...current,
        configuration: targetConfigType,
        delivery: nextDelivery,
        hybridType: nextHybridType,
        sectionScope: "all",
        selectedSectionIds: sections.map((s) => s.id),
      }),
    );
  };

  const handleDeliveryChange = (
    course: Course,
    nextDelivery: DeliveryMode,
  ) => {
    const current = configFor(course);

    const hybridAllowed = current.configuration === "split"
      ? isHybridSplitEligible(course)
      : current.configuration === "integrated"
        ? isHybridSchedulingEligible(course, hybridEnabled, fieldCourseCodes)
        : false;
    const effectiveDelivery = nextDelivery === "hybrid" && !hybridAllowed
      ? "onsite"
      : nextDelivery;
    const hybridType = effectiveDelivery === "hybrid"
      ? current.configuration === "split"
        ? "split"
        : current.configuration === "integrated"
          ? "laboratory"
          : undefined
      : undefined;

    updateCourseConfig(
      course,
      withShapeDuration(course, current, {
        ...current,
        delivery: effectiveDelivery,
        hybridType,
      }),
    );
  };

  const rows = useMemo<SetupCourseTableRow[]>(() => {
    return courses.map((course) => {
      const isField = isConfiguredFieldCourse(course, fieldCourseCodes);
      const config: CourseClassConfig = {
        ...(courseConfigs[course.id] ??
          inferInitialCourseClassConfig(course, configs, sections, fieldCourseCodes)),
        requiredDay: requiredDays.get(course.id) ?? null,
      };

      const canSplit = isBalancedSplitSchedulingEligible(course, splitSettings);

      // The same courses the server accepts as Integrated: a non-field
      // major with both lecture and laboratory units.
      const canIntegrated = isHybridSchedulingEligible(course, hybridEnabled, fieldCourseCodes);

      return {
        course,
        included: !excluded.has(course.id),
        isField,
        config,
        eligibility: {
          regular: true,
          split: canSplit,
          integrated: canIntegrated,
        },
      };
    });
  }, [
    configs,
    courseConfigs,
    courses,
    excluded,
    fieldCourseCodes,
    hybridEnabled,
    requiredDays,
    sections,
    splitSettings,
  ]);

  const includedCount = rows.filter((row) => row.included).length;
  // What a set of Default Settings would do to the included courses without
  // their own settings: previewed in the sidebar before it is applied.
  const summarizeDefaults = (candidate: CourseDefaults) =>
    rows.reduce(
      (summary, row) => {
        if (!row.included || customized.has(row.course.id)) return summary;
        const result = applyCourseDefaults(row.config, row.course, candidate, settings);
        return {
          applied: summary.applied + (result.applied ? 1 : 0),
          skipped: summary.skipped + (result.skipped ? 1 : 0),
        };
      },
      { applied: 0, skipped: 0 },
    );
  const activeDefaults = [
    defaults.lectureMinutes !== null ? `Lecture ${formatHours(defaults.lectureMinutes / 60)}` : null,
    defaults.laboratoryMinutes !== null ? `Lab ${formatHours(defaults.laboratoryMinutes / 60)}` : null,
    defaults.allowFridaySaturdaySplit ? "Fri + Sat pairs" : null,
  ].filter((label): label is string => label !== null);

  // Breakdown statistics
  const regularCount = useMemo(
    () => rows.filter((r) => r.config.configuration === "regular").length,
    [rows],
  );
  const splitCount = useMemo(
    () => rows.filter((r) => r.config.configuration === "split").length,
    [rows],
  );
  const integratedCount = useMemo(
    () => rows.filter((r) => r.config.configuration === "integrated").length,
    [rows],
  );

  // Filtered rows based on search and configuration filter
  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.course.code.toLowerCase().includes(q) ||
          r.course.name.toLowerCase().includes(q),
      );
    }
    if (configFilter !== "all") {
      result = result.filter((r) => r.config.configuration === configFilter);
    }
    return result;
  }, [rows, searchQuery, configFilter]);

  const configuringRow = useMemo(
    () => rows.find((r) => r.course.id === configuringCourseId) ?? null,
    [rows, configuringCourseId],
  );

  const preferredTimeBlocks = useMemo(() => {
    const map: Record<string, TimeBlockOption | undefined> = {};
    for (const section of sections) {
      map[section.id] = configs[section.id]?.preferredTimeBlock;
    }
    return map;
  }, [configs, sections]);

  // Field courses held to a Preferred Meeting that runs past the field end
  // time. Configure can give the course an earlier period of its own; the
  // sections keep theirs for every other course.
  const fieldPeriodConflicts = useMemo(() => {
    const late = sections.filter((s) => periodRunsPastFieldEnd(preferredTimeBlocks[s.id]));
    if (late.length === 0) return [];
    const names = late.map((s) => s.name);
    const sectionList =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    const periods = Array.from(
      new Set(late.map((s) => PERIOD_LABELS[preferredTimeBlocks[s.id] ?? "flexible"])),
    ).join(" / ");
    return rows
      .filter(
        (row) =>
          row.included &&
          (row.isField || row.config.component === "field") &&
          (!row.config.preferredPeriods?.length ||
            row.config.preferredPeriods.some((period) => periodRunsPastFieldEnd(period))),
      )
      .map((row) => ({
        course: row.course,
        summary: `${names.length === 1 ? "Section" : "Sections"} ${sectionList} ${names.length === 1 ? "is" : "are"} assigned to ${periods}.`,
      }));
  }, [preferredTimeBlocks, rows, sections]);

  // Helper to render configuration checkbox cell with partial support
  const renderConfigCheckbox = (
    row: SetupCourseTableRow,
    targetType: ClassConfiguration,
    label: string,
  ) => {
    const isCurrent = row.config.configuration === targetType;
    const isPartial =
      isCurrent &&
      row.config.sectionScope === "selected" &&
      row.config.selectedSectionIds.length > 0 &&
      row.config.selectedSectionIds.length < sections.length;

    const checked = isCurrent;
    const eligible = row.eligibility[targetType];

    return (
      <div className="flex flex-col items-center justify-center gap-0.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={isPartial ? "mixed" : checked ? "true" : "false"}
          aria-label={`${label} for ${row.course.code}`}
          disabled={actionsDisabled || !eligible}
          onClick={() => handleSelectConfiguration(row.course, targetType)}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
            checked
              ? "border-[#4e0a10] bg-[#4e0a10] text-white shadow-2xs"
              : isPartial
                ? "border-[#4e0a10] bg-white text-[#4e0a10]"
                : "border-slate-300 bg-white text-transparent hover:border-slate-400"
          }`}
        >
          {isPartial ? (
            <Minus className="h-3.5 w-3.5 stroke-[3]" />
          ) : checked ? (
            <Check className="h-3.5 w-3.5 stroke-[3]" />
          ) : null}
        </button>
        {isPartial && (
          <span className="text-[10px] font-black text-[#4e0a10] leading-none">
            {row.config.selectedSectionIds.length}/{sections.length}
          </span>
        )}
      </div>
    );
  };

  const allIncluded = rows.length > 0 && includedCount === rows.length;
  const someIncluded = includedCount > 0 && !allIncluded;

  // Course table columns: INCLUDE | COURSE | REGULAR | SPLIT | INTEGRATED | DELIVERY MODE | DURATION | CONFIGURE
  const courseColumns: ColumnDef<SetupCourseTableRow>[] = [
    {
      id: "include",
      size: 44,
      enableSorting: false,
      meta: { align: "center" },
      header: () => (
        <input
          type="checkbox"
          aria-label="Include every course"
          checked={allIncluded}
          ref={(input) => {
            if (input) input.indeterminate = someIncluded;
          }}
          disabled={actionsDisabled || rows.length === 0}
          onChange={(e) => setIncluded(rows.map((row) => row.course.id), e.target.checked)}
          className="h-3.5 w-3.5 accent-[#4e0a10]"
        />
      ),
      cell: ({ row: { original } }) => (
        <input
          type="checkbox"
          aria-label={`Include ${original.course.code} in generation`}
          checked={original.included}
          disabled={actionsDisabled}
          onChange={(e) => setIncluded([original.course.id], e.target.checked)}
          className="h-3.5 w-3.5 accent-[#4e0a10]"
        />
      ),
    },
    {
      id: "course",
      accessorFn: (row) => row.course.code,
      header: "Course",
      cell: ({
        row: {
          original: { course, included, isField, config },
        },
      }) => {
        const CourseIcon = courseIcon(course, isField);
        const hasSectionOverride =
          config.sectionScope === "selected" &&
          config.selectedSectionIds.length < sections.length;
        const preferredRoomCode = config.preferredRoomId
          ? roomCodeById.get(config.preferredRoomId) ?? null
          : null;

        return (
          <div className={`flex items-start gap-2 py-0.5 min-w-[120px] ${included ? "" : "opacity-50"}`}>
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#4e0a10]/10 text-[#4e0a10]"
            >
              <CourseIcon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs font-black leading-tight text-slate-900">
                  {course.code}
                </p>
                {!included && (
                  <span className="inline-flex rounded bg-slate-100 px-1 py-0.5 text-[9px] font-black uppercase text-slate-500">
                    Excluded
                  </span>
                )}
                {customized.has(course.id) && (
                  <span
                    title="Uses its own Configure settings instead of the Default Settings"
                    className="inline-flex rounded bg-indigo-50 px-1 py-0.5 text-[9px] font-black uppercase text-indigo-700"
                  >
                    Custom
                  </span>
                )}
                {hasSectionOverride && (
                  <span className="inline-flex rounded bg-amber-50 px-1 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-200">
                    {config.selectedSectionIds.length}/{sections.length} sections
                  </span>
                )}
                {config.requiredDay && (
                  <span
                    title="Required Day"
                    className="inline-flex items-center gap-0.5 rounded bg-violet-50 px-1 py-0.5 text-[9px] font-black uppercase text-violet-800"
                  >
                    <CalendarDays className="h-2.5 w-2.5" />
                    {config.requiredDay}
                  </span>
                )}
                {preferredRoomCode && (
                  <span
                    title="Preferred Room"
                    className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1 py-0.5 text-[9px] font-black uppercase text-sky-800"
                  >
                    <DoorOpen className="h-2.5 w-2.5" />
                    {preferredRoomCode}
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] font-semibold leading-tight text-slate-600 mt-0.5">
                {course.name}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "regular",
      header: "Regular",
      size: 70,
      enableSorting: false,
      meta: { align: "center" },
      cell: ({ row: { original } }) => renderConfigCheckbox(original, "regular", "Regular"),
    },
    {
      id: "split",
      header: "Split",
      size: 70,
      enableSorting: false,
      meta: { align: "center" },
      cell: ({ row: { original } }) => renderConfigCheckbox(original, "split", "Split"),
    },
    {
      id: "integrated",
      header: "Integrated",
      size: 80,
      enableSorting: false,
      meta: { align: "center" },
      cell: ({ row: { original } }) => renderConfigCheckbox(original, "integrated", "Integrated"),
    },
    {
      id: "delivery",
      header: "Delivery Mode",
      size: 110,
      enableSorting: false,
      meta: { align: "center" },
      cell: ({ row: { original } }) => {
        const cfg = original.config;
        return (
          <div className="flex justify-center">
            <select
              value={cfg.delivery}
              disabled={actionsDisabled}
              aria-label={`Delivery mode for ${original.course.code}`}
              onChange={(e) =>
                handleDeliveryChange(original.course, e.target.value as DeliveryMode)
              }
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 shadow-2xs transition hover:border-slate-400 focus:border-[#4e0a10] focus:ring-1 focus:ring-[#4e0a10] focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cfg.configuration === "regular" && (
                <>
                  <option value="onsite">On-Site</option>
                  <option value="online">Online</option>
                </>
              )}
              {cfg.configuration === "split" && (
                <>
                  <option value="onsite">On-Site</option>
                  {isHybridSplitEligible(original.course) && (
                    <option value="hybrid">Hybrid</option>
                  )}
                </>
              )}
              {cfg.configuration === "integrated" && (
                <>
                  <option value="onsite">On-Site</option>
                  {isHybridSchedulingEligible(
                    original.course,
                    hybridEnabled,
                    fieldCourseCodes,
                  ) && <option value="hybrid">Hybrid</option>}
                </>
              )}
            </select>
          </div>
        );
      },
    },
    {
      id: "duration",
      header: "Duration",
      size: 160,
      enableSorting: false,
      meta: { align: "center" },
      cell: ({ row: { original: { config, course } } }) => {
        const shape = durationShape(config);
        const hybridDefaults = hybridLaboratoryMinutes(course, settings);
        const isCustom = isIntegratedShape(shape)
          ? (config.lectureMinutes ?? hybridDefaults.lecture) !== hybridDefaults.lecture ||
            (config.laboratoryMinutes ?? hybridDefaults.laboratory) !== hybridDefaults.laboratory
          : isDurationEditable(shape) && config.durationMinutes !== defaultDurationMinutes(course);
        if (shape === "hybrid-split" || isIntegratedShape(shape)) {
          // Two separate sessions, each with its own length and delivery.
          return (
            <span className="inline-flex flex-col items-center gap-0.5">
              <span className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                {shape === "hybrid-split"
                  ? "Hybrid Split"
                  : shape === "hybrid-laboratory"
                    ? "Integrated Hybrid"
                    : "Integrated On-site"}
              </span>
              {meetingParts(config, course, settings).map((part) => (
                <span
                  key={part.label}
                  className="inline-flex items-center gap-1 text-[11px] font-black text-slate-800"
                >
                  <Clock3 className="h-3 w-3 text-slate-400" />
                  {isIntegratedShape(shape) ? `${part.label} ` : ""}
                  {formatHours(part.minutes / 60)} {part.mode}
                </span>
              ))}
              {isCustom && (
                <span className="text-[9px] font-black uppercase tracking-wide text-[#4e0a10]">
                  Custom
                </span>
              )}
            </span>
          );
        }
        return (
          <span className="inline-flex flex-col items-center gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs font-black text-slate-800">
              <Clock3 className="h-3 w-3 text-slate-400" />
              {durationLabel(config, course, settings)}
            </span>
            {isCustom && (
              <span className="text-[9px] font-black uppercase tracking-wide text-[#4e0a10]">
                Custom
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "configure",
      header: "Configure",
      size: 95,
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row: { original: { course } } }) => {
        const isSelected = configuringCourseId === course.id;
        return (
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => setConfiguringCourseId(course.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-2xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected
                ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-[#4e0a10] hover:bg-slate-50 hover:text-[#4e0a10]"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configure
          </button>
        );
      },
    },
  ];

  const courseTable = useDataTable<SetupCourseTableRow>({
    data: filteredRows,
    columns: courseColumns,
    pageSize: false,
    getRowId: (row) => String(row.course.id),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Top Filter and Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search course code or name..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-[#4e0a10] focus:ring-1 focus:ring-[#4e0a10] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1">
            {(
              [
                { id: "all", label: "All", count: rows.length },
                { id: "regular", label: "Regular", count: regularCount },
                { id: "split", label: "Split", count: splitCount },
                { id: "integrated", label: "Integrated", count: integratedCount },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setConfigFilter(filter.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  configFilter === filter.id
                    ? "bg-[#4e0a10] text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>{filter.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                    configFilter === filter.id
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
            <Layers className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-bold">{sections.length}</span> Section{sections.length === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
            <span className="font-bold">{includedCount}</span> of {rows.length} Course{rows.length === 1 ? "" : "s"} included
          </span>
          {activeDefaults.length > 0 && (
            <span
              title="Default Settings (the gear in the header)"
              className="rounded-md bg-[#4e0a10]/10 px-2 py-1 font-bold text-[#4e0a10]"
            >
              Defaults: {activeDefaults.join(" · ")}
            </span>
          )}
        </div>
      </div>

      {rows.length > 0 && includedCount === 0 && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Every course is unchecked. Include at least one course to generate a schedule.
        </p>
      )}

      {concentration && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Same-day concentration warning: all {concentration.courseCount} Required Day courses
            are assigned to {concentration.day}. Room and faculty availability on that day should
            be reviewed.
          </span>
        </p>
      )}

      {fieldPeriodConflicts.map(({ course, summary }) => (
        <div
          key={course.id}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-black">{course.code}</span> · {summary} {fieldPeriodWarning()}
          </span>
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => setConfiguringCourseId(course.id)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Settings2 className="h-3 w-3" />
            Configure
          </button>
        </div>
      ))}

      {/* Main Course Table */}
      <DataTable
        table={courseTable}
        variant="embedded"
        className="flex min-h-0 max-h-[62vh] w-full flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 shadow-2xs"
        scrollClassName="min-h-0 flex-1 overflow-auto"
        tableClassName="min-w-[640px]"
        headerId="generator-setup-head"
        ariaLabel="Course setup"
        emptyState={
          <p className="text-xs font-semibold text-slate-500 py-8 text-center">
            {searchQuery || configFilter !== "all"
              ? "No courses match the search and filter criteria."
              : "This curriculum has no courses for the selected year level and semester."}
          </p>
        }
      />

      {defaultsOpen && (
        <CourseDefaultsSidebar
          defaults={defaults}
          summarize={summarizeDefaults}
          customizedCount={customizedCourseIds.length}
          onResetCustomized={resetCustomized}
          disabled={actionsDisabled}
          onClose={() => onDefaultsClose?.()}
          onApply={(next) => {
            changeDefaults(next);
            onDefaultsClose?.();
          }}
        />
      )}

      {/* Slide-over Right Sidebar (portaled outside the modal directly to document.body) */}
      {configuringRow && (
        <ConfigureClassSidebar
          course={configuringRow.course}
          sections={sections}
          preferredTimeBlocks={preferredTimeBlocks}
          initialConfig={configuringRow.config}
          isFieldCourse={configuringRow.isField}
          labSettings={settings}
          roomOptions={roomOptions}
          disabled={actionsDisabled}
          onClose={() => setConfiguringCourseId(null)}
          onSave={(updatedConfig) => {
            updateCourseConfig(configuringRow.course, updatedConfig, { fromConfigure: true });
            setConfiguringCourseId(null);
          }}
        />
      )}
    </div>
  );
}
