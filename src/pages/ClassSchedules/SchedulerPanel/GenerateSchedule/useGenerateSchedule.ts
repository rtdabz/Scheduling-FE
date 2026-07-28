import { useState, useCallback } from "react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";
import type { ScheduleRecommendation } from "./types";

import type { ApiScheduleRecord } from "../types";

interface UseGenerateScheduleOptions {
  onAccepted?: (schedules?: ApiScheduleRecord[]) => void;
}

export function useGenerateSchedule(options?: UseGenerateScheduleOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isActingOnId, setIsActingOnId] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<ScheduleRecommendation[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const openModal = useCallback(() => {
    setIsOpen(true);
    setErrorMessage(null);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setRecommendations([]);
    setErrorMessage(null);
    setIsActingOnId(null);
  }, []);

  const generate = useCallback(async (sectionId: string, courseIds?: number[]) => {
    if (!sectionId) return;
    setIsGenerating(true);
    setErrorMessage(null);
    setRecommendations([]);

    try {
      const payload: { section_id: number; course_ids?: number[]; max_solutions: number } = {
        section_id: Number(sectionId),
        max_solutions: 2
      };
      if (courseIds && courseIds.length > 0) {
        payload.course_ids = courseIds;
      }

      const response = await api.post<{
        recommendations: ScheduleRecommendation[];
        message?: string;
      }>("/schedule-recommendations", payload);

      if (response.data.recommendations && response.data.recommendations.length > 0) {
        setRecommendations(response.data.recommendations);
      } else {
        setErrorMessage(response.data.message || "No valid schedule recommendations found for this section.");
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setErrorMessage(
        apiError.response?.data?.message || "Failed to generate schedule options. Please try again."
      );
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const accept = useCallback(
    async (id: number) => {
      setIsActingOnId(id);
      try {
        const response = await api.post<{ schedules?: ApiScheduleRecord[] }>(
          `/schedule-recommendations/${id}/accept`
        );
        toast.success("Schedule Applied", "The selected schedule recommendation has been applied successfully.");
        closeModal();
        options?.onAccepted?.(response.data.schedules);
      } catch (err: unknown) {
        const apiError = err as { response?: { data?: { message?: string } } };
        toast.error("Error", apiError.response?.data?.message || "Failed to apply the recommendation.");
      } finally {
        setIsActingOnId(null);
      }
    },
    [closeModal, options, toast]
  );

  const reject = useCallback(
    async (id: number) => {
      setIsActingOnId(id);
      try {
        await api.post(`/schedule-recommendations/${id}/reject`);
        setRecommendations((prev) => prev.filter((r) => r.id !== id));
        toast.info("Option Dismissed", "Recommendation dismissed.");
      } catch (err: unknown) {
        const apiError = err as { response?: { data?: { message?: string } } };
        toast.error("Error", apiError.response?.data?.message || "Failed to dismiss recommendation.");
      } finally {
        setIsActingOnId(null);
      }
    },
    [toast]
  );

  return {
    isOpen,
    isGenerating,
    isActingOnId,
    recommendations,
    errorMessage,
    openModal,
    closeModal,
    generate,
    accept,
    reject
  };
}
