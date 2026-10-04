import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  DEPARTMENT_WITHDRAWABLE_STATUSES,
  DAYS,
  getSubjectClassification,
  isDepartmentSectionWithdrawable,
  slotToTimeStr
} from "../constants";
import type {
  ApiScheduleRecord,
  ApiViolation,
  ConflictInfo,
  DeliveryMode,
  Department,
  DepartmentSectionProgress,
  DropContext,
  Faculty,
  FacultyAssignmentPopupState,
  Room,
  ScheduleItem,
  Section,
  SectionDoneCandidate,
  Subject,
  Semester,
  UserSummary,
  WithdrawalStage
} from "../types";
import { DEAN_REQUIRED_MESSAGE } from "../../../../hooks/useDepartmentScheduleStatus";
import { getCourseSlotPlan, laboratoryComponentSlots, type LaboratoryDurationSettings } from "../courseSlotPlan";
import { buildSectionClearCandidates } from "../sectionClearCandidates";
import { buildSectionFinalizeCandidates, buildSectionReassignCandidates } from "../sectionFinalizeCandidates";
import { getSubjectTotalSlots } from "../types";
import { isMajorSubject, majorTeachingDepartmentId } from "../facultyEligibility";

import type { SubjectClassification } from "../constants";
import type { InitialDataResponse, SchedulerCacheData } from "./initialDataMapper";
import {
  generatedScheduleSectionId,
  hasUsableSchedulerCache,
  mapApiCourse,
  mapApiFaculty,
  mapApiScheduleToItem,
  mapApiSections,
  mapInitialData,
  slotToTime24h
} from "./initialDataMapper";
import { buildPlacementSessionKey } from "./placementSession";

const scheduleSignature = (items: ScheduleItem[]): string =>
  items
    .map((item) =>
      [
        item.id, item.dayIndex, item.startSlot, item.durationSlots,
        item.roomId, item.sectionId, item.courseId || item.subjectId,
        item.facultyId ?? "", item.status, item.mode,
      ].join("|"),
    )
    .sort()
    .join("~");

import { isCustomDayPattern, relocatedPairPattern, requiredRoomTypeForMeeting, useConflict } from "./useConflict";
import { useDragDrop } from "./useDragDrop";
import { useToast } from "../../../../context/ToastContext";
import api from "../../../../lib/api";
import { fetchConflicts, fetchResolvedConflicts, resolvedScheduleIds } from "../../../../lib/conflicts";
import { getCachedData, loadCachedData, patchCachedData, setCachedData, clearCachedKey } from "../../../../lib/dataCache";
import { useLiveRefresh } from "../../../../hooks/useLiveRefresh";
import { invalidateCacheGroups } from "../../../../lib/cacheGroups";
import { roomGrantFits } from "../../../../lib/roomRequests";
import { configureLabRoomType, roomTypeSatisfies } from "../../../../lib/labRoomPolicy";
import { getStoredUser, hasStoredCapability } from "../../../../lib/storedUser";
import { overloadConfirmationFrom, type OverloadConfirmation } from "../../../../lib/overloadConfirmation";
import { OVERRIDE_CONFLICTS_FLAG, conflictOverrideFrom, conflictOverridePrompt, type ConflictOverrideQuestion } from "../../../../lib/conflictOverride";
import { buildPreferredPattern, consecutiveDayCount, fixedSplitPatternForDays, FULL_DAY_NAMES, parsePreferredPattern, slotCount } from "../../../../lib/timeGrid";
import { isHybridSplitEligible, savedMeetingPairShape } from "../schedulingConfigurationEligibility";
import { resolveManualOperationStatus } from "../manualScheduleOperation";
import {
  consecutiveDayRuns,
  consecutivePattern,
  consecutivePlacementFor,
  runStartForDay,
  runStartingOn,
  type ConsecutiveDayRule,
  type ConsecutivePlacement,
} from "../GenerateSchedule/courseClassConfig";

const isNotFoundError = (err: unknown): boolean => {
  return (
    err !== null &&
    typeof err === "object" &&
    "response" in err &&
    (err as { response?: { status?: number } }).response?.status === 404
  );
};

const getNextMeetingDayIndex = (dayIndex: number): number => (dayIndex + 1) % DAYS.length;

const meetsAtOneTime = (subject: { labHours?: number | string | null }): boolean =>
  Number(subject.labHours ?? 0) === 0;

const ROOM_TBA = "tba";

const relocatedRows = (data: ApiScheduleRecord & { moved_partners?: ApiScheduleRecord[] }): ScheduleItem[] => [
  mapApiScheduleToItem(data),
  ...(data.moved_partners ?? []).map(mapApiScheduleToItem),
];

const SCHEDULER_SCHEDULE_LIMIT = 2000;
const SCHEDULER_INITIAL_DATA_PARAMS = { schedule_limit: SCHEDULER_SCHEDULE_LIMIT };

export interface ManualSchedulingSettings extends LaboratoryDurationSettings {
  lecture_lab_schedule_override_enabled?: boolean;
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
  forced_day_rules?: Array<{ course_id: number; day: string }>;
  consecutive_day_rules?: ConsecutiveDayRule[];
  field_course_codes?: string[];
  sunday_classes_enabled?: boolean;
}

const sortSplitMeetingsForEdit = (
  items: ScheduleItem[],
  subject?: Subject | null,
  laboratoryFirst = false,
  laboratorySettings: LaboratoryDurationSettings | null = null,
): ScheduleItem[] => {
  const lectureSlots = getCourseSlotPlan(subject).lectureSlots;
  const labSlots = Number(subject?.labHours ?? 0) > 0 ? laboratoryComponentSlots(subject, laboratorySettings) : 0;
  const meetingRank = (item: ScheduleItem): number => {
    if (item.meetingType === "laboratory") return laboratoryFirst ? 0 : 1;
    if (item.meetingType === "lecture") return laboratoryFirst ? 1 : 0;
    if (labSlots > 0 && item.durationSlots === labSlots) return laboratoryFirst ? 0 : 1;
    if (lectureSlots > 0 && item.durationSlots === lectureSlots) return laboratoryFirst ? 1 : 0;
    return 2;
  };

  return [...items].sort((a, b) =>
    meetingRank(a) - meetingRank(b)
    || a.dayIndex - b.dayIndex
    || a.startSlot - b.startSlot
  );
};

const departmentPlottingStatuses: ScheduleItem["status"][] = [
  "draft",
  "revision",
  "completed"
];

const departmentReadyStatuses: ScheduleItem["status"][] = [
  ...departmentPlottingStatuses,
  "submitted",
  "approved_by_dean",
  "approved",
  "faculty_assignment",
  "reassignment",
  "finalized"
];

const departmentSubmittedStatuses: ScheduleItem["status"][] = [
  "submitted",
  "approved_by_dean",
  "approved",
  "faculty_assignment",
  "reassignment",
  "finalized"
];

const departmentWithdrawableStatuses = DEPARTMENT_WITHDRAWABLE_STATUSES;

const departmentProtectedStatuses: ScheduleItem["status"][] = [
  "submitted",
  "approved_by_dean",
  "conditionally_approved",
  "approved",
  "faculty_assignment",
  "reassignment",
  "finalized"
];

const deriveSectionProgressStatus = (items: ScheduleItem[]): ScheduleItem["status"] => {
  const statuses = new Set(items.map((item) => item.status));
  if (statuses.has("reassignment")) return "reassignment";
  if (statuses.has("finalized")) return "finalized";

  const conservativeOrder: ScheduleItem["status"][] = [
    "revision",
    "rejected_by_dean",
    "rejected",
    "draft",
    "completed",
    "submitted",
    "approved_by_dean",
    "conditionally_approved",
    "approved",
    "faculty_assignment",
    "reassignment"
  ];
  return conservativeOrder.find((status) => statuses.has(status)) ?? "draft";
};


interface AtomicScheduleResponse {
  schedules: ApiScheduleRecord[];
  deleted_schedule_ids: number[];
  resolved_conflicts?: { id: string; message: string }[];
}

interface FacultyAssignResponse extends Partial<ApiScheduleRecord> {
  schedule?: ApiScheduleRecord;
  schedules?: ApiScheduleRecord[];
}


interface TargetScheduleDay {
  day: string;
  startSlot: number;
  duration: number;
}


const getApiViolations = (error: unknown): ApiViolation[] => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (error as { response?: { data?: { violations?: unknown } } }).response;
    return Array.isArray(response?.data?.violations)
      ? response.data.violations.filter((violation): violation is ApiViolation => (
          typeof violation === "object" && violation !== null
        ))
      : [];
  }

  return [];
};

const getApiErrorMessage = (error: unknown): string | null => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (error as { response?: { data?: { message?: unknown; violations?: unknown } } }).response;
    if (Array.isArray(response?.data?.violations)) {
      const messages = response.data.violations
        .map((violation) => (
          typeof violation === "object" && violation !== null && "message" in violation
            ? (violation as { message?: unknown }).message
            : null
        ))
        .filter((message): message is string => typeof message === "string" && message.trim() !== "");
      if (messages.length > 0) {
        return messages.join(" ");
      }
    }

    return typeof response?.data?.message === "string" ? response.data.message : null;
  }

  return null;
};

