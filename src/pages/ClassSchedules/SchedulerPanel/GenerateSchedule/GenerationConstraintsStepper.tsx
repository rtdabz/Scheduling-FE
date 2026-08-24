import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Search,
  Sun,
  Sunset,
  Moon,
} from "lucide-react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";
import type { TimeBlockOption } from "./useGenerateSchedule";
import type { Course } from "../types";
import { ReviewGroup } from "./WizardReviewComponents";
import SchedulingRuleEditor from "./SchedulingRuleEditor";
import WizardProgressStepper from "./WizardProgressStepper";
import Skeleton from "../../../../components/ui/Skeleton";

interface ConstraintCourse {
  id: number;
  code: string;
  name: string;
}

interface ForcedDayRule {
  course_id: number;
  day: string;
}

interface GenerationPeriod {
  section_id: number;
  semester: "1st" | "2nd" | "summer";
  year_level: number;
  term_id: number;
}

interface SchedulingSettings {
  generation_period: GenerationPeriod | null;
  forced_day_courses: ConstraintCourse[];
  forced_day_rules: ForcedDayRule[];
  field_course_assignment_enabled: boolean;
  field_course_options: ConstraintCourse[];
  field_course_codes: string[];
}

interface GenerationConstraintsStepperProps {
  sectionId: string;
  isGenerating: boolean;
  isApplying: boolean;
  preferredTimeBlock: TimeBlockOption;
  setPreferredTimeBlock: (value: TimeBlockOption) => void;
  selectedGecCourseIds: string[];
  setSelectedGecCourseIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSplitSessionCourseIds: string[];
  setSelectedSplitSessionCourseIds: React.Dispatch<React.SetStateAction<string[]>>;
  eligibleGecCourses: Course[];
  eligibleSplitSessionCourses: Course[];
  gecSplitAvailable: boolean;
  splitSessionAvailable: boolean;
  onConfirm: () => void;
}

type StepId = 1 | 2 | 3;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const steps = [
  { id: 1, title: "Preferences" },
  { id: 2, title: "Constraints" },
  { id: 3, title: "Review" },
];

