import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, CheckCircle2, FlaskConical, MapPin } from "lucide-react";
import SlideOverPanel from "./SlideOverPanel";
import type { Course, Section } from "../types";
import { DAYS } from "../constants";
import { SLOT_MINUTES, type LaboratoryDurationSettings } from "../courseSlotPlan";
import type {
  ClassComponent,
  CourseClassConfig,
  PreferredRoomOption,
  SectionScope,
} from "./courseClassConfig";
import {
  compatibleRoomOptions,
  consecutiveDayRuns,
  DEFAULT_CONSECUTIVE_DAYS,
  defaultDurationMinutes,
  durationShape,
  formatHours,
  hybridLaboratoryMinutes,
  isBackToBack,
  isConsecutive as isConsecutiveConfig,
  isIntegratedShape,
  maxDurationMinutes,
  meetingParts,
  MIN_CONSECUTIVE_DAYS,
  runFrom,
  runLabel,
  teachingWeek,
} from "./courseClassConfig";

const SINGLE_PRESETS = [1, 1.5, 2, 3, 4, 5];
const MEETING_PRESETS = [1, 1.5, 2, 2.5];

interface ConfigureClassSidebarProps {
  course: Course;
  sections: Section[];
  initialConfig: CourseClassConfig;
  isFieldCourse: boolean;
  labSettings?: LaboratoryDurationSettings | null;
  roomOptions: PreferredRoomOption[];
  /**
   * Off, Sunday is not offered as a Required Day (the server refuses it), and
   * a Consecutive Days run cannot reach it.
   */
  sundayClassesEnabled?: boolean;
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

/** One setting: a title row, the control and an optional hint. */
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

/** A one-line explanation under a control; an error replaces it. */
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

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
        active
          ? "border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function HoursInput({
  id,
  value,
  max,
  disabled,
  invalid,
  ariaLabel,
  placeholder,
  onChange,
}: {
  id: string;
  value: number | "";
  max?: number;
  disabled: boolean;
  invalid: boolean;
  ariaLabel: string;
  placeholder?: string;
  onChange: (value: number | "") => void;
}) {
  return (
    <div
      className={`flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-lg border bg-white focus-within:ring-1 ${
        invalid
          ? "border-rose-400 focus-within:ring-rose-500"
          : "border-slate-300 focus-within:border-[#4e0a10] focus-within:ring-[#4e0a10]"
      }`}
    >
      <input
        id={id}
        type="number"
        step="0.5"
        min="0.5"
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid ? true : undefined}
        className="w-full min-w-0 px-2.5 text-xs font-bold text-slate-800 focus:outline-hidden"
      />
      <span className="border-l border-slate-200 bg-slate-100 px-2 py-2 text-[11px] font-black text-slate-600">
        hrs
      </span>
    </div>
  );
}

function ResetLink({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <>
      {" "}
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="font-bold text-[#4e0a10] hover:underline"
      >
        Reset
      </button>
    </>
  );
}

/**
 * Configure Course Right Sidebar
 *
 * Appears from the right edge of the screen as a slide-over sidebar
 * (portaled to document.body, mirroring the main navigation sidebar on the left).
 */
