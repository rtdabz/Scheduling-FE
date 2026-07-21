import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, Clock, Lightbulb, Loader2, MapPin, Monitor, Sparkles, TreePine, X } from "lucide-react";
import { DAYS, getCategoryStyles, slotToTimeStr } from "../constants";
import api from "../../../../lib/api";
import type { DeliveryMode, DropContext, Subject, Room, ScheduleStatus } from "../types";

interface DropRecommendationRow {
  term_id: number;
  section_id: number;
  subject_id: number;
  faculty_id: number | null;
  room_id: number;
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

interface DropModalProps {
  rooms: Room[];
  selectedSectionId: string;
  dropContext: DropContext | null;
  dropSubject: Subject | null;
  dropSubjectIsField: boolean;
  modalRoomId: string;
  setModalRoomId: (value: string) => void;
  modalClassMode: "on-site" | "online" | "field";
  setModalClassMode: (value: "on-site" | "online" | "field") => void;
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
}

const fullDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const getStoredRole = (): string => {
  const userJson = localStorage.getItem("user") || sessionStorage.getItem("user");
  if (!userJson) return "";

  try {
    const user = JSON.parse(userJson) as { role?: string };
    return user.role?.toLowerCase() ?? "";
  } catch {
    return "";
  }
};

const timeToSlot = (time: string): number => {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return Math.max(0, (hour - 7) * 2 + Math.floor(minute / 30));
};

const getDayIndex = (day: string): number => {
  const fullIndex = fullDayNames.findIndex((item) => item.toLowerCase() === day.toLowerCase());
  if (fullIndex >= 0) return fullIndex;
  return DAYS.findIndex((item) => item.toLowerCase() === day.toLowerCase());
};

const normalizePatternLabel = (rows: DropRecommendationRow[]): string => {
  if (rows.length <= 1) return "Single meeting";
  return rows.map((row) => row.day.slice(0, 3)).join(" + ");
};

const getRecommendationReason = (
  recommendation: DropRecommendation,
  subject: Subject,
  rooms: Room[],
  modalConflict: string | null
): string => {
  const firstRow = recommendation.schedules[0];
  const room = firstRow ? rooms.find((item) => Number(item.id) === firstRow.room_id) : undefined;
  const reasons = [
    modalConflict ? "avoids the current conflict" : null,
    room && room.roomType === subject.roomTypeRequired ? "matches the required room type" : null,
    recommendation.schedules.length > 1 ? "balances contact hours across two meetings" : null,
    firstRow?.mode !== "on-site" ? `supports ${firstRow?.mode} delivery` : null,
    `CSP score ${recommendation.score}`
  ].filter(Boolean);

  return reasons.join(", ");
};

export default function DropModal({
  rooms,
  selectedSectionId,
  dropContext,
  dropSubject,
  dropSubjectIsField,
  modalRoomId,
  setModalRoomId,
  modalClassMode,
  setModalClassMode,
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
  handleModalConfirm
}: DropModalProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<DropRecommendation[]>([]);
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [appliedRecommendationRank, setAppliedRecommendationRank] = useState<number | null>(null);
  const [isApplyingRecommendation, setIsApplyingRecommendation] = useState(false);
  const [useNinetyMinuteMeetings, setUseNinetyMinuteMeetings] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = useMemo(() => {
    const role = getStoredRole();
    return role === "secretary" || role === "program_head";
  }, []);
  const hasConflict = !!modalConflict;
  const shouldShowRecommendations = canUseRecommendations && hasConflict;

  useEffect(() => {
    if (!dropContext || !dropSubject) return;

    const frameId = window.requestAnimationFrame(() => {
      setIsAdvancedOpen(false);
      setRecommendations([]);
      setRecommendationError(null);
      setAppliedRecommendationRank(null);
      setSelectedRecommendationId(null);
      setUseNinetyMinuteMeetings(false);
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

      try {
        const response = await api.post<DropRecommendationResponse>(
          "/schedule-recommendations/preview",
          {
            section_id: Number(selectedSectionId),
            subject_ids: [Number(dropSubject.id)],
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
    shouldShowRecommendations
  ]);

  if (!dropContext || !dropSubject) return null;

  const FULL_DAYS: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
    Thu: "Thursday", Fri: "Friday", Sat: "Saturday"
  };
  const totalSlots = dropSubject ? dropSubject.units * 2 : 0;
  const d2Slots = modalDay2Duration;
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
    return Math.min(startSlot, Math.max(0, 28 - durationSlots));
  };

  const getFallbackMeetingDayIndex = (excludedDayIndex: number): number => {
    const fallbackIndex = DAYS.findIndex((_, index) => index !== excludedDayIndex);
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

  const meetingPatternOptions = [
    { value: "", label: "Single meeting" },
    { value: "twice", label: "Twice a week" }
  ];
  const totalSelectedSlots = modalPreferredPattern
    ? modalDay1Duration + modalDay2Duration
    : totalSlots;
  const usesFullDurationMeetings = modalPreferredPattern
    ? modalDay1Duration === totalSlots && modalDay2Duration === totalSlots
    : true;
  const durationTotalMatches = totalSelectedSlots === totalSlots || usesFullDurationMeetings;
  const canUseNinetyMinuteMeetings = totalSlots === 6;

  const dropStyles = getCategoryStyles(dropSubject.category);
  const isDisabled = hasConflict || isModalLoading;
  const recommendedRoomLabel = modalClassMode === "on-site"
    ? rooms.find((r) => r.id === modalRoomId)?.name || "Auto-assigning first available room..."
    : modalClassMode === "online"
    ? "Online"
    : "Field";
  const deliveryModeLabel = modalIsHybrid ? "On-Site + Online" : modalClassMode.replace("-", " ");

  const applyRecommendation = async (recommendation: DropRecommendation) => {
    if (isApplyingRecommendation) return;
    discardSelectedRecommendation();
    setIsApplyingRecommendation(true);

    try {
      const response = await api.post<SelectedRecommendationResponse>(
        "/schedule-recommendations/select",
        {
          section_id: Number(selectedSectionId),
          subject_ids: [Number(dropSubject.id)],
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

    const sortedRows = [...response.data.recommendation.recommended_schedules].sort((left, right) => (
      getDayIndex(left.day) - getDayIndex(right.day)
      || timeToSlot(left.start_time) - timeToSlot(right.start_time)
    ));
    const firstRow = sortedRows[0];
    if (!firstRow || !dropContext) return;

    const firstDayIndex = getDayIndex(firstRow.day);
    const firstStartSlot = timeToSlot(firstRow.start_time);
    const firstEndSlot = timeToSlot(firstRow.end_time);

    setModalRoomId(String(firstRow.room_id));
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
      setIsDay2ModifiedByUser(true);
    } else {
      setModalPreferredPattern(null);
      setModalDay1Index(firstDayIndex);
      setModalDay2Index(getDayIndex(fullDayNames[Math.min(firstDayIndex + 1, fullDayNames.length - 1)]));
      setModalDay1StartSlot(firstStartSlot);
      setModalDay1Duration(dropSubject.units * 2);
      setModalDay2StartSlot(firstStartSlot);
      setModalDay2Duration(0);
      setIsDay2ModifiedByUser(false);
      setDropContext({
        ...dropContext,
        dayIndex: firstDayIndex,
        startSlot: firstStartSlot
      });
    }

    setModalValidationError("");
    setAppliedRecommendationRank(recommendation.rank);
    setSelectedRecommendationId(response.data.recommendation.id);
    setUseNinetyMinuteMeetings(false);
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
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col gap-4 xl:flex-row xl:items-stretch">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-modal-title"
        aria-describedby="placement-modal-desc"
        className="bg-white rounded-2xl shadow-2xl min-h-0 flex-1 overflow-hidden flex flex-col transition-all duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex justify-between items-start px-5 pt-4 pb-3 border-b border-gray-100">
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
          className="flex-1 overflow-y-auto px-5 py-3 space-y-3"
        >
          <section className="rounded-xl border border-[#4e0a10]/10 bg-[#4e0a10]/5 px-4 py-3">
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
                    {modalPreferredPattern ? ` · ${dropSubject.units} total hours` : `–${slotToTimeStr(dropContext.startSlot + dropSubject.units * 2)}`}
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

          <div className="grid grid-cols-1 gap-3 items-start">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(20rem,1.1fr)] gap-3 items-start">
            <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-3">
              <div>
                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                  Class Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "on-site" as const, label: "On-Site", Icon: Building2, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" },
                    { value: "online" as const, label: "Online", Icon: Monitor, selectedCls: "bg-green-600 text-white border-green-600" },
                    { value: "field" as const, label: "Field", Icon: TreePine, selectedCls: "bg-orange-600 text-white border-orange-600" }
                  ]).map(({ value: m, label, Icon, selectedCls }) => {
                    const isHybridDeliveryMode = modalIsHybrid && (m === "on-site" || m === "online");
                    const isSelected = isHybridDeliveryMode || (!modalIsHybrid && modalClassMode === m);
                    const isReadOnlyHybridMode = modalIsHybrid;
                    const isDisabledMode =
                      (dropSubjectIsField && m !== "field")
                      || (!dropSubjectIsField && m === "field")
                      || (modalIsHybrid && m === "field");
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={isDisabledMode || isReadOnlyHybridMode}
                        aria-disabled={isDisabledMode || isReadOnlyHybridMode}
                        onClick={() => {
                          if (isDisabledMode || isReadOnlyHybridMode) return;
                          discardSelectedRecommendation();
                          setModalClassMode(m);
                          if (m !== "on-site") {
                            setModalIsHybrid(false);
                          }
                        }}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? `${selectedCls} cursor-not-allowed`
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
                {dropSubjectIsField && (
                  <p className="text-sm text-orange-500 mt-1">Field mode is required for this subject type.</p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-sm font-bold uppercase tracking-wide text-gray-700">
                    Room
                  </label>
                  {modalClassMode === "on-site" && modalRoomId && (
                    <span className="rounded-full bg-[#C9952A]/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#7a4c08]">
                      Recommended
                    </span>
                  )}
                </div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-400">
                  Room
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                  {modalClassMode === "on-site" ? (
                    <select
                      value={modalRoomId}
                      onChange={(e) => { setModalRoomId(e.target.value); setModalValidationError(""); }}
                      className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-8 text-sm font-semibold text-gray-700 outline-none transition-all focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20"
                    >
                      <option value="">Select a room...</option>
                      {rooms
                        .filter((r) => !dropSubject.roomTypeRequired || r.roomType === dropSubject.roomTypeRequired)
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
                      value={recommendedRoomLabel}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm font-semibold text-gray-500 outline-none"
                    />
                  )}
                  {modalClassMode === "on-site" && (
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                </div>
                {modalClassMode === "on-site" && modalValidationError && !modalRoomId && (
                  <p className="text-sm text-red-500 mt-1">{modalValidationError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Meeting Pattern
                </label>
                <div className="relative">
                  <CalendarDays className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                  <select
                    value={modalPreferredPattern ? "twice" : ""}
                    onChange={(event) => {
                      const nextPattern = event.target.value === "twice"
                        ? `days:${modalDay1Index}-${modalDay2Index}`
                        : null;
                      setIsDay2ModifiedByUser(false);

                      if (nextPattern) {
                        const nextDay2Index = modalDay1Index === modalDay2Index
                          ? getFallbackMeetingDayIndex(modalDay1Index)
                          : modalDay2Index;
                        const dayOneSlots = Math.ceil(totalSlots / 2);
                        const dayTwoSlots = Math.max(1, totalSlots - dayOneSlots);
                        setUseNinetyMinuteMeetings(false);
                        setModalDay2Index(nextDay2Index);
                        setModalPreferredPattern(`days:${modalDay1Index}-${nextDay2Index}`);
                        setModalDay1StartSlot(clampStartSlotForDuration(modalDay1StartSlot, dayOneSlots));
                        setModalDay1Duration(dayOneSlots);
                        setModalDay2Duration(dayTwoSlots);
                        setModalDay2StartSlot(clampStartSlotForDuration(modalDay1StartSlot, dayTwoSlots));
                      } else {
                        setUseNinetyMinuteMeetings(false);
                        setModalPreferredPattern(null);
                        setModalDay1StartSlot(clampStartSlotForDuration(modalDay1StartSlot, totalSlots));
                        setModalDay1Duration(totalSlots);
                        setModalDay2Duration(0);
                        setModalDay2StartSlot(clampStartSlotForDuration(modalDay1StartSlot, totalSlots));
                      }
                    }}
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-8 text-sm font-semibold text-gray-700 outline-none transition-all focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20"
                  >
                    {meetingPatternOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {isTwoMeetingPattern && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      First meeting day
                    </label>
                    <select
                      value={modalDay1Index}
                      onChange={(event) => {
                        const nextDay = Number(event.target.value);
                        handleDay1Change(nextDay);
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10]"
                    >
                      {DAYS.map((day, index) => (
                        <option key={day} value={index} disabled={index === modalDay2Index}>
                          {index === modalDay2Index ? `${day} (Selected as second meeting)` : day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Second meeting day
                    </label>
                    <select
                      value={modalDay2Index}
                      onChange={(event) => {
                        const nextDay = Number(event.target.value);
                        handleDay2Change(nextDay);
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10]"
                    >
                      {DAYS.map((day, index) => (
                        <option key={day} value={index} disabled={index === modalDay1Index}>
                          {index === modalDay1Index ? `${day} (Selected as first meeting)` : day}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/20">
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                  aria-expanded={isAdvancedOpen}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm font-bold text-gray-600 uppercase tracking-wider">
                    Advanced Options
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`} />
                </button>

                {isAdvancedOpen && (
                  <div className="p-3 bg-white animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50/50">
                      <div>
                        <span className="text-sm font-semibold text-gray-700">Hybrid (On-Site & Online)</span>
                        <p className="text-xs text-gray-400 mt-0.5">Keeps the room assignment and marks the class as blended.</p>
                      </div>
                      <button
                        type="button"
                        disabled={dropSubjectIsField}
                        aria-pressed={modalIsHybrid}
                        onClick={() => {
                          discardSelectedRecommendation();
                          setModalClassMode("on-site");
                          setModalIsHybrid(!modalIsHybrid);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          dropSubjectIsField
                            ? "bg-gray-100 cursor-not-allowed"
                            : modalIsHybrid
                            ? "bg-[#4e0a10] cursor-pointer"
                            : "bg-gray-200 cursor-pointer"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            modalIsHybrid ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-3">
              <div>
                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                  Schedule
                </label>

                {!modalPreferredPattern ? (
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Day</label>
                        <div className="relative">
                          <CalendarDays className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            readOnly
                            value={FULL_DAYS[DAYS[dropContext.dayIndex]] ?? DAYS[dropContext.dayIndex]}
                            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Start Time</label>
                        <div className="relative">
                          <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            readOnly
                            value={slotToTimeStr(dropContext.startSlot)}
                            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">End Time (Auto-computed)</label>
                      <div className="relative">
                        <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          readOnly
                          value={slotToTimeStr(dropContext.startSlot + dropSubject.units * 2)}
                          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs font-bold ${
                      canUseNinetyMinuteMeetings
                        ? "border-[#C9952A]/20 bg-[#C9952A]/10 text-[#4e0a10]"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      <span>Use 1.5 hours for each meeting</span>
                      <input
                        type="checkbox"
                        checked={useNinetyMinuteMeetings}
                        disabled={!canUseNinetyMinuteMeetings}
                        onChange={(event) => {
                          const isChecked = event.target.checked;
                          setUseNinetyMinuteMeetings(isChecked);

                          if (isChecked) {
                            setModalDay1StartSlot(clampStartSlotForDuration(modalDay1StartSlot, 3));
                            setModalDay2StartSlot(clampStartSlotForDuration(modalDay2StartSlot, 3));
                            setModalDay1Duration(3);
                            setModalDay2Duration(3);
                          } else {
                            setModalDay1StartSlot(clampStartSlotForDuration(modalDay1StartSlot, totalSlots));
                            setModalDay2StartSlot(clampStartSlotForDuration(modalDay2StartSlot, totalSlots));
                            setModalDay1Duration(totalSlots);
                            setModalDay2Duration(totalSlots);
                          }
                          setModalValidationError("");
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-[#4e0a10] focus:ring-[#4e0a10] disabled:cursor-not-allowed"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-3">
                        <h4 className="text-sm font-extrabold text-[#4e0a10] uppercase tracking-wide flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4e0a10]" />
                          Day 1: {DAYS[modalDay1Index]}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                              Start Time
                            </label>
                            <div className="relative">
                              <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                              <select
                                value={modalDay1StartSlot}
                                onChange={(e) => setModalDay1StartSlot(Number(e.target.value))}
                                className="w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 text-sm bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] cursor-pointer"
                              >
                                {Array.from({ length: 29 - modalDay1Duration }, (_, i) => (
                                  <option key={i} value={i}>
                                    {slotToTimeStr(i)}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                          {modalDay1Duration > 0 && (
                            <div>
                              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                                End Time (Auto-computed)
                              </label>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="text"
                                  readOnly
                                  value={slotToTimeStr(modalDay1StartSlot + modalDay1Duration)}
                                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-3">
                        <h4 className="text-sm font-extrabold text-[#4e0a10] uppercase tracking-wide flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4e0a10]" />
                          Day 2: {DAYS[modalDay2Index]}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                              Start Time
                            </label>
                            <div className="relative">
                              <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                              <select
                                value={modalDay2StartSlot}
                                onChange={(e) => {
                                  setModalDay2StartSlot(Number(e.target.value));
                                  setIsDay2ModifiedByUser(true);
                                }}
                                className="w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] bg-white text-gray-700 cursor-pointer"
                              >
                                {Array.from({ length: 29 - d2Slots }, (_, i) => (
                                  <option key={i} value={i}>
                                    {slotToTimeStr(i)}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                          {d2Slots > 0 && (
                            <div>
                              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                                End Time (Auto-computed)
                              </label>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="text"
                                  readOnly
                                  value={slotToTimeStr(modalDay2StartSlot + d2Slots)}
                                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-center gap-2 rounded-xl p-3 border text-xs font-bold tracking-wide uppercase select-none ${
                      durationTotalMatches
                        ? "bg-[#4e0a10]/5 border-[#4e0a10]/10 text-[#4e0a10]"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}>
                      <span>Total Contact Hours: {dropSubject.units} hours ({totalSlots} slots)</span>
                      <span className={`ml-auto font-black px-2 py-0.5 rounded-full border ${
                        durationTotalMatches
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : "text-amber-800 bg-white border-amber-200"
                      }`}>
                        Auto duration: {dropSubject.units} hours
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {hasConflict && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
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
          </div>
          </div>
        </form>

        <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className={`flex items-center gap-2 text-sm font-semibold ${hasConflict ? "text-red-600" : "text-emerald-700"}`}>
              {hasConflict ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {hasConflict ? "Resolve the detected conflict before placing this class." : "Placement is ready to be added to the timetable."}
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
              <><Loader2 className="w-4 h-4 animate-spin" /> Place Subject</>
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
        <aside className="flex max-h-72 min-h-0 w-full shrink-0 flex-col rounded-2xl border border-[#C9952A]/30 bg-[#fff8e8] p-4 shadow-2xl xl:max-h-[88vh] xl:w-80">
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
              {recommendations.map((recommendation) => {
                const firstRow = recommendation.schedules[0];
                const room = firstRow ? rooms.find((item) => Number(item.id) === firstRow.room_id) : undefined;
                const timeLabel = recommendation.schedules
                  .map((row) => `${row.day}, ${slotToTimeStr(timeToSlot(row.start_time))}-${slotToTimeStr(timeToSlot(row.end_time))}`)
                  .join(" / ");
                const isApplied = appliedRecommendationRank === recommendation.rank;

                return (
                  <div
                    key={recommendation.rank}
                    className={`rounded-lg border bg-white p-3 shadow-sm transition-colors ${
                      isApplied ? "border-emerald-300 ring-1 ring-emerald-200" : "border-white/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-extrabold text-[#4e0a10]">Option {recommendation.rank}</p>
                      {isApplied && (
                        <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Applied
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-gray-800">{room?.name ?? firstRow?.mode ?? "Recommended slot"}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{timeLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500 capitalize">
                      {normalizePatternLabel(recommendation.schedules)} - {firstRow?.mode ?? "on-site"}
                    </p>
                    <p className="mt-2 border-t border-gray-100 pt-2 text-xs leading-5 text-gray-500">
                      {getRecommendationReason(recommendation, dropSubject, rooms, modalConflict)}
                    </p>
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
