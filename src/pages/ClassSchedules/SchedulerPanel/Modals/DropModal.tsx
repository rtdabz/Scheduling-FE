import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarPlus, CheckCircle2, ChevronDown, Clock, Info, Lightbulb, MapPin, Monitor, Sparkles, TreePine, X } from "lucide-react";
import { DAYS, getCategoryStyles, slotToTimeStr } from "../constants";
import api from "../../../../lib/api";
import { requiredRoomTypeForMeeting } from "../hooks/useConflict";
import { FULL_DAY_NAMES, slotCount, slotToTime24h, timeToSlot } from "../../../../lib/timeGrid";
import type { DeliveryMode, DropContext, ScheduleItem, Section, Subject, Room, ScheduleStatus, Semester } from "../types";
import { getSubjectTotalSlots } from "../types";
import { getCourseSlotPlan, laboratoryComponentSlots, SLOT_MINUTES, SLOTS_PER_HOUR, slotsToHours, type LaboratoryDurationSettings } from "../courseSlotPlan";
import { evaluatePlacementQuality, type PlannedMeeting } from "../placementQuality";
import {
  isFieldSchedulingEligible,
  isHybridSchedulingEligible,
  isHybridSplitEligible,
  balancedSplitSettingsOf,
  isBalancedSplitSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import { describeWindow } from "../../../../lib/roomRequests";

interface DropRecommendationRow {
  semester_id: number;
  section_id: number;
  course_id: number;
  faculty_id: number | null;
  room_id: number | null;
  department_id: number;
  day: string;
  start_time: string;
  end_time: string;
  mode: DeliveryMode;
  is_hybrid: boolean;
  preferred_pattern: string | null;
  status: ScheduleStatus;
}

interface DropRecommendation {
  /** Lets select save exactly this previewed plan instead of solving again. */
  plan_id?: string;
  rank: number;
  score: number;
  schedules: DropRecommendationRow[];
}

interface DropRecommendationResponse {
  recommendations: DropRecommendation[];
}

/** One placement the Rule Engine accepts, from /available-slots. */
interface AvailableSlot {
  day: string;
  day_index: number;
  start_slot: number;
  end_slot: number;
  start_time: string;
  end_time: string;
  mode: DeliveryMode;
  room_id: number | null;
  room_code: string;
  room_type: string;
}

interface AvailableSlotRoom {
  room_id: number | null;
  room_code: string;
  room_type: string;
  mode: DeliveryMode;
  slot_count: number;
}

/**
 * Identity for the room filter. Online carries no room id, so the mode stands
 * in for one — keying on `room_id` alone folded Online into the "all" bucket.
 */
/** Two meetings at one start time: a Split Session or a Hybrid Split. */
const isSameTimePairRecommendation = (recommendation: DropRecommendation): boolean =>
  recommendation.schedules.length === 2
  && recommendation.schedules[0].start_time === recommendation.schedules[1].start_time
  && recommendation.schedules[0].day !== recommendation.schedules[1].day;

const slotRoomKey = (entry: { mode: DeliveryMode; room_id: number | null }): string =>
  entry.room_id == null ? entry.mode : String(entry.room_id);

interface AvailableSlotsResponse {
  slots: AvailableSlot[];
  rooms: AvailableSlotRoom[];
  total: number;
  truncated: boolean;
}

/** "All rooms" in the room filter, which is not a room id. */
const ALL_ROOMS = "__all__";

/** Short delivery names, for the "F2F | Online" shape of a split. */
const DELIVERY_SHORT_LABEL: Record<DeliveryMode, string> = {
  "on-site": "F2F",
  online: "Online",
  field: "Field",
};

interface SelectedRecommendationResponse {
  recommendation: {
    id: number;
    recommended_schedules: DropRecommendationRow[];
  };
}

interface ConfigurationConfirmation {
  schema_version: 1;
  configuration_fingerprint: string;
  confirmed_warning_rule_ids: string[];
}

interface ConfigurationConfirmationError {
  error_code?: string;
  message?: string;
  configuration_confirmation?: {
    schema_version?: number;
    configuration_fingerprint?: string;
    required_warning_rule_ids?: string[];
  };
}

type ConfigurationConfirmationPrompt = NonNullable<ConfigurationConfirmationError["configuration_confirmation"]>;

const recommendationRoomId = (row: DropRecommendationRow): string => {
  if (row.mode === "online") return "online";
  if (row.mode === "field") return "field";
  return row.room_id == null ? "tba" : String(row.room_id);
};

const stableRecommendationSeed = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 1_000_000) + 1;
};

interface DropModalProps {
  rooms: Room[];
  sections: Section[];
  schedules: ScheduleItem[];
  selectedSectionId: string;
  activeSemester: Semester | null;
  dropContext: DropContext | null;
  dropSubject: Subject | null;
  dropSubjectIsField: boolean;
  modalRoomId: string;
  setModalRoomId: (value: string) => void;
  modalClassMode: "on-site" | "online" | "field";
  setModalClassMode: (value: "on-site" | "online" | "field") => void;
  modalDay2RoomId: string;
  setModalDay2RoomId: (value: string) => void;
  modalDay2ClassMode: "on-site" | "online" | "field";
  setModalDay2ClassMode: (value: "on-site" | "online" | "field") => void;
  modalIsHybrid: boolean;
  setModalIsHybrid: (value: boolean) => void;
  modalSplitEnabled: boolean;
  setModalSplitEnabled: (value: boolean) => void;
  modalFieldEnabled: boolean;
  setModalFieldEnabled: (value: boolean) => void;
  modalForceDayEnabled: boolean;
  setModalForceDayEnabled: (value: boolean) => void;
  modalForcedDayIndex: number;
  setModalForcedDayIndex: (value: number) => void;
  /** Recommendation routes require `schedule.generate`, not a particular role. */
  canGenerateSchedule: boolean;
  manualSchedulingSettings: (LaboratoryDurationSettings & {
    forced_day_rules?: Array<{ course_id: number; day: string }>;
    field_course_codes?: string[];
    lecture_lab_schedule_override_enabled?: boolean;
    gec_split_schedule_override_enabled?: boolean;
    major_lecture_split_schedule_override_enabled?: boolean;
  }) | null;
  modalPreferredPattern: string | null;
  setModalPreferredPattern: (value: string | null) => void;
  modalDay1Index: number;
  setModalDay1Index: (value: number) => void;
  modalDay2Index: number;
  setModalDay2Index: (value: number) => void;
  modalDay1StartSlot: number;
  setModalDay1StartSlot: (value: number) => void;
  modalDay1Duration: number;
  setModalDay1Duration: (value: number) => void;
  modalDay2StartSlot: number;
  setModalDay2StartSlot: (value: number) => void;
  modalDay2Duration: number;
  setModalDay2Duration: (value: number) => void;
  isDay2ModifiedByUser: boolean;
  setIsDay2ModifiedByUser: (value: boolean) => void;
  modalValidationError: string;
  setModalValidationError: (value: string) => void;
  modalConflict: string | null;
  /** This open dialog showed a conflict at some point. */
  modalWasConflicted?: boolean;
  isModalLoading: boolean;
  selectedRecommendationId: number | null;
  setSelectedRecommendationId: (value: number | null) => void;
  setDropContext: (value: DropContext | null) => void;
  handleModalConfirm: (e: React.FormEvent) => void;
  checkConflict: (
    subjectId: string,
    sectionId: string,
    facultyId: string | null,
    roomId: string,
    dayIndex: number,
    startSlot: number,
    durationSlots: number,
    excludeScheduleId?: string | string[],
    preferredPattern?: string | null
  ) => { conflictType: "section" | "room" | "faculty"; message: string } | null;
}

const getDayIndex = (day: string): number => {
  const fullIndex = FULL_DAY_NAMES.findIndex((item) => item.toLowerCase() === day.toLowerCase());
  if (fullIndex >= 0) return fullIndex;
  return DAYS.findIndex((item) => item.toLowerCase() === day.toLowerCase());
};

const getRecommendationRoomLabel = (row: DropRecommendationRow, rooms: Room[]): string => {
  const room = rooms.find((item) => Number(item.id) === row.room_id);
  if (room) return room.name;
  if (row.mode === "online") return "Online";
  if (row.mode === "field") return "Field";
  if (row.room_id == null) return "Room TBA";
  return "Recommended room";
};

const ROOM_TBA = "tba";

type ClassMode = "on-site" | "online" | "field";

const CLASS_MODE_OPTIONS: { value: ClassMode; label: string; Icon: typeof Building2 }[] = [
  { value: "on-site", label: "On-Site", Icon: Building2 },
  { value: "online", label: "Online", Icon: Monitor },
  { value: "field", label: "Field", Icon: TreePine },
];

const fieldLabelClass = "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500";
const selectClass = "h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

interface MeetingCardProps {
  title: string;
  mode: ClassMode;
  isModeDisabled: (mode: ClassMode) => boolean;
  modeTitle: (mode: ClassMode) => string | undefined;
  onModeSelect: (mode: ClassMode) => void;
  roomId: string;
  onRoomChange: (roomId: string) => void;
  hasRoomError: boolean;
  allowsRoomTba: boolean;
  roomOptions: Room[];
  dayAriaLabel: string;
  dayValue: number;
  dayDisabled: boolean;
  dayOptions: { value: number; label: string; disabled?: boolean }[];
  onDayChange: (dayIndex: number) => void;
  startSlot: number;
  startDisabled?: boolean;
  startOptionCount: number;
  onStartChange: (slot: number) => void;
  durationSlots: number;
  /**
   * Set only where the length is the user's to choose -- Integrated's lecture
   * and laboratory, as in Setup Courses. Every other shape takes its length
   * from the course, so the card shows it and does not offer it.
   */
  onDurationChange?: (slots: number) => void;
  /** The longest this meeting may run: the week's ceiling less its partner, and the day's end. */
  maxDurationSlots?: number;
  endLabelSuffix?: string;
}

