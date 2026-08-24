import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, Clock, Lightbulb, MapPin, Monitor, Sparkles, TreePine, X } from "lucide-react";
import { DAYS, getCategoryStyles, slotToTimeStr } from "../constants";
import api from "../../../../lib/api";
import { getStoredUserRole } from "../../../../lib/storedUser";
import { requiredRoomTypeForMeeting } from "../hooks/useConflict";
import { FULL_DAY_NAMES, parsePreferredPattern, slotCount, slotToTime24h, timeToSlot } from "../../../../lib/timeGrid";
import type { DeliveryMode, DropContext, ScheduleItem, Section, Subject, Room, ScheduleStatus, Term } from "../types";
import { getSubjectTotalSlots } from "../types";
import { slotsToHours } from "../courseSlotPlan";

interface DropRecommendationRow {
  term_id: number;
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
  isSingleMeeting?: boolean;
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

interface SplitSlotRecommendation {
  rank: number;
  score: number;
  day: string;
  start_time: string;
  end_time: string;
  room_id: number | null;
  room_name: string;
  room_type: string;
  mode: DeliveryMode;
}

interface SplitRecommendResponse {
  status: string;
  message?: string;
  recommendations: SplitSlotRecommendation[];
}

const recommendationRoomId = (row: DropRecommendationRow): string => {
  if (row.mode === "online") return "online";
  if (row.mode === "field") return "field";
  return row.room_id == null ? "tba" : String(row.room_id);
};

interface DropModalProps {
  rooms: Room[];
  sections: Section[];
  schedules: ScheduleItem[];
  selectedSectionId: string;
  activeTerm: Term | null;
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
  sections,
  schedules,
  selectedSectionId,
  activeTerm,
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
  handleModalConfirm,
  checkConflict
}: DropModalProps) {
  const isSummerTerm = activeTerm?.semester === "summer";
  const availableDays = isSummerTerm ? DAYS.slice(0, 5) : DAYS;
  const isMajor = dropSubject?.category === "major";
  const hasBoth = dropSubject && Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
  const [recommendations, setRecommendations] = useState<DropRecommendation[]>([]);
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [appliedRecommendationRank, setAppliedRecommendationRank] = useState<number | null>(null);
  const [isApplyingRecommendation, setIsApplyingRecommendation] = useState(false);



  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = useMemo(() => {
    const role = getStoredUserRole();
    return role === "secretary" || role === "program_head";
  }, []);
  const hasConflict = !!modalConflict;
  const shouldShowRecommendations = canUseRecommendations && hasConflict;

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
    if (!dropContext || !dropSubject || !selectedSectionId || !shouldShowRecommendations) return;

    const controller = new AbortController();

    const loadRecommendations = async () => {
      setIsRecommendationLoading(true);
      setRecommendationError(null);

      const patternDays = parsePreferredPattern(modalPreferredPattern);
      const excludeIds = schedules
        .filter((item) => String(item.sectionId) === String(selectedSectionId) && String(item.courseId ?? item.subjectId) === String(dropSubject.id))
        .map((item) => String(item.id));

      const conflictDay1 = patternDays && modalDay1Duration > 0
        ? checkConflict(
            dropSubject.id,
            selectedSectionId,
            null,
            modalRoomId,
            patternDays[0],
            modalDay1StartSlot,
            modalDay1Duration,
            excludeIds,
            modalPreferredPattern
          )
        : null;

      const conflictDay2 = patternDays && modalDay2Duration > 0
        ? checkConflict(
            dropSubject.id,
            selectedSectionId,
            null,
            modalDay2RoomId,
            patternDays[1],
            modalDay2StartSlot,
            modalDay2Duration,
            excludeIds,
            modalPreferredPattern
          )
        : null;

      const isMeeting1Conflicted = !!conflictDay1;
      const isMeeting2Conflicted = !!conflictDay2;

      try {
        if (isTwoMeetingPattern && (isMeeting1Conflicted || isMeeting2Conflicted)) {
          const existingSched = schedules.find(
            (item) => String(item.sectionId) === String(selectedSectionId) && String(item.courseId ?? item.subjectId) === String(dropSubject.id)
          );
          const facultyId = existingSched?.facultyId ?? null;

          const cleanFacultyId = facultyId && !isNaN(Number(facultyId)) ? Number(facultyId) : null;
          const cleanTermId = activeTerm?.id && !isNaN(Number(activeTerm.id)) ? Number(activeTerm.id) : null;
          const cleanSectionId = selectedSectionId && !isNaN(Number(selectedSectionId)) ? Number(selectedSectionId) : null;
          const cleanCourseId = dropSubject?.id && !isNaN(Number(dropSubject.id)) ? Number(dropSubject.id) : null;
          const cleanDeptId = departmentId && !isNaN(Number(departmentId)) ? Number(departmentId) : null;

          const buildCurrentMeetingRow = (
            dayIndex: number,
            startSlot: number,
            durationSlots: number,
            roomIdValue: string,
            modeValue: DeliveryMode
          ): DropRecommendationRow => {
            let resolvedRoomId: number | null = null;
            if (roomIdValue === "online" || modeValue === "online") {
              const onlineRoom = rooms.find(r => r.roomType === "online");
              resolvedRoomId = onlineRoom ? Number(onlineRoom.id) : null;
            } else if (roomIdValue === "field" || modeValue === "field") {
              const fieldRoom = rooms.find(r => r.roomType === "field");
              resolvedRoomId = fieldRoom ? Number(fieldRoom.id) : null;
            } else if (roomIdValue && !isNaN(Number(roomIdValue))) {
              resolvedRoomId = Number(roomIdValue);
            }

            return {
              term_id: cleanTermId!,
              section_id: cleanSectionId!,
              course_id: cleanCourseId!,
              faculty_id: cleanFacultyId,
              room_id: resolvedRoomId!,
              department_id: cleanDeptId!,
              day: FULL_DAY_NAMES[dayIndex],
              start_time: slotToTime24h(startSlot),
              end_time: slotToTime24h(startSlot + durationSlots),
              mode: modeValue,
              is_hybrid: false,
              preferred_pattern: modalPreferredPattern,
              status: "draft"
            };
          };

          const recommendMeeting = async (
            duration: number,
            roomIdVal: string,
            modeVal: DeliveryMode,
            dayIndex: number,
            startSlot: number
          ): Promise<SplitSlotRecommendation[]> => {
            const cleanRoomId = roomIdVal && !isNaN(Number(roomIdVal)) ? Number(roomIdVal) : null;
            const meetingType = dropSubject.labHours > 0
              ? (duration === dropSubject.labHours * 6 ? "laboratory" : "lecture")
              : "lecture";

            const response = await api.post<SplitRecommendResponse>(
              "/schedule-recommendations/recommend-split",
              {
                term_id: cleanTermId,
                section_id: cleanSectionId,
                course_id: cleanCourseId,
                department_id: cleanDeptId,
                duration_slots: duration,
                room_id: cleanRoomId,
                mode: modeVal,
                faculty_id: cleanFacultyId,
                delete_ids: excludeIds.map(Number).filter((id) => !isNaN(id)),
                meeting_type: meetingType,
                preferred_day: FULL_DAY_NAMES[dayIndex],
                preferred_start_time: slotToTime24h(startSlot),
                max_solutions: 5,
                timeout_seconds: 5
              },
              { signal: controller.signal }
            );

            return response.data.recommendations;
          };

          const toRecommendedRow = (rec: SplitSlotRecommendation): DropRecommendationRow => ({
            term_id: cleanTermId!,
            section_id: cleanSectionId!,
            course_id: cleanCourseId!,
            faculty_id: cleanFacultyId,
            room_id: rec.room_id,
            department_id: cleanDeptId!,
            day: rec.day,
            start_time: rec.start_time,
            end_time: rec.end_time,
            mode: rec.mode,
            is_hybrid: false,
            preferred_pattern: modalPreferredPattern,
            status: "draft"
          });

          const rowsOverlap = (left: DropRecommendationRow, right: DropRecommendationRow): boolean => {
            if (getDayIndex(left.day) !== getDayIndex(right.day)) return false;
            const leftStart = timeToSlot(left.start_time);
            const leftEnd = timeToSlot(left.end_time);
            const rightStart = timeToSlot(right.start_time);
            const rightEnd = timeToSlot(right.end_time);
            return leftStart < rightEnd && rightStart < leftEnd;
          };

          let mappedRecommendations: DropRecommendation[] = [];

          if (isMeeting1Conflicted && isMeeting2Conflicted) {
            const [day1Recommendations, day2Recommendations] = await Promise.all([
              recommendMeeting(modalDay1Duration, modalRoomId, modalClassMode, modalDay1Index, modalDay1StartSlot),
              recommendMeeting(modalDay2Duration, modalDay2RoomId, modalDay2ClassMode, modalDay2Index, modalDay2StartSlot)
            ]);

            const pairLimit = Math.min(day1Recommendations.length, day2Recommendations.length);
            mappedRecommendations = Array.from({ length: pairLimit }, (_, index) => {
              const schedulesList = [
                toRecommendedRow(day1Recommendations[index]),
                toRecommendedRow(day2Recommendations[index])
              ];

              const sortedForPattern = [...schedulesList].sort((left, right) => (
                getDayIndex(left.day) - getDayIndex(right.day) ||
                timeToSlot(left.start_time) - timeToSlot(right.start_time)
              ));
              const sortedDay1Index = getDayIndex(sortedForPattern[0].day);
              const sortedDay2Index = getDayIndex(sortedForPattern[1].day);
              const sortedPattern = `days:${sortedDay1Index}-${sortedDay2Index}`;
              schedulesList[0].preferred_pattern = sortedPattern;
              schedulesList[1].preferred_pattern = sortedPattern;

              return {
                rank: index + 1,
                score: day1Recommendations[index].score + day2Recommendations[index].score,
                schedules: schedulesList,
                isSingleMeeting: true
              };
            }).filter((recommendation) => !rowsOverlap(recommendation.schedules[0], recommendation.schedules[1]));
          } else {
            const conflictedRecommendations = await recommendMeeting(
              isMeeting1Conflicted ? modalDay1Duration : modalDay2Duration,
              isMeeting1Conflicted ? modalRoomId : modalDay2RoomId,
              isMeeting1Conflicted ? modalClassMode : modalDay2ClassMode,
              isMeeting1Conflicted ? modalDay1Index : modalDay2Index,
              isMeeting1Conflicted ? modalDay1StartSlot : modalDay2StartSlot
            );

            const unchangedRow = isMeeting1Conflicted
              ? buildCurrentMeetingRow(modalDay2Index, modalDay2StartSlot, modalDay2Duration, modalDay2RoomId, modalDay2ClassMode)
              : buildCurrentMeetingRow(modalDay1Index, modalDay1StartSlot, modalDay1Duration, modalRoomId, modalClassMode);

            mappedRecommendations = conflictedRecommendations.map((rec) => {
              const schedulesList = isMeeting1Conflicted
                ? [toRecommendedRow(rec), unchangedRow]
                : [unchangedRow, toRecommendedRow(rec)];

              const sortedForPattern = [...schedulesList].sort((left, right) => (
                getDayIndex(left.day) - getDayIndex(right.day) ||
                timeToSlot(left.start_time) - timeToSlot(right.start_time)
              ));
              const sortedDay1Index = getDayIndex(sortedForPattern[0].day);
              const sortedDay2Index = getDayIndex(sortedForPattern[1].day);
              const sortedPattern = `days:${sortedDay1Index}-${sortedDay2Index}`;
              schedulesList[0].preferred_pattern = sortedPattern;
              schedulesList[1].preferred_pattern = sortedPattern;

              return {
                rank: rec.rank,
                score: rec.score,
                schedules: schedulesList,
                isSingleMeeting: true
              };
            }).filter((recommendation) => !rowsOverlap(recommendation.schedules[0], recommendation.schedules[1]));
          }

          setRecommendations(mappedRecommendations);
        } else {
          const response = await api.post<DropRecommendationResponse>(
            "/schedule-recommendations/preview",
            {
              section_id: Number(selectedSectionId),
              course_ids: [Number(dropSubject.id)],
              mode: dropSubjectIsField ? "field" : modalClassMode,
              is_hybrid: modalIsHybrid,
              preferred_patterns: modalPreferredPattern
                ? { [dropSubject.id]: modalPreferredPattern }
                : {},
              max_solutions: 3,
              timeout_seconds: 2
            },
            { signal: controller.signal }
          );
          setRecommendations(response.data.recommendations);
        }
      } catch {
        if (!controller.signal.aborted) {
          setRecommendationError("Recommendations are unavailable right now.");
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
    modalDay1Duration,
    modalDay2Duration,
    modalRoomId,
    modalDay2RoomId,
    modalDay1Index,
    modalDay2Index,
    modalDay1StartSlot,
    modalDay2StartSlot,
    schedules,
    checkConflict,
    activeTerm,
    modalDay2ClassMode
  ]);

  // department_id for the recommend-split endpoint, derived from the selected
  // section via the spreaded scheduler props.
  const selectedSection = sections.find((s) => String(s.id) === String(selectedSectionId));
  const departmentId = selectedSection?.departmentId ?? null;

  /**
   * Call the Rule Engine + CSP backend to find the best conflict-free
   * (day, time, room, mode) combinations for one split block.
   */
  if (!dropContext || !dropSubject) return null;

  const totalSlots = getSubjectTotalSlots(dropSubject);
  const isTwoMeetingPattern = !!modalPreferredPattern;
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
    setModalPreferredPattern(`days:${day1Index}-${day2Index}`);
  };

  const clampStartSlotForDuration = (startSlot: number, durationSlots: number): number => {
    return Math.min(startSlot, Math.max(0, slotCount() - durationSlots));
  };

  const getFallbackMeetingDayIndex = (excludedDayIndex: number): number => {
    const fallbackIndex = availableDays.findIndex((_, index) => index !== excludedDayIndex);
    return fallbackIndex >= 0 ? fallbackIndex : excludedDayIndex;
  };

  const handleDay1Change = (nextDayIndex: number) => {
    if (nextDayIndex === modalDay2Index) return;
    setModalDay1Index(nextDayIndex);
    updateTwoMeetingPattern(nextDayIndex, modalDay2Index);
  };

  const handleDay2Change = (nextDayIndex: number) => {
    if (nextDayIndex === modalDay1Index) return;
    setModalDay2Index(nextDayIndex);
    updateTwoMeetingPattern(modalDay1Index, nextDayIndex);
  };

  const courseMaxSlots = isTwoMeetingPattern && hasBoth ? 6 : totalSlots;

  const dropStyles = getCategoryStyles(dropSubject.category);
  const isDisabled = hasConflict || isModalLoading;

  const onSiteRoomOptions = rooms.filter((r) => {
    const isPhysicalRoom = r.roomType === "lecture" || r.roomType === "laboratory";
    if (!isPhysicalRoom) return false;

    // A mixed split needs both room types on offer, one per meeting.
    const hasLectureAndLabComponents =
      Number(dropSubject.lectureHours ?? 0) > 0 && Number(dropSubject.labHours ?? 0) > 0;
    if (modalPreferredPattern && hasLectureAndLabComponents) return true;

    const requiredRoomType = requiredRoomTypeForMeeting(dropSubject);

    return !requiredRoomType || r.roomType === requiredRoomType;
  });

  const allowsRoomTba = modalRoomId === ROOM_TBA
    || modalDay2RoomId === ROOM_TBA
    || requiredRoomTypeForMeeting(dropSubject) === "laboratory"
    || (hasBoth && !!modalPreferredPattern);




  const recommendedRoomLabel = modalClassMode === "on-site"
    ? modalRoomId === ROOM_TBA
      ? "Room TBA"
      : rooms.find((r) => r.id === modalRoomId)?.name || "Auto-assigning first available room..."
    : modalClassMode === "online"
    ? "Online"
    : "Field";
  const deliveryModeLabel = modalIsHybrid ? "On-Site + Online" : modalClassMode.replace("-", " ");

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
      getDayIndex(left.day) - getDayIndex(right.day)
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
      if (recommendation.isSingleMeeting) {
        // Already-resolved rows: nothing to reserve server-side, so no id.
        applyRecommendationRows(recommendation.schedules, recommendation.rank, null);

        return;
      }

      const response = await api.post<SelectedRecommendationResponse>(
        "/schedule-recommendations/select",
        {
          section_id: Number(selectedSectionId),
          course_ids: [Number(dropSubject.id)],
          mode: dropSubjectIsField ? "field" : modalClassMode,
          is_hybrid: modalIsHybrid,
          preferred_patterns: modalPreferredPattern
            ? { [dropSubject.id]: modalPreferredPattern }
            : {},
          max_solutions: 3,
          timeout_seconds: 2,
          selected_rank: recommendation.rank
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
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col gap-4 xl:flex-row xl:items-stretch">
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





          {/* Meeting Pattern Card */}
          <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isTwoMeetingPattern}
                onChange={(event) => {
                  const isChecked = event.target.checked;
                  const nextPattern = isChecked
                    ? `days:${modalDay1Index}-${modalDay2Index}`
                    : null;
                  setIsDay2ModifiedByUser(false);

                  const singleSlots = (isMajor && hasBoth) ? 6 : totalSlots;
                  const dayOneSlots = (isMajor && hasBoth) ? 6 : totalSlots;
                  const dayTwoSlots = (isMajor && hasBoth) ? 6 : totalSlots;


                  if (nextPattern) {
                    const nextDay2Index = modalDay1Index === modalDay2Index
                      ? getFallbackMeetingDayIndex(modalDay1Index)
                      : modalDay2Index;
                    setModalDay2Index(nextDay2Index);
                    setModalPreferredPattern(`days:${modalDay1Index}-${nextDay2Index}`);
                    setModalDay1StartSlot(clampStartSlotForDuration(modalDay1StartSlot, dayOneSlots));
                    setModalDay1Duration(dayOneSlots);
                    setModalDay2Duration(dayTwoSlots);
                    setModalDay2StartSlot(clampStartSlotForDuration(modalDay1StartSlot, dayTwoSlots));
                    setModalDay2RoomId(modalRoomId);
                    setModalDay2ClassMode(modalClassMode);
                  } else {
                    setModalPreferredPattern(null);
                    setModalDay1StartSlot(clampStartSlotForDuration(modalDay1StartSlot, singleSlots));
                    setModalDay1Duration(singleSlots);
                    setModalDay2Duration(0);
                    setModalDay2StartSlot(clampStartSlotForDuration(modalDay1StartSlot, singleSlots));
                  }
                }}
                className="h-4.5 w-4.5 rounded border-gray-300 text-[#4e0a10] focus:ring-[#4e0a10] cursor-pointer"
              />
              <div>
                <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Schedule Twice a Week
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Split this course into two separate meetings.
                </p>
              </div>
            </label>
          </div>

          {/* Meetings Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* First Meeting */}
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <h4 className="text-sm font-extrabold text-[#4e0a10] uppercase tracking-wide flex items-center gap-1.5 border-b pb-2">
                <span className="w-2 h-2 rounded-full bg-[#4e0a10]" />
                First Meeting
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
                      (dropSubjectIsField && m !== "field") ||
                      (!dropSubjectIsField && m === "field");
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={isDisabledMode}
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
                              {r.name} {isUnavailable ? " — (Not Available)" : ""}
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
                    value={modalDay1Index}
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
                    value={modalDay1Index}
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
                  Second Meeting
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
                        (dropSubjectIsField && m !== "field") ||
                        (!dropSubjectIsField && m === "field");
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={isDisabledMode}
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
                                {r.name} {isUnavailable ? " — (Not Available)" : ""}
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
                    value={modalDay2Index}
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
            ) : (
              <div className="flex flex-col items-center justify-center p-8 border border-dashed border-gray-200 rounded-xl bg-gray-50/30 text-gray-400">
                <CalendarDays className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs font-semibold text-center">Single Meeting selected.</p>
                <p className="text-[10px] text-center mt-1">Change pattern to Twice a Week to configure a second meeting.</p>
              </div>
            )}

            


            





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
        <aside className="flex max-h-72 min-h-0 w-full shrink-0 flex-col rounded-2xl border border-[#C9952A]/30 bg-[#fff8e8] p-4 shadow-2xl xl:max-h-[92vh] xl:w-80">
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
            <p className="mt-3 text-sm text-red-600">{recommendationError}</p>
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
