import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FlaskConical,
  HelpCircle,
  Layers,
  LayoutGrid,
  List,
  MapPin,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Split,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import api from "../../../../lib/api";
import { academicYearLabel, semesterLabel } from "../../../../lib/termLabel";
import { useToast } from "../../../../context/ToastContext";
import ConfirmModal from "../../../../components/ui/ConfirmModal";
import type { ApiRoomRecord, ApiScheduleRecord, Course, ScheduleItem, Section, Term } from "../types";
import { DAYS, GRID_HEADER_HEIGHT_PX, slotToTimeStr } from "../constants";
import SetupCourseSelector, { CourseIdentity, type SetupCourseOption } from "./SetupCourseSelector";
import RecommendedAdjustmentPanel, { AppliedAdjustmentNotice } from "./RecommendedAdjustmentPanel";
import {
  applyAdjustments,
  describeAdjustment,
  parseYearLevelFailure,
  type AppliedStrategy,
  type GenerationAdjustment,
  type GenerationRecommendation,
  type YearLevelGenerationFailure,
} from "./yearLevelGenerationFailure";
import type { DeliveryModeOption, TimeBlockOption } from "./generationTypes";
import WeeklyTimetableGrid from "../../../../components/scheduling/WeeklyTimetableGrid";

type Step = 1 | 2 | 3 | 4 | 5;
type CourseMode = DeliveryModeOption | "automatic";
type SchedulingPreference = "automatic" | "morning" | "afternoon" | "flexible";
type FixedGecSplitPattern = "MW" | "TTh";
// "auto" keeps the course split into two meetings but lets the generator pick
// the day pair — the relaxation the Recommended Adjustment panel applies.
type GecSplitPattern = FixedGecSplitPattern | "auto";
type SetupStage = "forced-day" | "field-courses" | "split-sessions";

type SetupDraft = {
  activeStage: SetupStage;
  completed: boolean;
  allowedSplitCourseIds: string[];
};

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
};

type ConstraintCourse = { id: number; code: string; name: string };
type ForcedDayRule = { course_id: number; day: string };
type ApiViolation = { rule?: string; message?: string; course_code?: string; day?: string };
type GenerationResult = {
  schedules?: ApiScheduleRecord[];
  applied_strategy?: AppliedStrategy | null;
  applied_adjustments?: GenerationAdjustment[];
};
type GenerationRun = {
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | string;
  result?: GenerationResult | Record<string, unknown> | null;
  error_message?: string | null;
};

