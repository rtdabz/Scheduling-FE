import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Compass,
  HelpCircle,
  Loader2,
  RefreshCw,
  Save,
  Settings,
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
import DraftIssuesPanel from "./DraftIssuesPanel";
import {
  applyDraftOptions,
  draftReviewErrorMessage,
  fetchDraftReview,
  stillUnplaced,
  type DraftIssue,
  type DraftOption,
} from "./draftReview";
import GenerationGuide from "./GenerationGuide";
import { yearLabel } from "./yearLabel";
import { GUIDE_CHAPTER_FOR_STEP } from "./generationGuideContent";
import { APPLY_ALL_RECOMMENDATION_ID } from "./recommendationGroups";
import { resolveGenerationChanges } from "./generationChanges";
import {
  applyAdjustments,
  applyYearLevelAdjustments,
  recommendationTarget,
  describeAdjustment,
  type GenerationAdjustment,
  type GenerationRecommendation,
} from "./yearLevelGenerationFailure";
import type { DeliveryModeOption } from "./generationTypes";
import {
  canGenerateYearLevel,
  getYearLevelScheduleState,
  SECTIONS_GENERATION_BLOCKED_MESSAGE,
  YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE,
  type YearLevelScheduleState,
} from "./yearLevelGenerationEligibility";
import {
  balancedSplitSettingsOf,
  isBalancedSplitSchedulingEligible,
  isConfiguredFieldCourse,
  isHybridSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import { useGenerationRun, type GenerationResult } from "../hooks/useGenerationRun";
import {
  getCachedData,
  hasCachedData,
  loadCachedData,
  setCachedData,
} from "../../../../lib/dataCache";
import type { LaboratoryDurationSettings } from "../courseSlotPlan";
import {
  EMPTY_COURSE_DEFAULTS,
  formatHours,
  type ConsecutiveDayRule,
  type CourseDefaults,
  type PreferredRoomOption,
} from "./courseClassConfig";
import {
  curriculumCoursesCacheKey,
  generatorRoomsCacheKey,
  schedulingSettingsCacheKey,
} from "./generatorCache";
import WizardProgressStepper from "./WizardProgressStepper";
import ConfigurationStep from "./ConfigurationStep";
import type { SetupDraft } from "./ConfigurationStep";
import { orderDays } from "./generationTypes";
import SetupCoursesStep from "./SetupCoursesStep";
import ReviewGenerateStep, { type ReviewRule } from "./ReviewGenerateStep";
import ScheduleSummaryStep from "./ScheduleSummaryStep";
import { configureLabRoomType, normalizeLabRoomType, type LabRoomType } from "../../../../lib/labRoomPolicy";

type Step = 1 | 2 | 3 | 4;
type CourseMode = DeliveryModeOption | "automatic";
type FixedGecSplitPattern = "MW" | "TTh";
type GecSplitPattern = FixedGecSplitPattern | "auto";
type SectionConfig = {
  courseIds: string[];
  locked: boolean;
  splitCourseIds: string[];
  gecSplitCourseIds: string[];
  hybridSplitCourseIds?: string[];
  gecSplitPatternsByCourseId: Record<string, GecSplitPattern>;
  modesByCourseId: Record<string, CourseMode>;
  durationMinutesByCourseId?: Record<string, number>;
  preferredRoomsByCourseId?: Record<string, string>;
  componentMinutesByCourseId?: Record<string, { lecture: number; laboratory: number }>;
};

type SettingsResponse = LaboratoryDurationSettings & {
  forced_day_rules?: ForcedDayRule[];
  consecutive_day_rules?: ConsecutiveDayRule[];
  forced_day_courses?: ConstraintCourse[];
  field_course_assignment_enabled?: boolean;
  field_course_options?: ConstraintCourse[];
  field_course_codes?: string[];
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
  lecture_lab_schedule_override_enabled?: boolean;
  preferred_room_options?: PreferredRoomOption[];
  sunday_classes_enabled?: boolean;
  can_manage_sunday_classes?: boolean;
  sunday_class_count?: number;
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
  laboratoryEnabled?: boolean;
  existingSchedules: ScheduleItem[];
  onAccepted: (schedules?: ApiScheduleRecord[]) => void | Promise<void>;
  onSectionsChanged?: () => void | Promise<void>;
  onSavingChange?: (saving: boolean) => void;
}

const wizardSteps: Array<{ id: Step; title: string }> = [
  { id: 1, title: "Configuration" },
  { id: 2, title: "Setup Courses" },
  { id: 3, title: "Review & Generate" },
  { id: 4, title: "Schedule Summary" },
];
const lastStep: Step = 4;
const stepWidths: Record<Step, string> = {
  1: "sm:w-[min(100rem,calc(100vw-2rem))]",
  2: "sm:w-[min(80rem,calc(100vw-2rem))]",
  3: "sm:w-[min(80rem,calc(100vw-2rem))]",
  4: "sm:w-[min(100rem,calc(100vw-2rem))]",
};
const storageVersion = "v5";
const defaultSetupDraft: SetupDraft = {
  completed: false,
  preferredDays: [],
  courseDefaults: EMPTY_COURSE_DEFAULTS,
  excludedCourseIds: [],
  customizedCourseIds: [],
};
const courseDefaultsStorageKey = (departmentId: string | number | null | undefined) =>
  `wicars.generator-course-defaults.v1.${departmentId ?? "none"}`;
const readSavedCourseDefaults = (key: string): CourseDefaults => {
  try {
    const saved = window.localStorage.getItem(key);
    const parsed = saved ? (JSON.parse(saved) as Partial<CourseDefaults>) : {};
    return { ...EMPTY_COURSE_DEFAULTS, ...parsed };
  } catch {
    return EMPTY_COURSE_DEFAULTS;
  }
};
const withoutCourseRules = (settings: SettingsResponse): SettingsResponse => ({
  ...settings,
  forced_day_rules: [],
  consecutive_day_rules: [],
  field_course_codes: [],
});
const keepRunRules = (
  current: SettingsResponse,
  next: SettingsResponse,
): SettingsResponse => ({
  ...next,
  forced_day_rules: current.forced_day_rules ?? [],
  consecutive_day_rules: current.consecutive_day_rules ?? [],
  field_course_codes: current.field_course_codes ?? [],
});
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];
const formatSemester = (semester: Semester | null) =>
  semester
    ? `${semester.academic_year} - ${semester.semester.toUpperCase()} Semester`
    : "No active semester selected";
