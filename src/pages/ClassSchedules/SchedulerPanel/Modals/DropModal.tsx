import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, ChevronRight, Clock, Lightbulb, Loader2, MapPin, Monitor, Sparkles, TreePine, X } from "lucide-react";
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
  isDay2ModifiedByUser: boolean;
  setIsDay2ModifiedByUser: (value: boolean) => void;
  modalValidationError: string;
  setModalValidationError: (value: string) => void;
  modalConflict: string | null;
  isModalLoading: boolean;
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
  isDay2ModifiedByUser,
  setIsDay2ModifiedByUser,
  modalValidationError,
  setModalValidationError,
  modalConflict,
  isModalLoading,
  setDropContext,
  handleModalConfirm
}: DropModalProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<DropRecommendation[]>([]);
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [appliedRecommendationRank, setAppliedRecommendationRank] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canUseRecommendations = useMemo(() => {
    const role = getStoredRole();
    return role === "secretary" || role === "program_head";
  }, []);

  useEffect(() => {
    if (!dropContext || !dropSubject) return;

    setIsAdvancedOpen(false);
    setRecommendations([]);
    setRecommendationError(null);
    setAppliedRecommendationRank(null);
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropContext(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dropContext, dropSubject, setDropContext]);

  useEffect(() => {
    if (!dropContext || !dropSubject || !selectedSectionId || !canUseRecommendations) return;

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
    canUseRecommendations,
    dropContext,
    dropSubject,
    dropSubjectIsField,
    modalClassMode,
    modalIsHybrid,
    modalPreferredPattern,
    selectedSectionId
  ]);

  if (!dropContext || !dropSubject) return null;

  const FULL_DAYS: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
    Thu: "Thursday", Fri: "Friday", Sat: "Saturday"
  };
  const totalSlots = dropSubject ? dropSubject.units * 2 : 0;
  const d2Slots = totalSlots - modalDay1Duration;
  const splitDayOneDuration = Math.ceil(totalSlots / 2);
  const isTwoMeetingPattern = !!modalPreferredPattern;
  const selectedDayIndexes = new Set([modalDay1Index, modalDay2Index]);
  const patternLabel = isTwoMeetingPattern
    ? `${DAYS[modalDay1Index]} + ${DAYS[modalDay2Index]}`
    : "Single meeting";

  const updateTwoMeetingPattern = (day1Index: number, day2Index: number) => {
    setModalPreferredPattern(`days:${day1Index}-${day2Index}`);
  };

  const durationOptions = [];
  const minDayOneDuration = modalPreferredPattern ? 1 : 0;
  const maxDayOneDuration = modalPreferredPattern ? Math.max(1, totalSlots - 1) : totalSlots;
  for (let s = minDayOneDuration; s <= maxDayOneDuration; s++) {
    const hours = s * 0.5;
    durationOptions.push({
      slots: s,
      label: s === 0 ? "No meeting" : `${hours} hour${hours !== 1 ? "s" : ""}`
    });
  }

  const dropStyles = getCategoryStyles(dropSubject.category);
  const hasConflict = !!modalConflict;
  const isDisabled = hasConflict || isModalLoading;
  const recommendedRoomLabel = modalClassMode === "on-site"
    ? rooms.find((r) => r.id === modalRoomId)?.name || "Auto-assigning first available room..."
    : modalClassMode === "online"
    ? "Online"
    : "Field";
  const deliveryModeLabel = modalIsHybrid ? "On-Site + Online" : modalClassMode.replace("-", " ");

  const applyRecommendation = (recommendation: DropRecommendation) => {
    const sortedRows = [...recommendation.schedules].sort((left, right) => (
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
      setIsDay2ModifiedByUser(true);
    } else {
      setModalPreferredPattern(null);
      setModalDay1Index(firstDayIndex);
      setModalDay2Index(getDayIndex(fullDayNames[Math.min(firstDayIndex + 1, fullDayNames.length - 1)]));
      setModalDay1StartSlot(firstStartSlot);
      setModalDay1Duration(dropSubject.units * 2);
      setModalDay2StartSlot(firstStartSlot);
      setIsDay2ModifiedByUser(false);
      setDropContext({
        ...dropContext,
        dayIndex: firstDayIndex,
        startSlot: firstStartSlot
      });
    }

    setModalValidationError("");
    setAppliedRecommendationRank(recommendation.rank);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen"
      onClick={(e) => { if (e.target === e.currentTarget) setDropContext(null); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-modal-title"
        aria-describedby="placement-modal-desc"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto transition-all duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <CalendarPlus className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
            <div>
              <h3 id="placement-modal-title" className="text-lg font-semibold text-gray-800 leading-tight">Review Class Placement</h3>
              <p id="placement-modal-desc" className="text-xs text-gray-400 mt-0.5">
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

        <form onSubmit={handleModalConfirm} className="px-6 py-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[#4e0a10]/10 bg-[#4e0a10]/5 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#4e0a10]">Subject</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-sm font-extrabold text-gray-800">{dropSubject.code}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                    {dropSubject.units}u
                  </span>
                  <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${dropStyles.typeBadge}`}>
                    {dropStyles.label}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5" title={dropSubject.name}>{dropSubject.name}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Room / Mode</p>
              <p className="text-sm font-extrabold text-gray-800 mt-1">{recommendedRoomLabel}</p>
              {modalIsHybrid ? (
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-[10px] rounded-full px-2 py-0.5 font-bold bg-[#4e0a10] text-white">
                    On-Site
                  </span>
                  <span className="text-[10px] rounded-full px-2 py-0.5 font-bold bg-green-600 text-white">
                    Online
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-500 capitalize">{deliveryModeLabel}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Pattern</p>
              <p className="text-sm font-extrabold text-gray-800 mt-1">{patternLabel}</p>
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(true)}
                className="mt-1 text-xs font-bold text-[#4e0a10] hover:underline"
              >
                Change room, mode, or pattern
              </button>
            </div>
          </div>

          {canUseRecommendations && (
            <div className="rounded-xl border border-[#C9952A]/30 bg-[#C9952A]/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-[#7a4c08]" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#7a4c08]">Recommendations</p>
                  <p className="text-xs text-gray-500">CSP and Rule Engine alternatives for this placement.</p>
                </div>
              </div>

              {isRecommendationLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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
                <p className="text-xs text-red-600">{recommendationError}</p>
              ) : recommendations.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Sparkles className="w-4 h-4 text-[#C9952A]" />
                  No better alternatives were found for this subject.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {recommendations.map((recommendation) => {
                    const firstRow = recommendation.schedules[0];
                    const room = firstRow ? rooms.find((item) => Number(item.id) === firstRow.room_id) : undefined;
                    const timeLabel = recommendation.schedules
                      .map((row) => `${row.day}, ${slotToTimeStr(timeToSlot(row.start_time))}-${slotToTimeStr(timeToSlot(row.end_time))}`)
                      .join(" / ");
                    const isApplied = appliedRecommendationRank === recommendation.rank;

                    return (
                      <div key={recommendation.rank} className="rounded-lg border border-white/70 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-extrabold text-[#4e0a10]">Option {recommendation.rank}</p>
                          {isApplied && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <p className="mt-2 text-xs font-semibold text-gray-800">{room?.name ?? firstRow?.mode ?? "Recommended slot"}</p>
                        <p className="mt-1 text-[11px] text-gray-500">{timeLabel}</p>
                        <p className="mt-1 text-[11px] text-gray-500 capitalize">
                          {normalizePatternLabel(recommendation.schedules)} - {firstRow?.mode ?? "on-site"}
                        </p>
                        <p className="mt-2 text-[11px] text-gray-600">
                          {getRecommendationReason(recommendation, dropSubject, rooms, modalConflict)}
                        </p>
                        <button
                          type="button"
                          onClick={() => applyRecommendation(recommendation)}
                          className="mt-3 w-full rounded-lg bg-[#4e0a10] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#3a080c]"
                        >
                          {isApplied ? "Applied" : "Apply Recommendation"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Recommended Room
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                  <input
                    type="text"
                    readOnly
                    value={recommendedRoomLabel}
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-medium"
                  />
                </div>
                {modalClassMode === "on-site" && modalValidationError && !modalRoomId && (
                  <p className="text-xs text-red-500 mt-1">{modalValidationError}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Meeting Pattern
                </label>
                <div className="flex gap-2">
                  {([
                    { value: null, label: "None" },
                    { value: "MW" as const, label: "MW (Mon–Wed)" },
                    { value: "TTh" as const, label: "TTh (Tue–Thu)" }
                  ]).map(({ value: p, label }) => {
                    const isSelected = modalPreferredPattern === p;
                    return (
                      <button
                        key={String(p)}
                        type="button"
                        onClick={() => {
                          setModalPreferredPattern(p);
                          setIsDay2ModifiedByUser(false);

                          if (p) {
                            setModalDay1Duration(splitDayOneDuration);
                            setModalDay2StartSlot(modalDay1StartSlot);
                          } else {
                            setModalDay1Duration(totalSlots);
                            setModalDay2StartSlot(modalDay1StartSlot);
                          }
                        }}
                        className={`flex-1 py-2 border rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? "bg-[#4e0a10] text-white border-[#4e0a10]"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isTwoMeetingPattern && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Day 1
                    </label>
                    <select
                      value={modalDay1Index}
                      onChange={(event) => {
                        const nextDay = Number(event.target.value);
                        setModalDay1Index(nextDay);
                        updateTwoMeetingPattern(nextDay, modalDay2Index);
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10]"
                    >
                      {DAYS.map((day, index) => (
                        <option key={day} value={index} disabled={selectedDayIndexes.has(index) && index !== modalDay1Index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Day 2
                    </label>
                    <select
                      value={modalDay2Index}
                      onChange={(event) => {
                        const nextDay = Number(event.target.value);
                        setModalDay2Index(nextDay);
                        updateTwoMeetingPattern(modalDay1Index, nextDay);
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10]"
                    >
                      {DAYS.map((day, index) => (
                        <option key={day} value={index} disabled={selectedDayIndexes.has(index) && index !== modalDay2Index}>
                          {day}
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
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Room and Class Options
                  </span>
                  {isAdvancedOpen ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {isAdvancedOpen && (
                  <div className="p-4 space-y-4 bg-white animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Class Mode Selection */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Class Mode
                      </label>
                      <div className="flex gap-2">
                        {([
                          { value: "on-site" as const, label: "On-Site", Icon: Building2, selectedCls: "bg-[#4e0a10] text-white border-[#4e0a10]" },
                          { value: "online" as const, label: "Online", Icon: Monitor, selectedCls: "bg-green-600 text-white border-green-600" },
                          { value: "field" as const, label: "Field", Icon: TreePine, selectedCls: "bg-orange-600 text-white border-orange-600" }
                        ]).map(({ value: m, label, Icon, selectedCls }) => {
                          const isHybridDeliveryMode = modalIsHybrid && (m === "on-site" || m === "online");
                          const isSelected = isHybridDeliveryMode || (!modalIsHybrid && modalClassMode === m);
                          const isReadOnlyHybridMode = modalIsHybrid;
                          const isDisabledMode = (dropSubjectIsField && m !== "field") || (modalIsHybrid && m === "field");
                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={isDisabledMode || isReadOnlyHybridMode}
                              aria-disabled={isDisabledMode || isReadOnlyHybridMode}
                              onClick={() => {
                                if (isReadOnlyHybridMode) return;
                                setModalClassMode(m);
                                if (m !== "on-site") {
                                  setModalIsHybrid(false);
                                }
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 border rounded-lg text-xs font-medium transition-all ${
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
                        <p className="text-xs text-orange-500 mt-1">Field mode is required for this subject type.</p>
                      )}
                    </div>

                    {/* Hybrid Mode Toggle */}
                    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50/50">
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Hybrid (On-Site & Online)</span>
                        <p className="text-[10px] text-gray-400 mt-0.5">Keeps the room assignment and marks the class as blended.</p>
                      </div>
                      <button
                        type="button"
                        disabled={dropSubjectIsField}
                        aria-pressed={modalIsHybrid}
                        onClick={() => {
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

                    {/* Manual Room Override Select */}
                    {modalClassMode === "on-site" && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                          Manual Room Override
                        </label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                            <select
                              value={modalRoomId}
                              onChange={(e) => { setModalRoomId(e.target.value); setModalValidationError(""); }}
                              className={`w-full appearance-none border rounded-lg pl-9 pr-8 py-2 text-xs outline-none transition-all focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] border-gray-200 bg-white text-gray-700`}
                            >
                              <option value="">Select a room...</option>
                              {rooms
                                .filter((r) => !dropSubject.roomTypeRequired || r.roomType === dropSubject.roomTypeRequired)
                                .map((r) => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Time Assignment & Conflicts */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                  Time Assignment
                </label>

                {!modalPreferredPattern ? (
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Day</label>
                        <div className="relative">
                          <CalendarDays className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            readOnly
                            value={FULL_DAYS[DAYS[dropContext.dayIndex]] ?? DAYS[dropContext.dayIndex]}
                            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Start Time</label>
                        <div className="relative">
                          <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            readOnly
                            value={slotToTimeStr(dropContext.startSlot)}
                            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">End Time (Auto-computed)</label>
                      <div className="relative">
                        <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          readOnly
                          value={slotToTimeStr(dropContext.startSlot + dropSubject.units * 2)}
                          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wide">
                        Based on {dropSubject.units} unit{dropSubject.units !== 1 ? "s" : ""} = {dropSubject.units} hour{dropSubject.units !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Day 1 Section */}
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                        <h4 className="text-xs font-extrabold text-[#4e0a10] uppercase tracking-wide flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4e0a10]" />
                          Day 1: {DAYS[modalDay1Index]}
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                              Start Time
                            </label>
                            <div className="relative">
                              <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                              <select
                                value={modalDay1StartSlot}
                                onChange={(e) => setModalDay1StartSlot(Number(e.target.value))}
                                className="w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-xs bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] cursor-pointer"
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
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                              Duration
                            </label>
                            <div className="relative">
                              <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                              <select
                                value={modalDay1Duration}
                                onChange={(e) => setModalDay1Duration(Number(e.target.value))}
                                className="w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-xs bg-white text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] cursor-pointer"
                              >
                                {durationOptions.map((opt) => (
                                  <option key={opt.slots} value={opt.slots}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                          {modalDay1Duration > 0 && (
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                End Time (Auto-computed)
                              </label>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="text"
                                  readOnly
                                  value={slotToTimeStr(modalDay1StartSlot + modalDay1Duration)}
                                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Day 2 Section */}
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                        <h4 className="text-xs font-extrabold text-[#4e0a10] uppercase tracking-wide flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4e0a10]" />
                          Day 2: {DAYS[modalDay2Index]}
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                              Start Time
                            </label>
                            <div className="relative">
                              <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                              <select
                                value={modalDay2StartSlot}
                                disabled={d2Slots === 0}
                                onChange={(e) => {
                                  setModalDay2StartSlot(Number(e.target.value));
                                  setIsDay2ModifiedByUser(true);
                                }}
                                className={`w-full appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] ${
                                  d2Slots === 0
                                    ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                                    : "bg-white text-gray-700 cursor-pointer"
                                }`}
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
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                              Duration (Auto-split)
                            </label>
                            <div className="relative">
                              <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="text"
                                readOnly
                                value={d2Slots === 0 ? "No meeting" : `${d2Slots * 0.5} hour${d2Slots * 0.5 !== 1 ? "s" : ""}`}
                                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                              />
                            </div>
                          </div>
                          {d2Slots > 0 && (
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                End Time (Auto-computed)
                              </label>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="text"
                                  readOnly
                                  value={slotToTimeStr(modalDay2StartSlot + d2Slots)}
                                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-semibold"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-[#4e0a10]/5 rounded-xl p-3 border border-[#4e0a10]/10 text-[#4e0a10] text-[10px] font-bold tracking-wide uppercase select-none">
                      <span>Total Contact Hours: {dropSubject.units} hours ({totalSlots} slots)</span>
                      <span className="ml-auto font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Day 1: {modalDay1Duration * 0.5}h + Day 2: {d2Slots * 0.5}h
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {hasConflict && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Conflicts Detected</span>
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-xs text-red-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                      {modalConflict}
                    </li>
                    <li className="flex items-start gap-2 text-xs text-red-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                      Choose another room, select a different time, or change the class mode before placing this class.
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="sticky bottom-0 bg-white flex justify-end gap-3 px-6 pb-6 pt-4 border-t border-gray-100">
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
  );
}
