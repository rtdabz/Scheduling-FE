import { useState, useCallback } from "react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";

import type { ApiScheduleRecord } from "../types";

export type ProgressStep = "generating" | "constraints" | "finalizing" | "complete" | "error";

interface UseGenerateScheduleOptions {
  onAccepted?: (schedules?: ApiScheduleRecord[]) => void;
}

export function useGenerateSchedule(options?: UseGenerateScheduleOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep>("generating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const openModal = useCallback(() => {
    setIsOpen(true);
    setErrorMessage(null);
    setProgressStep("generating");
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setErrorMessage(null);
    setIsGenerating(false);
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
        const payload: { section_id: number; course_ids?: number[] } = {
          section_id: Number(sectionId),
        };
        if (courseIds && courseIds.length > 0) {
          payload.course_ids = courseIds;
        }

        const response = await api.post<{
          message?: string;
          schedules?: ApiScheduleRecord[];
        }>("/schedule-recommendations/auto-generate", payload);

        clearTimeout(timer1);
        clearTimeout(timer2);
        setProgressStep("complete");

        const schedules = response.data.schedules;
        options?.onAccepted?.(schedules);
        toast.success("Schedule Plotted", "The generated schedule has been placed into the Timetable Grid.");

        setTimeout(() => {
          closeModal();
        }, 600);
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
    [closeModal, options, toast]
  );

  return {
    isOpen,
    isGenerating,
    progressStep,
    errorMessage,
    openModal,
    closeModal,
    generate,
  };
}
