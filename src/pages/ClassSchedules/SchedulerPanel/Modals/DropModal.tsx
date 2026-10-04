import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, Clock, Info, Lightbulb, MapPin, Sparkles, X } from "lucide-react";
import { DAYS, getCategoryStyles, slotToTimeStr } from "../constants";
import api from "../../../../lib/api";
import { requiredRoomTypeForMeeting } from "../hooks/useConflict";
import { FIXED_SPLIT_PATTERNS, FULL_DAY_NAMES, parsePreferredPattern, slotCount, slotToTime24h } from "../../../../lib/timeGrid";
import { isLabMeetingRoomType } from "../../../../lib/labRoomPolicy";
import type { DeliveryMode, DropContext, ScheduleItem, Section, Subject, Room, Semester } from "../types";
import { getSubjectTotalSlots } from "../types";
import { getCourseSlotPlan, laboratoryComponentSlots, slotsToHours, type LaboratoryDurationSettings } from "../courseSlotPlan";
import { evaluatePlacementQuality, type PlannedMeeting } from "../placementQuality";
import {
  isFieldSchedulingEligible,
  isHybridSchedulingEligible,
  isHybridSplitEligible,
  isOnlineSplitEligible,
  balancedSplitSettingsOf,
  isBalancedSplitSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import {
  consecutiveDayRuns,
  DEFAULT_CONSECUTIVE_DAYS,
  MIN_CONSECUTIVE_DAYS,
  runLabel,
  runStartForDay,
  runStartingOn,
  teachingWeek,
  tickedRun,
  type ConsecutivePlacement,
} from "../GenerateSchedule/courseClassConfig";
import PlacementAlternatives from "./PlacementAlternatives";
import MeetingCard from "./MeetingCard";
import {
  ALL_ROOMS,
  ROOM_TBA,
  type ClassMode,
  rankBestMatches,
  slotRoomKey,
  type AvailableSlot,
  type AvailableSlotRoom,
} from "./placementAlternativesModel";

interface AvailableSlotsResponse {
  slots: AvailableSlot[];
  rooms: AvailableSlotRoom[];
  total: number;
  truncated: boolean;
}

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
  canGenerateSchedule: boolean;
  manualSchedulingSettings: (LaboratoryDurationSettings & {
    forced_day_rules?: Array<{ course_id: number; day: string }>;
    field_course_codes?: string[];
    lecture_lab_schedule_override_enabled?: boolean;
    gec_split_schedule_override_enabled?: boolean;
    major_lecture_split_schedule_override_enabled?: boolean;
    sunday_classes_enabled?: boolean;
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
  modalWasConflicted?: boolean;
  isModalLoading: boolean;
  setDropContext: (value: DropContext | null) => void;
  handleModalConfirm: (e: React.FormEvent) => void;
  modalRun?: ConsecutivePlacement | null;
  modalConsecutiveDays?: number | null;
  setModalConsecutiveDays?: (value: number | null) => void;
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

type SplitDelivery = "onsite" | "hybrid" | "online";

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
  setDropContext,
  handleModalConfirm,
  modalRun = null,
  setModalConsecutiveDays,
}: DropModalProps) {
  const isSummerSemester = activeSemester?.semester === "summer";
  const availableDays = isSummerSemester ? DAYS.slice(0, 5) : DAYS;
  const hasBoth = dropSubject && Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
  const hasLaboratoryUnits = Number(dropSubject?.labHours ?? 0) > 0;
  const [areRecommendationsRequested, setAreRecommendationsRequested] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [availableSlotRooms, setAvailableSlotRooms] = useState<AvailableSlotRoom[]>([]);
  const [areSlotsTruncated, setAreSlotsTruncated] = useState(false);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>(ALL_ROOMS);
  const [slotMeeting, setSlotMeeting] = useState<"first" | "second">("first");

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = canGenerateSchedule;
  const hasConflict = !!modalConflict;
  const shouldShowRecommendations = canUseRecommendations && (hasConflict || areRecommendationsRequested);
  const isTwoMeetingPattern = modalIsHybrid || modalSplitEnabled;
  const currentRun = modalRun ? runStartingOn(modalRun, modalDay1Index) : null;
  const preferredRun = modalRun ? tickedRun(modalRun) : null;
  const isSameTimePair = isTwoMeetingPattern && !hasLaboratoryUnits;
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

  const slotMeetingPlan = useMemo(() => {
    const hasPartner = isTwoMeetingPattern && modalDay2Duration > 0;
    const isSecond = hasPartner && slotMeeting === "second";
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

  const searchFromDay = dropContext ? FULL_DAY_NAMES[dropContext.dayIndex] : undefined;

  const availableSlotsPayload = useMemo(() => {
    if (!dropSubject || !selectedSectionId) return null;
    const durationSlots = slotMeetingPlan.durationSlots > 0
      ? slotMeetingPlan.durationSlots
      : getSubjectTotalSlots(dropSubject);
    if (durationSlots <= 0) return null;

    return {
      section_id: Number(selectedSectionId),
      course_id: Number(dropSubject.id),
      duration_slots: durationSlots,
      meeting_type: slotMeetingPlan.meetingType,
      excluded_days: slotMeetingPlan.excludedDays,
      tentative_schedules: tentativeSchedules,
      ...(searchFromDay ? { search_from_day: searchFromDay } : {}),
      ...(modalRun ? {
        consecutive_days: modalRun.dayCount,
        meeting_type: null,
        excluded_days: preferredRun ? DAYS.filter((day) => !preferredRun.includes(day)) : [],
      } : {}),
    };
  }, [dropSubject, selectedSectionId, slotMeetingPlan, tentativeSchedules, searchFromDay, modalRun, preferredRun]);

  useEffect(() => {
    if (!shouldShowRecommendations || !availableSlotsPayload) {
      setAvailableSlots([]);
      setAvailableSlotRooms([]);
      setAreSlotsTruncated(false);
      setSlotsError(null);

      return;
    }

    let active = true;
    const controller = new AbortController();
    setIsSlotsLoading(true);
    setSlotsError(null);

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
        setAvailableSlots([]);
        setAvailableSlotRooms([]);
        setAreSlotsTruncated(false);
        setSlotsError("Suggestions are unavailable right now. You can still adjust the placement by hand.");
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

  useEffect(() => {
    if (!isTwoMeetingPattern || modalDay2Duration <= 0) setSlotMeeting("first");
  }, [isTwoMeetingPattern, modalDay2Duration]);

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

    const distance = (startSlot: number) => Math.abs(startSlot - modalDay1StartSlot);
    return [...firstStarts.entries()]
      .filter(([startSlot]) => secondStarts.has(startSlot))
      .map(([startSlot, slot]) => ({ startSlot, endSlot: slot.end_slot }))
      .sort((left, right) => distance(left.startSlot) - distance(right.startSlot) || left.startSlot - right.startSlot);
  }, [
    isSameTimePair, modalDay2Duration, availableSlots, modalDay1StartSlot,
    modalDay1Index, modalDay2Index, modalClassMode, modalRoomId, modalDay2ClassMode, modalDay2RoomId,
  ]);

  const applySplitPairStart = (startSlot: number): void => {
    setModalDay1StartSlot(startSlot);
    setModalDay2StartSlot(startSlot);
    setModalValidationError("");
  };

  const splitDelivery: SplitDelivery = modalClassMode === "online" && modalDay2ClassMode === "online"
    ? "online"
    : (modalClassMode === "online") !== (modalDay2ClassMode === "online")
      ? "hybrid"
      : "onsite";

  useEffect(() => {
    if (!dropContext || !dropSubject) return;

    const frameId = window.requestAnimationFrame(() => {
      setAreRecommendationsRequested(false);
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
  }, [dropContext, dropSubject, setDropContext]);

  useEffect(() => {
    if (!dropSubject || modalIsHybrid || !hasLaboratoryUnits || modalClassMode !== "online") return;

    setModalClassMode("on-site");
    setModalRoomId(
      rooms.find((room) => isLabMeetingRoomType(room.roomType) && room.status === "available")?.id
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

  const isSecondSlotMeeting = slotMeeting === "second" && isTwoMeetingPattern && modalDay2Duration > 0;
  const requestedDay = FULL_DAY_NAMES[isSecondSlotMeeting ? modalDay2Index : modalDay1Index];
  const requestedStartSlot = isSecondSlotMeeting ? modalDay2StartSlot : modalDay1StartSlot;
  const requestedRoomKey = isSecondSlotMeeting ? modalDay2RoomId : modalRoomId;

  const bestMatches = useMemo(() => {
    if (!dropSubject || availableSlots.length === 0) return [];
    const isPlaced = (schedule: ScheduleItem) =>
      String(schedule.sectionId) === String(selectedSectionId)
      && String(schedule.courseId ?? schedule.subjectId) === String(dropSubject.id);
    const otherSchedules = schedules.filter((schedule) => !isPlaced(schedule));
    const sectionSchedules = otherSchedules.filter((schedule) => String(schedule.sectionId) === String(selectedSectionId));
    const sectionName = sections.find((section) => String(section.id) === String(selectedSectionId))?.name ?? "this section";

    return rankBestMatches(availableSlots, {
      day: requestedDay,
      startSlot: requestedStartSlot,
      roomKey: requestedRoomKey,
      penaltyOf: (slot) => evaluatePlacementQuality({
        meetings: [{
          dayIndex: getDayIndex(slot.day),
          startSlot: slot.start_slot,
          durationSlots: slot.end_slot - slot.start_slot,
          mode: slot.mode,
          roomId: slotRoomKey(slot),
          meetingType: slotMeetingPlan.meetingType,
        }],
        sectionSchedules,
        allSchedules: otherSchedules,
        rooms,
        sectionName,
        isHybrid: modalIsHybrid,
        isForcedDay: modalForceDayEnabled,
      }).reduce((sum, note) => sum + (note.tone === "warning" ? 3 : 1), 0),
    });
  }, [
    availableSlots, dropSubject, modalForceDayEnabled, modalIsHybrid, requestedDay, requestedRoomKey,
    requestedStartSlot, rooms, schedules, sections, selectedSectionId, slotMeetingPlan.meetingType,
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
  const offersHybridSplit = isHybridSplitEligible(dropSubject) || splitDelivery === "hybrid";
  const offersOnlineSplit = (!modalFieldEnabled && isOnlineSplitEligible(dropSubject))
    || splitDelivery === "online";
  const fieldEligible = dropSubjectIsField || isFieldSchedulingEligible(dropSubject);
  const fieldRequired = dropSubject.roomTypeRequired === "field";
  const patternLabel = isTwoMeetingPattern
    ? `${DAYS[modalDay1Index]} + ${DAYS[modalDay2Index]}`
    : currentRun
      ? runLabel(currentRun)
      : "Single meeting";

  const updateTwoMeetingPattern = (day1Index: number, day2Index: number) => {
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


  const dropStyles = getCategoryStyles(dropSubject.category);
  const isDisabled = hasConflict || isModalLoading;

  const onSiteRoomOptions = rooms.filter((r) => {
    const isPhysicalRoom = r.roomType === "lecture" || r.roomType === "laboratory";
    if (!isPhysicalRoom) return false;

    const hasLectureAndLabComponents =
      Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
    if (modalIsHybrid && hasLectureAndLabComponents) return isLabMeetingRoomType(r.roomType);

    const requiredRoomType = modalClassMode === "field" ? "field" : requiredRoomTypeForMeeting(dropSubject);
    if (requiredRoomType === "laboratory") return isLabMeetingRoomType(r.roomType);

    return !requiredRoomType || r.roomType === requiredRoomType;
  });

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
      : modalSplitEnabled && splitDelivery !== "onsite"
        ? splitDelivery === "online" ? "Online split" : "Hybrid split"
        : modalClassMode.replace("-", " ");

  const applyAvailableSlot = (slot: AvailableSlot): void => {
    if (isTwoMeetingPattern) {
      const slotDayIndex = getDayIndex(slot.day);
      const roomId = slot.room_id == null ? slot.mode : String(slot.room_id);
      const isSecondMeeting = slotMeeting === "second" && modalDay2Duration > 0;

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

    setModalDay1Index(getDayIndex(slot.day));
    setModalClassMode(slot.mode);
    setModalRoomId(slot.room_id == null ? slot.mode : String(slot.room_id));
    setModalDay1StartSlot(slot.start_slot);
    setModalValidationError("");
  };

  const forcedDayName = modalForceDayEnabled ? FULL_DAY_NAMES[modalForcedDayIndex] : null;

  const handleIntegratedToggle = (enabled: boolean) => {
    setModalSplitEnabled(false);
    setModalForceDayEnabled(false);
    setIsDay2ModifiedByUser(false);
    if (enabled) {
      const preservedDayIndex = modalDay1Index;
      const lectureSlots = getCourseSlotPlan(dropSubject).lectureSlots;
      const laboratorySlots = laboratoryComponentSlots(dropSubject, manualSchedulingSettings);
      const secondDay = preservedDayIndex === modalDay2Index
        ? getFallbackMeetingDayIndex(preservedDayIndex)
        : modalDay2Index;
      setModalPreferredPattern(`days:${preservedDayIndex}-${secondDay}`);
      setModalDay1Index(preservedDayIndex);
      setModalDay2Index(secondDay);
      setModalDay1Duration(laboratorySlots);
      setModalDay2Duration(lectureSlots);
      setModalClassMode("on-site");
      setModalRoomId(rooms.find((room) => isLabMeetingRoomType(room.roomType) && room.status === "available")?.id ?? ROOM_TBA);
      setModalDay2ClassMode("online");
      setModalDay2RoomId("online");
      setModalIsHybrid(true);
    } else {
      setModalIsHybrid(false);
      setModalPreferredPattern(null);
      setModalDay1Duration(totalSlots);
      setModalDay2Duration(0);
    }
  };

  const sundayEnabled = Boolean(manualSchedulingSettings?.sunday_classes_enabled);
  const maxConsecutiveDays = teachingWeek(sundayEnabled).length;

  const handleConsecutiveDaysChange = (dayCount: number) => {
    if (!setModalConsecutiveDays) return;
    setModalIsHybrid(false);
    setModalSplitEnabled(false);
    setModalForceDayEnabled(false);
    setModalPreferredPattern(null);
    setIsDay2ModifiedByUser(false);
    setModalDay2Duration(0);
    if (!modalRun) setModalDay1Duration(getCourseSlotPlan(dropSubject).singleBlockSlots || totalSlots);
    setModalDay1Index(runStartForDay(
      { dayCount, preferredStartDay: null, runs: consecutiveDayRuns(dayCount, sundayEnabled) },
      modalDay1Index,
    ));
    setModalConsecutiveDays(dayCount);
    setModalValidationError("");
  };

  type MeetingShape = "single" | "integrated" | "split" | "consecutive";
  const meetingShape: MeetingShape = modalRun
    ? "consecutive"
    : modalIsHybrid
      ? "integrated"
      : modalSplitEnabled
        ? "split"
        : "single";
  const meetingShapeOptions: Array<{ value: MeetingShape; label: string; hint: string }> = [
    { value: "single", label: "Single", hint: "One meeting on one day." },
    ...(hybridEligible || meetingShape === "integrated"
      ? [{ value: "integrated" as const, label: "Integrated", hint: "Lecture and laboratory as two separate meetings." }]
      : []),
    ...(splitEligible || meetingShape === "split"
      ? [{ value: "split" as const, label: "Split Session", hint: "Two balanced meetings, MW or TTh, at one time." }]
      : []),
    ...(setModalConsecutiveDays || meetingShape === "consecutive"
      ? [{ value: "consecutive" as const, label: "Consecutive Days", hint: "The full class repeated on back-to-back days, at one time and room." }]
      : []),
  ];

  const handleMeetingShapeChange = (next: MeetingShape) => {
    if (next === meetingShape) return;
    if (meetingShape === "consecutive") setModalConsecutiveDays?.(null);
    if (next === "integrated") return handleIntegratedToggle(true);
    if (next === "split") return handleSplitToggle(true);
    if (next === "consecutive") return handleConsecutiveDaysChange(DEFAULT_CONSECUTIVE_DAYS);
    if (meetingShape === "integrated") handleIntegratedToggle(false);
    else if (meetingShape === "split") handleSplitToggle(false);
    else setModalDay1Duration(totalSlots);
    setModalValidationError("");
  };

  const handleIntegratedDeliveryChange = (delivery: "onsite" | "hybrid") => {
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

  const handleSplitDeliveryChange = (delivery: SplitDelivery) => {
    const lectureRoomId = rooms.find((room) => room.roomType === "lecture" && room.status === "available")?.id ?? "";
    const onSite = (mode: ClassMode, roomId: string): [ClassMode, string] =>
      mode === "on-site" ? [mode, roomId] : ["on-site", lectureRoomId];
    const [firstMode, firstRoomId] = delivery === "online"
      ? ["online", "online"] as [ClassMode, string]
      : onSite(modalClassMode, modalRoomId);
    const [secondMode, secondRoomId] = delivery === "onsite"
      ? onSite(modalDay2ClassMode, modalDay2RoomId)
      : ["online", "online"] as [ClassMode, string];

    setModalClassMode(firstMode);
    setModalRoomId(firstRoomId);
    setModalDay2ClassMode(secondMode);
    setModalDay2RoomId(secondRoomId);
    setModalValidationError("");
  };

  const handleModeSelect = (mode: ClassMode, isSecondMeeting: boolean) => {
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

  const gridSlotCount = slotCount();

  const handleMeetingDurationChange = (isSecondMeeting: boolean, slots: number): void => {
    if (isSameTimePair) {
      setModalDay1Duration(slots);
      setModalDay2Duration(slots);
    } else {
      (isSecondMeeting ? setModalDay2Duration : setModalDay1Duration)(slots);
    }
    setModalValidationError("");
  };

  const handleIntegratedDurationChange = (isSecondMeeting: boolean, slots: number): void => {
    (isSecondMeeting ? setModalDay2Duration : setModalDay1Duration)(slots);
    setModalValidationError("");
  };

  const roomMissing = (roomId: string) => Boolean(modalValidationError) && !roomId;
  const firstMeetingTitle = modalIsHybrid ? "Laboratory Meeting" : isTwoMeetingPattern ? "First Meeting" : "Meeting";
  const secondMeetingTitle = modalIsHybrid ? "Lecture Meeting" : "Second Meeting";
  const scheduleTimeLabel = modalPreferredPattern
    ? `${slotToTimeStr(modalDay1StartSlot)} · ${slotsToHours(modalDay1Duration + modalDay2Duration)} contact hrs total`
    : `${slotToTimeStr(modalDay1StartSlot)} – ${slotToTimeStr(modalDay1StartSlot + modalDay1Duration)}${modalRun ? " each day" : ""}`;

  const plannedMeetings: PlannedMeeting[] = currentRun ? currentRun.map((day) => ({
    dayIndex: getDayIndex(day),
    startSlot: modalDay1StartSlot,
    durationSlots: modalDay1Duration,
    mode: modalClassMode,
    roomId: modalRoomId,
    meetingType: null,
  })) : [
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
      <div className={`flex max-h-[94vh] w-full max-w-[96vw] flex-col gap-3 xl:flex-row xl:items-stretch ${
        shouldShowRecommendations
          ? "2xl:max-w-[1540px]"
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
                    <dd className="truncate text-sm font-bold text-slate-800">{isTwoMeetingPattern || currentRun ? patternLabel : DAYS[modalDay1Index]}</dd>
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
            <h4 id="meeting-pattern-label" className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Meeting pattern</h4>
            <div
              role="radiogroup"
              aria-labelledby="meeting-pattern-label"
              className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
            >
              {meetingShapeOptions.map((option) => {
                const checked = option.value === meetingShape;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    title={option.hint}
                    onClick={() => handleMeetingShapeChange(option.value)}
                    className={`min-w-[7rem] flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4e0a10]/40 ${
                      checked ? "bg-white text-[#4e0a10] shadow-sm ring-1 ring-[#4e0a10]/20" : "text-slate-600 hover:bg-white/60 hover:text-slate-800"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              {meetingShape === "consecutive" && preferredRun
                ? `Meets on its ticked days, ${runLabel(preferredRun)}, at one time and room.`
                : meetingShapeOptions.find((option) => option.value === meetingShape)?.hint}
            </p>

            {(meetingShape === "consecutive" || isIntegrated || modalSplitEnabled) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
                {meetingShape === "consecutive" && modalRun && (
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    Number of days
                    <select
                      value={modalRun.dayCount}
                      disabled={!setModalConsecutiveDays || Boolean(preferredRun)}
                      onChange={(event) => handleConsecutiveDaysChange(Number(event.target.value))}
                      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15 disabled:cursor-not-allowed disabled:bg-slate-50"
                    >
                      {Array.from(
                        { length: Math.max(maxConsecutiveDays, modalRun.dayCount) - MIN_CONSECUTIVE_DAYS + 1 },
                        (_, index) => index + MIN_CONSECUTIVE_DAYS,
                      ).map((count) => (
                        <option key={count} value={count}>{count} days</option>
                      ))}
                    </select>
                  </label>
                )}
                {meetingShape === "consecutive" && currentRun && (
                  <span className="text-xs font-semibold text-slate-500">
                    Meets <span className="font-bold text-slate-800">{runLabel(currentRun)}</span>
                  </span>
                )}
                {isIntegrated && (
                  <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
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
                  <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                    Split pattern
                    <select value={modalPreferredPattern ?? "MW"} onChange={(event) => {
                      const pattern = event.target.value;
                      const [firstDay, secondDay] = parsePreferredPattern(pattern) ?? FIXED_SPLIT_PATTERNS.MW.days;
                      setModalPreferredPattern(pattern);
                      setModalDay1Index(firstDay);
                      setModalDay2Index(secondDay);
                    }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15">
                      {Object.entries(FIXED_SPLIT_PATTERNS).map(([value, { label }]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {modalSplitEnabled && (offersHybridSplit || offersOnlineSplit) && (
                  <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                    Delivery mode
                    <select
                      value={splitDelivery}
                      onChange={(event) => handleSplitDeliveryChange(event.target.value as SplitDelivery)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15"
                    >
                      <option value="onsite">On-Site — both meetings on campus</option>
                      {offersHybridSplit && <option value="hybrid">Hybrid — one meeting online, one on campus</option>}
                      {offersOnlineSplit && <option value="online">Online — both meetings online</option>}
                    </select>
                  </label>
                )}
              </div>
            )}
          </section>

          <div className={`grid grid-cols-1 gap-4 ${isTwoMeetingPattern ? "lg:grid-cols-2" : ""}`}>
            <MeetingCard
              title={modalRun ? `Each day of the run (${modalRun.dayCount} days)` : firstMeetingTitle}
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
              dayAriaLabel={modalRun ? "Starting day" : "First meeting day"}
              dayValue={modalDay1Index}
              dayDisabled={modalRun ? false : isTwoMeetingPattern ? modalSplitEnabled || modalForceDayEnabled : modalForceDayEnabled}
              dayOptions={availableDays.map((day, index) => {
                if (modalRun) {
                  const run = runStartingOn(modalRun, index);
                  if (!run) return { value: index, label: `${day} (runs past the week)`, disabled: true };
                  return preferredRun && run[0] !== preferredRun[0]
                    ? { value: index, label: `${day} (not the ticked days)`, disabled: true }
                    : { value: index, label: `${day} (${runLabel(run)})` };
                }
                return isTwoMeetingPattern && index === modalDay2Index
                  ? { value: index, label: `${day} (second meeting)`, disabled: true }
                  : { value: index, label: day };
              })}
              onDayChange={(dayIndex) => (isTwoMeetingPattern ? handleDay1Change(dayIndex) : setModalDay1Index(dayIndex))}
              startSlot={modalDay1StartSlot}
              startOptionCount={gridSlotCount}
              onStartChange={setModalDay1StartSlot}
              durationSlots={modalDay1Duration}
              onDurationChange={isIntegrated || modalRun
                ? (slots) => handleIntegratedDurationChange(false, slots)
                : (slots) => handleMeetingDurationChange(false, slots)}
              endLabelSuffix={modalRun ? "(each day)" : undefined}
            />

            {isTwoMeetingPattern && (
              <MeetingCard
                title={secondMeetingTitle}
                mode={modalDay2ClassMode}
                isModeDisabled={(mode) =>
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
                }}
                durationSlots={modalDay2Duration}
                onDurationChange={isIntegrated
                  ? (slots) => handleIntegratedDurationChange(true, slots)
                  : (slots) => handleMeetingDurationChange(true, slots)}
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
        <PlacementAlternatives
          availableSlots={availableSlots}
          availableSlotRooms={availableSlotRooms}
          visibleSlots={visibleSlots}
          isSlotsLoading={isSlotsLoading}
          slotsError={slotsError}
          areSlotsTruncated={areSlotsTruncated}
          roomFilter={roomFilter}
          onRoomFilterChange={setRoomFilter}
          onApplySlot={applyAvailableSlot}
          requestedDay={requestedDay}
          bestMatches={bestMatches}
          isSlotApplied={(slot) => slot.day === requestedDay
            && slot.start_slot === requestedStartSlot
            && slotRoomKey(slot) === requestedRoomKey}
          forcedDayName={forcedDayName}
          splitPairStarts={splitPairStarts}
          onApplySplitPairStart={applySplitPairStart}
          firstDayIndex={modalDay1Index}
          secondDayIndex={modalDay2Index}
          firstMode={modalClassMode}
          secondMode={modalDay2ClassMode}
          splitStartSlot={modalDay1StartSlot}
          showsMeetingSwitch={isTwoMeetingPattern && modalDay2Duration > 0}
          slotMeeting={slotMeeting}
          onSlotMeetingChange={(meeting) => { setSlotMeeting(meeting); setRoomFilter(ALL_ROOMS); }}
          firstMeetingTitle={firstMeetingTitle}
          secondMeetingTitle={secondMeetingTitle}
        />
      )}
      </div>
    </div>
  );
}
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
