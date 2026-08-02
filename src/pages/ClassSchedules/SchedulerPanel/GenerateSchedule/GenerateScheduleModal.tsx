import type React from "react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Cpu,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
  Scissors,
  Sparkles,
  Sun,
  Sunset,
  Moon,
  X,
} from "lucide-react";
import api from "../../../../lib/api";
import type { ProgressStep, TimeBlockOption } from "./useGenerateSchedule";
import { isValidPatternForApi } from "./useGenerateSchedule";
import type { ApiScheduleRecord, Course } from "../types";

interface SplitOperation {
  term_id: number;
  section_id: number;
  course_id: number;
  room_id: number;
  department_id: number;
  day: string;
  start_time: string;
  end_time: string;
  mode: string;
  is_hybrid: boolean;
  preferred_pattern: string | null;
  status: string;
  faculty_id?: number | null;
  split_group_id?: string | null;
  meeting_type?: "lecture" | "laboratory" | null;
  meeting_index?: number;
}

interface ResolvedSplitState {
  status: "ok" | "conflict";
  /** Resolved operations from the server (times may have been shifted). */
  operations: SplitOperation[];
  violations: { rule: string; message: string; course_code?: string; day?: string }[];
}

interface GenerateScheduleModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  isApplying?: boolean;
  progressStep: ProgressStep;
  errorMessage: string | null;
  baseSchedules: ApiScheduleRecord[];
  sectionId: string;
  sectionName: string;
  availableCourses?: Course[];
  allCourses?: Course[];
  preferredTimeBlock?: TimeBlockOption;
  setPreferredTimeBlock?: (val: TimeBlockOption) => void;
  splitMinorEnabled?: boolean;
  setSplitMinorEnabled?: (val: boolean) => void;
  selectedMinorCourseIds?: string[];
  setSelectedMinorCourseIds?: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onGenerate: (sectionId: string, courseIds?: number[]) => void;
  /** Receives pre-validated, conflict-free schedules ready to be saved. */
  onApplySchedule: (finalSchedules: ApiScheduleRecord[]) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const timeStrToSlot = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return Math.max(0, Math.floor((hours * 60 + minutes - 420) / 30));
};

const slotToTime24h = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

