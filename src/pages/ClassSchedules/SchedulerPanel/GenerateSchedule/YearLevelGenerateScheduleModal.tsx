import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FlaskConical,
  HelpCircle,
  LayoutGrid,
  List,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";
import type { ApiRoomRecord, ApiScheduleRecord, Course, ScheduleItem, Section, Term } from "../types";
import { DAYS, GRID_HEADER_HEIGHT_PX, slotToTimeStr } from "../constants";
import SchedulingRuleEditor from "./SchedulingRuleEditor";
import type { DeliveryModeOption, TimeBlockOption } from "./useGenerateSchedule";
import WeeklyTimetableGrid from "../../../../components/scheduling/WeeklyTimetableGrid";

type Step = 1 | 2 | 3 | 4;
type CourseMode = DeliveryModeOption | "automatic";
type SchedulingPreference = "automatic" | "morning" | "afternoon" | "flexible";
type GecSplitPattern = "MW" | "TTh";

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
};

type ConstraintCourse = { id: number; code: string; name: string };
type ForcedDayRule = { course_id: number; day: string };
type ApiViolation = { rule?: string; message?: string; course_code?: string; day?: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sections: Section[];
  courses: Course[];
  activeTerm: Term | null;
  departmentId: number | null;
  existingSchedules: ScheduleItem[];
  onAccepted: (schedules?: ApiScheduleRecord[]) => void;
}

const stepNames = ["Scope & Rules", "Preferences", "Review & Summary", "Generate Timetable"];
const stepDescriptions = ["Term, year, rules", "Section setup", "Confirm scope", "Preview and save"];
const storageVersion = "v2";
const isGec = (course: Course) => course.code.toUpperCase().replace(/[^A-Z0-9]/g, "").startsWith("GEC") || (course.categories ?? []).some((category) => category.name.toLowerCase() === "gec");
const formatTerm = (term: Term | null) => term ? `${term.academic_year} - ${term.semester.toUpperCase()} Semester` : "No active term selected";
const yearLabel = (yearLevel: number) => `BSIT Year ${yearLevel}`;
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