export default function GenerationConstraintsStepper({
  sectionId,
  isGenerating,
  isApplying,
  preferredTimeBlock,
  setPreferredTimeBlock,
  selectedGecCourseIds,
  setSelectedGecCourseIds,
  selectedSplitSessionCourseIds,
  setSelectedSplitSessionCourseIds,
  eligibleGecCourses,
  eligibleSplitSessionCourses,
  gecSplitAvailable,
  splitSessionAvailable,
  onConfirm,
}: GenerationConstraintsStepperProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SchedulingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<StepId>(1);
  const [selectedForcedCourseId, setSelectedForcedCourseId] = useState("");
  const [selectedForcedDay, setSelectedForcedDay] = useState("Monday");
  const [selectedFieldCourseCode, setSelectedFieldCourseCode] = useState("");
  const [courseDaySearch, setCourseDaySearch] = useState("");
  const [fieldCourseSearch, setFieldCourseSearch] = useState("");
  const [gecSearch, setGecSearch] = useState("");
  const [splitSessionSearch, setSplitSessionSearch] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    api.get<SchedulingSettings>("/scheduling-settings", {
      params: { section_id: sectionId },
    })
      .then((response) => {
        if (!active) return;
        setSettings(response.data);
      })
      .catch(() => toast.error("Error", "Failed to load generation constraints."))
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sectionId, toast]);

  const forcedDayRules = settings?.forced_day_rules ?? [];
  const forcedDayCourses = settings?.forced_day_courses ?? [];
  const fieldCourseCodes = settings?.field_course_codes ?? [];
  const fieldCourseOptions = settings?.field_course_options ?? [];
  const periodLabel = settings?.generation_period
    ? `${formatSemester(settings.generation_period.semester)} Semester`
    : "Selected semester";

  const forcedCourseMap = useMemo(
    () => new Map(forcedDayCourses.map((course) => [course.id, course])),
    [forcedDayCourses],
  );

  const fieldCourseMap = useMemo(
    () => new Map(fieldCourseOptions.map((course) => [course.code, course])),
    [fieldCourseOptions],
  );

  const availableForcedDayCourses = forcedDayCourses.filter(
    (course) => !forcedDayRules.some((rule) => rule.course_id === course.id),
  );

  const availableFieldCourses = fieldCourseOptions.filter(
    (course) => !fieldCourseCodes.includes(course.code),
  );
  const effectiveForcedCourseId = availableForcedDayCourses.some((course) => String(course.id) === selectedForcedCourseId)
    ? selectedForcedCourseId
    : String(availableForcedDayCourses[0]?.id ?? "");
  const effectiveFieldCourseCode = availableFieldCourses.some((course) => course.code === selectedFieldCourseCode)
    ? selectedFieldCourseCode
    : (availableFieldCourses[0]?.code ?? "");

  const filteredForcedDayCourses = filterCourses(availableForcedDayCourses, courseDaySearch);
  const filteredFieldCourses = filterCourses(availableFieldCourses, fieldCourseSearch);
  const filteredGecCourses = filterCourses(eligibleGecCourses, gecSearch);
  const filteredSplitSessionCourses = filterCourses(eligibleSplitSessionCourses, splitSessionSearch);
  const selectedGecCourseSet = new Set(selectedGecCourseIds);
  const selectedSplitSessionCourseSet = new Set(selectedSplitSessionCourseIds);
  const effectiveSplitGecEnabled = gecSplitAvailable && selectedGecCourseIds.length > 0;
  const affectedSplitCount =
    (effectiveSplitGecEnabled ? selectedGecCourseIds.length : 0)
    + (splitSessionAvailable ? selectedSplitSessionCourseIds.length : 0);

  const patchSettings = async (patch: Partial<SchedulingSettings>) => {
    if (!settings) return false;

    const previous = settings;
    setIsSaving(true);
    setSettings({ ...settings, ...patch });

    try {
      const response = await api.patch<SchedulingSettings>("/scheduling-settings", patch, {
        params: { section_id: sectionId },
      });
      setSettings(response.data);
      toast.success("Department rule saved", "This is a department-wide rule and applies to every section and term until you remove it.");
      return true;
    } catch {
      setSettings(previous);
      toast.error("Error", "Failed to save generation constraints.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const addForcedDayRule = async () => {
    const courseId = Number(effectiveForcedCourseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return;

    const saved = await patchSettings({
      forced_day_rules: [...forcedDayRules, { course_id: courseId, day: selectedForcedDay }],
    });
    if (saved) {
      setSelectedForcedCourseId("");
      setCourseDaySearch("");
    }
  };

  const addFieldCourseRule = async () => {
    if (!effectiveFieldCourseCode) return;

    const saved = await patchSettings({
      field_course_codes: [...fieldCourseCodes, effectiveFieldCourseCode],
    });
    if (saved) {
      setSelectedFieldCourseCode("");
      setFieldCourseSearch("");
    }
  };

  const toggleGecCourse = (courseId: string) => {
    setSelectedGecCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId],
    );
  };

  const toggleAllGecCourses = () => {
    setSelectedGecCourseIds((current) =>
      current.length === eligibleGecCourses.length
        ? []
        : eligibleGecCourses.map((course) => course.id),
    );
  };

  const toggleSplitSessionCourse = (courseId: string) => {
    setSelectedSplitSessionCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId],
    );
  };

  const toggleAllSplitSessionCourses = () => {
    setSelectedSplitSessionCourseIds((current) =>
      current.length === eligibleSplitSessionCourses.length
        ? []
        : eligibleSplitSessionCourses.map((course) => course.id),
    );
  };

  const busy = isLoading || isSaving || isGenerating || isApplying;

  return (
    <div className="flex-1 overflow-hidden bg-slate-50">
      <div className="flex h-full w-full flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-[#4e0a10]">
              Schedule Generation Setup
            </p>
            <h4 className="mt-1 text-lg font-black text-slate-950">Generation Constraints</h4>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Course options are filtered at the server for {periodLabel}. Day and
              field rules below save immediately and apply department-wide.
            </p>
          </div>
          <div className="border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" style={{ borderRadius: 8 }}>
            {isSaving ? "Saving..." : `${forcedDayRules.length + fieldCourseCodes.length + affectedSplitCount} active constraints`}
          </div>
        </div>

        <WizardProgressStepper currentStep={step} steps={steps} ariaLabel="Generate schedule steps" />

        {isLoading ? (
          <div className="flex flex-1 flex-col gap-4 border border-slate-200 bg-white p-5 shadow-sm" style={{ borderRadius: 8 }} aria-busy="true" aria-label="Loading semester constraints">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-3/4" />
            <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-20 rounded-lg" /></div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3">
            <main className="min-h-0 min-w-0 border border-slate-200 bg-white p-3 shadow-sm" style={{ borderRadius: 8 }}>
              {step === 1 && (
                <ConstraintStep
                  icon={<Clock className="h-5 w-5" />}
                  title="Generation Preferences"
                  description="Set global preferences. The generator prioritizes these choices while still finding valid schedules when needed."
                >
                  <section className="space-y-2">
                    <h6 className="text-xs font-black uppercase tracking-wide text-slate-500">Preferred Time Block</h6>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {[
                        { id: "flexible", label: "Flexible", detail: "7 AM - 7 PM", icon: Clock },
                        { id: "morning", label: "Morning", detail: "7 AM - 12 PM", icon: Sun },
                        { id: "afternoon", label: "Afternoon", detail: "12 PM - 7 PM", icon: Sunset },
                        { id: "evening", label: "Evening", detail: "5 PM - 7 PM", icon: Moon },
                      ].map((option) => {
                        const Icon = option.icon;
                        const selected = preferredTimeBlock === option.id;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={busy}
                            onClick={() => setPreferredTimeBlock(option.id as TimeBlockOption)}
                            className={`min-h-14 border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected
                                ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            style={{ borderRadius: 8 }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Icon className={`h-4 w-4 ${selected ? "text-white" : "text-[#4e0a10]"}`} />
                              {selected && <Check className="h-4 w-4" />}
                            </div>
                            <p className="mt-1.5 text-xs font-black">{option.label}</p>
                            <p className={`mt-0.5 text-[11px] font-semibold ${selected ? "text-white/75" : "text-slate-500"}`}>
                              {option.detail}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <div className="grid min-h-0 gap-2 xl:grid-cols-2">
                    {splitSessionAvailable && (
                      <section className="space-y-2 border border-slate-200 bg-slate-50 p-2.5" style={{ borderRadius: 8 }}>
                        <div>
                          <h6 className="text-xs font-black uppercase tracking-wide text-slate-500">Split-Session Courses</h6>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">
                            Pick lecture + laboratory courses that need separate sessions.
                          </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                          <SearchBox
                            value={splitSessionSearch}
                            onChange={setSplitSessionSearch}
                            placeholder="Search lecture + laboratory courses"
                            disabled={busy}
                          />
                          <button
                            type="button"
                            disabled={busy || eligibleSplitSessionCourses.length === 0}
                            onClick={toggleAllSplitSessionCourses}
                            className="h-9 border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ borderRadius: 8 }}
                          >
                            {selectedSplitSessionCourseIds.length === eligibleSplitSessionCourses.length && eligibleSplitSessionCourses.length > 0
                              ? "Clear All"
                              : "Select All"}
                          </button>
                        </div>
                        <SelectableCourseList
                          courses={filteredSplitSessionCourses}
                          selectedIds={selectedSplitSessionCourseSet}
                          disabled={busy}
                          emptyText="No lecture + laboratory courses for this section."
                          onToggle={toggleSplitSessionCourse}
                        />
                      </section>
                    )}

                    {gecSplitAvailable && (
                      <section className="space-y-2 border border-slate-200 bg-slate-50 p-2.5" style={{ borderRadius: 8 }}>
                        <div>
                          <div>
                            <h6 className="text-xs font-black uppercase tracking-wide text-slate-500">Split General Education Courses</h6>
                            <p className="mt-0.5 text-xs font-medium text-slate-500">
                              Pick eligible GEC courses that should use shorter sessions.
                            </p>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                          <SearchBox
                            value={gecSearch}
                            onChange={setGecSearch}
                            placeholder="Search eligible GEC courses"
                            disabled={busy}
                          />
                          <button
                            type="button"
                            disabled={busy || eligibleGecCourses.length === 0}
                            onClick={toggleAllGecCourses}
                            className="h-9 border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ borderRadius: 8 }}
                          >
                            {selectedGecCourseIds.length === eligibleGecCourses.length && eligibleGecCourses.length > 0
                              ? "Clear All"
                              : "Select All"}
                          </button>
                        </div>
                        <SelectableCourseList
                          courses={filteredGecCourses}
                          selectedIds={selectedGecCourseSet}
                          disabled={busy}
                          emptyText="No eligible GEC courses for this section."
                          onToggle={toggleGecCourse}
                        />
                      </section>
                    )}
                  </div>
                </ConstraintStep>
              )}

              {step === 2 && (
                <ConstraintStep
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="Course Constraints"
                  description="Department-wide rules. Saved as soon as you add or remove one, and they apply to every section and term until changed."
                >
                  <div className="grid min-h-0 gap-3 xl:grid-cols-2">
                    <SchedulingRuleEditor
                      title="Configure Subject Day Rules"
                      description="Choose subjects that must be fixed to a required day."
                      rows={forcedDayRules.map((rule) => {
                        const course = forcedCourseMap.get(rule.course_id);
                        return {
                          key: String(rule.course_id),
                          label: course?.code ?? `Course #${rule.course_id}`,
                          value: rule.day,
                          detail: course?.name ?? "Saved course rule",
                          onEdit: () => {
                            setSelectedForcedCourseId(String(rule.course_id));
                            setSelectedForcedDay(rule.day);
                            patchSettings({ forced_day_rules: forcedDayRules.filter((item) => item.course_id !== rule.course_id) });
                          },
                          onRemove: () => patchSettings({ forced_day_rules: forcedDayRules.filter((item) => item.course_id !== rule.course_id) }),
                        };
                      })}
                      emptyText="No subject day rules configured."
                      disabled={busy}
                      saving={isSaving}
                    >
                      <div className="space-y-2">
                        <SearchBox
                          value={courseDaySearch}
                          onChange={setCourseDaySearch}
                          placeholder="Search current-semester courses"
                          disabled={busy}
                        />
                        <div className="grid w-full items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 sm:grid-cols-[minmax(0,1fr)_140px_112px]">
                        <CourseSelect
                          value={effectiveForcedCourseId}
                          onChange={setSelectedForcedCourseId}
                          courses={filteredForcedDayCourses}
                          disabled={busy || filteredForcedDayCourses.length === 0}
                          emptyText="No available courses for this semester"
                        />
                        <DaySelect value={selectedForcedDay} onChange={setSelectedForcedDay} disabled={busy} />
                        <button
                          type="button"
                          disabled={busy || !effectiveForcedCourseId}
                          onClick={addForcedDayRule}
                          className="inline-flex h-9 w-full items-center justify-center gap-2 bg-[#4e0a10] px-3 text-xs font-bold text-white hover:bg-[#6b0e17] disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ borderRadius: 8 }}
                        >
                          {isSaving ? <LoadingSpinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          Add
                        </button>
                        </div>
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
                          value: "Field",
                          detail: course?.name ?? "Saved field rule",
                          onEdit: () => {
                            setSelectedFieldCourseCode(courseCode);
                            patchSettings({ field_course_codes: fieldCourseCodes.filter((item) => item !== courseCode) });
                          },
                          onRemove: () => patchSettings({ field_course_codes: fieldCourseCodes.filter((item) => item !== courseCode) }),
                        };
                      })}
                      emptyText="No field subjects configured."
                      disabled={busy}
                      saving={isSaving}
                    >
                      <div className="space-y-2">
                        <SearchBox
                          value={fieldCourseSearch}
                          onChange={setFieldCourseSearch}
                          placeholder="Search current-semester courses"
                          disabled={busy}
                        />
                        <div className="grid w-full items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                        <CourseSelect
                          value={effectiveFieldCourseCode}
                          onChange={setSelectedFieldCourseCode}
                          courses={filteredFieldCourses}
                          valueKey="code"
                          disabled={busy || filteredFieldCourses.length === 0}
                          emptyText="No available courses for this semester"
                        />
                        <button
                          type="button"
                          disabled={busy || !effectiveFieldCourseCode}
                          onClick={addFieldCourseRule}
                          className="inline-flex h-9 items-center justify-center gap-2 bg-[#4e0a10] px-3 text-xs font-bold text-white hover:bg-[#6b0e17] disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ borderRadius: 8 }}
                        >
                          {isSaving ? <LoadingSpinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          Add
                        </button>
                        </div>
                      </div>
                    </SchedulingRuleEditor>
                  </div>
                </ConstraintStep>
              )}

              {step === 3 && (
                <ReviewStep
                  forcedDayRules={forcedDayRules}
                  forcedCourseMap={forcedCourseMap}
                  fieldCourseCodes={fieldCourseCodes}
                  preferredTimeBlock={preferredTimeBlock}
                  splitGecEnabled={effectiveSplitGecEnabled}
                  selectedGecCount={selectedGecCourseIds.length}
                  selectedSplitSessionCount={splitSessionAvailable ? selectedSplitSessionCourseIds.length : 0}
                  availableSplitSessionCount={splitSessionAvailable ? eligibleSplitSessionCourses.length : 0}
                  affectedSplitCount={affectedSplitCount}
                  onEditPreferences={() => setStep(1)}
                  onEditConstraints={() => setStep(2)}
                  onBack={() => setStep(2)}
                  onConfirm={onConfirm}
                  disabled={busy}
                  isGenerating={isGenerating}
                />
              )}
            </main>

          </div>
        )}

        {!isLoading && step < 3 && (
          <div className="flex shrink-0 justify-between gap-2 pb-1">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(1, current - 1) as StepId)}
                className="inline-flex h-9 items-center gap-2 border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
                style={{ borderRadius: 8 }}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setStep((current) => Math.min(3, current + 1) as StepId)}
              className="inline-flex h-9 items-center gap-2 bg-[#4e0a10] px-4 text-xs font-bold text-white hover:bg-[#6b0e17]"
              style={{ borderRadius: 8 }}
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConstraintStep({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#4e0a10]/10 text-[#4e0a10]" style={{ borderRadius: 8 }}>
          {icon}
        </div>
        <div>
          <h5 className="text-sm font-black text-slate-950">{title}</h5>
          <p className="mt-0.5 text-xs font-medium leading-4 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#4e0a10] disabled:cursor-not-allowed disabled:bg-slate-50"
        style={{ borderRadius: 8 }}
      />
    </label>
  );
}

