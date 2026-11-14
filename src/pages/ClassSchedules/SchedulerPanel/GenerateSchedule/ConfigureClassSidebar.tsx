import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, CheckCircle2, FlaskConical, MapPin } from "lucide-react";
import SlideOverPanel from "./SlideOverPanel";
import type { Course, Section } from "../types";
import { isFieldSchedulingEligible } from "../schedulingConfigurationEligibility";
import { DAYS } from "../constants";
import { getCourseSlotPlan, slotsToHours } from "../courseSlotPlan";
import type {
  ClassComponent,
  ComponentRequiredDays,
  CourseClassConfig,
  IntegratedComponent,
  PreferredRoomOption,
  SectionScope,
} from "./courseClassConfig";
import {
  asRegularClass,
  compatibleRoomOptions,
  componentRequiredDaysError,
  formatComponentRequiredDays,
  normalizeComponentRequiredDays,
  DEFAULT_CONSECUTIVE_DAYS,
  durationShape,
  formatHours,
  isConsecutive as isConsecutiveConfig,
  meetingParts,
  MIN_CONSECUTIVE_DAYS,
  runFrom,
  runLabel,
  teachingWeek,
} from "./courseClassConfig";

interface ConfigureClassSidebarProps {
  course: Course;
  sections: Section[];
  initialConfig: CourseClassConfig;
  /** Each section's current Lecture/Laboratory Required Days for this course. */
  componentDaysBySection?: Record<string, ComponentRequiredDays | null>;
  isFieldCourse: boolean;
  roomOptions: PreferredRoomOption[];
  sundayClassesEnabled?: boolean;
  preferredDays?: string[];
  disabled: boolean;
  onClose: () => void;
  onSave: (config: CourseClassConfig) => void;
}

