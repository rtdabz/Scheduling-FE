import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, CheckCircle2, FlaskConical, MapPin } from "lucide-react";
import SlideOverPanel from "./SlideOverPanel";
import type { Course, Section } from "../types";
import { DAYS } from "../constants";
import { consecutiveMeetingSlots, getCourseSlotPlan, slotsToHours } from "../courseSlotPlan";
import type {
  ClassComponent,
  CourseClassConfig,
  PreferredRoomOption,
  SectionScope,
} from "./courseClassConfig";
import {
  asRegularClass,
  compatibleRoomOptions,
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

export default function ConfigureClassSidebar({
  course,
  sections,
  initialConfig,
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
  const [component, setComponent] = useState<ClassComponent>(
    initialConfig.component === "field" ? "lecture" : initialConfig.component,
  );

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
        : meetingDays.length >= MIN_CONSECUTIVE_DAYS && consecutiveMeetingSlots(course, meetingDays.length) === null
          ? `${course.code}'s ${formatHours(slotsToHours(getCourseSlotPlan(course).totalSlots))} a week cannot be shared equally by ${meetingDays.length} days. Tick a number of days that divides its Total Hours evenly.`
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
  const requiredDayCollapsesShape = requiredDay !== "" && shape !== "single";
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
  const fieldRequired = course.roomTypeRequired === "field";
  const selectedRoom = compatibleRooms.find((room) => String(room.id) === preferredRoomId);
  const meetsInField = fieldRequired || selectedRoom?.room_type === "field";
  const classroomOptions = compatibleRooms.filter((room) => room.room_type !== "field");
  const fieldRoomOptions = compatibleRooms.filter((room) => room.room_type === "field");

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
    if (meetingDaysError || meetingDaysMissing) return;
    const config: CourseClassConfig = {
      ...initialConfig,
      component: meetsInField
        ? "field"
        : configType === "integrated" || !hasLaboratory
          ? "lecture"
          : component,
      consecutiveDays: isConsecutive ? meetingDays.length : null,
      preferredStartDay: isConsecutive ? meetingDays[0] : null,
      meetingDays: isConsecutive ? meetingDays : null,
      requiredDay: isConsecutive ? null : requiredDay || null,
      preferredRoomId: preferredRoomId || null,
      sectionScope,
      selectedSectionIds:
        sectionScope === "all" ? sections.map((s) => s.id) : selectedSectionIds,
    };
    onSave(requiredDayCollapsesShape ? asRegularClass(config) : config);
  };

  const plan = getCourseSlotPlan(course);
  const totalHours = slotsToHours(plan.totalSlots);
  const parts = isConsecutive && daysChosen && !meetingDaysError
    ? meetingParts({ ...initialConfig, consecutiveDays: meetingDays.length }, course)
    : meetingParts({ ...initialConfig, consecutiveDays: null }, course);
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
            disabled={
              disabled ||
              meetingDaysError !== null ||
              meetingDaysMissing
            }
            onClick={() => close(handleApply)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white shadow-2xs transition hover:bg-[#34070a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Apply Configuration
          </button>
        </>
      )}
    >
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

      <ConfigSection label="Class Duration" aside={`Total ${formatHours(totalHours)} / week`}>
        <Note tone="slate">
          {shape === "hybrid-split" ? "Hybrid Split · " : ""}
          {isConsecutive && parts.length > 1
            ? `${formatHours(parts[0].minutes / 60)} on each of the ${parts.length} days`
            : parts
                .map((part) => `${formatHours(part.minutes / 60)}${part.label === "Class" ? "" : ` ${part.label.toLowerCase()}`}${part.mode ? ` ${part.mode}` : ""}`)
                .join(" + ")}
        </Note>
        <Hint error={null}>
          {`From the course's Total Hours (${[
            plan.lectureSlots > 0 && `${formatHours(slotsToHours(plan.lectureSlots))} lecture`,
            plan.laboratorySlots > 0 && `${formatHours(slotsToHours(plan.laboratorySlots))} laboratory`,
          ].filter(Boolean).join(" + ")}${typeof course.lectureMinutes === "number" || typeof course.laboratoryMinutes === "number" ? ", as the curriculum recorded on import" : ""}). The meetings always add up to it.`}
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
