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
import { runLabel, runStartingOn, tickedRun, type ConsecutivePlacement } from "../GenerateSchedule/courseClassConfig";
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
  setDropContext: (value: DropContext | null) => void;
  handleModalConfirm: (e: React.FormEvent) => void;
  /**
   * Consecutive Days: the department's rule for this course and section. The
   * class is placed as one run -- a starting day, one time and one room.
   */
  modalRun?: ConsecutivePlacement | null;
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

/** Split Session's delivery, the same three Generate Schedule offers. */
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
}: DropModalProps) {
  const isSummerSemester = activeSemester?.semester === "summer";
  const availableDays = isSummerSemester ? DAYS.slice(0, 5) : DAYS;
  const hasBoth = dropSubject && Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
  const hasLaboratoryUnits = Number(dropSubject?.labHours ?? 0) > 0;
  // Alternatives open automatically on a conflict, or on request for a placement
  // that is valid but not what the generator would choose.
  const [areRecommendationsRequested, setAreRecommendationsRequested] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [availableSlotRooms, setAvailableSlotRooms] = useState<AvailableSlotRoom[]>([]);
  const [areSlotsTruncated, setAreSlotsTruncated] = useState(false);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>(ALL_ROOMS);
  /** Which half of a two-meeting pattern the slot list is answering for. */
  const [slotMeeting, setSlotMeeting] = useState<"first" | "second">("first");

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = canGenerateSchedule;
  const hasConflict = !!modalConflict;
  const shouldShowRecommendations = canUseRecommendations && (hasConflict || areRecommendationsRequested);
  const isTwoMeetingPattern = modalIsHybrid || modalSplitEnabled;
  // A run is one class on N back-to-back days; its days follow the first.
  const currentRun = modalRun ? runStartingOn(modalRun, modalDay1Index) : null;
  // The days ticked in Setup Courses: the class meets on exactly these.
  const preferredRun = modalRun ? tickedRun(modalRun) : null;
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
   * The day the placement was dropped on -- where it collided. The server
   * lists that day first and then moves day by day through the rest of the
   * week. Read from dropContext, which holds still while the dialog is open,
   * so applying an option on another day does not re-ask the server.
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
      // A run is offered only where one start and room is free on every day,
      // and only on its ticked days when it has them.
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

    // Debounced: dragging a start time through a select fires this on every
    // keystroke otherwise.
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

    // Best first: the start nearest the one asked for, the earlier on a tie.
    const distance = (startSlot: number) => Math.abs(startSlot - modalDay1StartSlot);
    return [...firstStarts.entries()]
      .filter(([startSlot]) => secondStarts.has(startSlot))
      .map(([startSlot, slot]) => ({ startSlot, endSlot: slot.end_slot }))
      .sort((left, right) => distance(left.startSlot) - distance(right.startSlot) || left.startSlot - right.startSlot);
  }, [
    isSameTimePair, modalDay2Duration, availableSlots, modalDay1StartSlot,
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
  };

  /**
   * Split Session's delivery, read from its two meetings: both online is an
   * Online Split, exactly one online a Hybrid Split, anything else On-Site.
   */
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

  /**
   * The meeting the suggestions answer for, as the form holds it: its day,
   * start and room. Best Match looks for alternatives on that day.
   */
  const isSecondSlotMeeting = slotMeeting === "second" && isTwoMeetingPattern && modalDay2Duration > 0;
  const requestedDay = FULL_DAY_NAMES[isSecondSlotMeeting ? modalDay2Index : modalDay1Index];
  const requestedStartSlot = isSecondSlotMeeting ? modalDay2StartSlot : modalDay1StartSlot;
  const requestedRoomKey = isSecondSlotMeeting ? modalDay2RoomId : modalRoomId;

  /**
   * Best Match: the requested day's valid slots, ranked first by the soft
   * preferences the Placement review notes -- what the Schedule Generator
   * would prefer, a warning weighing more than an informational note.
   */
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
  // A delivery the meetings already have stays listed, so the select never
  // shows a value it does not offer.
  const offersHybridSplit = isHybridSplitEligible(dropSubject) || splitDelivery === "hybrid";
  const offersOnlineSplit = (!modalFieldEnabled && isOnlineSplitEligible(dropSubject))
    || splitDelivery === "online";
  // A course may be designated as Field by department settings even when its
  // stored room_type_required value is still lecture/laboratory.
  const fieldEligible = dropSubjectIsField || isFieldSchedulingEligible(dropSubject);
  // Locked only when the course record itself is a field course. Being on the
  // department's field list is a default the scheduler may turn off.
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

  const courseMaxSlots = isTwoMeetingPattern ? Math.max(modalDay1Duration, modalDay2Duration) : totalSlots;

  const dropStyles = getCategoryStyles(dropSubject.category);
  const isDisabled = hasConflict || isModalLoading;

  const onSiteRoomOptions = rooms.filter((r) => {
    const isPhysicalRoom = r.roomType === "lecture" || r.roomType === "laboratory";
    if (!isPhysicalRoom) return false;

    // A mixed split needs both room types on offer, one per meeting.
    const hasLectureAndLabComponents =
      Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
    if (modalIsHybrid && hasLectureAndLabComponents) return isLabMeetingRoomType(r.roomType);

    const requiredRoomType = modalClassMode === "field" ? "field" : requiredRoomTypeForMeeting(dropSubject);
    // A laboratory meeting takes the rooms the Default LAB Room Requirement allows.
    if (requiredRoomType === "laboratory") return isLabMeetingRoomType(r.roomType);

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
      : modalSplitEnabled && splitDelivery !== "onsite"
        ? splitDelivery === "online" ? "Online split" : "Hybrid split"
        : modalClassMode.replace("-", " ");

  /**
   * Moves the meeting the suggestions answer for into the chosen slot. Only
   * its day, start, room and delivery change; its length and pattern stay.
   */
  const applyAvailableSlot = (slot: AvailableSlot): void => {
    // A two-meeting pattern is not a single meeting: only the meeting whose
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

    // A single meeting, or a run listed on its first day: it starts there.
    setModalDay1Index(getDayIndex(slot.day));
    setModalClassMode(slot.mode);
    setModalRoomId(slot.room_id == null ? slot.mode : String(slot.room_id));
    setModalDay1StartSlot(slot.start_slot);
    setModalValidationError("");
  };

  // Force Day is the user's own constraint and is never rewritten by a
  // suggestion: one on another day is shown but cannot be applied.
  const forcedDayName = modalForceDayEnabled ? FULL_DAY_NAMES[modalForcedDayIndex] : null;

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
      setModalRoomId(rooms.find((room) => isLabMeetingRoomType(room.roomType) && room.status === "available")?.id ?? ROOM_TBA);
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
   * Split Session's delivery, the same choices Generate Schedule offers:
   * On-Site keeps both meetings face-to-face, Hybrid moves the second online,
   * and Online moves both. A meeting already on site keeps its room.
   */
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

  /**
   * Class Mode is a property of this meeting, not of the course: picking Field
   * here puts one class in the field without adding the course to the
   * department's field list. Only the Field Course checkbox does that.
   */
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

  /** One session's length. It changes what the suggestions are asked for. */
  const handleIntegratedDurationChange = (isSecondMeeting: boolean, slots: number): void => {
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
    : `${slotToTimeStr(modalDay1StartSlot)} – ${slotToTimeStr(modalDay1StartSlot + modalDay1Duration)}${modalRun ? " each day" : ""}`;

  // What the Schedule Generator would have said about this placement. Only
  // meaningful once the placement is valid; a conflict already says enough.
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
      {/*
        The alternatives panel is two columns wide, so the shell has to grow
        with it: at the old 2xl width the 600px panel ate the dialog's own
        room, day and time fields.
      */}
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
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Scheduling options</h4>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {modalRun && (
                <div className={`${optionTileClass(true)} sm:col-span-2`}>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">
                      Consecutive Days · {modalRun.dayCount} days
                      {preferredRun ? ` · ${runLabel(preferredRun)}` : ""}
                    </span>
                    <span className="block text-[11px] leading-snug text-slate-500">
                      {preferredRun
                        ? "One class on its ticked days, at one time and room. Set in Generate Schedule › Setup Courses."
                        : "One class on back-to-back days at one time and room. Pick the starting day; the other days follow. Set in Generate Schedule › Setup Courses."}
                    </span>
                  </span>
                </div>
              )}
              {hybridEligible && !modalRun && (
                <label className={optionTileClass(modalIsHybrid)}>
                  <input type="checkbox" checked={modalIsHybrid} onChange={(event) => handleIntegratedToggle(event.target.checked)} className={checkboxClass} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">Integrated</span>
                    <span className="block text-[11px] leading-snug text-slate-500">Lecture and laboratory as two meetings.</span>
                  </span>
                </label>
              )}
              {splitEligible && !modalRun && (
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
              <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
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
                  // A class with ticked days starts only on the first of them.
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
              startOptionCount={isTwoMeetingPattern ? gridSlotCount : gridSlotCount - (modalRun ? modalDay1Duration : totalSlots) + 1}
              onStartChange={(startSlot) => {
                setModalDay1StartSlot(startSlot);
                if (isTwoMeetingPattern) setModalDay1Duration(clampMeetingDuration(startSlot, modalDay1Duration));
              }}
              durationSlots={modalDay1Duration}
              onDurationChange={isIntegrated
                ? (slots) => handleIntegratedDurationChange(false, slots)
                : modalRun
                  ? (slots) => handleIntegratedDurationChange(false, slots)
                  : undefined}
              maxDurationSlots={integratedMaxSlots(modalDay1StartSlot)}
              endLabelSuffix={isTwoMeetingPattern ? undefined : modalRun ? "(each day)" : "(auto)"}
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