function CourseSelect({
  value,
  onChange,
  courses,
  disabled,
  emptyText,
  valueKey = "id",
}: {
  value: string;
  onChange: (value: string) => void;
  courses: ConstraintCourse[];
  disabled: boolean;
  emptyText: string;
  valueKey?: "id" | "code";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
        Select Course
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#4e0a10] disabled:cursor-not-allowed disabled:bg-slate-50"
        style={{ borderRadius: 8 }}
      >
        {courses.length === 0 ? (
          <option value="">{emptyText}</option>
        ) : (
          courses.map((course) => (
            <option key={course.id} value={valueKey === "id" ? course.id : course.code}>
              {course.code} - {course.name}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

function DaySelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
        Required Day
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#4e0a10] disabled:cursor-not-allowed disabled:bg-slate-50"
        style={{ borderRadius: 8 }}
      >
        {DAYS.map((day) => (
          <option key={day} value={day}>{day}</option>
        ))}
      </select>
    </label>
  );
}

function SelectableCourseList({
  courses,
  selectedIds,
  disabled,
  emptyText,
  onToggle,
}: {
  courses: Course[];
  selectedIds: Set<string>;
  disabled: boolean;
  emptyText: string;
  onToggle: (courseId: string) => void;
}) {
  if (courses.length === 0) {
    return (
      <div className="border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs font-semibold text-slate-500" style={{ borderRadius: 8 }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {courses.map((course) => {
        const selected = selectedIds.has(course.id);

        return (
          <button
            key={course.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(course.id)}
            className={`flex min-h-11 items-center justify-between gap-2 border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? "border-[#4e0a10] bg-[#4e0a10]/5"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
            style={{ borderRadius: 8 }}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-black text-slate-900">{course.code}</span>
              <span className="block truncate text-[11px] font-medium text-slate-500">{course.name}</span>
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                selected
                  ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                  : "border-slate-300 bg-white text-transparent"
              }`}
              style={{ borderRadius: 6 }}
            >
              <Check className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewStep({
  forcedDayRules,
  forcedCourseMap,
  fieldCourseCodes,
  preferredTimeBlock,
  splitGecEnabled,
  selectedGecCount,
  selectedSplitSessionCount,
  availableSplitSessionCount,
  affectedSplitCount,
  onEditPreferences,
  onEditConstraints,
  onBack,
  onConfirm,
  disabled,
  isGenerating,
}: {
  forcedDayRules: ForcedDayRule[];
  forcedCourseMap: Map<number, ConstraintCourse>;
  fieldCourseCodes: string[];
  preferredTimeBlock: TimeBlockOption;
  splitGecEnabled: boolean;
  selectedGecCount: number;
  selectedSplitSessionCount: number;
  availableSplitSessionCount: number;
  affectedSplitCount: number;
  onEditPreferences: () => void;
  onEditConstraints: () => void;
  onBack: () => void;
  onConfirm: () => void;
  disabled: boolean;
  isGenerating: boolean;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 pb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-emerald-50 text-emerald-700" style={{ borderRadius: 8 }}>
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h5 className="text-sm font-black text-slate-950">Review Generation Constraints</h5>
          <p className="mt-0.5 text-xs font-medium leading-5 text-slate-500">
            Confirm the saved constraints before generating the schedule preview.
          </p>
        </div>
      </div>
      <div className="grid min-h-0 gap-2 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)_minmax(0,0.9fr)]">
        <ReviewGroup
          title="Generation Preferences"
          emptyText="Default generation preferences."
          rows={[
            `${formatTimeBlock(preferredTimeBlock)} schedule preference`,
            splitGecEnabled
              ? `Split GEC Courses (${selectedGecCount} selected)`
              : "Split GEC Courses off",
            `Split-session courses (${selectedSplitSessionCount} selected)`,
          ]}
          onEdit={onEditPreferences}
        />
        <ReviewGroup
          title="Course Constraints"
          emptyText="No course constraints selected."
          rows={[
            ...forcedDayRules.map((rule) => {
              const course = forcedCourseMap.get(rule.course_id);
              return `${course?.code ?? `Course #${rule.course_id}`} -> ${rule.day}`;
            }),
            ...fieldCourseCodes.map((courseCode) => `${courseCode} -> Field`),
          ]}
          onEdit={onEditConstraints}
        />
        <ReviewGroup
          title="Automatic Detection"
          emptyText="No automatic preprocessing detected."
        rows={[
          `${availableSplitSessionCount} laboratory course${availableSplitSessionCount === 1 ? "" : "s"} detected`,
          `${selectedSplitSessionCount} lecture component${selectedSplitSessionCount === 1 ? "" : "s"} created`,
          `${affectedSplitCount} course${affectedSplitCount === 1 ? "" : "s"} affected by splitting`,
        ]}
          onEdit={onEditPreferences}
        />
      </div>
      <div className="mt-auto flex shrink-0 flex-wrap justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="h-10 border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
          style={{ borderRadius: 8 }}
        >
          Back
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className="inline-flex h-10 items-center gap-2 bg-[#4e0a10] px-5 text-xs font-black text-white shadow-sm hover:bg-[#6b0e17] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderRadius: 8 }}
        >
          {isGenerating ? <LoadingSpinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          Generate Schedule
        </button>
      </div>
    </section>
  );
}

function filterCourses<T extends { code: string; name: string }>(courses: T[], search: string): T[] {
  const term = search.trim().toLowerCase();
  if (!term) return courses;

  return courses.filter((course) =>
    course.code.toLowerCase().includes(term) ||
    course.name.toLowerCase().includes(term),
  );
}

function formatSemester(semester: string): string {
  if (semester === "summer") return "Summer";
  return semester;
}

function formatTimeBlock(value: TimeBlockOption): string {
  return value === "flexible"
    ? "Flexible"
    : value.charAt(0).toUpperCase() + value.slice(1);
}
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
