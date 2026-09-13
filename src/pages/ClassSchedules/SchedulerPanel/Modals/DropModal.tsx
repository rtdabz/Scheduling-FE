import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarPlus, CheckCircle2, ChevronDown, Clock, Lightbulb, MapPin, Monitor, Sparkles, TreePine, X } from "lucide-react";
import { DAYS, getCategoryStyles, slotToTimeStr } from "../constants";
import api from "../../../../lib/api";
import { getStoredUserRole } from "../../../../lib/storedUser";
import { requiredRoomTypeForMeeting } from "../hooks/useConflict";
import { FULL_DAY_NAMES, slotCount, slotToTime24h, timeToSlot } from "../../../../lib/timeGrid";
import type { DeliveryMode, DropContext, ScheduleItem, Section, Subject, Room, ScheduleStatus, Semester } from "../types";
import { getSubjectTotalSlots } from "../types";
import { slotsToHours } from "../courseSlotPlan";
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
  manualSchedulingSettings: {
    lecture_lab_schedule_override_enabled?: boolean;
    gec_split_schedule_override_enabled?: boolean;
    major_lecture_split_schedule_override_enabled?: boolean;
  } | null;
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

export default function DropModal({
  rooms,
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
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [confirmationPrompt, setConfirmationPrompt] = useState<ConfigurationConfirmationPrompt | null>(null);
  const [confirmedConfiguration, setConfirmedConfiguration] = useState<ConfigurationConfirmation | null>(null);
  const [appliedRecommendationRank, setAppliedRecommendationRank] = useState<number | null>(null);
  const [isApplyingRecommendation, setIsApplyingRecommendation] = useState(false);



  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = useMemo(() => {
    const role = getStoredUserRole();
    return role === "secretary" || role === "program_head";
  }, []);
  const hasConflict = !!modalConflict;
  const shouldShowRecommendations = canUseRecommendations && hasConflict;
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
            setRecommendationError("Recommendations are unavailable right now.");
          }
          setRecommendations([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRecommendationLoading(false);
        }
      }
    };

    loadRecommendations();

    return () => controller.abort();
  }, [
    dropContext,
    dropSubject,
    dropSubjectIsField,
    modalClassMode,
    modalConflict,
    modalIsHybrid,
    modalPreferredPattern,
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

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setDropContext(null); }}
    >
      <div className={`flex max-h-[92vh] w-full max-w-[96vw] flex-col gap-4 xl:flex-row xl:items-stretch ${isTwoMeetingPattern ? "2xl:max-w-[1440px]" : "2xl:max-w-6xl"}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-modal-title"
        aria-describedby="placement-modal-desc"
        className="bg-white rounded-2xl shadow-2xl min-h-0 flex-1 overflow-hidden flex flex-col transition-all duration-200 animate-in fade-in zoom-in-95"
      >


        <div className="flex justify-between items-start px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-start gap-3">
            <CalendarPlus className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
            <div>
              <h3 id="placement-modal-title" className="text-lg font-semibold text-gray-800 leading-tight">Review Class Placement</h3>
              <p id="placement-modal-desc" className="text-sm text-gray-500 mt-0.5">
                Review the recommended schedule. Change details only when needed.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setDropContext(null)}
            aria-label="Close placement dialog"
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleModalConfirm}
          onChangeCapture={discardSelectedRecommendation}
          className="flex-1 overflow-y-auto px-5 py-3 space-y-3 bg-gray-50/30"
        >
          <section className="rounded-xl border border-[#4e0a10]/10 bg-[#4e0a10]/5 px-4 py-2 shrink-0">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-extrabold text-gray-900">{dropSubject.code}</p>
                  <span className="text-xs bg-white text-gray-600 rounded-full border border-gray-200 px-2 py-0.5 font-bold">
                    {dropSubject.units} units
                  </span>
                  <span className={`text-xs rounded-full px-2 py-0.5 border font-bold ${dropStyles.typeBadge}`}>
                    {dropStyles.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-gray-500" title={dropSubject.name}>{dropSubject.name}</p>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-2 border-t border-[#4e0a10]/10 pt-3 md:max-w-2xl md:grid-cols-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Room & delivery</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-gray-800">{recommendedRoomLabel}</p>
                  <p className="text-xs capitalize text-gray-500">{deliveryModeLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Schedule</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-800">{patternLabel}</p>
                  <p className="text-xs text-gray-500">
                    {slotToTimeStr(modalPreferredPattern ? modalDay1StartSlot : dropContext.startSlot)}
                    {/* Derived from the durations actually selected: the old helper
                        returned the course's units under a "contact hrs" label, which
                        understated a lecture/laboratory split. */}
                    {modalPreferredPattern ? ` · ${slotsToHours(modalDay1Duration + modalDay2Duration)} total contact hrs (${dropSubject ? dropSubject.units : 3} units)` : `–${slotToTimeStr(modalDay1StartSlot + modalDay1Duration)}`}
                  </p>
                </div>
                <div className="col-span-2 flex items-center md:col-span-1 md:justify-end">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                    hasConflict ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {hasConflict ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {hasConflict ? "Conflict detected" : "Ready to place"}
                  </span>
                </div>
              </div>
            </div>
          </section>





          <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Scheduling configurations</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
              {hybridEligible && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-2.5">
                  <input type="checkbox" checked={modalIsHybrid} onChange={(event) => {
                    const enabled = event.target.checked;
                    setModalSplitEnabled(false);
                    setModalForceDayEnabled(false);
                    setIsDay2ModifiedByUser(false);
                    if (enabled) {
                      const preservedDayIndex = modalDay1Index;
                      const lectureSlots = Number(dropSubject.lectureHours) * 2;
                      const laboratorySlots = Number(dropSubject.labHours) * 6;
                      const secondDay = preservedDayIndex === modalDay2Index
                        ? getFallbackMeetingDayIndex(preservedDayIndex)
                        : modalDay2Index;
                      setModalPreferredPattern(`days:${preservedDayIndex}-${secondDay}`);
                      // Preferred-pattern setters may synchronize both day
                      // fields. The day chosen before enabling Hybrid remains
                      // the laboratory day unless the user changes it explicitly.
                      setModalDay1Index(preservedDayIndex);
                      setModalDay2Index(secondDay);
                      setModalDay1Duration(laboratorySlots);
                      setModalDay2Duration(lectureSlots);
                      setModalClassMode("on-site");
                      setModalRoomId(rooms.find((room) => room.roomType === "laboratory" && room.status === "available")?.id ?? ROOM_TBA);
                      setModalDay2ClassMode("online");
                      setModalDay2RoomId("online");
                      // Keep Hybrid active after configuring both required
                      // component meetings so the second card stays open.
                      setModalIsHybrid(true);
                    } else {
                      setModalIsHybrid(false);
                      setModalPreferredPattern(null);
                      setModalDay1Duration(totalSlots);
                      setModalDay2Duration(0);
                    }
                  }} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#4e0a10]" />
                  <span><span className="block text-xs font-bold text-gray-800">Hybrid</span><span className="block text-[11px] text-gray-500">Online lecture and on-site laboratory.</span></span>
                </label>
              )}
              {splitEligible && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-2.5">
                  <input type="checkbox" checked={modalSplitEnabled} onChange={(event) => {
                    const enabled = event.target.checked;
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
                  }} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#4e0a10]" />
                  <span><span className="block text-xs font-bold text-gray-800">Split Session</span><span className="block text-[11px] text-gray-500">Two balanced MW or TTh meetings.</span></span>
                </label>
              )}
              {fieldEligible && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-2.5">
                  <input type="checkbox" checked={modalFieldEnabled} disabled={fieldRequired} onChange={(event) => {
                    const enabled = event.target.checked;
                    setModalFieldEnabled(enabled);
                    if (enabled) {
                      setModalClassMode("field");
                      setModalRoomId("field");
                      setModalDay2ClassMode("field");
                      setModalDay2RoomId("field");
                    } else {
                      setModalClassMode("on-site");
                      setModalRoomId(rooms.find((room) => room.roomType === "lecture" && room.status === "available")?.id ?? "");
                      setModalDay2ClassMode("on-site");
                      setModalDay2RoomId(rooms.find((room) => room.roomType === "lecture" && room.status === "available")?.id ?? "");
                    }
                  }} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#4e0a10]" />
                  <span><span className="block text-xs font-bold text-gray-800">Field Course</span><span className="block text-[11px] text-gray-500">{fieldRequired ? "Required by the course classification." : "Use field delivery and field capacity rules."}</span></span>
                </label>
              )}
              <div className="rounded-lg border border-gray-200 p-2.5">
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={modalForceDayEnabled} onChange={(event) => {
                    const enabled = event.target.checked;
                    setModalForceDayEnabled(enabled);
                    if (enabled) {
                      setModalIsHybrid(false);
                      setModalSplitEnabled(false);
                      setModalPreferredPattern(null);
                      setModalDay1Index(modalForcedDayIndex);
                      setModalDay1Duration(totalSlots);
                      setModalDay2Duration(0);
                    }
                  }} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#4e0a10]" />
                  <span><span className="block text-xs font-bold text-gray-800">Force Day</span><span className="block text-[11px] text-gray-500">Require this course on one day.</span></span>
                </label>
                <select value={modalForcedDayIndex} disabled={!modalForceDayEnabled} onChange={(event) => {
                  const nextDay = Number(event.target.value);
                  setModalForcedDayIndex(nextDay);
                  setModalDay1Index(nextDay);
                }} className="mt-2 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold disabled:bg-gray-100">
                  {availableDays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </div>
            </div>
            {modalSplitEnabled && (
              <label className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-600">
                Split pattern
                <select value={modalPreferredPattern ?? "MW"} onChange={(event) => {
                  const pattern = event.target.value;
                  const [firstDay, secondDay] = pattern === "TTh" ? [1, 3] : [0, 2];
                  setModalPreferredPattern(pattern);
                  setModalDay1Index(firstDay);
                  setModalDay2Index(secondDay);
                }} className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold">
                  <option value="MW">Monday-Wednesday</option>
                  <option value="TTh">Tuesday-Thursday</option>
                </select>
              </label>
            )}
          </div>

          {/* Meetings Cards Grid */}
          <div className={`grid grid-cols-1 gap-4 ${isTwoMeetingPattern ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
            {/* First Meeting */}
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <h4 className="text-sm font-extrabold text-[#4e0a10] uppercase tracking-wide flex items-center gap-1.5 border-b pb-2">
                <span className="w-2 h-2 rounded-full bg-[#4e0a10]" />
                {modalIsHybrid ? "Laboratory Meeting" : "First Meeting"}
              </h4>

              {/* Class Mode */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                  Class Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "on-site" as const, label: "On-Site", Icon: Building2, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" },
                    { value: "online" as const, label: "Online", Icon: Monitor, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" },
                    { value: "field" as const, label: "Field", Icon: TreePine, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" }
                  ]).map(({ value: m, label, Icon, selectedCls }) => {
                    const isSelected = modalClassMode === m;
                    const isDisabledMode =
                      (modalIsHybrid && m !== "on-site") ||
                      (!modalIsHybrid && hasLaboratoryUnits && m === "online") ||
                      (modalFieldEnabled && m !== "field") ||
                      (!modalFieldEnabled && !modalIsHybrid && m === "field");
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={isDisabledMode}
                        title={!modalIsHybrid && hasLaboratoryUnits && m === "online"
                          ? "Use Hybrid to configure an online lecture with an on-site laboratory."
                          : undefined}
                        onClick={() => {
                          if (isDisabledMode) return;
                          discardSelectedRecommendation();
                          setModalClassMode(m);
                        }}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? `${selectedCls} cursor-default`
                            : isDisabledMode
                            ? "opacity-50 bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Room */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                  Room
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                  {modalClassMode === "on-site" ? (
                    <select
                      value={modalRoomId}
                      onChange={(e) => { setModalRoomId(e.target.value); setModalValidationError(""); }}
                      className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm font-semibold text-gray-700 outline-none transition-all focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20"
                    >
                      <option value="">Select a room...</option>
                      {allowsRoomTba && <option value={ROOM_TBA}>Room TBA (assign later)</option>}
                      {onSiteRoomOptions
                        .map((r) => {
                          const isUnavailable = r.status === "not available";
                          return (
                            <option
                              key={r.id}
                              value={r.id}
                              disabled={isUnavailable}
                              className={isUnavailable ? "text-gray-400 bg-gray-100 italic" : ""}
                            >
                              {r.name}{r.grantWindows ? ` — Granted: ${r.grantWindows.map(describeWindow).join(", ")}` : ""} {isUnavailable ? " — (Not Available)" : ""}
                            </option>
                          );
                        })}
                    </select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={modalClassMode === "online" ? "Online" : "Field"}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm font-semibold text-gray-500 outline-none"
                    />
                  )}
                  {modalClassMode === "on-site" && (
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                </div>
                {modalClassMode === "on-site" && modalValidationError && !modalRoomId && (
                  <p className="text-xs text-red-500 mt-1">{modalValidationError}</p>
                )}
              </div>

              {/* Day Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                  Meeting Day
                </label>
                {isTwoMeetingPattern ? (
                  <select
                    aria-label="First meeting day"
                    value={modalDay1Index}
                    disabled={modalSplitEnabled || modalForceDayEnabled}
                    onChange={(event) => {
                      const nextDay = Number(event.target.value);
                      handleDay1Change(nextDay);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10]"
                  >
                    {availableDays.map((day, index) => (
                      <option key={day} value={index} disabled={index === modalDay2Index}>
                        {index === modalDay2Index ? `${day} (Selected as second meeting)` : day}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    aria-label="First meeting day"
                    value={modalDay1Index}
                    disabled={modalForceDayEnabled}
                    onChange={(event) => {
                      setModalDay1Index(Number(event.target.value));
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] cursor-pointer"
                  >
                    {availableDays.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Time Schedule (Start & End Time) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Start Time
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                    {isTwoMeetingPattern ? (
                      <select
                        value={modalDay1StartSlot}
                        onChange={(e) => {
                          const newStart = Number(e.target.value);
                          setModalDay1StartSlot(newStart);
                          let nextDuration = modalDay1Duration;
                          if (nextDuration > courseMaxSlots) {
                            nextDuration = courseMaxSlots;
                          }
                          if (newStart + nextDuration > slotCount()) {
                            nextDuration = Math.max(1, 24 - newStart);
                          }
                          setModalDay1Duration(nextDuration);
                        }}
                        className="w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] cursor-pointer"
                      >
                        {Array.from({ length: slotCount() }, (_, i) => (
                          <option key={i} value={i}>
                            {slotToTimeStr(i)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={modalDay1StartSlot}
                        onChange={(e) => {
                          const newStart = Number(e.target.value);
                          setModalDay1StartSlot(newStart);
                        }}
                        className="w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] cursor-pointer"
                      >
                        {Array.from({ length: 25 - totalSlots }, (_, i) => (
                          <option key={i} value={i}>
                            {slotToTimeStr(i)}
                          </option>
                        ))}
                      </select>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
                    End Time {!isTwoMeetingPattern && "(Auto)"}
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                    <input
                      type="text"
                      readOnly
                      aria-disabled="true"
                      value={`${slotToTimeStr(modalDay1StartSlot + modalDay1Duration)} (${modalDay1Duration / 2} hrs)`}
                      className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                    />
                  </div>
                </div>
              </div>


            </div>

            {/* Second Meeting */}
            {isTwoMeetingPattern ? (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm animate-in fade-in zoom-in-95">
                <h4 className="text-sm font-extrabold text-[#4e0a10] uppercase tracking-wide flex items-center gap-1.5 border-b pb-2">
                  <span className="w-2 h-2 rounded-full bg-[#4e0a10]" />
                  {modalIsHybrid ? "Lecture Meeting" : "Second Meeting"}
                </h4>

                {/* Class Mode */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Class Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "on-site" as const, label: "On-Site", Icon: Building2, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" },
                      { value: "online" as const, label: "Online", Icon: Monitor, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" },
                      { value: "field" as const, label: "Field", Icon: TreePine, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" }
                    ]).map(({ value: m, label, Icon, selectedCls }) => {
                      const isSelected = modalDay2ClassMode === m;
                      const isDisabledMode =
                        (modalIsHybrid && m !== "online") ||
                        (!modalIsHybrid && hasLaboratoryUnits && m === "online") ||
                        (modalFieldEnabled && m !== "field") ||
                        (!modalFieldEnabled && !modalIsHybrid && m === "field");
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={isDisabledMode}
                          title={!modalIsHybrid && hasLaboratoryUnits && m === "online"
                            ? "Use Hybrid to configure an online lecture with an on-site laboratory."
                            : undefined}
                          onClick={() => {
                            if (isDisabledMode) return;
                            discardSelectedRecommendation();
                            setModalDay2ClassMode(m);
                          }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-all ${
                            isSelected
                              ? `${selectedCls} cursor-default`
                              : isDisabledMode
                              ? "opacity-50 bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Room */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Room
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                    {modalDay2ClassMode === "on-site" ? (
                      <select
                        value={modalDay2RoomId}
                        onChange={(e) => { setModalDay2RoomId(e.target.value); setModalValidationError(""); }}
                        className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm font-semibold text-gray-700 outline-none transition-all focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20"
                      >
                      <option value="">Select a room...</option>
                      {allowsRoomTba && <option value={ROOM_TBA}>Room TBA (assign later)</option>}
                        {onSiteRoomOptions
                          .map((r) => {
                            const isUnavailable = r.status === "not available";
                            return (
                              <option
                                key={r.id}
                                value={r.id}
                                disabled={isUnavailable}
                                className={isUnavailable ? "text-gray-400 bg-gray-100 italic" : ""}
                              >
                                {r.name}{r.grantWindows ? ` — Granted: ${r.grantWindows.map(describeWindow).join(", ")}` : ""} {isUnavailable ? " — (Not Available)" : ""}
                              </option>
                            );
                          })}
                      </select>
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={modalDay2ClassMode === "online" ? "Online" : "Field"}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm font-semibold text-gray-500 outline-none"
                      />
                    )}
                    {modalDay2ClassMode === "on-site" && (
                      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>
                  {modalDay2ClassMode === "on-site" && modalValidationError && !modalDay2RoomId && (
                    <p className="text-xs text-red-500 mt-1">{modalValidationError}</p>
                  )}
                </div>

                {/* Day Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Meeting Day
                  </label>
                    <select
                      aria-label="Second meeting day"
                      value={modalDay2Index}
                      disabled={modalSplitEnabled}
                    onChange={(event) => {
                      const nextDay = Number(event.target.value);
                      handleDay2Change(nextDay);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10]"
                  >
                    {availableDays.map((day, index) => (
                      <option key={day} value={index} disabled={index === modalDay1Index}>
                        {index === modalDay1Index ? `${day} (Selected as first meeting)` : day}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time Schedule (Start & End Time) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      Start Time
                    </label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                      <select
                        value={modalDay2StartSlot}
                        onChange={(e) => {
                          const newStart = Number(e.target.value);
                          setModalDay2StartSlot(newStart);
                          setIsDay2ModifiedByUser(true);
                          let nextDuration = modalDay2Duration;
                          if (nextDuration > courseMaxSlots) {
                            nextDuration = courseMaxSlots;
                          }
                          if (newStart + nextDuration > slotCount()) {
                            nextDuration = Math.max(1, 24 - newStart);
                          }
                          setModalDay2Duration(nextDuration);
                        }}
                        className="w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] cursor-pointer"
                      >
                        {Array.from({ length: slotCount() }, (_, i) => (
                          <option key={i} value={i}>
                            {slotToTimeStr(i)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      End Time
                    </label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                      <input
                        type="text"
                        readOnly
                        aria-disabled="true"
                        value={`${slotToTimeStr(modalDay2StartSlot + modalDay2Duration)} (${modalDay2Duration / 2} hrs)`}
                        className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                      />
                    </div>
                  </div>
              </div>


            </div>
            ) : null}

            


            





            {hasConflict && (
              <div className="col-span-1 lg:col-span-2 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm font-bold text-red-700 uppercase tracking-wide">Conflicts Detected</span>
                </div>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm text-red-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                    {modalConflict}
                  </li>
                  <li className="flex items-start gap-2 text-sm text-red-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                    Choose another room, select a different time, or change the class mode before placing this class.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </form>

        <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`mt-0.5 rounded-full p-1 shrink-0 ${
                hasConflict ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
              }`}>
                {hasConflict ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold leading-tight ${
                  hasConflict ? "text-red-700" : "text-emerald-800"
                }`}>
                  {hasConflict ? "Resolve Conflicts First" : "Placement is ready to be added"}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
            type="button"
            onClick={() => setDropContext(null)}
            className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
              <button
            type="button"
            onClick={(e) => handleModalConfirm(e as unknown as React.FormEvent)}
            disabled={isDisabled}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
              hasConflict
                ? "border border-red-300 text-red-600 bg-white cursor-not-allowed opacity-75"
                : isModalLoading
                ? "bg-[#4e0a10] text-white opacity-75 cursor-not-allowed"
                : "bg-[#4e0a10] text-white hover:brightness-110 cursor-pointer"
            }`}
          >
            {isModalLoading ? (
              <><LoadingSpinner className="w-4 h-4" /> Place Subject</>
            ) : hasConflict ? (
              "Resolve Conflict First"
            ) : (
              "Place on Timetable"
            )}
              </button>


            </div>
          </div>
        </div>
      </div>

      {shouldShowRecommendations && (
        <aside className="flex max-h-72 min-h-0 w-full shrink-0 flex-col rounded-2xl border border-[#C9952A]/30 bg-[#fff8e8] p-4 shadow-2xl xl:max-h-[92vh] xl:w-[360px]">
          <div className="flex items-start gap-2 border-b border-[#C9952A]/20 pb-3">
            <div className="rounded-lg bg-white p-2 shadow-sm">
              <Lightbulb className="w-4 h-4 text-[#7a4c08]" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-[#7a4c08]">Recommendations</p>
              <p className="mt-0.5 text-xs leading-5 text-gray-500">Alternative placements from the CSP and Rule Engine.</p>
            </div>
          </div>

          {isRecommendationLoading ? (
            <div className="mt-3 space-y-2 overflow-y-auto pr-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`recommendation-skeleton-${index}`} className="rounded-lg border border-white/70 bg-white p-3 shadow-sm animate-pulse">
                  <div className="h-3 w-16 rounded bg-[#C9952A]/30" />
                  <div className="mt-3 h-3 w-28 rounded bg-gray-200" />
                  <div className="mt-2 h-3 w-20 rounded bg-gray-200" />
                  <div className="mt-3 h-8 w-full rounded-lg bg-gray-200" />
                </div>
              ))}
            </div>
          ) : recommendationError ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-sm leading-5 text-amber-900">{recommendationError}</p>
              {confirmationPrompt?.configuration_fingerprint && (
                <button
                  type="button"
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-[#7a4c08] px-3 text-xs font-semibold text-white hover:bg-[#633d06] disabled:opacity-60"
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
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/70 p-3 text-sm leading-5 text-gray-600">
              <Sparkles className="mt-0.5 w-4 h-4 shrink-0 text-[#C9952A]" />
              No better alternatives were found for this subject.
            </div>
          ) : (
            <div className="mt-3 space-y-2 overflow-y-auto pr-1">
              {recommendations.map((recommendation, index) => {
                const isApplied = appliedRecommendationRank === recommendation.rank;
                const displayRank = index + 1;

                return (
                  <div
                    key={`${recommendation.rank}-${index}`}
                    className={`rounded-lg border bg-white p-3 shadow-sm transition-colors ${
                      isApplied ? "border-emerald-300 ring-1 ring-emerald-200" : "border-white/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-extrabold text-[#4e0a10]">Option {displayRank}</p>
                      {isApplied && (
                        <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Applied
                        </span>
                      )}
                    </div>
                    <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/60">
                      {recommendation.schedules.map((row, index) => (
                        <div
                          key={`${row.day}-${row.start_time}-${index}`}
                          className="grid grid-cols-[4.5rem_1fr] gap-x-2 px-2.5 py-2 text-xs leading-5"
                        >
                          <span className="font-bold text-gray-800">{row.day}</span>
                          <span className="text-gray-600">
                            {slotToTimeStr(timeToSlot(row.start_time))} - {slotToTimeStr(timeToSlot(row.end_time))}
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Room</span>
                          <span className="font-semibold text-gray-700">{getRecommendationRoomLabel(row, rooms)}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void applyRecommendation(recommendation)}
                      disabled={isApplyingRecommendation}
                      className={`mt-2 w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                        isApplied
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                          : "bg-[#4e0a10] text-white hover:bg-[#3a080c]"
                      }`}
                    >
                      {isApplied ? "Selected" : "Use Option"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      )}
      </div>
    </div>
  );
}
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