function OptionalTag() {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
      Optional
    </span>
  );
}

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800 focus:border-[#4e0a10] focus:ring-1 focus:ring-[#4e0a10] focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60";

const TITLE_CLASS = "text-xs font-black uppercase tracking-wider text-slate-700";

function ConfigSection({
  label,
  htmlFor,
  labelId,
  optional = false,
  aside,
  children,
}: {
  label: string;
  htmlFor?: string;
  labelId?: string;
  optional?: boolean;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={TITLE_CLASS}>
            {label}
          </label>
        ) : (
          <span id={labelId} className={TITLE_CLASS}>
            {label}
          </span>
        )}
        {optional ? (
          <OptionalTag />
        ) : aside ? (
          <span className="text-[11px] font-semibold text-slate-400">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Hint({ error = null, children }: { error?: string | null; children?: ReactNode }) {
  return (
    <p
      role={error ? "alert" : undefined}
      className={`mt-1 text-[11px] font-medium leading-snug ${error ? "font-semibold text-rose-700" : "text-slate-500"}`}
    >
      {error ?? children}
    </p>
  );
}

function Note({ tone, children }: { tone: "emerald" | "slate"; children: ReactNode }) {
  return (
    <p
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${
        tone === "emerald" ? "bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-700"
      }`}
    >
      {children}
    </p>
  );
}

export default function ConfigureClassSidebar({
  course,
  sections,
  initialConfig,
  componentDaysBySection = {},
  isFieldCourse,
  roomOptions,
  sundayClassesEnabled = true,
  preferredDays = [],
  disabled,
  onClose,
  onSave,
}: ConfigureClassSidebarProps) {
  const configType = initialConfig.configuration;
  const shape = durationShape(initialConfig);

  const hasLaboratory =
    Number(course.labHours ?? 0) > 0 || course.roomTypeRequired === "laboratory";
  // The component follows the course's units; it is never picked by hand.
  const inferredComponent: ClassComponent =
    hasLaboratory && !(Number(course.lectureHours ?? 0) > 0 && Number(course.labHours ?? 0) > 0)
      ? "laboratory"
      : "lecture";

  const [runEnabled, setRunEnabled] = useState<boolean>(isConsecutiveConfig(initialConfig));
  const isConsecutive = shape === "single" && runEnabled;
  const week = teachingWeek(sundayClassesEnabled);
  const [meetingDays, setMeetingDays] = useState<string[]>(() =>
    initialConfig.meetingDays && initialConfig.meetingDays.length > 0
      ? week.filter((day) => initialConfig.meetingDays!.includes(day))
      : initialConfig.preferredStartDay
        ? runFrom(
            initialConfig.preferredStartDay,
            initialConfig.consecutiveDays ?? DEFAULT_CONSECUTIVE_DAYS,
            sundayClassesEnabled,
          )
        : [],
  );
  const daysChosen = meetingDays.length >= MIN_CONSECUTIVE_DAYS;
  const daysOutsidePreferred = preferredDays.length > 0
    ? meetingDays.filter((day) => !preferredDays.includes(day))
    : [];
  const meetingDaysError = !isConsecutive
    ? null
    : daysOutsidePreferred.length > 0
      ? `Untick ${daysOutsidePreferred.join(", ")}: the Preferred Days are ${preferredDays.join(", ")}.`
      : meetingDays.length === 1
        ? "Pick at least two days."
        : null;
  const meetingDaysMissing = isConsecutive && meetingDays.length === 0;

  const dayOffered = (day: string) =>
    preferredDays.length === 0 || preferredDays.includes(day);

  const toggleMeetingDay = (day: string) => {
    const ticked = meetingDays.includes(day)
      ? meetingDays.filter((item) => item !== day)
      : [...meetingDays, day];
    setMeetingDays(week.filter((item) => ticked.includes(item)));
  };

  const [requiredDay, setRequiredDay] = useState<string>(initialConfig.requiredDay ?? "");
  const isIntegrated = configType === "integrated";
  // Integrated replaces the course-wide Required Day with one per component,
  // so the existing collapse-to-Regular behavior never applies to it.
  const requiredDayCollapsesShape = !isIntegrated && requiredDay !== "" && shape !== "single";

  const mixedComponentDays = isIntegrated && initialConfig.componentRequiredDays === undefined;
  const [componentDays, setComponentDays] = useState<Record<IntegratedComponent, string>>({
    lecture: initialConfig.componentRequiredDays?.lecture ?? "",
    laboratory: initialConfig.componentRequiredDays?.laboratory ?? "",
  });
  const [componentDaysTouched, setComponentDaysTouched] = useState(false);
  const setComponentDay = (component: IntegratedComponent, day: string) => {
    setComponentDaysTouched(true);
    setComponentDays((current) => ({ ...current, [component]: day }));
  };
  const componentDaysError = isIntegrated
    ? componentRequiredDaysError(componentDays, preferredDays, sundayClassesEnabled)
    : null;
  const mixedSectionSummary = Object.entries(componentDaysBySection)
    .map(([sectionId, days]) => {
      const name = sections.find((section) => section.id === sectionId)?.name ?? sectionId;
      return `${name}: ${formatComponentRequiredDays(days) || "automatic"}`;
    })
    .join("; ");
  const compatibleRooms = useMemo(
    () => compatibleRoomOptions(course, initialConfig, isFieldCourse, roomOptions),
    [course, initialConfig, isFieldCourse, roomOptions],
  );
  const [preferredRoomId, setPreferredRoomId] = useState<string>(
    initialConfig.preferredRoomId &&
      compatibleRooms.some((room) => String(room.id) === initialConfig.preferredRoomId)
      ? initialConfig.preferredRoomId
      : "",
  );
  const fieldRequired = isFieldSchedulingEligible(course) && course.roomTypeRequired === "field";
  const selectedRoom = compatibleRooms.find((room) => String(room.id) === preferredRoomId);
  const meetsInField = fieldRequired || selectedRoom?.room_type === "field";
  const classroomOptions = compatibleRooms.filter((room) => room.room_type !== "field");
  const fieldRoomOptions = compatibleRooms.filter((room) => room.room_type === "field");

  // There is no Apply To choice here: an existing section scope (set when the
  // course was configured for some sections) is kept as it is.
  const sectionScope: SectionScope = initialConfig.sectionScope;

  const handleApply = () => {
    if (meetingDaysError || meetingDaysMissing || componentDaysError) return;
    const keepSectionDays =
      mixedComponentDays && !componentDaysTouched;
    const config: CourseClassConfig = {
      ...initialConfig,
      component: meetsInField
        ? "field"
        : configType === "integrated" || !hasLaboratory
          ? "lecture"
          : inferredComponent,
      consecutiveDays: isConsecutive ? meetingDays.length : null,
      preferredStartDay: isConsecutive ? meetingDays[0] : null,
      meetingDays: isConsecutive ? meetingDays : null,
      requiredDay: isConsecutive || isIntegrated ? null : requiredDay || null,
      componentRequiredDays: !isIntegrated
        ? {}
        : keepSectionDays
          ? undefined
          : (normalizeComponentRequiredDays(componentDays) ?? {}),
      preferredRoomId: preferredRoomId || null,
      sectionScope,
      selectedSectionIds:
        sectionScope === "all" ? sections.map((s) => s.id) : initialConfig.selectedSectionIds,
    };
    onSave(requiredDayCollapsesShape ? asRegularClass(config) : config);
  };

  const plan = getCourseSlotPlan(course);
  const totalHours = slotsToHours(plan.totalSlots);
  const parts = isConsecutive && daysChosen && !meetingDaysError
    ? meetingParts({ ...initialConfig, consecutiveDays: meetingDays.length }, course)
    : meetingParts({ ...initialConfig, consecutiveDays: null }, course);
  const isRun = isConsecutive && parts.length > 1;
  const roomLabel = (room: PreferredRoomOption) =>
    `${room.room_code}${room.building ? ` · ${room.building}` : ""}`;

  return (
    <SlideOverPanel
      variant="modal"
      ariaLabel={`Configure ${course.code}`}
      icon={
        meetsInField ? (
          <MapPin className="h-5 w-5" />
        ) : Number(course.labHours ?? 0) > 0 ? (
          <FlaskConical className="h-5 w-5" />
        ) : (
          <BookOpen className="h-5 w-5" />
        )
      }
      heading={
        <div className="flex flex-wrap items-center gap-2">
          <h3>{course.code}</h3>
          <span className="rounded-md bg-amber-100 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-amber-800">
            {configType}
          </span>
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            {initialConfig.delivery}
          </span>
        </div>
      }
      subheading={course.name}
      onClose={onClose}
      footer={(close) => (
        <>
          <button
            type="button"
            onClick={() => close()}
            className="scheduler-dialog-button rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              disabled ||
              meetingDaysError !== null ||
              meetingDaysMissing ||
              componentDaysError !== null
            }
            onClick={() => close(handleApply)}
            data-variant="primary" className="scheduler-dialog-button inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white shadow-2xs transition hover:bg-[#34070a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Apply Configuration
          </button>
        </>
      )}
    >
      <ConfigSection label="Class Duration" aside={`Total ${formatHours(isRun ? totalHours * parts.length : totalHours)} / week`}>
        <Note tone="slate">
          {shape === "hybrid-split" ? "Hybrid Split · " : ""}
          {isRun
            ? `${formatHours(totalHours)}/day × ${parts.length} days = ${formatHours(totalHours * parts.length)}`
            : parts
                .map((part) => `${formatHours(part.minutes / 60)}${part.label === "Class" ? "" : ` ${part.label.toLowerCase()}`}${part.mode ? ` ${part.mode}` : ""}`)
                .join(" + ")}
        </Note>
        <Hint error={null}>
          {`From the course's Total Hours (${[
            plan.lectureSlots > 0 && `${formatHours(slotsToHours(plan.lectureSlots))} lecture`,
            plan.laboratorySlots > 0 && `${formatHours(slotsToHours(plan.laboratorySlots))} laboratory`,
          ].filter(Boolean).join(" + ")}${typeof course.lectureMinutes === "number" || typeof course.laboratoryMinutes === "number" ? ", as the curriculum recorded on import" : ""}). ${isRun ? "Each selected day repeats it in full; academic units are unchanged." : "The meetings always add up to it."}`}
        </Hint>
      </ConfigSection>

      {shape === "single" && (
        <ConfigSection label="Consecutive Days" labelId="configure-consecutive-days" optional>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              checked={runEnabled}
              disabled={disabled}
              onChange={(e) => setRunEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-[#4e0a10]"
            />
            Meet on several days a week
          </label>
          {runEnabled && (
            <>
              <div className="mb-1 mt-2.5 text-[11px] font-bold text-slate-600">
                <span id="configure-meeting-days">Meeting days</span>
              </div>
              <div
                role="group"
                aria-labelledby="configure-meeting-days"
                className="flex flex-wrap gap-1.5"
              >
                {week.map((day) => {
                  const checked = meetingDays.includes(day);
                  const offered = dayOffered(day) || checked;
                  return (
                    <label
                      key={day}
                      title={offered ? undefined : `${day} is not one of the Preferred Days.`}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                        !offered
                          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                          : checked
                            ? "cursor-pointer border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]"
                            : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={day}
                        checked={checked}
                        disabled={disabled || !offered}
                        onChange={() => toggleMeetingDay(day)}
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-[#4e0a10]"
                      />
                      {day.slice(0, 3)}
                    </label>
                  );
                })}
              </div>
              <Hint error={meetingDaysError}>
                {daysChosen
                  ? `Every section meets ${runLabel(meetingDays)}; the Generator picks each section's time and room.`
                  : preferredDays.length > 0
                    ? `Pick the days the class meets, from the Preferred Days (${preferredDays.join(", ")}).`
                    : "Pick the days the class meets, e.g. Monday, Wednesday and Friday."}
              </Hint>
            </>
          )}
        </ConfigSection>
      )}

      {isIntegrated ? (
        <>
          {(["lecture", "laboratory"] as const).map((component) => {
            const label = component === "lecture" ? "Lecture" : "Laboratory";
            const id = `configure-${component}-required-day`;
            const value = componentDays[component];
            return (
              <ConfigSection key={component} label={`${label} Required Day`} htmlFor={id} optional>
                <select
                  id={id}
                  value={value}
                  disabled={disabled}
                  aria-invalid={componentDaysError !== null && value !== "" ? true : undefined}
                  aria-describedby="configure-component-days-hint"
                  onChange={(e) => setComponentDay(component, e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">{mixedComponentDays && !componentDaysTouched ? "Keep each section's day" : "Automatic"}</option>
                  {DAYS.filter(
                    (day) => day !== "Sunday" || sundayClassesEnabled || value === "Sunday",
                  ).map((day) => (
                    <option key={day} value={day} disabled={!dayOffered(day) && value !== day}>
                      {day}
                    </option>
                  ))}
                </select>
              </ConfigSection>
            );
          })}
          <div id="configure-component-days-hint" className="-mt-2">
            <Hint error={componentDaysError}>
              {mixedComponentDays && !componentDaysTouched
                ? `Sections use different days (${mixedSectionSummary}). Choosing a day applies both values to the sections below.`
                : "Applies to the sections below, for this generation only. Automatic lets the Generator choose; the lecture and laboratory always meet on different days."}
            </Hint>
          </div>
        </>
      ) : (
      <ConfigSection label="Required Day" htmlFor="configure-required-day" optional>
        <select
          id="configure-required-day"
          value={isConsecutive ? "" : requiredDay}
          disabled={disabled || isConsecutive}
          onChange={(e) => setRequiredDay(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">None</option>
          {DAYS.filter(
            (day) => day !== "Sunday" || sundayClassesEnabled || requiredDay === "Sunday",
          ).map((day) => (
            <option key={day} value={day} disabled={!dayOffered(day) && requiredDay !== day}>
              {day}
            </option>
          ))}
        </select>
        <Hint>
          {isConsecutive
            ? "Not used with Consecutive Days; the ticked meeting days apply instead."
            : requiredDayCollapsesShape
              ? `Applies to every section, as one meeting on that day: ${course.code} becomes a Regular class.`
              : "Applies to every section."}
        </Hint>
      </ConfigSection>
      )}

      <ConfigSection label="Preferred Room" htmlFor="configure-preferred-room" optional>
        {compatibleRooms.length === 0 ? (
          <Hint>
            {initialConfig.delivery === "online"
              ? "Online classes do not use a room."
              : fieldRequired
                ? "No field room is available."
                : "No compatible room is available."}
          </Hint>
        ) : (
          <>
            <select
              id="configure-preferred-room"
              value={preferredRoomId}
              disabled={disabled}
              onChange={(e) => setPreferredRoomId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">No preference</option>
              {classroomOptions.map((room) => (
                <option key={room.id} value={String(room.id)}>
                  {roomLabel(room)}
                </option>
              ))}
              {fieldRoomOptions.length > 0 && !fieldRequired && classroomOptions.length > 0 ? (
                <optgroup label="Field (makes this a field course)">
                  {fieldRoomOptions.map((room) => (
                    <option key={room.id} value={String(room.id)}>
                      {roomLabel(room)}
                    </option>
                  ))}
                </optgroup>
              ) : (
                fieldRoomOptions.map((room) => (
                  <option key={room.id} value={String(room.id)}>
                    {roomLabel(room)}
                  </option>
                ))
              )}
            </select>
            {!fieldRequired && meetsInField !== isFieldCourse && (
              <Hint>
                {meetsInField
                  ? `Makes ${course.code} a field course for the whole department.`
                  : `Makes ${course.code} a regular class for the whole department.`}
              </Hint>
            )}
          </>
        )}
      </ConfigSection>
    </SlideOverPanel>
  );
}