export const useScheduler = () => {
  const { toast, confirm } = useToast();
  const user = getStoredUser();
  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const canUpdateSchedule = hasStoredCapability('schedule.update');
  const canGenerateSchedule = hasStoredCapability('schedule.generate');
  const canSubmitSchedule = hasStoredCapability('schedule.submit');
  const canWithdrawSubmission = hasStoredCapability('schedule.withdraw');
  const canAssignInstructor = hasStoredCapability('schedule.assign_instructor');
  const schedulerCacheKey = `scheduler:v18:${user?.role ?? 'user'}:${user?.id ?? user?.department_id ?? 'current'}:${user?.program_id ?? 'all'}`;
  const cachedSchedulerData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
  const canUseInitialCache = hasUsableSchedulerCache(cachedSchedulerData);
  const [rooms, setRooms] = useState<Room[]>(canUseInitialCache ? cachedSchedulerData.rooms : []);
  const [sections, setSections] = useState<Section[]>(canUseInitialCache ? cachedSchedulerData.sections : []);
  const [subjects, setSubjects] = useState<Subject[]>(canUseInitialCache ? cachedSchedulerData.subjects : []);
  const [faculties, setFaculties] = useState<Faculty[]>(canUseInitialCache ? cachedSchedulerData.faculties : []);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(canUseInitialCache ? cachedSchedulerData.activeSemester : null);
  const [departments, setDepartments] = useState<Department[]>(canUseInitialCache ? cachedSchedulerData.departments : []);
  const [schedulingReady, setSchedulingReady] = useState(canUseInitialCache ? cachedSchedulerData.schedulingReady !== false : true);
  const [canEditProgramIds, setCanEditProgramIds] = useState<number[] | null>(canUseInitialCache ? cachedSchedulerData.canEditProgramIds ?? null : null);
  const ownsProgram = useCallback(
    (programId: number | null | undefined) => canEditProgramIds === null
      || (programId != null && canEditProgramIds.includes(Number(programId))),
    [canEditProgramIds],
  );
  const [hasDean, setHasDean] = useState(canUseInitialCache ? cachedSchedulerData.hasDean !== false : true);
  const [users, setUsers] = useState<UserSummary[]>(canUseInitialCache ? cachedSchedulerData.users : []);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(canUseInitialCache ? cachedSchedulerData.schedules : []);
  const [schedulesTruncated, setSchedulesTruncated] = useState<boolean>(
    canUseInitialCache ? cachedSchedulerData.schedulesTruncated === true : false
  );
  const [fieldCourseAssignmentEnabled, setFieldCourseAssignmentEnabled] = useState<boolean>(
    canUseInitialCache ? cachedSchedulerData.fieldCourseAssignmentEnabled : false
  );
  const [fieldCourseCodes, setFieldCourseCodes] = useState<string[]>(
    canUseInitialCache ? cachedSchedulerData.fieldCourseCodes : []
  );
  const [isLoading, setIsLoading] = useState(!canUseInitialCache);
  const [isEditingSection, setIsEditingSection] = useState(false);

  const [isResubmittingSection, setIsResubmittingSection] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFinalizeSectionsModalOpen, setIsFinalizeSectionsModalOpen] = useState(false);
  const [isReassignSectionsModalOpen, setIsReassignSectionsModalOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => {
    return canUseInitialCache && cachedSchedulerData?.sections?.length
      ? cachedSchedulerData.sections[0].id
      : "";
  });

  const [isWideView, setIsWideView] = useState<boolean>(() => {
    const saved = localStorage.getItem("timetable_wide_view");
    return saved === null ? true : saved === "true";
  });

  const handleToggleWideView = useCallback(() => {
    setIsWideView((prev) => {
      const next = !prev;
      localStorage.setItem("timetable_wide_view", String(next));
      return next;
    });
  }, []);

  const schedulesRef = useRef<ScheduleItem[]>([]);
  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const signal = controller.signal;
    const cachedData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
    const canUseCachedData = hasUsableSchedulerCache(cachedData);

    if (canUseCachedData) {
      setRooms(cachedData.rooms);
      setSubjects(cachedData.subjects);
      setFaculties(cachedData.faculties);
      setActiveSemester(cachedData.activeSemester);
      setDepartments(cachedData.departments);
      setSchedulingReady(cachedData.schedulingReady !== false);
      setCanEditProgramIds(cachedData.canEditProgramIds ?? null);
      setHasDean(cachedData.hasDean !== false);
      setUsers(cachedData.users);
      setSections(cachedData.sections);
      setSchedules(cachedData.schedules);
      setFieldCourseAssignmentEnabled(cachedData.fieldCourseAssignmentEnabled);
      setFieldCourseCodes(cachedData.fieldCourseCodes);
      if (!selectedSectionId && cachedData.sections.length > 0) {
        setSelectedSectionId(cachedData.sections[0].id);
      }
      setIsLoading(false);
    } else if (subjects.length === 0) {
      setIsLoading(true);
    }

    loadCachedData<SchedulerCacheData>(schedulerCacheKey, async () => {
      const response = await api.get<InitialDataResponse>('/initial-data', { signal, params: SCHEDULER_INITIAL_DATA_PARAMS });
      return mapInitialData(response.data, { isVpaa, userDepartmentId: user?.department_id });
    }, !canUseCachedData)
      .then((data) => {
        if (!active || (canUseCachedData && data === cachedData)) return;

        setRooms(data.rooms);
        setSubjects(data.subjects);
        setFaculties(data.faculties);
        setActiveSemester(data.activeSemester);
        setDepartments(data.departments);
        setSchedulingReady(data.schedulingReady);
        setCanEditProgramIds(data.canEditProgramIds ?? null);
        setHasDean(data.hasDean);
        setUsers(data.users);
        setSections(data.sections);
        if (!canUseCachedData || schedulesRef.current === cachedData.schedules) {
          setSchedules(data.schedules);
          setSchedulesTruncated(data.schedulesTruncated === true);
        }
        setFieldCourseAssignmentEnabled(data.fieldCourseAssignmentEnabled);
        setFieldCourseCodes(data.fieldCourseCodes);
        setSelectedSectionId((prev) => (prev && data.sections.some((sec) => sec.id === prev) ? prev : (data.sections[0]?.id ?? "")));
      })
      .catch(() => {
        if (active && !signal.aborted && !canUseCachedData) {
          toast.error("Load Failed", "Could not load scheduler data from the database.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isVpaa, schedulerCacheKey, user?.department_id, toast]);




  const truncationWarnedRef = useRef(false);
  useEffect(() => {
    if (!schedulesTruncated) {
      truncationWarnedRef.current = false;
      return;
    }
    if (truncationWarnedRef.current) return;
    truncationWarnedRef.current = true;
    toast.warning(
      "Timetable Partly Loaded",
      `This semester has more than ${SCHEDULER_SCHEDULE_LIMIT.toLocaleString()} class meetings, so only the most recent `
        + `${SCHEDULER_SCHEDULE_LIMIT.toLocaleString()} are shown. Older classes are missing from the grid and from conflict `
        + "checks here; the server still checks every save against all of them.",
    );
  }, [schedulesTruncated, toast]);

  const [dragSubjectId, setDragSubjectId] = useState<string | null>(null);
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [dragFromCell, setDragFromCell] = useState<string | null>(null);
  const [deleteConfirmScheduleId, setDeleteConfirmScheduleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [subjectClassFilter, setSubjectClassFilter] = useState<SubjectClassification>("all");
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const [placementSubjectId, setPlacementSubjectId] = useState<string | null>(null);
  const [movingScheduleId, setMovingScheduleId] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length === 0) return;
    if (!selectedSectionId || !sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(sections[0].id);
    }
  }, [sections, selectedSectionId]);


  const isSummerWeekendBlocked = useCallback(
    (dayIndex: number) => activeSemester?.semester === "summer" && dayIndex >= 5,
    [activeSemester?.semester],
  );

  const refreshSchedules = useCallback(async () => {
    try {
      const res = await api.get<Pick<InitialDataResponse, "schedules" | "schedules_truncated">>('/initial-data', {
        params: { ...SCHEDULER_INITIAL_DATA_PARAMS, include: 'schedules' },
      });
      if (!Array.isArray(res.data.schedules)) return;
      setSchedulesTruncated(res.data.schedules_truncated === true);
      let apiData = res.data.schedules;
      if (activeSemester) {
        apiData = apiData.filter((item) => Number(item.semester_id) === Number(activeSemester.id));
      }
      const mapped = apiData.map(mapApiScheduleToItem);
      const signature = scheduleSignature(mapped);
      if (signature === scheduleSignature(schedulesRef.current)) return;
      setSchedules(mapped);
      patchCachedData<SchedulerCacheData>(schedulerCacheKey, { schedules: mapped, schedulesTruncated: res.data.schedules_truncated === true });
    } catch {
      toast.error("Timetable Not Refreshed", "The timetable could not be refreshed. What you see may be out of date; reload to try again.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSemester, schedulerCacheKey]);

  const handleAcceptedRecommendation = useCallback(
    async (newSchedules?: ApiScheduleRecord[]) => {
      if (newSchedules && newSchedules.length > 0) {
        const mapped = newSchedules.map(mapApiScheduleToItem);
        const replacedCourseIds = new Set(mapped.map((s) => s.courseId || s.subjectId).filter(Boolean));
        const targetSectionIds = new Set(mapped.map((s) => s.sectionId).filter(Boolean));
        const savedScheduleIds = new Set(mapped.map((s) => s.id).filter(Boolean));

        setSchedules((prev) => {
          const filtered = prev.filter(
            (item) => {
              if (savedScheduleIds.has(item.id)) return false;
              const itemCourseId = item.courseId || item.subjectId || "";
              return !(targetSectionIds.has(item.sectionId) && replacedCourseIds.has(itemCourseId));
            }
          );
          const updated = [...filtered, ...mapped];
          patchCachedData<SchedulerCacheData>(schedulerCacheKey, { schedules: updated });
          return updated;
        });
        setSelectedSectionId((currentSectionId) =>
          generatedScheduleSectionId(currentSectionId, mapped)
        );
      }
      await refreshSchedules();
    },
    [refreshSchedules, schedulerCacheKey]
  );

  const refreshData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      clearCachedKey(schedulerCacheKey);
      const response = await api.get<InitialDataResponse>('/initial-data', { params: SCHEDULER_INITIAL_DATA_PARAMS });
      const freshData = mapInitialData(response.data, { isVpaa, userDepartmentId: user?.department_id });

      setCachedData<SchedulerCacheData>(schedulerCacheKey, freshData);
      setRooms(freshData.rooms);
      setSubjects(freshData.subjects);
      setFaculties(freshData.faculties);
      setActiveSemester(freshData.activeSemester);
      setDepartments(freshData.departments);
      setUsers(freshData.users);
      setFieldCourseAssignmentEnabled(freshData.fieldCourseAssignmentEnabled);
      setFieldCourseCodes(freshData.fieldCourseCodes);
      setSections(freshData.sections);
      setSchedules(freshData.schedules);
      setSchedulesTruncated(freshData.schedulesTruncated === true);
      if (!silent) toast.success("Synchronized", "Successfully loaded fresh sections and schedules from database.");
    } catch {
      toast.error("Synchronize Failed", "Could not load fresh data from database.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVpaa, schedulerCacheKey, user?.department_id]);

  const refreshFaculties = useCallback(async () => {
    try {
      const response = await api.get<Pick<InitialDataResponse, "faculties">>('/initial-data', { params: { include: 'faculties' } });
      if (!Array.isArray(response.data.faculties)) return;
      const fresh = response.data.faculties.map(mapApiFaculty);
      setFaculties(fresh);
      patchCachedData<SchedulerCacheData>(schedulerCacheKey, { faculties: fresh });
    } catch {
    }
  }, [schedulerCacheKey]);

  const refreshSections = useCallback(async () => {
    try {
      const response = await api.get<Pick<InitialDataResponse, "sections" | "active_semester">>('/initial-data', { params: { include: 'sections' } });
      if (!Array.isArray(response.data.sections)) return;
      const fresh = mapApiSections(response.data.sections, response.data.active_semester ?? null);
      setSections(fresh);
      patchCachedData<SchedulerCacheData>(schedulerCacheKey, { sections: fresh });
    } catch {
    }
  }, [schedulerCacheKey]);

  const refreshSubjects = useCallback(async () => {
    try {
      const response = await api.get<Pick<InitialDataResponse, "courses">>('/initial-data', { params: { include: 'courses' } });
      if (!Array.isArray(response.data.courses)) return;
      const fresh = response.data.courses.map(mapApiCourse);
      setSubjects(fresh);
      patchCachedData<SchedulerCacheData>(schedulerCacheKey, { subjects: fresh });
    } catch {
    }
  }, [schedulerCacheKey]);

  useLiveRefresh(["schedules", "approvals"], () => { void refreshSchedules(); });
  useLiveRefresh(["faculty", "assignments"], () => { void refreshFaculties(); });
  useLiveRefresh(["courses", "assignments"], () => { void refreshSubjects(); });
  useLiveRefresh(["sections"], () => { void refreshSections(); });

  const applyUpdatedSchedules = useCallback((updatedSchedules: ScheduleItem[]) => {
    const updatedScheduleMap = new Map(updatedSchedules.map((schedule) => [schedule.id, schedule]));
    const instructorChanged = updatedSchedules.some((schedule) => {
      const previous = schedulesRef.current.find((item) => item.id === schedule.id);
      return (previous?.facultyId ?? null) !== (schedule.facultyId ?? null);
    });
    if (instructorChanged) void refreshFaculties();
    setSchedules((previousSchedules) => {
      const nextSchedules = previousSchedules.map((schedule) =>
        updatedScheduleMap.get(schedule.id) ?? schedule
      );
      patchCachedData<SchedulerCacheData>(schedulerCacheKey, { schedules: nextSchedules });
      return nextSchedules;
    });
  }, [refreshFaculties, schedulerCacheKey]);

  const isInitialLoadedRef = useRef(false);

  useEffect(() => {
    if (activeSemester) {
      if (isInitialLoadedRef.current) {
        refreshSchedules();
      } else {
        isInitialLoadedRef.current = true;
      }
    }
  }, [activeSemester, refreshSchedules]);

  const [dropContext, setDropContext] = useState<DropContext | null>(null);
  const [modalRoomId, setModalRoomId] = useState<string>("");
  const [modalClassMode, setModalClassMode] = useState<DeliveryMode>("on-site");
  const [modalDay2RoomId, setModalDay2RoomId] = useState<string>("");
  const [modalDay2ClassMode, setModalDay2ClassMode] = useState<DeliveryMode>("on-site");
  const [modalIsHybrid, setModalIsHybrid] = useState<boolean>(false);
  const [modalSplitEnabled, setModalSplitEnabled] = useState<boolean>(false);
  const [modalConsecutiveDays, setModalConsecutiveDays] = useState<number | null>(null);
  const [modalFieldEnabled, setModalFieldEnabled] = useState<boolean>(false);
  const [modalForceDayEnabled, setModalForceDayEnabled] = useState<boolean>(false);
  const [modalForcedDayIndex, setModalForcedDayIndex] = useState<number>(0);
  const [modalPreferredPattern, setModalPreferredPattern] = useState<string | null>(null);
  const [modalDay1Index, setModalDay1Index] = useState<number>(0);
  const [modalDay2Index, setModalDay2Index] = useState<number>(2);
  const [modalDay1StartSlot, setModalDay1StartSlot] = useState<number>(0);
  const [modalDay1Duration, setModalDay1Duration] = useState<number>(0);
  const [modalDay2StartSlot, setModalDay2StartSlot] = useState<number>(0);
  const [modalDay2Duration, setModalDay2Duration] = useState<number>(0);
  const [isDay2ModifiedByUser, setIsDay2ModifiedByUser] = useState<boolean>(false);
  const [modalValidationError, setModalValidationError] = useState<string>("");
  const [manualSchedulingSettings, setManualSchedulingSettings] = useState<ManualSchedulingSettings | null>(null);
  const [schedulingSettingsVersion, setSchedulingSettingsVersion] = useState(0);
  const reloadSchedulingSettings = useCallback(() => setSchedulingSettingsVersion((v) => v + 1), []);

  useEffect(() => {
    if (!selectedSectionId) return;

    let active = true;
    api.get<ManualSchedulingSettings>("/scheduling-settings", {
      params: { section_id: Number(selectedSectionId) },
    }).then((response) => {
      if (active) setManualSchedulingSettings(response.data);
    }).catch(() => {
      if (active) setManualSchedulingSettings(null);
    });

    return () => {
      active = false;
    };
  }, [selectedSectionId, schedulingSettingsVersion]);

  useEffect(() => {
    configureLabRoomType(manualSchedulingSettings?.lab_room_type);
  }, [manualSchedulingSettings]);

  const [facultyAssignmentPopup, setFacultyAssignmentPopup] = useState<FacultyAssignmentPopupState | null>(null);
  const [facultyActionSlotId, setFacultyActionSlotId] = useState<string | null>(null);
  const [isClearingSectionInstructors, setIsClearingSectionInstructors] = useState(false);
  const [popupValidationError, setPopupValidationError] = useState<string>("");
  const [popupConflictWarning, setPopupConflictWarning] = useState<string>("");
  const [overloadPrompt, setOverloadPrompt] = useState<{
    confirmation: OverloadConfirmation;
    resolve: (proceed: boolean) => void;
  } | null>(null);

  const [isSectionDropdownOpen, setIsSectionDropdownOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isSubmitApprovalModalOpen, setIsSubmitApprovalModalOpen] = useState(false);
  const [isWithdrawSubmissionModalOpen, setIsWithdrawSubmissionModalOpen] = useState(false);
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const [isWithdrawingSubmission, setIsWithdrawingSubmission] = useState(false);
  const [isRoomViewOpen, setIsRoomViewOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [roomViewRoomId, setRoomViewRoomId] = useState<string>("");

  useEffect(() => {
    if (rooms.length > 0 && !roomViewRoomId) {
      setRoomViewRoomId(rooms[0].id);
    }
  }, [rooms, roomViewRoomId]);
  const [isAssignedListCollapsed, setIsAssignedListCollapsed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const sectionSchedules = useMemo(
    () => schedules.filter((s) => s.sectionId === selectedSectionId),
    [schedules, selectedSectionId]
  );

  const currentStatus: ScheduleItem["status"] = useMemo(() => {
    return sectionSchedules.length > 0 ? sectionSchedules[0].status : "draft";
  }, [sectionSchedules]);

  const helperStatusContextRef = useRef<{ sectionId: string; status: ScheduleItem["status"] } | null>(null);

  useEffect(() => {
    const previousContext = helperStatusContextRef.current;
    helperStatusContextRef.current = { sectionId: selectedSectionId, status: currentStatus };

    if (previousContext && previousContext.sectionId !== selectedSectionId) return;

    const outcomeText: Record<string, string> = {
      approved: "The VPAA approved the submitted schedule.",
      approved_by_dean: "The Dean approved the submitted schedule. It now waits for the VPAA.",
      rejected_by_dean: "The Dean returned the submitted schedule for revision.",
      rejected: "The VPAA returned the submitted schedule for revision.",
      revision: "The submitted schedule was recalled for revision.",
    };
    const text = outcomeText[currentStatus];
    if (text) {
      window.dispatchEvent(
        new CustomEvent("show-helper-buddy", {
          detail: {
            id: crypto.randomUUID(),
            type: currentStatus === "approved" || currentStatus === "approved_by_dean" ? "approved" : "rejected",
            status: currentStatus,
            text,
          },
        })
      );
    }
  }, [currentStatus, selectedSectionId]);

  const triggerConflictReminder = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("show-helper-buddy", {
        detail: {
          id: crypto.randomUUID(),
          type: "conflict",
          text: "There's a conflict. Here are some recommended approaches...",
        },
      })
    );
  }, []);

  const isPhase2Active = ["approved", "faculty_assignment", "reassignment", "finalized"].includes(currentStatus);
  const ownsSelectedProgram = ownsProgram(sections.find((section) => section.id === selectedSectionId)?.programId);
  const isEditable = canUpdateSchedule && ownsSelectedProgram && departmentPlottingStatuses.includes(currentStatus);
  const isPhase2Completed = currentStatus === "finalized";
  const facultyAssignmentDone = sectionSchedules.length > 0 && sectionSchedules.every((schedule) => schedule.facultyAssignmentDone);

  const scheduledSubjectIds = useMemo<Set<string>>(
    () => new Set(sectionSchedules.map((s) => s.courseId ?? s.subjectId ?? "").filter((id): id is string => Boolean(id))),
    [sectionSchedules]
  );

  const groupedSections = useMemo(() => {
    const groups: Record<number, Section[]> = {};
    sections.forEach((sec) => {
      if (!groups[sec.yearLevel]) {
        groups[sec.yearLevel] = [];
      }
      groups[sec.yearLevel].push(sec);
    });
    return Object.keys(groups)
      .map((ylStr) => Number(ylStr))
      .sort((a, b) => a - b)
      .map((yl) => ({
        yearLevel: yl,
        sections: groups[yl].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [sections]);
  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId),
    [sections, selectedSectionId]
  );

  const normalizeSemester = useCallback((sem?: string | null): string => {
    if (!sem) return "";
    const s = String(sem).toLowerCase().trim();
    if (s === "1" || s === "1st" || s.includes("first") || s.includes("1st")) return "1st";
    if (s === "2" || s === "2nd" || s.includes("second") || s.includes("2nd")) return "2nd";
    if (s.includes("summer")) return "summer";
    return s;
  }, []);

  const coursesForSection = useCallback((section: Section) => {
    const sectionSemester = normalizeSemester(section.semester);
    return subjects.filter((s) => {
      const isMinor = s.category === "minor";
      const matchesDept =
        isMinor ||
        s.departmentId === null ||
        Number(s.departmentId) === Number(section.departmentId);
      const matchesProgram =
        isMinor ||
        s.programId == null ||
        section.programId == null ||
        Number(s.programId) === Number(section.programId);
      const matchesYear = Number(s.yearLevel) === Number(section.yearLevel);
      const matchesSem =
        !sectionSemester ||
        !s.semester ||
        normalizeSemester(s.semester) === sectionSemester;
      return matchesDept && matchesProgram && matchesYear && matchesSem;
    });
  }, [subjects, normalizeSemester]);

  const sectionCourses = useMemo(
    () => (selectedSection ? coursesForSection(selectedSection) : subjects),
    [selectedSection, coursesForSection, subjects]
  );

  const semesterSubjects = useMemo(() => {
    if (subjects.length === 0) return [];
    if (!activeSemester?.semester) return subjects;
    const activeSem = normalizeSemester(activeSemester.semester);
    return subjects.filter((s) => {
      if (!s.semester) return true;
      const subSem = normalizeSemester(s.semester);
      return subSem === activeSem;
    });
  }, [subjects, activeSemester, normalizeSemester]);

  const totalSubjects = useMemo(() => {
    if (!selectedSection) return semesterSubjects.length;
    return sectionCourses.length;
  }, [semesterSubjects, selectedSection, sectionCourses]);

  const totalScheduled = useMemo(
    () => new Set(sectionSchedules.map((s) => s.subjectId)).size,
    [sectionSchedules]
  );
  const isPhase1Completed = ["submitted", "approved_by_dean", "conditionally_approved", "approved", "faculty_assignment", "reassignment", "finalized"].includes(currentStatus)
    || (departmentPlottingStatuses.includes(currentStatus) && totalSubjects > 0 && totalScheduled >= totalSubjects);

  const totalSlotsCount = sectionSchedules.length;
  const assignedSlotsCount = useMemo(
    () => sectionSchedules.filter((s) => !!s.facultyId).length,
    [sectionSchedules]
  );
  const unassignedSlotsCount = totalSlotsCount - assignedSlotsCount;
  const selectedDepartmentId = selectedSection?.departmentId ?? user?.department_id ?? null;

  const departmentSectionProgress = useMemo<DepartmentSectionProgress[]>(() => {
    if (!selectedDepartmentId) return [];

    const schedulesBySection = new Map<string, ScheduleItem[]>();
    schedules.forEach((schedule) => {
      const sectionItems = schedulesBySection.get(schedule.sectionId) ?? [];
      sectionItems.push(schedule);
      schedulesBySection.set(schedule.sectionId, sectionItems);
    });

    return sections
      .filter((section) => Number(section.departmentId) === Number(selectedDepartmentId) && ownsProgram(section.programId))
      .sort((a, b) => a.yearLevel - b.yearLevel || a.name.localeCompare(b.name))
      .map((section) => {
        const sectionScheduleItems = schedulesBySection.get(section.id) ?? [];
        const requiredSubjects = coursesForSection(section).length;
        const plottedSubjects = new Set(sectionScheduleItems.map((schedule) => schedule.subjectId)).size;
        const status = sectionScheduleItems.length > 0
          ? deriveSectionProgressStatus(sectionScheduleItems)
          : "draft";
        const isFullyPlotted = requiredSubjects === 0 || plottedSubjects >= requiredSubjects;

        return {
          sectionId: section.id,
          sectionName: section.name,
          yearLevel: section.yearLevel,
          requiredCourses: requiredSubjects,
          requiredSubjects,
          plottedCourses: plottedSubjects,
          plottedSubjects,
          status,
          isDone: isFullyPlotted && departmentReadyStatuses.includes(status),
          isSelected: section.id === selectedSectionId,
          assignedInstructorBlocks: sectionScheduleItems.filter((schedule) => Boolean(schedule.facultyId)).length,
          facultyAssignmentDone: sectionScheduleItems.length > 0
            && sectionScheduleItems.every((schedule) => Boolean(schedule.facultyAssignmentDone))
        };
      });
  }, [schedules, sections, selectedDepartmentId, selectedSectionId, coursesForSection, ownsProgram]);

  const sectionFinalizeCandidates = useMemo<SectionDoneCandidate[]>(
    () => buildSectionFinalizeCandidates(departmentSectionProgress, schedules),
    [departmentSectionProgress, schedules]
  );

  const sectionReassignCandidates = useMemo<SectionDoneCandidate[]>(
    () => buildSectionReassignCandidates(departmentSectionProgress, schedules),
    [departmentSectionProgress, schedules]
  );

  const departmentTotalSections = departmentSectionProgress.length;
  const departmentDoneSections = departmentSectionProgress.filter((section) => section.isDone).length;
  const submissionReadySections = departmentSectionProgress.filter((section) =>
    departmentPlottingStatuses.includes(section.status)
  );
  const departmentRemainingSections = departmentSectionProgress.filter((section) =>
    !section.isDone && !departmentProtectedStatuses.includes(section.status)
  ).length;
  const departmentHasSubmittedSchedule = submissionReadySections.length === 0 && departmentSectionProgress.some((section) =>
    departmentSubmittedStatuses.includes(section.status)
  );
  const departmentHasWithdrawableSubmission = departmentSectionProgress.some((section) =>
    isDepartmentSectionWithdrawable(
      section.status,
      section.assignedInstructorBlocks,
      section.facultyAssignmentDone,
    )
  );
  const departmentWithdrawalStage: WithdrawalStage = departmentSectionProgress.some((section) =>
    section.status === "approved"
      || section.status === "faculty_assignment"
      || (section.status === "reassignment" && isDepartmentSectionWithdrawable(
        section.status,
        section.assignedInstructorBlocks,
        section.facultyAssignmentDone,
      ))
  )
    ? "vpaa_approved"
    : departmentSectionProgress.some((section) => section.status === "approved_by_dean")
      ? "vpaa_review"
      : "dean_review";
  const departmentReadyToSubmit =
    submissionReadySections.length > 0 &&
    departmentRemainingSections === 0;

  const dropSubject = dropContext
    ? subjects.find((s) => s.id === dropContext.subjectId) ?? null
    : null;

  const dropSubjectIsField = useMemo(() => {
    if (!dropSubject) return false;
    if (dropSubject.roomTypeRequired === "field") return true;
    if (!fieldCourseAssignmentEnabled) return false;
    const configuredCodes = new Set(fieldCourseCodes.map((code) => code.trim().toUpperCase()));
    return configuredCodes.has(dropSubject.code.trim().toUpperCase());
  }, [dropSubject, fieldCourseAssignmentEnabled, fieldCourseCodes]);

  const listCategories: Subject["category"][] = ["major", "minor"];

  const filteredSubjects = useMemo(() => {
    return semesterSubjects.filter((subject) => {
      if (selectedSection && subject.yearLevel !== selectedSection.yearLevel) {
        return false;
      }

      if (subjectClassFilter !== "all" && getSubjectClassification(subject.category) !== subjectClassFilter) {
        return false;
      }

      const semester = searchQuery.toLowerCase().trim();
      if (!semester) return true;
      return (
        subject.code.toLowerCase().includes(semester) ||
        subject.name.toLowerCase().includes(semester)
      );
    });
  }, [semesterSubjects, selectedSection, subjectClassFilter, searchQuery]);

  const effectiveFieldCourseCodes = useMemo(() => {
    if (!dropSubject) return fieldCourseCodes;
    const code = dropSubject.code.trim().toUpperCase();
    const others = fieldCourseCodes.filter((c) => c.trim().toUpperCase() !== code);
    return modalFieldEnabled ? [...others, dropSubject.code] : others;
  }, [dropSubject, modalFieldEnabled, fieldCourseCodes]);

  const { checkConflict, checkMoveConflict, checkFacultyConflict, getDragOverConflict, conflictedMap, resolvedIds } = useConflict({
    schedules,
    selectedSectionId,
    dragSubjectId,
    draggedScheduleId,
    rooms,
    sections,
    departments,
    subjects,
    faculties,
    fieldCourseAssignmentEnabled: fieldCourseAssignmentEnabled || effectiveFieldCourseCodes.length > 0,
    fieldCourseCodes: effectiveFieldCourseCodes,
    laboratoryDurationSettings: manualSchedulingSettings,
    sundayClassesEnabled: manualSchedulingSettings?.sunday_classes_enabled ?? true,
  });

  const canManageScheduleFaculty = useCallback((schedule: ScheduleItem): boolean => {
    if (!canAssignInstructor) return false;

    const subject = subjects.find((item) => item.id === schedule.subjectId);

    const assignedDepartmentId = isMajorSubject(subject)
      ? majorTeachingDepartmentId(subject, schedule.departmentId ?? null)
      : subject?.teachingDepartmentId ?? null;

    if (assignedDepartmentId === null) {
      return true;
    }

    return Boolean(
      user?.department_id &&
      Number(user.department_id) === Number(assignedDepartmentId)
    );
  }, [canAssignInstructor, subjects, user?.department_id]);

  const getFacultyRestrictionMessage = useCallback((schedule: ScheduleItem): string => {
    const subject = subjects.find((item) => item.id === schedule.subjectId);

    if (isMajorSubject(subject)) {
      return "Only the department that offers this major can assign its instructor.";
    }

    const assignedDepartment = subject?.teachingDepartmentCode
      ? `${subject.teachingDepartmentCode} Department`
      : subject?.teachingDepartmentName ?? "the college that offers this course";

    return `Only ${assignedDepartment} can assign instructors for this course.`;
  }, [subjects]);

  const placed = useMemo(() => {
    const nextPlaced: Record<string, string> = {};
    schedules.forEach((s) => {
      for (let offset = 0; offset < s.durationSlots; offset++) {
        nextPlaced[`${s.dayIndex}-${s.startSlot + offset}`] = s.courseId ?? s.subjectId ?? "";
      }
    });
    return nextPlaced;
  }, [schedules]);

  const placementSessionKey = buildPlacementSessionKey(dropContext, selectedSectionId);

  const placementDataRef = useRef({ schedules, subjects, rooms, fieldCourseAssignmentEnabled, fieldCourseCodes, dropContext, manualSchedulingSettings });
  placementDataRef.current = { schedules, subjects, rooms, fieldCourseAssignmentEnabled, fieldCourseCodes, dropContext, manualSchedulingSettings };

  useEffect(() => {
    const { schedules, subjects, rooms, fieldCourseAssignmentEnabled, fieldCourseCodes, dropContext, manualSchedulingSettings } = placementDataRef.current;

    if (dropContext) {
      const subject = subjects.find((s) => s.id === dropContext.subjectId);
      const isFieldSubject = !!subject && (
        subject.roomTypeRequired === "field"
        || (
          fieldCourseAssignmentEnabled
          && fieldCourseCodes.map((code) => code.trim().toUpperCase()).includes(subject.code.trim().toUpperCase())
        )
      );
      const totalSlots = getSubjectTotalSlots(subject);

      const plan = getCourseSlotPlan(subject);
      const singleSlots = plan.singleBlockSlots || totalSlots;
      const splitDay2Slots = singleSlots;
      const forcedDay = manualSchedulingSettings?.forced_day_rules?.find(
        (rule) => Number(rule.course_id) === Number(subject?.id)
      )?.day;
      const forcedDayIndex = forcedDay ? FULL_DAY_NAMES.findIndex((day) => day === forcedDay) : -1;

      setModalForceDayEnabled(forcedDayIndex >= 0);
      setModalForcedDayIndex(forcedDayIndex >= 0 ? forcedDayIndex : dropContext.dayIndex);
      setModalFieldEnabled(isFieldSubject);
      setModalSplitEnabled(false);



      if (isFieldSubject) {
        setModalClassMode("field");
        setModalRoomId("field");
        setModalDay2RoomId("field");
        setModalDay2ClassMode("field");
        setModalIsHybrid(false);
        setModalPreferredPattern(null);
        setModalDay1Index(dropContext.dayIndex);
        setModalDay2Index(getNextMeetingDayIndex(dropContext.dayIndex));
        setModalDay1StartSlot(dropContext.startSlot);
        setModalDay1Duration(singleSlots);
        setModalDay2StartSlot(dropContext.startSlot);
        setModalDay2Duration(0);
        setIsDay2ModifiedByUser(false);
      } else if (dropContext.isRescheduling && dropContext.scheduleId) {
        const targetSched = schedules.find((s) => s.id === dropContext.scheduleId);
        if (targetSched) {
          setModalRoomId(targetSched.roomId || (targetSched.mode === "on-site" ? ROOM_TBA : targetSched.mode));
          setModalClassMode(targetSched.mode ?? "on-site");
          setModalPreferredPattern(targetSched.preferredPattern ?? null);
          const patternDays = parsePreferredPattern(targetSched.preferredPattern);

          const existing = schedules.filter(
            (s) => s.subjectId === targetSched.subjectId && s.sectionId === selectedSectionId
          );
          const { isIntegrated, isSplit } = savedMeetingPairShape(
            subject,
            existing.length,
            Boolean(targetSched.isHybrid),
            targetSched.preferredPattern,
            existing.map((meeting) => meeting.meetingType),
          );
          setModalIsHybrid(isIntegrated);
          const sorted = sortSplitMeetingsForEdit(existing, subject, isIntegrated, manualSchedulingSettings);

          if (sorted.length >= 2) {
            setModalSplitEnabled(isSplit);
            setModalRoomId(sorted[0].roomId || (sorted[0].mode === "on-site" ? ROOM_TBA : sorted[0].mode));
            setModalClassMode(sorted[0].mode ?? "on-site");
            setModalDay1Index(sorted[0].dayIndex);
            setModalDay2Index(sorted[1].dayIndex);
            setModalPreferredPattern(
              (isSplit ? fixedSplitPatternForDays(sorted[0].dayIndex, sorted[1].dayIndex) : null)
                ?? buildPreferredPattern(sorted[0].dayIndex, sorted[1].dayIndex)
            );
            setModalDay1StartSlot(sorted[0].startSlot);
            setModalDay1Duration(sorted[0].durationSlots);
            setModalDay2StartSlot(sorted[1].startSlot);
            setModalDay2Duration(sorted[1].durationSlots);
            setModalDay2RoomId(sorted[1].roomId || (sorted[1].mode === "on-site" ? ROOM_TBA : sorted[1].mode));
            setModalDay2ClassMode(sorted[1].mode ?? "on-site");
            setIsDay2ModifiedByUser(true);
          } else if (sorted.length === 1) {
            setModalDay1Index(patternDays?.[0] ?? sorted[0].dayIndex);
            setModalDay2Index(patternDays?.[1] ?? getNextMeetingDayIndex(sorted[0].dayIndex));
            setModalDay1StartSlot(sorted[0].startSlot);
            setModalDay1Duration(sorted[0].durationSlots);
            setModalDay2StartSlot(sorted[0].startSlot);
            setModalDay2Duration(patternDays ? splitDay2Slots : Math.max(0, singleSlots - sorted[0].durationSlots));
            setModalDay2RoomId(ROOM_TBA);
            setModalDay2ClassMode("on-site");
            setIsDay2ModifiedByUser(false);
          } else {
            setModalDay1Index(dropContext.dayIndex);
            setModalDay2Index(getNextMeetingDayIndex(dropContext.dayIndex));
            setModalDay1StartSlot(dropContext.startSlot);
            setModalDay1Duration(singleSlots);
            setModalDay2StartSlot(dropContext.startSlot);
            setModalDay2Duration(0);
            setModalDay2RoomId("");
            setModalDay2ClassMode("on-site");
            setIsDay2ModifiedByUser(false);
          }
        }
      } else {
        let resolvedRoomId = "";
        if (subject && !isFieldSubject) {
          const requiredRoomType = requiredRoomTypeForMeeting(subject);
          const matchingTypeRooms = rooms.filter(r =>
            (r.status === "available" || !r.status) &&
            (!requiredRoomType || roomTypeSatisfies(requiredRoomType, r.roomType))
          );
          const availableRooms = rooms.filter(r =>
            (r.status === "available" || !r.status) &&
            (r.roomType === "lecture" || r.roomType === "laboratory")
          );
          const nonConflictingRoom = matchingTypeRooms.find(r => {
            if (!roomGrantFits(r, dropContext.dayIndex, dropContext.startSlot, singleSlots)) return false;
            const conflict = checkConflict(
              subject.id,
              selectedSectionId,
              null,
              r.id,
              dropContext.dayIndex,
              dropContext.startSlot,
              singleSlots,
              undefined,
              null
            );
            return !conflict || conflict.conflictType !== "room";
          });
          const ownMatchingRooms = matchingTypeRooms.filter(r => !r.grantWindows);
          const ownAvailableRooms = availableRooms.filter(r => !r.grantWindows);
          resolvedRoomId = nonConflictingRoom?.id || (ownMatchingRooms.length > 0 ? ownMatchingRooms[0].id : (ownAvailableRooms.length > 0 ? ownAvailableRooms[0].id : ""));
        }

        const requiredRoomType = requiredRoomTypeForMeeting(subject);
        setModalRoomId(resolvedRoomId || (requiredRoomType === "laboratory" ? ROOM_TBA : ""));
        setModalClassMode("on-site");
        setModalIsHybrid(false);
        setModalSplitEnabled(false);
        setModalPreferredPattern(null);
        setModalDay1Index(dropContext.dayIndex);
        setModalDay2Index(getNextMeetingDayIndex(dropContext.dayIndex));
        setModalDay1StartSlot(dropContext.startSlot);
        setModalDay1Duration(singleSlots);
        setModalDay2StartSlot(dropContext.startSlot);
        setModalDay2Duration(0);
        setModalDay2RoomId(resolvedRoomId || (requiredRoomType === "laboratory" ? ROOM_TBA : ""));
        setModalDay2ClassMode("on-site");
        setIsDay2ModifiedByUser(false);
      }

      if (forcedDayIndex >= 0) {
        setModalDay1Index(forcedDayIndex);
        setModalPreferredPattern(null);
        setModalIsHybrid(false);
        setModalSplitEnabled(false);
        setModalDay2Duration(0);
      }

      const reopenedSchedule = dropContext.isRescheduling && dropContext.scheduleId
        ? schedules.find((s) => s.id === dropContext.scheduleId)
        : undefined;
      const savedRunDays = consecutiveDayCount(reopenedSchedule?.preferredPattern);
      const run = subject
        ? consecutivePlacementFor(
            subject.id,
            selectedSectionId,
            manualSchedulingSettings?.consecutive_day_rules ?? [],
            Boolean(manualSchedulingSettings?.sunday_classes_enabled),
          ) ?? (savedRunDays
            ? { dayCount: savedRunDays, preferredStartDay: null, runs: consecutiveDayRuns(savedRunDays, Boolean(manualSchedulingSettings?.sunday_classes_enabled)) }
            : null)
        : null;
      setModalConsecutiveDays(run ? run.dayCount : null);
      if (run) {
        const savedRun = dropContext.isRescheduling
          ? schedules
              .filter((s) => s.subjectId === subject?.id && s.sectionId === selectedSectionId)
              .sort((left, right) => left.dayIndex - right.dayIndex)
          : [];
        setModalIsHybrid(false);
        setModalSplitEnabled(false);
        setModalPreferredPattern(null);
        setModalForceDayEnabled(false);
        setModalDay2Duration(0);
        setModalDay2RoomId("");
        if (savedRun.length > 0) {
          setModalRoomId(savedRun[0].roomId || (savedRun[0].mode === "on-site" ? ROOM_TBA : savedRun[0].mode));
          setModalClassMode(savedRun[0].mode ?? "on-site");
          setModalDay1Index(savedRun[0].dayIndex);
          setModalDay1StartSlot(savedRun[0].startSlot);
          setModalDay1Duration(savedRun[0].durationSlots);
        } else {
          setModalDay1Index(runStartForDay(run, dropContext.dayIndex));
          setModalDay1Duration(singleSlots);
        }
      }
    } else {
      setModalRoomId("");
      setModalClassMode("on-site");
      setModalIsHybrid(false);
      setModalSplitEnabled(false);
      setModalConsecutiveDays(null);
      setModalFieldEnabled(false);
      setModalForceDayEnabled(false);
      setModalForcedDayIndex(0);
      setModalPreferredPattern(null);
      setModalDay1Index(0);
      setModalDay2Index(2);
      setModalDay1StartSlot(0);
      setModalDay1Duration(0);
      setModalDay2StartSlot(0);
      setModalDay2Duration(0);
      setModalDay2RoomId("");
      setModalDay2ClassMode("on-site");
      setIsDay2ModifiedByUser(false);
    }
    setModalValidationError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementSessionKey]);

  const resolveDefaultPhysicalRoomId = useCallback((): string => {
    const subject = dropContext ? subjects.find((s) => String(s.id) === String(dropContext.subjectId)) : null;
    const isUsable = (room: Room) => room.status === "available" || !room.status;
    const requiredRoomType = requiredRoomTypeForMeeting(subject ?? undefined);
    const matchingTypeRooms = rooms.filter(
      (room) => isUsable(room) && !room.grantWindows && (!requiredRoomType || roomTypeSatisfies(requiredRoomType, room.roomType))
    );
    if (matchingTypeRooms.length > 0) return matchingTypeRooms[0].id;

    const physicalRooms = rooms.filter(
      (room) => isUsable(room) && !room.grantWindows && (room.roomType === "lecture" || room.roomType === "laboratory")
    );

    if (physicalRooms.length > 0) return physicalRooms[0].id;
    return requiredRoomType === "laboratory" ? ROOM_TBA : "";
  }, [dropContext, subjects, rooms]);

  const applyModalClassMode = useCallback((mode: DeliveryMode) => {
    setModalClassMode(mode);
    if (mode === "online") {
      setModalIsHybrid(false);
      setModalRoomId("online");
      return;
    }
    if (mode === "field") {
      setModalIsHybrid(false);
      setModalRoomId("field");
      return;
    }
    setModalRoomId((current) => (
      current === "online" || current === "field" || !current
        ? resolveDefaultPhysicalRoomId()
        : current
    ));
  }, [resolveDefaultPhysicalRoomId]);

  const applyModalDay2ClassMode = useCallback((mode: DeliveryMode) => {
    setModalDay2ClassMode(mode);
    if (mode === "online") {
      setModalDay2RoomId("online");
      return;
    }
    if (mode === "field") {
      setModalDay2RoomId("field");
      return;
    }
    setModalDay2RoomId((current) => (
      current === "online" || current === "field" || !current
        ? resolveDefaultPhysicalRoomId()
        : current
    ));
  }, [resolveDefaultPhysicalRoomId]);

  const applyModalPreferredPattern = useCallback((pattern: string | null) => {
    setModalPreferredPattern(pattern);

    const patternDays = parsePreferredPattern(pattern);
    if (patternDays) {
      setModalDay1Index(patternDays[0]);
      setModalDay2Index(patternDays[1]);
    }
  }, []);

  const applyModalDay1StartSlot = useCallback((startSlot: number) => {
    setModalDay1StartSlot(startSlot);
    setIsDay2ModifiedByUser((modified) => {
      if (!modified) setModalDay2StartSlot(startSlot);
      return modified;
    });
  }, []);

  useEffect(() => {
    if (!isDay2ModifiedByUser) {
      setModalDay2StartSlot(modalDay1StartSlot);
    }
  }, [modalDay1StartSlot, isDay2ModifiedByUser]);

  const modalRun = useMemo<ConsecutivePlacement | null>(() => {
    if (!dropContext || !modalConsecutiveDays) return null;
    const sundayEnabled = Boolean(manualSchedulingSettings?.sunday_classes_enabled);
    const rule = consecutivePlacementFor(
      String(dropContext.subjectId),
      selectedSectionId,
      manualSchedulingSettings?.consecutive_day_rules ?? [],
      sundayEnabled,
    );
    return rule && rule.dayCount === modalConsecutiveDays
      ? rule
      : { dayCount: modalConsecutiveDays, preferredStartDay: null, runs: consecutiveDayRuns(modalConsecutiveDays, sundayEnabled) };
  }, [dropContext, selectedSectionId, manualSchedulingSettings, modalConsecutiveDays]);

  const modalConflict = useMemo<string | null>(() => {
    if (!dropContext || !modalRoomId) return null;

    const subject = subjects.find((s) => String(s.id) === String(dropContext.subjectId));
    if (!subject) return null;

    const excludeIds = dropContext.isRescheduling
      ? schedules
          .filter((s) => String(s.subjectId) === String(subject.id) && String(s.sectionId) === String(selectedSectionId))
          .map((s) => s.id)
      : [];

    const totalSlots = getSubjectTotalSlots(subject);
    const singleSlots = getCourseSlotPlan(subject).singleBlockSlots || totalSlots;
    const courseId = dropContext.courseId ?? dropContext.subjectId ?? "";
    const patternDays = parsePreferredPattern(modalPreferredPattern);

    if (modalRun) {
      const runDays = runStartingOn(modalRun, modalDay1Index);
      if (!runDays) {
        return `A ${modalRun.dayCount}-day run cannot start on ${FULL_DAY_NAMES[modalDay1Index]}: it would run past the end of the week.`;
      }
      for (const day of runDays) {
        const conflict = checkConflict(
          courseId, selectedSectionId, null, modalRoomId,
          FULL_DAY_NAMES.findIndex((name) => name === day), modalDay1StartSlot, modalDay1Duration, excludeIds, null
        );
        if (conflict) return `${day}: ${conflict.message}`;
      }
      return null;
    }

    if (!patternDays) {
      return checkConflict(
        courseId, selectedSectionId, null, modalRoomId,
        modalDay1Index, modalDay1StartSlot, modalDay1Duration > 0 ? modalDay1Duration : singleSlots, excludeIds, modalPreferredPattern
      )?.message ?? null;
    }

    const meeting1 = modalDay1Duration > 0
      ? checkConflict(
          courseId, selectedSectionId, null, modalRoomId,
          patternDays[0], modalDay1StartSlot, modalDay1Duration, excludeIds, modalPreferredPattern
        )
      : null;
    if (meeting1) return meeting1.message;

    const day2StartSlot = meetsAtOneTime(subject) ? modalDay1StartSlot : modalDay2StartSlot;
    const meeting2 = modalDay2Duration > 0
      ? checkConflict(
          courseId, selectedSectionId, null, modalDay2RoomId,
          patternDays[1], day2StartSlot, modalDay2Duration, excludeIds, modalPreferredPattern
        )
      : null;

    return meeting2?.message ?? null;
  }, [
    dropContext,
    modalRoomId,
    modalDay2RoomId,
    modalPreferredPattern,
    modalDay1Index,
    modalDay1StartSlot,
    modalDay1Duration,
    modalDay2StartSlot,
    modalDay2Duration,
    modalRun,
    schedules,
    selectedSectionId,
    subjects,
    checkConflict
  ]);

  const [modalWasConflicted, setModalWasConflicted] = useState(false);
  useEffect(() => {
    if (!dropContext) setModalWasConflicted(false);
    else if (modalConflict) setModalWasConflicted(true);
  }, [dropContext, modalConflict]);
  const [placedResolvedIds, setPlacedResolvedIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setPlacedResolvedIds((prev) => {
      const next = new Set([...prev].filter((id) => !conflictedMap[id]));
      return next.size === prev.size ? prev : next;
    });
  }, [conflictedMap]);
  const [savedResolvedIds, setSavedResolvedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [conflictCounts, setConflictCounts] = useState<{ open: number; resolved: number } | null>(null);
  const [conflictCountsRevision, setConflictCountsRevision] = useState(0);
  const refreshConflictCounts = useCallback(() => setConflictCountsRevision((revision) => revision + 1), []);
  useEffect(() => {
    if (!activeSemester) return;
    const controller = new AbortController();
    const semesterId = Number(activeSemester.id);
    void Promise.all([
      fetchConflicts({ semesterId, signal: controller.signal }),
      fetchResolvedConflicts({ semesterId, signal: controller.signal }),
    ])
      .then(([openConflicts, entries]) => {
        setSavedResolvedIds(resolvedScheduleIds(entries));
        setConflictCounts({
          open: openConflicts.length,
          resolved: entries.filter((entry) => entry.status !== "reopened").length,
        });
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [activeSemester, schedules, conflictCountsRevision]);
  const allResolvedIds = useMemo<ReadonlySet<string>>(
    () => new Set([...resolvedIds, ...placedResolvedIds, ...savedResolvedIds]),
    [resolvedIds, placedResolvedIds, savedResolvedIds]
  );

  const releaseRequiredDayForMove = useCallback(async (courseId: string, dayIndex: number) => {
    const currentRules = manualSchedulingSettings?.forced_day_rules ?? [];
    const pin = currentRules.find((rule) => String(rule.course_id) === courseId);
    if (!manualSchedulingSettings || !pin || pin.day === FULL_DAY_NAMES[dayIndex]) return null;

    const response = await api.patch<ManualSchedulingSettings>("/scheduling-settings", {
      section_id: Number(selectedSectionId),
      forced_day_rules: currentRules.filter((rule) => rule !== pin),
    });
    setManualSchedulingSettings(response.data);
    return currentRules;
  }, [manualSchedulingSettings, selectedSectionId]);

  const restoreRequiredDays = useCallback(async (rules: Array<{ course_id: number; day: string }> | null) => {
    if (rules === null) return;
    try {
      const response = await api.patch<ManualSchedulingSettings>("/scheduling-settings", {
        section_id: Number(selectedSectionId),
        forced_day_rules: rules,
      });
      setManualSchedulingSettings(response.data);
    } catch {
    }
  }, [selectedSectionId]);

  const onScheduleRelocated =useCallback(async (scheduleId: string, dayIndex: number, startSlot: number) => {
    const sched = schedules.find((s) => s.id === scheduleId);
    if (!sched) return;
    if (isSummerWeekendBlocked(dayIndex)) {
      toast.error("Weekend Not Available", "Summer semester classes are scheduled Monday through Friday.");
      return;
    }
    const dayName = FULL_DAY_NAMES[dayIndex];
    const startTime24h = slotToTime24h(startSlot);
    const endTime24h = slotToTime24h(startSlot + sched.durationSlots);

    const isNumericId = !isNaN(Number(scheduleId));

    if (!isNumericId) {
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          schedule.id === scheduleId
            ? { ...schedule, dayIndex, day: FULL_DAY_NAMES[dayIndex], startSlot }
            : schedule
        )
      );
      toast.success("Schedule Relocated", "Class schedule updated.");
      return;
    }

    const groupPartner = sched.splitGroupId
      ? schedules.find((s) => s.splitGroupId === sched.splitGroupId && s.id !== sched.id) ?? null
      : null;
    const nextPattern = groupPartner && isCustomDayPattern(sched.preferredPattern)
      ? relocatedPairPattern(sched, groupPartner, dayIndex)
      : null;

    let releasedRules: Array<{ course_id: number; day: string }> | null = null;
    try {
      releasedRules = await releaseRequiredDayForMove(String(sched.courseId ?? sched.subjectId ?? ""), dayIndex);
      const response = await api.put<ApiScheduleRecord>(`/schedules/${scheduleId}`, {
        day: dayName,
        start_time: startTime24h,
        end_time: endTime24h,
        ...(nextPattern !== null ? { preferred_pattern: nextPattern } : {}),
      });
      releasedRules = null;
      if (nextPattern !== null && groupPartner && !isNaN(Number(groupPartner.id))) {
        await api.put<ApiScheduleRecord>(`/schedules/${groupPartner.id}`, {
          preferred_pattern: nextPattern,
        });
      }
      applyUpdatedSchedules(relocatedRows(response.data));
      toast.success("Schedule Relocated", "Class schedule successfully updated.");
      void refreshSchedules();
    } catch (err) {
      void restoreRequiredDays(releasedRules);
      if (isNotFoundError(err)) {
        toast.error("Sync Error", "This schedule has been removed or modified externally. Refreshing timetable...");
        clearCachedKey(schedulerCacheKey);
        void refreshData();
        return;
      }
      triggerConflictReminder();
      const violations = getApiViolations(err);
      const apiMessage = getApiErrorMessage(err);
      if (violations.length > 0) {
        const messages = violations.map((v) => v.message).join(" ");
        toast.error("Schedule Conflict", messages);
      } else if (apiMessage) {
        toast.error("Relocation Failed", apiMessage);
      } else {
        toast.error("Relocation Failed", "Could not save the new schedule slot.");
      }
    }
  }, [schedules, refreshSchedules, refreshData, schedulerCacheKey, applyUpdatedSchedules, isSummerWeekendBlocked, toast, triggerConflictReminder, releaseRequiredDayForMove, restoreRequiredDays]);

  const dragDrop = useDragDrop({
    schedules,
    dragSubjectId,
    draggedScheduleId,
    hoveredCell,
    subjects,
    setDragSubjectId,
    setDraggedScheduleId,
    setDragFromCell,
    setHoveredCell,
    setSchedules,
    setDropContext,
    setConflictInfo,
    checkMoveConflict,
    onScheduleRelocated,
    activeSemester
  });

  const handleConfirmSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropContext || !activeSemester) return;
    if (!modalRoomId) {
      setModalValidationError("Please select a Room before confirming.");
      return;
    }
    const subject = subjects.find((s) => s.id === dropContext.subjectId);
    if (!subject) return;

    const section = sections.find((s) => s.id === selectedSectionId);
    if (!section) return;

    const totalSlots = getSubjectTotalSlots(subject);
    const singleSlots = getCourseSlotPlan(subject).singleBlockSlots || totalSlots;

    const d1 = modalDay1Duration;
    const d2 = modalPreferredPattern ? modalDay2Duration : 0;
    const singleDuration = d1 > 0 ? d1 : singleSlots;
    const patternDays = parsePreferredPattern(modalPreferredPattern);

    const runDays = modalRun ? runStartingOn(modalRun, modalDay1Index) : null;
    if (modalRun && !runDays) {
      setModalValidationError(`A ${modalRun.dayCount}-day run cannot start on ${FULL_DAY_NAMES[modalDay1Index]}: it would run past the end of the week.`);
      return;
    }
    if (runDays && d1 <= 0) {
      setModalValidationError("Each day of the run must have a duration greater than zero.");
      return;
    }

    if (patternDays && (d1 <= 0 || d2 <= 0)) {
      setModalValidationError("Each meeting must have a duration greater than zero.");
      return;
    }

    const sameTimePair = Boolean(patternDays) && meetsAtOneTime(subject);
    if (sameTimePair && d1 !== d2) {
      setModalValidationError("Both meetings of a Split Session or Hybrid Split must have the same duration.");
      return;
    }
    const day2StartSlot = sameTimePair ? modalDay1StartSlot : modalDay2StartSlot;





    const excludeIds = dropContext.isRescheduling
      ? schedules.filter(s => String(s.subjectId) === String(subject.id) && String(s.sectionId) === String(selectedSectionId)).map(s => s.id)
      : [];

    let resolvedDay1StartSlot = -1;
    let resolvedDay2StartSlot = -1;

    const runDayIndexes = (runDays ?? []).map((day) => FULL_DAY_NAMES.findIndex((name) => name === day));
    const runConflicts = (startSlot: number): boolean => runDayIndexes.some((dayIndex) => Boolean(
      checkConflict(subject.id, selectedSectionId, null, modalRoomId, dayIndex, startSlot, d1, excludeIds, null)
    ));

    let currentHasConflict = false;
    if (runDays) {
      currentHasConflict = runConflicts(modalDay1StartSlot);
    } else if (patternDays) {
      const conflictDay1 = d1 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalRoomId, patternDays[0], modalDay1StartSlot, d1, excludeIds, modalPreferredPattern) : null;
      const conflictDay2 = d2 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalDay2RoomId, patternDays[1], day2StartSlot, d2, excludeIds, modalPreferredPattern) : null;
      if (conflictDay1 || conflictDay2) currentHasConflict = true;
    } else {
      const conflict = checkConflict(subject.id, selectedSectionId, null, modalRoomId, modalDay1Index, modalDay1StartSlot, singleDuration, excludeIds, modalPreferredPattern);
      if (conflict) currentHasConflict = true;
    }

    if (!currentHasConflict) {
      resolvedDay1StartSlot = modalDay1StartSlot;
      resolvedDay2StartSlot = modalPreferredPattern && d2 > 0 ? day2StartSlot : -1;
    } else {
      const maxSlots = slotCount();
      if (runDays) {
        for (let offset = 0; offset < maxSlots; offset++) {
          const startSlot = (modalDay1StartSlot + offset) % Math.max(1, maxSlots - d1 + 1);
          if (startSlot + d1 > maxSlots || runConflicts(startSlot)) continue;
          resolvedDay1StartSlot = startSlot;
          break;
        }
      } else if (patternDays) {
        if (maxSlots - d1 + 1 <= 0 || maxSlots - d2 + 1 <= 0) {
          resolvedDay1StartSlot = -1;
          resolvedDay2StartSlot = -1;
        } else {
          let foundPatternSlots = false;
          for (let day1Offset = 0; day1Offset < maxSlots; day1Offset++) {
            const day1Slot = (modalDay1StartSlot + day1Offset) % (maxSlots - d1 + 1);
            if (day1Slot + d1 > maxSlots) continue;
            const conflictDay1 = checkConflict(subject.id, selectedSectionId, null, modalRoomId, patternDays[0], day1Slot, d1, excludeIds, modalPreferredPattern);
            if (conflictDay1) continue;

            for (let day2Offset = 0; day2Offset < (sameTimePair ? 1 : maxSlots); day2Offset++) {
              const day2Slot = sameTimePair ? day1Slot : (day2StartSlot + day2Offset) % (maxSlots - d2 + 1);
              if (day2Slot + d2 > maxSlots) continue;
              const conflictDay2 = checkConflict(subject.id, selectedSectionId, null, modalDay2RoomId, patternDays[1], day2Slot, d2, excludeIds, modalPreferredPattern);
              if (conflictDay2) continue;

              resolvedDay1StartSlot = day1Slot;
              resolvedDay2StartSlot = day2Slot;
              foundPatternSlots = true;
              break;
            }

            if (foundPatternSlots) break;
          }
        }
      } else {
        const maxDuration = singleDuration;
        if (maxSlots - maxDuration + 1 <= 0) {
          resolvedDay1StartSlot = -1;
          resolvedDay2StartSlot = -1;
        } else {
          for (let offset = 0; offset < maxSlots; offset++) {
            const s = (modalDay1StartSlot + offset) % (maxSlots - maxDuration + 1);
            if (s + maxDuration > maxSlots) continue;
            const conflict = checkConflict(subject.id, selectedSectionId, null, modalRoomId, modalDay1Index, s, singleDuration, excludeIds, modalPreferredPattern);
            if (conflict) continue;

            resolvedDay1StartSlot = s;
            resolvedDay2StartSlot = -1;
            break;
          }
        }
      }
    }

    if (resolvedDay1StartSlot === -1) {
      setModalValidationError("No available time slots found that satisfy all scheduling constraints.");
      return;
    }

    let resolvedRoom1Id: string | null = modalRoomId === ROOM_TBA ? null : modalRoomId;
    if (modalRoomId === "online" || modalClassMode === "online") {
      const onlineRoom = rooms.find(r => r.roomType === "online");
      if (!onlineRoom) {
        setModalValidationError("No available online room assignment is configured.");
        return;
      }
      resolvedRoom1Id = onlineRoom.id;
    } else if (modalRoomId === "field" || modalClassMode === "field") {
      const fieldRoom = rooms.find(r => r.roomType === "field");
      if (!fieldRoom) {
        setModalValidationError("No available field room assignment is configured.");
        return;
      }
      resolvedRoom1Id = fieldRoom.id;
    }

    let resolvedRoom2Id: string | null = modalDay2RoomId === ROOM_TBA ? null : modalDay2RoomId;
    if (modalDay2RoomId === "online" || modalDay2ClassMode === "online") {
      const onlineRoom = rooms.find(r => r.roomType === "online");
      if (!onlineRoom) {
        setModalValidationError("No available online room assignment is configured.");
        return;
      }
      resolvedRoom2Id = onlineRoom.id;
    } else if (modalDay2RoomId === "field" || modalDay2ClassMode === "field") {
      const fieldRoom = rooms.find(r => r.roomType === "field");
      if (!fieldRoom) {
        setModalValidationError("No available field room assignment is configured.");
        return;
      }
      resolvedRoom2Id = fieldRoom.id;
    }

    const targetDays: TargetScheduleDay[] = [];
    if (runDays) {
      for (const day of runDays) targetDays.push({ day, startSlot: resolvedDay1StartSlot, duration: d1 });
    } else if (patternDays) {
      if (d1 > 0) targetDays.push({ day: FULL_DAY_NAMES[patternDays[0]], startSlot: resolvedDay1StartSlot, duration: d1 });
      if (d2 > 0) targetDays.push({ day: FULL_DAY_NAMES[patternDays[1]], startSlot: resolvedDay2StartSlot, duration: d2 });
    } else {
      targetDays.push({ day: FULL_DAY_NAMES[modalDay1Index], startSlot: resolvedDay1StartSlot, duration: singleDuration });
    }

    setIsModalLoading(true);
    let shouldCloseModal = true;
    let settingsBeforePlacement: ManualSchedulingSettings | null = null;
    let placementSaved = false;
    try {
      if (manualSchedulingSettings !== null) {
        const currentForcedRules = manualSchedulingSettings.forced_day_rules ?? [];
        const nextForcedRules = modalForceDayEnabled
          ? [
              ...currentForcedRules.filter((rule) => Number(rule.course_id) !== Number(subject.id)),
              { course_id: Number(subject.id), day: FULL_DAY_NAMES[modalForcedDayIndex] },
            ]
          : currentForcedRules.filter((rule) => Number(rule.course_id) !== Number(subject.id));
        if (JSON.stringify(nextForcedRules) !== JSON.stringify(currentForcedRules)) {
          const settingsResponse = await api.patch<ManualSchedulingSettings>("/scheduling-settings", {
            section_id: Number(selectedSectionId),
            forced_day_rules: nextForcedRules,
          });
          settingsBeforePlacement = manualSchedulingSettings;
          setManualSchedulingSettings(settingsResponse.data);
        }
      } else if (modalForceDayEnabled) {
        setModalValidationError("Scheduling configurations are still loading. Close and reopen the placement dialog, then try again.");
        shouldCloseModal = false;
        return;
      }

      const courseMeetings = schedules.filter((s) => String(s.subjectId) === String(subject.id) && String(s.sectionId) === String(selectedSectionId));
      const existingRecords = dropContext.isRescheduling
        ? runDays
          ? [...courseMeetings].sort((left, right) => left.dayIndex - right.dayIndex)
          : sortSplitMeetingsForEdit(courseMeetings, subject, modalIsHybrid, manualSchedulingSettings)
        : [];

      const sharedSplitGroupId = targetDays.length > 1
        ? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `split-${subject.id}-${Date.now()}`)
        : (existingRecords[0]?.splitGroupId ?? null);

      const operations = targetDays.map((targetDay, index) => {
        const isSplit = targetDays.length > 1;
        const hasLab = Number(subject.labHours ?? 0) > 0;
        let meetingType: "lecture" | "laboratory" | null = null;
        if (isSplit && !runDays) {
          if (modalIsHybrid && hasLab) {
            meetingType = index === 0 ? "laboratory" : "lecture";
          } else if (hasLab) {
            meetingType = "laboratory";
          } else {
            meetingType = "lecture";
          }
        }

        return {
          ...(existingRecords[index]?.id
            ? { id: Number(existingRecords[index].id) }
            : { faculty_id: null }),
          semester_id: activeSemester.id,
          section_id: Number(selectedSectionId),
          course_id: Number(subject.id),
          room_id: (() => {
            const resolved = index === 0 || runDays ? resolvedRoom1Id : resolvedRoom2Id;
            return resolved === null || resolved === "" ? null : Number(resolved);
          })(),
          department_id: section.departmentId,
          day: targetDay.day,
          start_time: slotToTime24h(targetDay.startSlot),
          end_time: slotToTime24h(targetDay.startSlot + targetDay.duration),
          mode: index === 0 || runDays ? modalClassMode : modalDay2ClassMode,
          is_hybrid: !runDays && (
            (modalIsHybrid && (!hasLab || modalDay2ClassMode === "online"))
            || (modalSplitEnabled && isHybridSplitEligible(subject)
              && (modalClassMode === "online") !== (modalDay2ClassMode === "online"))
          ),
          preferred_pattern: modalRun && runDays ? consecutivePattern(modalRun.dayCount) : modalPreferredPattern,
          split_group_id: sharedSplitGroupId,
          meeting_type: meetingType,
          meeting_index: index + 1,
          status: resolveManualOperationStatus(existingRecords[index]?.status)
        };
      });

      const deleteIds = existingRecords
        .slice(targetDays.length)
        .map((schedule) => Number(schedule.id));

      const response = await api.post<AtomicScheduleResponse>('/schedules/batch', {
        operations,
        delete_ids: deleteIds
      });
      const savedScheduleRecords = response.data.schedules ?? [];
      const deletedScheduleRecordIds = response.data.deleted_schedule_ids ?? [];
      const resolvedConflictCount = response.data.resolved_conflicts?.length ?? 0;

      placementSaved = true;

      const savedScheduleItems = savedScheduleRecords.map(mapApiScheduleToItem);
      const deletedScheduleIds = new Set(deletedScheduleRecordIds.map(String));

      if (dropContext.isRescheduling) {
        if (resolvedDay1StartSlot !== modalDay1StartSlot) {
          toast.success("Schedule Updated at Alternative Time", `Preferred time was occupied. Relocated to ${slotToTimeStr(resolvedDay1StartSlot)}.`);
        } else {
          toast.success("Schedule Updated", "Class schedule successfully updated.");
        }
      } else {
        if (resolvedDay1StartSlot !== modalDay1StartSlot) {
          toast.success("Schedule Created at Alternative Time", `Preferred time was occupied. Plotted to ${slotToTimeStr(resolvedDay1StartSlot)}.`);
        } else {
          toast.success("Schedule Created", "Class schedule successfully plotted.");
        }
      }

      if (resolvedConflictCount > 0) {
        toast.success(
          "Conflicts Resolved",
          `Resolved ${resolvedConflictCount} conflict${resolvedConflictCount === 1 ? "" : "s"} on the timetable.`,
        );
      }

      if (modalWasConflicted) {
        setPlacedResolvedIds((prev) => new Set([...prev, ...savedScheduleItems.map((item) => item.id)]));
      }

      setSchedules((previousSchedules) => {
        const savedScheduleIds = new Set(savedScheduleItems.map((item) => item.id));
        const savedScheduleKeys = new Set(
          savedScheduleItems.map((item) => `${item.semesterId}:${item.sectionId}:${item.courseId || item.subjectId}`)
        );
        return [
          ...previousSchedules.filter((item) => {
            const itemKey = `${item.semesterId}:${item.sectionId}:${item.courseId || item.subjectId}`;
            return !savedScheduleIds.has(item.id)
              && !deletedScheduleIds.has(item.id)
              && !savedScheduleKeys.has(itemKey);
          }),
          ...savedScheduleItems
        ];
      });
      setIsModalLoading(false);
      setDropContext(null);
      setConflictInfo(null);
      void refreshSchedules();
    } catch (err) {
      triggerConflictReminder();
      const violations = getApiViolations(err);
      const apiMessage = getApiErrorMessage(err);
      if (violations.length > 0) {
        const messages = violations.map((v) => v.message).join(" ");
        setModalValidationError(messages);
        toast.error("Schedule Conflict", messages);
      } else if (apiMessage) {
        setModalValidationError(apiMessage);
        toast.error("Operation Failed", apiMessage);
      } else {
        setModalValidationError("Could not save the schedule to the database.");
        toast.error("Operation Failed", "Could not save the schedule to the database.");
      }
      shouldCloseModal = false;

      const restore: ManualSchedulingSettings | null = placementSaved ? null : settingsBeforePlacement;
      if (restore !== null) {
        try {
          const restored = await api.patch<ManualSchedulingSettings>("/scheduling-settings", {
            section_id: Number(selectedSectionId),
            forced_day_rules: restore.forced_day_rules ?? [],
          });
          setManualSchedulingSettings(restored.data);
        } catch {
          toast.warning(
            "Department Settings Changed",
            `The class was not placed, but the Force Day change for ${subject.code} could not be undone. Review it in Scheduling Settings.`,
          );
        }
      }
    } finally {
      setIsModalLoading(false);
      if (shouldCloseModal) {
        setDropContext(null);
        setConflictInfo(null);
      }
    }
  };

  const handleModalConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = dropContext ? subjects.find((item) => String(item.id) === String(dropContext.subjectId)) : null;
    const isLabMeeting = (duration: number, isFirstMeeting: boolean): boolean => {
      if (Number(subject?.labHours ?? 0) <= 0) return false;
      if (modalIsHybrid) return isFirstMeeting;
      return duration === getCourseSlotPlan(subject).laboratorySlots
        || duration === laboratoryComponentSlots(subject, manualSchedulingSettings);
    };
    const missingFirstRoom = modalClassMode === "on-site" && !modalRoomId;
    const missingSecondRoom = !modalRun
      && modalPreferredPattern
      && modalDay2Duration > 0
      && modalDay2ClassMode === "on-site"
      && !modalDay2RoomId;
    const invalidTba = modalRun
      ? modalRoomId === "tba" && Number(subject?.labHours ?? 0) <= 0
      : (modalRoomId === "tba" && !isLabMeeting(modalDay1Duration, true))
        || (modalDay2RoomId === "tba" && !isLabMeeting(modalDay2Duration, false));
    if (missingFirstRoom || missingSecondRoom || invalidTba) {
      setModalValidationError(invalidTba
        ? "Room TBA is allowed only for a laboratory meeting."
        : "Please select a room for every on-site meeting.");
      return;
    }
    if (modalConflict) return;
    handleConfirmSchedule(e);
  };

  const handleRemoveSchedule = useCallback(async (scheduleId: string) => {
    if (!isEditable) return;
    const target = schedules.find(s => s.id === scheduleId);
    try {
      if (!target) {
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
        return;
      }

      const isNumericId = !isNaN(Number(target.id));

      if (!isNumericId) {
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
        toast.success("Schedule Removed", "Class schedule successfully removed.");
        return;
      }

      if (target.splitGroupId || target.preferredPattern) {
        const linked = schedules.filter(
          s => (target.splitGroupId ? s.splitGroupId === target.splitGroupId : (
                 s.subjectId === target.subjectId &&
                 s.sectionId === target.sectionId &&
                 s.preferredPattern === target.preferredPattern
               )) && !isNaN(Number(s.id))
        );
        if (linked.length > 0) {
          await api.delete(`/schedules/${target.id}?delete_group=true`);
          const linkedIds = new Set(linked.map(s => s.id));
          setSchedules((prev) => prev.filter((s) => !linkedIds.has(s.id)));
          toast.success("Split Schedule Removed", "All linked split meetings removed.");
          void refreshSchedules();
          return;
        }
      }

      await api.delete(`/schedules/${target.id}`);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      toast.success("Schedule Removed", "Class schedule successfully removed.");
      void refreshSchedules();
    } catch (err) {
      if (isNotFoundError(err)) {
        toast.error("Sync Error", "This schedule has been removed or modified externally. Refreshing timetable...");
        clearCachedKey(schedulerCacheKey);
        void refreshData();
        return;
      }
      const apiMsg = getApiErrorMessage(err);
      toast.error("Failed to remove schedule", apiMsg || "An error occurred.");
    } finally {
      setDeleteConfirmScheduleId(null);
      setConflictInfo(null);
      setMovingScheduleId((prev) => (prev === scheduleId ? null : prev));
    }
  }, [isEditable, schedules, refreshSchedules, refreshData, schedulerCacheKey, toast]);

  const [isClearingAll, setIsClearingAll] = useState(false);
  const sectionClearCandidates = useMemo(
    () => buildSectionClearCandidates(sections, schedules, selectedDepartmentId, activeSemester ? Number(activeSemester.id) : null),
    [sections, schedules, selectedDepartmentId, activeSemester],
  );

  const handleClearAll = useCallback(() => {
    if (!isEditable || isClearingAll) return;
    if (schedules.length === 0) return;
    setIsClearAllModalOpen(true);
  }, [isEditable, isClearingAll, schedules]);

  const confirmClearAll = async (sectionIds: string[]) => {
    if (!isEditable || isClearingAll) {
      setIsClearAllModalOpen(false);
      return;
    }
    const eligibleIds = new Set(sectionClearCandidates.filter((candidate) => candidate.isReady).map((candidate) => candidate.sectionId));
    const selectedIds = new Set(sectionIds.filter((id) => eligibleIds.has(id)));
    const targetSchedules = schedules.filter((schedule) => selectedIds.has(schedule.sectionId));
    if (targetSchedules.length === 0) {
      setIsClearAllModalOpen(false);
      return;
    }

    const sectionLabel = `${selectedIds.size} section${selectedIds.size === 1 ? "" : "s"}`;
    const recalledCount = new Set(
      targetSchedules
        .filter((s) => s.status === "revision")
        .map((s) => s.sectionId),
    ).size;
    const confirmed = await confirm({
      title: "Reset Schedules",
      message: `Are you sure you want to reset the schedules of ${sectionLabel}? `
        + `${targetSchedules.length} meeting${targetSchedules.length === 1 ? "" : "s"} will be permanently deleted. This action cannot be undone.`
        + (recalledCount > 0
          ? ` ${recalledCount} of these section${recalledCount === 1 ? " was" : "s were"} recalled or returned from approval; only the working copy is cleared — the submitted version stays in the approval history.`
          : ""),
      eyebrow: "Irreversible Action",
      confirmLabel: "Yes, Reset Schedules",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsClearingAll(true);
    const clearedCount = targetSchedules.length;
    const validSchedules = targetSchedules.filter((s) => !isNaN(Number(s.id)));

    setSchedules((prev) => {
      const updated = prev.filter((schedule) => !selectedIds.has(schedule.sectionId));
      patchCachedData<SchedulerCacheData>(schedulerCacheKey, { schedules: updated });
      return updated;
    });

    setConflictInfo(null);
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
    setIsClearAllModalOpen(false);

    try {
      const targetSectionIds = Array.from(selectedIds)
        .map(Number)
        .filter((id) => id > 0);

      if (targetSectionIds.length > 0 && activeSemester) {
        await api.post('/schedules/batch', {
          operations: [],
          delete_ids: validSchedules.map((s) => Number(s.id)),
          replace_section_ids: targetSectionIds,
          replace_semester_id: Number(activeSemester.id),
        });
      } else if (validSchedules.length > 0) {
        await api.post('/schedules/batch', {
          operations: [],
          delete_ids: validSchedules.map((s) => Number(s.id)),
        });
      }
      toast.success("Schedules Reset", `Reset schedules of ${selectedIds.size} selected section${selectedIds.size === 1 ? "" : "s"} (${clearedCount} loaded meeting${clearedCount === 1 ? "" : "s"}).`);
      await refreshData({ silent: true });
    } catch (err) {
      const apiMsg = getApiErrorMessage(err);
      toast.error("Failed to reset schedules", apiMsg || "An error occurred.");
      await refreshSchedules();
    } finally {
      setIsClearingAll(false);
    }
  };

  const cancelClearAll = useCallback(() => setIsClearAllModalOpen(false), []);

  const handleSubmitForApproval = useCallback(async () => {
    if (!selectedSectionId) return;
    if (!hasDean) {
      toast.error('Submission unavailable', DEAN_REQUIRED_MESSAGE);
      return;
    }
    setIsSubmitApprovalModalOpen(true);
  }, [hasDean, selectedSectionId, toast]);

  const confirmSubmitForApproval = async () => {
    if (!selectedSectionId || isSubmittingSchedule) return;
    const section = sections.find((s) => s.id === selectedSectionId);
    if (!section?.departmentId) {
      toast.error("Unable to Submit", "The selected section is not linked to a department.");
      setIsSubmitApprovalModalOpen(false);
      return;
    }

    const submitCount = submissionReadySections.length;
    const confirmedSubmit = await confirm({
      title: "Submit Schedule",
      message: `${submitCount} section${submitCount === 1 ? "" : "s"} will be sent to the Dean for review and locked from editing until approved, returned, or recalled.`,
      eyebrow: "Schedule Submission",
      confirmLabel: "Submit",
      variant: "maroon",
    });
    if (!confirmedSubmit) return;

    try {
      setIsSubmittingSchedule(true);
      const submittedSectionIds = submissionReadySections.map((item) => Number(item.sectionId));
      await api.post(`/departments/${section.departmentId}/submit-schedules`, {
        section_ids: submittedSectionIds
      });
      invalidateCacheGroups('schedules', 'approvals', 'dashboards', 'faculty');

      const submittedSectionIdSet = new Set(submissionReadySections.map((item) => item.sectionId));
      setSchedules((prev) =>
        prev.map((item) =>
          submittedSectionIdSet.has(item.sectionId)
            ? { ...item, status: "submitted" }
            : item
        )
      );

      toast.success("Submitted for Approval", "Department schedule submitted successfully.");
      refreshSchedules().catch(() => {});
      setIsSubmitApprovalModalOpen(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      toast.error("Failed to submit", apiError.response?.data?.message || "An error occurred.");
    } finally {
      setIsSubmittingSchedule(false);
      setIsSubmitApprovalModalOpen(false);
    }
  };

  const cancelSubmitForApproval = useCallback(() => setIsSubmitApprovalModalOpen(false), []);

  const handleWithdrawSubmission = useCallback(async () => {
    if (!selectedSectionId || isWithdrawingSubmission) return;
    setIsWithdrawSubmissionModalOpen(true);
  }, [selectedSectionId, isWithdrawingSubmission]);

  const confirmWithdrawSubmission = async (sectionIds: string[]) => {
    if (!selectedSectionId || isWithdrawingSubmission) return;
    const section = sections.find((s) => s.id === selectedSectionId);
    if (!section?.departmentId) {
      toast.error("Unable to Recall", "The selected section is not linked to a department.");
      setIsWithdrawSubmissionModalOpen(false);
      return;
    }

    if (sectionIds.length === 0) {
      toast.error("Select Sections", "Choose at least one section to unlock for revision.");
      return;
    }

    const recallCount = sectionIds.length;
    const confirmedRecall = await confirm({
      title: "Recall Schedule",
      message: (departmentWithdrawalStage === "vpaa_approved"
        ? `VPAA approval will be revoked for ${recallCount} section${recallCount === 1 ? "" : "s"} and they will return to revision.`
        : `${recallCount} section${recallCount === 1 ? "" : "s"} will be pulled back from ${departmentWithdrawalStage === "vpaa_review" ? "VPAA" : "Dean"} review and returned to revision.`)
        + " They must be submitted again for approval.",
      eyebrow: "Schedule Submission",
      confirmLabel: "Recall",
      variant: "warning",
    });
    if (!confirmedRecall) return;

    try {
      setIsWithdrawingSubmission(true);
      const response = await api.post<{ instructors_released?: number }>(
        `/departments/${section.departmentId}/withdraw-submission`,
        { section_ids: sectionIds.map((id) => Number(id)) }
      );
      const released = Number(response.data?.instructors_released ?? 0);

      const selectedRevisionSectionIds = new Set(sectionIds);
      setSchedules((prev) =>
        prev.map((item) =>
          selectedRevisionSectionIds.has(item.sectionId)
            && departmentWithdrawableStatuses.includes(item.status)
            ? { ...item, status: "revision", facultyId: null, facultyName: null, facultyAssignmentDone: false, facultyConflictOverride: false }
            : item
        )
      );

      toast.success(
        "Submission Recalled",
        (departmentWithdrawalStage === "vpaa_approved"
          ? "VPAA approval was revoked and only the selected sections were unlocked for revision."
          : "Only the selected sections were unlocked for revision.")
          + (released > 0
            ? ` ${released} instructor assignment${released === 1 ? " was" : "s were"} released.`
            : "")
          + " After revision, submit it again for Dean and VPAA approval, then assign instructors again."
      );
      invalidateCacheGroups('schedules', 'approvals', 'dashboards', 'faculty', 'assignments');
      refreshSchedules().catch(() => {});
      setIsWithdrawSubmissionModalOpen(false);
    } catch (err) {
      toast.error("Failed to recall", getApiErrorMessage(err) ?? "An error occurred.");
    } finally {
      setIsWithdrawingSubmission(false);
    }
  };

  const cancelWithdrawSubmission = useCallback(() => {
    if (!isWithdrawingSubmission) {
      setIsWithdrawSubmissionModalOpen(false);
    }
  }, [isWithdrawingSubmission]);

  const handleEditSection = useCallback(async () => {
    if (!selectedSectionId || isEditingSection || currentStatus !== "finalized") return;
    setIsReassignSectionsModalOpen(true);
  }, [selectedSectionId, isEditingSection, currentStatus]);

  const cancelReassignSections = useCallback(() => {
    if (!isEditingSection) setIsReassignSectionsModalOpen(false);
  }, [isEditingSection]);

  const confirmReassignSections = useCallback(async (sectionIds: string[]) => {
    if (isEditingSection) return;

    const chosen = sectionReassignCandidates.filter(
      (candidate) => candidate.isReady && sectionIds.includes(candidate.sectionId)
    );
    const ids = chosen.flatMap((candidate) => candidate.scheduleIds);
    if (ids.length === 0) {
      toast.error("Nothing to Reassign", "Select at least one finalized section.");
      return;
    }

    try {
      setIsEditingSection(true);
      const response = await api.patch<{ schedules?: ApiScheduleRecord[] }>("/schedules/batch-status", { ids, status: "reassignment" });
      applyUpdatedSchedules((response.data.schedules ?? []).map(mapApiScheduleToItem));
      toast.success(
        chosen.length === 1 ? "Reassignment Enabled" : `Reassignment Enabled for ${chosen.length} Sections`,
        "Instructor assignments are unlocked. Timetable details remain locked.",
      );
      setIsReassignSectionsModalOpen(false);
      invalidateCacheGroups('schedules', 'dashboards', 'faculty', 'assignments');
      void refreshSchedules();
    } catch (err) {
      toast.error("Failed to enable reassignment", getApiErrorMessage(err) ?? "Please try again.");
    } finally {
      setIsEditingSection(false);
    }
  }, [isEditingSection, sectionReassignCandidates, applyUpdatedSchedules, refreshSchedules, toast]);

  const handleResubmit = useCallback(async () => {
    if (!selectedSectionId || isResubmittingSection) return;
    const returnedRows = sectionSchedules.filter((s) => s.status === "rejected" || s.status === "rejected_by_dean");
    if (returnedRows.length === 0) return;
    try {
      setIsResubmittingSection(true);
      const ids = returnedRows.map((s) => Number(s.id));
      await api.patch("/schedules/batch-status", { ids, status: "revision" });

      const sectionScheduleIds = new Set(returnedRows.map((schedule) => schedule.id));
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          sectionScheduleIds.has(schedule.id)
            ? { ...schedule, status: "revision" }
            : schedule
        )
      );
      toast.success("Resubmitted", "Schedule successfully returned under revision.");
      refreshSchedules().catch(() => {});
    } catch (err) {
      toast.error("Failed to resubmit", getApiErrorMessage(err) ?? "An error occurred.");
    } finally {
      setIsResubmittingSection(false);
    }
  }, [selectedSectionId, isResubmittingSection, sectionSchedules, refreshSchedules, toast]);

  const handleFinalize = useCallback(async () => {
    if (!selectedSectionId || isFinalizing) return;
    setIsFinalizeSectionsModalOpen(true);
  }, [selectedSectionId, isFinalizing]);

  const cancelFinalizeSections = useCallback(() => {
    if (!isFinalizing) setIsFinalizeSectionsModalOpen(false);
  }, [isFinalizing]);

  const confirmFinalizeSections = useCallback(async (sectionIds: string[]) => {
    if (isFinalizing) return;

    const chosen = sectionFinalizeCandidates.filter(
      (candidate) => candidate.isReady && sectionIds.includes(candidate.sectionId)
    );
    const ids = chosen.flatMap((candidate) => candidate.scheduleIds);
    if (ids.length === 0) {
      toast.error("Nothing to Finalize", "Select at least one section whose classes all have an instructor.");
      return;
    }

    try {
      setIsFinalizing(true);
      await api.patch("/schedules/batch-status", { ids, status: "finalized" });

      const finalizedIds = new Set(ids.map(String));
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          finalizedIds.has(String(schedule.id))
            ? { ...schedule, status: "finalized" }
            : schedule
        )
      );
      toast.success(
        chosen.length === 1 ? "Section Finalized" : `${chosen.length} Sections Finalized`,
        chosen.length === 1
          ? `${chosen[0].sectionName}'s instructor assignments are now finalized.`
          : "The selected sections' instructor assignments are now finalized."
      );
      setIsFinalizeSectionsModalOpen(false);
      invalidateCacheGroups('schedules', 'dashboards', 'faculty', 'assignments');
      refreshSchedules().catch(() => {});
    } catch (err) {
      toast.error("Failed to finalize", getApiErrorMessage(err) ?? "An error occurred.");
    } finally {
      setIsFinalizing(false);
    }
  }, [isFinalizing, sectionFinalizeCandidates, refreshSchedules, toast]);

  const handlePopupFacultyChange = useCallback((fId: string) => {
    if (!facultyAssignmentPopup) return;
    setFacultyAssignmentPopup((prev) => (prev ? { ...prev, facultyId: fId } : null));
    setPopupValidationError("");
    if (fId) {
      const conflict = checkFacultyConflict(fId, facultyAssignmentPopup.scheduleId);
      setPopupConflictWarning(conflict ?? "");
    } else {
      setPopupConflictWarning("");
    }
  }, [facultyAssignmentPopup, checkFacultyConflict]);

  const askOverloadConfirmation = (confirmation: OverloadConfirmation): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      setOverloadPrompt({ confirmation, resolve });
    });

  const confirmOverloadPrompt = () => {
    overloadPrompt?.resolve(true);
    setOverloadPrompt(null);
  };

  const cancelOverloadPrompt = () => {
    overloadPrompt?.resolve(false);
    setOverloadPrompt(null);
  };

  type FacultyMutationOutcome =
    | { status: "ok"; schedules: ScheduleItem[] }
    | { status: "restricted"; message: string }
    | { status: "resynced" }
    | { status: "needs_overload_confirmation"; confirmation: OverloadConfirmation }
    | { status: "needs_conflict_override"; question: ConflictOverrideQuestion }
    | { status: "failed"; message: string };

  const mutateScheduleFaculty = async (
    slotId: string,
    facultyId: string | null,
    confirmOverload = false,
    overrideConflicts = false
  ): Promise<FacultyMutationOutcome> => {
    const targetSchedule = schedules.find((schedule) => schedule.id === slotId);
    if (!targetSchedule || !canManageScheduleFaculty(targetSchedule)) {
      return {
        status: "restricted",
        message: targetSchedule
          ? getFacultyRestrictionMessage(targetSchedule)
          : facultyId === null
            ? "You cannot remove instructors for this course."
            : "You cannot assign instructors for this course."
      };
    }

    try {
      const response = await api.put<FacultyAssignResponse>(`/schedules/${slotId}`, {
        faculty_id: facultyId === null ? null : Number(facultyId),
        ...(confirmOverload ? { confirm_overload: true } : {}),
        ...(overrideConflicts && facultyId !== null ? { [OVERRIDE_CONFLICTS_FLAG]: true } : {})
      });
      const resData = response.data;
      const rawList: ApiScheduleRecord[] = resData.schedules
        ?? (resData.schedule ? [resData.schedule] : (resData.id ? [resData as ApiScheduleRecord] : []));

      return { status: "ok", schedules: rawList.map(mapApiScheduleToItem) };
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        toast.error("Sync Error", "This schedule has been removed or modified externally. Refreshing timetable...");
        clearCachedKey(schedulerCacheKey);
        void refreshData();

        return { status: "resynced" };
      }

      const confirmation = overloadConfirmationFrom(err);
      if (confirmation) {
        return { status: "needs_overload_confirmation", confirmation };
      }

      const question = facultyId === null ? null : conflictOverrideFrom(err);
      if (question) {
        return { status: "needs_conflict_override", question };
      }

      return {
        status: "failed",
        message: getApiErrorMessage(err)
          || (facultyId === null
            ? "Failed to remove faculty. Please try again."
            : "Failed to assign faculty. Please try again.")
      };
    }
  };

  const askConflictOverride = (question: ConflictOverrideQuestion): Promise<boolean> =>
    confirm({
      title: "Instructor has a conflict",
      message: conflictOverridePrompt(question),
      eyebrow: "Instructor conflict",
      confirmLabel: "Assign anyway",
    });

  const withAssignmentQuestions = async <T extends { status: string }>(
    send: (confirmOverload: boolean, overrideConflicts: boolean) => Promise<T>,
    overrideConflicts = false,
  ): Promise<T | null> => {
    let confirmOverload = false;
    let override = overrideConflicts;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = await send(confirmOverload, override);
      const question = outcome as unknown as { status: string; confirmation?: OverloadConfirmation; question?: ConflictOverrideQuestion };
      if (question.status === "needs_overload_confirmation" && question.confirmation && !confirmOverload) {
        if (!(await askOverloadConfirmation(question.confirmation))) return null;
        confirmOverload = true;
        continue;
      }
      if (question.status === "needs_conflict_override" && question.question && !override) {
        if (!(await askConflictOverride(question.question))) return null;
        override = true;
        continue;
      }
      return outcome;
    }
    return null;
  };

  const facultySuccessToast = (facultyId: string | null) => {
    if (facultyId === null) {
      toast.success("Instructor Assignment Removed", "Instructor removed from the schedule.");
      return;
    }
    const fac = faculties.find((f) => f.id === facultyId);
    toast.success("Instructor Assigned", `Successfully assigned ${fac?.name ?? "instructor"}.`);
  };

  const facultyFailureTitle = (facultyId: string | null) =>
    facultyId === null ? "Failed to remove faculty" : "Failed to assign faculty";

  const handlePopupFacultyMutation = async (slotId: string, facultyId: string | null, overrideConflicts = false) => {
    if (facultyActionSlotId === slotId) return;
    setFacultyActionSlotId(slotId);
    try {
      const outcome = await withAssignmentQuestions(
        (confirmOverload, override) => mutateScheduleFaculty(slotId, facultyId, confirmOverload, override),
        overrideConflicts,
      );
      if (outcome === null) return;
      if (outcome.status === "needs_overload_confirmation" || outcome.status === "needs_conflict_override") return;

      if (outcome.status === "restricted") {
        setPopupValidationError(outcome.message);
        return;
      }
      if (outcome.status === "resynced") return;
      if (outcome.status === "failed") {
        toast.error(facultyFailureTitle(facultyId), outcome.message);
      } else {
        applyUpdatedSchedules(outcome.schedules);
        facultySuccessToast(facultyId);
        void refreshSchedules();
      }
    } finally {
      setFacultyActionSlotId(null);
    }
    setFacultyAssignmentPopup(null);
  };

  const handleInlineFacultyMutation = async (slotId: string, facultyId: string | null) => {
    if (facultyActionSlotId === slotId) return;
    setFacultyActionSlotId(slotId);
    try {
      const outcome = await withAssignmentQuestions(
        (confirmOverload, override) => mutateScheduleFaculty(slotId, facultyId, confirmOverload, override),
      );
      if (outcome === null) return;
      if (outcome.status === "needs_overload_confirmation" || outcome.status === "needs_conflict_override") return;

      if (outcome.status === "restricted") {
        toast.error("Assignment Restricted", outcome.message);
      } else if (outcome.status === "failed") {
        toast.error(facultyFailureTitle(facultyId), outcome.message);
      } else if (outcome.status === "ok") {
        applyUpdatedSchedules(outcome.schedules);
        facultySuccessToast(facultyId);
        void refreshSchedules();
      }
    } finally {
      setFacultyActionSlotId(null);
    }
  };

  const handleAssignFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyAssignmentPopup) return;
    const { scheduleId, facultyId } = facultyAssignmentPopup;
    if (!facultyId) {
      setPopupValidationError("Please select a faculty member first.");
      return;
    }
    if (!faculties.some((f) => f.id === facultyId)) return;
    await handlePopupFacultyMutation(scheduleId, facultyId);
  };

  const handleRemoveFaculty = async () => {
    if (!facultyAssignmentPopup) return;
    await handlePopupFacultyMutation(facultyAssignmentPopup.scheduleId, null);
  };

  const handleInlineFacultyAssign = async (slotId: string, facId: string) => {
    if (!facId) return;
    if (!faculties.some((f) => f.id === facId)) return;
    await handleInlineFacultyMutation(slotId, facId);
  };

  const handleRemoveInlineFaculty = async (slotId: string) => {
    await handleInlineFacultyMutation(slotId, null);
  };

  const handleRemoveFacultyFromClass = async (scheduleIds: string[]): Promise<boolean> => {
    if (scheduleIds.length === 0 || facultyActionSlotId !== null) return false;

    setFacultyActionSlotId("bulk");
    const cleared = new Set<string>();
    try {
      for (const slotId of scheduleIds) {
        if (cleared.has(slotId)) continue;
        const outcome = await mutateScheduleFaculty(slotId, null);
        if (outcome.status === "restricted") throw new Error(outcome.message);
        if (outcome.status === "failed") throw new Error(outcome.message);
        if (outcome.status !== "ok") return false;
        applyUpdatedSchedules(outcome.schedules);
        outcome.schedules.filter((schedule) => !schedule.facultyId).forEach((schedule) => cleared.add(schedule.id));
        cleared.add(slotId);
      }
      toast.success("Instructor Removed", "The class no longer has an instructor and can be assigned again.");
      invalidateCacheGroups('schedules', 'dashboards', 'faculty');
      void refreshSchedules();
      return true;
    } catch (err: unknown) {
      toast.error("Unable to remove instructor", err instanceof Error ? err.message : "Please try again.");
      void refreshSchedules();
      return false;
    } finally {
      setFacultyActionSlotId(null);
    }
  };

  const submitBulkFacultyAssign = async (
    assignments: { scheduleIds: string[]; facultyId: string; overrideConflicts?: boolean }[],
    confirmOverload: boolean,
    overrideAll = false
  ): Promise<
    | { status: "ok"; schedules: ScheduleItem[] }
    | { status: "needs_overload_confirmation"; confirmation: OverloadConfirmation }
    | { status: "needs_conflict_override"; question: ConflictOverrideQuestion }
    | { status: "failed"; error: unknown }
  > => {
    try {
      const response = await api.patch<{ schedules?: ApiScheduleRecord[] }>("/schedules/batch-faculty", {
        assignments: assignments.map((assignment) => ({
          schedule_ids: assignment.scheduleIds.map(Number),
          faculty_id: Number(assignment.facultyId),
          ...(assignment.overrideConflicts ? { [OVERRIDE_CONFLICTS_FLAG]: true } : {}),
        })),
        ...(confirmOverload ? { confirm_overload: true } : {}),
        ...(overrideAll ? { [OVERRIDE_CONFLICTS_FLAG]: true } : {}),
      });

      return { status: "ok", schedules: (response.data.schedules ?? []).map(mapApiScheduleToItem) };
    } catch (err: unknown) {
      const confirmation = overloadConfirmationFrom(err);
      if (confirmation) {
        return { status: "needs_overload_confirmation", confirmation };
      }

      const question = conflictOverrideFrom(err);
      if (question) {
        return { status: "needs_conflict_override", question };
      }

      return { status: "failed", error: err };
    }
  };

  const handleBulkFacultyAssign = async (assignments: { scheduleIds: string[]; facultyId: string; overrideConflicts?: boolean }[]): Promise<boolean> => {
    if (assignments.length === 0 || facultyActionSlotId !== null) return false;

    setFacultyActionSlotId("bulk");
    try {
      for (const assignment of assignments) {
        const faculty = faculties.find((item) => item.id === assignment.facultyId);
        if (!faculty || assignment.scheduleIds.length === 0) {
          throw new Error("An instructor or selected schedule is no longer available.");
        }

        for (const slotId of assignment.scheduleIds) {
          const target = schedules.find((schedule) => schedule.id === slotId);
          if (!target || !canManageScheduleFaculty(target)) {
            throw new Error(target
              ? getFacultyRestrictionMessage(target)
              : "A selected schedule is no longer available.");
          }
        }
      }

      const outcome = await withAssignmentQuestions(
        (confirmOverload, overrideAll) => submitBulkFacultyAssign(assignments, confirmOverload, overrideAll),
      );
      if (outcome === null) return false;
      if (outcome.status !== "ok") {
        throw outcome.status === "failed"
          ? outcome.error
          : new Error("The assignments could not be confirmed.");
      }

      const assignedCount = assignments.reduce((total, assignment) => total + assignment.scheduleIds.length, 0);

      applyUpdatedSchedules(outcome.schedules);
      toast.success("Auto-Assign Complete", `${assignedCount} schedule${assignedCount === 1 ? "" : "s"} assigned successfully.`);
      void refreshSchedules();
      return true;
    } catch (err: unknown) {
      toast.error("Auto-Assign Failed", getApiErrorMessage(err) || (err instanceof Error ? err.message : "The assignments could not be completed."));
      void refreshSchedules();
      return false;
    } finally {
      setFacultyActionSlotId(null);
    }
  };

  const handleFacultyAssignmentDone = useCallback(async (done: boolean, scheduleIds?: string[]): Promise<boolean> => {
    const ids = (scheduleIds ?? sectionSchedules.map((schedule) => schedule.id)).map(Number);
    if (ids.length === 0) return false;
    try {
      const response = await api.patch<{ schedules?: ApiScheduleRecord[] }>("/schedules/batch-faculty-done", { ids, done });
      applyUpdatedSchedules((response.data.schedules ?? []).map(mapApiScheduleToItem));
      toast.success(done ? "Instructor Assignment Done" : "Instructor Assignment Editing", done ? "The receiving department can now view the assigned instructors." : "Instructor assignments are editable again.");
      void refreshSchedules();
      return true;
    } catch (err) {
      toast.error("Unable to update instructor assignment", getApiErrorMessage(err) ?? "Please try again.");
      return false;
    }
  }, [applyUpdatedSchedules, refreshSchedules, sectionSchedules, toast]);

  const isClearableInstructorSchedule = useCallback((schedule: ScheduleItem) => Boolean(schedule.facultyId)
    && !schedule.facultyAssignmentDone
    && schedule.status !== "finalized"
    && canManageScheduleFaculty(schedule), [canManageScheduleFaculty]);
  const clearableSectionInstructorCount = sectionSchedules.filter(isClearableInstructorSchedule).length;
  const clearableDepartmentInstructorSchedules = useMemo(() => {
    const departmentSectionIds = new Set(
      sections
        .filter((section) => selectedDepartmentId === null || Number(section.departmentId) === Number(selectedDepartmentId))
        .map((section) => section.id),
    );
    return schedules.filter((schedule) => departmentSectionIds.has(schedule.sectionId) && isClearableInstructorSchedule(schedule));
  }, [isClearableInstructorSchedule, schedules, sections, selectedDepartmentId]);
  const clearableDepartmentInstructorCount = clearableDepartmentInstructorSchedules.length;

  const handleClearSectionInstructors = useCallback(async (scope: "section" | "department" = "section"): Promise<boolean> => {
    const sectionIds = scope === "department"
      ? [...new Set(clearableDepartmentInstructorSchedules.map((schedule) => Number(schedule.sectionId)))]
      : [Number(selectedSectionId)];
    const clearableCount = scope === "department" ? clearableDepartmentInstructorCount : clearableSectionInstructorCount;
    if (!selectedSectionId || isClearingSectionInstructors || clearableCount === 0 || sectionIds.length === 0) return false;
    setIsClearingSectionInstructors(true);
    try {
      const response = await api.post<{
        schedules?: ApiScheduleRecord[];
        courses_cleared?: number;
      }>("/instructor-assignments/clear", { section_ids: sectionIds });
      applyUpdatedSchedules((response.data.schedules ?? []).map(mapApiScheduleToItem));
      const coursesCleared = Number(response.data.courses_cleared ?? 0);
      toast.success(
        "Instructors Cleared",
        `${coursesCleared} course ${coursesCleared === 1 ? "assignment was" : "assignments were"} cleared for ${scope === "department" ? "all sections" : "this section"}.`,
      );
      invalidateCacheGroups('schedules', 'approvals', 'dashboards', 'faculty', 'assignments');
      void refreshSchedules();
      return true;
    } catch (err) {
      toast.error("Unable to clear instructors", getApiErrorMessage(err) ?? "Please try again.");
      return false;
    } finally {
      setIsClearingSectionInstructors(false);
    }
  }, [applyUpdatedSchedules, clearableDepartmentInstructorCount, clearableDepartmentInstructorSchedules, clearableSectionInstructorCount, isClearingSectionInstructors, refreshSchedules, selectedSectionId, toast]);

  const getClassesCountForDay = useCallback((dayIdx: number) =>
    sectionSchedules.filter((s) => s.dayIndex === dayIdx).length, [sectionSchedules]);

  const toggleCategory = useCallback((category: string) =>
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] })), []);

  const handleSectionSelect = useCallback((sectionId: string) => {
    setSelectedSectionId(sectionId);
    setIsSectionDropdownOpen(false);
    setConflictInfo(null);
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
  }, []);

  const handleEditMovingSchedule = useCallback(() => {
    if (!movingScheduleId) return;
    const sched = schedules.find((s) => s.id === movingScheduleId);
    if (!sched) return;
    const courseIdToUse = sched.courseId ?? sched.subjectId;
    setDropContext({
      courseId: courseIdToUse,
      subjectId: courseIdToUse,
      dayIndex: sched.dayIndex,
      startSlot: sched.startSlot,
      isRescheduling: true,
      scheduleId: sched.id
    });
    setMovingScheduleId(null);
  }, [movingScheduleId, schedules]);

  const openScheduleInBuilder = useCallback((scheduleId: string): boolean => {
    const sched = schedules.find((s) => s.id === scheduleId);
    if (!sched) return false;
    const courseIdToUse = sched.courseId ?? sched.subjectId;
    if (sched.sectionId) handleSectionSelect(String(sched.sectionId));
    setDropContext({
      courseId: courseIdToUse,
      subjectId: courseIdToUse,
      dayIndex: sched.dayIndex,
      startSlot: sched.startSlot,
      isRescheduling: true,
      scheduleId: sched.id
    });

    return true;
  }, [schedules, handleSectionSelect]);

  const handleScheduleCardClick = useCallback((scheduleId: string) => {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return;
    const canAssignFaculty = isPhase2Active && currentStatus !== "finalized";
    if (canAssignFaculty) {
      setFacultyAssignmentPopup({
        scheduleId: schedule.id,
        facultyId: schedule.facultyId ?? ""
      });
      setPopupValidationError("");
      setPopupConflictWarning("");
      return;
    }
    if (isEditable) {
      setPlacementSubjectId(null);
      setConflictInfo(null);
      setDeleteConfirmScheduleId(null);
      setMovingScheduleId((prev) => (prev === scheduleId ? null : scheduleId));
    }
  }, [schedules, isPhase2Active, currentStatus, isEditable]);

  const handleSubjectCardClick = useCallback((subjectId: string) => {
    if (!isEditable) return;
    setMovingScheduleId(null);
    setConflictInfo(null);
    setPlacementSubjectId((prev) => (prev === subjectId ? null : subjectId));
  }, [isEditable]);

  const cancelPlacement = useCallback(() => {
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
  }, []);

  const handleCellClick = useCallback(async (dayIndex: number, timeIndex: number) => {
    if (!isEditable) return;
    if (isSummerWeekendBlocked(dayIndex)) {
      toast.error("Weekend Not Available", "Summer semester classes are scheduled Monday through Friday.");
      return;
    }

    if (placementSubjectId) {
      setDropContext({
        courseId: placementSubjectId,
        subjectId: placementSubjectId,
        dayIndex,
        startSlot: timeIndex,
        isRescheduling: false
      });
      setPlacementSubjectId(null);
      return;
    }

    if (movingScheduleId) {
      const sched = schedules.find((s) => s.id === movingScheduleId);
      if (!sched) {
        setMovingScheduleId(null);
        return;
      }
      const conflict = checkMoveConflict(sched.id, dayIndex, timeIndex);
      if (conflict) {
        setConflictInfo({
          dayIndex,
          startSlot: timeIndex,
          durationSlots: sched.durationSlots,
          message: conflict.message,
          title: conflict.title
        });
        return;
      }
      const dayName = FULL_DAY_NAMES[dayIndex];
      const startTime24h = slotToTime24h(timeIndex);
      const endTime24h = slotToTime24h(timeIndex + sched.durationSlots);

      let releasedRules: Array<{ course_id: number; day: string }> | null = null;
      try {
        releasedRules = await releaseRequiredDayForMove(String(sched.courseId ?? sched.subjectId ?? ""), dayIndex);
        const response = await api.put<ApiScheduleRecord>(`/schedules/${sched.id}`, {
          day: dayName,
          start_time: startTime24h,
          end_time: endTime24h
        });
        releasedRules = null;
        applyUpdatedSchedules(relocatedRows(response.data));
        toast.success("Schedule Relocated", "Class schedule successfully relocated.");
        void refreshSchedules();
      } catch (err) {
        void restoreRequiredDays(releasedRules);
        if (isNotFoundError(err)) {
          toast.error("Sync Error", "This schedule has been removed or modified externally. Refreshing timetable...");
          clearCachedKey(schedulerCacheKey);
          void refreshData();
          return;
        }
        triggerConflictReminder();
        const apiMsg = getApiErrorMessage(err);
        toast.error("Failed to relocate schedule", apiMsg || "An error occurred.");
      } finally {
        setMovingScheduleId(null);
        setConflictInfo(null);
      }
    }
  }, [isEditable, placementSubjectId, movingScheduleId, schedules, checkMoveConflict, applyUpdatedSchedules, refreshSchedules, refreshData, schedulerCacheKey, triggerConflictReminder, toast, isSummerWeekendBlocked, releaseRequiredDayForMove, restoreRequiredDays]);


  const activeSemesterText = useMemo(() => {
    if (!activeSemester) return "";
    const semMap: Record<string, string> = {
      '1st': '1st Semester',
      '2nd': '2nd Semester',
      'summer': 'Summer'
    };
    const sem = semMap[activeSemester.semester] || activeSemester.semester || '';
    return `${sem} AY ${activeSemester.academic_year || ''}`;
  }, [activeSemester]);

  return {
    userDepartmentId: user?.department_id ?? null,
    userProgramId: user?.program_id ?? null,
    schedulingReady,
    placed,
    activeSemesterText,
    dragSubjectId,
    draggedScheduleId,
    dragFromCell,
    deleteConfirmScheduleId,
    setDeleteConfirmScheduleId,
    placementSubjectId,
    movingScheduleId,
    handleSubjectCardClick,
    handleCellClick,
    cancelPlacement,
    searchQuery,
    setSearchQuery,
    subjectClassFilter,
    setSubjectClassFilter,
    hoveredCell,
    schedules,
    rooms,
    sections,
    subjects,
    faculties,
    isLoading,
    isModalLoading,
    setSchedules,
    selectedSectionId,
    groupedSections,
    dropContext,
    setDropContext,
    modalRoomId,
    setModalRoomId,
    modalClassMode,
    setModalClassMode: applyModalClassMode,
    modalDay2RoomId,
    setModalDay2RoomId,
    modalDay2ClassMode,
    setModalDay2ClassMode: applyModalDay2ClassMode,
    modalIsHybrid,
    setModalIsHybrid,
    modalSplitEnabled,
    setModalSplitEnabled,
    modalFieldEnabled,
    setModalFieldEnabled,
    modalForceDayEnabled,
    setModalForceDayEnabled,
    modalForcedDayIndex,
    setModalForcedDayIndex,
    manualSchedulingSettings,
    modalPreferredPattern,
    setModalPreferredPattern: applyModalPreferredPattern,
    modalDay1Index,
    setModalDay1Index,
    modalDay2Index,
    setModalDay2Index,
    modalDay1StartSlot,
    setModalDay1StartSlot: applyModalDay1StartSlot,
    modalDay1Duration,
    setModalDay1Duration,
    modalDay2StartSlot,
    setModalDay2StartSlot,
    modalDay2Duration,
    setModalDay2Duration,
    isDay2ModifiedByUser,
    setIsDay2ModifiedByUser,
    modalValidationError,
    setModalValidationError,
    modalConflict,
    handleEditMovingSchedule,
    openScheduleInBuilder,
    facultyAssignmentPopup,
    facultyActionSlotId,
    isClearingSectionInstructors,
    setFacultyAssignmentPopup,
    popupValidationError,
    popupConflictWarning,
    overloadPrompt,
    confirmOverloadPrompt,
    cancelOverloadPrompt,
    isSectionDropdownOpen,
    setIsSectionDropdownOpen,
    isClearAllModalOpen,
    sectionClearCandidates,
    isClearingAll,
    isSubmitApprovalModalOpen,
    isWithdrawSubmissionModalOpen,
    isSubmittingSchedule,
    isWithdrawingSubmission,
    confirmSubmitForApproval,
    confirmWithdrawSubmission,
    cancelWithdrawSubmission,
    cancelSubmitForApproval,
    confirmClearAll,
    cancelClearAll,
    isRoomViewOpen,
    setIsRoomViewOpen,
    isPrintModalOpen,
    setIsPrintModalOpen,
    activeSemester,
    departments,
    users,
    roomViewRoomId,
    setRoomViewRoomId,
    isAssignedListCollapsed,
    setIsAssignedListCollapsed,
    collapsedCategories,
    conflictInfo,
    setConflictInfo,
    currentStatus,
    isPhase2Active,
    isEditable,
    ownsSelectedProgram,
    ownsProgram,
    canEditProgramIds,
    isPhase1Completed,
    isPhase2Completed,
    facultyAssignmentDone,
    sectionSchedules,
    scheduledSubjectIds,
    totalSubjects,
    totalScheduled,
    totalSlotsCount,
    assignedSlotsCount,
    unassignedSlotsCount,
    clearableSectionInstructorCount,
    clearableDepartmentInstructorCount,
    departmentSectionProgress,
    departmentTotalSections,
    departmentDoneSections,
    departmentRemainingSections,
    departmentReadyToSubmit,
    departmentHasSubmittedSchedule,
    departmentHasWithdrawableSubmission,
    departmentWithdrawalStage,
    dropSubject,
    dropSubjectIsField,
    listCategories,
    filteredSubjects,
    sectionCourses,
    checkConflict,
    conflictedMap,
    resolvedIds: allResolvedIds,
    conflictCounts,
    refreshConflictCounts,
    modalWasConflicted,
    modalRun,
    modalConsecutiveDays,
    setModalConsecutiveDays,
    checkFacultyConflict,
    canManageScheduleFaculty,
    getFacultyRestrictionMessage,
    getDragOverConflict,
    handleConfirmSchedule,
    handleModalConfirm,
    handleRemoveSchedule,
    handleClearAll,
    handleSubmitForApproval,
    handleWithdrawSubmission,
    canWithdrawSubmission,
    canGenerateSchedule,
    canSubmitSchedule,
    canAssignInstructor,
    canUpdateSchedule,
    handleResubmit,
    handleFinalize,
    sectionFinalizeCandidates,
    sectionReassignCandidates,
    isReassignSectionsModalOpen,
    cancelReassignSections,
    confirmReassignSections,
    isFinalizeSectionsModalOpen,
    cancelFinalizeSections,
    confirmFinalizeSections,
    handleEditSection,
    isEditingSection,
    isResubmittingSection,
    isFinalizing,
    handlePopupFacultyChange,
    handleAssignFaculty,
    handleRemoveFaculty,
    handleInlineFacultyAssign,
    handleBulkFacultyAssign,
    handleRemoveFacultyFromClass,
    handleFacultyAssignmentDone,
    handleClearSectionInstructors,
    handleRemoveInlineFaculty,
    handleAcceptedRecommendation,
    reloadSchedulingSettings,
    refreshSchedules,
    refreshData,
    getClassesCountForDay,
    toggleCategory,
    handleSectionSelect,
    handleScheduleCardClick,
    isWideView,
    handleToggleWideView,
    ...dragDrop
  };
};
