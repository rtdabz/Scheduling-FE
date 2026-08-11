import type React from "react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Loader2,
  RefreshCw,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import api from "../../../../lib/api";
import type { DeliveryModeOption, ProgressStep, TimeBlockOption } from "./useGenerateSchedule";
import { getCleanScheduleId, isValidPatternForApi } from "./useGenerateSchedule";
import type { ApiScheduleRecord, Course, Room, ScheduleItem } from "../types";
import { DAYS, GRID_HEADER_HEIGHT_PX, slotToTimeStr } from "../constants";
import GenerationConstraintsStepper from "./GenerationConstraintsStepper";

interface SplitOperation {
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
  existingSchedules?: ScheduleItem[];
  sectionId: string;
  sectionName: string;
  availableCourses?: Course[];
  allCourses?: Course[];
  preferredTimeBlock: TimeBlockOption;
  setPreferredTimeBlock: (val: TimeBlockOption) => void;
  splitSessionEnabled: boolean;
  setSplitSessionEnabled: (val: boolean) => void;
  selectedSplitSessionCourseIds: string[];
  setSelectedSplitSessionCourseIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedGecCourseIds: string[];
  setSelectedGecCourseIds: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onGenerate: (
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
  ) => void;
  /** Receives pre-validated, conflict-free schedules ready to be saved. */
  onApplySchedule: (finalSchedules: ApiScheduleRecord[]) => void;
  rooms?: Room[];
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

const isGecCourse = (course: { code?: string; name?: string; categories?: { name: string }[] }): boolean => {
  if ((course.categories ?? []).some((category) => category.name.toLowerCase() === "gec")) {
    return true;
  }

  const code = (course.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.startsWith("GEC");
};

const PREVIEW_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function GenerateScheduleModal({
  isOpen,
  isGenerating,
  isApplying = false,
  progressStep,
  errorMessage,
  baseSchedules,
  existingSchedules = [],
  sectionId,
  sectionName,
  availableCourses = [],
  allCourses = [],
  preferredTimeBlock,
  setPreferredTimeBlock,
  splitSessionEnabled,
  setSplitSessionEnabled,
  selectedSplitSessionCourseIds,
  setSelectedSplitSessionCourseIds,
  selectedGecCourseIds,
  setSelectedGecCourseIds,
  onClose,
  onGenerate,
  onApplySchedule,
  rooms = [],
}: GenerateScheduleModalProps) {
  // ── Split pre-validation state ──
  const [splitValidating, setSplitValidating] = useState(false);
  const [resolvedSplit, setResolvedSplit] = useState<ResolvedSplitState | null>(null);
  const [lectureLabSettingEnabled, setLectureLabSettingEnabled] = useState(false);
  const [gecSplitSettingEnabled, setGecSplitSettingEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [constraintsConfirmed, setConstraintsConfirmed] = useState(false);
  /** Abort controller ref so we can cancel stale validation requests. */
  const abortRef = useRef<AbortController | null>(null);
  const hasMissingPhysicalRoomError = !!errorMessage
    && /No (laboratory room|classroom \(lecture room\)) found/i.test(errorMessage);

  const currentGenerateOptions = useCallback(
    (mode?: DeliveryModeOption) => ({
      preferredTimeBlock,
      splitSessionEnabled: lectureLabSettingEnabled && selectedSplitSessionCourseIds.length > 0,
      selectedSplitSessionCourseIds: lectureLabSettingEnabled
        ? selectedSplitSessionCourseIds
        : [],
      splitGecEnabled: gecSplitSettingEnabled && selectedGecCourseIds.length > 0,
      selectedGecCourseIds: gecSplitSettingEnabled
        ? selectedGecCourseIds
        : [],
      ...(mode ? { mode } : {}),
    }),
    [
      lectureLabSettingEnabled,
      gecSplitSettingEnabled,
      preferredTimeBlock,
      selectedGecCourseIds,
      selectedSplitSessionCourseIds,
      splitSessionEnabled,
    ],
  );

  const scopedRegenerateCourseIds = useMemo(() => {
    const ids = [
      ...(lectureLabSettingEnabled && splitSessionEnabled ? selectedSplitSessionCourseIds : []),
      ...(gecSplitSettingEnabled && selectedGecCourseIds.length > 0 ? selectedGecCourseIds : []),
    ]
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    return Array.from(new Set(ids));
  }, [
    selectedGecCourseIds,
    selectedSplitSessionCourseIds,
    gecSplitSettingEnabled,
    lectureLabSettingEnabled,
    splitSessionEnabled,
  ]);

  const regenerateCourseIds = scopedRegenerateCourseIds.length > 0
    ? scopedRegenerateCourseIds
    : undefined;

  useEffect(() => {
    if (!isOpen) {
      setSettingsLoaded(false);
      setConstraintsConfirmed(false);
    }
  }, [isOpen]);

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
        units: Number(bs.course?.units ?? bs.subject?.units ?? 0) || 3,
        lectureHours: Number(bs.course?.lecture_hours ?? bs.subject?.lecture_hours ?? 3),
        labHours: Number(bs.course?.lab_hours ?? bs.subject?.lab_hours ?? 0),
        category,
        categories: bs.course?.categories ?? bs.subject?.categories ?? [],
        semester: "1st",
        departmentId: Number(bs.department_id) || null,
        yearLevel: 1,
        roomTypeRequired: "lecture",
        status: "active",
      });
    });
    return Array.from(map.values());
  }, [availableCourses, allCourses, baseSchedules]);

  const eligibleGecCourses = useMemo(
    () => (availableCourses.length > 0 ? availableCourses : allSectionCourses).filter((c) =>
      c.category === "minor" && !isPathfitOrNstp(c) && isGecCourse(c)
    ),
    [availableCourses, allSectionCourses]
  );

  const eligibleSplitUnitCourses = useMemo(
    () => (availableCourses.length > 0 ? availableCourses : allSectionCourses).filter((c) =>
      Number(c.units ?? 0) > 1 && !isPathfitOrNstp(c)
    ),
    [availableCourses, allSectionCourses]
  );

  const eligibleSplitSessionCourses = useMemo(
    () => (availableCourses.length > 0 ? availableCourses : allSectionCourses).filter((c) =>
      c.category === "major" && Number(c.lectureHours ?? 0) > 0 && Number(c.labHours ?? 0) > 0
    ),
    [availableCourses, allSectionCourses]
  );



  // ── Auto-generate on open if no base schedules exist ──
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setSettingsLoaded(false);
    api.get<{
      gec_split_schedule_override_enabled?: boolean;
      lecture_lab_schedule_override_enabled?: boolean;
    }>("/scheduling-settings")
      .then((response) => {
        if (active) {
          setLectureLabSettingEnabled(!!response.data.lecture_lab_schedule_override_enabled);
          setGecSplitSettingEnabled(!!response.data.gec_split_schedule_override_enabled);
          setSettingsLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setLectureLabSettingEnabled(false);
          setGecSplitSettingEnabled(false);
          setSettingsLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  // Normalize generated rows only. Split/component creation stays in the existing generator pipeline.
  const candidateSchedules = useMemo<ApiScheduleRecord[]>(() => {
    if (!baseSchedules || baseSchedules.length === 0) return [];

    return baseSchedules.map((item) => {
      const startSlot = timeStrToSlot(item.start_time);
      const endSlot = Math.max(timeStrToSlot(item.end_time), startSlot + 2);

      return {
        ...item,
        start_time: slotToTime24h(startSlot),
        end_time: slotToTime24h(endSlot),
        preferred_pattern: isValidPatternForApi(item.preferred_pattern)
          ? item.preferred_pattern
          : null,
      };
    });

  }, [baseSchedules]);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Pre-validate via Rule Engine / CSP endpoint.
  // Fires whenever the candidate sessions change.  Cancels any in-flight
  // request so stale results never overwrite fresher ones.
  // ─────────────────────────────────────────────────────────────────────────
  const anySplit = useMemo(
    () =>
      candidateSchedules.some(
        (s) =>
          String(s.id).includes("-n") ||
          !!s.split_group_id ||
          !!s.meeting_type ||
          Number(s.meeting_index ?? 0) > 0
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

    const replacementKeys = new Set(
      candidateSchedules
        .map((schedule) => {
          const secId = Number(schedule.section_id);
          const courseId = Number(schedule.course_id ?? schedule.subject_id);
          return secId > 0 && courseId > 0 ? `${secId}:${courseId}` : null;
        })
        .filter((key): key is string => key !== null)
    );
    const deleteIds = Array.from(new Set(
      existingSchedules
        .filter((schedule) => replacementKeys.has(`${Number(schedule.sectionId)}:${Number(schedule.courseId || schedule.subjectId)}`))
        .map((schedule) => getCleanScheduleId(schedule.id))
        .filter((id): id is number => id !== null)
    ));

    const operations: SplitOperation[] = candidateSchedules.map((s) => {
      const courseId = Number(s.course_id ?? s.subject_id);
      const parsedRoomId = Number(s.room_id);
      const roomId =
        s.mode === "online"
          ? null
          : !isNaN(parsedRoomId) && parsedRoomId > 0
            ? parsedRoomId
            : null;
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
        const resolvedOperations = res.data.operations ?? operations;
        setResolvedSplit({
          status: "ok",
          operations: resolvedOperations,
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
  }, [candidateSchedules, anySplit, existingSchedules]);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — Merge resolved times back into rich ApiScheduleRecord objects
  // so the preview cards still show course/room/faculty display names while
  // using the conflict-free times from the server.
  // ─────────────────────────────────────────────────────────────────────────
  const previewSchedules = useMemo<ApiScheduleRecord[]>(() => {
    const contextSource = candidateSchedules[0] ?? baseSchedules[0];
    const hydrateRequiredFields = (schedule: ApiScheduleRecord): ApiScheduleRecord => ({
      ...schedule,
      term_id: schedule.term_id ?? contextSource?.term_id,
      section_id: schedule.section_id ?? contextSource?.section_id ?? sectionId,
      department_id: schedule.department_id ?? contextSource?.department_id,
      day: schedule.day || contextSource?.day || "Monday",
      start_time: schedule.start_time || contextSource?.start_time || "07:00",
      end_time: schedule.end_time || contextSource?.end_time || "08:00",
    });

    if (!anySplit || !resolvedSplit || resolvedSplit.status !== "ok") {
      // No split active or still validating — show candidates as-is.
      return candidateSchedules.map(hydrateRequiredFields);
    }

    return candidateSchedules.map((candidate, idx) => {
      const resolved = resolvedSplit.operations[idx];
      if (!resolved) return hydrateRequiredFields(candidate);

      return hydrateRequiredFields({
        ...candidate,
        day: resolved.day || candidate.day,
        start_time: resolved.start_time || candidate.start_time,
        end_time: resolved.end_time || candidate.end_time,
        mode: (resolved.mode || candidate.mode) as ApiScheduleRecord["mode"],
        room_id: resolved.room_id ?? candidate.room_id,
      });
    });
  }, [baseSchedules, candidateSchedules, anySplit, resolvedSplit, sectionId]);

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
      const room = item.room?.room_code ||
        rooms.find((r) => String(r.id) === String(item.room_id))?.name ||
        "Assigned Room";
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

  const previewSchedulesByDay = useMemo(() => {
    const dayMap = new Map<
      string,
      {
        id: string | number;
        code: string;
        name: string;
        category: string;
        isMajor: boolean;
        day: string;
        start_time: string;
        end_time: string;
        room: string;
        mode: string;
        meetingType?: "lecture" | "laboratory" | null;
      }[]
    >();

    PREVIEW_DAYS.forEach((day) => dayMap.set(day, []));

    previewSchedules.forEach((item) => {
      const courseIdStr = (item.course_id ?? item.subject_id)?.toString() ?? "";
      const foundCourse = allSectionCourses.find(
        (c) =>
          c.id === courseIdStr ||
          (c.code &&
            (item.course?.course_code || item.subject?.course_code || "") &&
            c.code.toLowerCase() ===
              (item.course?.course_code || item.subject?.course_code || "").toLowerCase())
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
      const mode = item.mode || "on-site";
      const room =
        mode === "online"
          ? "Online"
          : item.room?.room_code ||
            rooms.find((r) => String(r.id) === String(item.room_id))?.name ||
            "Room TBA";

      const targetDay = PREVIEW_DAYS.includes(item.day) ? item.day : "Monday";
      dayMap.get(targetDay)?.push({
        id: item.id,
        code,
        name,
        category,
        isMajor: category === "major",
        day: targetDay,
        start_time: item.start_time,
        end_time: item.end_time,
        room,
        mode,
        meetingType: item.meeting_type,
      });
    });

    return PREVIEW_DAYS.map((day) => ({
      day,
      sessions: (dayMap.get(day) ?? []).sort((a, b) =>
        a.start_time.localeCompare(b.start_time)
      ),
    }));
  }, [previewSchedules, allSectionCourses, rooms]);

  const previewGridSessions = useMemo(() => {
    return previewSchedules
      .map((item) => {
        const courseIdStr = (item.course_id ?? item.subject_id)?.toString() ?? "";
        const foundCourse = allSectionCourses.find(
          (c) =>
            c.id === courseIdStr ||
            (c.code &&
              (item.course?.course_code || item.subject?.course_code || "") &&
              c.code.toLowerCase() ===
                (item.course?.course_code || item.subject?.course_code || "").toLowerCase())
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
        const mode = item.mode || "on-site";
        const room =
          mode === "online"
            ? "Online"
            : item.room?.room_code ||
              rooms.find((r) => String(r.id) === String(item.room_id))?.name ||
              "Room TBA";
        const dayIndex = DAYS.indexOf(item.day);
        const startSlot = timeStrToSlot(item.start_time);
        const durationSlots = Math.max(
          1,
          timeStrToSlot(item.end_time) - startSlot
        );

        return {
          id: item.id,
          code,
          name,
          category,
          isMajor: category === "major",
          dayIndex: dayIndex >= 0 ? dayIndex : 0,
          startSlot,
          durationSlots,
          start_time: item.start_time,
          end_time: item.end_time,
          room,
          mode,
          meetingType: item.meeting_type,
          labHours: Number(foundCourse?.labHours ?? item.course?.lab_hours ?? item.subject?.lab_hours ?? 0),
        };
      })
      .sort((a, b) => a.dayIndex - b.dayIndex || a.startSlot - b.startSlot);
  }, [previewSchedules, allSectionCourses, rooms]);

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
  const splitValidationPending =
    anySplit &&
    !splitValidating &&
    resolvedSplit?.status !== "ok" &&
    resolvedSplit?.status !== "conflict";

  const applyDisabled =
    previewSchedules.length === 0 ||
    isGenerating ||
    splitValidating ||
    splitValidationPending ||
    hasUnresolvableConflict ||
    isApplying;

  const waitingForInitialGeneration =
    isOpen &&
    !settingsLoaded &&
    baseSchedules.length === 0 &&
    previewSchedules.length === 0 &&
    !errorMessage;
  const previewLoading = isGenerating || waitingForInitialGeneration;
  const showConstraintStepper = !constraintsConfirmed && baseSchedules.length === 0 && !errorMessage;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isApplying) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl h-[92vh] max-h-[900px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-amber-900/20">
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
            {!showConstraintStepper && (
              <button
                type="button"
                onClick={() => onGenerate(sectionId, regenerateCourseIds, currentGenerateOptions())}
                disabled={isGenerating || isApplying}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/15 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`}
                />
                Regenerate
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        {showConstraintStepper ? (
          <GenerationConstraintsStepper
            sectionId={sectionId}
            isGenerating={isGenerating}
            isApplying={isApplying}
            preferredTimeBlock={preferredTimeBlock}
            setPreferredTimeBlock={setPreferredTimeBlock}
            selectedGecCourseIds={selectedGecCourseIds}
            setSelectedGecCourseIds={setSelectedGecCourseIds}
            selectedSplitSessionCourseIds={selectedSplitSessionCourseIds}
            setSelectedSplitSessionCourseIds={setSelectedSplitSessionCourseIds}
            eligibleGecCourses={eligibleGecCourses}
            eligibleSplitSessionCourses={eligibleSplitSessionCourses}
            gecSplitAvailable={gecSplitSettingEnabled}
            splitSessionAvailable={lectureLabSettingEnabled}
            onConfirm={() => {
              const eligibleLabIds = new Set(eligibleSplitSessionCourses.map((course) => course.id));
              const eligibleGecIds = new Set(eligibleGecCourses.map((course) => course.id));
              const selectedLabCourseIds = lectureLabSettingEnabled
                ? selectedSplitSessionCourseIds.filter((id) => eligibleLabIds.has(id))
                : [];
              const selectedGecIds = gecSplitSettingEnabled
                ? selectedGecCourseIds.filter((id) => eligibleGecIds.has(id))
                : [];
              setConstraintsConfirmed(true);
              setSplitSessionEnabled(selectedLabCourseIds.length > 0);
              onGenerate(sectionId, undefined, {
                ...currentGenerateOptions(),
                splitSessionEnabled: selectedLabCourseIds.length > 0,
                selectedSplitSessionCourseIds: selectedLabCourseIds,
                splitGecEnabled: gecSplitSettingEnabled && selectedGecIds.length > 0,
                selectedGecCourseIds: selectedGecIds,
              });
            }}
          />
        ) : errorMessage ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
            <div className="p-4 bg-red-100 text-red-600 rounded-2xl mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-gray-800">
              Generation Unsuccessful
            </h4>
            <p className="text-xs text-gray-600 mt-1 max-w-md">{errorMessage}</p>
            {hasMissingPhysicalRoomError && (
              <div className="mt-5 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-bold text-amber-900">
                  Another option: do you want to make this schedule online?
                </p>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              {hasMissingPhysicalRoomError && (
                <button
                  type="button"
                  onClick={() => onGenerate(sectionId, regenerateCourseIds, currentGenerateOptions("online"))}
                  disabled={isGenerating || isApplying}
                  className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer shadow-md disabled:opacity-50"
                >
                  Yes, Make Online
                </button>
              )}
              <button
                type="button"
                onClick={() => onGenerate(sectionId, regenerateCourseIds, currentGenerateOptions())}
                disabled={isGenerating || isApplying}
                className="px-5 py-2.5 bg-[#4e0a10] text-white text-xs font-bold rounded-xl hover:bg-[#6b0e17] transition-colors cursor-pointer shadow-md disabled:opacity-50"
              >
                {hasMissingPhysicalRoomError ? "No, Regenerate" : "Retry Generation"}
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
        ) : (
          <div className="flex-1 grid grid-cols-1 overflow-hidden bg-slate-100">
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
                  {previewLoading ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {isGenerating ? "Generating preview" : "Loading settings"}
                    </span>
                  ) : splitValidating ? (
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

              {/* Preview Board */}
              <div className="flex-1 overflow-hidden p-3">
                {previewLoading ? (
                  <div className="h-full border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white relative select-none">
                    <div
                      className="h-full grid"
                      style={{
                        gridTemplateColumns: "62px repeat(7, minmax(0, 1fr))",
                        gridTemplateRows: `${GRID_HEADER_HEIGHT_PX}px repeat(24, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="bg-gradient-to-b from-[#4e0a10] to-[#3d080c] border-r border-b border-[#c9952a]/30 p-1 font-black text-[9px] text-[#c9952a] text-center uppercase tracking-wider flex items-center justify-center">
                        <Clock className="w-3 h-3 mr-1" />
                        Time
                      </div>
                      {DAYS.map((day) => (
                        <div
                          key={day}
                          className="border-r border-b p-1 font-bold text-[10px] text-center uppercase tracking-wider flex flex-col justify-center items-center bg-gradient-to-b from-[#4e0a10] to-[#3d080c] text-white border-[#c9952a]/20 border-b-[#c9952a]/30"
                        >
                          <span className="font-extrabold tracking-widest">
                            {day}
                          </span>
                        </div>
                      ))}
                      {Array.from({ length: 24 }).map((_, slot) => (
                        <div key={`loading-row-${slot}`} className="contents">
                          {slot % 2 === 0 && (
                            <div
                              className="bg-slate-50/90 border-r border-b border-slate-200 text-[8px] font-bold text-slate-500 flex justify-center items-center px-1"
                              style={{ gridColumn: 1, gridRow: `${slot + 2} / span 2` }}
                            >
                              <span className="font-extrabold text-slate-600 whitespace-nowrap">
                                {slotToTimeStr(slot)}
                              </span>
                            </div>
                          )}
                          {DAYS.map((_, dayIndex) => (
                            <div
                              key={`loading-cell-${dayIndex}-${slot}`}
                              className="border-r border-b border-slate-200 bg-white/80"
                            />
                          ))}
                        </div>
                      ))}
                    </div>

                    <div className="absolute left-0 right-0 top-[48px] z-20 h-1 bg-slate-100">
                      <div
                        className="h-full bg-gradient-to-r from-[#4e0a10] via-[#7a121c] to-[#C9952A] transition-all duration-300"
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

                    <div className="absolute left-[74px] right-3 top-[58px] z-20 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 shadow-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Cpu className="w-4 h-4 text-[#4e0a10] shrink-0" />
                        <span className="text-xs font-extrabold text-slate-900">
                          {isGenerating ? "Generating schedule" : "Loading schedule settings"}
                        </span>
                        <span className="truncate text-[11px] font-semibold text-slate-600">
                          {!isGenerating
                            ? "Applying configuration before preview..."
                            : progressStep === "generating"
                            ? "Building candidate timetable..."
                            : progressStep === "constraints"
                              ? "Checking rooms, modes, and conflicts..."
                              : "Preparing final preview..."}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-amber-800">
                        {!isGenerating
                          ? "Preparing"
                          : progressStep === "generating"
                          ? "Step 1/3"
                          : progressStep === "constraints"
                            ? "Step 2/3"
                            : "Step 3/3"}
                      </span>
                    </div>
                  </div>
                ) : previewSchedules.length === 0 ? (
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
                  <div
                    className={`h-full border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white relative select-none ${splitValidating ? "opacity-70" : ""}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "62px repeat(7, minmax(0, 1fr))",
                      gridTemplateRows: `${GRID_HEADER_HEIGHT_PX}px repeat(24, minmax(0, 1fr))`,
                    }}
                  >
                    <div
                      className="bg-gradient-to-b from-[#4e0a10] to-[#3d080c] border-r border-b border-[#c9952a]/30 p-1 font-black text-[9px] text-[#c9952a] text-center uppercase tracking-wider select-none flex items-center justify-center"
                      style={{ gridColumn: 1, gridRow: 1 }}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Time
                    </div>

                    {DAYS.map((day, dayIndex) => (
                      <div
                        key={day}
                        className="border-r border-b p-1 font-bold text-[10px] text-center uppercase tracking-wider select-none flex flex-col justify-center items-center bg-gradient-to-b from-[#4e0a10] to-[#3d080c] text-white border-[#c9952a]/20 border-b-[#c9952a]/30"
                        style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                      >
                        <span className="font-extrabold tracking-widest">
                          {day}
                        </span>
                        <span className="text-[8px] text-[#c9952a] font-extrabold mt-0.5 bg-[#c9952a]/15 border border-[#c9952a]/30 px-1.5 py-0.5 rounded-full">
                          {previewGridSessions.filter((s) => s.dayIndex === dayIndex).length}
                        </span>
                      </div>
                    ))}

                    {Array.from({ length: 24 }).map((_, slot) => (
                      <div key={`preview-row-${slot}`} className="contents">
                        {slot % 2 === 0 && (
                          <div
                            className="bg-slate-50/90 border-r border-b border-slate-200 text-[8px] font-bold text-slate-500 flex justify-center items-center select-none px-1"
                            style={{
                              gridColumn: 1,
                              gridRow: `${slot + 2} / span 2`,
                            }}
                          >
                            <span className="font-extrabold text-slate-600 whitespace-nowrap">
                              {slotToTimeStr(slot)}
                            </span>
                          </div>
                        )}

                        {DAYS.map((_, dayIndex) => (
                          <div
                            key={`preview-cell-${dayIndex}-${slot}`}
                            className="border-r border-b border-slate-200 bg-white"
                            style={{ gridColumn: dayIndex + 2, gridRow: slot + 2 }}
                          />
                        ))}
                      </div>
                    ))}

                    {previewGridSessions.map((session) => {
                      const inferredMeetingType = session.meetingType
                        ?? (Number(session.labHours ?? 0) > 0 ? "laboratory" : "lecture");
                      const isLab = inferredMeetingType === "laboratory";
                      const isLecture = inferredMeetingType === "lecture";
                      const isOnline = session.mode === "online";
                      const isCompact = session.durationSlots <= 2;
                      const sessionModeLabel = session.mode === "on-site"
                        ? isLab
                          ? "On-Site LAB"
                          : isLecture
                            ? "On-Site LEC"
                            : "On-Site"
                        : isOnline
                          ? isLab
                            ? "Online LAB"
                            : isLecture
                              ? "Online LEC"
                              : "Online"
                          : "Field";
                      return (
                        <div
                          key={`${session.id}-${session.dayIndex}-${session.startSlot}-${session.meetingType ?? "class"}`}
                          className={`z-10 m-0.5 rounded-lg border-2 border-l-4 box-border overflow-hidden px-2 py-1 shadow-sm ${
                            session.isMajor
                              ? "bg-rose-50/95 border-rose-100/80 border-l-[#4e0a10]"
                              : "bg-amber-50/95 border-amber-100/80 border-l-[#c9952a]"
                          }`}
                          style={{
                            gridColumn: session.dayIndex + 2,
                            gridRow: `${session.startSlot + 2} / span ${session.durationSlots}`,
                          }}
                          title={`${session.code} ${session.name}`}
                        >
                          <div className="flex h-full min-w-0 flex-col justify-between">
                            <div className="flex items-start justify-between gap-1 min-w-0">
                              <span
                                className={`min-w-0 flex-1 break-words whitespace-normal text-[10px] font-black uppercase tracking-tight leading-tight ${
                                  session.isMajor ? "text-[#4e0a10]" : "text-amber-900"
                                }`}
                              >
                                {session.code}
                              </span>
                              <span
                                className={`max-w-[58%] rounded px-1 py-0.5 text-right text-[7px] font-bold uppercase break-words whitespace-normal leading-tight ${
                                  isLab
                                    ? "bg-amber-100 text-amber-800"
                                    : isOnline
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-blue-50 text-blue-700"
                                }`}
                              >
                                {sessionModeLabel}
                              </span>
                            </div>
                            {!isCompact && (
                              <div className="break-words whitespace-normal text-[9px] font-semibold text-slate-600 leading-tight">
                                {session.room}
                              </div>
                            )}
                            <div className="break-words whitespace-normal text-[8.5px] font-medium text-slate-500 leading-tight">
                              {formatTimeDisplay(session.start_time)}-{formatTimeDisplay(session.end_time)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="hidden">
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
                  {isGenerating
                    ? "Generating schedule preview..."
                    : isApplying
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
          </div>
        )}
      </div>
    </div>
  );
}
