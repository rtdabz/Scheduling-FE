import { useState, useCallback } from "react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";
import type { ApiScheduleRecord } from "../types";

export type ProgressStep = "generating" | "constraints" | "finalizing" | "complete" | "error";
export type TimeBlockOption = "flexible" | "morning" | "afternoon" | "evening";

interface UseGenerateScheduleOptions {
  onAccepted?: (schedules?: ApiScheduleRecord[]) => void;
}

export function isValidPatternForApi(pattern: string | null | undefined): boolean {
  if (!pattern) return false;
  if (pattern === "MW" || pattern === "TTh") return true;
  return /^days:[0-6]-[0-6]$/.test(pattern);
}

export function isSyntheticSplitId(id: string | number | null | undefined): boolean {
  if (id === null || id === undefined) return false;
  const strId = String(id);
  return strId.includes("-m") || strId.includes("-n") || strId.startsWith("temp-split-");
}

export function getCleanScheduleId(id: string | number | null | undefined): number | null {
  if (isSyntheticSplitId(id)) return null;
  const numId = Number(id);
  return !isNaN(numId) && numId > 0 ? numId : null;
};

export function useGenerateSchedule(options?: UseGenerateScheduleOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep>("generating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [baseSchedules, setBaseSchedules] = useState<ApiScheduleRecord[]>([]);

  // Persistent Schedule Options State across modal operations
  const [preferredTimeBlock, setPreferredTimeBlock] = useState<TimeBlockOption>("flexible");
  const [splitMinorEnabled, setSplitMinorEnabled] = useState(false);
  const [selectedMinorCourseIds, setSelectedMinorCourseIds] = useState<string[]>([]);

  const { toast } = useToast();

  const openModal = useCallback(() => {
    setIsOpen(true);
    setErrorMessage(null);
    setProgressStep("generating");
    setBaseSchedules([]);
    setPreferredTimeBlock("flexible");
    setSplitMinorEnabled(false);
    setSelectedMinorCourseIds([]);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setErrorMessage(null);
    setIsGenerating(false);
    setIsApplying(false);
  }, []);

  const generate = useCallback(
    async (sectionId: string, courseIds?: number[]) => {
      if (!sectionId) return;
      setIsGenerating(true);
      setErrorMessage(null);
      setProgressStep("generating");

      const timer1 = setTimeout(() => {
        setProgressStep("constraints");
      }, 250);

      const timer2 = setTimeout(() => {
        setProgressStep("finalizing");
      }, 550);

      try {
        const payload: { section_id: number; course_ids?: number[]; seed?: number } = {
          section_id: Number(sectionId),
          seed: Math.floor(Math.random() * 1000000),
        };
        if (courseIds && courseIds.length > 0) {
          payload.course_ids = courseIds;
        }

        // Call preview endpoint to generate schedule candidate preview in-memory
        // without persisting anything to the database until Apply is clicked.
        const response = await api.post<{
          message?: string;
          recommendations?: { rank: number; score: number; schedules: ApiScheduleRecord[] }[];
          schedules?: ApiScheduleRecord[];
        }>("/schedule-recommendations/preview", payload);

        clearTimeout(timer1);
        clearTimeout(timer2);
        setProgressStep("complete");

        const schedules =
          response.data.recommendations?.[0]?.schedules ||
          response.data.schedules ||
          [];
        setBaseSchedules(schedules);
      } catch (err: unknown) {
        clearTimeout(timer1);
        clearTimeout(timer2);
        setProgressStep("error");
        const apiError = err as { response?: { data?: { message?: string } } };
        setErrorMessage(
          apiError.response?.data?.message || "Failed to generate schedule. Please verify constraints and retry."
        );
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const applySchedule = useCallback(
    async (finalSchedules: ApiScheduleRecord[]) => {
      const schedulesToApply =
        finalSchedules.length > 0 ? finalSchedules : baseSchedules;
      if (!schedulesToApply || schedulesToApply.length === 0) {
        closeModal();
        return;
      }

      setIsApplying(true);

      try {
        // Collect real integer IDs of baseline DB records to delete.
        // Synthetic split IDs like "123-m1" are excluded.
        const deleteIds: number[] = [];
        baseSchedules.forEach((bs) => {
          const numId = Number(bs.id);
          if (!isNaN(numId) && numId > 0 && !String(bs.id).includes("-")) {
            deleteIds.push(numId);
          }
        });

        // Build CREATE operations from all sessions.
        const operations = schedulesToApply.map((s) => {
          const courseId = Number(s.course_id ?? s.subject_id);
          const parsedRoomId = Number(s.room_id);
          const roomId =
            !isNaN(parsedRoomId) && parsedRoomId > 0 ? parsedRoomId : 1;
          const patternToUse = isValidPatternForApi(s.preferred_pattern)
            ? (s.preferred_pattern ?? null)
            : null;

          const op: {
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
          } = {
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
            preferred_pattern: patternToUse,
            status: s.status || "draft",
          };

          if (s.faculty_id) op.faculty_id = Number(s.faculty_id);
          return op;
        });

        // Atomic batch save — delete old baseline rows and create new ones.
        const payload: {
          operations: typeof operations;
          delete_ids?: number[];
        } = { operations };

        if (deleteIds.length > 0) payload.delete_ids = deleteIds;

        const response = await api.post<{
          message?: string;
          schedules?: ApiScheduleRecord[];
          violations?: { rule: string; message: string }[];
        }>("/schedules/batch", payload);

        const savedSchedules =
          response.data.schedules && response.data.schedules.length > 0
            ? response.data.schedules
            : schedulesToApply;

        setBaseSchedules(savedSchedules);
        options?.onAccepted?.(savedSchedules);
        toast.success(
          "Schedule Plotted",
          "The generated schedule has been placed into the Timetable Grid."
        );
      } catch (err: unknown) {
        const apiError = err as {
          response?: {
            data?: {
              message?: string;
              violations?: { rule: string; message: string }[];
            };
          };
        };

        const violations = apiError.response?.data?.violations;
        const fallbackMsg =
          apiError.response?.data?.message ||
          "Failed to save schedule. Please check for conflicts and retry.";

        if (violations && violations.length > 0) {
          const summary = violations
            .slice(0, 3)
            .map((v) => v.message)
            .join(" | ");
          toast.error("Schedule Conflict", summary);
        } else {
          toast.error("Save Failed", fallbackMsg);
        }
      } finally {
        setIsApplying(false);
      }

      closeModal();
    },
    [baseSchedules, closeModal, options, toast]
  );

  return {
    isOpen,
    isGenerating,
    isApplying,
    progressStep,
    errorMessage,
    baseSchedules,
    preferredTimeBlock,
    setPreferredTimeBlock,
    splitMinorEnabled,
    setSplitMinorEnabled,
    selectedMinorCourseIds,
    setSelectedMinorCourseIds,
    openModal,
    closeModal,
    generate,
    applySchedule,
  };
}