export default function ConfigureClassSidebar({
  course,
  sections,
  initialConfig,
  isFieldCourse,
  labSettings,
  roomOptions,
  sundayClassesEnabled = true,
  disabled,
  onClose,
  onSave,
}: ConfigureClassSidebarProps) {
  const configType = initialConfig.configuration;
  const shape = durationShape(initialConfig);

  // Working local state: Class Component
  // Lecture vs Laboratory is only a choice for a course with laboratory
  // units; any other course is a lecture and the section is not shown.
  const hasLaboratory =
    Number(course.labHours ?? 0) > 0 || course.roomTypeRequired === "laboratory";
  const [component, setComponent] = useState<ClassComponent>(
    initialConfig.component === "field" ? "lecture" : initialConfig.component,
  );

  // Consecutive Days: a Regular class met on back-to-back days, for its full
  // length every day. The days it meets are ticked directly (Thursday,
  // Friday, Saturday) and tried first; with none ticked the Generator picks
  // any run of the chosen number of days.
  const [runEnabled, setRunEnabled] = useState<boolean>(isConsecutiveConfig(initialConfig));
  const isConsecutive = shape === "single" && runEnabled;
  const week = teachingWeek(sundayClassesEnabled);
  const [consecutiveDays, setConsecutiveDays] = useState<number>(
    Math.min(initialConfig.consecutiveDays ?? DEFAULT_CONSECUTIVE_DAYS, week.length),
  );
  const [meetingDays, setMeetingDays] = useState<string[]>(() =>
    initialConfig.preferredStartDay
      ? runFrom(
          initialConfig.preferredStartDay,
          initialConfig.consecutiveDays ?? DEFAULT_CONSECUTIVE_DAYS,
          sundayClassesEnabled,
        )
      : [],
  );
  const daysChosen = meetingDays.length >= MIN_CONSECUTIVE_DAYS;
  const dayCount = daysChosen ? meetingDays.length : consecutiveDays;
  const runs = consecutiveDayRuns(consecutiveDays, sundayClassesEnabled);
  const meetingDaysError = !isConsecutive || meetingDays.length === 0
    ? null
    : !daysChosen
      ? "Tick at least two back-to-back days, or none to let the Generator choose."
      : !isBackToBack(meetingDays)
        ? `${meetingDays.join(", ")} are not back-to-back. Tick the days in between.`
        : null;

  const toggleMeetingDay = (day: string) => {
    const ticked = meetingDays.includes(day)
      ? meetingDays.filter((item) => item !== day)
      : [...meetingDays, day];
    const inWeekOrder = week.filter((item) => ticked.includes(item));
    setMeetingDays(inWeekOrder);
    if (inWeekOrder.length >= MIN_CONSECUTIVE_DAYS) setConsecutiveDays(inWeekOrder.length);
  };

  // A new length keeps the first ticked day, so Thursday + Friday becomes
  // Thursday-Saturday at three days.
  const chooseDayCount = (count: number) => {
    setConsecutiveDays(count);
    if (meetingDays.length > 0) setMeetingDays(runFrom(meetingDays[0], count, sundayClassesEnabled));
  };

  // Custom Time Duration, entered in hours: the whole meeting (each day's,
  // for a Consecutive Days class), or each of the two Split meetings. Hybrid
  // Split is fixed; Integrated is below.
  const perMeeting = shape === "split" ? 2 : 1;
  const editableDuration = shape === "single" || shape === "split";
  const defaultMinutes = defaultDurationMinutes(course);
  const maxMinutes = maxDurationMinutes(course, shape, labSettings);
  const [hours, setHours] = useState<number | "">(
    initialConfig.durationMinutes / 60 / perMeeting,
  );
  const durationMinutes = typeof hours === "number" ? Math.round(hours * 60 * perMeeting) : 0;
  const durationError = editableDuration
    ? hours === "" || durationMinutes <= 0
      ? "Enter a duration."
      : (hours * 60) % SLOT_MINUTES !== 0
        ? "Use whole half-hours, e.g. 1.5 or 2."
        : durationMinutes > maxMinutes
          ? `${course.code} carries at most ${formatHours(maxMinutes / 60)} ${isConsecutive ? "a day" : "a week"}.`
          : null
    : null;

  // Integrated (On-site or Hybrid): the lecture and the laboratory are set
  // separately and used exactly as entered. A blank field keeps the course's
  // own length (one hour per lecture unit; the laboratory at three hours per
  // unit or the department's Custom Lab Duration). No unit-derived total caps
  // the pair; the server only requires each to fit the teaching day.
  const hybridDefaults = hybridLaboratoryMinutes(course, labSettings);
  const [lectureHours, setLectureHours] = useState<number | "">(
    initialConfig.lectureMinutes !== undefined ? initialConfig.lectureMinutes / 60 : "",
  );
  const [laboratoryHours, setLaboratoryHours] = useState<number | "">(
    initialConfig.laboratoryMinutes !== undefined ? initialConfig.laboratoryMinutes / 60 : "",
  );
  const minutesOr = (value: number | "", fallback: number) =>
    typeof value === "number" ? Math.round(value * 60) : fallback;
  const lectureMinutes = minutesOr(lectureHours, hybridDefaults.lecture);
  const laboratoryMinutes = minutesOr(laboratoryHours, hybridDefaults.laboratory);
  const componentError =
    !isIntegratedShape(shape)
      ? null
      : lectureMinutes <= 0 || laboratoryMinutes <= 0
        ? "A lecture or laboratory length must be more than 0 hours."
        : lectureMinutes % SLOT_MINUTES !== 0 || laboratoryMinutes % SLOT_MINUTES !== 0
          ? "Use whole half-hours, e.g. 1.5 or 2."
          : null;

  const [requiredDay, setRequiredDay] = useState<string>(initialConfig.requiredDay ?? "");
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
  // A course is a field course only while a field room is its Preferred
  // Room (or its record requires the field). No preference schedules it like
  // any other minor. Field status is a department rule, so it is saved for
  // every section.
  const fieldRequired = course.roomTypeRequired === "field";
  const selectedRoom = compatibleRooms.find((room) => String(room.id) === preferredRoomId);
  const meetsInField = fieldRequired || selectedRoom?.room_type === "field";
  const classroomOptions = compatibleRooms.filter((room) => room.room_type !== "field");
  const fieldRoomOptions = compatibleRooms.filter((room) => room.room_type === "field");

  // Section scope state
  const [sectionScope, setSectionScope] = useState<SectionScope>(
    initialConfig.sectionScope,
  );
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>(
    initialConfig.selectedSectionIds.length > 0
      ? initialConfig.selectedSectionIds
      : sections.map((s) => s.id),
  );

  const toggleSection = (id: string) => {
    setSelectedSectionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleApply = () => {
    if (durationError || componentError || meetingDaysError) return;
    onSave({
      ...initialConfig,
      component: meetsInField
        ? "field"
        : configType === "integrated" || !hasLaboratory
          ? "lecture"
          : component,
      durationMinutes: editableDuration ? durationMinutes : initialConfig.durationMinutes,
      consecutiveDays: isConsecutive ? dayCount : null,
      preferredStartDay: isConsecutive && daysChosen ? meetingDays[0] : null,
      // A blank session stays unset, so it follows the course's own length.
      ...(isIntegratedShape(shape)
        ? {
            lectureMinutes: lectureHours === "" ? undefined : lectureMinutes,
            laboratoryMinutes: laboratoryHours === "" ? undefined : laboratoryMinutes,
          }
        : {}),
      // A run cannot also be held to one Required Day.
      requiredDay: isConsecutive ? null : requiredDay || null,
      preferredRoomId: preferredRoomId || null,
      sectionScope,
      selectedSectionIds:
        sectionScope === "all" ? sections.map((s) => s.id) : selectedSectionIds,
    });
  };

  const presets = (shape === "split" ? MEETING_PRESETS : SINGLE_PRESETS).filter(
    (preset) => preset * 60 * perMeeting <= maxMinutes,
  );
  // With a Required Day the payload drops the course's Split/Hybrid markers,
  // so it is generated as one meeting on that day. Say so where it is chosen.
  const requiredDayCollapsesShape = requiredDay !== "" && shape !== "single";
  const roomLabel = (room: PreferredRoomOption) =>
    `${room.room_code}${room.building ? ` · ${room.building}` : ""}`;

  return (
    <SlideOverPanel
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
        <div className="flex items-center gap-2">
          <h3 className="text-base font-black tracking-tight">{course.code}</h3>
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
            {configType}
          </span>
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
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
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled || durationError !== null || componentError !== null || meetingDaysError !== null}
            onClick={() => close(handleApply)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white shadow-2xs transition hover:bg-[#34070a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Apply Configuration
          </button>
        </>
      )}
    >
      {/* Class Component: only for a course with laboratory units, or to say
          it meets in the field. */}
      {(hasLaboratory || meetsInField) && (
        <ConfigSection label="Class Component">
          {meetsInField ? (
            <Note tone="emerald">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {fieldRequired
                ? "Field course (required by the course record)."
                : `Field course, meets in ${selectedRoom?.room_code ?? "the field"}.`}
            </Note>
          ) : configType === "integrated" ? (
            <Note tone="slate">
              Lecture + Laboratory, two sessions
              {initialConfig.delivery === "hybrid" ? " (lecture online)." : "."}
            </Note>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {(["lecture", "laboratory"] as const).map((value) => (
                <Chip
                  key={value}
                  active={component === value}
                  disabled={disabled}
                  onClick={() => setComponent(value)}
                >
                  {value === "lecture" ? "Lecture" : "Laboratory"}
                </Chip>
              ))}
            </div>
          )}
        </ConfigSection>
      )}

      {/* Custom Time Duration */}
      <ConfigSection
        label="Custom Time Duration"
        htmlFor={editableDuration ? "configure-duration-hours" : undefined}
        aside={`Default ${formatHours(defaultMinutes / 60)}`}
      >
        {editableDuration ? (
          <>
            <div className="flex items-center gap-1.5">
              <HoursInput
                id="configure-duration-hours"
                value={hours}
                max={maxMinutes / 60 / perMeeting}
                disabled={disabled}
                invalid={durationError !== null}
                ariaLabel={shape === "split" ? "Meeting duration in hours" : "Duration in hours"}
                onChange={setHours}
              />
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={disabled}
                  onClick={() => setHours(preset)}
                  className={`h-9 rounded-lg border px-2 text-xs font-bold transition ${
                    hours === preset
                      ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <Hint error={durationError}>
              {isConsecutive
                ? `${formatHours(durationMinutes / 60)} straight on each of the ${dayCount} days, same time each day · max ${formatHours(maxMinutes / 60)} a day.`
                : shape === "split"
                  ? `Two ${initialConfig.delivery === "online" ? "online " : ""}meetings of ${formatHours(durationMinutes / 120)} · max ${formatHours(maxMinutes / 60)} a week.`
                  : `Max ${formatHours(maxMinutes / 60)} a week.`}
              {durationMinutes !== defaultMinutes && (
                <ResetLink disabled={disabled} onClick={() => setHours(defaultMinutes / 60 / perMeeting)} />
              )}
            </Hint>
          </>
        ) : isIntegratedShape(shape) ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "lecture", label: "Lecture", mode: shape === "hybrid-laboratory" ? "Online" : "F2F", value: lectureHours, set: setLectureHours, fallback: hybridDefaults.lecture },
                  { key: "laboratory", label: "Laboratory", mode: "F2F", value: laboratoryHours, set: setLaboratoryHours, fallback: hybridDefaults.laboratory },
                ] as const
              ).map((part) => (
                <div key={part.key}>
                  <label
                    htmlFor={`configure-${part.key}-hours`}
                    className="mb-1 block text-[11px] font-bold text-slate-600"
                  >
                    {part.label} · {part.mode}
                  </label>
                  <HoursInput
                    id={`configure-${part.key}-hours`}
                    value={part.value}
                    disabled={disabled}
                    invalid={componentError !== null}
                    ariaLabel={`${part.label} duration in hours`}
                    placeholder={`${part.fallback / 60} (default)`}
                    onChange={part.set}
                  />
                </div>
              ))}
            </div>
            <Hint error={componentError}>
              {`Leave blank for the course's own length (${formatHours(hybridDefaults.lecture / 60)} lecture, ${formatHours(hybridDefaults.laboratory / 60)} laboratory).`}
              {(lectureHours !== "" || laboratoryHours !== "") && (
                <ResetLink
                  disabled={disabled}
                  onClick={() => {
                    setLectureHours("");
                    setLaboratoryHours("");
                  }}
                />
              )}
            </Hint>
          </>
        ) : (
          <Note tone="slate">
            Hybrid Split · two separate sessions:{" "}
            {meetingParts(initialConfig, course, labSettings)
              .map((part) => `${formatHours(part.minutes / 60)} ${part.mode}`)
              .join(" + ")}
            {" "}(fixed)
          </Note>
        )}
      </ConfigSection>

      {/* Consecutive Days: a Regular class repeated on back-to-back days */}
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
            Meet on back-to-back days
          </label>
          {runEnabled && (
            <>
              <div
                role="group"
                aria-labelledby="configure-consecutive-days"
                className="mt-2 flex flex-wrap gap-1.5"
              >
                {Array.from(
                  { length: week.length - MIN_CONSECUTIVE_DAYS + 1 },
                  (_, index) => MIN_CONSECUTIVE_DAYS + index,
                ).map((count) => (
                  <Chip
                    key={count}
                    active={dayCount === count}
                    disabled={disabled}
                    onClick={() => chooseDayCount(count)}
                  >
                    {count} days
                  </Chip>
                ))}
              </div>

              <div className="mb-1 mt-2.5 flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span id="configure-meeting-days">Meeting days</span>
                <OptionalTag />
              </div>
              <div
                role="group"
                aria-labelledby="configure-meeting-days"
                className="flex flex-wrap gap-1.5"
              >
                {week.map((day) => {
                  const checked = meetingDays.includes(day);
                  return (
                    <label
                      key={day}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                        checked
                          ? "border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={day}
                        checked={checked}
                        disabled={disabled}
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
                  : `No days ticked: the Generator picks any ${consecutiveDays} back-to-back days (${runs.map(runLabel).join(" · ")}).`}
              </Hint>
            </>
          )}
        </ConfigSection>
      )}

      {/* Required Day */}
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
            // A Sunday already saved stays visible so it can be cleared.
            (day) => day !== "Sunday" || sundayClassesEnabled || requiredDay === "Sunday",
          ).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <Hint>
          {isConsecutive
            ? "Not used with Consecutive Days; set a preferred starting day instead."
            : requiredDayCollapsesShape
              ? "Applies to every section, as one meeting on that day."
              : "Applies to every section."}
        </Hint>
      </ConfigSection>

      {/* Preferred Room */}
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

      {/* Apply To */}
      <ConfigSection label="Apply To">
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { value: "all", label: `All sections (${sections.length})` },
              { value: "selected", label: "Selected sections only" },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold transition ${
                sectionScope === option.value
                  ? "border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="sectionScopeSidebar"
                checked={sectionScope === option.value}
                onChange={() => setSectionScope(option.value)}
                className="h-3.5 w-3.5 accent-[#4e0a10]"
              />
              {option.label}
            </label>
          ))}
        </div>

        {sectionScope === "selected" && (
          <div className="mt-2">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-600">
                Sections ({selectedSectionIds.length}/{sections.length})
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSectionIds(sections.map((s) => s.id))}
                  className="text-[#4e0a10] hover:underline"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSectionIds([])}
                  className="text-slate-600 hover:underline"
                >
                  None
                </button>
              </span>
            </div>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {sections.map((section) => {
                const isChecked = selectedSectionIds.includes(section.id);
                return (
                  <label
                    key={section.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                      isChecked
                        ? "border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSection(section.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-[#4e0a10]"
                    />
                    {section.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </ConfigSection>
    </SlideOverPanel>
  );
}
