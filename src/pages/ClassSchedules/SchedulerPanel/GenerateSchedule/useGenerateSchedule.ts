import { useState, useCallback } from "react";
import api from "../../../../lib/api";
import { useToast } from "../../../../context/ToastContext";
import type { ApiScheduleRecord, ScheduleItem } from "../types";

export type ProgressStep = "generating" | "constraints" | "finalizing" | "complete" | "error";
export type TimeBlockOption = "flexible" | "morning" | "afternoon" | "evening";
export type DeliveryModeOption = "on-site" | "online" | "field";

interface UseGenerateScheduleOptions {
  onAccepted?: (schedules?: ApiScheduleRecord[]) => void;
  existingSchedules?: ScheduleItem[];
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

const getScheduleCourseId = (schedule: ApiScheduleRecord): number | null => {
  const courseId = Number(schedule.course_id ?? schedule.subject_id);
  return Number.isFinite(courseId) && courseId > 0 ? courseId : null;
};

const toHourMinute = (time: string | null | undefined): string => {
  if (!time) return "";
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(time);

  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const getScheduleValue = <T,>(
  schedule: ApiScheduleRecord,
  snakeKey: keyof ApiScheduleRecord,
  camelKey: string,
): T | undefined => {
  const row = schedule as ApiScheduleRecord & Record<string, T | undefined>;
  return (row[snakeKey] as T | undefined) ?? row[camelKey];
};

const getReplacementDeleteIds = (
  proposedSchedules: ApiScheduleRecord[],
  existingSchedules: ScheduleItem[] = []
): number[] => {
  const replacementKeys = new Set(
    proposedSchedules
      .map((schedule) => {
        const sectionId = Number(schedule.section_id);
        const courseId = Number(schedule.course_id ?? schedule.subject_id);
        return sectionId > 0 && courseId > 0 ? `${sectionId}:${courseId}` : null;
      })
      .filter((key): key is string => key !== null)
  );

  return Array.from(new Set(
    existingSchedules
      .filter((schedule) => replacementKeys.has(`${Number(schedule.sectionId)}:${Number(schedule.courseId || schedule.subjectId)}`))
      .map((schedule) => getCleanScheduleId(schedule.id))
      .filter((id): id is number => id !== null)
  ));
};

type PreviewResponse = {
  message?: string;
  recommendations?: { rank: number; score: number; schedules: ApiScheduleRecord[] }[];
  schedules?: ApiScheduleRecord[];
};

const schedulesFromPreview = (data: PreviewResponse): ApiScheduleRecord[] =>
  data.recommendations?.[0]?.schedules ||
  data.schedules ||
  [];

export function useGenerateSchedule(options?: UseGenerateScheduleOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep>("generating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [baseSchedules, setBaseSchedules] = useState<ApiScheduleRecord[]>([]);

  // Persistent Schedule Options State across modal operations
  const [preferredTimeBlock, setPreferredTimeBlock] = useState<TimeBlockOption>("flexible");
  const [splitSessionEnabled, setSplitSessionEnabled] = useState(false);
  const [selectedSplitSessionCourseIds, setSelectedSplitSessionCourseIds] = useState<string[]>([]);
  const [selectedGecCourseIds, setSelectedGecCourseIds] = useState<string[]>([]);

  const { toast } = useToast();

  const openModal = useCallback(() => {
    setIsOpen(true);
    setErrorMessage(null);
    setProgressStep("generating");
    setBaseSchedules([]);
    setPreferredTimeBlock("flexible");
    setSplitSessionEnabled(false);
    setSelectedSplitSessionCourseIds([]);
    setSelectedGecCourseIds([]);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setErrorMessage(null);
    setIsGenerating(false);
    setIsApplying(false);
  }, []);

  const generate = useCallback(
    async (
      sectionId: string,
      courseIds?: number[],
      options?: {
        preferredTimeBlock?: TimeBlockOption;
        splitSessionEnabled?: boolean;
        selectedSplitSessionCourseIds?: string[];
        splitGecEnabled?: boolean;
        selectedGecCourseIds?: string[];
        mode?: DeliveryModeOption;
      }
    ) => {
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
        const payload: {
          section_id: number;
          course_ids?: number[];
          anchored_schedules?: {
            course_id: number;
            day: string;
            start_time: string;
            end_time: string;
            room_id?: number | null;
          }[];
          seed?: number;
          preferred_time_block?: TimeBlockOption;
          split_session_enabled?: boolean;
          selected_split_session_course_ids?: string[];
          split_gec_enabled?: boolean;
          selected_gec_course_ids?: string[];
          max_solutions?: number;
          max_iterations?: number;
          timeout_seconds?: number;
          mode?: DeliveryModeOption;
        } = {
          section_id: Number(sectionId),
          seed: Math.floor(Math.random() * 1000000),
          max_solutions: 1,
          max_iterations: 120000,
          timeout_seconds: 5,
        };
        if (courseIds && courseIds.length > 0) {
          payload.course_ids = courseIds;
          const replacementCourseIds = new Set(courseIds.map(Number));
          const anchors = baseSchedules
            .filter((schedule) => {
              const courseId = getScheduleCourseId(schedule);
              return courseId !== null && replacementCourseIds.has(courseId);
            })
            .map((schedule) => ({
              course_id: Number(schedule.course_id ?? schedule.subject_id),
              day: schedule.day,
              start_time: toHourMinute(schedule.start_time),
              end_time: toHourMinute(schedule.end_time),
              room_id: schedule.mode === "online" ? null : Number(schedule.room_id) || null,
            }));
          if (anchors.length > 0) {
            payload.anchored_schedules = anchors;
          }
        }
        if (options) {
          if (options.preferredTimeBlock) {
            payload.preferred_time_block = options.preferredTimeBlock;
          }
          if (options.splitSessionEnabled !== undefined) {
            payload.split_session_enabled = options.splitSessionEnabled;
          }
          if (options.selectedSplitSessionCourseIds) {
            payload.selected_split_session_course_ids = options.selectedSplitSessionCourseIds;
          }
          if (options.splitGecEnabled !== undefined) {
            payload.split_gec_enabled = options.splitGecEnabled;
          }
          if (options.selectedGecCourseIds) {
            payload.selected_gec_course_ids = options.selectedGecCourseIds;
          }
          if (options.mode) {
            payload.mode = options.mode;
          }
        }

        // Call preview endpoint to generate schedule candidate preview in-memory
        // without persisting anything to the database until Apply is clicked.
        let response = await api.post<PreviewResponse>("/schedule-recommendations/preview", payload);
        let schedules = schedulesFromPreview(response.data);

        if (schedules.length === 0) {
          response = await api.post<PreviewResponse>("/schedule-recommendations/preview", {
            ...payload,
            max_iterations: 250000,
            timeout_seconds: 8,
          });
          schedules = schedulesFromPreview(response.data);
        }

        clearTimeout(timer1);
        clearTimeout(timer2);
        setProgressStep("complete");

        if (schedules.length === 0) {
          setProgressStep("error");
          setErrorMessage(response.data.message || "No valid schedule could be generated for this section. Please check the section curriculum and room availability.");
          return;
        }
        if (courseIds && courseIds.length > 0 && baseSchedules.length > 0) {
          const replacementCourseIds = new Set(courseIds.map(Number));
          setBaseSchedules((previous) => [
            ...previous.filter((schedule) => {
              const courseId = getScheduleCourseId(schedule);
              return courseId === null || !replacementCourseIds.has(courseId);
            }),
            ...schedules,
          ]);
        } else {
          setBaseSchedules(schedules);
        }
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
    [baseSchedules.length]
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
        const deleteIds = getReplacementDeleteIds(
          schedulesToApply,
          options?.existingSchedules
        );

        // Build CREATE operations from all sessions.
        const operations = schedulesToApply.map((s) => {
          const termId = Number(getScheduleValue<number | string>(s, "term_id", "termId"));
          const sectionId = Number(getScheduleValue<number | string>(s, "section_id", "sectionId"));
          const departmentId = Number(getScheduleValue<number | string>(s, "department_id", "departmentId"));
          const courseId = Number(
            getScheduleValue<number | string>(s, "course_id", "courseId")
              ?? getScheduleValue<number | string>(s, "subject_id", "subjectId")
          );
          const parsedRoomId = Number(getScheduleValue<number | string | null>(s, "room_id", "roomId"));
          const rawFacultyId = getScheduleValue<number | string | null>(s, "faculty_id", "facultyId");
          const roomId =
            s.mode === "online"
              ? null
              : !isNaN(parsedRoomId) && parsedRoomId > 0
                ? parsedRoomId
                : null;
          const patternToUse = isValidPatternForApi(s.preferred_pattern)
            ? (s.preferred_pattern ?? null)
            : null;

          const op: {
            term_id: number;
            section_id: number;
            course_id: number;
            room_id: number | null;
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
            meeting_index?: number | null;
          } = {
            term_id: termId,
            section_id: sectionId,
            course_id: courseId,
            room_id: roomId,
            department_id: departmentId,
            day: getScheduleValue<string>(s, "day", "day") ?? "",
            start_time: toHourMinute(getScheduleValue<string>(s, "start_time", "startTime")),
            end_time: toHourMinute(getScheduleValue<string>(s, "end_time", "endTime")),
            mode: s.mode || "on-site",
            is_hybrid: !!s.is_hybrid,
            preferred_pattern: patternToUse,
            status: s.status || "draft",
          };

          if (rawFacultyId) op.faculty_id = Number(rawFacultyId);
          if (s.split_group_id) op.split_group_id = s.split_group_id;
          if (s.meeting_type) op.meeting_type = s.meeting_type;
          if (s.meeting_index) op.meeting_index = Number(s.meeting_index);
          return op;
        });

        const missingRequiredFields = operations.flatMap((op, index) => {
          const missing: string[] = [];
          if (!Number.isFinite(op.term_id) || op.term_id <= 0) missing.push("term_id");
          if (!Number.isFinite(op.section_id) || op.section_id <= 0) missing.push("section_id");
          if (!Number.isFinite(op.course_id) || op.course_id <= 0) missing.push("course_id");
          if (!Number.isFinite(op.department_id) || op.department_id <= 0) missing.push("department_id");
          if (!op.day) missing.push("day");
          if (!op.start_time) missing.push("start_time");
          if (!op.end_time) missing.push("end_time");

          return missing.map((field) => `operations.${index}.${field}`);
        });

        if (missingRequiredFields.length > 0) {
          throw new Error(`Generated schedule payload is missing required fields: ${missingRequiredFields.slice(0, 6).join(", ")}`);
        }

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
        window.dispatchEvent(
          new CustomEvent("show-helper-buddy", {
            detail: {
              id: crypto.randomUUID(),
              type: "info",
              text: "You can edit a schedule by clicking its card"
            }
          })
        );
      } catch (err: unknown) {
        window.dispatchEvent(
          new CustomEvent("show-helper-buddy", {
            detail: {
              id: crypto.randomUUID(),
              type: "conflict",
              text: "There's a conflict. Here are some recommended approaches..."
            }
          })
        );
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
          (err instanceof Error ? err.message : null) ||
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
    splitSessionEnabled,
    setSplitSessionEnabled,
    selectedSplitSessionCourseIds,
    setSelectedSplitSessionCourseIds,
    selectedGecCourseIds,
    setSelectedGecCourseIds,
    openModal,
    closeModal,
    generate,
    applySchedule,
  };
}