export default function YearLevelGenerateScheduleModal({ isOpen, onClose, sections, courses, activeTerm, departmentId, existingSchedules, onAccepted }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [yearLevel, setYearLevel] = useState<number>(1);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [configs, setConfigs] = useState<Record<string, SectionConfig>>({});
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ApiScheduleRecord[]>([]);
  const [rooms, setRooms] = useState<ApiRoomRecord[]>([]);
  const [confirmedRegenerationYear, setConfirmedRegenerationYear] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const storageKey = useMemo(() => `wicars.year-level-wizard.${storageVersion}.${departmentId ?? "none"}.${activeTerm?.id ?? "none"}`, [activeTerm?.id, departmentId]);
  const departmentSections = useMemo(() => sections.filter((section) => departmentId !== null && Number(section.departmentId) === Number(departmentId)), [departmentId, sections]);
  const availableYears = useMemo(() => [...new Set(departmentSections.filter((section) => section.status === "active").map((section) => Number(section.yearLevel)))].sort(), [departmentSections]);
  const scopedSections = useMemo(() => departmentSections.filter((section) => section.status === "active" && Number(section.yearLevel) === yearLevel && (!activeTerm || Number(section.termId) === Number(activeTerm.id))), [activeTerm, departmentSections, yearLevel]);
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
    if (!isOpen) return;

    const initialYear = availableYears[0] ?? 1;
    let restored = false;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { step?: Step; yearLevel?: number; activeSectionId?: string; configs?: Record<string, SectionConfig> };
        if (parsed.yearLevel && availableYears.includes(Number(parsed.yearLevel))) {
          setYearLevel(Number(parsed.yearLevel));
          setStep(parsed.step && parsed.step >= 1 && parsed.step <= 4 ? parsed.step : 1);
          setActiveSectionId(parsed.activeSectionId ?? "");
          setConfigs(parsed.configs ?? {});
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
    }
    setPreview([]);
    setConfirmedRegenerationYear(null);
  }, [availableYears, isOpen, storageKey]);

  useEffect(() => {
    if (!isOpen || scopedSections.length === 0) return;
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
            existing?.gecSplitPatternsByCourseId?.[course.id] === "TTh" ? "TTh" : "MW",
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
  }, [isOpen, scopedCourses, scopedSections]);

  useEffect(() => {
    if (!isOpen || scopedSections.length === 0) return;
    setLoadingSettings(true);
    api.get<SettingsResponse>("/scheduling-settings", { params: { section_id: scopedSections[0].id } })
      .then((response) => setSettings(response.data))
      .catch(() => toast.error("Error", "Failed to load scheduling rules."))
      .finally(() => setLoadingSettings(false));
  }, [isOpen, scopedSections, toast]);

  useEffect(() => {
    if (!isOpen) return;
    api.get<ApiRoomRecord[]>("/rooms")
      .then((response) => setRooms(response.data ?? []))
      .catch(() => setRooms([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ step, yearLevel, activeSectionId, configs }));
  }, [activeSectionId, configs, isOpen, step, storageKey, yearLevel]);

  useEffect(() => {
    if (isOpen && requiresRegenerationConfirmation && step !== 1) {
      setStep(1);
    }
  }, [isOpen, requiresRegenerationConfirmation, step]);

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const root = document.getElementById("root");
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousRootOverflow = root?.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    if (root) {
      root.style.overflow = "hidden";
    }

    const preventBackgroundScroll = (event: WheelEvent | TouchEvent) => {
      const target = event.target;
      if (modalRef.current && target instanceof Node && !modalRef.current.contains(target)) {
        event.preventDefault();
      }
    };

    document.addEventListener("wheel", preventBackgroundScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", preventBackgroundScroll, { capture: true, passive: false });

    return () => {
      document.removeEventListener("wheel", preventBackgroundScroll, { capture: true });
      document.removeEventListener("touchmove", preventBackgroundScroll, { capture: true });
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      if (root && previousRootOverflow !== undefined) {
        root.style.overflow = previousRootOverflow;
      }
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen) return null;

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

  const generate = async () => {
    if (!activeTerm || departmentId === null) return;
    setGenerating(true);
    setPreview([]);
    try {
      const response = await api.post<{ schedules: ApiScheduleRecord[] }>("/schedule-recommendations/year-level-preview", {
        term_id: Number(activeTerm.id),
        department_id: departmentId,
        year_level: yearLevel,
        section_configs: scopedSections.map((section) => {
          const config = configs[section.id];
          return {
            section_id: Number(section.id),
            course_ids: config.courseIds.map(Number),
            selected_split_session_course_ids: config.splitCourseIds.map(Number),
            selected_gec_course_ids: config.gecSplitCourseIds.map(Number),
            preferred_patterns: Object.fromEntries(
              config.gecSplitCourseIds
                .map((id) => [id, config.gecSplitPatternsByCourseId[id] ?? "MW"] as const)
                .map(([id, pattern]) => [Number(id), pattern])
            ),
            delivery_modes_by_course_id: Object.fromEntries(Object.entries(config.modesByCourseId).filter(([, mode]) => mode !== "automatic").map(([id, mode]) => [Number(id), mode])),
          };
        }),
      }, { timeout: 150000 });
      setPreview(response.data.schedules ?? []);
    } catch (error: unknown) {
      const apiError = error as { code?: string; message?: string; response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        toast.error("Session Expired", "Please sign in again before generating schedules.");
        return;
      }
      if (apiError.code === "ECONNABORTED") {
        toast.error("Generation Timed Out", "Try again after clearing old draft schedules or reducing forced constraints.");
        return;
      }
      toast.error("Generation Unsuccessful", apiError.response?.data?.message ?? "No year-level timetable satisfies the current rules.");
    } finally {
      setGenerating(false);
    }
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
        onAccepted(response.data.schedules ?? preview);
      } catch {
        toast.error("Refresh Needed", "The timetable was saved, but the local preview could not refresh automatically.");
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
    && (step !== 2 || lockedSectionsCount === scopedSections.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-1.5 sm:p-2">
      <div ref={modalRef} className="flex h-[calc(100vh-1rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="shrink-0 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#4e0a10] to-[#3d080c] px-5 py-3 text-white">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-black uppercase tracking-wide text-[#f6d58f]">Generate Per Year Level</p>
                <HelpButton title={stepNames[step - 1]} text={helpText[step]} tone="onMaroon" />
              </div>
              <h2 className="mt-0.5 text-lg font-black text-white">{stepNames[step - 1]}</h2>
              <p className="mt-0.5 text-xs font-semibold text-white/70">Create coordinated draft schedules across all active sections.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-5 py-2">
            <YearLevelProgress step={step} />
          </div>
          <div className="mx-5 mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-1.5">
            <p className="text-xs font-semibold text-slate-500">Progress is saved automatically for this term.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={step === 1 || generating || applying} onClick={() => setStep((step - 1) as Step)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              {step < 4 && (
                <button type="button" disabled={!canContinue} onClick={() => setStep((step + 1) as Step)} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden bg-slate-50/70 p-2">
          {step === 1 && (
            <ScopeRulesStep
              activeTerm={activeTerm}
              years={availableYears}
              yearLevel={yearLevel}
              onYearChange={(value) => {
                setYearLevel(value);
                setPreview([]);
                setConfirmedRegenerationYear(null);
              }}
              existingScheduleCount={existingScheduleCountForYear}
              requiresRegenerationConfirmation={requiresRegenerationConfirmation}
              onConfirmRegeneration={() => setConfirmedRegenerationYear(yearLevel)}
              actionsDisabled={requiresRegenerationConfirmation}
              sections={scopedSections}
              settings={settings}
              setSettings={setSettings}
              loadingSettings={loadingSettings}
              activeRules={activeRules}
              sectionId={scopedSections[0]?.id ?? ""}
            />
          )}
          {step === 2 && activeConfig && (
            <PreferencesStep
              sections={scopedSections}
              courses={scopedCourses}
              activeTerm={activeTerm}
              departmentId={departmentId}
              rooms={rooms}
              existingSchedules={existingSchedules}
              activeSectionId={activeSectionId}
              setActiveSectionId={setActiveSectionId}
              config={activeConfig}
              configs={configs}
              updateConfig={updateActiveConfig}
              toggle={toggle}
              forcedDaysByCourseId={forcedDaysByCourseId}
            />
          )}
          {step === 3 && (
            <ReviewStep
              activeTerm={activeTerm}
              sections={scopedSections}
              courses={scopedCourses}
              configs={configs}
              activeRules={activeRules}
              onEditScope={() => setStep(1)}
              onEditPreferences={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <GenerateStep
              preview={preview}
              sections={scopedSections}
              courses={scopedCourses}
              roomCodeById={roomCodeById}
              generating={generating}
              applying={applying}
              generate={generate}
              apply={apply}
            />
          )}
        </main>

      </div>
    </div>
  );
}

const helpText: Record<Step, string> = {
  1: "Scope & Rules defines the term, year level, sections, and institutional rules that the generator must follow.",
  2: "Preferences let you guide the generator without manually plotting every course.",
  3: "Review the scope, preferences, and rule coverage before approving generation.",
  4: "Generate Timetable runs the scheduling algorithm, checks conflicts, and prepares draft schedules.",
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

function YearLevelProgress({ step }: { step: Step }) {
  return (
    <nav
      className="rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm"
      aria-label="Generate per year level steps"
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
              <span className={`mt-1.5 block max-w-full truncate text-xs font-black ${isCurrent || isComplete ? "text-slate-900" : "text-slate-400"}`}>
                {name}
              </span>
              <span className={`mt-0.5 block text-[10px] font-bold ${isComplete ? "text-emerald-600" : isCurrent ? "text-[#4e0a10]" : "text-slate-400"}`}>
                {isComplete ? "Completed" : isCurrent ? "In Progress" : stepDescriptions[index]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
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
  activeTerm,
  years,
  yearLevel,
  onYearChange,
  existingScheduleCount,
  requiresRegenerationConfirmation,
  onConfirmRegeneration,
  actionsDisabled,
  sections,
  settings,
  setSettings,
  loadingSettings,
  activeRules,
  sectionId,
}: {
  activeTerm: Term | null;
  years: number[];
  yearLevel: number;
  onYearChange: (value: number) => void;
  existingScheduleCount: number;
  requiresRegenerationConfirmation: boolean;
  onConfirmRegeneration: () => void;
  actionsDisabled: boolean;
  sections: Section[];
  settings: SettingsResponse | null;
  setSettings: (settings: SettingsResponse) => void;
  loadingSettings: boolean;
  activeRules: string[];
  sectionId: string;
}) {
  const { toast } = useToast();
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedForcedCourseId, setSelectedForcedCourseId] = useState("");
  const [selectedForcedDay, setSelectedForcedDay] = useState("Saturday");
  const [selectedFieldCourseCode, setSelectedFieldCourseCode] = useState("");

  const forcedDayRules = settings?.forced_day_rules ?? [];
  const forcedDayCourses = settings?.forced_day_courses ?? [];
  const fieldCourseCodes = settings?.field_course_codes ?? [];
  const fieldCourseOptions = settings?.field_course_options ?? [];
  const forcedCourseMap = new Map(forcedDayCourses.map((course) => [course.id, course]));
  const fieldCourseMap = new Map(fieldCourseOptions.map((course) => [course.code, course]));
  const availableForcedDayCourses = forcedDayCourses.filter((course) => !forcedDayRules.some((rule) => rule.course_id === course.id));
  const availableFieldCourses = fieldCourseOptions.filter((course) => !fieldCourseCodes.includes(course.code));
  const effectiveForcedCourseId = availableForcedDayCourses.some((course) => String(course.id) === selectedForcedCourseId)
    ? selectedForcedCourseId
    : String(availableForcedDayCourses[0]?.id ?? "");
  const effectiveFieldCourseCode = availableFieldCourses.some((course) => course.code === selectedFieldCourseCode)
    ? selectedFieldCourseCode
    : (availableFieldCourses[0]?.code ?? "");

  const patchSettings = async (patch: Partial<SettingsResponse>) => {
    if (!sectionId || !settings) return;
    setSavingSettings(true);
    try {
      const response = await api.patch<SettingsResponse>("/scheduling-settings", patch, {
        params: { section_id: sectionId },
      });
      setSettings(response.data);
      toast.success("Constraints saved", "Generation constraints updated for this year level.");
    } catch {
      toast.error("Save failed", "Unable to update generation constraints.");
    } finally {
      setSavingSettings(false);
    }
  };

  const addForcedDayRule = () => {
    const courseId = Number(effectiveForcedCourseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return;
    void patchSettings({
      forced_day_rules: [...forcedDayRules, { course_id: courseId, day: selectedForcedDay }],
    });
  };

  const removeForcedDayRule = (courseId: number) => {
    void patchSettings({
      forced_day_rules: forcedDayRules.filter((rule) => rule.course_id !== courseId),
    });
  };

  const addFieldCourseRule = () => {
    if (!effectiveFieldCourseCode) return;
    void patchSettings({
      field_course_assignment_enabled: true,
      field_course_codes: [...fieldCourseCodes, effectiveFieldCourseCode],
    });
  };

  const removeFieldCourseRule = (courseCode: string) => {
    void patchSettings({
      field_course_codes: fieldCourseCodes.filter((code) => code !== courseCode),
    });
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[0.52fr_1.48fr]">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#4e0a10]" />
            <h3 className="text-sm font-black text-slate-950">Generation Scope</h3>
          </div>
          <HelpButton title="Generation Scope" text="Choose the academic term and year level. All active sections under the selected year level will be generated together." />
        </div>
        <div className="grid gap-3 p-3">
          <div className="grid gap-2">
            <label className="block text-xs font-black uppercase text-slate-500">
              Academic term
              <select value={activeTerm?.id ?? ""} disabled className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold normal-case text-slate-700">
                <option>{formatTerm(activeTerm)}</option>
              </select>
            </label>
            <label className="block text-xs font-black uppercase text-slate-500">
              Year level
              <select value={yearLevel} onChange={(event) => onYearChange(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold normal-case text-slate-900">
                {years.map((year) => <option key={year} value={year}>BSIT Year {year}</option>)}
              </select>
            </label>
          </div>
          <div className="border-t border-slate-200 pt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-black uppercase text-slate-500">Selected scope</p>
              <p className="text-xs font-black text-emerald-700">{sections.length} active sections</p>
            </div>
            <p className="mt-1 text-base font-black text-slate-950">{yearLabel(yearLevel)}</p>
          </div>
          <div className="border-t border-slate-200 pt-2">
            <p className="text-xs font-black uppercase text-slate-500">Available sections</p>
            {sections.length ? (
              <p className="mt-1 text-sm font-bold leading-6 text-slate-800">{sections.map((section) => section.name).join(", ")}</p>
            ) : (
              <p className="mt-1 text-sm font-semibold text-slate-500">No active sections found for this scope.</p>
            )}
          </div>
          {requiresRegenerationConfirmation && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="text-sm font-black text-amber-950">This year level already has generated schedules.</p>
                  <p className="mt-0.5 text-xs font-semibold leading-relaxed text-amber-800">
                    {yearLabel(yearLevel)} has {existingScheduleCount} saved schedule{existingScheduleCount === 1 ? "" : "s"} for this term.
                    Generating again will create a new preview and can replace the matching draft schedules when you save it.
                  </p>
                  <button type="button" onClick={onConfirmRegeneration} className="mt-2 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-black text-white transition hover:brightness-110">
                    Generate this year level again
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#4e0a10]" />
            <h3 className="text-sm font-black text-slate-950">Scheduling Rules</h3>
            <HelpButton title="Scheduling Rules" text="These active rules are applied automatically while the timetable is generated." />
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-600">{activeRules.length} active rules</span>
        </div>
        {loadingSettings ? (
          <div className="m-3 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading scheduling rules</div>
        ) : (
          <div className="grid gap-4 p-3 2xl:grid-cols-2">
              <SchedulingRuleEditor
                title="Configure Subject Day Rules"
                description="Choose subjects that must be fixed to a required day."
                rows={forcedDayRules.map((rule) => {
                  const course = forcedCourseMap.get(rule.course_id);
                  return {
                    key: String(rule.course_id),
                    label: course?.code ?? `Course #${rule.course_id}`,
                    detail: course?.name ?? "Saved subject day rule",
                    value: rule.day,
                    onRemove: () => removeForcedDayRule(rule.course_id),
                  };
                })}
                emptyText="No subject day rules configured."
                disabled={actionsDisabled}
                saving={savingSettings}
              >
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_128px_78px]">
                  <select value={effectiveForcedCourseId} disabled={actionsDisabled || savingSettings || availableForcedDayCourses.length === 0} onChange={(event) => setSelectedForcedCourseId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
                    {availableForcedDayCourses.length === 0 ? <option value="">All subjects already configured</option> : availableForcedDayCourses.map((course) => <option key={course.id} value={course.id}>{course.code} - {course.name}</option>)}
                  </select>
                  <select value={selectedForcedDay} disabled={actionsDisabled || savingSettings} onChange={(event) => setSelectedForcedDay(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
                    {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                  <button type="button" disabled={actionsDisabled || savingSettings || !effectiveForcedCourseId} onClick={addForcedDayRule} className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-black text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Add</button>
                </div>
              </SchedulingRuleEditor>

              <SchedulingRuleEditor
                title="Configure Field Subjects"
                description="Mark subjects that must use field resources."
                rows={fieldCourseCodes.map((courseCode) => {
                  const course = fieldCourseMap.get(courseCode);
                  return {
                    key: courseCode,
                    label: courseCode,
                    detail: course?.name ?? "Saved field rule",
                    value: "Field",
                    onRemove: () => removeFieldCourseRule(courseCode),
                  };
                })}
                emptyText="No field subjects configured."
                disabled={actionsDisabled}
                saving={savingSettings}
              >
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_78px]">
                  <select value={effectiveFieldCourseCode} disabled={actionsDisabled || savingSettings || availableFieldCourses.length === 0} onChange={(event) => setSelectedFieldCourseCode(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
                    {availableFieldCourses.length === 0 ? <option value="">All available subjects configured</option> : availableFieldCourses.map((course) => <option key={course.code} value={course.code}>{course.code} - {course.name}</option>)}
                  </select>
                  <button type="button" disabled={actionsDisabled || savingSettings || !effectiveFieldCourseCode} onClick={addFieldCourseRule} className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-black text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Add</button>
                </div>
              </SchedulingRuleEditor>
          </div>
        )}
      </section>
    </div>
  );
}

function PreferencesStep({
  sections,
  courses,
  activeTerm,
  departmentId,
  rooms,
  existingSchedules,
  activeSectionId,
  setActiveSectionId,
  config,
  configs,
  updateConfig,
  toggle,
  forcedDaysByCourseId,
}: {
  sections: Section[];
  courses: Course[];
  activeTerm: Term | null;
  departmentId: number | null;
  rooms: ApiRoomRecord[];
  existingSchedules: ScheduleItem[];
  activeSectionId: string;
  setActiveSectionId: (id: string) => void;
  config: SectionConfig;
  configs: Record<string, SectionConfig>;
  updateConfig: (change: Partial<SectionConfig>) => void;
  toggle: (values: string[], id: string) => string[];
  forcedDaysByCourseId: ReadonlyMap<number, string>;
}) {
  const activeSection = sections.find((section) => section.id === activeSectionId);
  const isSectionReady = (section: Section) => Boolean(configs[section.id]?.locked);
  const readyCount = sections.filter(isSectionReady).length;
  const excludedSectionIds = useMemo(() => new Set(sections.map((section) => String(section.id))), [sections]);
  const patternAvailabilityBySectionCourseKey = useMemo(() => {
    const availability = new Map<string, GecPatternAvailability>();

    for (const section of sections) {
      for (const course of courses.filter(isGec)) {
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
  }, [activeTerm?.id, configs, courses, departmentId, existingSchedules, excludedSectionIds, rooms, sections]);
  const hasFullSelectedPattern = config.gecSplitCourseIds.some((courseId) => {
    const pattern = config.gecSplitPatternsByCourseId[courseId] ?? "MW";

    return patternAvailabilityBySectionCourseKey.get(`${activeSectionId}:${courseId}`)?.[pattern]?.full ?? false;
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
          <HelpButton title="Preferences" text="Select a section, then set its scheduling preference and optional subject-level guidance." />
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
                  <span className="truncate text-sm font-black text-slate-950">{section.name}</span>
                  <SectionReadyBadge ready={ready} active={active} />
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">{selectedCount} courses</span>
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
            <label className="text-sm font-bold text-slate-700">
              Scheduling preference
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
          />
        </div>

        <div className="mt-2 grid min-h-0 gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
          {courses.map((course) => (
              <div key={course.id} className="flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300 hover:shadow-sm">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-950">{course.code}</span>
                      {config.locked && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">Locked</span>}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-700">{course.name}</p>
                    <p className="text-xs font-semibold text-slate-500">{courseHours(course)} hours</p>
                  </div>
                  <label className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Preference
                    <select
                      value={displayPreferenceValue(config.preferencesByCourseId[course.id] ?? "automatic")}
                      onChange={(event) => updateConfig({ preferencesByCourseId: { ...config.preferencesByCourseId, [course.id]: event.target.value as SchedulingPreference } })}
                      className="mt-1 h-8 w-[150px] rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800"
                    >
                      {configurablePreferenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
                <CourseInlineConfiguration
                  course={course}
                  config={config}
                  forcedDay={forcedDaysByCourseId.get(Number(course.id))}
                  patternAvailability={patternAvailabilityBySectionCourseKey.get(`${activeSectionId}:${course.id}`)}
                  updateConfig={updateConfig}
                  toggle={toggle}
                />
              </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type GecPatternAvailability = Record<"MW" | "TTh", { full: boolean; label: string }>;
type GecPatternReservation = {
  sectionId: string;
  courseId: string;
  pattern: GecSplitPattern;
  requiredSlots: number;
};
type CourseConfigurationTab = "scheduling" | "sessions" | "special";

function CourseInlineConfiguration({
  course,
  config,
  forcedDay,
  patternAvailability,
  updateConfig,
  toggle,
}: {
  course: Course;
  config: SectionConfig;
  forcedDay?: string;
  patternAvailability?: GecPatternAvailability;
  updateConfig: (change: Partial<SectionConfig>) => void;
  toggle: (values: string[], id: string) => string[];
}) {
  const lectureLabSplit = config.splitCourseIds.includes(course.id);
  const gecSplit = config.gecSplitCourseIds.includes(course.id);
  const gecPattern = config.gecSplitPatternsByCourseId[course.id] ?? "MW";
  const toggleLectureLabSplit = () => updateConfig({ splitCourseIds: toggle(config.splitCourseIds, course.id) });
  const toggleGecSplit = () => updateConfig({ gecSplitCourseIds: toggle(config.gecSplitCourseIds, course.id) });

  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
      <div className="flex min-h-[32px] flex-wrap items-center gap-2">
        {forcedDay && (
          <span className="inline-flex w-fit items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-200">
            <CalendarDays className="h-3.5 w-3.5" />
            Required {forcedDay}
          </span>
        )}
        {course.labHours > 0 && (
          <button
            type="button"
            onClick={toggleLectureLabSplit}
            className="inline-flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
            aria-pressed={lectureLabSplit}
          >
            <input type="checkbox" checked={lectureLabSplit} readOnly className="h-4 w-4 rounded border-slate-300 text-[#4e0a10]" />
            <span>Split lecture/lab</span>
          </button>
        )}
        {isGec(course) && (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div
              role="button"
              tabIndex={0}
              onClick={toggleGecSplit}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleGecSplit();
                }
              }}
              className="inline-flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
              aria-pressed={gecSplit}
            >
              <input type="checkbox" checked={gecSplit} readOnly className="h-4 w-4 rounded border-slate-300 text-[#4e0a10]" />
              <span>Split GEC sessions</span>
            </div>
            {gecSplit && (
              <label className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500" onClick={(event) => event.stopPropagation()}>
                Pattern
                <select
                  value={gecPattern}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => updateConfig({
                    gecSplitPatternsByCourseId: {
                      ...config.gecSplitPatternsByCourseId,
                      [course.id]: event.target.value as GecSplitPattern,
                    },
                  })}
                  className="h-8 w-[104px] rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-slate-800"
                >
                  <option value="MW" disabled={patternAvailability?.MW.full}>MW{patternAvailability?.MW.full ? " - full" : ""}</option>
                  <option value="TTh" disabled={patternAvailability?.TTh.full}>TTh{patternAvailability?.TTh.full ? " - full" : ""}</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CourseConfigurationDrawer({
  course,
  config,
  forcedDay,
  patternAvailability,
  updateConfig,
  toggle,
  onClose,
}: {
  course: Course;
  config: SectionConfig;
  forcedDay?: string;
  patternAvailability?: GecPatternAvailability;
  updateConfig: (change: Partial<SectionConfig>) => void;
  toggle: (values: string[], id: string) => string[];
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<CourseConfigurationTab>("scheduling");
  const preference = config.preferencesByCourseId[course.id] ?? "automatic";
  const lectureLabSplit = config.splitCourseIds.includes(course.id);
  const gecSplit = config.gecSplitCourseIds.includes(course.id);
  const gecPattern = config.gecSplitPatternsByCourseId[course.id] ?? "MW";
  const tabs: Array<{ id: CourseConfigurationTab; label: string }> = [
    { id: "scheduling", label: "Scheduling" },
    { id: "sessions", label: "Sessions" },
    ...(isGec(course) ? [{ id: "special" as const, label: "Special Rules" }] : []),
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/45 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-configuration-title"
        className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 bg-[#4e0a10] px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-amber-300">Course Configuration</p>
            <h3 id="course-configuration-title" className="mt-1 truncate text-lg font-black">{course.code}</h3>
            <p className="mt-0.5 truncate text-sm font-semibold text-white/75">{course.name} · {courseHours(course)} hours</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Close course configuration">
            <X className="h-5 w-5" />
          </button>
        </header>

        <nav className="grid border-b border-slate-200 bg-slate-50 px-4 pt-3" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} aria-label="Course configuration sections">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-2 py-2 text-xs font-black transition ${activeTab === tab.id ? "border-[#4e0a10] text-[#4e0a10]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {activeTab === "scheduling" && (
            <div>
              <div className="border-b border-slate-200 pb-4">
                <p className="text-xs font-black uppercase text-slate-500">Course Override</p>
                <h4 className="mt-1 text-base font-black text-slate-950">Scheduling</h4>
              </div>
              <div className="grid gap-5 py-5">
                <label className="text-xs font-black uppercase text-slate-500">
                  Scheduling preference
                  <select
                    value={displayPreferenceValue(preference)}
                    onChange={(event) => updateConfig({ preferencesByCourseId: { ...config.preferencesByCourseId, [course.id]: event.target.value as SchedulingPreference } })}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-900"
                  >
                    {configurablePreferenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {forcedDay && (
                  <div className="flex items-center justify-between gap-3 border-y border-slate-200 py-3">
                    <div className="flex items-center gap-2.5">
                      <CalendarDays className="h-4 w-4 text-[#4e0a10]" />
                      <span className="text-sm font-bold text-slate-700">Required day</span>
                    </div>
                    <span className="text-sm font-black text-slate-950">{forcedDay}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "sessions" && (
            <div>
              <div className="border-b border-slate-200 pb-4">
                <p className="text-xs font-black uppercase text-slate-500">Session Components</p>
                <h4 className="mt-1 text-base font-black text-slate-950">Lecture / Laboratory / Field</h4>
              </div>
              {course.labHours > 0 && (
                <div className="border-b border-slate-200 py-4">
                  <CheckboxLabel
                    checked={lectureLabSplit}
                    onChange={() => updateConfig({ splitCourseIds: toggle(config.splitCourseIds, course.id) })}
                    label="Split lecture/laboratory"
                  />
                </div>
              )}
              <div className="divide-y divide-slate-200">
                {course.roomTypeRequired === "field" ? (
                  <SessionComponentRow icon={<Users className="h-4 w-4" />} label="Field session" hours={courseHours(course)} />
                ) : lectureLabSplit ? (
                  <>
                    <SessionComponentRow icon={<Clock3 className="h-4 w-4" />} label="Lecture session" hours={Number(course.lectureHours ?? 0)} />
                    <SessionComponentRow icon={<FlaskConical className="h-4 w-4" />} label="Laboratory session" hours={Number(course.labHours ?? 0)} />
                  </>
                ) : (
                  <SessionComponentRow icon={<Clock3 className="h-4 w-4" />} label={course.labHours > 0 ? "Combined session" : "Lecture session"} hours={courseHours(course)} />
                )}
              </div>
            </div>
          )}

          {activeTab === "special" && isGec(course) && (
            <div>
              <div className="border-b border-slate-200 pb-4">
                <p className="text-xs font-black uppercase text-slate-500">Special Course Rules</p>
                <h4 className="mt-1 text-base font-black text-slate-950">GEC Sessions</h4>
              </div>
              <div className="border-b border-slate-200 py-4">
                <CheckboxLabel
                  checked={gecSplit}
                  onChange={() => updateConfig({ gecSplitCourseIds: toggle(config.gecSplitCourseIds, course.id) })}
                  label="Split GEC sessions"
                />
              </div>
              {gecSplit && (
                <div className="grid gap-3 py-4">
                  <label className="text-xs font-black uppercase text-slate-500">
                    Pattern
                    <select
                      value={gecPattern}
                      onChange={(event) => updateConfig({
                        gecSplitPatternsByCourseId: {
                          ...config.gecSplitPatternsByCourseId,
                          [course.id]: event.target.value as GecSplitPattern,
                        },
                      })}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-900"
                    >
                      <option value="MW" disabled={patternAvailability?.MW.full}>MW{patternAvailability?.MW.full ? " - full" : ""}</option>
                      <option value="TTh" disabled={patternAvailability?.TTh.full}>TTh{patternAvailability?.TTh.full ? " - full" : ""}</option>
                    </select>
                  </label>
                  <GecPatternCapacityNotice selectedPattern={gecPattern} availability={patternAvailability} />
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-black text-white transition hover:brightness-110">
            <Check className="h-4 w-4" />
            Save changes
          </button>
        </footer>
      </section>
    </div>
  );
}

function SessionComponentRow({ icon, label, hours }: { icon: ReactNode; label: string; hours: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <div className="flex items-center gap-2.5 text-slate-700">
        <span className="text-[#4e0a10]">{icon}</span>
        <span className="text-sm font-bold">{label}</span>
      </div>
      <span className="text-xs font-black text-slate-500">{hours} {hours === 1 ? "hour" : "hours"}</span>
    </div>
  );
}

function GecPatternCapacityNotice({
  selectedPattern,
  availability,
}: {
  selectedPattern: GecSplitPattern;
  availability?: GecPatternAvailability;
}) {
  if (!availability) return null;

  const selected = availability[selectedPattern];
  if (!selected?.full) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700 ring-1 ring-red-200">
      <AlertCircle className="h-3.5 w-3.5" />
      {selected.label} is already full
    </span>
  );
}

function SectionRecommendationCard({
  activeSection,
  courses,
  config,
  patternAvailabilityBySectionCourseKey,
  activeSectionId,
}: {
  activeSection?: Section;
  courses: Course[];
  config: SectionConfig;
  patternAvailabilityBySectionCourseKey: Map<string, GecPatternAvailability>;
  activeSectionId: string;
}) {
  const gecCourses = courses.filter(isGec);
  const labCourses = courses.filter((c) => c.labHours > 0);
  const splitGecCount = config.gecSplitCourseIds.length;
  const splitLabCount = config.splitCourseIds.length;

  let mwAvailableCount = 0;
  let tthAvailableCount = 0;

  for (const gec of gecCourses) {
    const avail = patternAvailabilityBySectionCourseKey.get(`${activeSectionId}:${gec.id}`);
    if (avail) {
      if (!avail.MW.full) mwAvailableCount++;
      if (!avail.TTh.full) tthAvailableCount++;
    }
  }

  const hasFullSelectedGec = config.gecSplitCourseIds.some((courseId) => {
    const pattern = config.gecSplitPatternsByCourseId[courseId] ?? "MW";
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
            {gecCourses.length > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 shadow-2xs">
                <span className="font-bold text-slate-900">GEC Pattern Availability:</span>
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
  pattern: GecSplitPattern,
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
      if (!course || !isGec(course)) {
        continue;
      }

      const pattern = config.gecSplitPatternsByCourseId[courseId] ?? "MW";
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

function CheckboxLabel({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-slate-300 text-[#4e0a10]" />
      <span>{label}</span>
    </label>
  );
}

function ReviewStep({ activeTerm, sections, courses, configs, activeRules, onEditScope, onEditPreferences }: { activeTerm: Term | null; sections: Section[]; courses: Course[]; configs: Record<string, SectionConfig>; activeRules: string[]; onEditScope: () => void; onEditPreferences: () => void }) {
  const totalCourses = sections.reduce((sum, section) => sum + (configs[section.id]?.courseIds.length ?? 0), 0);
  const splitCount = sections.reduce((sum, section) => sum + (configs[section.id]?.splitCourseIds.length ?? 0) + (configs[section.id]?.gecSplitCourseIds.length ?? 0), 0);
  const totalSessions = sections.reduce((sum, section) => {
    const config = configs[section.id];
    const selectedCourses = config?.courseIds.length ?? 0;
    return sum + selectedCourses + (config?.splitCourseIds.length ?? 0) + (config?.gecSplitCourseIds.length ?? 0);
  }, 0);
  const reviewRows = sections.map((section) => {
    const config = configs[section.id];
    const selectedCourses = config?.courseIds.length ?? 0;
    const lectureLabSplits = config?.splitCourseIds.length ?? 0;
    const gecSplits = config?.gecSplitCourseIds.length ?? 0;
    return {
      section,
      selectedCourses,
      lectureLabSplits,
      gecSplits,
      estimatedSessions: selectedCourses + lectureLabSplits + gecSplits,
    };
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-[#4e0a10]">Ready for final check</p>
              <h3 className="text-base font-black text-slate-950">Review the year-level setup</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                {formatTerm(activeTerm)} • {sections.length} sections • {totalCourses || courses.length * sections.length} courses • {totalSessions} estimated sessions • {activeRules.length} active rules
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onEditScope} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Edit Scope</button>
            <button type="button" onClick={onEditPreferences} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Edit Preferences</button>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="px-3 py-2">
            <h4 className="text-sm font-black text-slate-950">Section Readiness</h4>
            <p className="text-xs font-semibold text-slate-500">All listed sections will be included when you generate the preview.</p>
          </div>
          <span className="mr-3 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
            {sections.length} sections locked in
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto border-t border-slate-200">
          <table className="min-w-full table-fixed">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="px-3 py-1.5 text-left text-[11px] font-black uppercase text-slate-500">Section</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-black uppercase text-slate-500">Courses</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-black uppercase text-slate-500">Lecture/Lab Splits</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-black uppercase text-slate-500">GEC Splits</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-black uppercase text-slate-500">Sessions</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-black uppercase text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {reviewRows.map((row) => (
                <tr key={row.section.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-sm font-black text-slate-950">{row.section.name}</td>
                  <td className="px-3 py-2 text-sm font-semibold text-slate-700">{row.selectedCourses}</td>
                  <td className="px-3 py-2 text-sm font-semibold text-slate-700">{row.lectureLabSplits}</td>
                  <td className="px-3 py-2 text-sm font-semibold text-slate-700">{row.gecSplits}</td>
                  <td className="px-3 py-2 text-sm font-semibold text-slate-700">{row.estimatedSessions}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                      <Check className="h-3 w-3" /> Ready
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-950">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-black">Nothing is saved yet.</p>
            <p className="mt-0.5 text-xs leading-5 text-amber-900">
              Click <span className="font-black">Next</span> to generate a preview. You can review the timetable first, then choose whether to save it as draft schedules.
              {splitCount > 0 ? ` ${splitCount} split setting${splitCount === 1 ? "" : "s"} will be used.` : " No courses are currently marked for splitting."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenerateStep({ preview, sections, courses, roomCodeById, generating, applying, generate, apply }: { preview: ApiScheduleRecord[]; sections: Section[]; courses: Course[]; roomCodeById: Map<string, string>; generating: boolean; applying: boolean; generate: () => void; apply: () => void }) {
  const hasPreview = preview.length > 0;
  const [activeTimelineIndex, setActiveTimelineIndex] = useState(0);
  const [selectedPreviewSectionId, setSelectedPreviewSectionId] = useState("");
  const [previewView, setPreviewView] = useState<"list" | "grid">("list");
  const timeline = ["Loading subjects", "Creating scheduling options", "Allocating rooms", "Checking conflicts", "Finalizing timetable"];
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

  useEffect(() => {
    if (!selectedPreviewSectionId || !sections.some((section) => String(section.id) === selectedPreviewSectionId)) {
      setSelectedPreviewSectionId(String(sections[0]?.id ?? ""));
    }
  }, [sections, selectedPreviewSectionId]);

  useEffect(() => {
    if (!generating) {
      setActiveTimelineIndex(hasPreview ? timeline.length : 0);
      return;
    }

    setActiveTimelineIndex(0);
    const timer = window.setInterval(() => {
      setActiveTimelineIndex((current) => Math.min(current + 1, timeline.length - 1));
    }, 1100);

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
      {!hasPreview && (
        <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-[#4e0a10]">Ready to Generate Timetable</p>
              <h3 className="mt-0.5 text-base font-black text-slate-950">Ready to Generate Timetable</h3>
              <p className="mt-0.5 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
                The system will run the scheduling algorithm across the selected year level and validate the result before saving.
              </p>
            </div>
            <button type="button" onClick={generate} disabled={generating} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {generating ? "Generating Timetable" : "Generate Timetable"}
            </button>
          </div>

          <GenerationTimeline steps={timeline} activeIndex={activeTimelineIndex} running={generating} />
        </section>
      )}

      {hasPreview && (
        <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <h4 className="text-base font-black text-slate-950">Generated Schedule Preview</h4>
            <div className="flex gap-2">
              <button type="button" onClick={apply} disabled={applying} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                View Timetable
              </button>
              <button type="button" onClick={exportSchedule} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700 hover:bg-slate-50">
                <Download className="h-4 w-4" /> Export Schedule
              </button>
              <button type="button" onClick={generate} disabled={generating || applying} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className="h-4 w-4" /> Regenerate
              </button>
            </div>
          </div>
          <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {sections.map((section) => (
                <button key={section.id} type="button" onClick={() => setSelectedPreviewSectionId(String(section.id))} className={`rounded-lg border px-2.5 py-1 text-xs font-black ${selectedPreviewSectionId === String(section.id) ? "border-[#4e0a10] bg-[#4e0a10] text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  {section.name}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button type="button" onClick={() => setPreviewView("list")} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black ${previewView === "list" ? "bg-[#4e0a10] text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button type="button" onClick={() => setPreviewView("grid")} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black ${previewView === "grid" ? "bg-[#4e0a10] text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <LayoutGrid className="h-3.5 w-3.5" /> Grid
              </button>
            </div>
          </div>
          <div className="mt-2 min-h-0 flex-1">
            {previewView === "list" ? (
              <SchedulePreviewList rows={groupedPreviewRows} />
            ) : (
              <SchedulePreviewGrid rows={selectedPreviewRows} courseById={courseById} roomCodeById={roomCodeById} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function GenerationTimeline({ steps, activeIndex, running }: { steps: string[]; activeIndex: number; running: boolean }) {
  return (
    <div className="mt-3 flex min-h-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
          {running ? <Loader2 className="h-6 w-6 animate-spin text-[#4e0a10]" /> : <Play className="h-5 w-5 text-[#4e0a10]" />}
        </div>
        <p className="mt-2 text-xs font-black uppercase text-[#4e0a10]">Generation Status</p>
        <h4 className="mt-0.5 text-base font-black text-slate-950">{running ? steps[activeIndex] : "Waiting to start"}</h4>
        <p className="mt-0.5 max-w-xl text-xs font-semibold leading-relaxed text-slate-500">
          {running ? "The scheduler is preparing the timetable. This may take a few moments." : "Start generation to run the scheduling sequence."}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {steps.map((step, index) => {
            const complete = running && index < activeIndex;
            const current = running && index === activeIndex;
            return (
              <span key={step} className={`rounded-full px-2.5 py-0.5 text-xs font-black ${complete ? "bg-emerald-100 text-emerald-700" : current ? "bg-[#4e0a10] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
                {complete ? "✓ " : current ? "● " : "○ "}{step}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
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
      <div className="h-full overflow-auto">
        <table className="min-w-[1060px] table-fixed">
        <colgroup>
          <col className="w-[37%]" />
          <col className="w-[14%]" />
          <col className="w-[17%]" />
          <col className="w-[22%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-slate-50">
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

    return getPreviewRoomCode(row, roomCodeById) ?? "Unassigned";
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