async function pollGenerationRun(
  runId: string,
  requestId: number,
  requestIdRef: { current: number },
): Promise<GenerationResult> {
  const deadline = Date.now() + 190_000;

  while (Date.now() < deadline) {
    if (requestIdRef.current !== requestId) {
      const error = new Error("Generation was superseded by a newer request.");
      error.name = "AbortError";
      throw error;
    }

    const response = await api.get<GenerationRun>(`/schedule-recommendations/generation-runs/${runId}`);
    const run = response.data;

    if (run.status === "completed" && run.result && typeof run.result === "object") {
      return run.result as GenerationResult;
    }

    if (run.status === "failed" || run.status === "cancelled") {
      const error = new Error(run.error_message ?? "Year-level generation failed.");
      Object.assign(error, { response: { data: run.result ?? { message: error.message } } });
      throw error;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error("Year-level generation is still running. Check the generation status before retrying.");
}

interface Props {
  onClose: () => void;
  sections: Section[];
  courses: Course[];
  activeTerm: Term | null;
  departmentId: number | null;
  departmentLogoUrl?: string | null;
  existingSchedules: ScheduleItem[];
  onAccepted: (schedules?: ApiScheduleRecord[]) => void | Promise<void>;
}

const stepNames = ["Choose Year", "Schedule Setup", "Section Schedule", "Review", "Generate Schedule"];
const stepDescriptions = [
  "Choose the year level to generate",
  "Set special requirements",
  "Set hybrid and split-session schedules",
  "Check your selections and schedule settings",
  "Create the final timetable",
];
const storageVersion = "v4";
const defaultSetupDraft: SetupDraft = {
  activeStage: "forced-day",
  completed: false,
  allowedSplitCourseIds: [],
};
const isMinorCourse = (course: Course) => course.category === "minor";
const formatTerm = (term: Term | null) => term ? `${term.academic_year} - ${term.semester.toUpperCase()} Semester` : "No active term selected";
const yearLabel = (yearLevel: number) => {
  const ordinal = yearLevel === 1 ? "1st" : yearLevel === 2 ? "2nd" : yearLevel === 3 ? "3rd" : "4th";
  return `BSIT ${ordinal} year`;
};
const courseHours = (course: Course) => Number(course.lectureHours ?? 0) + Number(course.labHours ?? 0) || Number(course.units ?? 3);
const preferenceLabels: Record<SchedulingPreference, string> = {
  automatic: "Automatic",
  morning: "Morning preferred",
  afternoon: "Afternoon preferred",
  flexible: "Flexible",
};
const configurablePreferenceOptions = Object.entries(preferenceLabels).filter(
  ([value]) => value !== "automatic"
) as Array<[SchedulingPreference, string]>;
const displayPreferenceValue = (value: SchedulingPreference): SchedulingPreference => value === "automatic" ? "flexible" : value;
const normalizeGecPattern = (value: string | undefined): GecSplitPattern => value === "TTh" || value === "auto" ? value : "MW";
// "auto" is not tied to a day pair, so the MW/TTh capacity notices do not apply.
const fixedGecPattern = (value: GecSplitPattern | undefined): FixedGecSplitPattern | null => value === "MW" || value === "TTh" ? value : null;

export default function YearLevelGenerateScheduleWorkflow({ onClose, sections, courses, activeTerm, departmentId, departmentLogoUrl, existingSchedules, onAccepted }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [yearLevel, setYearLevel] = useState<number>(1);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [configs, setConfigs] = useState<Record<string, SectionConfig>>({});
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(defaultSetupDraft);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ApiScheduleRecord[]>([]);
  const [failure, setFailure] = useState<YearLevelGenerationFailure | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<{ strategy: AppliedStrategy; adjustments: GenerationAdjustment[] } | null>(null);
  const [rooms, setRooms] = useState<ApiRoomRecord[]>([]);
  const [confirmedRegenerationYear, setConfirmedRegenerationYear] = useState<number | null>(null);
  const generationRequestIdRef = useRef(0);

  const storageKey = useMemo(() => `wicars.year-level-wizard.${storageVersion}.${departmentId ?? "none"}.${activeTerm?.id ?? "none"}`, [activeTerm?.id, departmentId]);
  const departmentSections = useMemo(() => sections.filter((section) => departmentId !== null && Number(section.departmentId) === Number(departmentId)), [departmentId, sections]);
  const availableSections = useMemo(() => departmentSections.filter((section) => section.status === "active" && (!activeTerm || Number(section.termId) === Number(activeTerm.id))), [activeTerm, departmentSections]);
  const availableYears = useMemo(() => [...new Set(availableSections.map((section) => Number(section.yearLevel)))].sort(), [availableSections]);
  const scopedSections = useMemo(() => availableSections.filter((section) => Number(section.yearLevel) === yearLevel), [availableSections, yearLevel]);
  const scopedCourses = useMemo(() => courses.filter((course) => Number(course.yearLevel) === yearLevel && (!activeTerm || course.semester === activeTerm.semester) && course.status === "active" && (course.departmentId === null || departmentId === null || Number(course.departmentId) === Number(departmentId))), [activeTerm, courses, departmentId, yearLevel]);
  const existingScheduleCountForYear = useMemo(() => {
    const sectionIds = new Set(scopedSections.map((section) => String(section.id)));
    return existingSchedules.filter((schedule) =>
      sectionIds.has(String(schedule.sectionId))
      && (!activeTerm || Number(schedule.termId) === Number(activeTerm.id))
    ).length;
  }, [activeTerm, existingSchedules, scopedSections]);
  const roomCodeById = useMemo(() => new Map(
    rooms
      .filter((room) => room.department_id === null || departmentId === null || Number(room.department_id) === Number(departmentId))
      .map((room) => [String(room.id), room.room_code])
  ), [departmentId, rooms]);

  const activeConfig = configs[activeSectionId];
  const lockedSectionsCount = scopedSections.filter((section) => configs[section.id]?.locked).length;
  const forcedDaysByCourseId = useMemo(
    () => new Map((settings?.forced_day_rules ?? []).map((rule) => [Number(rule.course_id), rule.day])),
    [settings?.forced_day_rules]
  );
  const requiresRegenerationConfirmation = existingScheduleCountForYear > 0 && confirmedRegenerationYear !== yearLevel;
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
    return () => {
      generationRequestIdRef.current++;
    };
  }, []);

  useEffect(() => {
    const initialYear = availableYears[0] ?? 1;
    let restored = false;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { step?: Step; yearLevel?: number; activeSectionId?: string; configs?: Record<string, SectionConfig>; setupDraft?: Partial<SetupDraft> };
        if (parsed.yearLevel && availableYears.includes(Number(parsed.yearLevel))) {
          setYearLevel(Number(parsed.yearLevel));
          setStep(parsed.step && parsed.step >= 1 && parsed.step <= 5 ? parsed.step : 1);
          setActiveSectionId(parsed.activeSectionId ?? "");
          setConfigs(parsed.configs ?? {});
          setSetupDraft({
            ...defaultSetupDraft,
            ...parsed.setupDraft,
            activeStage: parsed.setupDraft?.activeStage === "field-courses" || parsed.setupDraft?.activeStage === "split-sessions"
              ? parsed.setupDraft.activeStage
              : "forced-day",
            allowedSplitCourseIds: parsed.setupDraft?.allowedSplitCourseIds ?? [],
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
    setPreview([]);
    setFailure(null);
    setAppliedNotice(null);
    setConfirmedRegenerationYear(null);
  }, [availableYears, storageKey]);

  useEffect(() => {
    if (scopedSections.length === 0) return;
    setActiveSectionId((current) => scopedSections.some((section) => section.id === current) ? current : scopedSections[0].id);
    setConfigs((current) => {
      const next = { ...current };
      for (const section of scopedSections) {
        const existing = next[section.id];
        next[section.id] = {
          courseIds: scopedCourses.map((course) => course.id),
          locked: existing?.locked ?? false,
          preferredTimeBlock: existing?.preferredTimeBlock ?? "flexible",
          splitCourseIds: existing?.splitCourseIds?.filter((id) => scopedCourses.some((course) => course.id === id)) ?? [],
          gecSplitCourseIds: existing?.gecSplitCourseIds?.filter((id) => scopedCourses.some((course) => course.id === id)) ?? [],
          gecSplitPatternsByCourseId: Object.fromEntries(scopedCourses.map((course) => [
            course.id,
            normalizeGecPattern(existing?.gecSplitPatternsByCourseId?.[course.id]),
          ])),
          modesByCourseId: {
            ...Object.fromEntries(scopedCourses.map((course) => [course.id, course.roomTypeRequired === "field" ? "field" : "automatic"])),
            ...(existing?.modesByCourseId ?? {}),
          },
          preferencesByCourseId: {
            ...Object.fromEntries(scopedCourses.map((course) => [course.id, "automatic" as SchedulingPreference])),
            ...(existing?.preferencesByCourseId ?? {}),
          },
        };
      }
      return next;
    });
  }, [scopedCourses, scopedSections]);

  useEffect(() => {
    if (settings?.gec_split_schedule_override_enabled !== false) return;

    setConfigs((current) => Object.fromEntries(Object.entries(current).map(([sectionId, config]) => [
      sectionId,
      { ...config, gecSplitCourseIds: [] },
    ])));
  }, [settings?.gec_split_schedule_override_enabled]);

  useEffect(() => {
    const allowedCourseIds = new Set(setupDraft.allowedSplitCourseIds);
    setConfigs((current) => Object.fromEntries(Object.entries(current).map(([sectionId, config]) => [
      sectionId,
      {
        ...config,
        gecSplitCourseIds: config.gecSplitCourseIds.filter((courseId) => allowedCourseIds.has(courseId)),
      },
    ])));
  }, [setupDraft.allowedSplitCourseIds]);

  useEffect(() => {
    if (scopedSections.length === 0) return;
    setLoadingSettings(true);
    api.get<SettingsResponse>("/scheduling-settings", { params: { section_id: scopedSections[0].id } })
      .then((response) => setSettings(response.data))
      .catch(() => toast.error("Error", "Failed to load scheduling rules."))
      .finally(() => setLoadingSettings(false));
  }, [scopedSections, toast]);

  useEffect(() => {
    api.get<ApiRoomRecord[]>("/rooms")
      .then((response) => setRooms(response.data ?? []))
      .catch(() => setRooms([]));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ step, yearLevel, activeSectionId, configs, setupDraft }));
  }, [activeSectionId, configs, setupDraft, step, storageKey, yearLevel]);

  useEffect(() => {
    if (requiresRegenerationConfirmation && step !== 1) {
      setStep(1);
    }
  }, [requiresRegenerationConfirmation, step]);

  const updateConfig = (sectionId: string, change: Partial<SectionConfig>) => setConfigs((current) => ({
    ...current,
    [sectionId]: {
      ...current[sectionId],
      ...change,
      locked: change.locked ?? false,
    },
  }));
  const updateActiveConfig = (change: Partial<SectionConfig>) => {
    if (!activeSectionId) return;
    updateConfig(activeSectionId, change);
  };
  const toggle = (values: string[], id: string) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id];

  const generate = async (configsOverride?: Record<string, SectionConfig>) => {
    if (!activeTerm || departmentId === null) return;
    const activeConfigs = configsOverride ?? configs;
    setGenerating(true);
    setPreview([]);
    setFailure(null);
    setAppliedNotice(null);
    try {
      const payload = {
        term_id: Number(activeTerm.id),
        department_id: departmentId,
        year_level: yearLevel,
        section_configs: scopedSections.map((section) => {
          const config = activeConfigs[section.id];
          return {
            section_id: Number(section.id),
            course_ids: config.courseIds.map(Number),
            selected_split_session_course_ids: config.splitCourseIds.map(Number),
            selected_gec_course_ids: settings?.gec_split_schedule_override_enabled
              ? config.gecSplitCourseIds.map(Number)
              : [],
            preferred_patterns: Object.fromEntries(
              config.gecSplitCourseIds
                .map((id) => [id, config.gecSplitPatternsByCourseId[id] ?? "MW"] as const)
                .filter(([, pattern]) => pattern !== "auto")
                .map(([id, pattern]) => [Number(id), pattern])
            ),
            delivery_modes_by_course_id: Object.fromEntries(Object.entries(config.modesByCourseId).filter(([, mode]) => mode !== "automatic").map(([id, mode]) => [Number(id), mode])),
          };
        }),
      };
      const requestId = ++generationRequestIdRef.current;
      const queued = await api.post<{ run_id: string }>("/schedule-recommendations/year-level-preview/queue", payload);
      const result: GenerationResult = await pollGenerationRun(queued.data.run_id, requestId, generationRequestIdRef);

      if (!Array.isArray(result.schedules) || result.schedules.length === 0) {
        throw new Error("Generation completed without a timetable. Please generate again.");
      }

      setPreview(result.schedules);
      const strategy = result.applied_strategy ?? null;
      if (strategy) {
        setAppliedNotice({ strategy, adjustments: result.applied_adjustments ?? [] });
      }
    } catch (error: unknown) {
      const apiError = error as { code?: string; message?: string; response?: { status?: number; data?: { message?: string } } };
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      if (apiError.response?.status === 401) {
        toast.error("Session Expired", "Please sign in again before generating schedules.");
        return;
      }
      if (apiError.code === "ECONNABORTED") {
        toast.error("Generation Timed Out", "Try again after clearing old draft schedules or reducing forced constraints.");
        return;
      }
      // A structured diagnostic report is shown in the Recommended Adjustment
      // panel instead of a toast, because it needs the user to choose an action.
      const parsed = parseYearLevelFailure(error);
      if (parsed) {
        setFailure(parsed);
        return;
      }
      toast.error("Generation Unsuccessful", apiError.response?.data?.message ?? apiError.message ?? "No year-level timetable satisfies the current rules.");
    } finally {
      setGenerating(false);
    }
  };

  const applyRecommendationAndRetry = (recommendation: GenerationRecommendation) => {
    const { configs: nextConfigs, applied } = applyAdjustments(configs, recommendation.adjustments);
    if (applied.length === 0) {
      toast.error("Nothing to Apply", "That adjustment no longer changes the current configuration. Review the constraints instead.");
      return;
    }

    setConfigs(nextConfigs);
    toast.success("Adjustment Applied", applied.map((adjustment) => describeAdjustment(adjustment)).join(" | "));
    void generate(nextConfigs);
  };

  const reviewConstraints = (sectionId: number | null) => {
    if (sectionId !== null && scopedSections.some((section) => String(section.id) === String(sectionId))) {
      setActiveSectionId(String(sectionId));
    }
    setFailure(null);
    setStep(3);
  };

  const apply = async () => {
    setApplying(true);
    try {
      const replaceableStatuses = new Set(["draft", "completed", "revision"]);
      const sectionIds = new Set(scopedSections.map((section) => String(section.id)));
      const deleteIds = existingSchedules
        .filter((schedule) =>
          sectionIds.has(String(schedule.sectionId))
          && (!activeTerm || Number(schedule.termId) === Number(activeTerm.id))
          && replaceableStatuses.has(schedule.status)
        )
        .map((schedule) => Number(schedule.id))
        .filter((id) => id > 0);
      const operations = preview.map((r) => ({
        term_id: Number(r.term_id),
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
      const response = await api.post<{ schedules?: ApiScheduleRecord[] }>("/schedules/batch", {
        operations,
        delete_ids: deleteIds,
        replace_section_ids: Array.from(sectionIds).map(Number).filter((id) => id > 0),
        replace_term_id: activeTerm ? Number(activeTerm.id) : undefined,
      });
      window.localStorage.removeItem(storageKey);
      toast.success("Generation Complete", "The year-level timetable was saved as draft schedules.");
      try {
        await onAccepted(response.data.schedules ?? preview);
      } catch {
        toast.error("Refresh Needed", "The timetable was saved, but the local timetable could not refresh automatically.");
      }
      onClose();
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
      const validationSummary = Object.values(apiError.response?.data?.errors ?? {})
        .flat()
        .slice(0, 3)
        .join(" | ");

      toast.error(
        violations.length > 0 ? "Schedule Conflict" : "Save Failed",
        summary
          || validationSummary
          || apiError.response?.data?.message
          || apiError.message
          || `Unable to save timetable${apiError.response?.status ? ` (HTTP ${apiError.response.status})` : ""}.`,
      );
    } finally {
      setApplying(false);
    }
  };

  const canContinue = scopedSections.length > 0
    && scopedCourses.length > 0
    && (step !== 1 || !requiresRegenerationConfirmation)
    && (step !== 2 || setupDraft.completed)
    && (step !== 3 || lockedSectionsCount === scopedSections.length);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-[#3d080c] bg-[#4e0a10] lg:flex">
        <div className="border-b border-white/15 px-5 py-4">
          <div className="flex items-center gap-2">
            <p className="text-xs font-black uppercase text-amber-300">Step {step} of {stepNames.length}</p>
            <HelpButton title={stepNames[step - 1]} text={helpText[step]} tone="onMaroon" />
          </div>
          <h2 className="mt-1 text-lg font-black text-white">{stepNames[step - 1]}</h2>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-white/65">{stepDescriptions[step - 1]}.</p>
        </div>
        <CheckoutProgress step={step} layout="vertical" />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#fff8e8]">
        <header className="hidden shrink-0 items-center justify-between gap-4 border-b border-[#3d080c] bg-[#4e0a10] px-5 py-3 text-white lg:flex">
          {step === 2 ? <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10"><Building2 className="h-5 w-5 text-amber-300" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-amber-300">Configuration applies to</p><p className="truncate text-sm font-black">{yearLabel(yearLevel)}</p></div><div className="hidden items-center gap-2 xl:flex"><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black">{formatTerm(activeTerm)}</span><span className="rounded-full border border-amber-200/40 bg-amber-200/10 px-2.5 py-1 text-[10px] font-black text-amber-100">{scopedSections.length} active sections</span></div></div> : <span />}
          <button type="button" onClick={onClose} aria-label="Close schedule generator" title="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white transition hover:bg-white hover:text-[#4e0a10]">
            <X className="h-5 w-5" />
          </button>
        </header>
        <header className="shrink-0 border-b border-[#3d080c] bg-[#4e0a10] text-white lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-amber-300">Step {step} of {stepNames.length}</p>
              <p className="truncate text-lg font-black text-white">{stepNames[step - 1]}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close generator" title="Close" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white transition hover:bg-white hover:text-[#4e0a10]">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-4 pb-3">
            {step === 2 && <div className="mb-2 flex items-center gap-2 border-t border-white/15 pt-2"><Building2 className="h-4 w-4 shrink-0 text-amber-300" /><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-amber-300">Configuration applies to</p><p className="truncate text-sm font-black">{yearLabel(yearLevel)}</p></div></div>}
            <CheckoutProgress step={step} layout="horizontal" />
          </div>
        </header>

        <main className={`min-h-0 flex-1 bg-[#fff8e8] p-2 sm:p-3 lg:p-4 ${step <= 2 ? "overflow-hidden" : "overflow-y-auto"}`}>
          {step === 1 && (
            <ScopeRulesStep
              view="scope"
              activeTerm={activeTerm}
              years={availableYears}
              yearLevel={yearLevel}
              onYearChange={(value) => {
                setYearLevel(value);
                setPreview([]);
                setFailure(null);
                setAppliedNotice(null);
                setConfirmedRegenerationYear(null);
              }}
              existingScheduleCount={existingScheduleCountForYear}
              requiresRegenerationConfirmation={requiresRegenerationConfirmation}
              onConfirmRegeneration={() => setConfirmedRegenerationYear(yearLevel)}
              actionsDisabled={requiresRegenerationConfirmation}
              sections={scopedSections}
              courses={scopedCourses}
              departmentLogoUrl={departmentLogoUrl}
              settings={settings}
              setSettings={setSettings}
              setupDraft={setupDraft}
              setSetupDraft={setSetupDraft}
              loadingSettings={loadingSettings}
              sectionId={scopedSections[0]?.id ?? ""}
            />
          )}
          {step === 2 && (
            <ScopeRulesStep
              view="configuration"
              activeTerm={activeTerm}
              years={availableYears}
              yearLevel={yearLevel}
              onYearChange={() => undefined}
              existingScheduleCount={existingScheduleCountForYear}
              requiresRegenerationConfirmation={requiresRegenerationConfirmation}
              onConfirmRegeneration={() => setConfirmedRegenerationYear(yearLevel)}
              actionsDisabled={requiresRegenerationConfirmation}
              sections={scopedSections}
              courses={scopedCourses}
              departmentLogoUrl={departmentLogoUrl}
              settings={settings}
              setSettings={setSettings}
              setupDraft={setupDraft}
              setSetupDraft={setSetupDraft}
              loadingSettings={loadingSettings}
              sectionId={scopedSections[0]?.id ?? ""}
            />
          )}
          {step === 3 && activeConfig && (
            <CoursesSectionsStep
              sections={scopedSections}
              courses={scopedCourses}
              activeTerm={activeTerm}
              departmentId={departmentId}
              departmentLogoUrl={departmentLogoUrl}
              rooms={rooms}
              existingSchedules={existingSchedules}
              activeSectionId={activeSectionId}
              setActiveSectionId={setActiveSectionId}
              config={activeConfig}
              configs={configs}
              updateConfig={updateActiveConfig}
              toggle={toggle}
              forcedDaysByCourseId={forcedDaysByCourseId}
              fieldCourseCodes={new Set(settings?.field_course_codes ?? [])}
              minorSplitEnabled={Boolean(settings?.gec_split_schedule_override_enabled)}
              allowedSplitCourseIds={new Set(setupDraft.allowedSplitCourseIds)}
            />
          )}
          {step === 4 && (
            <RedesignedReviewStep
              activeTerm={activeTerm}
              sections={scopedSections}
              courses={scopedCourses}
              configs={configs}
              activeRules={activeRules}
              allowedSplitCourseCount={setupDraft.allowedSplitCourseIds.length}
              onEditScope={() => setStep(1)}
              onEditConfiguration={() => setStep(2)}
              onEditCourses={() => setStep(3)}
            />
          )}
          {step === 5 && (
            <GenerateStep
              preview={preview}
              sections={scopedSections}
              courses={scopedCourses}
              activeTerm={activeTerm}
              activeRules={activeRules}
              roomCodeById={roomCodeById}
              generating={generating}
              applying={applying}
              generate={() => void generate()}
              apply={apply}
              failure={failure}
              appliedNotice={appliedNotice}
              onApplyAndRetry={applyRecommendationAndRetry}
              onReviewConstraints={reviewConstraints}
              onDismissFailure={() => setFailure(null)}
              onDismissNotice={() => setAppliedNotice(null)}
            />
          )}
        </main>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 bg-[#fff8e8] px-4 py-3 sm:px-6">
          <button type="button" disabled={step === 1 || generating || applying} onClick={() => setStep((step - 1) as Step)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < 5 && (
            <button type="button" disabled={!canContinue} onClick={() => setStep((step + 1) as Step)} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

const helpText: Record<Step, string> = {
  1: "Choose the year level whose active sections will be generated together.",
  2: "Schedule Setup defines the special requirements the generator must follow.",
  3: "Section Schedule configures hybrid and split-session scheduling for every included section.",
  4: "Review the selected year level, schedule setup, and section schedules before generation.",
  5: "Generate Schedule runs the scheduling algorithm, checks conflicts, and prepares the final timetable.",
};

function HelpButton({ title, text, tone = "default" }: { title: string; text: string; tone?: "default" | "onMaroon" }) {
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
      {open && <span className="absolute left-0 top-7 z-10 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium leading-relaxed text-slate-600 shadow-xl">{text}</span>}
    </span>
  );
}

function CheckoutProgress({ step, layout }: { step: Step; layout: "vertical" | "horizontal" }) {
  const stepIcons = [Building2, SlidersHorizontal, BookOpen, CheckCircle2, Sparkles];

  if (layout === "vertical") {
    return (
      <nav className="px-5 py-6" aria-label="Schedule generator steps">
        <ol className="space-y-1">
          {stepNames.map((name, index) => {
            const value = (index + 1) as Step;
            const Icon = stepIcons[index];
            const isComplete = step > value;
            const isCurrent = step === value;
            return (
              <li key={name} className="relative flex gap-3 pb-5 last:pb-0" aria-current={isCurrent ? "step" : undefined}>
                {index < stepNames.length - 1 && <span className={`absolute left-[17px] top-9 h-[calc(100%-1.25rem)] w-px ${isComplete ? "bg-white/70" : "bg-white/20"}`} aria-hidden="true" />}
                <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${isComplete ? "border-white bg-white text-[#4e0a10]" : isCurrent ? "border-white bg-white/10 text-white ring-4 ring-white/10" : "border-white/20 bg-white/5 text-white/45"}`}>
                  {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex items-start justify-between gap-2">
                    <span className={`block text-sm font-black ${isCurrent || isComplete ? "text-white" : "text-white/45"}`}>{name}</span>
                    {(isComplete || isCurrent) && <StepStatusBadge isComplete={isComplete} tone="onMaroon" />}
                  </span>
                  <span className={`mt-1 block text-xs font-semibold leading-relaxed ${isCurrent || isComplete ? "text-white/65" : "text-white/40"}`}>{stepDescriptions[index]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <nav
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
      aria-label="Schedule generator steps"
    >
      <ol className="grid grid-cols-4">
        {stepNames.map((name, index) => {
          const value = index + 1;
          const isComplete = step > value;
          const isCurrent = step === value;
          return (
            <li
              key={name}
              className="relative flex min-w-0 flex-col items-center text-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              {index > 0 && (
                <span
                  className={`absolute left-0 top-2.5 h-0.5 w-1/2 -translate-y-1/2 ${step > value - 1 ? "bg-[#4e0a10]" : "bg-slate-200"}`}
                  aria-hidden="true"
                />
              )}
              {index < stepNames.length - 1 && (
                <span
                  className={`absolute right-0 top-2.5 h-0.5 w-1/2 -translate-y-1/2 ${isComplete ? "bg-[#4e0a10]" : "bg-slate-200"}`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black shadow-sm ${
                  isComplete
                    ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                    : isCurrent
                      ? "border-[#4e0a10] bg-white text-[#4e0a10] ring-2 ring-[#4e0a10]/15"
                      : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
              >
                {isComplete ? <Check className="h-3 w-3" /> : value}
              </span>
              <span className={`mt-1.5 hidden max-w-full truncate text-xs font-black sm:block ${isCurrent || isComplete ? "text-slate-900" : "text-slate-400"}`}>
                {name}
              </span>
              {(isComplete || isCurrent) && (
                <span className="mt-1 hidden md:block">
                  <StepStatusBadge isComplete={isComplete} />
                </span>
              )}
              <span className={`mt-1 hidden text-[10px] font-semibold leading-relaxed md:block ${isCurrent || isComplete ? "text-slate-500" : "text-slate-400"}`}>
                {stepDescriptions[index]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepStatusBadge({ isComplete, tone = "default" }: { isComplete: boolean; tone?: "default" | "onMaroon" }) {
  const colorClass = tone === "onMaroon"
    ? isComplete
      ? "bg-white/15 text-white ring-white/25"
      : "bg-amber-300 text-[#4e0a10] ring-amber-200"
    : isComplete
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase leading-none ring-1 ${colorClass}`}
    >
      {isComplete ? "Done" : "In progress"}
    </span>
  );
}

function SectionReadyBadge({ ready, active }: { ready: boolean; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
        ready
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {ready && <Check className="h-3 w-3" />}
      {active && !ready ? "Editing" : ready ? "Locked" : "Not ready"}
    </span>
  );
}

function ScopeRulesStep({
  view,
  activeTerm,
  years,
  yearLevel,
  onYearChange,
  existingScheduleCount,
  requiresRegenerationConfirmation,
  onConfirmRegeneration,
  actionsDisabled,
  sections,
  courses,
  departmentLogoUrl,
  settings,
  setSettings,
  setupDraft,
  setSetupDraft,
  loadingSettings,
  sectionId,
}: {
  view: "scope" | "configuration";
  activeTerm: Term | null;
  years: number[];
  yearLevel: number;
  onYearChange: (value: number) => void;
  existingScheduleCount: number;
  requiresRegenerationConfirmation: boolean;
  onConfirmRegeneration: () => void;
  actionsDisabled: boolean;
  sections: Section[];
  courses: Course[];
  departmentLogoUrl?: string | null;
  settings: SettingsResponse | null;
  setSettings: (settings: SettingsResponse) => void;
  setupDraft: SetupDraft;
  setSetupDraft: Dispatch<SetStateAction<SetupDraft>>;
  loadingSettings: boolean;
  sectionId: string;
}) {
  const { toast } = useToast();
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedForcedCourseIds, setSelectedForcedCourseIds] = useState<number[]>([]);
  const [selectedForcedDay, setSelectedForcedDay] = useState("Saturday");
  const [selectedFieldCourseCodes, setSelectedFieldCourseCodes] = useState<string[]>([]);
  const [pendingReplacement, setPendingReplacement] = useState<{ courseId: string; courseCode: string; target: "forced-day" | "split"; previous: string } | null>(null);
  const toggleSetupCourse = (values: string[], id: string) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
  const setupStages: Array<{ id: SetupStage; label: string; description: string; icon: typeof CalendarDays }> = [
    { id: "forced-day", label: "Forced Day Rules", description: "Assign required meeting days to selected courses.", icon: CalendarDays },
    { id: "field-courses", label: "Field Courses", description: "Mark courses that must use field resources.", icon: MapPin },
    { id: "split-sessions", label: "Allowed Split Sessions", description: "Choose which eligible courses may show split-session controls.", icon: Split },
  ];
  const activeSetupIndex = setupStages.findIndex((stage) => stage.id === setupDraft.activeStage);
  const activeSetupStage = setupStages[activeSetupIndex] ?? setupStages[0];
  const ActiveSetupIcon = activeSetupStage.icon;

  const forcedDayRules = settings?.forced_day_rules ?? [];
  const forcedDayCourses = settings?.forced_day_courses ?? [];
  const fieldCourseCodes = settings?.field_course_codes ?? [];
  const fieldCourseOptions = settings?.field_course_options ?? [];
  const uniqueForcedDayRules = Array.from(new Map(forcedDayRules.map((rule) => [`${rule.course_id}:${rule.day}`, rule])).values());
  const uniqueForcedDayCourses = Array.from(new Map(forcedDayCourses.map((course) => [course.id, course])).values());
  const uniqueFieldCourseCodes = Array.from(new Set(fieldCourseCodes));
  const uniqueFieldCourseOptions = Array.from(new Map(fieldCourseOptions.map((course) => [course.code, course])).values());
  const forcedCourseMap = new Map(uniqueForcedDayCourses.map((course) => [course.id, course]));
  const fieldCourseMap = new Map(uniqueFieldCourseOptions.map((course) => [course.code, course]));
  const availableForcedDayCourses = uniqueForcedDayCourses.filter((course) => !uniqueForcedDayRules.some((rule) => rule.course_id === course.id));
  // Field delivery requires a field-capable lecture course; courses with any
  // laboratory component must remain out of this selector.
  const fieldEligibleCodes = new Set(courses.filter((course) => Number(course.labHours ?? 0) <= 0).map((course) => course.code));
  const availableFieldCourses = uniqueFieldCourseOptions.filter((course) => fieldEligibleCodes.has(course.code) && !uniqueFieldCourseCodes.includes(course.code));
  const availableForcedCourseIds = new Set(availableForcedDayCourses.map((course) => course.id));
  const availableFieldCourseCodes = new Set(availableFieldCourses.map((course) => course.code));
  const effectiveForcedCourseIds = selectedForcedCourseIds.filter((id) => availableForcedCourseIds.has(id));
  const effectiveFieldCourseCodes = selectedFieldCourseCodes.filter((code) => availableFieldCourseCodes.has(code));

  const applyCourseConfiguration = async (courseId: string, target: "forced-day" | "split") => {
    if (target === "forced-day") {
      setSetupDraft((current) => ({
        ...current,
        allowedSplitCourseIds: current.allowedSplitCourseIds.filter((id) => id !== courseId),
        completed: false,
      }));
      setSelectedForcedCourseIds((current) => current.includes(Number(courseId)) ? current : [...current, Number(courseId)]);
      return;
    }
    if (uniqueForcedDayRules.some((rule) => String(rule.course_id) === courseId)) {
      const saved = await patchSettings({ forced_day_rules: uniqueForcedDayRules.filter((rule) => String(rule.course_id) !== courseId) });
      if (!saved) return;
    }
    setSetupDraft((current) => ({
      ...current,
      allowedSplitCourseIds: current.allowedSplitCourseIds.includes(courseId)
        ? current.allowedSplitCourseIds
        : [...current.allowedSplitCourseIds, courseId],
      completed: false,
    }));
  };

  const requestCourseConfiguration = (courseId: string, courseCode: string, target: "forced-day" | "split") => {
    const targetLabel = target === "forced-day" ? "Forced Day" : "Split Session";
    const previous = uniqueForcedDayRules.some((rule) => String(rule.course_id) === courseId) ? "Forced Day" : setupDraft.allowedSplitCourseIds.includes(courseId) ? "Split Session" : null;
    if (!previous || previous === targetLabel) {
      if (target === "split") setSetupDraft((current) => ({ ...current, allowedSplitCourseIds: toggleSetupCourse(current.allowedSplitCourseIds, courseId), completed: false }));
      else void applyCourseConfiguration(courseId, target);
      return;
    }
    setPendingReplacement({ courseId, courseCode, target, previous });
  };

  const patchSettings = async (patch: Partial<SettingsResponse>): Promise<boolean> => {
    if (!sectionId || !settings) return false;
    setSavingSettings(true);
    try {
      const response = await api.patch<SettingsResponse>("/scheduling-settings", patch, {
        params: { section_id: sectionId },
      });
      // Keep the submitted values when an API response is partial or stale.
      setSettings({ ...settings, ...response.data, ...patch });
      toast.success("Constraints saved", "Generation constraints updated for this year level.");
      return true;
    } catch {
      toast.error("Save failed", "Unable to update generation constraints.");
      return false;
    } finally {
      setSavingSettings(false);
    }
  };

  const removeForcedDayRule = (courseId: number) => {
    void patchSettings({
      forced_day_rules: forcedDayRules.filter((rule) => rule.course_id !== courseId),
    });
  };

  const removeFieldCourseRule = (courseCode: string) => {
    const nextFieldCourseCodes = fieldCourseCodes.filter((code) => code !== courseCode);
    setSettings({ ...settings, field_course_codes: nextFieldCourseCodes });
    void patchSettings({ field_course_codes: nextFieldCourseCodes });
  };

  const moveSetupStage = (direction: -1 | 1) => {
    const nextIndex = Math.min(setupStages.length - 1, Math.max(0, activeSetupIndex + direction));
    setSetupDraft((current) => ({ ...current, activeStage: setupStages[nextIndex].id }));
  };

  const saveAndContinueSetup = async () => {
    if (setupDraft.activeStage === "forced-day" && effectiveForcedCourseIds.length > 0) {
      const saved = await patchSettings({
        forced_day_rules: [...uniqueForcedDayRules, ...effectiveForcedCourseIds.map((courseId) => ({ course_id: courseId, day: selectedForcedDay }))],
      });
      if (!saved) return;
      setSelectedForcedCourseIds([]);
    }

    if (setupDraft.activeStage === "field-courses" && effectiveFieldCourseCodes.length > 0) {
      const saved = await patchSettings({
        field_course_codes: [...uniqueFieldCourseCodes, ...effectiveFieldCourseCodes],
      });
      if (!saved) return;
      setSelectedFieldCourseCodes([]);
    }

    if (activeSetupIndex === setupStages.length - 1) {
      setSetupDraft((current) => ({ ...current, completed: true }));
      return;
    }

    moveSetupStage(1);
  };

  return (
    <div className={view === "scope" ? "h-full min-h-0 w-full" : "h-full min-h-0"}>
      {view === "scope" && <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#c9952a]/30 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-[#3d080c] bg-[#4e0a10] px-3 py-2.5 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10"><Building2 className="h-4 w-4 text-amber-300" /></span>
            <h3 className="text-sm font-black">Year Level</h3>
          </div>
          <HelpButton title="Year-Level Generation" tone="onMaroon" text="Choose the academic term and year level. All active sections under the selected year level will be generated together." />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-[#fff8e8]/45 p-4">
          <div role="group" aria-label="Selected year level and included sections" className="flex h-full min-h-0 flex-col rounded-lg border border-[#c9952a]/35 bg-white p-4 shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 pb-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#c9952a]/35 bg-[#fff8e8] shadow-sm">
                {departmentLogoUrl ? <img src={departmentLogoUrl} alt="" className="h-full w-full object-contain p-1" /> : <Building2 className="h-6 w-6 text-[#4e0a10]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-wide text-[#9a6a10]">Selected year level</p>
                <p className="mt-1 truncate text-lg font-black text-slate-950">{yearLabel(yearLevel)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span aria-label="Academic term" className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                    {activeTerm ? academicYearLabel(activeTerm.academic_year) : "No active term"}
                  </span>
                  {activeTerm && (
                    <span className="inline-flex items-center rounded-md bg-[#4e0a10] px-2.5 py-1 text-xs font-black text-white shadow-sm">
                      Current: {semesterLabel(activeTerm.semester)}
                    </span>
                  )}
                </div>
              </div>
              <label className="w-full shrink-0 text-xs font-black uppercase text-slate-500 sm:w-64">
                Year level
                <select value={yearLevel} onChange={(event) => onYearChange(Number(event.target.value))} className="mt-1.5 h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold normal-case text-slate-900 outline-none transition focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/10">
                  {years.map((year) => <option key={year} value={year}>{yearLabel(year)}</option>)}
                </select>
              </label>
              <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">{sections.length} sections</span>
            </div>
            {requiresRegenerationConfirmation && (
              <div className="mt-3 flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-amber-950">This year level already has generated schedules.</p>
                  <p className="mt-0.5 text-xs font-semibold text-amber-800">{yearLabel(yearLevel)} has {existingScheduleCount} saved schedule{existingScheduleCount === 1 ? "" : "s"} for this term.</p>
                </div>
                <button type="button" onClick={onConfirmRegeneration} className="rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-black text-white transition hover:brightness-110">
                  Generate again
                </button>
              </div>
            )}
            <p className="mt-3 shrink-0 text-xs font-black uppercase text-slate-500">Included sections</p>
            {sections.length ? (
              <div className="mt-3 grid min-h-0 flex-1 auto-rows-fr gap-3 sm:grid-cols-2">
                {sections.map((section) => (
                  <div key={section.id} className="flex min-h-[64px] items-center gap-3 rounded-lg border border-[#4e0a10]/20 bg-[#fff8e8]/55 px-4 py-3 text-left text-[#4e0a10] shadow-sm">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/10"><Users className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-base font-black">{section.name}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">Included in year-level generation</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm font-semibold text-slate-500">No active sections found for this year level.</p>}
          </div>
        </div>
      </section>}

      {view === "configuration" && <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#4e0a10]" />
              <h3 className="text-sm font-black text-slate-950">Schedule Setup</h3>
              <HelpButton title="Schedule Setup" text="Complete each optional configuration. Empty selections are allowed and can be skipped." />
            </div>
            <span className="inline-flex items-center rounded-full border border-[#4e0a10]/15 bg-[#4e0a10]/5 px-2.5 py-1 text-xs font-black text-[#4e0a10]">Setup {activeSetupIndex + 1} of {setupStages.length}</span>
          </div>
          <ol className="mt-3 grid grid-cols-3" aria-label="Schedule setup progress">
            {setupStages.map((stage, stageIndex) => {
              const Icon = stage.icon;
              const active = stage.id === setupDraft.activeStage;
              const completed = stageIndex < activeSetupIndex;
              const configuredCount = stage.id === "forced-day" ? uniqueForcedDayRules.length
                : stage.id === "field-courses" ? uniqueFieldCourseCodes.length
                  : setupDraft.allowedSplitCourseIds.length;
              return (
                <li key={stage.id} className="relative min-w-0">
                  {stageIndex < setupStages.length - 1 && (
                    <span aria-hidden="true" className={`absolute left-1/2 right-[-50%] top-4 h-0.5 ${stageIndex < activeSetupIndex ? "bg-[#4e0a10]" : "bg-slate-200"}`} />
                  )}
                  <button
                    type="button"
                    aria-current={active ? "step" : undefined}
                    onClick={() => setSetupDraft((current) => ({ ...current, activeStage: stage.id, completed: false }))}
                    className="group relative z-10 flex w-full min-w-0 flex-col items-center px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4e0a10] focus-visible:ring-offset-2"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${active ? "border-[#4e0a10] bg-[#4e0a10] text-white shadow-sm" : completed ? "border-[#4e0a10] bg-white text-[#4e0a10]" : "border-slate-300 bg-white text-slate-400 group-hover:border-[#4e0a10]/60 group-hover:text-[#4e0a10]"}`}>
                      {completed ? <Check className="h-4 w-4" /> : active ? <Icon className="h-4 w-4" /> : <span className="text-xs font-black">{stageIndex + 1}</span>}
                    </span>
                    <span className={`mt-1.5 block w-full text-xs font-black leading-tight ${active ? "text-[#4e0a10]" : "text-slate-700"}`}>{stage.label}</span>
                    <span className={`mt-1 text-[10px] font-bold ${configuredCount > 0 ? "text-emerald-700" : active ? "text-[#4e0a10]" : "text-slate-400"}`}>
                      {configuredCount > 0 ? `${configuredCount} configured` : active ? "Current step" : completed ? "Reviewed" : "Optional"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {loadingSettings ? (
          <div className="m-4 flex min-h-0 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-600"><LoadingSpinner className="h-4 w-4" /> Loading scheduling rules</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 pb-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/10 text-[#4e0a10]"><ActiveSetupIcon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h4 className="text-base font-black text-slate-950">{activeSetupStage.label}</h4><p className="mt-0.5 text-sm font-semibold text-slate-500">{activeSetupStage.description}</p><span className="mt-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">Optional configuration</span></div>
              {setupDraft.activeStage === "forced-day" && <label className="flex shrink-0 items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500"><span className="hidden sm:inline">Required day</span><select value={selectedForcedDay} disabled={actionsDisabled || savingSettings} onChange={(event) => setSelectedForcedDay(event.target.value)} className="h-9 w-[118px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-slate-800 outline-none focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15">{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>}
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-hidden">
              {setupDraft.activeStage === "forced-day" && <>
                <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
                  <div role="group" aria-label="Available forced-day courses" className="min-h-0 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase text-slate-500">Available courses</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">{availableForcedDayCourses.length}</span>
                    </div>
                    <SetupCourseSelector
                      courses={availableForcedDayCourses.map((course): SetupCourseOption => ({ id: String(course.id), code: course.code, name: course.name }))}
                      selectedIds={new Set(effectiveForcedCourseIds.map(String))}
                      onToggle={(courseId) => requestCourseConfiguration(courseId, availableForcedDayCourses.find((course) => String(course.id) === courseId)?.code ?? courseId, "forced-day")}
                      disabled={actionsDisabled || savingSettings}
                      emptyText="All available courses already have forced-day rules."
                    />
                  </div>
                  <ConfiguredCourseList
                    title="Configured forced-day courses"
                    emptyText="No forced-day courses configured."
                    items={uniqueForcedDayRules.map((rule) => { const course = forcedCourseMap.get(rule.course_id); return { id: String(rule.course_id), code: course?.code ?? `Course #${rule.course_id}`, name: course?.name ?? "Saved subject day rule", value: rule.day, onRemove: () => removeForcedDayRule(rule.course_id) }; })}
                    disabled={actionsDisabled || savingSettings}
                    className="h-full"
                    singleColumn
                  />
                </div>
              </>}

              {setupDraft.activeStage === "field-courses" && <>
                <SetupCourseSelector
                  courses={availableFieldCourses.map((course): SetupCourseOption => ({ id: course.code, code: course.code, name: course.name }))}
                  selectedIds={new Set(effectiveFieldCourseCodes)}
                  onToggle={(courseCode) => { setSetupDraft((current) => ({ ...current, completed: false })); setSelectedFieldCourseCodes((current) => current.includes(courseCode) ? current.filter((code) => code !== courseCode) : [...current, courseCode]); }}
                  disabled={actionsDisabled || savingSettings}
                  emptyText="All available courses are already configured as field courses."
                />
                <ConfiguredCourseList
                  title="Configured field courses"
                  emptyText="No field courses configured."
                  items={uniqueFieldCourseCodes.map((courseCode) => { const course = fieldCourseMap.get(courseCode); return { id: courseCode, code: courseCode, name: course?.name ?? "Saved field course", value: "Field", onRemove: () => removeFieldCourseRule(courseCode) }; })}
                  disabled={actionsDisabled || savingSettings}
                />
              </>}

              {setupDraft.activeStage === "split-sessions" && <SetupCourseSelector
                courses={courses.filter(isMinorCourse).map((course) => ({ id: course.id, code: course.code, name: course.name, meta: "Eligible for the existing split-session workflow" }))}
                selectedIds={new Set(setupDraft.allowedSplitCourseIds)}
                onToggle={(courseId) => requestCourseConfiguration(courseId, courses.find((course) => course.id === courseId)?.code ?? courseId, "split")}
                disabled={actionsDisabled}
                emptyText="No split-session-eligible courses are available for this scope."
              />}
            </div>

            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">No selection required · optional</span>
              <div className="flex gap-2">
                <button type="button" disabled={activeSetupIndex === 0 || savingSettings} onClick={() => moveSetupStage(-1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><ArrowLeft className="h-4 w-4" /> Previous</button>
                <button type="button" disabled={savingSettings || actionsDisabled || (activeSetupIndex === setupStages.length - 1 && setupDraft.completed)} onClick={() => void saveAndContinueSetup()} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-black text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{activeSetupIndex === setupStages.length - 1 ? "Finish Setup" : "Save & Continue"}<ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        )}
      </section>
      <ConfirmModal
        isOpen={Boolean(pendingReplacement)}
        title="Replace scheduling configuration?"
        eyebrow="Configuration conflict"
        message={pendingReplacement ? `${pendingReplacement.courseCode} already uses ${pendingReplacement.previous}. Assigning ${pendingReplacement.target === "forced-day" ? "Forced Day" : "Split Session"} will replace the existing rule and change its meeting days or session schedule.` : ""}
        confirmLabel="Replace configuration"
        cancelLabel="Keep existing rule"
        variant="maroon"
        onCancel={() => setPendingReplacement(null)}
        onConfirm={async () => {
          if (!pendingReplacement) return;
          const replacement = pendingReplacement;
          setPendingReplacement(null);
          await applyCourseConfiguration(replacement.courseId, replacement.target);
        }}
      />
      </>}
    </div>
  );
}

type ConfiguredCourseListItem = {
  id: string;
  code: string;
  name: string;
  value: string;
  onRemove: () => void;
};

function ConfiguredCourseList({
  title,
  emptyText,
  items,
  disabled,
  className = "mt-4",
  singleColumn = false,
}: {
  title: string;
  emptyText: string;
  items: ConfiguredCourseListItem[];
  disabled: boolean;
  className?: string;
  singleColumn?: boolean;
}) {
  return (
    <div role="group" aria-label={title} className={`${className} flex min-h-0 flex-col rounded-lg border border-slate-200 bg-slate-50/70 p-3`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase text-slate-500">{title}</p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm font-semibold text-slate-500">{emptyText}</p>
      ) : (
        <div className={`grid min-h-0 gap-2 ${singleColumn ? "grid-cols-1" : "lg:grid-cols-2"}`}>
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <CourseIdentity code={item.code} name={item.name} />
              <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">{item.value}</span>
              <button type="button" onClick={item.onRemove} disabled={disabled} aria-label={`Remove ${item.code}`} title="Remove" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoursesSectionsStep({
  sections,
  courses,
  activeTerm,
  departmentId,
  departmentLogoUrl,
  rooms,
  existingSchedules,
  activeSectionId,
  setActiveSectionId,
  config,
  configs,
  updateConfig,
  toggle,
  forcedDaysByCourseId,
  fieldCourseCodes,
  minorSplitEnabled,
  allowedSplitCourseIds,
}: {
  sections: Section[];
  courses: Course[];
  activeTerm: Term | null;
  departmentId: number | null;
  departmentLogoUrl?: string | null;
  rooms: ApiRoomRecord[];
  existingSchedules: ScheduleItem[];
  activeSectionId: string;
  setActiveSectionId: (id: string) => void;
  config: SectionConfig;
  configs: Record<string, SectionConfig>;
  updateConfig: (change: Partial<SectionConfig>) => void;
  toggle: (values: string[], id: string) => string[];
  forcedDaysByCourseId: ReadonlyMap<number, string>;
  fieldCourseCodes: ReadonlySet<string>;
  minorSplitEnabled: boolean;
  allowedSplitCourseIds: ReadonlySet<string>;
}) {
  const activeSection = sections.find((section) => section.id === activeSectionId);
  const isSectionReady = (section: Section) => Boolean(configs[section.id]?.locked);
  const readyCount = sections.filter(isSectionReady).length;
  const excludedSectionIds = useMemo(() => new Set(sections.map((section) => String(section.id))), [sections]);
  const patternAvailabilityBySectionCourseKey = useMemo(() => {
    const availability = new Map<string, GecPatternAvailability>();

    for (const section of sections) {
      for (const course of minorSplitEnabled ? courses.filter((course) => isMinorCourse(course) && allowedSplitCourseIds.has(course.id)) : []) {
        availability.set(
          `${section.id}:${course.id}`,
          getGecPatternAvailability({
            course,
            rooms,
            existingSchedules,
            excludedSectionIds,
            departmentId,
            termId: activeTerm?.id ?? null,
            reservations: buildGecPatternReservations(configs, courses, section.id, course.id),
          }),
        );
      }
    }

    return availability;
  }, [activeTerm?.id, allowedSplitCourseIds, configs, courses, departmentId, existingSchedules, excludedSectionIds, minorSplitEnabled, rooms, sections]);
  const hasFullSelectedPattern = config.gecSplitCourseIds.some((courseId) => {
    const pattern = fixedGecPattern(config.gecSplitPatternsByCourseId[courseId] ?? "MW");
    if (!pattern) return false;

    return patternAvailabilityBySectionCourseKey.get(`${activeSectionId}:${courseId}`)?.[pattern]?.full ?? false;
  });
  const hybridEligibleCourseIds = courses.filter((course) => Number(course.labHours ?? 0) > 0).map((course) => course.id);
  const allHybridSelected = hybridEligibleCourseIds.length > 0 && hybridEligibleCourseIds.every((courseId) => config.splitCourseIds.includes(courseId));
  const toggleAllHybrid = () => updateConfig({
    splitCourseIds: allHybridSelected
      ? config.splitCourseIds.filter((courseId) => !hybridEligibleCourseIds.includes(courseId))
      : Array.from(new Set([...config.splitCourseIds, ...hybridEligibleCourseIds])),
  });
  const canLockActiveSection = courses.length > 0 && config.courseIds.length === courses.length && !hasFullSelectedPattern;

  return (
    <div className="grid h-full min-h-0 gap-2.5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-slate-950">Sections</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{sections.length} total</span>
          </div>
          <HelpButton title="Section Schedule" text="Select a section, then configure its hybrid, split-session, and preferred time settings." />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">{readyCount} locked</span>
          {readyCount < sections.length && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 ring-1 ring-amber-200">{sections.length - readyCount} remaining</span>}
        </div>
        <div className="mt-2 grid min-h-0 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
          {sections.map((section) => {
            const selectedCount = configs[section.id]?.courseIds.length ?? courses.length;
            const ready = isSectionReady(section);
            const active = activeSectionId === section.id;
            return (
              <button
                type="button"
                key={section.id}
                onClick={() => setActiveSectionId(section.id)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  active
                    ? "border-[#4e0a10] bg-[#4e0a10]/5 shadow-sm"
                    : ready
                      ? "border-emerald-200 bg-white hover:bg-emerald-50/60"
                      : "border-amber-200 bg-white hover:bg-amber-50/60"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                      {departmentLogoUrl ? (
                        <img src={departmentLogoUrl} alt="" className="h-full w-full object-contain p-0.5" />
                      ) : (
                        <Building2 className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-950">{section.name}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-slate-500">{selectedCount} courses</span>
                    </span>
                  </span>
                  <SectionReadyBadge ready={ready} active={active} />
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase text-slate-500">Selected Section</p>
              <SectionReadyBadge ready={activeSection ? isSectionReady(activeSection) : false} active={false} />
            </div>
            <h3 className="mt-0.5 text-base font-black text-slate-950">{activeSection?.name ?? "Selected section"}</h3>
            <p className="text-xs font-semibold text-slate-500">{config.courseIds.length} courses prepared</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${hybridEligibleCourseIds.length === 0 ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : allHybridSelected ? "cursor-pointer border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]" : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <input type="checkbox" checked={allHybridSelected} disabled={hybridEligibleCourseIds.length === 0 || config.locked} onChange={toggleAllHybrid} className="h-4 w-4 rounded border-slate-300 accent-[#4e0a10]" />
              Hybrid all
            </label>
            <label className="text-sm font-bold text-slate-700">
              Preferred time
              <select value={displayPreferenceValue(toSchedulingPreference(config.preferredTimeBlock))} onChange={(event) => updateConfig({ preferredTimeBlock: fromSchedulingPreference(event.target.value as SchedulingPreference) })} className="ml-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900">
                {configurablePreferenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button
              type="button"
              disabled={!canLockActiveSection}
              onClick={() => updateConfig({ locked: !config.locked })}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                config.locked
                  ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  : "bg-[#4e0a10] text-white hover:brightness-110"
              }`}
            >
              <Check className="h-4 w-4" />
              {config.locked ? "Unlock section" : "Mark ready"}
            </button>
          </div>
        </div>

        <div className="mt-2">
          <SectionRecommendationCard
            activeSection={activeSection}
            courses={courses}
            config={config}
            patternAvailabilityBySectionCourseKey={patternAvailabilityBySectionCourseKey}
            activeSectionId={activeSectionId}
            minorSplitEnabled={minorSplitEnabled}
            allowedSplitCourseIds={allowedSplitCourseIds}
          />
        </div>

        <div className="mt-2 grid min-h-0 gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
          {courses.map((course) => {
            const forcedDay = forcedDaysByCourseId.get(Number(course.id));
            const isFieldCourse = fieldCourseCodes.has(course.code);

            return (
              <div key={course.id} className="flex flex-col rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 transition hover:border-slate-300 hover:shadow-sm">
                <CourseIdentity
                  code={course.code}
                  name={course.name}
                  meta={`${courseHours(course)} hours`}
                  trailing={<span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{config.locked && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">Locked</span>}{isFieldCourse && <span className="inline-flex items-center gap-1 rounded-md bg-[#4e0a10]/10 px-2 py-1 text-[11px] font-black text-[#4e0a10] ring-1 ring-[#4e0a10]/20"><MapPin className="h-3.5 w-3.5" />Field</span>}{forcedDay && <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-200"><CalendarDays className="h-3.5 w-3.5" />Required {forcedDay}</span>}</span>}
                />
                <CourseInlineConfiguration
                  course={course}
                  config={config}
                  patternAvailability={patternAvailabilityBySectionCourseKey.get(`${activeSectionId}:${course.id}`)}
                  updateConfig={updateConfig}
                  toggle={toggle}
                  minorSplitEnabled={minorSplitEnabled}
                  allowedSplitCourseIds={allowedSplitCourseIds}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type GecPatternAvailability = Record<FixedGecSplitPattern, { full: boolean; label: string }>;
type GecPatternReservation = {
  sectionId: string;
  courseId: string;
  pattern: FixedGecSplitPattern;
  requiredSlots: number;
};

function CourseInlineConfiguration({
  course,
  config,
  patternAvailability,
  updateConfig,
  toggle,
  minorSplitEnabled,
  allowedSplitCourseIds,
}: {
  course: Course;
  config: SectionConfig;
  patternAvailability?: GecPatternAvailability;
  updateConfig: (change: Partial<SectionConfig>) => void;
  toggle: (values: string[], id: string) => string[];
  minorSplitEnabled: boolean;
  allowedSplitCourseIds: ReadonlySet<string>;
}) {
  const lectureLabSplit = config.splitCourseIds.includes(course.id);
  const gecSplit = config.gecSplitCourseIds.includes(course.id);
  const gecPattern = config.gecSplitPatternsByCourseId[course.id] ?? "MW";
  const gecPatternsFull = Boolean(patternAvailability?.MW.full && patternAvailability?.TTh.full);
  const toggleLectureLabSplit = () => updateConfig({ splitCourseIds: toggle(config.splitCourseIds, course.id) });
  const toggleGecSplit = () => {
    if (gecPatternsFull) return;
    updateConfig({ gecSplitCourseIds: toggle(config.gecSplitCourseIds, course.id) });
  };
  const preference = displayPreferenceValue(config.preferencesByCourseId[course.id] ?? "automatic");
  const updatePreference = (value: SchedulingPreference) => updateConfig({
    preferencesByCourseId: {
      ...config.preferencesByCourseId,
      [course.id]: value,
    },
  });
  const splitSessionAllowed = minorSplitEnabled && isMinorCourse(course) && allowedSplitCourseIds.has(course.id);
  const hasSplitOption = course.labHours > 0 || splitSessionAllowed;

  return (
    <div className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-1.5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
        <div className="grid min-w-0 flex-1 gap-2">
          {course.labHours > 0 && (
            <button
              type="button"
              onClick={toggleLectureLabSplit}
              className={`flex w-full items-start gap-2 rounded-md border p-2 text-left transition ${
                lectureLabSplit
                  ? "border-[#4e0a10] bg-[#4e0a10]/5 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={lectureLabSplit}
            >
              <input type="checkbox" checked={lectureLabSplit} readOnly className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#4e0a10]" />
              <span className="min-w-0">
                <span className="block text-xs font-black text-slate-900">Hybrid</span>
                <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">Online lecture plus on-site laboratory.</span>
              </span>
            </button>
          )}
          {splitSessionAllowed && (
            <div className={`rounded-md border p-2 transition ${gecSplit ? "border-[#4e0a10] bg-[#4e0a10]/5 shadow-sm" : "border-slate-200 bg-white"}`}>
              <div
                role="button"
                tabIndex={gecPatternsFull ? -1 : 0}
                onClick={toggleGecSplit}
                onKeyDown={(event) => {
                  if (gecPatternsFull) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleGecSplit();
                  }
                }}
                aria-disabled={gecPatternsFull}
                aria-pressed={gecSplit}
                className={`flex items-start gap-3 ${gecPatternsFull ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <input type="checkbox" checked={gecSplit} disabled={gecPatternsFull} readOnly className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#4e0a10] disabled:cursor-not-allowed" />
                <span className="min-w-0">
                  <span className="block text-xs font-black text-slate-900">Split Session</span>
                  <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">Two meetings in a week using an MW or TTh pattern.</span>
                </span>
              </div>
              {gecPatternsFull && <p className="mt-2 text-[11px] font-bold text-rose-600">MW and TTh meeting patterns are full.</p>}
              {gecSplit && (
                <label className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Meeting days
                  <select
                    value={gecPattern}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => updateConfig({
                      gecSplitPatternsByCourseId: {
                        ...config.gecSplitPatternsByCourseId,
                        [course.id]: event.target.value as GecSplitPattern,
                      },
                    })}
                    className="h-8 w-[120px] rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-slate-800"
                  >
                    <option value="MW" disabled={patternAvailability?.MW.full}>MW{patternAvailability?.MW.full ? " - full" : ""}</option>
                    <option value="TTh" disabled={patternAvailability?.TTh.full}>TTh{patternAvailability?.TTh.full ? " - full" : ""}</option>
                    {gecPattern === "auto" && <option value="auto" disabled>Generator picks</option>}
                  </select>
                </label>
              )}
            </div>
          )}
          {!hasSplitOption && (
            <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
              <span className="block text-xs font-black text-slate-900">Standard meeting</span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">Keep this subject in one regular meeting block.</span>
            </div>
          )}
        </div>
        <label className="w-full shrink-0 rounded-md border border-slate-200 bg-white p-2 text-[10px] font-black uppercase tracking-wide text-slate-500 sm:w-[150px]">
          Preferred time
          <select
            value={preference}
            onChange={(event) => updatePreference(event.target.value as SchedulingPreference)}
            className="mt-1.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-slate-800"
          >
            {configurablePreferenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

function SectionRecommendationCard({
  activeSection,
  courses,
  config,
  patternAvailabilityBySectionCourseKey,
  activeSectionId,
  minorSplitEnabled,
  allowedSplitCourseIds,
}: {
  activeSection?: Section;
  courses: Course[];
  config: SectionConfig;
  patternAvailabilityBySectionCourseKey: Map<string, GecPatternAvailability>;
  activeSectionId: string;
  minorSplitEnabled: boolean;
  allowedSplitCourseIds: ReadonlySet<string>;
}) {
  const minorCourses = minorSplitEnabled ? courses.filter((course) => isMinorCourse(course) && allowedSplitCourseIds.has(course.id)) : [];
  const labCourses = courses.filter((c) => c.labHours > 0);
  const splitGecCount = config.gecSplitCourseIds.length;
  const splitLabCount = config.splitCourseIds.length;

  let mwAvailableCount = 0;
  let tthAvailableCount = 0;

  for (const minorCourse of minorCourses) {
    const avail = patternAvailabilityBySectionCourseKey.get(`${activeSectionId}:${minorCourse.id}`);
    if (avail) {
      if (!avail.MW.full) mwAvailableCount++;
      if (!avail.TTh.full) tthAvailableCount++;
    }
  }

  const hasFullSelectedGec = config.gecSplitCourseIds.some((courseId) => {
    const pattern = fixedGecPattern(config.gecSplitPatternsByCourseId[courseId] ?? "MW");
    if (!pattern) return false;
    return patternAvailabilityBySectionCourseKey.get(`${activeSectionId}:${courseId}`)?.[pattern]?.full ?? false;
  });

  return (
    <div className="rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50 p-2.5 shadow-2xs">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10] text-amber-300 shadow-2xs">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#4e0a10]">
              Scheduling Recommendations · {activeSection?.name ?? "Selected Section"}
            </h4>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" /> Conflict-Free Auto-Fallback
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
            {minorCourses.length > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 shadow-2xs">
                <span className="font-bold text-slate-900">Minor Split Availability:</span>
                {mwAvailableCount > 0 && tthAvailableCount > 0 ? (
                  <span className="font-bold text-emerald-700">MW and TTh Available</span>
                ) : mwAvailableCount > 0 ? (
                  <span className="font-bold text-emerald-700">MW Available</span>
                ) : tthAvailableCount > 0 ? (
                  <span className="font-bold text-emerald-700">TTh Available</span>
                ) : (
                  <span className="font-bold text-amber-700">Patterns Congested (Single 3h / Online Fallback Ready)</span>
                )}
                {splitGecCount > 0 && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                    {splitGecCount} Split
                  </span>
                )}
              </div>
            )}

            {labCourses.length > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 shadow-2xs">
                <span className="font-bold text-slate-900">Laboratory Split:</span>
                <span>{labCourses.length} Lab Course{labCourses.length > 1 ? "s" : ""}</span>
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-black text-[#4e0a10]">
                  {splitLabCount}/{labCourses.length} Split
                </span>
              </div>
            )}

            {hasFullSelectedGec && (
              <div className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                <span>Selected pattern is full; solver will automatically recommend an alternative vacant day or single session.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getGecPatternAvailability({
  course,
  rooms,
  existingSchedules,
  excludedSectionIds,
  departmentId,
  termId,
  reservations = [],
}: {
  course: Course;
  rooms: ApiRoomRecord[];
  existingSchedules: ScheduleItem[];
  excludedSectionIds: Set<string>;
  departmentId: number | null;
  termId: number | string | null;
  reservations?: GecPatternReservation[];
}): GecPatternAvailability {
  return {
    MW: {
      full: !hasCapacityForPattern("MW", ["Monday", "Wednesday"], course, rooms, existingSchedules, excludedSectionIds, departmentId, termId, reservations),
      label: "MW",
    },
    TTh: {
      full: !hasCapacityForPattern("TTh", ["Tuesday", "Thursday"], course, rooms, existingSchedules, excludedSectionIds, departmentId, termId, reservations),
      label: "TTh",
    },
  };
}

function hasCapacityForPattern(
  pattern: FixedGecSplitPattern,
  days: string[],
  course: Course,
  rooms: ApiRoomRecord[],
  existingSchedules: ScheduleItem[],
  excludedSectionIds: Set<string>,
  departmentId: number | null,
  termId: number | string | null,
  reservations: GecPatternReservation[],
): boolean {
  const requiredSlots = Math.max(1, Math.ceil((courseHours(course) * 2) / days.length));
  const compatibleRooms = rooms.filter((room) =>
    room.status === "available"
    && room.room_type === "lecture"
    && (room.department_id === null || departmentId === null || Number(room.department_id) === Number(departmentId))
  );

  if (compatibleRooms.length === 0) return false;

  return days.every((day) => hasRoomCapacityForDay(
    compatibleRooms,
    day,
    requiredSlots,
    existingSchedules,
    excludedSectionIds,
    termId,
    reservations.filter((reservation) => reservation.pattern === pattern),
  ));
}

function buildGecPatternReservations(
  configs: Record<string, SectionConfig>,
  courses: Course[],
  currentSectionId: string,
  currentCourseId: string,
): GecPatternReservation[] {
  const courseById = new Map(courses.map((course) => [String(course.id), course]));
  const reservations: GecPatternReservation[] = [];

  for (const [sectionId, config] of Object.entries(configs)) {
    for (const courseId of config.gecSplitCourseIds) {
      if (sectionId === currentSectionId && String(courseId) === String(currentCourseId)) {
        continue;
      }

      const course = courseById.get(String(courseId));
      if (!course || !isMinorCourse(course)) {
        continue;
      }

      const pattern = fixedGecPattern(config.gecSplitPatternsByCourseId[courseId] ?? "MW");
      if (!pattern) {
        continue;
      }

      reservations.push({
        sectionId,
        courseId: String(courseId),
        pattern,
        requiredSlots: Math.max(1, Math.ceil((courseHours(course) * 2) / 2)),
      });
    }
  }

  return reservations;
}

function hasRoomCapacityForDay(
  rooms: ApiRoomRecord[],
  day: string,
  requiredSlots: number,
  existingSchedules: ScheduleItem[],
  excludedSectionIds: Set<string>,
  termId: number | string | null,
  reservations: GecPatternReservation[],
): boolean {
  const occupiedByRoom = new Map<string, Array<{ start: number; end: number }>>();

  for (const room of rooms) {
    const occupied = existingSchedules
      .filter((schedule) =>
        String(schedule.roomId) === String(room.id)
        && schedule.day === day
        && schedule.mode !== "online"
        && schedule.mode !== "field"
        && !excludedSectionIds.has(String(schedule.sectionId))
        && (termId === null || Number(schedule.termId) === Number(termId))
      )
      .map((schedule) => ({
        start: Number.isFinite(schedule.startSlot) ? schedule.startSlot : timeToSlot(schedule.startTime),
        end: (Number.isFinite(schedule.startSlot) ? schedule.startSlot : timeToSlot(schedule.startTime)) + Math.max(1, schedule.durationSlots || timeRangeToSlots(schedule.startTime, schedule.endTime)),
      }))
      .sort((left, right) => left.start - right.start);

    occupiedByRoom.set(String(room.id), occupied);
  }

  for (const reservation of reservations) {
    if (!reserveFirstAvailableRoomBlock(rooms, occupiedByRoom, reservation.requiredSlots)) {
      return false;
    }
  }

  return reserveFirstAvailableRoomBlock(rooms, occupiedByRoom, requiredSlots);
}

function reserveFirstAvailableRoomBlock(
  rooms: ApiRoomRecord[],
  occupiedByRoom: Map<string, Array<{ start: number; end: number }>>,
  requiredSlots: number,
): boolean {
  for (let start = 0; start <= 24 - requiredSlots; start++) {
    const end = start + requiredSlots;

    for (const room of rooms) {
      const roomId = String(room.id);
      const occupied = occupiedByRoom.get(roomId) ?? [];
      const overlaps = occupied.some((block) => start < block.end && block.start < end);
      if (!overlaps) {
        occupied.push({ start, end });
        occupied.sort((left, right) => left.start - right.start);
        occupiedByRoom.set(roomId, occupied);

        return true;
      }
    }
  }

  return false;
}

function timeRangeToSlots(startTime: string, endTime: string): number {
  return Math.max(1, timeToSlot(endTime) - timeToSlot(startTime));
}

function RedesignedReviewStep({ activeTerm, sections, courses, configs, activeRules, allowedSplitCourseCount, onEditScope, onEditConfiguration, onEditCourses }: { activeTerm: Term | null; sections: Section[]; courses: Course[]; configs: Record<string, SectionConfig>; activeRules: string[]; allowedSplitCourseCount: number; onEditScope: () => void; onEditConfiguration: () => void; onEditCourses: () => void }) {
  const totalCourses = sections.reduce((sum, section) => sum + (configs[section.id]?.courseIds.length ?? 0), 0);
  const lectureLabSplits = sections.reduce((sum, section) => sum + (configs[section.id]?.splitCourseIds.length ?? 0), 0);
  const minorSplits = sections.reduce((sum, section) => sum + (configs[section.id]?.gecSplitCourseIds.length ?? 0), 0);
  const totalSessions = totalCourses + lectureLabSplits + minorSplits;
  const reviewRows = sections.map((section) => {
    const config = configs[section.id];
    const selectedCourses = config?.courseIds.length ?? 0;
    const splits = (config?.splitCourseIds.length ?? 0) + (config?.gecSplitCourseIds.length ?? 0);
    return { section, selectedCourses, sessions: selectedCourses + splits };
  });
  const metrics = [
    { label: "Sections", value: sections.length, note: "All sections included", icon: Users, tone: "emerald" },
    { label: "Courses", value: totalCourses || courses.length * sections.length, note: "Total courses to schedule", icon: BookOpen, tone: "blue" },
    { label: "Sessions", value: totalSessions, note: "Estimated total sessions", icon: CalendarDays, tone: "violet" },
    { label: "Active Rules", value: activeRules.length, note: "Constraints in effect", icon: ShieldCheck, tone: "amber" },
  ] as const;
  const toneClasses = { emerald: "bg-emerald-50 text-emerald-600", blue: "bg-blue-50 text-blue-600", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600" } as const;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto px-1 py-1">
      <section className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-6 w-6" strokeWidth={3} /></span><div className="min-w-0"><h3 className="text-base font-black text-slate-950">Ready to Generate</h3><p className="mt-0.5 text-xs font-semibold text-slate-600">All checks pass. You are set to generate a preview for every section in this year level.</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-600"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {formatTerm(activeTerm)}</span><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {yearLabel(Number(sections[0]?.yearLevel ?? 1))}</span></div></div></div>
          <div className="flex flex-wrap gap-1.5"><button type="button" onClick={onEditScope} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Edit Scope</button><button type="button" onClick={onEditConfiguration} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Edit Configuration</button><button type="button" onClick={onEditCourses} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Edit Courses</button></div>
        </div>
      </section>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">{metrics.map((metric) => { const Icon = metric.icon; return <div key={metric.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${toneClasses[metric.tone]}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xl font-black leading-none text-slate-950">{metric.value}</p><p className="mt-0.5 text-[11px] font-black text-slate-800">{metric.label}</p><p className="truncate text-[10px] font-semibold text-slate-500">{metric.note}</p></div></div>; })}</div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[1fr_1.05fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-2 flex items-center gap-2"><span className="rounded-lg bg-blue-50 p-1.5 text-blue-600"><SlidersHorizontal className="h-4 w-4" /></span><h4 className="text-sm font-black text-slate-950">Course Placement</h4></div><div className="divide-y divide-slate-100"><div className="flex items-center justify-between py-2"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className="rounded-full bg-emerald-50 p-1.5 text-emerald-600"><FlaskConical className="h-4 w-4" /></span>Hybrid Courses</span><span className="text-xs font-black text-emerald-700">{lectureLabSplits} courses</span></div><div className="flex items-center justify-between py-2"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className="rounded-full bg-blue-50 p-1.5 text-blue-600"><BookOpen className="h-4 w-4" /></span>Minor Course Splits</span><span className="text-xs font-black text-emerald-700">{minorSplits} courses</span></div><div className="flex items-center justify-between py-2"><span className="text-xs font-bold text-slate-700">Allowed Split Sessions</span><span className="text-xs font-black text-emerald-700">{allowedSplitCourseCount} courses</span></div></div><div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{lectureLabSplits + minorSplits > 0 ? `${lectureLabSplits + minorSplits} courses use split scheduling.` : "No courses require split scheduling."}</div></section>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5"><div className="flex items-center gap-2"><span className="rounded-lg bg-blue-50 p-1.5 text-blue-600"><Users className="h-4 w-4" /></span><h4 className="text-sm font-black text-slate-950">Section Readiness</h4></div><span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">{sections.length} of {sections.length} Ready</span></div>
          <div className="min-h-0 flex-1 overflow-y-auto">{reviewRows.map((row) => <div key={row.section.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs"><span className="flex min-w-0 items-center gap-2 font-black text-slate-800"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /><span className="truncate">{row.section.name}</span></span><span className="shrink-0 text-slate-600">{row.selectedCourses} courses <span className="mx-2 text-slate-300">|</span> {row.sessions} sessions</span></div>)}</div>
        </section>
      </div>
    </div>
  );
}

function GenerateStep({
  preview,
  sections,
  courses,
  activeTerm,
  activeRules,
  roomCodeById,
  generating,
  applying,
  generate,
  apply,
  failure,
  appliedNotice,
  onApplyAndRetry,
  onReviewConstraints,
  onDismissFailure,
  onDismissNotice,
}: {
  preview: ApiScheduleRecord[];
  sections: Section[];
  courses: Course[];
  activeTerm: Term | null;
  activeRules: string[];
  roomCodeById: Map<string, string>;
  generating: boolean;
  applying: boolean;
  generate: () => void;
  apply: () => void;
  failure: YearLevelGenerationFailure | null;
  appliedNotice: { strategy: AppliedStrategy; adjustments: GenerationAdjustment[] } | null;
  onApplyAndRetry: (recommendation: GenerationRecommendation) => void;
  onReviewConstraints: (sectionId: number | null) => void;
  onDismissFailure: () => void;
  onDismissNotice: () => void;
}) {
  const hasPreview = preview.length > 0;
  const showFailure = !hasPreview && failure !== null && !generating;
  const [activeTimelineIndex, setActiveTimelineIndex] = useState(0);
  const [selectedPreviewSectionId, setSelectedPreviewSectionId] = useState("");
  const [previewView, setPreviewView] = useState<"list" | "grid">("list");
  const timeline = ["Loading subjects", "Finding available time slots", "Finding available rooms", "Checking conflicts", "Finalizing timetable"];
  const sectionNameById = useMemo(() => new Map(sections.map((section) => [String(section.id), section.name])), [sections]);
  const courseById = useMemo(() => new Map(courses.map((course) => [String(course.id), course])), [courses]);
  const groupedPreviewRows = useMemo(
    () => groupPreviewRows(preview, sectionNameById, courseById, roomCodeById)
      .filter((row) => row.sectionId === selectedPreviewSectionId),
    [courseById, preview, roomCodeById, sectionNameById, selectedPreviewSectionId],
  );
  const selectedPreviewRows = useMemo(
    () => preview.filter((row) => String(row.section_id) === selectedPreviewSectionId),
    [preview, selectedPreviewSectionId],
  );
  const uniquePreviewCourseCount = useMemo(() => new Set(preview.map((row) => String(row.course_id ?? row.subject_id))).size, [preview]);
  const selectedRoomCount = useMemo(() => new Set(selectedPreviewRows.map((row) => row.room_id).filter((roomId) => roomId !== null)).size, [selectedPreviewRows]);

  useEffect(() => {
    if (!selectedPreviewSectionId || !sections.some((section) => String(section.id) === selectedPreviewSectionId)) {
      setSelectedPreviewSectionId(String(sections[0]?.id ?? ""));
    }
  }, [sections, selectedPreviewSectionId]);

  useEffect(() => {
    if (!generating) {
      setActiveTimelineIndex(0);
      return;
    }

    setActiveTimelineIndex(0);
    const timer = window.setInterval(() => {
      setActiveTimelineIndex((current) => (current + 1) % timeline.length);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [generating, hasPreview, timeline.length]);

  const exportSchedule = () => {
    const headers = ["Section", "Course", "Room", "Schedule", "Time", "Mode"];
    const rows = groupedPreviewRows.map((row) => [
      row.sectionName,
      row.courseLabel,
      row.roomLabel,
      row.scheduleLabel,
      row.timeLabel,
      row.modeLabel,
    ]);
    const csv = [headers, ...rows].map((values) => values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "year-level-generated-timetable.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showFailure && failure && (
        <RecommendedAdjustmentPanel
          failure={failure}
          busy={generating || applying}
          onApplyAndRetry={onApplyAndRetry}
          onReviewConstraints={onReviewConstraints}
          onCancel={onDismissFailure}
        />
      )}

      {!hasPreview && !showFailure && (
        <GenerationTimeline
          steps={timeline}
          activeIndex={activeTimelineIndex}
          running={generating}
          activeTerm={activeTerm}
          sections={sections}
          courseCount={courses.length * sections.length}
          roomCount={roomCodeById.size}
          activeRuleCount={activeRules.length}
          onGenerate={generate}
        />
      )}

      {hasPreview && appliedNotice && (
        <AppliedAdjustmentNotice
          strategy={appliedNotice.strategy}
          adjustments={appliedNotice.adjustments}
          onDismiss={onDismissNotice}
        />
      )}

      {hasPreview && (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div><h4 className="text-xl font-black text-slate-950">Generated Schedule Preview</h4><p className="mt-1 text-xs font-semibold text-slate-500">Review the generated timetable, switch between sections, and export or regenerate if needed.</p></div>
            <div className="flex gap-2">
              <button type="button" onClick={apply} disabled={applying} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {applying ? <LoadingSpinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                Save & View Timetable
              </button>
              <button type="button" onClick={exportSchedule} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                <Download className="h-4 w-4" /> Export Schedule
              </button>
              <button type="button" onClick={generate} disabled={generating || applying} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className="h-4 w-4" /> Regenerate
              </button>
            </div>
          </div>
          <div className="mt-3 grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-4"><PreviewSummaryMetric icon={Users} label="Sections" value={sections.length} tone="blue" /><PreviewSummaryMetric icon={BookOpen} label="Courses" value={uniquePreviewCourseCount} tone="green" /><PreviewSummaryMetric icon={CalendarDays} label="Scheduled Sessions" value={preview.length} tone="violet" /><PreviewSummaryMetric icon={ShieldCheck} label="Status" value="No Conflicts" tone="green" /></div>
          <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              {sections.map((section) => (
                <button key={section.id} type="button" onClick={() => setSelectedPreviewSectionId(String(section.id))} className={`rounded-lg border px-3 py-1.5 text-xs font-black ${selectedPreviewSectionId === String(section.id) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  {section.name}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button type="button" onClick={() => setPreviewView("list")} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black ${previewView === "list" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button type="button" onClick={() => setPreviewView("grid")} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black ${previewView === "grid" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <LayoutGrid className="h-3.5 w-3.5" /> Grid
              </button>
            </div>
          </div>
          <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs font-semibold text-slate-600"><span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-600" /> {selectedPreviewRows.length} scheduled sessions</span><span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /> {selectedRoomCount} rooms used</span><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /> 0 conflicts detected</span></div>
          <div className="mt-2 min-h-0 min-h-[18rem] flex-1 overflow-hidden">
            {previewView === "list" ? (
              <SchedulePreviewList rows={groupedPreviewRows} />
            ) : (
              <SchedulePreviewGrid rows={selectedPreviewRows} courseById={courseById} roomCodeById={roomCodeById} />
            )}
          </div>
          <div className="mt-3 flex shrink-0 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-[11px] font-semibold text-slate-600"><AlertCircle className="h-4 w-4 shrink-0 text-blue-600" /> Please review the generated timetable above. You can switch sections, view the full timetable, export the schedule, or regenerate before finalizing.</div>
        </section>
      )}
    </div>
  );
}

function PreviewSummaryMetric({ icon: Icon, label, value, tone }: { icon: typeof BookOpen; label: string; value: number | string; tone: "blue" | "green" | "violet" }) {
  const colors = { blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600" };
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-xl font-black text-slate-950">{value}</span><span className="block truncate text-[11px] font-bold text-slate-500">{label}</span></span></div>;
}

function GenerationTimeline({ steps, activeIndex, running, activeTerm, sections, courseCount, roomCount, activeRuleCount, onGenerate }: { steps: string[]; activeIndex: number; running: boolean; activeTerm: Term | null; sections: Section[]; courseCount: number; roomCount: number; activeRuleCount: number; onGenerate: () => void }) {
  const descriptions = ["Prepare and validate subject data", "Build feasible time-slot combinations", "Match rooms to course requirements", "Check the timetable against active rules", "Prepare the preview for your review"];
  const semesterLabel = activeTerm?.semester === "1st" ? "1st Semester" : activeTerm?.semester === "2nd" ? "2nd Semester" : "Summer";
  const yearLevel = Number(sections[0]?.yearLevel ?? 1);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <GenerationInfoCard icon={CalendarDays} label="Academic year" value={`AY ${activeTerm?.academic_year ?? "Not selected"}`} />
        <GenerationInfoCard icon={BookOpen} label="Semester" value={semesterLabel} />
        <GenerationInfoCard icon={Users} label="Year level" value={yearLabel(yearLevel)} />
        <GenerationInfoCard icon={Layers} label="Sections" value={sections.length} />
        <GenerationInfoCard icon={BookOpen} label="Courses" value={courseCount} />
      </div>
      <div className="mt-2 grid min-h-0 flex-1">
        <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><h4 className="text-base font-black text-slate-950">Generation Status</h4><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black ${running ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{running ? "Processing" : "Ready"}</span></div><div className="flex flex-1 flex-col items-center justify-center py-3 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-700">{running ? <LoadingSpinner size={48} label="Generating" /> : <Clock3 className="h-8 w-8" />}</span><h4 className="mt-2 text-xl font-black text-slate-950">{running ? steps[activeIndex] : "Ready to generate"}</h4><p className="mt-1 max-w-lg text-xs font-semibold leading-5 text-slate-600">{running ? descriptions[activeIndex] : "Start generation when you are ready. The status will continue updating until the timetable is ready."}</p><button type="button" onClick={onGenerate} disabled={running} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#7a0008] px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-[#90000a] disabled:cursor-not-allowed disabled:opacity-70"><Play className="h-4 w-4" />{running ? "Generating" : "Generate Schedule"}</button></div><div className="flex items-center gap-3"><div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">{running && <div className="absolute h-full w-1/3 rounded-full bg-[#7a121c] animate-indeterminate" />}</div><span className="text-xs font-black text-slate-600">{running ? "Working..." : "Ready"}</span></div><div className="mt-3 grid grid-cols-3 gap-2"><GenerationMetric icon={BookOpen} label="Courses" value={courseCount} tone="blue" /><GenerationMetric icon={Building2} label="Rooms Available" value={roomCount} tone="emerald" /><GenerationMetric icon={ShieldCheck} label="Active Rules" value={activeRuleCount} tone="violet" /></div></section>
      </div>
      <section className="mt-2 shrink-0 rounded-xl border border-slate-200 px-3 py-3"><div className="grid gap-3 md:grid-cols-[auto_repeat(3,minmax(0,1fr))] md:items-center"><h4 className="text-sm font-black text-slate-950">What happens next</h4><GenerationNextStep icon={CalendarDays} number={1} title="Generate preview" text="Create a timetable preview." /><GenerationNextStep icon={List} number={2} title="Review" text="Check rooms and conflicts." /><GenerationNextStep icon={Download} number={3} title="Save as draft" text="Apply when satisfied." /></div></section>
    </div>
  );
}

function GenerationInfoCard({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number | string }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-[#7a121c]"><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><span className="block truncate text-sm font-black text-slate-950">{value}</span></span></div>;
}

function GenerationMetric({ icon: Icon, label, value, tone }: { icon: typeof BookOpen; label: string; value: number; tone: "blue" | "emerald" | "violet" }) {
  const colors = { blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600" };
  return <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 p-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-500">{label}</span><span className="block text-xl font-black text-slate-950">{value}</span></span></div>;
}

function GenerationNextStep({ icon: Icon, number, title, text }: { icon: typeof BookOpen; number: number; title: string; text: string }) {
  return <div className="flex items-start gap-3 md:border-r md:border-slate-200 md:pr-3 last:border-r-0"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#7a121c] text-[#7a121c]"><Icon className="h-5 w-5" /></span><span><span className="text-xs font-black text-slate-900">{number}. {title}</span><span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-600">{text}</span></span></div>;
}

function SchedulePreviewList({ rows }: { rows: GroupedPreviewRow[] }) {
  const columns = useMemo<ColumnDef<GroupedPreviewRow>[]>(() => [
    {
      accessorKey: "courseLabel",
      header: "Course",
      cell: ({ row }) => (
        <span className="block max-w-[28rem] whitespace-normal break-words font-black leading-snug text-slate-700">{row.original.courseLabel}</span>
      ),
    },
    {
      accessorKey: "roomLabel",
      header: "Room",
      cell: ({ row }) => (
        <span className="block whitespace-normal break-words font-bold leading-snug text-slate-700">{row.original.roomLabel}</span>
      ),
    },
    {
      accessorKey: "scheduleLabel",
      header: "Schedule",
      cell: ({ row }) => (
        <span className="block whitespace-normal font-black leading-snug text-slate-700">{row.original.scheduleLabel}</span>
      ),
    },
    {
      accessorKey: "timeLabel",
      header: "Time",
      cell: ({ row }) => (
        <span className="block whitespace-normal font-black leading-snug text-slate-700">{row.original.timeLabel}</span>
      ),
    },
    {
      accessorKey: "modeLabel",
      header: "Mode",
      cell: ({ row }) => (
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
          {row.original.modeLabel}
        </span>
      ),
    },
  ], []);
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="h-full min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
        <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[37%]" />
          <col className="w-[14%]" />
          <col className="w-[17%]" />
          <col className="w-[22%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`border-b border-slate-200 px-3 py-1.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-500 ${header.column.id === "modeLabel" ? "text-right" : ""}`}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.original.key} className="border-b border-slate-100 last:border-b-0">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`align-top px-3 py-2 text-sm ${cell.column.id === "modeLabel" ? "text-right" : ""}`}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-3 text-center text-sm font-semibold text-slate-500">No generated schedules for this section.</div>
        )}
      </div>
    </div>
  );
}

function SchedulePreviewGrid({ rows, courseById, roomCodeById }: { rows: ApiScheduleRecord[]; courseById: Map<string, Course>; roomCodeById: Map<string, string> }) {
  const totalSlots = 24;
  const daySessionCounts = DAYS.map((_, dayIdx) => rows.filter((row) => dayIndex(row.day) === dayIdx).length);

  return (
    <div className="h-full min-h-[360px] rounded-xl border border-slate-200 bg-white p-2">
      <WeeklyTimetableGrid
        days={DAYS}
        slotCount={totalSlots}
        headerHeight={GRID_HEADER_HEIGHT_PX}
        timeColumnWidth={62}
        minWidth={0}
        rowTemplate={`repeat(${totalSlots}, minmax(0, 1fr))`}
        className="h-full"
        getTimeLabel={slotToTimeStr}
        getDayCount={(dayIndex) => daySessionCounts[dayIndex]}
      >
        {rows.map((row, index) => {
          const start = timeToSlot(row.start_time);
          const end = timeToSlot(row.end_time);
          const duration = Math.max(1, end - start);
          const day = dayIndex(row.day);
          const mode = row.mode ?? "on-site";
          const course = courseById.get(String(row.course_id ?? row.subject_id));
          const isMajor = getPreviewCourseCategory(row, course) === "major";
          const meetingType = row.meeting_type ?? null;
          const isLab = meetingType === "laboratory";
          const roomCode = mode !== "online" && mode !== "field" ? getPreviewRoomCode(row, roomCodeById) : null;
          const modeLabel = mode === "on-site"
            ? isLab ? "On-Site LAB" : "On-Site"
            : mode === "online"
              ? isLab ? "Online LAB" : "Online"
              : "Field";

          if (day < 0 || day > 6) return null;

          return (
            <div
              key={`${row.section_id}-${row.course_id ?? row.subject_id}-${row.day}-${row.start_time}-${index}`}
              className={`z-10 m-0.5 overflow-hidden rounded-lg border-2 border-l-4 px-2 py-1 shadow-sm ${isMajor ? "border-rose-100/80 border-l-[#4e0a10] bg-rose-50/95" : "border-amber-100/80 border-l-[#c9952a] bg-amber-50/95"}`}
              style={{
                gridColumn: day + 2,
                gridRow: `${start + 2} / span ${duration}`,
              }}
              title={`${displayCourseLabel(row, courseById)} ${formatTimeRange(row.start_time.slice(0, 5), row.end_time.slice(0, 5))}`}
            >
              <div className="flex h-full min-w-0 flex-col justify-between">
                <div className="flex min-w-0 items-start justify-between gap-1">
                  <span className={`min-w-0 flex-1 break-words text-[10px] font-black uppercase leading-tight tracking-tight ${isMajor ? "text-[#4e0a10]" : "text-amber-900"}`}>
                    {displayCourseCode(row, courseById)}
                  </span>
                  <span className={`max-w-[58%] rounded px-1 py-0.5 text-right text-[7px] font-bold uppercase leading-tight ${isLab ? "bg-amber-100 text-amber-800" : mode === "online" ? "bg-emerald-50 text-emerald-700" : mode === "field" ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-700"}`}>
                    {modeLabel}
                  </span>
                </div>
                {duration > 2 && roomCode && (
                  <div className="break-words text-[9px] font-semibold leading-tight text-slate-600">
                    {roomCode}
                  </div>
                )}
                <div className="break-words text-[8.5px] font-medium leading-tight text-slate-500">
                  {formatTimeRange(row.start_time.slice(0, 5), row.end_time.slice(0, 5))}
                </div>
              </div>
            </div>
          );
        })}
      </WeeklyTimetableGrid>
      {rows.length === 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm font-semibold text-slate-500">
          No generated schedules for this section.
        </div>
      )}
    </div>
  );
}

function displaySectionName(row: ApiScheduleRecord, sectionNameById: Map<string, string>): string {
  return row.section?.section_name
    ?? sectionNameById.get(String(row.section_id))
    ?? `Section ${row.section_id}`;
}

function displayCourseCode(row: ApiScheduleRecord, courseById: Map<string, Course>): string {
  const courseId = String(row.course_id ?? row.subject_id);
  return row.course?.course_code
    ?? row.subject?.subject_code
    ?? courseById.get(courseId)?.code
    ?? `Course ${courseId}`;
}

function displayCourseLabel(row: ApiScheduleRecord, courseById: Map<string, Course>): string {
  const courseId = String(row.course_id ?? row.subject_id);
  const course = courseById.get(courseId);
  const code = row.course?.course_code ?? row.subject?.subject_code ?? course?.code;
  const name = row.course?.course_name ?? row.subject?.subject_name ?? course?.name;

  if (code && name) {
    return `${code} - ${name}`;
  }

  return code ?? name ?? `Course ${courseId}`;
}

function getPreviewRoomCode(row: ApiScheduleRecord, roomCodeById: Map<string, string>): string | null {
  const extended = row as ApiScheduleRecord & {
    room_code?: string | null;
    room_name?: string | null;
    room?: { room_code?: string | null; name?: string | null } | null;
  };

  return extended.room?.room_code
    ?? extended.room_code
    ?? roomCodeById.get(String(row.room_id))
    ?? null;
}

function getPreviewCourseCategory(row: ApiScheduleRecord, course?: Course): Course["category"] {
  const category = row.course?.course_category
    ?? row.subject?.course_category
    ?? row.course?.subject_category
    ?? row.subject?.subject_category
    ?? course?.category;

  if (category === "major" || category === "minor") {
    return category;
  }

  const hasMajorCategory = [
    ...(row.course?.categories ?? []),
    ...(row.subject?.categories ?? []),
    ...(course?.categories ?? []),
  ].some((item) => item.name.toLowerCase() === "major");

  return hasMajorCategory ? "major" : "minor";
}

type GroupedPreviewRow = {
  key: string;
  sectionId: string;
  sectionName: string;
  courseLabel: string;
  roomLabel: string;
  scheduleLabel: string;
  timeLabel: string;
  modeLabel: string;
};

function groupPreviewRows(preview: ApiScheduleRecord[], sectionNameById: Map<string, string>, courseById: Map<string, Course>, roomCodeById: Map<string, string>): GroupedPreviewRow[] {
  const groups = new Map<string, ApiScheduleRecord[]>();

  for (const row of preview) {
    const sectionId = String(row.section_id);
    const courseId = String(row.course_id ?? row.subject_id);
    const key = `${sectionId}:${courseId}:${row.split_group_id ?? courseId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.entries()).map(([key, rows]) => {
    rows.sort((a, b) => dayIndex(a.day) - dayIndex(b.day) || a.start_time.localeCompare(b.start_time));
    const first = rows[0];
    const modes = Array.from(new Set(rows.map((row) => row.mode ?? "on-site")));

    return {
      key,
      sectionId: String(first.section_id),
      sectionName: displaySectionName(first, sectionNameById),
      courseLabel: displayCourseLabel(first, courseById),
      roomLabel: formatGroupedRooms(rows, roomCodeById),
      scheduleLabel: formatGroupedDays(rows),
      timeLabel: formatGroupedTimes(rows),
      modeLabel: modes.length === 1 ? modes[0] : modes.join(" / "),
    };
  }).sort((a, b) => a.sectionName.localeCompare(b.sectionName) || a.courseLabel.localeCompare(b.courseLabel));
}

function formatGroupedDays(rows: ApiScheduleRecord[]): string {
  const blocks = rows.map((row) => ({
    day: row.day,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
  }));

  if (blocks.length === 2) {
    return blocks.map((block) => shortDay(block.day)).join("-");
  }

  return blocks.map((block) => shortDay(block.day)).join("/");
}

function formatGroupedTimes(rows: ApiScheduleRecord[]): string {
  const blocks = rows.map((row) => ({
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
  }));
  const sameTime = blocks.every((block) => block.start === blocks[0].start && block.end === blocks[0].end);

  if (sameTime) {
    return formatTimeRange(blocks[0].start, blocks[0].end);
  }

  return blocks.map((block) => formatTimeRange(block.start, block.end)).join(" | ");
}

function formatGroupedRooms(rows: ApiScheduleRecord[], roomCodeById: Map<string, string>): string {
  const labels = rows.map((row) => {
    const mode = row.mode ?? "on-site";
    if (mode === "online") return "Online";
    if (mode === "field") return getPreviewRoomCode(row, roomCodeById) ?? "Field";

    return getPreviewRoomCode(row, roomCodeById) ?? "Room TBA";
  });

  return Array.from(new Set(labels)).join(" / ");
}

function formatTimeRange(start: string, end: string): string {
  return `${formatClock(start)}-${formatClock(end)}`;
}

function formatClock(time: string): string {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute} ${period}`;
}

function timeToSlot(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return Math.max(0, Math.min(24, ((hour * 60 + minute) - (7 * 60)) / 30));
}

function shortDay(day: string): string {
  return day;
}

function dayIndex(day: string): number {
  const index = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(day);
  return index === -1 ? 99 : index;
}

function toSchedulingPreference(value: TimeBlockOption): SchedulingPreference {
  if (value === "morning" || value === "afternoon") return value;
  if (value === "flexible") return "flexible";
  return "automatic";
}

function fromSchedulingPreference(value: SchedulingPreference): TimeBlockOption {
  if (value === "morning" || value === "afternoon" || value === "flexible") return value;
  return "flexible";
}
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