const normalizeGecPattern = (value: string | undefined): GecSplitPattern =>
  value === "MW" || value === "TTh" ? value : "auto";

export default function YearLevelGenerateScheduleWorkflow({
  onClose,
  sections,
  courses,
  activeSemester,
  departmentId,
  departmentLogoUrl,
  laboratoryEnabled = true,
  existingSchedules,
  onAccepted,
  onSectionsChanged,
  onSavingChange,
}: Props) {
  const { toast, confirm } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [stepDirection, setStepDirection] = useState<"forward" | "back">(
    "forward",
  );
  const goToStep = (next: Step) => {
    setStepDirection(next >= step ? "forward" : "back");
    setStep(next);
  };
  const [yearLevel, setYearLevel] = useState<number>(1);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [targetSectionIds, setTargetSectionIds] = useState<string[] | null>(null);
  const [configs, setConfigs] = useState<Record<string, SectionConfig>>({});
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(defaultSetupDraft);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  useWorkflowGuide({
    id: "schedule-generator",
    isReady: !loadingSettings,
    steps: generatorGuideSteps,
    mission: "Generate a Schedule",
  });
  const [applying, setApplying] = useState(false);
  const [rooms, setRooms] = useState<ApiRoomRecord[]>([]);
  const run = useGenerationRun();
  const generating = run.isActive;
  const [draft, setDraft] = useState<{
    result: GenerationResult;
    rows: ApiScheduleRecord[];
  } | null>(null);
  const preview = useMemo(
    () =>
      draft !== null && draft.result === run.result
        ? draft.rows
        : (run.result?.schedules ?? []),
    [draft, run.result],
  );
  const unplacedCourses = useMemo(
    () => run.result?.unplaced_courses ?? [],
    [run.result],
  );
  const needsReview = run.result?.status === "partial";
  const [review, setReview] = useState<{
    rows: ApiScheduleRecord[];
    issues: DraftIssue[] | null;
    error: string | null;
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const currentReview = review !== null && review.rows === preview ? review : null;
  const draftIssues: DraftIssue[] | null = needsReview
    ? (currentReview?.issues ?? null)
    : [];
  const failure = run.failure?.provisional ? null : run.failure;
  const generationChanges = useMemo(
    () => resolveGenerationChanges(run.result),
    [run.result],
  );
  const generationRecommendations = useMemo(
    () => run.result?.recommendations ?? [],
    [run.result],
  );

  const storageKey = useMemo(
    () =>
      `wicars.year-level-wizard.${storageVersion}.${departmentId ?? "none"}.${activeSemester?.id ?? "none"}`,
    [activeSemester?.id, departmentId],
  );
  const defaultsStorageKey = courseDefaultsStorageKey(departmentId);
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
  const availableYearsKey = availableYears.join(",");
  const scopedSections = useMemo(
    () =>
      availableSections.filter(
        (section) => Number(section.yearLevel) === yearLevel,
      ),
    [availableSections, yearLevel],
  );
  const targetSections = useMemo(
    () =>
      targetSectionIds === null
        ? scopedSections
        : scopedSections.filter((section) =>
            targetSectionIds.includes(String(section.id)),
          ),
    [scopedSections, targetSectionIds],
  );
  const scheduledSectionIds = useMemo(
    () =>
      new Set(
        existingSchedules
          .filter(
            (schedule) =>
              !activeSemester ||
              Number(schedule.semesterId) === Number(activeSemester.id),
          )
          .map((schedule) => String(schedule.sectionId)),
      ),
    [activeSemester, existingSchedules],
  );
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

  const handleCurriculumApplied = async () => {
    setConfigs({});
    setSetupDraft({
      ...defaultSetupDraft,
      courseDefaults: readSavedCourseDefaults(defaultsStorageKey),
    });
    run.clear();
    await onSectionsChanged?.();
  };

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
        targetSections,
        existingSchedules,
        activeSemester?.id ?? null,
      ),
    [activeSemester?.id, existingSchedules, targetSections],
  );
  const targetState = useMemo(
    () =>
      getYearLevelScheduleState(
        targetSections,
        existingSchedules,
        activeSemester?.id ?? null,
      ),
    [activeSemester?.id, existingSchedules, targetSections],
  );
  const yearStates = useMemo(
    () =>
      Object.fromEntries(
        availableYears.map((year) => [
          year,
          getYearLevelScheduleState(
            availableSections.filter(
              (section) => Number(section.yearLevel) === year,
            ),
            existingSchedules,
            activeSemester?.id ?? null,
          ),
        ]),
      ) as Record<number, YearLevelScheduleState>,
    [activeSemester?.id, availableSections, availableYears, existingSchedules],
  );
  const roomCodeById = useMemo(
    () =>
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
  const courseCountLabel = (count: number) =>
    `${count} course${count === 1 ? "" : "s"}`;
  const forcedDayCourseCount = new Set(
    (settings?.forced_day_rules ?? []).map((rule) => String(rule.course_id)),
  ).size;
  const consecutiveCourseCount = new Set(
    (settings?.consecutive_day_rules ?? []).map((rule) => String(rule.course_id)),
  ).size;
  const fieldCourseCount = settings?.field_course_codes?.length ?? 0;
  const activeRules: ReviewRule[] = [
    { label: "Operating hours", detail: "Classes stay inside the open timeslots", kind: "core" },
    { label: "Room availability", detail: "No room is double-booked", kind: "core" },
    { label: "Laboratory requirements", detail: "Lab sessions go to lab rooms", kind: "core" },
    { label: "Conflict prevention", detail: "No section has two classes at once", kind: "core" },
    ...(forcedDayCourseCount
      ? [{ label: "Required days", detail: courseCountLabel(forcedDayCourseCount), kind: "setup" as const }]
      : []),
    ...(consecutiveCourseCount
      ? [{ label: "Consecutive days", detail: courseCountLabel(consecutiveCourseCount), kind: "setup" as const }]
      : []),
    ...(fieldCourseCount
      ? [{ label: "Field courses", detail: `${courseCountLabel(fieldCourseCount)} · meet in a field room`, kind: "setup" as const }]
      : []),
    ...(setupDraft.courseDefaults.allowFridaySaturdaySplit
      ? [{ label: "Friday + Saturday split", detail: "Split sessions may pair Fri and Sat", kind: "setup" as const }]
      : []),
  ];
  const excludedCourseIdSet = new Set(setupDraft.excludedCourseIds);
  const includedCourses = scopedCourses.filter(
    (course) => !excludedCourseIdSet.has(course.id),
  );

  const yearStatesRef = useRef(yearStates);
  yearStatesRef.current = yearStates;
  const runYearLevel = run.status !== "idle" ? (run.meta?.yearLevel ?? null) : null;
  const runYearLevelRef = useRef(runYearLevel);
  runYearLevelRef.current = runYearLevel;
  const [restoredDraftKey, setRestoredDraftKey] = useState<string | null>(null);

  useEffect(() => {
    const years = availableYearsKey === "" ? [] : availableYearsKey.split(",").map(Number);
    if (years.length === 0) return;
    const pendingYear = years.find((year) => yearStatesRef.current[year]?.kind === "unscheduled");
    const initialYear =
      runYearLevelRef.current !== null && years.includes(runYearLevelRef.current)
        ? runYearLevelRef.current
        : (pendingYear ?? years[0]);
    const savedDefaults = readSavedCourseDefaults(defaultsStorageKey);
    const keepCourseChoices = runYearLevelRef.current !== null;
    let restored = false;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          step?: Step;
          yearLevel?: number;
          activeSectionId?: string;
          targetSectionIds?: string[] | null;
          configs?: Record<string, SectionConfig>;
          setupDraft?: Partial<SetupDraft>;
        };
        if (
          parsed.yearLevel &&
          years.includes(Number(parsed.yearLevel)) &&
          (runYearLevelRef.current === null || Number(parsed.yearLevel) === runYearLevelRef.current)
        ) {
          setYearLevel(Number(parsed.yearLevel));
          setStep(
            parsed.step && parsed.step >= 1 && parsed.step <= lastStep
              ? parsed.step
              : 1,
          );
          setActiveSectionId(parsed.activeSectionId ?? "");
          setTargetSectionIds(
            Array.isArray(parsed.targetSectionIds)
              ? stringList(parsed.targetSectionIds)
              : null,
          );
          setConfigs(keepCourseChoices ? (parsed.configs ?? {}) : {});
          setSetupDraft({
            ...defaultSetupDraft,
            ...parsed.setupDraft,
            preferredDays: orderDays(
              Array.isArray(parsed.setupDraft?.preferredDays)
                ? parsed.setupDraft.preferredDays
                : [],
            ),
            courseDefaults: savedDefaults,
            excludedCourseIds: keepCourseChoices
              ? stringList(parsed.setupDraft?.excludedCourseIds)
              : [],
            customizedCourseIds: keepCourseChoices
              ? stringList(parsed.setupDraft?.customizedCourseIds)
              : [],
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
      setTargetSectionIds(null);
      setConfigs({});
      setSetupDraft({ ...defaultSetupDraft, courseDefaults: savedDefaults });
    }
    setRestoredDraftKey(storageKey);
  }, [availableYearsKey, defaultsStorageKey, storageKey]);

  useEffect(() => {
    if (runYearLevel !== null && availableYears.includes(runYearLevel)) {
      setYearLevel((current) => (current === runYearLevel ? current : runYearLevel));
    }
  }, [availableYears, runYearLevel]);

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
          courseIds: scopedCourses.map((course) => course.id),
          locked: existing?.locked ?? false,
          splitCourseIds:
            existing?.splitCourseIds?.filter((id) =>
              scopedCourses.some((course) => course.id === id),
            ) ?? [],
          gecSplitCourseIds:
            existing?.gecSplitCourseIds?.filter((id) =>
              scopedCourses.some((course) => course.id === id),
            ) ?? [],
          hybridSplitCourseIds:
            existing?.hybridSplitCourseIds?.filter((id) =>
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
          durationMinutesByCourseId: Object.fromEntries(
            Object.entries(existing?.durationMinutesByCourseId ?? {}).filter(([id]) =>
              scopedCourses.some((course) => course.id === id),
            ),
          ),
          preferredRoomsByCourseId: Object.fromEntries(
            Object.entries(existing?.preferredRoomsByCourseId ?? {}).filter(([id]) =>
              scopedCourses.some((course) => course.id === id),
            ),
          ),
          componentMinutesByCourseId: Object.fromEntries(
            Object.entries(existing?.componentMinutesByCourseId ?? {}).filter(([id]) =>
              scopedCourses.some((course) => course.id === id),
            ),
          ),
        };
      }
      return next;
    });
  }, [scopedCourses, scopedSections]);

  useEffect(() => {
    if (!settings) return;

    const splitSettings = balancedSplitSettingsOf(settings);
    setConfigs((current) => Object.fromEntries(Object.entries(current).map(([sectionId, config]) => [
      sectionId,
      {
        ...config,
        gecSplitCourseIds: config.gecSplitCourseIds.filter((courseId) =>
          isBalancedSplitSchedulingEligible(scopedCourses.find((item) => item.id === courseId), splitSettings),
        ),
      },
    ])));
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
                  isHybridSchedulingEligible(course, true, fieldCodes),
              );
            }),
          },
        ]),
      ),
    );
  }, [forcedDaysByCourseId, scopedCourses, settings]);

  const settingsSectionId = scopedSections[0]?.id ?? "";
  const settingsCacheKey = settingsSectionId
    ? schedulingSettingsCacheKey(settingsSectionId)
    : null;

  const settingsToastRef = useRef(toast);
  settingsToastRef.current = toast;

  useEffect(() => {
    if (settingsCacheKey === null || !settingsSectionId) return;

    let cancelled = false;
    const cached = getCachedData<SettingsResponse>(settingsCacheKey);
    if (cached) setSettings(withoutCourseRules(cached));
    setLoadingSettings(!hasCachedData(settingsCacheKey));

    loadCachedData<SettingsResponse>(settingsCacheKey, async () => {
      const response = await api.get<SettingsResponse>("/scheduling-settings", {
        params: { section_id: settingsSectionId },
      });

      return response.data;
    })
      .then((data) => {
        if (!cancelled) setSettings(withoutCourseRules(data));
      })
      .catch(() => {
        if (!cancelled && !cached) {
          settingsToastRef.current.error("Error", "Failed to load scheduling rules.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSettings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [settingsCacheKey, settingsSectionId]);

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
    if (restoredDraftKey !== storageKey) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ step, yearLevel, activeSectionId, targetSectionIds, configs, setupDraft }),
    );
  }, [activeSectionId, configs, restoredDraftKey, setupDraft, step, storageKey, targetSectionIds, yearLevel]);

  useEffect(() => {
    if (!yearLevelGenerationAllowed && step !== 1) {
      setStep(1);
    }
  }, [step, yearLevelGenerationAllowed]);

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

  const saveRequiredDay = (courseId: string, day: string | null) => {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        forced_day_rules: [
          ...(current.forced_day_rules ?? []).filter(
            (rule) => String(rule.course_id) !== courseId,
          ),
          ...(day ? [{ course_id: Number(courseId), day }] : []),
        ],
      };
    });
  };

  const saveConsecutiveDays = (
    courseId: string,
    courseRules: ConsecutiveDayRule[],
    requiredDay: string | null,
  ) => {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        consecutive_day_rules: [
          ...(current.consecutive_day_rules ?? []).filter(
            (rule) => String(rule.course_id) !== courseId,
          ),
          ...courseRules,
        ],
        forced_day_rules: [
          ...(current.forced_day_rules ?? []).filter(
            (rule) => String(rule.course_id) !== courseId,
          ),
          ...(requiredDay ? [{ course_id: Number(courseId), day: requiredDay }] : []),
        ],
      };
    });
  };

  const saveFieldCourse = (courseCode: string, isField: boolean) => {
    const normalize = (code: string) => code.trim().replace(/\s+/g, " ").toUpperCase();
    setSettings((current) => {
      if (!current) return current;
      const codes = current.field_course_codes ?? [];
      return {
        ...current,
        field_course_codes: isField
          ? Array.from(new Set([...codes, courseCode]))
          : codes.filter((code) => normalize(code) !== normalize(courseCode)),
      };
    });
  };

  useEffect(() => {
    configureLabRoomType(settings?.lab_room_type);
  }, [settings]);

  const saveLabRoomType = async (labRoomType: LabRoomType) => {
    if (!settingsSectionId || !settings || (settings.lab_room_type ?? "laboratory") === labRoomType) return;
    try {
      const response = await api.patch<SettingsResponse>(
        "/scheduling-settings",
        { lab_room_type: labRoomType },
        { params: { section_id: settingsSectionId } },
      );
      setSettings(keepRunRules(settings, { ...settings, ...response.data, lab_room_type: labRoomType }));
      setCachedData(schedulingSettingsCacheKey(settingsSectionId), {
        ...response.data,
        lab_room_type: labRoomType,
      });
      run.clear();
    } catch (error) {
      toast.error(
        "Save failed",
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? "Unable to update the LAB room requirement.",
      );
    }
  };

  const saveSundayClasses = async (enabled: boolean) => {
    if (!settingsSectionId || !settings) return;
    try {
      const response = await api.patch<SettingsResponse>(
        "/scheduling-settings",
        { sunday_classes_enabled: enabled },
        { params: { section_id: settingsSectionId } },
      );
      setSettings(
        keepRunRules(settings, { ...settings, ...response.data, sunday_classes_enabled: enabled }),
      );
      setCachedData(schedulingSettingsCacheKey(settingsSectionId), {
        ...response.data,
        sunday_classes_enabled: enabled,
      });
      if (!enabled && setupDraft.preferredDays.includes("Sunday")) {
        setSetupDraft((draft) => ({
          ...draft,
          preferredDays: draft.preferredDays.filter((day) => day !== "Sunday"),
        }));
      }
      run.clear();
    } catch (error) {
      toast.error(
        "Save failed",
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? "Unable to update Sunday classes.",
      );
    }
  };

  const generate = async (
    configsOverride?: Record<string, SectionConfig>,
    draftOverride?: SetupDraft,
    selectedAdjustments?: GenerationAdjustment[],
  ) => {
    if (!activeSemester || departmentId === null) return;
    if (!yearLevelGenerationAllowed) return;
    const activeConfigs = configsOverride ?? configs;
    const activeDraft = draftOverride ?? setupDraft;
    const configuredFieldCourseIds = includedCourses
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
          isHybridSchedulingEligible(course, true, new Set(settings?.field_course_codes ?? [])),
        )
        .map((course) => course.id),
    );
    try {
      const payload = {
        semester_id: Number(activeSemester.id),
        department_id: departmentId,
        year_level: yearLevel,
        ...(selectedAdjustments?.length ? { selected_adjustments: selectedAdjustments } : {}),
        ...(targetSectionIds !== null
          ? { section_ids: targetSections.map((section) => Number(section.id)) }
          : {}),
        section_configs: targetSections.map((section) => {
          const config = activeConfigs[section.id];
          return {
            section_id: Number(section.id),
            curriculum_id: section.curriculumId ?? null,
            course_ids: Array.from(
              new Set([
                ...config.courseIds
                  .filter((courseId) => !excludedCourseIdSet.has(courseId))
                  .map(Number),
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
            hybrid_split_course_ids: (config.hybridSplitCourseIds ?? [])
              .filter((courseId) =>
                !forcedDaysByCourseId.has(Number(courseId)) &&
                config.gecSplitCourseIds.includes(courseId),
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
                .filter(
                  ([id, mode]) =>
                    mode !== "automatic" && !excludedCourseIdSet.has(id),
                )
                .map(([id, mode]) => [Number(id), mode]),
            ),
            duration_minutes_by_course_id: Object.fromEntries(
              Object.entries(config.durationMinutesByCourseId ?? {}).map(
                ([id, minutes]) => [Number(id), minutes],
              ),
            ),
            component_minutes_by_course_id: Object.fromEntries(
              Object.entries(config.componentMinutesByCourseId ?? {}).map(
                ([id, minutes]) => [Number(id), minutes],
              ),
            ),
            preferred_rooms_by_course_id: Object.fromEntries(
              Object.entries(config.preferredRoomsByCourseId ?? {}).map(
                ([id, roomId]) => [Number(id), Number(roomId)],
              ),
            ),
            allowed_days:
              activeDraft.preferredDays.length > 0
                ? activeDraft.preferredDays
                : null,
            allow_friday_saturday_split:
              activeDraft.courseDefaults.allowFridaySaturdaySplit,
          };
        }),
        ...(settings
          ? {
              rule_overrides: {
                forced_day_rules: settings.forced_day_rules ?? [],
                consecutive_day_rules: settings.consecutive_day_rules ?? [],
                field_course_codes: settings.field_course_codes ?? [],
              },
            }
          : {}),
      };
      await run.start(payload, {
        yearLevel,
        sectionCount: targetSections.length,
      });
    } catch (error: unknown) {
      toast.error(
        "Generation Unsuccessful",
        error instanceof Error
          ? error.message
          : "The generation request could not be prepared.",
      );
    }
  };

  const generateFromReview = async () => {
    if (targetState.kind === "scheduled") {
      const confirmed = await confirm({
        title:
          targetSectionIds === null
            ? "Year Level Already Scheduled"
            : "Sections Already Scheduled",
        message: `${targetSectionIds === null ? yearLabel(yearLevel, scopedSections) : "The selected sections"} already ${targetSectionIds === null ? "has" : "have"} classes in ${targetState.scheduledSectionCount} of ${targetState.sectionCount} section${targetState.sectionCount === 1 ? "" : "s"}. Generating again is only a preview, but saving the result replaces those draft classes.`,
        eyebrow: "Regenerate Schedule",
        confirmLabel: "Generate Again",
        variant: "maroon",
      });
      if (!confirmed) return;
    }
    await generate();
  };

  const saveCourseDefaults = (courseDefaults: CourseDefaults) => {
    try {
      window.localStorage.setItem(defaultsStorageKey, JSON.stringify(courseDefaults));
    } catch {
    }
  };

  const applyRecommendationAndRetry = async (
    recommendation: GenerationRecommendation,
  ) => {
    const runConfigs: Record<string, SectionConfig> = Object.fromEntries(
      targetSections.map((section) => [section.id, configs[section.id]]),
    );
    let sectionChanges: ReturnType<typeof applyAdjustments<SectionConfig>>;
    try {
      sectionChanges = applyAdjustments(runConfigs, recommendation.adjustments);
    } catch (error: unknown) {
      toast.error("Cannot Apply", error instanceof Error ? error.message : "Review the selected adjustments.");
      return;
    }
    const { configs: previewedConfigs, applied: appliedToSections } = sectionChanges;
    const nextConfigs = { ...configs, ...previewedConfigs };
    const { settings: yearLevelSettings, applied: appliedToYearLevel } =
      applyYearLevelAdjustments(
        {
          preferredDays: setupDraft.preferredDays,
          allowFridaySaturdaySplit: setupDraft.courseDefaults.allowFridaySaturdaySplit,
        },
        recommendation.adjustments,
      );
    const applied = [...appliedToSections, ...appliedToYearLevel];
    if (applied.length === 0) {
      toast.error(
        "Nothing to Apply",
        "That adjustment no longer changes the current configuration. Review the constraints instead.",
      );
      return;
    }

    setConfigs(nextConfigs);
    const nextDraft: SetupDraft = {
      ...setupDraft,
      preferredDays: yearLevelSettings.preferredDays,
      courseDefaults: {
        ...setupDraft.courseDefaults,
        allowFridaySaturdaySplit: yearLevelSettings.allowFridaySaturdaySplit,
      },
    };
    if (appliedToYearLevel.length > 0) {
      setSetupDraft(nextDraft);
      if (nextDraft.courseDefaults !== setupDraft.courseDefaults) {
        saveCourseDefaults(nextDraft.courseDefaults);
      }
    }
    toast.success(
      recommendation.id === APPLY_ALL_RECOMMENDATION_ID
        ? `Applied ${recommendation.title}`
        : `Applied to ${recommendationTarget(recommendation)}`,
      applied.map((adjustment) => describeAdjustment(adjustment)).join(" | "),
    );
    setStepDirection("forward");
    setStep(3);
    // Send the original configuration and explicit operations; the server owns application.
    void generate(configs, setupDraft, recommendation.adjustments);
  };

  const reviewConstraints = (sectionId: number | null) => {
    if (
      sectionId !== null &&
      scopedSections.some((section) => String(section.id) === String(sectionId))
    ) {
      setActiveSectionId(String(sectionId));
    }
    if (run.isActive) void run.cancel();
    else run.clear();
    goToStep(2);
  };

  const draftReviewRequest = (rows: ApiScheduleRecord[]) => ({
    semesterId: Number(activeSemester?.id),
    departmentId: Number(departmentId),
    sectionIds: targetSections.map((section) => Number(section.id)),
    rows,
    unplaced: unplacedCourses,
    preferredDays:
      setupDraft.preferredDays.length > 0 ? setupDraft.preferredDays : null,
  });
  const reviewDraftRows = async (
    rows: ApiScheduleRecord[],
  ): Promise<DraftIssue[] | null> => {
    try {
      const issues = await fetchDraftReview(draftReviewRequest(rows));
      setReview({ rows, issues, error: null });
      return issues;
    } catch (error: unknown) {
      setReview({ rows, issues: null, error: draftReviewErrorMessage(error) });
      return null;
    }
  };

  const firstReviewDue =
    step === 4 &&
    needsReview &&
    draft?.result !== run.result &&
    review?.rows !== preview &&
    activeSemester !== null &&
    departmentId !== null;
  useEffect(() => {
    if (!firstReviewDue) return;
    let current = true;
    const rows = preview;
    fetchDraftReview(draftReviewRequest(rows)).then(
      (issues) => {
        if (current) setReview({ rows, issues, error: null });
      },
      (error: unknown) => {
        if (current) setReview({ rows, issues: null, error: draftReviewErrorMessage(error) });
      },
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstReviewDue, preview]);

  const applyDraftFixes = async (options: DraftOption[]) => {
    if (!run.result || options.length === 0) return;
    const rows = applyDraftOptions(preview, options);
    setDraft({ result: run.result, rows });
    setReviewing(true);
    const issues = await reviewDraftRows(rows);
    setReviewing(false);
    if (issues === null) return;

    const applied = `Applied ${options.length} fix${options.length === 1 ? "" : "es"}.`;
    if (issues.length === 0) {
      toast.success("Conflicts Resolved", `${applied} Every course is placed and no conflicts remain.`);
    } else {
      toast.info(
        "Timetable Checked",
        `${applied} ${issues.length} course${issues.length === 1 ? " still needs" : "s still need"} attention.`,
      );
    }
  };

  const remainingUnplaced = stillUnplaced(unplacedCourses, preview);
  const conflictCount = (draftIssues ?? []).filter((issue) => issue.kind === "conflict").length;
  const saveBlockedReason = !needsReview
    ? null
    : draftIssues === null
      ? currentReview?.error
        ? "The timetable could not be checked. Check again before saving."
        : "Checking the timetable..."
      : conflictCount > 0
        ? `Resolve ${conflictCount} conflicting course${conflictCount === 1 ? "" : "s"} before saving.`
        : null;

  const apply = async () => {
    if (remainingUnplaced.length > 0) {
      const count = remainingUnplaced.length;
      const confirmed = await confirm({
        title: `Save Without ${count} Course${count === 1 ? "" : "s"}`,
        message: `${count} course${count === 1 ? " is" : "s are"} not placed (${remainingUnplaced
          .slice(0, 4)
          .map((course) => `${course.section_name} ${course.course_code}`)
          .join(", ")}${count > 4 ? ", ..." : ""}). ${count === 1 ? "It stays" : "They stay"} unscheduled, and any classes ${count === 1 ? "it" : "they"} already had in these sections are replaced. Place ${count === 1 ? "it" : "them"} later in the Schedule Builder.`,
        eyebrow: "Incomplete Timetable",
        confirmLabel: "Save Anyway",
        variant: "maroon",
      });
      if (!confirmed) return;
    }

    const generatedKeys = new Set(
      preview.map((r) => `${r.section_id}:${r.course_id ?? r.subject_id}`),
    );
    const recalledSectionIds = new Set(
      existingSchedules
        .filter(
          (schedule) =>
            schedule.status === "revision" &&
            generatedKeys.has(`${schedule.sectionId}:${schedule.courseId || schedule.subjectId}`) &&
            (!activeSemester || Number(schedule.semesterId) === Number(activeSemester.id)),
        )
        .map((schedule) => String(schedule.sectionId)),
    );
    const replacedCourseKeys = new Set([
      ...generatedKeys,
      ...remainingUnplaced.map((course) => `${course.section_id}:${course.course_id}`),
    ]);
    const instructorClassCount = new Set(
      existingSchedules
        .filter(
          (schedule) =>
            Boolean(schedule.facultyId) &&
            ["draft", "completed", "revision"].includes(schedule.status) &&
            replacedCourseKeys.has(`${schedule.sectionId}:${schedule.courseId || schedule.subjectId}`) &&
            (!activeSemester || Number(schedule.semesterId) === Number(activeSemester.id)),
        )
        .map((schedule) => `${schedule.sectionId}:${schedule.courseId || schedule.subjectId}`),
    ).size;
    if (recalledSectionIds.size > 0 || instructorClassCount > 0) {
      const count = recalledSectionIds.size;
      const confirmed = await confirm({
        title: count > 0 ? "Replace Recalled Schedules" : "Replace Schedules",
        message: (count > 0
          ? `${count} section${count === 1 ? " was" : "s were"} recalled. Saving updates the working schedule, while the submitted version stays in history.`
          : "Saving updates the working schedule.")
          + (instructorClassCount > 0
            ? ` ${instructorClassCount} class${instructorClassCount === 1 ? " has an instructor" : "es have instructors"} assigned; the assignment${instructorClassCount === 1 ? "" : "s"} will be removed, including cross-department assignments, and the affected department will be notified.`
            : ""),
        eyebrow: "Replace Working Copy",
        confirmLabel: "Replace Schedules",
        variant: "danger",
      });
      if (!confirmed) return;
    }

    setApplying(true);
    onSavingChange?.(true);
    onClose();
    try {
      const replaceableStatuses = new Set(["draft", "completed", "revision"]);
      const coveredSectionIds = new Set([
        ...preview.map((r) => String(r.section_id)),
        ...remainingUnplaced.map((course) => String(course.section_id)),
      ]);
      const sectionIds = new Set(
        targetSections
          .map((section) => String(section.id))
          .filter((id) => coveredSectionIds.has(id)),
      );
      const generatedCourseKeys = new Set([
        ...preview.map((r) => `${r.section_id}:${r.course_id ?? r.subject_id}`),
        ...remainingUnplaced.map((course) => `${course.section_id}:${course.course_id}`),
      ]);
      const deleteIds = existingSchedules
        .filter(
          (schedule) =>
            sectionIds.has(String(schedule.sectionId)) &&
            generatedCourseKeys.has(`${schedule.sectionId}:${schedule.courseId || schedule.subjectId}`) &&
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
      const response = await api.post<{ schedules?: ApiScheduleRecord[]; instructors_released?: number }>(
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
      const releasedInstructors = Number(response.data.instructors_released ?? 0);
      toast.success(
        "Generation Complete",
        "The timetable was saved as draft schedules."
          + (releasedInstructors > 0
            ? ` ${releasedInstructors} instructor assignment${releasedInstructors === 1 ? " was" : "s were"} released.`
            : ""),
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
      onSavingChange?.(false);
    }
  };

  const canContinue =
    targetSections.length > 0 &&
    scopedCourses.length > 0 &&
    (step !== 2 || includedCourses.length > 0) &&
    (step !== 1 || curriculumReady) &&
    (step !== 1 || yearLevelGenerationAllowed);

  const roomCodeByOptionId = new Map(
    (settings?.preferred_room_options ?? []).map((room) => [String(room.id), room.room_code]),
  );
  const reviewCourseRows = includedCourses.map((course) => {
    const customMinutes = targetSections
      .map((section) => configs[section.id]?.durationMinutesByCourseId?.[course.id])
      .find((minutes): minutes is number => typeof minutes === "number");
    const preferredRoomId = targetSections
      .map((section) => configs[section.id]?.preferredRoomsByCourseId?.[course.id])
      .find(Boolean);
    const components = targetSections
      .map((section) => configs[section.id]?.componentMinutesByCourseId?.[course.id])
      .find(Boolean);
    const integratedOnSite = targetSections.some(
      (section) => configs[section.id]?.modesByCourseId?.[course.id] === "on-site",
    );
    const oneMeeting = forcedDaysByCourseId.has(Number(course.id));

    return {
      course,
      hybrid:
        !oneMeeting &&
        targetSections.length > 0 &&
        targetSections.every((section) =>
          (configs[section.id]?.splitCourseIds ?? []).includes(course.id),
        ),
      integratedOnSite,
      split:
        !oneMeeting &&
        targetSections.length > 0 &&
        targetSections.every((section) =>
          (configs[section.id]?.gecSplitCourseIds ?? []).includes(course.id),
        ),
      customDuration: components
        ? `Lecture ${formatHours(components.lecture / 60)} ${integratedOnSite ? "F2F" : "Online"} · Lab ${formatHours(components.laboratory / 60)} F2F`
        : customMinutes
          ? `${formatHours(customMinutes / 60)} / week`
          : null,
      preferredRoom: preferredRoomId ? roomCodeByOptionId.get(preferredRoomId) ?? null : null,
    };
  });

  const targetBlockedReason =
    targetSections.length === 0
      ? "Pick at least one section to generate."
      : !yearLevelGenerationAllowed
        ? targetSectionIds === null
          ? `${YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE} To add a new section, choose Selected sections.`
          : SECTIONS_GENERATION_BLOCKED_MESSAGE
        : null;
  const generationBlockedReason = targetBlockedReason
    ? targetBlockedReason
    : !curriculumReady
      ? "Assign a curriculum to every section of this year level before generating."
      : scopedCourses.length === 0
        ? "This curriculum has no courses for the selected year level and semester."
        : includedCourses.length === 0
          ? "Every course is unchecked in Setup Courses. Include at least one course to generate."
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
            {formatSemester(activeSemester)} &middot; {yearLabel(yearLevel, scopedSections)} &middot;{" "}
            {targetSections.length} section
            {targetSections.length === 1 ? "" : "s"}
          </p>
        </div>
        {step === 2 && (
          <button
            type="button"
            onClick={() => setDefaultsOpen(true)}
            aria-label="Default Settings"
            title="Default Settings"
            className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        <HelpButton
          title={wizardSteps[step - 1].title}
          text={helpText[step]}
          tone="onMaroon"
        />
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          aria-label="Open the Generation Guide"
          title="Generation Guide: what each setting means"
          className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <BookOpen className="h-4 w-4" />
        </button>
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
              onApplyAndRetry={(recommendation) => void applyRecommendationAndRetry(recommendation)}
              onReviewConstraints={reviewConstraints}
              onCancel={() => (run.isActive ? void run.cancel() : run.clear())}
              onRetry={() => {
                setStepDirection("forward");
                setStep(3);
                void generate();
              }}
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
                    setTargetSectionIds(null);
                    run.clear();
                  }}
                  targetSectionIds={targetSectionIds}
                  scheduledSectionIds={scheduledSectionIds}
                  onTargetSectionIdsChange={(ids) => {
                    setTargetSectionIds(ids);
                    run.clear();
                  }}
                  targetBlockedReason={targetBlockedReason}
                  departmentId={departmentId ?? null}
                  sections={scopedSections}
                  allSections={availableSections}
                  courses={scopedCourses}
                  onCurriculumApplied={handleCurriculumApplied}
                  yearStates={yearStates}
                  yearChangeDisabled={generating}
                  actionsDisabled={!yearLevelGenerationAllowed || generating}
                  preferredDays={setupDraft.preferredDays}
                  onPreferredDaysChange={(preferredDays) => {
                    setSetupDraft((draft) => ({ ...draft, preferredDays }));
                    run.clear();
                  }}
                  requiredDayRules={settings?.forced_day_rules ?? []}
                  sundayClassesEnabled={settings ? Boolean(settings.sunday_classes_enabled) : null}
                  canManageSundayClasses={Boolean(settings?.can_manage_sunday_classes)}
                  sundayClassCount={settings?.sunday_class_count ?? 0}
                  onSundayClassesChange={saveSundayClasses}
                />
              )}

              {step === 2 && (
                <SetupCoursesStep
                  courses={scopedCourses}
                  sections={targetSections}
                  configs={configs}
                  onConfigChange={updateConfig}
                  settings={settings}
                  preferredDays={setupDraft.preferredDays}
                  onRequiredDayChange={saveRequiredDay}
                  onConsecutiveDaysChange={saveConsecutiveDays}
                  onFieldCourseChange={saveFieldCourse}
                  defaults={setupDraft.courseDefaults}
                  onDefaultsChange={(courseDefaults) => {
                    setSetupDraft((current) => ({ ...current, courseDefaults }));
                    saveCourseDefaults(courseDefaults);
                  }}
                  labRoomType={normalizeLabRoomType(settings?.lab_room_type)}
                  onLabRoomTypeChange={saveLabRoomType}
                  excludedCourseIds={setupDraft.excludedCourseIds}
                  onExcludedChange={(excludedCourseIds) =>
                    setSetupDraft((current) => ({ ...current, excludedCourseIds }))
                  }
                  customizedCourseIds={setupDraft.customizedCourseIds}
                  onCustomizedChange={(customizedCourseIds) =>
                    setSetupDraft((current) => ({ ...current, customizedCourseIds }))
                  }
                  defaultsOpen={defaultsOpen}
                  laboratoryEnabled={laboratoryEnabled}
                  onDefaultsClose={() => setDefaultsOpen(false)}
                  actionsDisabled={generating || loadingSettings}
                />
              )}

              {step === 3 && (
                <ReviewGenerateStep
                  activeSemester={activeSemester}
                  yearLevel={yearLevel}
                  curriculumName={
                    scopedSections[0]?.curriculumName ?? null
                  }
                  sections={targetSections}
                  courseRows={reviewCourseRows}
                  preferredDays={setupDraft.preferredDays}
                  forcedDayRules={settings?.forced_day_rules ?? []}
                  consecutiveDayRules={settings?.consecutive_day_rules ?? []}
                  fieldCourseCodes={settings?.field_course_codes ?? []}
                  activeRules={activeRules}
                  generating={generating}
                  blockedReason={generationBlockedReason}
                  yearState={targetState}
                />
              )}

              {step === 4 && (
                <ScheduleSummaryStep
                  preview={preview}
                  sections={targetSections}
                  courses={scopedCourses}
                  roomCodeById={roomCodeById}
                  changes={generationChanges}
                  recommendations={generationRecommendations}
                  onApplyRecommendation={applyRecommendationAndRetry}
                  applying={generating || applying}
                  unplacedCount={needsReview ? remainingUnplaced.length : 0}
                  attentionKeys={
                    new Set((draftIssues ?? []).map((issue) => issue.key))
                  }
                  attention={
                    needsReview ? (
                      <DraftIssuesPanel
                        issues={draftIssues}
                        reviewing={reviewing}
                        message={run.result?.message ?? null}
                        error={currentReview?.error ?? null}
                        onApply={(options) => void applyDraftFixes(options)}
                        onRetry={() => {
                          setReviewing(true);
                          void reviewDraftRows(preview).finally(() => setReviewing(false));
                        }}
                      />
                    ) : null
                  }
                />
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
        <p
          className={`min-w-0 flex-1 truncate text-xs font-semibold ${
            !generating &&
            ((step === 3 && generationBlockedReason) || (step === 4 && saveBlockedReason))
              ? "text-rose-700"
              : "text-slate-500"
          }`}
        >
          {generating
            ? "Cancel stops this run: the worker halts at its next checkpoint and returns you to the summary. Nothing is saved."
            : step === 3 && generationBlockedReason
              ? generationBlockedReason
              : step === 4 && saveBlockedReason
                ? saveBlockedReason
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
              onClick={() => void generateFromReview()}
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
                disabled={applying || generating || preview.length === 0 || saveBlockedReason !== null}
                title={saveBlockedReason ?? undefined}
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

      {guideOpen && (
        <GenerationGuide
          initialChapterId={GUIDE_CHAPTER_FOR_STEP[step]}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </div>
  );
}

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
    skipIfMissing: true,
    waitTimeoutMs: 2500,
    taskHint: "Click Apply to year level to continue.",
    title: "Apply it to every section",
    description:
      "This writes the curriculum onto each section in scope. The button only appears when there is something to apply.",
    side: "bottom",
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
    element: "#generator-setup-head",
    waitFor: "#generator-setup-head",
    title: "Tune each course",
    description:
      "One row per course. Hybrid switches delivery between face-to-face and online, Split lets the course meet twice, and Configure sets its duration, Required Day and Preferred Room.",
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
  1: "Pick the year level and curriculum, then choose the Preferred Days.",
  2: "Set each course's split and hybrid delivery. Use Configure for its duration, Required Day and Preferred Room.",
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
