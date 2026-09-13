import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  HelpCircle,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";
import {
  useWorkflowGuide,
  type WorkflowGuideStep,
} from "../../../../hooks/useWorkflowGuide";
import { mapApiCourse } from "../hooks/initialDataMapper";
import type {
  ApiCourseRecord,
  ApiRoomRecord,
  ApiScheduleRecord,
  Course,
  ScheduleItem,
  Section,
  Semester,
} from "../types";
import RecommendedAdjustmentPanel from "./RecommendedAdjustmentPanel";
import { resolveGenerationChanges } from "./generationChanges";
import {
  applyAdjustments,
  describeAdjustment,
  type GenerationRecommendation,
} from "./yearLevelGenerationFailure";
import type {
  DeliveryModeOption,
  SchedulingPreference,
  TimeBlockOption,
} from "./generationTypes";
import {
  canGenerateYearLevel,
  YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE,
} from "./yearLevelGenerationEligibility";
import {
  balancedSplitSettingsOf,
  isBalancedSplitSchedulingEligible,
  isConfiguredFieldCourse,
  isHybridSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import { useGenerationRun } from "../hooks/useGenerationRun";
import {
  getCachedData,
  hasCachedData,
  loadCachedData,
} from "../../../../lib/dataCache";
import {
  curriculumCoursesCacheKey,
  generatorRoomsCacheKey,
  schedulingSettingsCacheKey,
} from "./generatorCache";
import WizardProgressStepper from "./WizardProgressStepper";
import ConfigurationStep from "./ConfigurationStep";
import type { SetupDraft } from "./ConfigurationStep";
import SetupCoursesStep from "./SetupCoursesStep";
import ReviewGenerateStep from "./ReviewGenerateStep";
import ScheduleSummaryStep from "./ScheduleSummaryStep";

type Step = 1 | 2 | 3 | 4;
type CourseMode = DeliveryModeOption | "automatic";
type FixedGecSplitPattern = "MW" | "TTh";
// "auto" keeps the course split into two meetings but lets the generator pick
// the day pair — the relaxation the Recommended Adjustment panel applies.
type GecSplitPattern = FixedGecSplitPattern | "auto";
type SectionConfig = {
  courseIds: string[];
  locked: boolean;
  preferredTimeBlock: TimeBlockOption;
  splitCourseIds: string[];
  gecSplitCourseIds: string[];
  gecSplitPatternsByCourseId: Record<string, GecSplitPattern>;
  modesByCourseId: Record<string, CourseMode>;
  preferencesByCourseId: Record<string, SchedulingPreference>;
};

type SettingsResponse = {
  forced_day_rules?: ForcedDayRule[];
  forced_day_courses?: ConstraintCourse[];
  field_course_assignment_enabled?: boolean;
  field_course_options?: ConstraintCourse[];
  field_course_codes?: string[];
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
  lecture_lab_schedule_override_enabled?: boolean;
};

type ConstraintCourse = { id: number; code: string; name: string };
type ForcedDayRule = { course_id: number; day: string };
type ApiViolation = {
  rule?: string;
  message?: string;
  course_code?: string;
  day?: string;
};

interface Props {
  onClose: () => void;
  sections: Section[];
  courses: Course[];
  activeSemester: Semester | null;
  departmentId: number | null;
  departmentLogoUrl?: string | null;
  existingSchedules: ScheduleItem[];
  onAccepted: (schedules?: ApiScheduleRecord[]) => void | Promise<void>;
  /**
   * Re-reads the scheduler snapshot. Called after a curriculum is assigned so
   * the section records — and everything derived from them — pick up the change.
   */
  onSectionsChanged?: () => void | Promise<void>;
}

const wizardSteps: Array<{ id: Step; title: string }> = [
  { id: 1, title: "Configuration" },
  { id: 2, title: "Setup Courses" },
  { id: 3, title: "Review & Generate" },
  { id: 4, title: "Schedule Summary" },
];
const lastStep: Step = 4;
/**
 * How wide the modal should be on each step.
 *
 * The panel is sized by its content rather than pinned to one width, so a
 * narrow table is not stretched across the screen and the four-column rules
 * board still gets the space it needs. Every value clamps to the viewport so
 * the modal never overflows on a small screen.
 */
const stepWidths: Record<Step, string> = {
  1: "sm:w-[min(100rem,calc(100vw-2rem))]",
  2: "sm:w-[min(64rem,calc(100vw-2rem))]",
  3: "sm:w-[min(80rem,calc(100vw-2rem))]",
  4: "sm:w-[min(100rem,calc(100vw-2rem))]",
};
const storageVersion = "v5";
const defaultSetupDraft: SetupDraft = {
  completed: false,
  allowedSplitCourseIds: [],
};
const formatSemester = (semester: Semester | null) =>
  semester
    ? `${semester.academic_year} - ${semester.semester.toUpperCase()} Semester`
    : "No active semester selected";
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
const normalizeGecPattern = (value: string | undefined): GecSplitPattern =>
  value === "MW" || value === "TTh" ? value : "auto";

export default function YearLevelGenerateScheduleWorkflow({
  onClose,
  sections,
  courses,
  activeSemester,
  departmentId,
  departmentLogoUrl,
  existingSchedules,
  onAccepted,
  onSectionsChanged,
}: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  // Steps slide in from the side you are travelling towards, so Back reads as
  // going back rather than as another forward move.
  const [stepDirection, setStepDirection] = useState<"forward" | "back">(
    "forward",
  );
  const goToStep = (next: Step) => {
    setStepDirection(next >= step ? "forward" : "back");
    setStep(next);
  };
  const [yearLevel, setYearLevel] = useState<number>(1);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [configs, setConfigs] = useState<Record<string, SectionConfig>>({});
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(defaultSetupDraft);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  // The wizard is a modal: it hosts its own mission so the Schedule
  // Builder tour underneath never narrates controls the dialog covers.
  useWorkflowGuide({
    id: "schedule-generator",
    isReady: !loadingSettings,
    steps: generatorGuideSteps,
    mission: "Generate a Schedule",
  });
  const [applying, setApplying] = useState(false);
  const [rooms, setRooms] = useState<ApiRoomRecord[]>([]);
  // The run itself is owned above this modal, so closing the wizard mid-run
  // leaves the queued work — and its result — intact.
  const run = useGenerationRun();
  const generating = run.isActive;
  const preview = useMemo(
    () => run.result?.schedules ?? [],
    [run.result],
  );
  const failure = run.failure;
  const generationChanges = useMemo(
    () => resolveGenerationChanges(run.result),
    [run.result],
  );

  const storageKey = useMemo(
    () =>
      `wicars.year-level-wizard.${storageVersion}.${departmentId ?? "none"}.${activeSemester?.id ?? "none"}`,
    [activeSemester?.id, departmentId],
  );
  const departmentSections = useMemo(
    () =>
      sections.filter(
        (section) =>
          departmentId !== null &&
          Number(section.departmentId) === Number(departmentId),
      ),
    [departmentId, sections],
  );
  const availableSections = useMemo(
    () =>
      departmentSections.filter(
        (section) =>
          section.status === "active" &&
          (!activeSemester || Number(section.semesterId) === Number(activeSemester.id)),
      ),
    [activeSemester, departmentSections],
  );
  const availableYears = useMemo(
    () =>
      [
        ...new Set(
          availableSections.map((section) => Number(section.yearLevel)),
        ),
      ].sort(),
    [availableSections],
  );
  const scopedSections = useMemo(
    () =>
      availableSections.filter(
        (section) => Number(section.yearLevel) === yearLevel,
      ),
    [availableSections, yearLevel],
  );
  // The curriculum this year level follows. Every section of the year level
  // normally shares one; a mixed year level has no single answer, and the
  // curriculum step above blocks generation until somebody unifies it.
  const yearLevelCurriculumId = useMemo(() => {
    const ids = Array.from(
      new Set(
        scopedSections
          .map((section) => section.curriculumId ?? null)
          .filter((id): id is number => id !== null),
      ),
    );
    return ids.length === 1 ? ids[0] : null;
  }, [scopedSections]);

  const curriculumReady =
    scopedSections.length > 0 &&
    yearLevelCurriculumId !== null &&
    scopedSections.every((section) => (section.curriculumId ?? null) !== null);

  /**
   * Changing the curriculum changes the course list the whole wizard is built
   * on, so any configuration captured against the previous one is discarded
   * rather than silently carried over onto courses it was never about.
   */
  const handleCurriculumApplied = async () => {
    setConfigs({});
    setSetupDraft(defaultSetupDraft);
    run.clear();
    await onSectionsChanged?.();
  };

  /**
   * Courses of the year level's own curriculum.
   *
   * The `courses` prop is the union of the department's active curricula with a
   * single flattened year_level per course — the newest curriculum's. Filtering
   * that by year level would hand an old-curriculum cohort the new curriculum's
   * course list, so the list is fetched scoped to the curriculum instead.
   */
  const coursesCacheKey =
    yearLevelCurriculumId !== null && departmentId !== null
      ? curriculumCoursesCacheKey(departmentId, yearLevelCurriculumId)
      : null;
  const [curriculumCourses, setCurriculumCourses] = useState<Course[] | null>(
    () => (coursesCacheKey ? getCachedData<Course[]>(coursesCacheKey) ?? null : null),
  );

  useEffect(() => {
    if (coursesCacheKey === null || yearLevelCurriculumId === null || departmentId === null) {
      setCurriculumCourses(null);
      return;
    }

    let cancelled = false;
    // A cached list renders on the first frame; only a cold or stale key waits
    // on the network.
    const cached = getCachedData<Course[]>(coursesCacheKey);
    if (cached) setCurriculumCourses(cached);

    loadCachedData<Course[]>(coursesCacheKey, async () => {
      const response = await api.get<ApiCourseRecord[]>("/courses", {
        params: {
          department_id: departmentId,
          curriculum_id: yearLevelCurriculumId,
        },
      });

      return response.data.map(mapApiCourse);
    })
      .then((list) => {
        if (!cancelled) setCurriculumCourses(list);
      })
      .catch(() => {
        // Fall back to the prop list rather than blanking the step; the
        // backend still resolves the real course set per section at generation.
        if (!cancelled && !cached) setCurriculumCourses(null);
      });

    return () => {
      cancelled = true;
    };
  }, [coursesCacheKey, departmentId, yearLevelCurriculumId]);

  const scopedCourses = useMemo(() => {
    const source = curriculumCourses ?? courses;

    return source.filter(
      (course) =>
        Number(course.yearLevel) === yearLevel &&
        (!activeSemester || course.semester === activeSemester.semester) &&
        course.status === "active" &&
        (course.departmentId === null ||
          departmentId === null ||
          Number(course.departmentId) === Number(departmentId) ||
          isConfiguredFieldCourse(
            course,
            new Set(settings?.field_course_codes ?? []),
          )),
    );
  }, [
    activeSemester,
    courses,
    curriculumCourses,
    departmentId,
    settings?.field_course_codes,
    yearLevel,
  ]);
  const yearLevelGenerationAllowed = useMemo(
    () =>
      canGenerateYearLevel(
        scopedSections,
        existingSchedules,
        activeSemester?.id ?? null,
      ),
    [activeSemester?.id, existingSchedules, scopedSections],
  );
  const roomCodeById = useMemo(
    () =>
      // Not narrowed to the department: a plan may place a class in a room
      // another department lent it, and that row still needs its code.
      new Map(rooms.map((room) => [String(room.id), room.room_code])),
    [rooms],
  );

  const forcedDaysByCourseId = useMemo(
    () =>
      new Map(
        (settings?.forced_day_rules ?? []).map((rule) => [
          Number(rule.course_id),
          rule.day,
        ]),
      ),
    [settings?.forced_day_rules],
  );
  const activeRules = [
    "Operating hours",
    "Faculty availability",
    "Room availability",
    "Laboratory requirements",
    "Conflict prevention",
    ...(settings?.forced_day_rules?.length ? ["Forced day rules"] : []),
    ...(settings?.field_course_codes?.length ? ["Field course rules"] : []),
  ];

  useEffect(() => {
    const initialYear = availableYears[0] ?? 1;
    let restored = false;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          step?: Step;
          yearLevel?: number;
          activeSectionId?: string;
          configs?: Record<string, SectionConfig>;
          setupDraft?: Partial<SetupDraft>;
        };
        if (
          parsed.yearLevel &&
          availableYears.includes(Number(parsed.yearLevel))
        ) {
          setYearLevel(Number(parsed.yearLevel));
          setStep(
            parsed.step && parsed.step >= 1 && parsed.step <= lastStep
              ? parsed.step
              : 1,
          );
          setActiveSectionId(parsed.activeSectionId ?? "");
          setConfigs(parsed.configs ?? {});
          setSetupDraft({
            ...defaultSetupDraft,
            ...parsed.setupDraft,
            allowedSplitCourseIds:
              parsed.setupDraft?.allowedSplitCourseIds ?? [],
          });
          restored = true;
        }
      }
    } catch {
      restored = false;
    }

    if (!restored) {
      setYearLevel(initialYear);
      setStep(1);
      setActiveSectionId("");
      setConfigs({});
      setSetupDraft(defaultSetupDraft);
    }
  }, [availableYears, storageKey]);

  useEffect(() => {
    if (scopedSections.length === 0) return;
    setActiveSectionId((current) =>
      scopedSections.some((section) => section.id === current)
        ? current
        : scopedSections[0].id,
    );
    setConfigs((current) => {
      const next = { ...current };
      for (const section of scopedSections) {
        const existing = next[section.id];
        next[section.id] = {
          // Every course of the curriculum's year level is scheduled: the
          // course table has no exclude control, and an empty list here used
          // to reach the API as "generate only the field courses".
          courseIds: scopedCourses.map((course) => course.id),
          locked: existing?.locked ?? false,
          preferredTimeBlock: existing?.preferredTimeBlock ?? "flexible",
          splitCourseIds:
            existing?.splitCourseIds?.filter((id) =>
              scopedCourses.some((course) => course.id === id),
            ) ?? [],
          gecSplitCourseIds:
            existing?.gecSplitCourseIds?.filter((id) =>
              scopedCourses.some((course) => course.id === id),
            ) ?? [],
          gecSplitPatternsByCourseId: Object.fromEntries(
            scopedCourses.map((course) => [
              course.id,
              normalizeGecPattern(
                existing?.gecSplitPatternsByCourseId?.[course.id],
              ),
            ]),
          ),
          modesByCourseId: {
            ...Object.fromEntries(
              scopedCourses.map((course) => [
                course.id,
                course.roomTypeRequired === "field" ? "field" : "automatic",
              ]),
            ),
            ...(existing?.modesByCourseId ?? {}),
          },
          preferencesByCourseId: {
            ...Object.fromEntries(
              scopedCourses.map((course) => [
                course.id,
                "automatic" as SchedulingPreference,
              ]),
            ),
            ...(existing?.preferencesByCourseId ?? {}),
          },
        };
      }
      return next;
    });
  }, [scopedCourses, scopedSections]);

  useEffect(() => {
    if (!settings) return;

    // Pruned per course rather than cleared wholesale: two department settings
    // now feed this one list -- minor splits and lecture-only major splits --
    // so turning one off must not discard the other's selections.
    const splitSettings = balancedSplitSettingsOf(settings);
    setConfigs((current) =>
      Object.fromEntries(
        Object.entries(current).map(([sectionId, config]) => [
          sectionId,
          {
            ...config,
            gecSplitCourseIds: config.gecSplitCourseIds.filter((courseId) =>
              isBalancedSplitSchedulingEligible(
                scopedCourses.find((item) => item.id === courseId),
                splitSettings,
              ),
            ),
          },
        ]),
      ),
    );
  }, [scopedCourses, settings]);

  useEffect(() => {
    if (!settings) return;

    const fieldCodes = new Set(settings.field_course_codes ?? []);
    setConfigs((current) =>
      Object.fromEntries(
        Object.entries(current).map(([sectionId, config]) => [
          sectionId,
          {
            ...config,
            splitCourseIds: config.splitCourseIds.filter((courseId) => {
              const course = scopedCourses.find((item) => item.id === courseId);
              return Boolean(
                course &&
                  !forcedDaysByCourseId.has(Number(courseId)) &&
                  isHybridSchedulingEligible(
                    course,
                    Boolean(settings.lecture_lab_schedule_override_enabled),
                    fieldCodes,
                  ),
              );
            }),
          },
        ]),
      ),
    );
  }, [forcedDaysByCourseId, scopedCourses, settings]);

  useEffect(() => {
    const allowedCourseIds = new Set(setupDraft.allowedSplitCourseIds);
    setConfigs((current) =>
      Object.fromEntries(
        Object.entries(current).map(([sectionId, config]) => [
          sectionId,
          {
            ...config,
            gecSplitCourseIds: config.gecSplitCourseIds.filter((courseId) =>
              allowedCourseIds.has(courseId),
            ),
          },
        ]),
      ),
    );
  }, [setupDraft.allowedSplitCourseIds]);

  // Keyed on the section id rather than the memoised section array: the array
  // gets a new identity whenever the scope recomputes, which refetched the
  // rules on almost every render.
  const settingsSectionId = scopedSections[0]?.id ?? "";
  const settingsCacheKey = settingsSectionId
    ? schedulingSettingsCacheKey(settingsSectionId)
    : null;

  useEffect(() => {
    if (settingsCacheKey === null || !settingsSectionId) return;

    let cancelled = false;
    const cached = getCachedData<SettingsResponse>(settingsCacheKey);
    if (cached) setSettings(cached);
    setLoadingSettings(!hasCachedData(settingsCacheKey));

    loadCachedData<SettingsResponse>(settingsCacheKey, async () => {
      const response = await api.get<SettingsResponse>("/scheduling-settings", {
        params: { section_id: settingsSectionId },
      });

      return response.data;
    })
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled && !cached) {
          toast.error("Error", "Failed to load scheduling rules.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSettings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [settingsCacheKey, settingsSectionId, toast]);

  const roomsCacheKey = generatorRoomsCacheKey(departmentId ?? null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedData<ApiRoomRecord[]>(roomsCacheKey);
    if (cached) setRooms(cached);

    loadCachedData<ApiRoomRecord[]>(roomsCacheKey, async () => {
      const response = await api.get<ApiRoomRecord[]>("/rooms");

      return response.data ?? [];
    })
      .then((list) => {
        if (!cancelled) setRooms(list);
      })
      .catch(() => {
        if (!cancelled && !cached) setRooms([]);
      });

    return () => {
      cancelled = true;
    };
  }, [roomsCacheKey]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ step, yearLevel, activeSectionId, configs, setupDraft }),
    );
  }, [activeSectionId, configs, setupDraft, step, storageKey, yearLevel]);

  useEffect(() => {
    if (!yearLevelGenerationAllowed && step !== 1) {
      setStep(1);
    }
  }, [step, yearLevelGenerationAllowed]);

  /**
   * A run in flight belongs on Review & Generate, where the button is a
   * loader; only a finished run takes over the summary step. Reopening the
   * wizard therefore lands on whichever of the two matches the run.
   */
  useEffect(() => {
    if (run.status === "idle") return;
    const target: Step = run.isActive ? 3 : lastStep;
    setStepDirection("forward");
    setStep((current) => (current === target ? current : target));
  }, [run.isActive, run.status]);

  useEffect(() => {
    if (step === lastStep && run.status === "completed") run.markReviewed();
  }, [run, step]);

  const updateConfig = (sectionId: string, change: Partial<SectionConfig>) =>
    setConfigs((current) => ({
      ...current,
      [sectionId]: {
        ...current[sectionId],
        ...change,
        locked: change.locked ?? false,
      },
    }));

  const generate = async (configsOverride?: Record<string, SectionConfig>) => {
    if (!activeSemester || departmentId === null) return;
    if (!yearLevelGenerationAllowed) return;
    const activeConfigs = configsOverride ?? configs;
    const configuredFieldCourseIds = scopedCourses
      .filter((course) =>
        isConfiguredFieldCourse(
          course,
          new Set(settings?.field_course_codes ?? []),
        ),
      )
      .map((course) => Number(course.id));
    const hybridEligibleCourseIds = new Set(
      scopedCourses
        .filter((course) =>
          isHybridSchedulingEligible(
            course,
            Boolean(settings?.lecture_lab_schedule_override_enabled),
            new Set(settings?.field_course_codes ?? []),
          ),
        )
        .map((course) => course.id),
    );
    try {
      const payload = {
        semester_id: Number(activeSemester.id),
        department_id: departmentId,
        year_level: yearLevel,
        section_configs: scopedSections.map((section) => {
          const config = activeConfigs[section.id];
          return {
            section_id: Number(section.id),
            // Asserts which curriculum this setup was built against. If somebody
            // reassigns the year level while this wizard is open, the API
            // answers 409 instead of generating a timetable for courses the
            // user never saw.
            curriculum_id: section.curriculumId ?? null,
            course_ids: Array.from(
              new Set([
                ...config.courseIds.map(Number),
                ...configuredFieldCourseIds,
              ]),
            ),
            selected_split_session_course_ids: config.splitCourseIds
              .filter(
                (courseId) =>
                  hybridEligibleCourseIds.has(courseId) &&
                  !forcedDaysByCourseId.has(Number(courseId)),
              )
              .map(Number),
            selected_gec_course_ids: config.gecSplitCourseIds
              .filter(
                (courseId) =>
                  !forcedDaysByCourseId.has(Number(courseId)) &&
                  isBalancedSplitSchedulingEligible(
                    scopedCourses.find((item) => item.id === courseId),
                    balancedSplitSettingsOf(settings),
                  ),
              )
              .map(Number),
            preferred_patterns: Object.fromEntries(
              config.gecSplitCourseIds
                .filter((id) => !forcedDaysByCourseId.has(Number(id)))
                .map(
                  (id) =>
                    [
                      id,
                      config.gecSplitPatternsByCourseId[id] ?? "auto",
                    ] as const,
                )
                .filter(([, pattern]) => pattern !== "auto")
                .map(([id, pattern]) => [Number(id), pattern]),
            ),
            delivery_modes_by_course_id: Object.fromEntries(
              Object.entries(config.modesByCourseId)
                .filter(([, mode]) => mode !== "automatic")
                .map(([id, mode]) => [Number(id), mode]),
            ),
            // A section assigned to a teaching period is restricted to it;
            // "flexible" means the whole operating day is available.
            preferred_period:
              config.preferredTimeBlock === "flexible"
                ? null
                : config.preferredTimeBlock,
          };
        }),
      };
      await run.start(payload, {
        yearLevel,
        sectionCount: scopedSections.length,
      });
    } catch (error: unknown) {
      // Preparing the request is the only failure that still belongs here.
      // Queue rejections and solver failures are reported through the shared
      // run state, which outlives this modal.
      toast.error(
        "Generation Unsuccessful",
        error instanceof Error
          ? error.message
          : "The generation request could not be prepared.",
      );
    }
  };

  const applyRecommendationAndRetry = (
    recommendation: GenerationRecommendation,
  ) => {
    const { configs: nextConfigs, applied } = applyAdjustments(
      configs,
      recommendation.adjustments,
    );
    if (applied.length === 0) {
      toast.error(
        "Nothing to Apply",
        "That adjustment no longer changes the current configuration. Review the constraints instead.",
      );
      return;
    }

    setConfigs(nextConfigs);
    toast.success(
      "Adjustment Applied",
      applied.map((adjustment) => describeAdjustment(adjustment)).join(" | "),
    );
    void generate(nextConfigs);
  };

  const reviewConstraints = (sectionId: number | null) => {
    if (
      sectionId !== null &&
      scopedSections.some((section) => String(section.id) === String(sectionId))
    ) {
      setActiveSectionId(String(sectionId));
    }
    run.clear();
    goToStep(2);
  };

  const apply = async () => {
    setApplying(true);
    // The generator closes on the click rather than when the save resolves.
    // Refreshing the timetable behind it raises its own loading overlay, and
    // holding the wizard open stacked a second dialog on top of it. Nothing
    // is lost by leaving early: a failure is reported by toast, and the error
    // path clears neither the run nor the saved draft, so reopening the
    // generator comes back to this same result.
    onClose();
    try {
      const replaceableStatuses = new Set(["draft", "completed", "revision"]);
      const sectionIds = new Set(
        scopedSections.map((section) => String(section.id)),
      );
      const deleteIds = existingSchedules
        .filter(
          (schedule) =>
            sectionIds.has(String(schedule.sectionId)) &&
            (!activeSemester ||
              Number(schedule.semesterId) === Number(activeSemester.id)) &&
            replaceableStatuses.has(schedule.status),
        )
        .map((schedule) => Number(schedule.id))
        .filter((id) => id > 0);
      const operations = preview.map((r) => ({
        semester_id: Number(r.semester_id),
        section_id: Number(r.section_id),
        course_id: Number(r.course_id ?? r.subject_id),
        faculty_id: r.faculty_id ? Number(r.faculty_id) : null,
        room_id: r.mode === "online" ? null : Number(r.room_id) || null,
        department_id: Number(r.department_id),
        day: r.day,
        start_time: r.start_time.slice(0, 5),
        end_time: r.end_time.slice(0, 5),
        mode: r.mode ?? "on-site",
        is_hybrid: Boolean(r.is_hybrid),
        preferred_pattern: r.preferred_pattern ?? null,
        split_group_id: r.split_group_id ?? null,
        meeting_type: r.meeting_type ?? null,
        meeting_index: r.meeting_index ?? null,
        status: "draft",
      }));
      const response = await api.post<{ schedules?: ApiScheduleRecord[] }>(
        "/schedules/batch",
        {
          operations,
          delete_ids: deleteIds,
          replace_section_ids: Array.from(sectionIds)
            .map(Number)
            .filter((id) => id > 0),
          replace_semester_id: activeSemester ? Number(activeSemester.id) : undefined,
        },
      );
      window.localStorage.removeItem(storageKey);
      run.clear();
      toast.success(
        "Generation Complete",
        "The year-level timetable was saved as draft schedules.",
      );
      try {
        await onAccepted(response.data.schedules ?? preview);
      } catch {
        toast.error(
          "Refresh Needed",
          "The timetable was saved, but the local timetable could not refresh automatically.",
        );
      }
    } catch (error: unknown) {
      const apiError = error as {
        message?: string;
        response?: {
          status?: number;
          data?: {
            message?: string;
            errors?: Record<string, string[]>;
            violations?: ApiViolation[];
          };
        };
      };
      const violations = Array.isArray(apiError.response?.data?.violations)
        ? apiError.response.data.violations
        : [];
      const summary = violations
        .slice(0, 3)
        .map((violation) => violation.message)
        .filter((message): message is string => Boolean(message))
        .join(" | ");
      const validationSummary = Object.values(
        apiError.response?.data?.errors ?? {},
      )
        .flat()
        .slice(0, 3)
        .join(" | ");

      toast.error(
        violations.length > 0 ? "Schedule Conflict" : "Save Failed",
        summary ||
          validationSummary ||
          apiError.response?.data?.message ||
          apiError.message ||
          `Unable to save timetable${apiError.response?.status ? ` (HTTP ${apiError.response.status})` : ""}.`,
      );
    } finally {
      setApplying(false);
    }
  };

  const canContinue =
    scopedSections.length > 0 &&
    scopedCourses.length > 0 &&
    // Everything after this step is configured against a course list, and that
    // list is only well defined once the year level's curriculum is settled.
    (step !== 1 || curriculumReady) &&
    (step !== 1 || yearLevelGenerationAllowed);

  /**
   * One row per course, with the flags and preferences the review step
   * summarises. A flag is only "on" when every section carries it, which is
   * how the course table writes it.
   */
  const reviewCourseRows = scopedCourses.map((course) => ({
    course,
    hybrid:
      scopedSections.length > 0 &&
      scopedSections.every((section) =>
        (configs[section.id]?.splitCourseIds ?? []).includes(course.id),
      ),
    split:
      scopedSections.length > 0 &&
      scopedSections.every((section) =>
        (configs[section.id]?.gecSplitCourseIds ?? []).includes(course.id),
      ),
  }));

  const generationBlockedReason = !yearLevelGenerationAllowed
    ? YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE
    : !curriculumReady
      ? "Assign a curriculum to every section of this year level before generating."
      : scopedCourses.length === 0
        ? "This curriculum has no courses for the selected year level and semester."
        : null;

  return (
    <div
      className={`flex min-h-0 w-[calc(100vw-1rem)] flex-col overflow-hidden bg-white transition-[width] duration-300 ease-out ${stepWidths[step]}`}
    >
      <header className="flex shrink-0 items-center gap-3 bg-[#4e0a10] px-4 py-3 sm:px-5">
        {departmentLogoUrl && (
          <img
            src={departmentLogoUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full bg-white/10 object-contain"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-black text-white sm:text-lg">
            Generate Schedule
          </h2>
          <p className="truncate text-xs font-semibold text-white/70">
            {formatSemester(activeSemester)} &middot; {yearLabel(yearLevel)} &middot;{" "}
            {scopedSections.length} section
            {scopedSections.length === 1 ? "" : "s"}
          </p>
        </div>
        <HelpButton
          title={wizardSteps[step - 1].title}
          text={helpText[step]}
          tone="onMaroon"
        />
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("restart-workflow-guide:schedule-generator"),
            )
          }
          aria-label="Replay the guided tutorial"
          title="Replay the guided tutorial"
          className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <Compass className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close schedule generator"
          className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="shrink-0 bg-white px-3 py-2.5 sm:px-4">
        <WizardProgressStepper
          id="generator-progress"
          currentStep={step}
          steps={wizardSteps}
          ariaLabel="Schedule generator steps"
        />
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-parchment p-3 sm:p-4">
        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3">
          {failure ? (
            <RecommendedAdjustmentPanel
              failure={failure}
              busy={generating}
              onApplyAndRetry={applyRecommendationAndRetry}
              onReviewConstraints={reviewConstraints}
              onCancel={() => run.clear()}
            />
          ) : (
            <div
              key={step}
              id="generator-step-panel"
              className={`flex min-h-0 flex-1 flex-col ${
                stepDirection === "back"
                  ? "motion-safe:animate-stepInLeft"
                  : "motion-safe:animate-stepInRight"
              }`}
            >
              {step === 1 && (
                <ConfigurationStep
                  activeSemester={activeSemester}
                  years={availableYears}
                  yearLevel={yearLevel}
                  onYearChange={(value) => {
                    setYearLevel(value);
                    run.clear();
                  }}
                  departmentId={departmentId ?? null}
                  sections={scopedSections}
                  courses={scopedCourses}
                  onCurriculumApplied={handleCurriculumApplied}
                  settings={settings}
                  setSettings={setSettings}
                  loadingSettings={loadingSettings}
                  setupDraft={setupDraft}
                  setSetupDraft={setSetupDraft}
                  sectionId={scopedSections[0]?.id ?? ""}
                  actionsDisabled={!yearLevelGenerationAllowed || generating}
                  configs={configs}
                  onConfigChange={updateConfig}
                />
              )}

              {step === 2 && (
                <SetupCoursesStep
                  courses={scopedCourses}
                  sections={scopedSections}
                  configs={configs}
                  onConfigChange={updateConfig}
                  settings={settings}
                  allowedSplitCourseIds={
                    new Set(setupDraft.allowedSplitCourseIds)
                  }
                  actionsDisabled={generating}
                />
              )}

              {step === 3 && (
                <ReviewGenerateStep
                  activeSemester={activeSemester}
                  yearLevel={yearLevel}
                  curriculumName={
                    scopedSections[0]?.curriculumName ?? null
                  }
                  sections={scopedSections}
                  courseRows={reviewCourseRows}
                  periodsBySectionId={Object.fromEntries(
                    scopedSections.map((section) => [
                      section.id,
                      configs[section.id]?.preferredTimeBlock ?? "flexible",
                    ]),
                  )}
                  forcedDayRules={settings?.forced_day_rules ?? []}
                  fieldCourseCodes={settings?.field_course_codes ?? []}
                  activeRules={activeRules}
                  generating={generating}
                  blockedReason={generationBlockedReason}
                />
              )}

              {step === 4 && (
                <ScheduleSummaryStep
                  preview={preview}
                  sections={scopedSections}
                  courses={scopedCourses}
                  roomCodeById={roomCodeById}
                  changes={generationChanges}
                />
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
        <p
          className={`min-w-0 flex-1 truncate text-xs font-semibold ${
            !generating && step === 3 && generationBlockedReason
              ? "text-rose-700"
              : "text-slate-500"
          }`}
        >
          {generating
            ? "Cancel stops this run: the worker halts at its next checkpoint and returns you to the summary. Nothing is saved."
            : step === 3 && generationBlockedReason
              ? generationBlockedReason
              : helpText[step]}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {generating ? (
            <button
              type="button"
              onClick={() => void run.cancel()}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          ) : (
            <button
              type="button"
              disabled={step === 1 || applying}
              onClick={() => goToStep((step - 1) as Step)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {step < 3 && (
            <button
              id="generator-continue"
              type="button"
              disabled={!canContinue}
              onClick={() => goToStep((step + 1) as Step)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {step === 3 && (
            <button
              id="generator-generate"
              type="button"
              onClick={() => void generate()}
              disabled={generating || generationBlockedReason !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-5 py-2 text-sm font-black text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating schedule...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </>
              )}
            </button>
          )}
          {step === 4 && (
            <>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating || applying}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" /> Generate again
              </button>
              <button
                id="generator-save"
                type="button"
                onClick={apply}
                disabled={applying || generating || preview.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-5 py-2 text-sm font-black text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save &amp; View Timetable
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

/**
 * Guided mission for the generator wizard.
 *
 * The wizard opens as a modal over the Schedule Builder, so the builder's own
 * tour cannot narrate it: the engine hides any step whose target a dialog
 * covers, and this mission takes over from inside. Action steps advance only
 * when the user really performs them; `complete` steps are read-and-continue.
 *
 * Steps that must wait for a control to become usable target
 * `:not([disabled])` so the spotlight lands on a button the user can press
 * rather than a greyed-out one.
 */
const generatorGuideSteps: WorkflowGuideStep[] = [
  {
    id: "overview",
    element: "#generator-progress",
    title: "Four steps to a schedule",
    description:
      "Configuration, Setup Courses, Review, then Summary. Nothing is saved until the last step, so you can explore freely.",
    side: "bottom",
  },
  {
    id: "year-level",
    element: "#generator-year-level",
    title: "Check the year level",
    description:
      "Everything below is scoped to this year level. The section and course counts underneath update with it.",
    side: "bottom",
  },
  {
    id: "curriculum",
    element: "#generator-curriculum-select",
    action: "select",
    taskHint: "Choose a curriculum to continue.",
    title: "Pick the curriculum",
    description:
      "Every section of this year level must share one curriculum — it decides which courses get scheduled.",
    side: "bottom",
  },
  {
    id: "apply-curriculum",
    element: "#generator-apply-curriculum:not([disabled])",
    action: "click",
    // Already applied? The button stays disabled, the target never matches,
    // and the step is skipped instead of stalling the mission.
    skipIfMissing: true,
    waitTimeoutMs: 2500,
    taskHint: "Click Apply to year level to continue.",
    title: "Apply it to every section",
    description:
      "This writes the curriculum onto each section in scope. Skip it if the button is greyed out — that means it is already applied.",
    side: "bottom",
    align: "end",
  },
  {
    id: "rules",
    element: "#generator-rules",
    title: "Set the scheduling rules",
    description:
      "Four optional rule boards. Leave them all empty and the solver is free to place anything anywhere — each one you use narrows its choices. The next four steps walk through them.",
    side: "top",
  },
  {
    id: "rule-forced-day",
    element: "#generator-column-forced-day",
    title: "Forced Day",
    description:
      "Pins a course to one weekday. Click the course, then pick its day. Use it for courses that must share a day with something outside this schedule — the counter in the header shows how many are pinned.",
    side: "top",
    align: "start",
  },
  {
    id: "rule-field",
    element: "#generator-column-field",
    title: "Field Courses",
    description:
      "Marks courses delivered off-campus, so the solver does not spend a room on them. Needs Field Course Assignment enabled in Settings; the column says so when it is off.",
    side: "top",
    align: "start",
  },
  {
    id: "rule-split",
    element: "#generator-column-split",
    title: "Allowed Split",
    description:
      "Lets a minor course meet twice in the week instead of once. Only split-eligible minor courses are listed, and only when Minor Course Split Sessions is enabled in Settings.",
    side: "top",
    align: "end",
  },
  {
    id: "rule-periods",
    element: "#generator-column-periods",
    title: "Preferred Meetings",
    description:
      "Keeps a section inside the morning, afternoon, or evening. Click a period to set it, click it again to clear it back to any time within operating hours. This one is per section, not per course.",
    side: "top",
    align: "end",
  },
  {
    id: "to-setup",
    element: "#generator-continue:not([disabled])",
    action: "click",
    taskHint: "Click Continue to move to Setup Courses.",
    title: "Continue to Setup Courses",
    description:
      "Continue stays greyed out until this year level has a curriculum and courses to schedule.",
    side: "top",
    align: "end",
  },
  {
    id: "setup-courses",
    // Anchored to the column headers, not the whole panel: a tooltip centered
    // over a full-height table hides the rows the step is describing.
    element: "#generator-setup-head",
    waitFor: "#generator-setup-head",
    title: "Tune each course",
    description:
      "One row per course. Hybrid switches delivery between face-to-face and online, Split lets the course meet twice, and Configure sets the meeting period it prefers.",
    side: "bottom",
    align: "start",
  },
  {
    id: "to-review",
    element: "#generator-continue:not([disabled])",
    action: "click",
    taskHint: "Click Continue to move to Review.",
    title: "Continue to Review",
    description: "Setup is per course; the next step shows everything together before anything runs.",
    side: "top",
    align: "end",
  },
  {
    id: "review",
    element: "#generator-step-panel",
    title: "Check every selection",
    description:
      "This is the last look before the solver runs: sections in scope, the courses it will place, and the rules it must respect. Still nothing saved.",
    side: "center",
  },
  {
    id: "generate",
    element: "#generator-generate:not([disabled])",
    action: "click",
    taskHint: "Click Generate to run the solver.",
    title: "Generate the schedule",
    description:
      "The run is queued on the server, so progress keeps going even if you close this window. A blocked run comes back with recommended adjustments instead of a timetable.",
    side: "top",
    align: "end",
  },
  {
    id: "save",
    element: "#generator-save",
    // Generation is queued work: give it room, and end the mission cleanly if
    // the run is still going (or came back blocked) rather than hanging on.
    waitTimeoutMs: 300000,
    skipIfMissing: true,
    title: "Save it as drafts",
    description:
      "Review the generated meetings, then save. They land as draft schedules you can still edit in the builder — that is the whole flow.",
    side: "top",
    align: "end",
  },
];

const helpText: Record<Step, string> = {
  1: "Pick the year level and curriculum, then set the forced-day, field and split rules.",
  2: "Turn hybrid and split sessions on per course, and set preferred meeting times.",
  3: "Check every selection, then generate. Nothing is saved until you apply the result.",
  4: "Review the generated timetable, then save it as draft schedules.",
};

function HelpButton({
  title,
  text,
  tone = "default",
}: {
  title: string;
  text: string;
  tone?: "default" | "onMaroon";
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`rounded-full p-1 transition ${
          tone === "onMaroon"
            ? "text-white/70 hover:bg-white/10 hover:text-white"
            : "text-slate-400 hover:bg-slate-100 hover:text-[#4e0a10]"
        }`}
        aria-label={`Help: ${title}`}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-10 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium leading-relaxed text-slate-600 shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}
