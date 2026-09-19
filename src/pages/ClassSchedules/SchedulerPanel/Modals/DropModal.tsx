import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarPlus, CheckCircle2, ChevronDown, Clock, Info, Lightbulb, MapPin, Monitor, Sparkles, TreePine, X } from "lucide-react";
import { DAYS, getCategoryStyles, slotToTimeStr } from "../constants";
import api from "../../../../lib/api";
import { requiredRoomTypeForMeeting } from "../hooks/useConflict";
import { FULL_DAY_NAMES, slotCount, slotToTime24h, timeToSlot } from "../../../../lib/timeGrid";
import type { DeliveryMode, DropContext, ScheduleItem, Section, Subject, Room, ScheduleStatus, Semester } from "../types";
import { getSubjectTotalSlots } from "../types";
import { getCourseSlotPlan, laboratoryComponentSlots, slotsToHours, type LaboratoryDurationSettings } from "../courseSlotPlan";
import { evaluatePlacementQuality, type PlannedMeeting } from "../placementQuality";
import {
  isFieldSchedulingEligible,
  isHybridSchedulingEligible,
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
  startOptionCount: number;
  onStartChange: (slot: number) => void;
  durationSlots: number;
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
  startOptionCount,
  onStartChange,
  durationSlots,
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
  setModalFieldEnabled,
  modalForceDayEnabled,
  setModalForceDayEnabled,
  modalForcedDayIndex,
  setModalForcedDayIndex,
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

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = canGenerateSchedule;
  const hasConflict = !!modalConflict;
  const shouldShowRecommendations = canUseRecommendations && (hasConflict || areRecommendationsRequested);
  const isTwoMeetingPattern = modalIsHybrid || modalSplitEnabled;
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

  const recommendationPayload = useMemo(() => {
    if (!dropSubject || !selectedSectionId) return null;

    const payload = {
      section_id: Number(selectedSectionId),
      course_ids: [Number(dropSubject.id)],
      mode: dropSubjectIsField ? "field" : modalClassMode,
      is_hybrid: modalIsHybrid,
      split_session_enabled: modalIsHybrid,
      selected_split_session_course_ids: modalIsHybrid ? [Number(dropSubject.id)] : [],
      split_gec_enabled: modalSplitEnabled,
      selected_gec_course_ids: modalSplitEnabled ? [Number(dropSubject.id)] : [],
      preferred_patterns: modalPreferredPattern
        ? { [dropSubject.id]: modalPreferredPattern }
        : {},
      tentative_schedules: tentativeSchedules,
      max_solutions: 3,
      timeout_seconds: 5,
    };

    return { ...payload, seed: stableRecommendationSeed(payload) };
  }, [
    dropSubject,
    dropSubjectIsField,
    modalClassMode,
    modalIsHybrid,
    modalPreferredPattern,
    modalSplitEnabled,
    selectedSectionId,
    tentativeSchedules,
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
  const fieldRequired = dropSubjectIsField || dropSubject.roomTypeRequired === "field";
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

    const requiredRoomType = dropSubjectIsField ? "field" : requiredRoomTypeForMeeting(dropSubject);

    return !requiredRoomType || r.roomType === requiredRoomType;
  });

  const allowsRoomTba = modalRoomId === ROOM_TBA
    || modalDay2RoomId === ROOM_TBA
    || (!dropSubjectIsField && requiredRoomTypeForMeeting(dropSubject) === "laboratory")
    || (hasBoth && modalIsHybrid);




  const recommendedRoomLabel = modalClassMode === "on-site"
    ? modalRoomId === ROOM_TBA
      ? "Room TBA"
      : rooms.find((r) => r.id === modalRoomId)?.name || "Auto-assigning first available room..."
    : modalClassMode === "online"
    ? "Online"
    : "Field";
  const deliveryModeLabel = modalIsHybrid
    ? "Online lecture + on-site laboratory"
    : modalFieldEnabled
      ? "Field"
      : modalClassMode.replace("-", " ");

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
    const sortedRows = [...rows].sort((left, right) => (
      (left.is_hybrid || right.is_hybrid
        ? Number(left.mode === "online") - Number(right.mode === "online")
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
    setModalIsHybrid(firstRow.is_hybrid);
    setModalSplitEnabled(!firstRow.is_hybrid && ["MW", "TTh"].includes(firstRow.preferred_pattern ?? ""));

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
      setDropContext({
        ...dropContext,
        dayIndex: firstDayIndex,
        startSlot: firstStartSlot
      });
    }

    // A forced day saved with a different day than the placement is refused by
    // the Rule Engine, so the chosen alternative carries the forced day with it.
    if (modalForceDayEnabled) setModalForcedDayIndex(firstDayIndex);
    setModalValidationError("");
    setAppliedRecommendationRank(rank);
    setSelectedRecommendationId(recommendationId);
  };

  const applyRecommendation = async (recommendation: DropRecommendation) => {
    if (isApplyingRecommendation) return;
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

  const handleHybridToggle = (enabled: boolean) => {
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
      // Keep Hybrid active after configuring both required component meetings
      // so the second card stays open.
      setModalIsHybrid(true);
    } else {
      setModalIsHybrid(false);
      setModalPreferredPattern(null);
      setModalDay1Duration(totalSlots);
      setModalDay2Duration(0);
    }
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

  const handleFieldToggle = (enabled: boolean) => {
    setModalFieldEnabled(enabled);
    if (enabled) {
      setModalClassMode("field");
      setModalRoomId("field");
      setModalDay2ClassMode("field");
      setModalDay2RoomId("field");
    } else {
      const lectureRoomId = rooms.find((room) => room.roomType === "lecture" && room.status === "available")?.id ?? "";
      setModalClassMode("on-site");
      setModalRoomId(lectureRoomId);
      setModalDay2ClassMode("on-site");
      setModalDay2RoomId(lectureRoomId);
    }
  };

  const handleForceDayToggle = (enabled: boolean) => {
    setModalForceDayEnabled(enabled);
    if (enabled) {
      setModalIsHybrid(false);
      setModalSplitEnabled(false);
      setModalPreferredPattern(null);
      setModalDay1Index(modalForcedDayIndex);
      setModalDay1Duration(totalSlots);
      setModalDay2Duration(0);
    }
  };

  // The grid window is configurable, so the latest start is derived from it
  // rather than the 24-slot day these selects used to assume.
  const gridSlotCount = slotCount();
  const clampMeetingDuration = (startSlot: number, duration: number): number => {
    const capped = Math.min(duration, courseMaxSlots);
    return startSlot + capped > gridSlotCount ? Math.max(1, gridSlotCount - startSlot) : capped;
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

  // Force Day and Field Course are department settings; placing one class with
  // a different choice rewrites them for every later placement and generation.
  const savedForcedDay = manualSchedulingSettings?.forced_day_rules
    ?.find((rule) => Number(rule.course_id) === Number(dropSubject.id))?.day ?? null;
  const nextForcedDay = modalForceDayEnabled ? FULL_DAY_NAMES[modalForcedDayIndex] : null;
  const savedFieldCourse = (manualSchedulingSettings?.field_course_codes ?? [])
    .some((code) => code.trim().toUpperCase() === dropSubject.code.trim().toUpperCase());
  const pendingSettingChanges = manualSchedulingSettings === null ? [] : [
    ...(savedForcedDay !== nextForcedDay
      ? [nextForcedDay
          ? `Force Day for ${dropSubject.code} becomes ${nextForcedDay}${savedForcedDay ? ` (was ${savedForcedDay})` : ""}.`
          : `The Force Day rule for ${dropSubject.code} (${savedForcedDay}) is removed.`]
      : []),
    ...(!fieldRequired && savedFieldCourse !== modalFieldEnabled
      ? [modalFieldEnabled
          ? `${dropSubject.code} is added to the department's field courses.`
          : `${dropSubject.code} is removed from the department's field courses.`]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-slate-950/55 p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setDropContext(null); }}
    >
      <div className={`flex max-h-[94vh] w-full max-w-[96vw] flex-col gap-3 xl:flex-row xl:items-stretch ${isTwoMeetingPattern ? "2xl:max-w-[1400px]" : "2xl:max-w-6xl"}`}>
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
              <p className="text-[11px] text-slate-400">Force Day and Field Course are saved to the department's scheduling settings.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {hybridEligible && (
                <label className={optionTileClass(modalIsHybrid)}>
                  <input type="checkbox" checked={modalIsHybrid} onChange={(event) => handleHybridToggle(event.target.checked)} className={checkboxClass} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">Hybrid</span>
                    <span className="block text-[11px] leading-snug text-slate-500">Online lecture and on-site laboratory.</span>
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
              {fieldEligible && (
                <label className={optionTileClass(modalFieldEnabled, fieldRequired)}>
                  <input type="checkbox" checked={modalFieldEnabled} disabled={fieldRequired} onChange={(event) => handleFieldToggle(event.target.checked)} className={checkboxClass} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">Field Course</span>
                    <span className="block text-[11px] leading-snug text-slate-500">{fieldRequired ? "Required by the course classification." : "Use field delivery and field capacity rules."}</span>
                  </span>
                </label>
              )}
              <div className={`${optionTileClass(modalForceDayEnabled)} flex-col !gap-2`}>
                <label className="flex w-full cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={modalForceDayEnabled} onChange={(event) => handleForceDayToggle(event.target.checked)} className={checkboxClass} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">Force Day</span>
                    <span className="block text-[11px] leading-snug text-slate-500">Require this course on one day.</span>
                  </span>
                </label>
                {modalForceDayEnabled && (
                  <select
                    aria-label="Forced day"
                    value={modalForcedDayIndex}
                    onChange={(event) => {
                      const nextDay = Number(event.target.value);
                      setModalForcedDayIndex(nextDay);
                      setModalDay1Index(nextDay);
                    }}
                    className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15"
                  >
                    {availableDays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                )}
              </div>
            </div>
            {pendingSettingChanges.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <div className="min-w-0 text-xs text-amber-900">
                  <p className="font-bold">Placing this class also updates department settings</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {pendingSettingChanges.map((change) => <li key={change}>{change}</li>)}
                  </ul>
                </div>
              </div>
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
                || (modalFieldEnabled && mode !== "field")
                || (!modalFieldEnabled && !modalIsHybrid && mode === "field")}
              modeTitle={(mode) => (!modalIsHybrid && hasLaboratoryUnits && mode === "online"
                ? "Use Hybrid to configure an online lecture with an on-site laboratory."
                : undefined)}
              onModeSelect={(mode) => {
                discardSelectedRecommendation();
                setModalClassMode(mode);
              }}
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
              endLabelSuffix={isTwoMeetingPattern ? undefined : "(auto)"}
            />

            {isTwoMeetingPattern && (
              <MeetingCard
                title={secondMeetingTitle}
                mode={modalDay2ClassMode}
                isModeDisabled={(mode) =>
                  (modalIsHybrid && mode !== "online")
                  || (!modalIsHybrid && hasLaboratoryUnits && mode === "online")
                  || (modalFieldEnabled && mode !== "field")
                  || (!modalFieldEnabled && !modalIsHybrid && mode === "field")}
                modeTitle={(mode) => (!modalIsHybrid && hasLaboratoryUnits && mode === "online"
                  ? "Use Hybrid to configure an online lecture with an on-site laboratory."
                  : undefined)}
                onModeSelect={(mode) => {
                  discardSelectedRecommendation();
                  setModalDay2ClassMode(mode);
                }}
                roomId={modalDay2RoomId}
                onRoomChange={(roomId) => { setModalDay2RoomId(roomId); setModalValidationError(""); }}
                hasRoomError={modalDay2ClassMode === "on-site" && roomMissing(modalDay2RoomId)}
                allowsRoomTba={Boolean(allowsRoomTba)}
                roomOptions={onSiteRoomOptions}
                dayAriaLabel="Second meeting day"
                dayValue={modalDay2Index}
                dayDisabled={modalSplitEnabled}
                dayOptions={availableDays.map((day, index) => (
                  index === modalDay1Index
                    ? { value: index, label: `${day} (first meeting)`, disabled: true }
                    : { value: index, label: day }
                ))}
                onDayChange={handleDay2Change}
                startSlot={modalDay2StartSlot}
                startOptionCount={gridSlotCount}
                onStartChange={(startSlot) => {
                  setModalDay2StartSlot(startSlot);
                  setIsDay2ModifiedByUser(true);
                  setModalDay2Duration(clampMeetingDuration(startSlot, modalDay2Duration));
                }}
                durationSlots={modalDay2Duration}
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

          {hasConflict && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-red-800">This placement has a conflict</p>
                <p className="mt-0.5 text-sm text-red-700">{modalConflict}</p>
                <p className="mt-1.5 text-xs text-red-600">
                  Choose another room, day or time, change the class mode{canUseRecommendations ? ", or use one of the suggested alternatives" : ""}.
                </p>
              </div>
            </div>
          )}
        </form>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className={`flex items-center gap-2 text-sm font-bold ${hasConflict ? "text-red-700" : "text-emerald-700"}`}>
            {hasConflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {hasConflict ? "Resolve the conflict to continue" : "Ready to add to the timetable"}
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
                "Resolve Conflict First"
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
          className="flex max-h-80 min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl xl:max-h-[94vh] xl:w-[370px]"
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 bg-gradient-to-b from-[#fff8e8] to-white px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c9952a]/15 text-[#7a4c08]">
              <Lightbulb className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-black leading-tight text-slate-900">Suggested alternatives</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">
                Conflict-free placements found by the CSP solver and checked by the Rule Engine.
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
            ) : recommendations.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <Sparkles className="h-5 w-5 text-slate-400" />
                </span>
                <p className="text-sm font-bold text-slate-700">No alternatives found</p>
                <p className="mt-0.5 text-xs text-slate-500">Try another class mode or scheduling option.</p>
              </div>
            ) : (
              <ol className="space-y-2">
                {recommendations.map((recommendation, index) => {
                  const isApplied = appliedRecommendationRank === recommendation.rank;

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

                      <ul className="mt-2.5 space-y-1.5">
                        {recommendation.schedules.map((row, rowIndex) => (
                          <li
                            key={`${row.day}-${row.start_time}-${rowIndex}`}
                            className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2"
                          >
                            <span className="w-10 shrink-0 text-center text-[11px] font-black uppercase text-[#4e0a10]">
                              {row.day.slice(0, 3)}
                            </span>
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block text-xs font-bold text-slate-800">
                                {slotToTimeStr(timeToSlot(row.start_time))} – {slotToTimeStr(timeToSlot(row.end_time))}
                              </span>
                              <span className="flex items-center gap-1 truncate text-[11px] text-slate-500">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {getRecommendationRoomLabel(row, rooms)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        onClick={() => void applyRecommendation(recommendation)}
                        disabled={isApplyingRecommendation || isApplied}
                        className={`mt-2.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors ${
                          isApplied
                            ? "cursor-default bg-emerald-100 text-emerald-800"
                            : "bg-[#4e0a10] text-white hover:bg-[#3a0809] disabled:opacity-60"
                        }`}
                      >
                        {isApplied ? <><CheckCircle2 className="h-3.5 w-3.5" /> Selected</> : "Use this option"}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