const formatTimeDisplay = (time24: string): string => {
  if (!time24) return "";
  const parts = time24.split(":");
  if (parts.length < 2) return time24;
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return minutes === 0
    ? `${hours}:00 ${ampm}`
    : `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};

const isPathfitOrNstp = (course: { code?: string; name?: string }): boolean => {
  const text = `${course.code || ""} ${course.name || ""}`.toLowerCase();
  return (
    text.includes("pathfit") ||
    text.includes("path fit") ||
    text.includes("path-fit") ||
    text.includes("nstp") ||
    text.includes("rotc") ||
    text.includes("cwts") ||
    text.includes("lts") ||
    text.includes("physical education") ||
    text.includes("national service") ||
    /\bpe\b/.test(text) ||
    /\bpe[1-4]\b/.test(text)
  );
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function GenerateScheduleModal({
  isOpen,
  isGenerating,
  isApplying = false,
  progressStep,
  errorMessage,
  baseSchedules,
  sectionId,
  sectionName,
  availableCourses = [],
  allCourses = [],
  preferredTimeBlock: propPreferredTimeBlock,
  setPreferredTimeBlock: propSetPreferredTimeBlock,
  splitMinorEnabled: propSplitMinorEnabled,
  setSplitMinorEnabled: propSetSplitMinorEnabled,
  selectedMinorCourseIds: propSelectedMinorCourseIds,
  setSelectedMinorCourseIds: propSetSelectedMinorCourseIds,
  onClose,
  onGenerate,
  onApplySchedule,
}: GenerateScheduleModalProps) {
  // ── Local fallback state (when props are not wired from parent) ──
  const [internalTimeBlock, setInternalTimeBlock] = useState<TimeBlockOption>("flexible");
  const [internalSplitMinorEnabled, setInternalSplitMinorEnabled] = useState(false);
  const [internalSelectedMinorCourseIds, setInternalSelectedMinorCourseIds] = useState<string[]>([]);

  // ── Split pre-validation state ──
  const [splitValidating, setSplitValidating] = useState(false);
  const [resolvedSplit, setResolvedSplit] = useState<ResolvedSplitState | null>(null);
  /** Abort controller ref so we can cancel stale validation requests. */
  const abortRef = useRef<AbortController | null>(null);

  const preferredTimeBlock = propPreferredTimeBlock ?? internalTimeBlock;
  const setPreferredTimeBlock = propSetPreferredTimeBlock ?? setInternalTimeBlock;
  const splitMinorEnabled = propSplitMinorEnabled ?? internalSplitMinorEnabled;
  const setSplitMinorEnabled = propSetSplitMinorEnabled ?? setInternalSplitMinorEnabled;
  const selectedMinorCourseIds = propSelectedMinorCourseIds ?? internalSelectedMinorCourseIds;
  const setSelectedMinorCourseIds = propSetSelectedMinorCourseIds ?? setInternalSelectedMinorCourseIds;

  // ── Derived course lists ──
  const allSectionCourses = useMemo(() => {
    const map = new Map<string, Course>();
    availableCourses.forEach((c) => map.set(c.id.toString(), c));
    allCourses.forEach((c) => {
      if (!map.has(c.id.toString())) map.set(c.id.toString(), c);
    });
    baseSchedules.forEach((bs) => {
      const cId = (bs.course_id ?? bs.subject_id)?.toString();
      if (!cId) return;
      if (map.has(cId)) return;
      const code =
        bs.course?.course_code ||
        bs.subject?.course_code ||
        bs.course?.subject_code ||
        "COURSE";
      const name =
        bs.course?.course_name ||
        bs.subject?.course_name ||
        bs.course?.subject_name ||
        code;
      const category = (
        bs.course?.course_category ||
        bs.subject?.course_category ||
        "minor"
      ) as "major" | "minor";
      map.set(cId, {
        id: cId,
        code,
        name,
        units: Number(bs.course?.units ?? bs.subject?.units ?? 3),
        lectureHours: Number(bs.course?.lecture_hours ?? bs.subject?.lecture_hours ?? 3),
        labHours: Number(bs.course?.lab_hours ?? bs.subject?.lab_hours ?? 0),
        category,
        semester: "1st",
        departmentId: Number(bs.department_id) || null,
        yearLevel: 1,
        roomTypeRequired: "lecture",
        status: "active",
      });
    });
    return Array.from(map.values());
  }, [availableCourses, allCourses, baseSchedules]);



  const eligibleMinorCourses = useMemo(
    () => (availableCourses.length > 0 ? availableCourses : allSectionCourses).filter((c) => c.category === "minor" && !isPathfitOrNstp(c)),
    [availableCourses, allSectionCourses]
  );



  // ── Auto-generate on open if no base schedules exist ──
  useEffect(() => {
    if (isOpen && sectionId && baseSchedules.length === 0 && !isGenerating) {
      onGenerate(sectionId);
    }
  }, [isOpen, sectionId, baseSchedules.length, isGenerating, onGenerate]);

  // ── Toggle helpers ──


  const toggleSelectAllMinors = useCallback(() => {
    setSelectedMinorCourseIds((prev) =>
      prev.length === eligibleMinorCourses.length
        ? []
        : eligibleMinorCourses.map((c) => c.id)
    );
  }, [eligibleMinorCourses, setSelectedMinorCourseIds]);



  const toggleMinorCourse = useCallback(
    (id: string) =>
      setSelectedMinorCourseIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      ),
    [setSelectedMinorCourseIds]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — Generate candidate split sessions (pure JS, no network call).
  // These are the "initial guess" times before conflict validation.
  // ─────────────────────────────────────────────────────────────────────────
  const candidateSchedules = useMemo<ApiScheduleRecord[]>(() => {
    if (!baseSchedules || baseSchedules.length === 0) return [];

    let targetMinSlot = 0;
    let targetMaxSlot = 24;
    if (preferredTimeBlock === "morning") {
      targetMinSlot = 0;
      targetMaxSlot = 10;
    } else if (preferredTimeBlock === "afternoon") {
      targetMinSlot = 10;
      targetMaxSlot = 20;
    } else if (preferredTimeBlock === "evening") {
      targetMinSlot = 20;
      targetMaxSlot = 24;
    }

    const transformed: ApiScheduleRecord[] = [];

    baseSchedules.forEach((item) => {
      const courseIdStr =
        item.course_id?.toString() ?? item.subject_id?.toString() ?? "";
      const courseMatch = allSectionCourses.find(
        (c) =>
          c.id === courseIdStr ||
          c.code.toLowerCase() ===
          (
            item.course?.course_code ||
            item.subject?.course_code ||
            ""
          ).toLowerCase()
      );

      const isMinor = courseMatch
        ? courseMatch.category === "minor"
        : (item.course?.course_category || item.subject?.course_category) ===
        "minor";

      const isSelectedMinor =
        selectedMinorCourseIds.includes(courseIdStr) ||
        (courseMatch ? selectedMinorCourseIds.includes(courseMatch.id) : false);

      const isMinorSplitTarget =
        splitMinorEnabled &&
        isMinor &&
        !isPathfitOrNstp(
          courseMatch || {
            code:
              item.course?.course_code ||
              item.subject?.course_code ||
              "",
            name:
              item.course?.course_name ||
              item.subject?.course_name ||
              "",
          }
        ) &&
        isSelectedMinor;

      let startSlot = timeStrToSlot(item.start_time);
      let endSlot = timeStrToSlot(item.end_time);
      let durationSlots = Math.max(2, endSlot - startSlot);

      if (preferredTimeBlock !== "flexible") {
        if (startSlot < targetMinSlot || startSlot >= targetMaxSlot) {
          const duration = Math.min(
            durationSlots,
            Math.max(2, targetMaxSlot - targetMinSlot)
          );
          startSlot = targetMinSlot;
          endSlot = startSlot + duration;
          durationSlots = duration;
        }
      }

      if (isMinorSplitTarget) {
        const MINOR_DAYS = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
        ];
        const dayIdx = MINOR_DAYS.indexOf(item.day);
        const baseDayIdx = dayIdx >= 0 ? dayIdx : 0;
        const secondDay = MINOR_DAYS[(baseDayIdx + 2) % MINOR_DAYS.length];
        const blockSlots = 3;
        const groupId =
          item.split_group_id ||
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `split-${item.id}-${Date.now()}`);

        transformed.push(
          {
            ...item,
            id: `${item.id}-n1`,
            start_time: slotToTime24h(startSlot),
            end_time: slotToTime24h(Math.min(24, startSlot + blockSlots)),
            preferred_pattern: null,
            split_group_id: groupId,
            meeting_type: "lecture",
            meeting_index: 1,
          },
          {
            ...item,
            id: `${item.id}-n2`,
            day: secondDay,
            start_time: slotToTime24h(startSlot),
            end_time: slotToTime24h(Math.min(24, startSlot + blockSlots)),
            preferred_pattern: null,
            split_group_id: groupId,
            meeting_type: "lecture",
            meeting_index: 2,
          }
        );
      } else {
        transformed.push({
          ...item,
          start_time: slotToTime24h(startSlot),
          end_time: slotToTime24h(startSlot + durationSlots),
          preferred_pattern: isValidPatternForApi(item.preferred_pattern)
            ? item.preferred_pattern
            : null,
        });
      }
    });

    return transformed;
  }, [
    baseSchedules,
    preferredTimeBlock,
    splitMinorEnabled,
    selectedMinorCourseIds,
    allSectionCourses,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Pre-validate via Rule Engine / CSP endpoint.
  // Fires whenever the candidate sessions change.  Cancels any in-flight
  // request so stale results never overwrite fresher ones.
  // ─────────────────────────────────────────────────────────────────────────
  const anySplit = useMemo(
    () =>
      candidateSchedules.some(
        (s) =>
          String(s.id).includes("-n")
      ),
    [candidateSchedules]
  );

  useEffect(() => {
    // Only run validation when there are split sessions to check.
    if (!anySplit || candidateSchedules.length === 0) {
      setResolvedSplit(null);
      setSplitValidating(false);
      return;
    }

    // Cancel any previous in-flight validation.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSplitValidating(true);
    setResolvedSplit(null);

    const deleteIds: number[] = [];
    baseSchedules.forEach((bs) => {
      const numId = Number(bs.id);
      if (!isNaN(numId) && numId > 0 && !String(bs.id).includes("-")) {
        deleteIds.push(numId);
      }
    });

    const operations: SplitOperation[] = candidateSchedules.map((s) => {
      const courseId = Number(s.course_id ?? s.subject_id);
      const parsedRoomId = Number(s.room_id);
      const roomId =
        !isNaN(parsedRoomId) && parsedRoomId > 0 ? parsedRoomId : 1;
      const op: SplitOperation = {
        term_id: Number(s.term_id),
        section_id: Number(s.section_id),
        course_id: courseId,
        room_id: roomId,
        department_id: Number(s.department_id),
        day: s.day,
        start_time: s.start_time,
        end_time: s.end_time,
        mode: s.mode || "on-site",
        is_hybrid: !!s.is_hybrid,
        preferred_pattern: isValidPatternForApi(s.preferred_pattern)
          ? (s.preferred_pattern ?? null)
          : null,
        status: s.status || "draft",
        split_group_id: s.split_group_id ?? null,
        meeting_type: s.meeting_type ?? null,
        meeting_index: s.meeting_index ?? 1,
      };
      if (s.faculty_id) op.faculty_id = Number(s.faculty_id);
      return op;
    });

    const payload: { operations: SplitOperation[]; delete_ids?: number[] } = {
      operations,
    };
    if (deleteIds.length > 0) payload.delete_ids = deleteIds;

    api
      .post<{
        status: "ok" | "conflict";
        message?: string;
        operations?: SplitOperation[];
        violations?: {
          rule: string;
          message: string;
          course_code?: string;
          day?: string;
        }[];
      }>("/schedules/batch/validate-splits", payload, {
        signal: controller.signal,
      })
      .then((res) => {
        if (controller.signal.aborted) return;
        setResolvedSplit({
          status: "ok",
          operations: res.data.operations ?? operations,
          violations: [],
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const e = err as {
          response?: {
            data?: {
              violations?: {
                rule: string;
                message: string;
                course_code?: string;
                day?: string;
              }[];
              message?: string;
            };
          };
        };
        const violations = e.response?.data?.violations ?? [];
        setResolvedSplit({
          status: "conflict",
          operations,
          violations,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setSplitValidating(false);
      });

    return () => {
      controller.abort();
    };
  }, [candidateSchedules, anySplit, baseSchedules]);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — Merge resolved times back into rich ApiScheduleRecord objects
  // so the preview cards still show course/room/faculty display names while
  // using the conflict-free times from the server.
  // ─────────────────────────────────────────────────────────────────────────
  const previewSchedules = useMemo<ApiScheduleRecord[]>(() => {
    if (!anySplit || !resolvedSplit || resolvedSplit.status !== "ok") {
      // No split active or still validating — show candidates as-is.
      return candidateSchedules;
    }

    // Merge server-resolved times back into the rich candidate records.
    return candidateSchedules.map((candidate, idx) => {
      const resolved = resolvedSplit.operations[idx];
      if (!resolved) return candidate;
      return {
        ...candidate,
        day: resolved.day,
        start_time: resolved.start_time,
        end_time: resolved.end_time,
        mode: resolved.mode as ApiScheduleRecord["mode"],
      };
    });
  }, [candidateSchedules, anySplit, resolvedSplit]);

  // ─────────────────────────────────────────────────────────────────────────
  // Grouped preview for the card list UI.
  // ─────────────────────────────────────────────────────────────────────────
  const groupedPreviewSchedules = useMemo(() => {
    const groups: {
      [key: string]: {
        code: string;
        name: string;
        category: string;
        isMajor: boolean;
        faculty: string;
        preferred_pattern?: string | null;
        meetings: {
          id: string | number;
          day: string;
          start_time: string;
          end_time: string;
          room: string;
          mode: string;
        }[];
      };
    } = {};

    previewSchedules.forEach((item) => {
      const courseIdStr = (item.course_id ?? item.subject_id)?.toString() ?? "";
      const foundCourse = allSectionCourses.find(
        (c) =>
          c.id === courseIdStr ||
          (c.code && (item.course?.course_code || item.subject?.course_code || "") &&
            c.code.toLowerCase() === (item.course?.course_code || item.subject?.course_code || "").toLowerCase())
      );

      const code =
        foundCourse?.code ||
        item.course?.course_code ||
        item.subject?.course_code ||
        item.subject?.subject_code ||
        "COURSE";
      const name =
        foundCourse?.name ||
        item.course?.course_name ||
        item.subject?.course_name ||
        item.subject?.subject_name ||
        "Course Session";
      const category =
        foundCourse?.category ||
        item.course?.course_category ||
        item.subject?.course_category ||
        "minor";
      const isMajor = category === "major";
      const room = item.room?.room_code || "Assigned Room";
      const faculty = item.faculty
        ? `${item.faculty.first_name || ""} ${item.faculty.last_name || ""}`.trim()
        : "Unassigned";

      // Group by unique course ID (or code if ID missing) so every course renders its own card
      const key = courseIdStr ? `course-${courseIdStr}` : `${code}-${category}`;

      if (!groups[key]) {
        groups[key] = {
          code,
          name,
          category,
          isMajor,
          faculty,
          preferred_pattern: item.preferred_pattern,
          meetings: [],
        };
      }
      groups[key].meetings.push({
        id: item.id,
        day: item.day,
        start_time: item.start_time,
        end_time: item.end_time,
        room,
        mode: item.mode || "on-site",
      });
    });

    return Object.values(groups);
  }, [previewSchedules, allSectionCourses]);

  if (!isOpen) return null;

  const uniqueCoursesCount = new Set(
    previewSchedules.map(
      (s) =>
        s.course_id?.toString() ??
        s.subject_id?.toString() ??
        s.course?.course_code
    )
  ).size;

  const hasUnresolvableConflict =
    anySplit &&
    resolvedSplit?.status === "conflict" &&
    !splitValidating;

  const applyDisabled =
    previewSchedules.length === 0 ||
    splitValidating ||
    hasUnresolvableConflict ||
    isApplying;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating && !isApplying) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-amber-900/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#4e0a10] via-[#5c0d14] to-[#7a121c] p-4 sm:p-5 text-white flex justify-between items-center shrink-0 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/10">
              <Sparkles className="w-5 h-5 text-[#C9952A] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold leading-tight tracking-tight">
                  Auto-Generate Schedule
                </h3>
                <span className="bg-[#C9952A]/20 border border-[#C9952A]/40 text-amber-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  Two-Panel Workspace
                </span>
              </div>
              <p className="text-xs text-amber-100/80 mt-0.5 font-medium">
                Section:{" "}
                <span className="font-semibold text-white">
                  {sectionName || "Selected Section"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onGenerate(sectionId)}
              disabled={isGenerating || isApplying}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/15 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`}
              />
              Regenerate
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating || isApplying}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        {errorMessage ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
            <div className="p-4 bg-red-100 text-red-600 rounded-2xl mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-gray-800">
              Generation Unsuccessful
            </h4>
            <p className="text-xs text-gray-600 mt-1 max-w-md">{errorMessage}</p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => onGenerate(sectionId)}
                className="px-5 py-2.5 bg-[#4e0a10] text-white text-xs font-bold rounded-xl hover:bg-[#6b0e17] transition-colors cursor-pointer shadow-md"
              >
                Retry Generation
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-white transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : isGenerating ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/80 backdrop-blur-2xs">
            <div className="flex flex-col items-center justify-center text-center max-w-sm">
              <div className="relative flex items-center justify-center mb-6">
                <div className="w-20 h-20 rounded-full border-4 border-slate-200 border-t-[#4e0a10] border-r-[#C9952A] animate-spin shadow-sm" />
                <div className="absolute w-12 h-12 rounded-full bg-gradient-to-br from-[#4e0a10]/10 to-[#C9952A]/20 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-6 h-6 text-[#C9952A]" />
                </div>
              </div>
              <h4 className="text-base font-extrabold text-slate-900 tracking-tight">
                Generating Optimal Schedule
              </h4>
              <p className="text-xs text-slate-500 mt-1 font-medium min-h-[18px]">
                {progressStep === "generating"
                  ? "Running Rule Engine & CSP Solver..."
                  : progressStep === "constraints"
                    ? "Verifying room, faculty & time slot constraints..."
                    : "Preparing interactive candidate preview..."}
              </p>
              <div className="w-64 bg-slate-200/80 rounded-full h-1.5 overflow-hidden mt-5 shadow-inner">
                <div
                  className="bg-gradient-to-r from-[#4e0a10] via-[#7a121c] to-[#C9952A] h-full transition-all duration-300 rounded-full"
                  style={{
                    width:
                      progressStep === "generating"
                        ? "35%"
                        : progressStep === "constraints"
                          ? "70%"
                          : "95%",
                  }}
                />
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200/80 shadow-2xs">
                <Cpu className="w-3.5 h-3.5 text-[#4e0a10]" />
                <span>
                  {progressStep === "generating"
                    ? "Step 1/3: CSP Solver"
                    : progressStep === "constraints"
                      ? "Step 2/3: Applying Rules"
                      : "Step 3/3: Building Preview"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-100">
            {/* Left Panel: Preview */}
            <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-slate-200 overflow-hidden">
              {/* Summary Stats Header */}
              <div className="p-3.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#4e0a10]" />
                    {uniqueCoursesCount} Courses ({previewSchedules.length}{" "}
                    Plotted Sessions)
                  </span>

                  {/* Validation status badge */}
                  {splitValidating ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Validating splits…
                    </span>
                  ) : hasUnresolvableConflict ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                      <AlertTriangle className="w-3 h-3" />
                      Conflict Detected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Rule Engine & CSP Valid
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {preferredTimeBlock !== "flexible" && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md capitalize">
                      Biased: {preferredTimeBlock}
                    </span>
                  )}
                  {splitMinorEnabled && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-md">
                      Splitting Active
                    </span>
                  )}
                </div>
              </div>

              {/* Unresolvable conflict banner */}
              {hasUnresolvableConflict && resolvedSplit && (
                <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold mb-1">
                      One or more split sessions could not be made conflict-free.
                    </p>
                    <ul className="space-y-0.5 text-[11px] text-red-700 list-disc list-inside">
                      {resolvedSplit.violations.slice(0, 4).map((v, i) => (
                        <li key={i}>
                          {v.course_code ? `${v.course_code} (${v.day ?? ""}): ` : ""}
                          {v.message}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-red-600 font-medium">
                      Please resolve conflicts manually or try a different time block / day.
                    </p>
                  </div>
                </div>
              )}

              {/* Preview Cards */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {previewSchedules.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <Layers className="w-10 h-10 mb-2 opacity-50 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">
                      No Generated Schedules
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Click Regenerate or select a valid section to generate a
                      schedule preview.
                    </p>
                  </div>
                ) : (
                  groupedPreviewSchedules.map((item, index) => {
                    const isMajor = item.isMajor;
                    const uniqueRooms = Array.from(
                      new Set(item.meetings.map((m) => m.room))
                    );
                    const isSameRoomForAll = uniqueRooms.length === 1;

                    // Group meetings that share the same time slot.
                    const meetingsByTime: {
                      [key: string]: {
                        days: string[];
                        start_time: string;
                        end_time: string;
                        rooms: string[];
                      };
                    } = {};

                    item.meetings.forEach((m) => {
                      const timeKey = `${m.start_time}-${m.end_time}`;
                      if (!meetingsByTime[timeKey]) {
                        meetingsByTime[timeKey] = {
                          days: [],
                          start_time: m.start_time,
                          end_time: m.end_time,
                          rooms: [],
                        };
                      }
                      meetingsByTime[timeKey].days.push(m.day);
                      if (!meetingsByTime[timeKey].rooms.includes(m.room)) {
                        meetingsByTime[timeKey].rooms.push(m.room);
                      }
                    });

                    const timeGroups = Object.values(meetingsByTime);

                    return (
                      <div
                        key={index}
                        className={`p-3.5 rounded-xl border transition-all duration-150 hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${splitValidating
                            ? "opacity-60 animate-pulse"
                            : isMajor
                              ? "bg-blue-50/40 border-blue-200/70 hover:border-blue-300"
                              : "bg-purple-50/40 border-purple-200/70 hover:border-purple-300"
                          }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-black text-slate-900 tracking-tight">
                              {item.code}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${isMajor
                                  ? "bg-blue-100 text-blue-800 border-blue-300"
                                  : "bg-purple-100 text-purple-800 border-purple-300"
                                }`}
                            >
                              {item.category}
                            </span>
                            {item.preferred_pattern && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <Scissors className="w-3 h-3 text-amber-700" />
                                {item.preferred_pattern}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-700 truncate">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1.5 flex-wrap">
                            <span className="font-semibold text-slate-700">
                              Room:{" "}
                              {isSameRoomForAll ? uniqueRooms[0] : "Multiple"}
                            </span>
                            <span>•</span>
                            <span>Faculty: {item.faculty}</span>
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col gap-1.5 items-start sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                          {timeGroups.map((g, gIdx) => {
                            const daysStr = g.days.join(" | ");
                            return (
                              <div
                                key={gIdx}
                                className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs"
                              >
                                <Clock className="w-3.5 h-3.5 text-[#4e0a10]" />
                                <span>{daysStr}</span>
                                <span className="text-slate-400">|</span>
                                <span>
                                  {formatTimeDisplay(g.start_time)} –{" "}
                                  {formatTimeDisplay(g.end_time)}
                                </span>
                                {!isSameRoomForAll && g.rooms.length > 0 && (
                                  <>
                                    <span className="text-slate-400">|</span>
                                    <span className="text-slate-500 font-semibold text-[10px]">
                                      {g.rooms.join(", ")}
                                    </span>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Left Panel Footer */}
              <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-slate-500 font-medium hidden sm:block">
                  {isApplying
                    ? "Applying schedule to grid..."
                    : splitValidating
                      ? "Validating split sessions for conflicts…"
                      : hasUnresolvableConflict
                        ? "Resolve all conflicts before applying."
                        : "Review the preview above before placing onto the grid."}
                </p>
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isApplying}
                    className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => onApplySchedule(previewSchedules)}
                    disabled={applyDisabled}
                    className="px-6 py-2 bg-[#4e0a10] hover:bg-[#6b0e17] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isApplying ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#C9952A]" />
                    ) : splitValidating ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-[#C9952A]" />
                    )}
                    {isApplying ? "Applying..." : splitValidating ? "Validating…" : "Apply Schedule"}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Panel: Schedule Options */}
            <div className="w-full md:w-[360px] lg:w-[400px] bg-slate-50 p-4 sm:p-5 overflow-y-auto shrink-0 space-y-5 flex flex-col justify-start">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#4e0a10]" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Schedule Options
                  </h4>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  Live Preview
                </span>
              </div>

              {/* 1. Preferred Time Block */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#4e0a10]" />
                    Preferred Time Block
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Select a preferred window to bias class placements.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    {
                      id: "flexible",
                      label: "Flexible",
                      desc: "7 AM - 9 PM",
                      icon: Clock,
                    },
                    {
                      id: "morning",
                      label: "Morning",
                      desc: "7 AM - 12 PM",
                      icon: Sun,
                    },
                    {
                      id: "afternoon",
                      label: "Afternoon",
                      desc: "12 PM - 5 PM",
                      icon: Sunset,
                    },
                    {
                      id: "evening",
                      label: "Evening",
                      desc: "5 PM - 9 PM",
                      icon: Moon,
                    },
                  ].map((option) => {
                    const IconComponent = option.icon;
                    const isSelected = preferredTimeBlock === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setPreferredTimeBlock(option.id as TimeBlockOption)
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${isSelected
                            ? "bg-[#4e0a10]/5 border-[#4e0a10] ring-1 ring-[#4e0a10] text-[#4e0a10]"
                            : "bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <IconComponent
                            className={`w-3.5 h-3.5 ${isSelected ? "text-[#4e0a10]" : "text-slate-400"
                              }`}
                          />
                          <span
                            className={`w-3 h-3 rounded-full border flex items-center justify-center ${isSelected
                                ? "border-[#4e0a10] bg-[#4e0a10]"
                                : "border-slate-300"
                              }`}
                          >
                            {isSelected && (
                              <span className="w-1 h-1 rounded-full bg-white" />
                            )}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-bold">{option.label}</p>
                          <p className="text-[10px] opacity-75">{option.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>



              {/* 3. Split Minor Courses */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={splitMinorEnabled}
                      onChange={(e) => setSplitMinorEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-[#4e0a10] focus:ring-[#4e0a10] border-slate-300 cursor-pointer"
                    />
                    Split Minor Courses
                  </label>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded-md">
                    1.5h Sessions
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Splits minor courses into 1.5-hour sessions on valid days
                  according to scheduling rules.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5 text-[11px] text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    PATHFIT &amp; NSTP (ROTC/CWTS) are automatically excluded
                    from splitting.
                  </span>
                </div>
                {splitMinorEnabled && (
                  <div className="pt-2 space-y-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600">
                        Eligible Minor Courses
                      </span>
                      <button
                        type="button"
                        onClick={toggleSelectAllMinors}
                        className="text-[#4e0a10] hover:underline font-bold cursor-pointer"
                      >
                        {selectedMinorCourseIds.length ===
                          eligibleMinorCourses.length
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {eligibleMinorCourses.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">
                          No eligible minor courses found.
                        </p>
                      ) : (
                        eligibleMinorCourses.map((course) => {
                          const isChecked = selectedMinorCourseIds.includes(
                            course.id
                          );
                          return (
                            <label
                              key={course.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-purple-50/50 border border-slate-200/70 text-xs font-medium text-slate-700 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleMinorCourse(course.id)}
                                  className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer shrink-0"
                                />
                                <span className="font-bold text-slate-900 shrink-0">
                                  {course.code}
                                </span>
                                <span className="truncate text-slate-600">
                                  {course.name}
                                </span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