/**
 * One meeting's delivery, room, day and time.
 *
 * The first and second meeting used to be two ~190-line copies of the same
 * markup that had already drifted (label spacing, cursor styles). They differ
 * only in the values and rules passed in here.
 */
function MeetingCard({
  title,
  mode,
  isModeDisabled,
  modeTitle,
  onModeSelect,
  roomId,
  onRoomChange,
  hasRoomError,
  allowsRoomTba,
  roomOptions,
  dayAriaLabel,
  dayValue,
  dayDisabled,
  dayOptions,
  onDayChange,
  startSlot,
  startDisabled = false,
  startOptionCount,
  onStartChange,
  durationSlots,
  onDurationChange,
  maxDurationSlots,
  endLabelSuffix,
}: MeetingCardProps) {
  return (
    <div className="relative space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="flex items-center gap-2 pr-20 text-sm font-black text-slate-900">
        {title}
      </h4>
      <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
        <Clock className="h-3 w-3" />
        {slotsToHours(durationSlots)} hrs
      </span>

      <div>
        <span className={fieldLabelClass}>Class mode</span>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {CLASS_MODE_OPTIONS.map(({ value, label, Icon }) => {
            const isSelected = mode === value;
            const disabled = isModeDisabled(value);
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                title={modeTitle(value)}
                onClick={() => { if (!disabled) onModeSelect(value); }}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-bold transition-colors ${
                  isSelected
                    ? "cursor-default bg-[#4e0a10] text-white shadow-sm"
                    : disabled
                      ? "cursor-not-allowed text-slate-300"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={fieldLabelClass}>Room</span>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            {mode === "on-site" ? (
              <>
                <select
                  aria-label={`${title} room`}
                  value={roomId}
                  onChange={(event) => onRoomChange(event.target.value)}
                  className={`${selectClass} pl-9 pr-8 ${hasRoomError ? "border-red-300 ring-2 ring-red-100" : ""}`}
                >
                  <option value="">Select a room...</option>
                  {allowsRoomTba && <option value={ROOM_TBA}>Room TBA (assign later)</option>}
                  {roomOptions.map((room) => {
                    const isUnavailable = room.status === "not available";
                    return (
                      <option key={room.id} value={room.id} disabled={isUnavailable}>
                        {room.name}
                        {room.grantWindows ? ` — Granted: ${room.grantWindows.map(describeWindow).join(", ")}` : ""}
                        {isUnavailable ? " — (Not Available)" : ""}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </>
            ) : (
              <input
                type="text"
                readOnly
                value={mode === "online" ? "Online" : "Field"}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-500 outline-none"
              />
            )}
          </div>
        </div>

        <div>
          <span className={fieldLabelClass}>Meeting day</span>
          <div className="relative">
            <select
              aria-label={dayAriaLabel}
              value={dayValue}
              disabled={dayDisabled}
              onChange={(event) => onDayChange(Number(event.target.value))}
              className={`${selectClass} pl-3 pr-8`}
            >
              {dayOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        <div>
          <span className={fieldLabelClass}>Start time</span>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              aria-label={`${title} start time`}
              value={startSlot}
              disabled={startDisabled}
              title={startDisabled ? "Both meetings share the first meeting's time." : undefined}
              onChange={(event) => onStartChange(Number(event.target.value))}
              className={`${selectClass} pl-9 pr-8`}
            >
              {Array.from({ length: Math.max(1, startOptionCount) }, (_, slot) => (
                <option key={slot} value={slot}>{slotToTimeStr(slot)}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {onDurationChange && (
          <div>
            <span className={fieldLabelClass}>Duration</span>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                aria-label={`${title} duration`}
                value={durationSlots}
                onChange={(event) => onDurationChange(Number(event.target.value))}
                className={`${selectClass} pl-9 pr-8`}
              >
                {Array.from(
                  { length: Math.max(1, maxDurationSlots ?? durationSlots, durationSlots) },
                  (_, index) => index + 1,
                ).map((slots) => (
                  <option key={slots} value={slots}>
                    {slotsToHours(slots)} hr{slots === SLOTS_PER_HOUR ? "" : "s"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        )}

        <div>
          <span className={fieldLabelClass}>End time{endLabelSuffix ? ` ${endLabelSuffix}` : ""}</span>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              readOnly
              aria-disabled="true"
              value={slotToTimeStr(startSlot + durationSlots)}
              className="h-10 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-500 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DropModal({
  rooms,
  sections,
  schedules,
  selectedSectionId,
  activeSemester,
  dropContext,
  dropSubject,
  dropSubjectIsField,
  modalRoomId,
  setModalRoomId,
  modalClassMode,
  setModalClassMode,
  modalDay2RoomId,
  setModalDay2RoomId,
  modalDay2ClassMode,
  setModalDay2ClassMode,
  modalIsHybrid,
  setModalIsHybrid,
  modalSplitEnabled,
  setModalSplitEnabled,
  modalFieldEnabled,
  modalForceDayEnabled,
  setModalForceDayEnabled,
  modalForcedDayIndex,
  canGenerateSchedule,
  manualSchedulingSettings,
  modalPreferredPattern,
  setModalPreferredPattern,
  modalDay1Index,
  setModalDay1Index,
  modalDay2Index,
  setModalDay2Index,
  modalDay1StartSlot,
  setModalDay1StartSlot,
  modalDay1Duration,
  setModalDay1Duration,
  modalDay2StartSlot,
  setModalDay2StartSlot,
  modalDay2Duration,
  setModalDay2Duration,
  setIsDay2ModifiedByUser,
  modalValidationError,
  setModalValidationError,
  modalConflict,
  modalWasConflicted = false,
  isModalLoading,
  selectedRecommendationId,
  setSelectedRecommendationId,
  setDropContext,
  handleModalConfirm
}: DropModalProps) {
  const isSummerSemester = activeSemester?.semester === "summer";
  const availableDays = isSummerSemester ? DAYS.slice(0, 5) : DAYS;
  const hasBoth = dropSubject && Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
  const hasLaboratoryUnits = Number(dropSubject?.labHours ?? 0) > 0;
  const [recommendations, setRecommendations] = useState<DropRecommendation[]>([]);
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(false);
  // Seed of the payload the panel last finished loading. While it differs from
  // the current payload the shown results are stale (or debouncing), so the
  // panel shows the loading state without setting state inside the effect.
  const [loadedRecommendationSeed, setLoadedRecommendationSeed] = useState<number | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [confirmationPrompt, setConfirmationPrompt] = useState<ConfigurationConfirmationPrompt | null>(null);
  const [confirmedConfiguration, setConfirmedConfiguration] = useState<ConfigurationConfirmation | null>(null);
  const [appliedRecommendationRank, setAppliedRecommendationRank] = useState<number | null>(null);
  const [isApplyingRecommendation, setIsApplyingRecommendation] = useState(false);



  // Alternatives open automatically on a conflict, or on request for a placement
  // that is valid but not what the generator would choose.
  const [areRecommendationsRequested, setAreRecommendationsRequested] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [availableSlotRooms, setAvailableSlotRooms] = useState<AvailableSlotRoom[]>([]);
  const [areSlotsTruncated, setAreSlotsTruncated] = useState(false);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [roomFilter, setRoomFilter] = useState<string>(ALL_ROOMS);
  /** Which half of a two-meeting pattern the slot list is answering for. */
  const [slotMeeting, setSlotMeeting] = useState<"first" | "second">("first");

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = canGenerateSchedule;
  const hasConflict = !!modalConflict;
  const shouldShowRecommendations = canUseRecommendations && (hasConflict || areRecommendationsRequested);
  const isTwoMeetingPattern = modalIsHybrid || modalSplitEnabled;
  // Split Session and Hybrid Split meet at one time on both days; only a
  // course with a laboratory gives its second meeting a time of its own.
  const isSameTimePair = isTwoMeetingPattern && !hasLaboratoryUnits;
  // Integrated is a lecture plus a laboratory, as in Generate Schedule. Its
  // delivery is carried by the lecture meeting -- online for Hybrid,
  // face-to-face for On-Site -- so there is one source of truth for it.
  const isIntegrated = Boolean(modalIsHybrid && hasBoth);
  const isIntegratedOnSite = isIntegrated && modalDay2ClassMode !== "online";
  const tentativeSchedules = useMemo(() => schedules
    .filter((schedule) => !(
      String(schedule.sectionId) === String(selectedSectionId)
      && String(schedule.courseId ?? schedule.subjectId) === String(dropSubject?.id)
    ))
    .map((schedule) => {
      const numericId = Number(schedule.id);
      const numericRoomId = Number(schedule.roomId);
      const virtualRoom = rooms.find((room) => room.roomType === schedule.mode);

      return {
        ...(!Number.isNaN(numericId) ? { id: numericId } : {}),
        semester_id: schedule.semesterId,
        section_id: Number(schedule.sectionId),
        course_id: Number(schedule.courseId ?? schedule.subjectId),
        faculty_id: schedule.facultyId ? Number(schedule.facultyId) : null,
        room_id: !Number.isNaN(numericRoomId) && numericRoomId > 0
          ? numericRoomId
          : (schedule.mode === "online" || schedule.mode === "field")
            ? Number(virtualRoom?.id) || null
            : null,
        department_id: schedule.departmentId,
        day: schedule.day || FULL_DAY_NAMES[schedule.dayIndex],
        start_time: slotToTime24h(schedule.startSlot),
        end_time: slotToTime24h(schedule.startSlot + schedule.durationSlots),
        mode: schedule.mode,
      };
    }), [dropSubject?.id, rooms, schedules, selectedSectionId]);

  /**
   * The exhaustive slot query. It asks for every delivery at once rather than
   * the meeting's current mode: a Split Session whose second meeting is online
   * still needs somewhere online to put it, and pinning the query to the first
   * meeting's mode left the list showing rooms only. The server drops the
   * deliveries this course cannot take, so asking for all three is safe.
   *
   * Length still matters, so a duration change re-asks.
   */
  /**
   * The meeting the slot list is answering for.
   *
   * An Integrated pair is two different questions: a 3-hour on-site laboratory
   * and a 2-hour online lecture. One list cannot serve both — asked with the
   * laboratory's length and no meeting type, the server rightly refused every
   * online candidate (a laboratory course cannot go online), so a conflict on
   * the lecture half had no offered slot that would fix it.
   *
   * `meeting_type` is what lets the lecture half go online:
   * SchedulingPolicy::allowsOnlineRoomFallback applies the lecture rule when a
   * row names itself a lecture, rather than refusing it for the laboratory
   * metadata its parent course carries.
   */
  const slotMeetingPlan = useMemo(() => {
    const hasPartner = isTwoMeetingPattern && modalDay2Duration > 0;
    const isSecond = hasPartner && slotMeeting === "second";
    // A same-time pair is intersected across both its days, so it must keep
    // seeing both; every other two-meeting shape loses its partner's day.
    const excludedDays = hasPartner && !isSameTimePair
      ? [FULL_DAY_NAMES[isSecond ? modalDay1Index : modalDay2Index]]
      : [];

    return isSecond
      ? { durationSlots: modalDay2Duration, meetingType: "lecture" as const, excludedDays }
      : {
          durationSlots: modalDay1Duration,
          meetingType: modalIsHybrid ? ("laboratory" as const) : isTwoMeetingPattern ? ("lecture" as const) : null,
          excludedDays,
        };
  }, [
    isTwoMeetingPattern, isSameTimePair, slotMeeting,
    modalDay1Duration, modalDay2Duration, modalDay1Index, modalDay2Index, modalIsHybrid,
  ]);

  /**
   * The day the placement was dropped on -- where it collided. Both the ranked
   * options and the full list look on that day first and then move day by day
   * through the rest of the week. Read from dropContext, which holds still
   * while the dialog is open, so applying an option on another day does not
   * re-solve and reshuffle the list under the user.
   */
  const searchFromDay = dropContext ? FULL_DAY_NAMES[dropContext.dayIndex] : undefined;

  const availableSlotsPayload = useMemo(() => {
    if (!dropSubject || !selectedSectionId) return null;
    // getSubjectTotalSlots rather than the `totalSlots` const below: this memo
    // runs before that declaration in the component body.
    const durationSlots = slotMeetingPlan.durationSlots > 0
      ? slotMeetingPlan.durationSlots
      : getSubjectTotalSlots(dropSubject);
    if (durationSlots <= 0) return null;

    return {
      section_id: Number(selectedSectionId),
      course_id: Number(dropSubject.id),
      duration_slots: durationSlots,
      meeting_type: slotMeetingPlan.meetingType,
      // split_group_day_separation: two meetings of one course may not share a
      // day, so the day its partner holds is not on offer. Excluded at the
      // source rather than filtered here, so each room's count still matches
      // the slots listed under it. A same-time pair is exempt: its view needs
      // both days to intersect them.
      excluded_days: slotMeetingPlan.excludedDays,
      tentative_schedules: tentativeSchedules,
      ...(searchFromDay ? { search_from_day: searchFromDay } : {}),
    };
  }, [dropSubject, selectedSectionId, slotMeetingPlan, tentativeSchedules, searchFromDay]);

  useEffect(() => {
    if (!shouldShowRecommendations || !availableSlotsPayload) {
      setAvailableSlots([]);
      setAvailableSlotRooms([]);
      setAreSlotsTruncated(false);

      return;
    }

    let active = true;
    const controller = new AbortController();
    setIsSlotsLoading(true);

    // Debounced on the same rhythm as the preview: dragging a start time
    // through a select fires this on every keystroke otherwise.
    const timerId = window.setTimeout(() => {
      void api.post<AvailableSlotsResponse>(
        "/schedule-recommendations/available-slots",
        availableSlotsPayload,
        { signal: controller.signal },
      ).then((response) => {
        if (!active) return;
        setAvailableSlots(response.data.slots ?? []);
        setAvailableSlotRooms(response.data.rooms ?? []);
        setAreSlotsTruncated(Boolean(response.data.truncated));
      }).catch(() => {
        if (!active) return;
        // The ranked options above still stand on their own, so a failure here
        // narrows the panel rather than breaking it.
        setAvailableSlots([]);
        setAvailableSlotRooms([]);
        setAreSlotsTruncated(false);
      }).finally(() => {
        if (active) setIsSlotsLoading(false);
      });
    }, 350);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timerId);
      setIsSlotsLoading(false);
    };
  }, [shouldShowRecommendations, availableSlotsPayload]);

  // Turning the pattern off leaves no second meeting to answer for.
  useEffect(() => {
    if (!isTwoMeetingPattern || modalDay2Duration <= 0) setSlotMeeting("first");
  }, [isTwoMeetingPattern, modalDay2Duration]);

  // A room that no longer has any valid slot must not keep filtering the list.
  useEffect(() => {
    if (roomFilter === ALL_ROOMS) return;
    if (!availableSlotRooms.some((room) => slotRoomKey(room) === roomFilter)) {
      setRoomFilter(ALL_ROOMS);
    }
  }, [availableSlotRooms, roomFilter]);

  const visibleSlots = useMemo(
    () => (roomFilter === ALL_ROOMS
      ? availableSlots
      : availableSlots.filter((slot) => slotRoomKey(slot) === roomFilter)),
    [availableSlots, roomFilter],
  );

  /**
   * Start times a Split Session could move to as a whole.
   *
   * Both meetings of a same-time pair are hard-locked to one start, so a time
   * only works when it is free on *both* pattern days — for the first meeting
   * in its own room and mode, and for the second in its own. Offering the two
   * days separately would have let the user pick a Monday time the Wednesday
   * half could not take, and applying a single slot to a split silently
   * collapsed it back to one meeting.
   *
   * The meetings' rooms and deliveries are read as the user set them, so a
   * manually chosen F2F | Online pair survives the search.
   */
  const splitPairStarts = useMemo(() => {
    if (!isSameTimePair || modalDay2Duration <= 0) return null;

    const matches = (slot: AvailableSlot, mode: DeliveryMode, roomId: string): boolean =>
      slot.mode === mode && (mode !== "on-site" || String(slot.room_id) === roomId);
    const firstDay = FULL_DAY_NAMES[modalDay1Index];
    const secondDay = FULL_DAY_NAMES[modalDay2Index];
    const firstStarts = new Map<number, AvailableSlot>();
    const secondStarts = new Set<number>();

    availableSlots.forEach((slot) => {
      if (slot.day === firstDay && matches(slot, modalClassMode, modalRoomId)) {
        firstStarts.set(slot.start_slot, slot);
      }
      if (slot.day === secondDay && matches(slot, modalDay2ClassMode, modalDay2RoomId)) {
        secondStarts.add(slot.start_slot);
      }
    });

    return [...firstStarts.entries()]
      .filter(([startSlot]) => secondStarts.has(startSlot))
      .map(([startSlot, slot]) => ({ startSlot, endSlot: slot.end_slot }))
      .sort((left, right) => left.startSlot - right.startSlot);
  }, [
    isSameTimePair, modalDay2Duration, availableSlots,
    modalDay1Index, modalDay2Index, modalClassMode, modalRoomId, modalDay2ClassMode, modalDay2RoomId,
  ]);

  /**
   * Moves the whole split to one start time. Days, rooms and deliveries are
   * left exactly as they are: only the time was in question.
   */
  const applySplitPairStart = (startSlot: number): void => {
    setModalDay1StartSlot(startSlot);
    setModalDay2StartSlot(startSlot);
    setModalValidationError("");
    discardSelectedRecommendation();
  };

  /** Day -> its slots, in the order the server already sorted them. */
  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, AvailableSlot[]>();
    visibleSlots.forEach((slot) => {
      const existing = grouped.get(slot.day);
      if (existing) existing.push(slot);
      else grouped.set(slot.day, [slot]);
    });

    return [...grouped.entries()];
  }, [visibleSlots]);

  /**
   * The delivery the ranked alternatives are solved for.
   *
   * Online is deliberately excluded: trying Online on one meeting is not a
   * course-wide rule, and feeding it here turned every alternative online.
   * Field is not the same kind of choice -- a field class cannot be in a room
   * at all, so leaving it out recommended lecture rooms for a meeting the user
   * had already set to Field. Deriving the flag rather than reading
   * modalClassMode in the deps keeps the Online switch from re-solving.
   */
  const previewMode = modalFieldEnabled || modalClassMode === "field" ? "field" : "on-site";

  /**
   * A Split Session with exactly one online meeting is a Hybrid Split: two
   * equal meetings, one face-to-face and one online. Telling the solver so
   * keeps the alternatives in that shape — without it the split came back as
   * two face-to-face meetings and the online half the user had set by hand was
   * silently dropped.
   */
  const isManualHybridSplit = modalSplitEnabled
    && (modalClassMode === "online") !== (modalDay2ClassMode === "online")
    && isHybridSplitEligible(dropSubject);

  const recommendationPayload = useMemo(() => {
    if (!dropSubject || !selectedSectionId) return null;

    const payload = {
      section_id: Number(selectedSectionId),
      course_ids: [Number(dropSubject.id)],
      // The course's delivery, not the mode a meeting currently shows. The
      // solver treats an explicit "online" as online-only for every meeting of
      // the course, so switching the first meeting's room to Online used to
      // turn every alternative -- both meetings of a split included -- online.
      // "on-site" is the Generator's default: on-site first, online only as a
      // fallback. Hybrid is carried by the flags below.
      mode: previewMode,
      // Integrated On-site is the same two-session split with the lecture kept
      // face-to-face, so it is the split flags without the hybrid one.
      is_hybrid: modalIsHybrid && !isIntegratedOnSite,
      split_session_enabled: modalIsHybrid,
      selected_split_session_course_ids: modalIsHybrid ? [Number(dropSubject.id)] : [],
      split_gec_enabled: modalSplitEnabled,
      selected_gec_course_ids: modalSplitEnabled ? [Number(dropSubject.id)] : [],
      hybrid_split_course_ids: isManualHybridSplit ? [Number(dropSubject.id)] : [],
      // Integrated's lecture and laboratory lengths, as Setup Courses sends
      // them. Without these the solver answers for the course's own lengths
      // and every alternative comes back the shape the user just changed.
      component_minutes_by_course_id: modalIsHybrid && hasBoth
        ? {
            [Number(dropSubject.id)]: {
              lecture: modalDay2Duration * SLOT_MINUTES,
              laboratory: modalDay1Duration * SLOT_MINUTES,
            },
          }
        : {},
      preferred_patterns: modalPreferredPattern
        ? { [dropSubject.id]: modalPreferredPattern }
        : {},
      tentative_schedules: tentativeSchedules,
      ...(searchFromDay ? { search_from_day: searchFromDay } : {}),
      max_solutions: 3,
      timeout_seconds: 5,
    };

    return { ...payload, seed: stableRecommendationSeed(payload) };
  }, [
    dropSubject,
    dropSubjectIsField,
    previewMode,
    modalIsHybrid,
    isIntegratedOnSite,
    isManualHybridSplit,
    modalPreferredPattern,
    modalSplitEnabled,
    modalDay1Duration,
    modalDay2Duration,
    hasBoth,
    selectedSectionId,
    tentativeSchedules,
    searchFromDay,
  ]);

  useEffect(() => {
    if (!dropContext || !dropSubject) return;

    const frameId = window.requestAnimationFrame(() => {
      setRecommendations([]);
      setRecommendationError(null);
      setAppliedRecommendationRank(null);
      setSelectedRecommendationId(null);
      setAreRecommendationsRequested(false);
      setLoadedRecommendationSeed(null);
      closeButtonRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropContext(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropContext, dropSubject, setDropContext, setSelectedRecommendationId]);

  useEffect(() => {
    if (!dropSubject || modalIsHybrid || !hasLaboratoryUnits || modalClassMode !== "online") return;

    setModalClassMode("on-site");
    setModalRoomId(
      rooms.find((room) => room.roomType === "laboratory" && room.status === "available")?.id
        ?? ROOM_TBA
    );
  }, [
    dropSubject,
    hasLaboratoryUnits,
    modalClassMode,
    modalIsHybrid,
    rooms,
    setModalClassMode,
    setModalRoomId,
  ]);

  useEffect(() => {
    if (!dropContext || !dropSubject || !selectedSectionId || !shouldShowRecommendations || !recommendationPayload) return;

    const controller = new AbortController();

    const loadRecommendations = async () => {
      setIsRecommendationLoading(true);
      setRecommendationError(null);

      try {
        const response = await api.post<DropRecommendationResponse>(
          "/schedule-recommendations/preview",
          {
            ...recommendationPayload,
            ...(confirmedConfiguration ? { configuration_confirmation: confirmedConfiguration } : {}),
          },
          { signal: controller.signal }
        );
        setRecommendations(response.data.recommendations);
        setConfirmationPrompt(null);
        setLoadedRecommendationSeed(recommendationPayload.seed);
      } catch (error) {
        if (!controller.signal.aborted) {
          const payload = (error as { response?: { data?: ConfigurationConfirmationError } }).response?.data;
          const prompt = payload?.configuration_confirmation;
          if (
            payload?.error_code?.startsWith("configuration_confirmation_")
            && prompt?.configuration_fingerprint
            && Array.isArray(prompt.required_warning_rule_ids)
          ) {
            setConfirmationPrompt(prompt);
            setConfirmedConfiguration(null);
            setRecommendationError(payload.message ?? "Review the configuration warning before continuing.");
          } else {
            setConfirmationPrompt(null);
            // The preflight explains why nothing can be generated (no room of
            // the required type, an invalid setting); a generic line hid that.
            setRecommendationError(payload?.message ?? "Recommendations are unavailable right now.");
          }
          setRecommendations([]);
          setLoadedRecommendationSeed(recommendationPayload.seed);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRecommendationLoading(false);
        }
      }
    };

    // Each preview runs the solver for up to five seconds, so wait for the
    // user to stop changing options instead of solving every keystroke.
    const timerId = window.setTimeout(() => { void loadRecommendations(); }, 350);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  // The conflict message itself is not an input: the alternatives depend only
  // on the payload, so a reworded conflict must not solve again.
  }, [
    dropContext,
    dropSubject,
    selectedSectionId,
    shouldShowRecommendations,
    recommendationPayload,
    confirmedConfiguration,
  ]);

  if (!dropContext || !dropSubject) return null;

  const totalSlots = getSubjectTotalSlots(dropSubject);
  const hybridEligible = isHybridSchedulingEligible(
    dropSubject,
    Boolean(manualSchedulingSettings?.lecture_lab_schedule_override_enabled),
  );
  const splitEligible = isBalancedSplitSchedulingEligible(
    dropSubject,
    balancedSplitSettingsOf(manualSchedulingSettings),
  );
  // A course may be designated as Field by department settings even when its
  // stored room_type_required value is still lecture/laboratory.
  const fieldEligible = dropSubjectIsField || isFieldSchedulingEligible(dropSubject);
  // Locked only when the course record itself is a field course. Being on the
  // department's field list is a default the scheduler may turn off.
  const fieldRequired = dropSubject.roomTypeRequired === "field";
  const patternLabel = isTwoMeetingPattern
    ? `${DAYS[modalDay1Index]} + ${DAYS[modalDay2Index]}`
    : "Single meeting";

  const discardSelectedRecommendation = () => {
    if (selectedRecommendationId !== null) {
      void api.post(`/schedule-recommendations/${selectedRecommendationId}/reject`, {
        reason: "Recommendation was modified manually before acceptance."
      }).catch(() => undefined);
    }
    setSelectedRecommendationId(null);
    setAppliedRecommendationRank(null);
  };

  const updateTwoMeetingPattern = (day1Index: number, day2Index: number) => {
    discardSelectedRecommendation();
    if (modalIsHybrid) setModalPreferredPattern(`days:${day1Index}-${day2Index}`);
  };

  const getFallbackMeetingDayIndex = (excludedDayIndex: number): number => {
    const fallbackIndex = availableDays.findIndex((_, index) => index !== excludedDayIndex);
    return fallbackIndex >= 0 ? fallbackIndex : excludedDayIndex;
  };

  const handleDay1Change = (nextDayIndex: number) => {
    if (modalSplitEnabled || modalForceDayEnabled) return;
    if (nextDayIndex === modalDay2Index) return;
    setModalDay1Index(nextDayIndex);
    updateTwoMeetingPattern(nextDayIndex, modalDay2Index);
  };

  const handleDay2Change = (nextDayIndex: number) => {
    if (modalSplitEnabled) return;
    if (nextDayIndex === modalDay1Index) return;
    setModalDay2Index(nextDayIndex);
    updateTwoMeetingPattern(modalDay1Index, nextDayIndex);
  };

  const courseMaxSlots = isTwoMeetingPattern ? Math.max(modalDay1Duration, modalDay2Duration) : totalSlots;

  const dropStyles = getCategoryStyles(dropSubject.category);
  const isDisabled = hasConflict || isModalLoading;

  const onSiteRoomOptions = rooms.filter((r) => {
    const isPhysicalRoom = r.roomType === "lecture" || r.roomType === "laboratory";
    if (!isPhysicalRoom) return false;

    // A mixed split needs both room types on offer, one per meeting.
    const hasLectureAndLabComponents =
      Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
    if (modalIsHybrid && hasLectureAndLabComponents) return r.roomType === "laboratory";

    const requiredRoomType = modalClassMode === "field" ? "field" : requiredRoomTypeForMeeting(dropSubject);

    return !requiredRoomType || r.roomType === requiredRoomType;
  });

  // Integrated's second meeting is the lecture, so it needs a lecture room
  // rather than the laboratory the first card is restricted to above.
  const secondMeetingRoomOptions = isIntegrated
    ? rooms.filter((room) => room.roomType === "lecture")
    : onSiteRoomOptions;

  const allowsRoomTba = modalRoomId === ROOM_TBA
    || modalDay2RoomId === ROOM_TBA
    || (modalClassMode !== "field" && requiredRoomTypeForMeeting(dropSubject) === "laboratory")
    || (hasBoth && modalIsHybrid);




  const recommendedRoomLabel = modalClassMode === "on-site"
    ? modalRoomId === ROOM_TBA
      ? "Room TBA"
      : rooms.find((r) => r.id === modalRoomId)?.name || "Auto-assigning first available room..."
    : modalClassMode === "online"
    ? "Online"
    : "Field";
  const deliveryModeLabel = modalIsHybrid
    ? isIntegratedOnSite
      ? "On-site lecture + on-site laboratory"
      : "Online lecture + on-site laboratory"
    : modalFieldEnabled
      ? "Field"
      : modalClassMode.replace("-", " ");

  /**
   * A slot is a one-meeting recommendation, so it reuses the same apply path
   * rather than a second copy of the meeting-state writes. Rank -1 marks it as
   * "not one of the ranked options", which keeps the Applied tick off them.
   */
  const applyAvailableSlot = (slot: AvailableSlot): void => {
    if (!dropSubject || !selectedSectionId) return;

    // A two-meeting pattern is not a single meeting: handing one slot to
    // applyRecommendationRows would clear the pattern and zero the second
    // meeting, quietly turning a split into one class. Only the meeting whose
    // day this slot belongs to moves; the other is left exactly as it is.
    if (isTwoMeetingPattern) {
      const slotDayIndex = getDayIndex(slot.day);
      const roomId = slot.room_id == null ? slot.mode : String(slot.room_id);
      // The list was built for one meeting, so it applies to that meeting.
      const isSecondMeeting = slotMeeting === "second" && modalDay2Duration > 0;

      // The pattern is moved with the day, never behind it. modalConflict
      // validates against parsePreferredPattern(modalPreferredPattern), not the
      // day indexes, so setting a day without the pattern left the dialog
      // showing Wednesday while the conflict was still being judged on Tuesday.
      // The day selects go through updateTwoMeetingPattern for the same reason.
      if (isSecondMeeting) {
        setModalDay2Index(slotDayIndex);
        updateTwoMeetingPattern(modalDay1Index, slotDayIndex);
        setModalDay2ClassMode(slot.mode);
        setModalDay2RoomId(roomId);
        setModalDay2StartSlot(slot.start_slot);
        setIsDay2ModifiedByUser(true);
      } else {
        setModalDay1Index(slotDayIndex);
        updateTwoMeetingPattern(slotDayIndex, modalDay2Index);
        setModalClassMode(slot.mode);
        setModalRoomId(roomId);
        setModalDay1StartSlot(slot.start_slot);
      }

      setModalValidationError("");

      return;
    }

    applyRecommendationRows([{
      semester_id: Number(activeSemester?.id ?? 0),
      section_id: Number(selectedSectionId),
      course_id: Number(dropSubject.id),
      faculty_id: null,
      room_id: slot.room_id,
      department_id: Number(dropSubject.departmentId ?? 0),
      day: slot.day,
      start_time: slot.start_time,
      end_time: slot.end_time,
      mode: slot.mode,
      is_hybrid: false,
      preferred_pattern: null,
      status: "draft",
    }], -1, null);
  };

  /**
   * Push one recommendation's rows into the modal's meeting state.
   *
   * Both branches of applyRecommendation used to carry this body verbatim —
   * ~55 identical lines differing only in where the rows came from (audit
   * finding #17). Only the row source and the recommendation id differ, so both
   * are parameters.
   */
  const applyRecommendationRows = (
    rows: DropRecommendationRow[],
    rank: number,
    recommendationId: number | null,
  ): void => {
    // Integrated On-site comes back as two linked meetings without the hybrid
    // flag, so the shape decides whether this is Integrated, not is_hybrid.
    const isBalancedSplitPattern = ["MW", "TTh"].includes(rows[0]?.preferred_pattern ?? "");
    const isIntegratedRows = rows.length > 1 && Boolean(hasBoth) && !isBalancedSplitPattern;
    const laboratorySlots = laboratoryComponentSlots(dropSubject, manualSchedulingSettings);
    // The first card is the laboratory, which is the meeting of that length.
    const integratedRank = (row: DropRecommendationRow): number =>
      timeToSlot(row.end_time) - timeToSlot(row.start_time) === laboratorySlots ? 0 : 1;
    const sortedRows = [...rows].sort((left, right) => (
      (left.is_hybrid || right.is_hybrid
        ? Number(left.mode === "online") - Number(right.mode === "online")
        : isIntegratedRows
          ? integratedRank(left) - integratedRank(right)
          : 0)
      || getDayIndex(left.day) - getDayIndex(right.day)
      || timeToSlot(left.start_time) - timeToSlot(right.start_time)
    ));
    const firstRow = sortedRows[0];
    if (!firstRow || !dropContext) return;

    const firstDayIndex = getDayIndex(firstRow.day);
    const firstStartSlot = timeToSlot(firstRow.start_time);
    const firstEndSlot = timeToSlot(firstRow.end_time);

    setModalRoomId(recommendationRoomId(firstRow));
    setModalClassMode(firstRow.mode);
    setModalIsHybrid(firstRow.is_hybrid || isIntegratedRows);
    setModalSplitEnabled(!firstRow.is_hybrid && !isIntegratedRows && isBalancedSplitPattern);

    if (sortedRows.length > 1) {
      const secondRow = sortedRows[1];
      const secondDayIndex = getDayIndex(secondRow.day);
      setModalPreferredPattern(firstRow.preferred_pattern ?? `days:${firstDayIndex}-${secondDayIndex}`);
      setModalDay1Index(firstDayIndex);
      setModalDay2Index(secondDayIndex);
      setModalDay1StartSlot(firstStartSlot);
      setModalDay1Duration(Math.max(1, firstEndSlot - firstStartSlot));
      setModalDay2StartSlot(timeToSlot(secondRow.start_time));
      setModalDay2Duration(Math.max(1, timeToSlot(secondRow.end_time) - timeToSlot(secondRow.start_time)));
      setModalDay2RoomId(recommendationRoomId(secondRow));
      setModalDay2ClassMode(secondRow.mode);
      setIsDay2ModifiedByUser(true);
    } else {
      setModalPreferredPattern(null);
      setModalDay1Index(firstDayIndex);
      setModalDay2Index(getDayIndex(FULL_DAY_NAMES[Math.min(firstDayIndex + 1, FULL_DAY_NAMES.length - 1)]));
      setModalDay1StartSlot(firstStartSlot);
      setModalDay1Duration(getSubjectTotalSlots(dropSubject));
      setModalDay2StartSlot(firstStartSlot);
      setModalDay2Duration(0);
      setModalDay2RoomId("");
      setModalDay2ClassMode("on-site");
      setIsDay2ModifiedByUser(false);
      // dropContext is deliberately left alone. Its cell is part of the
      // placement-session key, so moving it here re-initialised the dialog for
      // "a new cell": the recommended room was replaced by the dialog's own
      // pick, an online option became on-site again, and the selection was
      // cleared. The day and time fields set above are what the save uses.
    }

    // Force Day is the user's own constraint and is never rewritten by an
    // alternative; one that misses the forced day cannot be applied at all
    // (see missesForcedDay).
    setModalValidationError("");
    setAppliedRecommendationRank(rank);
    setSelectedRecommendationId(recommendationId);
  };

  // The solver reads the department's saved Force Day, not an unsaved choice
  // in this dialog, so an alternative can land on another day. Applying it used
  // to overwrite the Force Day with that day; now it is shown but not offered.
  const forcedDayName = modalForceDayEnabled ? FULL_DAY_NAMES[modalForcedDayIndex] : null;
  const missesForcedDay = (recommendation: DropRecommendation): boolean =>
    forcedDayName !== null && recommendation.schedules.some((row) => row.day !== forcedDayName);

  const applyRecommendation = async (recommendation: DropRecommendation) => {
    if (isApplyingRecommendation || missesForcedDay(recommendation)) return;
    discardSelectedRecommendation();
    setIsApplyingRecommendation(true);

    try {
      if (!recommendationPayload) return;

      const response = await api.post<SelectedRecommendationResponse>(
        "/schedule-recommendations/select",
        {
          ...recommendationPayload,
          ...(confirmedConfiguration ? { configuration_confirmation: confirmedConfiguration } : {}),
          selected_rank: recommendation.rank,
          ...(recommendation.plan_id ? { plan_id: recommendation.plan_id } : {}),
        }
      );

      applyRecommendationRows(
        response.data.recommendation.recommended_schedules,
        recommendation.rank,
        response.data.recommendation.id,
      );
    } catch {
      setRecommendationError("This recommendation is no longer available. Please try again.");
    } finally {
      setIsApplyingRecommendation(false);
    }
  };

  const handleIntegratedToggle = (enabled: boolean) => {
    setModalSplitEnabled(false);
    setModalForceDayEnabled(false);
    setIsDay2ModifiedByUser(false);
    if (enabled) {
      const preservedDayIndex = modalDay1Index;
      const lectureSlots = getCourseSlotPlan(dropSubject).lectureSlots;
      // Custom Lab Duration wins over three hours per unit, as in the Rule Engine.
      const laboratorySlots = laboratoryComponentSlots(dropSubject, manualSchedulingSettings);
      const secondDay = preservedDayIndex === modalDay2Index
        ? getFallbackMeetingDayIndex(preservedDayIndex)
        : modalDay2Index;
      setModalPreferredPattern(`days:${preservedDayIndex}-${secondDay}`);
      // Preferred-pattern setters may synchronize both day fields. The day
      // chosen before enabling Hybrid remains the laboratory day unless the
      // user changes it explicitly.
      setModalDay1Index(preservedDayIndex);
      setModalDay2Index(secondDay);
      setModalDay1Duration(laboratorySlots);
      setModalDay2Duration(lectureSlots);
      setModalClassMode("on-site");
      setModalRoomId(rooms.find((room) => room.roomType === "laboratory" && room.status === "available")?.id ?? ROOM_TBA);
      setModalDay2ClassMode("online");
      setModalDay2RoomId("online");
      // Keep Integrated active after configuring both required component
      // meetings so the second card stays open.
      setModalIsHybrid(true);
    } else {
      setModalIsHybrid(false);
      setModalPreferredPattern(null);
      setModalDay1Duration(totalSlots);
      setModalDay2Duration(0);
    }
  };

  /**
   * Integrated's delivery, the same two choices Generate Schedule offers: the
   * laboratory is always on site, so only the lecture meeting moves.
   */
  const handleIntegratedDeliveryChange = (delivery: "onsite" | "hybrid") => {
    discardSelectedRecommendation();
    if (delivery === "hybrid") {
      setModalDay2ClassMode("online");
      setModalDay2RoomId("online");
      return;
    }
    setModalDay2ClassMode("on-site");
    setModalDay2RoomId(
      rooms.find((room) => room.roomType === "lecture" && room.status === "available")?.id ?? ROOM_TBA
    );
  };

  const handleSplitToggle = (enabled: boolean) => {
    setModalSplitEnabled(enabled);
    setModalIsHybrid(false);
    setModalForceDayEnabled(false);
    setIsDay2ModifiedByUser(false);
    if (enabled) {
      const firstSlots = Math.floor(totalSlots / 2);
      setModalPreferredPattern("MW");
      setModalDay1Index(0);
      setModalDay2Index(2);
      setModalDay1Duration(firstSlots);
      setModalDay2Duration(totalSlots - firstSlots);
      setModalDay2StartSlot(modalDay1StartSlot);
      setModalDay2RoomId(modalRoomId);
      setModalDay2ClassMode(modalClassMode);
    } else {
      setModalPreferredPattern(null);
      setModalDay1Duration(totalSlots);
      setModalDay2Duration(0);
    }
  };

  /**
   * Class Mode is a property of this meeting, not of the course: picking Field
   * here puts one class in the field without adding the course to the
   * department's field list. Only the Field Course checkbox does that.
   */
  const handleModeSelect = (mode: ClassMode, isSecondMeeting: boolean) => {
    discardSelectedRecommendation();
    const currentRoomId = isSecondMeeting ? modalDay2RoomId : modalRoomId;
    const setMode = isSecondMeeting ? setModalDay2ClassMode : setModalClassMode;
    const setRoom = isSecondMeeting ? setModalDay2RoomId : setModalRoomId;

    setMode(mode);
    if (mode === "field") {
      setRoom("field");
    } else if (currentRoomId === "field") {
      setRoom(rooms.find((room) => room.roomType === "lecture" && room.status === "available")?.id ?? "");
    }
    setModalValidationError("");
  };

  // The grid window is configurable, so the latest start is derived from it
  // rather than the 24-slot day these selects used to assume.
  const gridSlotCount = slotCount();
  const clampMeetingDuration = (startSlot: number, duration: number): number => {
    const capped = Math.min(duration, courseMaxSlots);
    return startSlot + capped > gridSlotCount ? Math.max(1, gridSlotCount - startSlot) : capped;
  };

  /**
   * Integrated's two sessions open at the course's own lengths -- one hour per
   * lecture unit, and three hours per laboratory unit unless the department
   * set a Custom Lab Duration -- but those are a starting point, not the
   * shape. They are the user's to change here exactly as they are in Setup
   * Courses, and each is used as set: no unit-derived total caps the pair
   * (`class_duration` judges each session on its own). All a session may not
   * cross is the end of the teaching day.
   */
  const integratedMaxSlots = (startSlot: number): number => Math.max(1, gridSlotCount - startSlot);

  /**
   * One session's length. It changes what the alternatives are being asked
   * for, so a recommendation picked before it is discarded like any other edit.
   */
  const handleIntegratedDurationChange = (isSecondMeeting: boolean, slots: number): void => {
    discardSelectedRecommendation();
    (isSecondMeeting ? setModalDay2Duration : setModalDay1Duration)(slots);
    setModalValidationError("");
  };

  const optionTileClass = (checked: boolean, disabled = false) => `flex items-start gap-2.5 rounded-lg border p-3 transition-colors ${
    disabled
      ? "cursor-not-allowed border-slate-200 bg-slate-50"
      : checked
        ? "cursor-pointer border-[#4e0a10]/40 bg-[#4e0a10]/[0.04]"
        : "cursor-pointer border-slate-200 bg-white hover:border-slate-300"
  }`;
  const checkboxClass = "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#4e0a10]";
  const roomMissing = (roomId: string) => Boolean(modalValidationError) && !roomId;
  const firstMeetingTitle = modalIsHybrid ? "Laboratory Meeting" : isTwoMeetingPattern ? "First Meeting" : "Meeting";
  const secondMeetingTitle = modalIsHybrid ? "Lecture Meeting" : "Second Meeting";
  const scheduleTimeLabel = modalPreferredPattern
    ? `${slotToTimeStr(modalDay1StartSlot)} · ${slotsToHours(modalDay1Duration + modalDay2Duration)} contact hrs total`
    : `${slotToTimeStr(modalDay1StartSlot)} – ${slotToTimeStr(modalDay1StartSlot + modalDay1Duration)}`;

  // What the Schedule Generator would have said about this placement. Only
  // meaningful once the placement is valid; a conflict already says enough.
  const plannedMeetings: PlannedMeeting[] = [
    {
      dayIndex: modalDay1Index,
      startSlot: modalDay1StartSlot,
      durationSlots: modalDay1Duration,
      mode: modalClassMode,
      roomId: modalRoomId,
      meetingType: modalIsHybrid ? "laboratory" : isTwoMeetingPattern ? "lecture" : null,
    },
    ...(isTwoMeetingPattern && modalDay2Duration > 0
      ? [{
          dayIndex: modalDay2Index,
          startSlot: modalDay2StartSlot,
          durationSlots: modalDay2Duration,
          mode: modalDay2ClassMode,
          roomId: modalDay2RoomId,
          meetingType: "lecture" as const,
        }]
      : []),
  ];
  const isPlacedCourse = (schedule: ScheduleItem) =>
    String(schedule.sectionId) === String(selectedSectionId)
    && String(schedule.courseId ?? schedule.subjectId) === String(dropSubject.id);
  const qualityNotes = hasConflict ? [] : evaluatePlacementQuality({
    meetings: plannedMeetings,
    sectionSchedules: schedules.filter((schedule) =>
      String(schedule.sectionId) === String(selectedSectionId) && !isPlacedCourse(schedule)),
    allSchedules: schedules.filter((schedule) => !isPlacedCourse(schedule)),
    rooms,
    sectionName: sections.find((section) => String(section.id) === String(selectedSectionId))?.name ?? "this section",
    isHybrid: modalIsHybrid,
    isForcedDay: modalForceDayEnabled,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-slate-950/55 p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setDropContext(null); }}
    >
      {/*
        The alternatives panel is two columns wide, so the shell has to grow
        with it: at the old 2xl width the 600px panel ate the dialog's own
        room, day and time fields.
      */}
      <div className={`flex max-h-[94vh] w-full max-w-[96vw] flex-col gap-3 xl:flex-row xl:items-stretch ${
        shouldShowRecommendations
          ? "2xl:max-w-[1700px]"
          : isTwoMeetingPattern ? "2xl:max-w-[1400px]" : "2xl:max-w-6xl"
      }`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-modal-title"
        aria-describedby="placement-modal-desc"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4e0a10]/[0.07] text-[#4e0a10]">
              <CalendarPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 id="placement-modal-title" className="text-base font-black leading-tight text-slate-900">Review Class Placement</h3>
              <p id="placement-modal-desc" className="mt-0.5 text-xs text-slate-500">
                Check the suggested meeting, adjust only what you need, then place it.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setDropContext(null)}
            aria-label="Close placement dialog"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Pinned above the scrolling form so the conflict is visible without scrolling. */}
        {hasConflict && (
          <div role="alert" className="flex shrink-0 items-start gap-2.5 border-b border-red-200 bg-red-50 px-5 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1 text-sm leading-snug">
              <p className="break-words text-red-700">
                <span className="font-bold text-red-800">This placement has a conflict: </span>
                {modalConflict}
              </p>
              <p className="mt-0.5 text-xs text-red-600">
                Choose another room, day or time, change the class mode{canUseRecommendations ? ", or use one of the suggested alternatives" : ""}.
              </p>
            </div>
          </div>
        )}

        <form
          onSubmit={handleModalConfirm}
          onChangeCapture={discardSelectedRecommendation}
          className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-5 py-4"
        >
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-start gap-3 lg:w-[34%]">
                <span aria-hidden="true" className={`mt-1 h-10 w-1 shrink-0 rounded-full ${dropSubject.category === "major" ? "bg-[#4e0a10]" : "bg-[#c9952a]"}`} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-lg font-black leading-tight text-slate-900">{dropSubject.code}</p>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                      {dropSubject.units} units
                    </span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black tracking-wider ${dropStyles.typeBadge}`}>
                      {dropStyles.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500" title={dropSubject.name}>{dropSubject.name}</p>
                </div>
              </div>

              <dl className="grid flex-1 grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                <div className="flex min-w-0 items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Room & delivery</dt>
                    <dd className="truncate text-sm font-bold text-slate-800">{recommendedRoomLabel}</dd>
                    <dd className="truncate text-xs capitalize text-slate-500">{deliveryModeLabel}</dd>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-2.5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Schedule</dt>
                    <dd className="truncate text-sm font-bold text-slate-800">{isTwoMeetingPattern ? patternLabel : DAYS[modalDay1Index]}</dd>
                    <dd className="truncate text-xs text-slate-500">{scheduleTimeLabel}</dd>
                  </div>
                </div>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                  hasConflict ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                }`}>
                  {hasConflict ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {hasConflict ? "Conflict detected" : "Ready to place"}
                </span>
              </dl>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Scheduling options</h4>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {hybridEligible && (
                <label className={optionTileClass(modalIsHybrid)}>
                  <input type="checkbox" checked={modalIsHybrid} onChange={(event) => handleIntegratedToggle(event.target.checked)} className={checkboxClass} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">Integrated</span>
                    <span className="block text-[11px] leading-snug text-slate-500">Lecture and laboratory as two meetings.</span>
                  </span>
                </label>
              )}
              {splitEligible && (
                <label className={optionTileClass(modalSplitEnabled)}>
                  <input type="checkbox" checked={modalSplitEnabled} onChange={(event) => handleSplitToggle(event.target.checked)} className={checkboxClass} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">Split Session</span>
                    <span className="block text-[11px] leading-snug text-slate-500">Two balanced MW or TTh meetings.</span>
                  </span>
                </label>
              )}
            </div>
            {isIntegrated && (
              <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                Delivery mode
                <select
                  value={isIntegratedOnSite ? "onsite" : "hybrid"}
                  onChange={(event) => handleIntegratedDeliveryChange(event.target.value as "onsite" | "hybrid")}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15"
                >
                  <option value="onsite">On-Site — lecture and laboratory on campus</option>
                  <option value="hybrid">Hybrid — online lecture, on-site laboratory</option>
                </select>
              </label>
            )}
            {modalSplitEnabled && (
              <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                Split pattern
                <select value={modalPreferredPattern ?? "MW"} onChange={(event) => {
                  const pattern = event.target.value;
                  const [firstDay, secondDay] = pattern === "TTh" ? [1, 3] : [0, 2];
                  setModalPreferredPattern(pattern);
                  setModalDay1Index(firstDay);
                  setModalDay2Index(secondDay);
                }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15">
                  <option value="MW">Monday–Wednesday</option>
                  <option value="TTh">Tuesday–Thursday</option>
                </select>
              </label>
            )}
          </section>

          <div className={`grid grid-cols-1 gap-4 ${isTwoMeetingPattern ? "lg:grid-cols-2" : ""}`}>
            <MeetingCard
              title={firstMeetingTitle}
              mode={modalClassMode}
              isModeDisabled={(mode) =>
                (modalIsHybrid && mode !== "on-site")
                || (!modalIsHybrid && hasLaboratoryUnits && mode === "online")
                || (fieldRequired && mode !== "field")
                || (mode === "field" && !fieldEligible)}
              modeTitle={(mode) => (!modalIsHybrid && hasLaboratoryUnits && mode === "online"
                ? "Use Integrated to configure the lecture and the laboratory separately."
                : undefined)}
              onModeSelect={(mode) => handleModeSelect(mode, false)}
              roomId={modalRoomId}
              onRoomChange={(roomId) => { setModalRoomId(roomId); setModalValidationError(""); }}
              hasRoomError={modalClassMode === "on-site" && roomMissing(modalRoomId)}
              allowsRoomTba={Boolean(allowsRoomTba)}
              roomOptions={onSiteRoomOptions}
              dayAriaLabel="First meeting day"
              dayValue={modalDay1Index}
              dayDisabled={isTwoMeetingPattern ? modalSplitEnabled || modalForceDayEnabled : modalForceDayEnabled}
              dayOptions={availableDays.map((day, index) => (
                isTwoMeetingPattern && index === modalDay2Index
                  ? { value: index, label: `${day} (second meeting)`, disabled: true }
                  : { value: index, label: day }
              ))}
              onDayChange={(dayIndex) => (isTwoMeetingPattern ? handleDay1Change(dayIndex) : setModalDay1Index(dayIndex))}
              startSlot={modalDay1StartSlot}
              startOptionCount={isTwoMeetingPattern ? gridSlotCount : gridSlotCount - totalSlots + 1}
              onStartChange={(startSlot) => {
                setModalDay1StartSlot(startSlot);
                if (isTwoMeetingPattern) setModalDay1Duration(clampMeetingDuration(startSlot, modalDay1Duration));
              }}
              durationSlots={modalDay1Duration}
              onDurationChange={isIntegrated ? (slots) => handleIntegratedDurationChange(false, slots) : undefined}
              maxDurationSlots={integratedMaxSlots(modalDay1StartSlot)}
              endLabelSuffix={isTwoMeetingPattern ? undefined : "(auto)"}
            />

            {isTwoMeetingPattern && (
              <MeetingCard
                title={secondMeetingTitle}
                mode={modalDay2ClassMode}
                isModeDisabled={(mode) =>
                  // Integrated's lecture follows the Delivery mode select above.
                  (modalIsHybrid && mode !== modalDay2ClassMode)
                  || (!modalIsHybrid && hasLaboratoryUnits && mode === "online")
                  || (fieldRequired && mode !== "field")
                  || (mode === "field" && !fieldEligible)}
                modeTitle={(mode) => (modalIsHybrid && mode !== modalDay2ClassMode
                  ? "Delivery mode decides this meeting's class mode."
                  : !modalIsHybrid && hasLaboratoryUnits && mode === "online"
                    ? "Use Integrated to configure the lecture and the laboratory separately."
                    : undefined)}
                onModeSelect={(mode) => handleModeSelect(mode, true)}
                roomId={modalDay2RoomId}
                onRoomChange={(roomId) => { setModalDay2RoomId(roomId); setModalValidationError(""); }}
                hasRoomError={modalDay2ClassMode === "on-site" && roomMissing(modalDay2RoomId)}
                allowsRoomTba={Boolean(allowsRoomTba)}
                roomOptions={secondMeetingRoomOptions}
                dayAriaLabel="Second meeting day"
                dayValue={modalDay2Index}
                dayDisabled={modalSplitEnabled}
                dayOptions={availableDays.map((day, index) => (
                  index === modalDay1Index
                    ? { value: index, label: `${day} (first meeting)`, disabled: true }
                    : { value: index, label: day }
                ))}
                onDayChange={handleDay2Change}
                startSlot={isSameTimePair ? modalDay1StartSlot : modalDay2StartSlot}
                startDisabled={isSameTimePair}
                startOptionCount={gridSlotCount}
                onStartChange={(startSlot) => {
                  setModalDay2StartSlot(startSlot);
                  setIsDay2ModifiedByUser(true);
                  setModalDay2Duration(clampMeetingDuration(startSlot, modalDay2Duration));
                }}
                durationSlots={modalDay2Duration}
                onDurationChange={isIntegrated ? (slots) => handleIntegratedDurationChange(true, slots) : undefined}
                maxDurationSlots={integratedMaxSlots(modalDay2StartSlot)}
              />
            )}
          </div>

          {modalValidationError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-white p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-red-800">This placement could not be saved</p>
                <p className="mt-0.5 text-sm text-red-700">{modalValidationError}</p>
              </div>
            </div>
          )}

          {!hasConflict && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-[#c9952a]" />
                  <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Placement review</h4>
                </div>
                {canUseRecommendations && !areRecommendationsRequested && (
                  <button
                    type="button"
                    onClick={() => setAreRecommendationsRequested(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#c9952a]/40 bg-[#fff8e8] px-3 text-xs font-bold text-[#7a4c08] transition-colors hover:bg-[#fdf0d2]"
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    Find better options
                  </button>
                )}
              </div>
              {qualityNotes.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Matches what the Schedule Generator would prefer.
                </p>
              ) : (
                <>
                  <ul className="mt-2 space-y-1.5">
                    {qualityNotes.map((note) => (
                      <li
                        key={note.id}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-snug ${
                          note.tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"
                        }`}
                      >
                        {note.tone === "warning"
                          ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        {note.message}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-400">These are preferences, not conflicts. You can still place the class as it is.</p>
                </>
              )}
            </section>
          )}
        </form>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className={`flex items-center gap-2 text-sm font-bold ${hasConflict ? "text-red-700" : "text-emerald-700"}`}>
            {hasConflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {hasConflict
              ? "Resolve the conflict to continue"
              : modalWasConflicted
              ? <><span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">Resolved</span> Conflict cleared. Ready to add to the timetable</>
              : "Ready to add to the timetable"}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDropContext(null)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => handleModalConfirm(e as unknown as React.FormEvent)}
              disabled={isDisabled}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#4e0a10] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {isModalLoading ? (
                <><LoadingSpinner className="h-4 w-4" /> Placing...</>
              ) : hasConflict ? (
                "Fix Conflict to Continue"
              ) : (
                <><CalendarPlus className="h-4 w-4" /> Place on Timetable</>
              )}
            </button>
          </div>
        </div>
      </div>

      {shouldShowRecommendations && (
        <aside
          aria-label="Suggested alternatives"
          className="flex max-h-80 min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl xl:max-h-[94vh] xl:w-[600px]"
        >
          {/*
            The room filter lives in the header rather than above the list it
            filters: the list runs to dozens of slots, so a control inside the
            scroll area is out of sight exactly when it is needed.
          */}
          <div className="shrink-0 border-b border-slate-200 bg-gradient-to-b from-[#fff8e8] to-white px-4 pb-3 pt-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c9952a]/15 text-[#7a4c08]">
                <Lightbulb className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black leading-tight text-slate-900">Suggested alternatives</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-500">
                  The generator's best picks, then every placement the Rule Engine accepts.
                </p>
              </div>
            </div>

            {/*
              A split pair's rooms come from its two meetings, so filtering the
              list by room would not mean anything for it.
            */}
            {splitPairStarts === null && (isSlotsLoading || availableSlots.length > 0) && (
              <div className="mt-3">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <select
                    aria-label="Filter placements by room"
                    value={roomFilter}
                    onChange={(event) => setRoomFilter(event.target.value)}
                    className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-8 pr-8 text-xs font-bold text-slate-800 shadow-sm focus:border-[#4e0a10] focus:outline-none focus:ring-2 focus:ring-[#4e0a10]/10"
                  >
                    <option value={ALL_ROOMS}>All rooms ({availableSlots.length})</option>
                    {availableSlotRooms.map((room) => (
                      <option key={slotRoomKey(room)} value={slotRoomKey(room)}>
                        {room.room_code} ({room.slot_count})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </div>

                {availableSlotRooms.length > 1 && (
                  <ul className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                    <li>
                      <button
                        type="button"
                        onClick={() => setRoomFilter(ALL_ROOMS)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                          roomFilter === ALL_ROOMS
                            ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        All
                        <span className={`rounded-full px-1 ${roomFilter === ALL_ROOMS ? "bg-white/20" : "bg-slate-100 text-slate-700"}`}>
                          {availableSlots.length}
                        </span>
                      </button>
                    </li>
                    {availableSlotRooms.map((room) => {
                      const value = slotRoomKey(room);
                      const isActive = roomFilter === value;

                      return (
                        <li key={`badge-${value}`}>
                          <button
                            type="button"
                            onClick={() => setRoomFilter(value)}
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              isActive
                                ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {room.room_code}
                            <span className={`rounded-full px-1 ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-700"}`}>
                              {room.slot_count}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/*
            Two panes that scroll on their own: the ranked picks are three tall
            cards, so a single scroller pushed the full list below the fold and
            the user had to scroll past the picks to reach the week.
          */}
          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
          <div className="min-h-0 overflow-y-auto p-3">
            {isRecommendationLoading || loadedRecommendationSeed !== recommendationPayload?.seed ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={`recommendation-skeleton-${index}`} className="animate-pulse rounded-xl border border-slate-200 p-3">
                    <div className="h-3 w-20 rounded bg-slate-200" />
                    <div className="mt-3 h-10 w-full rounded-lg bg-slate-100" />
                    <div className="mt-3 h-9 w-full rounded-lg bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : recommendationError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-sm leading-5 text-amber-900">{recommendationError}</p>
                </div>
                {confirmationPrompt?.configuration_fingerprint && (
                  <button
                    type="button"
                    className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#7a4c08] px-3 text-xs font-bold text-white transition-colors hover:bg-[#633d06] disabled:opacity-60"
                    onClick={() => setConfirmedConfiguration({
                      schema_version: 1,
                      configuration_fingerprint: confirmationPrompt.configuration_fingerprint as string,
                      confirmed_warning_rule_ids: confirmationPrompt.required_warning_rule_ids ?? [],
                    })}
                    disabled={isRecommendationLoading}
                  >
                    Confirm and continue
                  </button>
                )}
              </div>
            ) : recommendations.length === 0 && visibleSlots.length === 0 && !isSlotsLoading ? (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <Sparkles className="h-5 w-5 text-slate-400" />
                </span>
                <p className="text-sm font-bold text-slate-700">No alternatives found</p>
                <p className="mt-0.5 text-xs text-slate-500">Try another class mode or scheduling option.</p>
              </div>
            ) : recommendations.length === 0 ? null : (
              <>
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Generator picks</p>
              <ol className="space-y-2" aria-label="Generator picks">
                {recommendations.map((recommendation, index) => {
                  const isApplied = appliedRecommendationRank === recommendation.rank;
                  const offForcedDay = !isApplied && missesForcedDay(recommendation);

                  return (
                    <li
                      key={`${recommendation.rank}-${index}`}
                      className={`rounded-xl border p-3 transition-colors ${
                        isApplied ? "border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4e0a10] text-[11px] text-white">{index + 1}</span>
                          Option {index + 1}
                        </p>
                        {isApplied ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Applied
                          </span>
                        ) : index === 0 ? (
                          <span className="rounded-full bg-[#c9952a]/15 px-2 py-0.5 text-[10px] font-bold text-[#7a4c08]">Best match</span>
                        ) : null}
                      </div>

                      {/*
                        A split that keeps one start time reads as one line:
                        the time, the two days, and the two deliveries. Listed
                        as separate rows it was not obvious that the pair was
                        still a split, or which half was online.
                      */}
                      {isSameTimePairRecommendation(recommendation) ? (
                        <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-14 shrink-0 text-center text-[10px] font-black uppercase text-[#4e0a10]">
                              {recommendation.schedules.map((row) => row.day.slice(0, 1)).join("")}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">
                              {slotToTimeStr(timeToSlot(recommendation.schedules[0].start_time))} – {slotToTimeStr(timeToSlot(recommendation.schedules[0].end_time))}
                            </span>
                            <span className="shrink-0 text-[11px] font-bold text-[#7a4c08]">
                              {recommendation.schedules.map((row) => DELIVERY_SHORT_LABEL[row.mode]).join(" | ")}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1 truncate pl-16 text-[11px] text-slate-500">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {recommendation.schedules
                              .map((row) => getRecommendationRoomLabel(row, rooms))
                              .join(" · ")}
                          </p>
                        </div>
                      ) : (
                      <ul className="mt-2 space-y-1">
                        {recommendation.schedules.map((row, rowIndex) => (
                          <li
                            key={`${row.day}-${row.start_time}-${rowIndex}`}
                            className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
                          >
                            <span className="w-8 shrink-0 text-center text-[10px] font-black uppercase text-[#4e0a10]">
                              {row.day.slice(0, 3)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">
                              {slotToTimeStr(timeToSlot(row.start_time))} – {slotToTimeStr(timeToSlot(row.end_time))}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {getRecommendationRoomLabel(row, rooms)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      )}

                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void applyRecommendation(recommendation)}
                          disabled={isApplyingRecommendation || isApplied || offForcedDay}
                          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
                            isApplied
                              ? "cursor-default bg-emerald-100 text-emerald-800"
                              : offForcedDay
                                ? "cursor-not-allowed bg-slate-100 text-slate-500"
                                : "bg-[#4e0a10] text-white hover:bg-[#3a0809] disabled:opacity-60"
                          }`}
                        >
                          {isApplied
                            ? <><CheckCircle2 className="h-3.5 w-3.5" /> Selected</>
                            : offForcedDay
                              ? `Not on ${forcedDayName} (Force Day)`
                              : "Use this option"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              </>
            )}
          </div>

          {/*
            Every placement the Rule Engine accepts, not just the handful the
            solver ranked. The counts come from the same pass that built the
            list, so a room's badge and its slots can never disagree.
          */}
          <div className="min-h-0 overflow-y-auto border-t border-slate-200 p-3 xl:border-t-0">
            {!recommendationError && (isSlotsLoading || availableSlots.length > 0) && (
              <section aria-label="All valid placements">
                {/*
                  An Integrated pair's halves have different lengths and
                  different legal deliveries, so the list answers for one of
                  them at a time and says which.
                */}
                {isTwoMeetingPattern && splitPairStarts === null && modalDay2Duration > 0 && (
                  <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-0.5">
                    {([["first", firstMeetingTitle], ["second", secondMeetingTitle]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { setSlotMeeting(value); setRoomFilter(ALL_ROOMS); }}
                        className={`h-7 flex-1 rounded-md text-[11px] font-bold transition-colors ${
                          slotMeeting === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="sticky top-0 z-20 -mt-1 mb-2 flex items-baseline justify-between gap-2 bg-white/95 pb-1.5 pt-1 backdrop-blur">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    {splitPairStarts === null ? "All valid placements" : "Valid split times"}
                  </p>
                  <span className="text-[11px] font-bold text-slate-400">
                    {isSlotsLoading
                      ? "Checking…"
                      : `${(splitPairStarts ?? visibleSlots).length} slot${(splitPairStarts ?? visibleSlots).length === 1 ? "" : "s"}`}
                  </span>
                </div>

                {areSlotsTruncated && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                    Showing the first {availableSlots.length}. Pick a room above to narrow the list.
                  </p>
                )}

                {splitPairStarts !== null ? (
                  <>
                    <p className="mb-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
                      Both meetings share one start time, so these are the times free on
                      {" "}<b>{DAYS[modalDay1Index]}</b> and <b>{DAYS[modalDay2Index]}</b> for the
                      rooms and deliveries you picked. The split is kept.
                    </p>
                    {splitPairStarts.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                        No time is free on both days for this pair. Change a room or a delivery above.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {splitPairStarts.map(({ startSlot, endSlot }) => (
                          <li key={`pair-${startSlot}`}>
                            <button
                              type="button"
                              onClick={() => applySplitPairStart(startSlot)}
                              disabled={isApplyingRecommendation}
                              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#4e0a10] hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:bg-slate-50"
                            >
                              <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                                {slotToTimeStr(startSlot)} – {slotToTimeStr(endSlot)}
                              </span>
                              <span className="shrink-0 text-[11px] font-bold text-[#7a4c08]">
                                {DELIVERY_SHORT_LABEL[modalClassMode]} | {DELIVERY_SHORT_LABEL[modalDay2ClassMode]}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : slotsByDay.map(([day, daySlots]) => (
                  <div key={day} className="mt-3">
                    {/* top-7 clears the section header, which sticks above it. */}
                    <p className="sticky top-7 z-10 -mx-1 bg-white/95 px-1 py-1 text-[11px] font-black uppercase tracking-wider text-[#4e0a10] backdrop-blur">
                      {day} <span className="text-slate-400">({daySlots.length})</span>
                    </p>
                    <ul className="mt-1 space-y-1">
                      {daySlots.map((slot) => (
                        <li key={`${slot.day}-${slot.start_slot}-${slotRoomKey(slot)}`}>
                          <button
                            type="button"
                            onClick={() => applyAvailableSlot(slot)}
                            disabled={isApplyingRecommendation || (forcedDayName !== null && slot.day !== forcedDayName)}
                            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#4e0a10] hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                              {slotToTimeStr(slot.start_slot)} – {slotToTimeStr(slot.end_slot)}
                            </span>
                            <span className={`flex shrink-0 items-center gap-1 text-[11px] ${
                              slot.mode === "on-site" ? "text-slate-500" : "font-bold text-[#7a4c08]"
                            }`}>
                              {slot.mode === "online"
                                ? <Monitor className="h-3 w-3" />
                                : slot.mode === "field"
                                  ? <TreePine className="h-3 w-3" />
                                  : <MapPin className="h-3 w-3" />}
                              {slot.room_code}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {!isSlotsLoading && visibleSlots.length === 0 && availableSlots.length > 0 && (
                  <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                    That room has no free slot for this meeting. Choose another room above.
                  </p>
                )}
              </section>
            )}
          </div>
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
