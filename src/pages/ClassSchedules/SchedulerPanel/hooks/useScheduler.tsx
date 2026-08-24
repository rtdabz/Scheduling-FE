import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  DAYS,
  getSubjectClassification,
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
  Subject,
  Term,
  UserSummary,
  WithdrawalStage
} from "../types";
import { getCourseSlotPlan } from "../courseSlotPlan";
import { getSubjectTotalSlots } from "../types";
import { isMajorSubject, majorTeachingDepartmentId } from "../facultyEligibility";

import type { SubjectClassification } from "../constants";
import type { InitialDataResponse, SchedulerCacheData } from "./initialDataMapper";
import {
  hasUsableSchedulerCache,
  mapApiScheduleToItem,
  mapInitialData,
  slotToTime24h
} from "./initialDataMapper";
import { buildPlacementSessionKey } from "./placementSession";
import { requiredRoomTypeForMeeting, useConflict } from "./useConflict";
import { useDragDrop } from "./useDragDrop";
import { useToast } from "../../../../context/ToastContext";
import api from "../../../../lib/api";
import { getCachedData, loadCachedData, setCachedData, clearCachedKey } from "../../../../lib/dataCache";
import { getStoredUser } from "../../../../lib/storedUser";
import { overloadConfirmationFrom, type OverloadConfirmation } from "../../../../lib/overloadConfirmation";
import { buildPreferredPattern, FULL_DAY_NAMES, parsePreferredPattern, slotCount } from "../../../../lib/timeGrid";

const isNotFoundError = (err: unknown): boolean => {
  return (
    err !== null &&
    typeof err === "object" &&
    "response" in err &&
    (err as any).response?.status === 404
  );
};

const getNextMeetingDayIndex = (dayIndex: number): number => (dayIndex + 1) % DAYS.length;

const ROOM_TBA = "tba";

const sortSplitMeetingsForEdit = (items: ScheduleItem[], subject?: Subject | null): ScheduleItem[] => {
  const lectureSlots = Number(subject?.lectureHours ?? 0) * 2;
  const labSlots = Number(subject?.labHours ?? 0) * 6;
  const meetingRank = (item: ScheduleItem): number => {
    if (item.meetingType === "lecture") return 0;
    if (item.meetingType === "laboratory") return 1;
    if (lectureSlots > 0 && item.durationSlots === lectureSlots) return 0;
    if (labSlots > 0 && item.durationSlots === labSlots) return 1;
    return 2;
  };

  return [...items].sort((a, b) =>
    meetingRank(a) - meetingRank(b)
    || a.dayIndex - b.dayIndex
    || a.startSlot - b.startSlot
  );
};

const departmentReadyStatuses: ScheduleItem["status"][] = [
  "completed",
  "submitted",
  "approved_by_dean",
  "approved",
  "faculty_assignment",
  "finalized"
];

const departmentSubmittedStatuses: ScheduleItem["status"][] = [
  "submitted",
  "approved_by_dean",
  "approved",
  "faculty_assignment",
  "finalized"
];

const departmentWithdrawableStatuses: ScheduleItem["status"][] = [
  "submitted",
  "approved_by_dean",
  "approved",
  "faculty_assignment"
];


interface AtomicScheduleResponse {
  schedules: ApiScheduleRecord[];
  deleted_schedule_ids: number[];
}

interface AcceptedRecommendationResponse {
  schedules: ApiScheduleRecord[];
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
  const { toast } = useToast();
  const user = getStoredUser();
  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const canWithdrawSubmission = ['secretary', 'program_head'].includes(user?.role?.toLowerCase() ?? '');
  const schedulerCacheKey = `scheduler:v15:${user?.role ?? 'user'}:${user?.id ?? user?.department_id ?? 'current'}:${user?.program_id ?? 'all'}`;
  const cachedSchedulerData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
  const canUseInitialCache = hasUsableSchedulerCache(cachedSchedulerData);
  const [rooms, setRooms] = useState<Room[]>(canUseInitialCache ? cachedSchedulerData.rooms : []);
  const [sections, setSections] = useState<Section[]>(canUseInitialCache ? cachedSchedulerData.sections : []);
  const [subjects, setSubjects] = useState<Subject[]>(canUseInitialCache ? cachedSchedulerData.subjects : []);
  const [faculties, setFaculties] = useState<Faculty[]>(canUseInitialCache ? cachedSchedulerData.faculties : []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(canUseInitialCache ? cachedSchedulerData.activeTerm : null);
  const [departments, setDepartments] = useState<Department[]>(canUseInitialCache ? cachedSchedulerData.departments : []);
  const [users, setUsers] = useState<UserSummary[]>(canUseInitialCache ? cachedSchedulerData.users : []);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(canUseInitialCache ? cachedSchedulerData.schedules : []);
  const [fieldCourseAssignmentEnabled, setFieldCourseAssignmentEnabled] = useState<boolean>(
    canUseInitialCache ? cachedSchedulerData.fieldCourseAssignmentEnabled : false
  );
  const [fieldCourseCodes, setFieldCourseCodes] = useState<string[]>(
    canUseInitialCache ? cachedSchedulerData.fieldCourseCodes : []
  );
  const [isLoading, setIsLoading] = useState(!canUseInitialCache);
  const [isMarkingSectionDone, setIsMarkingSectionDone] = useState(false);
  const [isEditingSection, setIsEditingSection] = useState(false);
  const [isResubmittingSection, setIsResubmittingSection] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
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

  // Single parallel fetch for all reference data on mount
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
      setActiveTerm(cachedData.activeTerm);
      setDepartments(cachedData.departments);
      setUsers(cachedData.users);
      setSections(cachedData.sections);
      setSchedules(cachedData.schedules);
      setFieldCourseAssignmentEnabled(cachedData.fieldCourseAssignmentEnabled);
      setFieldCourseCodes(cachedData.fieldCourseCodes);
      if (!selectedSectionId && cachedData.sections.length > 0) {
        setSelectedSectionId(cachedData.sections[0].id);
      }
      setIsLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    const fetchInitialData = api.get<InitialDataResponse>('/initial-data', { signal });

    if (subjects.length === 0) {
      setIsLoading(true);
    }

    loadCachedData<SchedulerCacheData>(schedulerCacheKey, async () => {
      const response = await fetchInitialData;
      return mapInitialData(response.data, { isVpaa, userDepartmentId: user?.department_id });
    }, !canUseCachedData)
      .then((data) => {
        if (!active) return;

        setRooms(data.rooms);
        setSubjects(data.subjects);
        setFaculties(data.faculties);
        setActiveTerm(data.activeTerm);
        setDepartments(data.departments);
        setUsers(data.users);
        setSections(data.sections);
        setSchedules(data.schedules);
        setFieldCourseAssignmentEnabled(data.fieldCourseAssignmentEnabled);
        setFieldCourseCodes(data.fieldCourseCodes);
        setSelectedSectionId((prev) => (prev && data.sections.some((sec) => sec.id === prev) ? prev : (data.sections[0]?.id ?? "")));
      })
      .catch(() => {
        if (active && !signal.aborted) {
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




  const [dragSubjectId, setDragSubjectId] = useState<string | null>(null);
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [dragFromCell, setDragFromCell] = useState<string | null>(null);
  const [deleteConfirmScheduleId, setDeleteConfirmScheduleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [subjectClassFilter, setSubjectClassFilter] = useState<SubjectClassification>("all");
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Click-to-place / click-to-move (mouse-free alternative to drag-and-drop)
  const [placementSubjectId, setPlacementSubjectId] = useState<string | null>(null);
  const [movingScheduleId, setMovingScheduleId] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length === 0) return;
    if (!selectedSectionId || !sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(sections[0].id);
    }
  }, [sections, selectedSectionId]);


  /**
   * Summer terms run Monday–Friday. useDragDrop enforces this on the drag path;
   * this is the same rule for the click-to-place and relocate paths.
   */
  const isSummerWeekendBlocked = useCallback(
    (dayIndex: number) => activeTerm?.semester === "summer" && dayIndex >= 5,
    [activeTerm?.semester],
  );

  const refreshSchedules = useCallback(async () => {
    try {
      const url = activeTerm ? `/schedules/term/${activeTerm.id}` : '/schedules';
      const res = await api.get<ApiScheduleRecord[]>(url);
      let apiData = res.data;
      if (activeTerm) {
        apiData = apiData.filter((item) => Number(item.term_id) === Number(activeTerm.id));
      }
      const mapped = apiData.map(mapApiScheduleToItem);
      setSchedules(mapped);
      const cachedData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
      if (cachedData) {
        setCachedData<SchedulerCacheData>(schedulerCacheKey, {
          ...cachedData,
          schedules: mapped,
        });
      }
    } catch {
      // A failed refresh used to be swallowed entirely, leaving the grid showing
      // stale rows with no indication. It is not fatal — the local state is still
      // usable — so it surfaces as a warning rather than an error.
      toast.error("Timetable Not Refreshed", "The timetable could not be refreshed. What you see may be out of date; reload to try again.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTerm, schedulerCacheKey]);

  const handleAcceptedRecommendation = useCallback(
    (newSchedules?: ApiScheduleRecord[]) => {
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
          const cachedData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
          if (cachedData) {
            setCachedData<SchedulerCacheData>(schedulerCacheKey, {
              ...cachedData,
              schedules: updated,
            });
          }
          return updated;
        });
      }
      void refreshSchedules();
    },
    [refreshSchedules, schedulerCacheKey]
  );

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      clearCachedKey(schedulerCacheKey);
      const response = await api.get<InitialDataResponse>('/initial-data');
      const freshData = mapInitialData(response.data, { isVpaa, userDepartmentId: user?.department_id });

      setCachedData<SchedulerCacheData>(schedulerCacheKey, freshData);
      setRooms(freshData.rooms);
      setSubjects(freshData.subjects);
      setFaculties(freshData.faculties);
      setActiveTerm(freshData.activeTerm);
      setDepartments(freshData.departments);
      setUsers(freshData.users);
      setFieldCourseAssignmentEnabled(freshData.fieldCourseAssignmentEnabled);
      setFieldCourseCodes(freshData.fieldCourseCodes);
      setSections(freshData.sections);
      setSchedules(freshData.schedules);
      toast.success("Synchronized", "Successfully loaded fresh sections and schedules from database.");
    } catch {
      toast.error("Synchronize Failed", "Could not load fresh data from database.");
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVpaa, schedulerCacheKey, user?.department_id]);

  const applyUpdatedSchedules = useCallback((updatedSchedules: ScheduleItem[]) => {
    const updatedScheduleMap = new Map(updatedSchedules.map((schedule) => [schedule.id, schedule]));
    setSchedules((previousSchedules) => {
      const nextSchedules = previousSchedules.map((schedule) =>
        updatedScheduleMap.get(schedule.id) ?? schedule
      );
      const cachedData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
      if (cachedData) {
        setCachedData<SchedulerCacheData>(schedulerCacheKey, {
          ...cachedData,
          schedules: nextSchedules,
        });
      }
      return nextSchedules;
    });
  }, [schedulerCacheKey]);

  const isInitialLoadedRef = useRef(false);

  useEffect(() => {
    if (activeTerm) {
      if (isInitialLoadedRef.current) {
        refreshSchedules();
      } else {
        isInitialLoadedRef.current = true;
      }
    }
  }, [activeTerm, refreshSchedules]);

  const [dropContext, setDropContext] = useState<DropContext | null>(null);
  const [modalRoomId, setModalRoomId] = useState<string>("");
  const [modalClassMode, setModalClassMode] = useState<DeliveryMode>("on-site");
  const [modalDay2RoomId, setModalDay2RoomId] = useState<string>("");
  const [modalDay2ClassMode, setModalDay2ClassMode] = useState<DeliveryMode>("on-site");
  const [modalIsHybrid, setModalIsHybrid] = useState<boolean>(false);
  const [modalPreferredPattern, setModalPreferredPattern] = useState<string | null>(null);
  const [modalDay1Index, setModalDay1Index] = useState<number>(0);
  const [modalDay2Index, setModalDay2Index] = useState<number>(2);
  const [modalDay1StartSlot, setModalDay1StartSlot] = useState<number>(0);
  const [modalDay1Duration, setModalDay1Duration] = useState<number>(0);
  const [modalDay2StartSlot, setModalDay2StartSlot] = useState<number>(0);
  const [modalDay2Duration, setModalDay2Duration] = useState<number>(0);
  const [isDay2ModifiedByUser, setIsDay2ModifiedByUser] = useState<boolean>(false);
  const [modalValidationError, setModalValidationError] = useState<string>("");
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<number | null>(null);

  const [facultyAssignmentPopup, setFacultyAssignmentPopup] = useState<FacultyAssignmentPopupState | null>(null);
  const [facultyActionSlotId, setFacultyActionSlotId] = useState<string | null>(null);
  const [popupValidationError, setPopupValidationError] = useState<string>("");
  const [popupConflictWarning, setPopupConflictWarning] = useState<string>("");
  // The server decides when an assignment crosses an instructor's Basic Load, so
  // the answer has to travel back to whichever write is waiting on it. Keeping
  // the resolver beside the payload lets that write stay awaited across the
  // prompt, which is what allows "No" to leave the popup as the user left it.
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

  // Memoize derived section schedules to avoid repeated filtering
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

    // Selecting another section changes the derived status, but it is ordinary
    // navigation and should not force the WICARS Buddy chat open.
    if (previousContext && previousContext.sectionId !== selectedSectionId) return;

    if (currentStatus === "approved" || currentStatus === "approved_by_dean") {
      window.dispatchEvent(
        new CustomEvent("show-helper-buddy", {
          detail: {
            id: crypto.randomUUID(),
            type: "approved",
            status: currentStatus,
            text: "The submitted schedule has been approved/rejected by the Dean/VPAA.",
          },
        })
      );
    } else if (currentStatus === "rejected" || currentStatus === "rejected_by_dean" || currentStatus === "revision") {
      window.dispatchEvent(
        new CustomEvent("show-helper-buddy", {
          detail: {
            id: crypto.randomUUID(),
            type: "rejected",
            status: currentStatus,
            text: "The submitted schedule has been approved/rejected by the Dean/VPAA.",
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

  const isPhase2Active = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isEditable = currentStatus === "draft" || currentStatus === "revision";
  const isPhase1Completed = ["completed", "approved", "faculty_assignment", "finalized"].includes(currentStatus);
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

  const sectionCourses = useMemo(() => {
    if (!selectedSection) return subjects;
    const selectedSemester = normalizeSemester(selectedSection.semester);
    return subjects.filter((s) => {
      const isMinor = s.category === "minor";
      const matchesDept =
        isMinor ||
        s.departmentId === null ||
        Number(s.departmentId) === Number(selectedSection.departmentId);
      const matchesYear = Number(s.yearLevel) === Number(selectedSection.yearLevel);
      const matchesSem =
        !selectedSemester ||
        !s.semester ||
        normalizeSemester(s.semester) === selectedSemester;
      return matchesDept && matchesYear && matchesSem;
    });
  }, [subjects, selectedSection, normalizeSemester]);

  const semesterSubjects = useMemo(() => {
    if (subjects.length === 0) return [];
    if (!activeTerm?.semester) return subjects;
    const activeSem = normalizeSemester(activeTerm.semester);
    return subjects.filter((s) => {
      if (!s.semester) return true;
      const subSem = normalizeSemester(s.semester);
      return subSem === activeSem;
    });
  }, [subjects, activeTerm, normalizeSemester]);

  const totalSubjects = useMemo(() => {
    if (!selectedSection) return semesterSubjects.length;
    return semesterSubjects.filter((s) => s.yearLevel === selectedSection.yearLevel).length;
  }, [semesterSubjects, selectedSection]);

  const totalScheduled = useMemo(
    () => new Set(sectionSchedules.map((s) => s.subjectId)).size,
    [sectionSchedules]
  );

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

    const subjectCountByYear = new Map<number, number>();
    semesterSubjects.forEach((subject) => {
      if (!subject.yearLevel) return;
      subjectCountByYear.set(subject.yearLevel, (subjectCountByYear.get(subject.yearLevel) ?? 0) + 1);
    });

    return sections
      .filter((section) => Number(section.departmentId) === Number(selectedDepartmentId))
      .sort((a, b) => a.yearLevel - b.yearLevel || a.name.localeCompare(b.name))
      .map((section) => {
        const sectionScheduleItems = schedulesBySection.get(section.id) ?? [];
        const requiredSubjects = subjectCountByYear.get(section.yearLevel) ?? 0;
        const plottedSubjects = new Set(sectionScheduleItems.map((schedule) => schedule.subjectId)).size;
        const status = sectionScheduleItems.length > 0 ? sectionScheduleItems[0].status : "draft";
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
          assignedInstructorBlocks: sectionScheduleItems.filter((schedule) => Boolean(schedule.facultyId)).length
        };
      });
  }, [schedules, sections, selectedDepartmentId, selectedSectionId, semesterSubjects]);

  const departmentTotalSections = departmentSectionProgress.length;
  const departmentDoneSections = departmentSectionProgress.filter((section) => section.isDone).length;
  const departmentRemainingSections = Math.max(0, departmentTotalSections - departmentDoneSections);
  const departmentHasSubmittedSchedule = departmentSectionProgress.some((section) =>
    departmentSubmittedStatuses.includes(section.status)
  );
  const departmentHasWithdrawableSubmission = departmentSectionProgress.some((section) =>
    departmentWithdrawableStatuses.includes(section.status)
  );
  const departmentWithdrawalStage: WithdrawalStage = departmentSectionProgress.some((section) =>
    section.status === "approved" || section.status === "faculty_assignment"
  )
    ? "vpaa_approved"
    : departmentSectionProgress.some((section) => section.status === "approved_by_dean")
      ? "vpaa_review"
      : "dean_review";
  const departmentReadyToSubmit =
    departmentTotalSections > 0 &&
    departmentRemainingSections === 0 &&
    !departmentHasSubmittedSchedule &&
departmentSectionProgress.every((section) => section.status === "completed");

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
      // Year-level filter — respects the currently selected section's year
      if (selectedSection && subject.yearLevel !== selectedSection.yearLevel) {
        return false;
      }

      if (subjectClassFilter !== "all" && getSubjectClassification(subject.category) !== subjectClassFilter) {
        return false;
      }

      const term = searchQuery.toLowerCase().trim();
      if (!term) return true;
      return (
        subject.code.toLowerCase().includes(term) ||
        subject.name.toLowerCase().includes(term)
      );
    });
  }, [semesterSubjects, selectedSection, subjectClassFilter, searchQuery]);

  const { checkConflict, checkFacultyConflict, getDragOverConflict, conflictedMap } = useConflict({
    schedules,
    selectedSectionId,
    dragSubjectId,
    draggedScheduleId,
    rooms,
    sections,
    departments,
    subjects,
    faculties,
    fieldCourseAssignmentEnabled,
    fieldCourseCodes
  });

  const canManageScheduleFaculty = useCallback((schedule: ScheduleItem): boolean => {
    const subject = subjects.find((item) => item.id === schedule.subjectId);

    // A major is assigned by the department that offers it; a GEC service course
    // by the college that owns it. Everything else is open to any department.
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
  }, [subjects, user?.department_id]);

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

  // Derive placed map from schedules — no extra state or render cycle needed
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

  // Read-only snapshot for the init effect: it needs current reference data
  // when a session opens, but must not re-run when that data changes.
  const placementDataRef = useRef({ schedules, subjects, rooms, fieldCourseAssignmentEnabled, fieldCourseCodes, dropContext });
  placementDataRef.current = { schedules, subjects, rooms, fieldCourseAssignmentEnabled, fieldCourseCodes, dropContext };

  useEffect(() => {
    const { schedules, subjects, rooms, fieldCourseAssignmentEnabled, fieldCourseCodes, dropContext } = placementDataRef.current;

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

      // A single meeting is `units * 2` slots whatever the course's components —
      // the hardcoded 6 this replaces was a 3-unit answer applied to every major
      // with both a lecture and a laboratory (audit finding #19).
      const plan = getCourseSlotPlan(subject);
      const singleSlots = plan.singleBlockSlots || totalSlots;
      const splitDay2Slots = singleSlots;



      if (isFieldSubject) {
        setModalClassMode("field");
        setModalRoomId("");
        setModalDay2RoomId("");
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
          // Fallback room/mode for single-meeting path.
          // The 2-meeting path below overrides these with sorted[0] values.
          setModalRoomId(targetSched.roomId || (targetSched.mode === "on-site" ? ROOM_TBA : targetSched.mode));
          setModalClassMode(targetSched.mode ?? "on-site");
          setModalIsHybrid(targetSched.isHybrid ?? false);
          setModalPreferredPattern(targetSched.preferredPattern ?? null);
          const patternDays = parsePreferredPattern(targetSched.preferredPattern);

          const existing = schedules.filter(
            (s) => s.subjectId === targetSched.subjectId && s.sectionId === selectedSectionId
          );
          const sorted = sortSplitMeetingsForEdit(existing, subject);

          if (sorted.length >= 2) {
            // Preserve each stored meeting exactly. Editing must not silently
            // convert a saved on-site lecture to Online just because it is the
            // lecture component of a split course.
            setModalRoomId(sorted[0].roomId || (sorted[0].mode === "on-site" ? ROOM_TBA : sorted[0].mode));
            setModalClassMode(sorted[0].mode ?? "on-site");
            setModalDay1Index(sorted[0].dayIndex);
            setModalDay2Index(sorted[1].dayIndex);
            setModalPreferredPattern(buildPreferredPattern(sorted[0].dayIndex, sorted[1].dayIndex));
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
          // Derived, not subject.roomTypeRequired: an unsplit course with a
          // laboratory component needs a laboratory room (RuleEngine parity).
          const requiredRoomType = requiredRoomTypeForMeeting(subject);
          const matchingTypeRooms = rooms.filter(r =>
            (r.status === "available" || !r.status) &&
            (!requiredRoomType || r.roomType === requiredRoomType)
          );
          const availableRooms = rooms.filter(r =>
            (r.status === "available" || !r.status) &&
            (r.roomType === "lecture" || r.roomType === "laboratory")
          );
          const nonConflictingRoom = matchingTypeRooms.find(r => {
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
          resolvedRoomId = nonConflictingRoom?.id || (matchingTypeRooms.length > 0 ? matchingTypeRooms[0].id : (availableRooms.length > 0 ? availableRooms[0].id : ""));
        }

        const requiredRoomType = requiredRoomTypeForMeeting(subject);
        setModalRoomId(resolvedRoomId || (requiredRoomType === "laboratory" ? ROOM_TBA : ""));
        setModalClassMode("on-site");
        setModalIsHybrid(false);
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
    } else {
      setModalRoomId("");
      setModalClassMode("on-site");
      setModalIsHybrid(false);
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
  // Everything else is read from placementDataRef, which is deliberately not
  // a dependency — see placementSessionKey above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementSessionKey]);

  /**
   * Default physical room for the current course, used when a meeting switches
   * back to on-site from a virtual mode.
   */
  const resolveDefaultPhysicalRoomId = useCallback((): string => {
    const subject = dropContext ? subjects.find((s) => String(s.id) === String(dropContext.subjectId)) : null;
    const isUsable = (room: Room) => room.status === "available" || !room.status;
    const requiredRoomType = requiredRoomTypeForMeeting(subject ?? undefined);
    const matchingTypeRooms = rooms.filter(
      (room) => isUsable(room) && (!requiredRoomType || room.roomType === requiredRoomType)
    );
    if (matchingTypeRooms.length > 0) return matchingTypeRooms[0].id;

    const physicalRooms = rooms.filter(
      (room) => isUsable(room) && (room.roomType === "lecture" || room.roomType === "laboratory")
    );

    if (physicalRooms.length > 0) return physicalRooms[0].id;
    return requiredRoomType === "laboratory" ? ROOM_TBA : "";
  }, [dropContext, subjects, rooms]);

  /**
   * Mode and pattern changes below are handled in the setters rather than in
   * effects that watch the resulting state.
   *
   * Three effects used to do this work, each firing an extra render pass, and
   * two of them read the very field they were correcting without depending on
   * it — so they acted on a stale value (audit finding #13).
   */
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
    // Meeting 2 mirrors meeting 1 until the user moves it themselves.
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

  /**
   * Conflict message for the placement currently described by the modal.
   *
   * Derived, not stored. This used to be an effect that wrote the message into
   * state, so every field change cost a second render pass, and its dependency
   * list was missing checkConflict, schedules, selectedSectionId and subjects.
   */
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

    if (!patternDays) {
      return checkConflict(
        courseId, selectedSectionId, null, modalRoomId,
        modalDay1Index, modalDay1StartSlot, singleSlots, excludeIds, modalPreferredPattern
      )?.message ?? null;
    }

    const meeting1 = modalDay1Duration > 0
      ? checkConflict(
          courseId, selectedSectionId, null, modalRoomId,
          patternDays[0], modalDay1StartSlot, modalDay1Duration, excludeIds, modalPreferredPattern
        )
      : null;
    if (meeting1) return meeting1.message;

    const meeting2 = modalDay2Duration > 0
      ? checkConflict(
          courseId, selectedSectionId, null, modalDay2RoomId,
          patternDays[1], modalDay2StartSlot, modalDay2Duration, excludeIds, modalPreferredPattern
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
    schedules,
    selectedSectionId,
    subjects,
    checkConflict
  ]);

  const onScheduleRelocated = useCallback(async (scheduleId: string, dayIndex: number, startSlot: number) => {
    const sched = schedules.find((s) => s.id === scheduleId);
    if (!sched) return;
    // Mirrors the drag path's guard (useDragDrop.handleDragOver/handleDrop).
    // GridCell already blocks the interaction; this closes the code path.
    if (isSummerWeekendBlocked(dayIndex)) {
      toast.error("Weekend Not Available", "Summer term classes are scheduled Monday through Friday.");
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

    try {
      const response = await api.put<ApiScheduleRecord>(`/schedules/${scheduleId}`, {
        day: dayName,
        start_time: startTime24h,
        end_time: endTime24h
      });
      const updatedSchedule = mapApiScheduleToItem(response.data);
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          schedule.id === updatedSchedule.id ? updatedSchedule : schedule
        )
      );
      toast.success("Schedule Relocated", "Class schedule successfully updated.");
      await refreshSchedules();
    } catch (err) {
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
  }, [schedules, refreshSchedules, refreshData, schedulerCacheKey]);

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
    checkConflict,
    onScheduleRelocated,
    activeTerm
  });

  const handleConfirmSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropContext || !activeTerm) return;
    if (!modalRoomId) {
      setModalValidationError("Please select a Room before confirming.");
      return;
    }
    const subject = subjects.find((s) => s.id === dropContext.subjectId);
    if (!subject) return;

    const totalSlots = getSubjectTotalSlots(subject);
    const singleSlots = getCourseSlotPlan(subject).singleBlockSlots || totalSlots;

    const d1 = modalDay1Duration;
    const d2 = modalPreferredPattern ? modalDay2Duration : 0;
    const patternDays = parsePreferredPattern(modalPreferredPattern);

    if (patternDays && (d1 <= 0 || d2 <= 0)) {
      setModalValidationError("Each meeting must have a duration greater than zero.");
      return;
    }





    // Exclude current slots from conflict checking when rescheduling

    const excludeIds = dropContext.isRescheduling
      ? schedules.filter(s => String(s.subjectId) === String(subject.id) && String(s.sectionId) === String(selectedSectionId)).map(s => s.id)
      : [];

    let resolvedDay1StartSlot = -1;
    let resolvedDay2StartSlot = -1;

    // Check if the current user-specified slots have no conflicts
    let currentHasConflict = false;
    if (patternDays) {
      const conflictDay1 = d1 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalRoomId, patternDays[0], modalDay1StartSlot, d1, excludeIds, modalPreferredPattern) : null;
      const conflictDay2 = d2 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalDay2RoomId, patternDays[1], modalDay2StartSlot, d2, excludeIds, modalPreferredPattern) : null;
      if (conflictDay1 || conflictDay2) currentHasConflict = true;
    } else {
      const conflict = checkConflict(subject.id, selectedSectionId, null, modalRoomId, modalDay1Index, modalDay1StartSlot, singleSlots, excludeIds, modalPreferredPattern);
      if (conflict) currentHasConflict = true;
    }

    if (!currentHasConflict) {
      resolvedDay1StartSlot = modalDay1StartSlot;
      resolvedDay2StartSlot = modalPreferredPattern && d2 > 0 ? modalDay2StartSlot : -1;
    } else {
      // Slot search resolution: look circularly for a slot where both segments fit
      const maxSlots = slotCount();
      if (patternDays) {
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

            for (let day2Offset = 0; day2Offset < maxSlots; day2Offset++) {
              const day2Slot = (modalDay2StartSlot + day2Offset) % (maxSlots - d2 + 1);
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
        const maxDuration = singleSlots;
        if (maxSlots - maxDuration + 1 <= 0) {
          resolvedDay1StartSlot = -1;
          resolvedDay2StartSlot = -1;
        } else {
          for (let offset = 0; offset < maxSlots; offset++) {
            const s = (modalDay1StartSlot + offset) % (maxSlots - maxDuration + 1);
            if (s + maxDuration > maxSlots) continue;
            const conflict = checkConflict(subject.id, selectedSectionId, null, modalRoomId, modalDay1Index, s, singleSlots, excludeIds, modalPreferredPattern);
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

    const section = sections.find((s) => s.id === selectedSectionId);
    if (!section) return;

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
    if (patternDays) {
      if (d1 > 0) targetDays.push({ day: FULL_DAY_NAMES[patternDays[0]], startSlot: resolvedDay1StartSlot, duration: d1 });
      if (d2 > 0) targetDays.push({ day: FULL_DAY_NAMES[patternDays[1]], startSlot: resolvedDay2StartSlot, duration: d2 });
    } else {
      targetDays.push({ day: FULL_DAY_NAMES[modalDay1Index], startSlot: resolvedDay1StartSlot, duration: singleSlots });
    }

    setIsModalLoading(true);
    let shouldCloseModal = true;
    try {
      const existingRecords = dropContext.isRescheduling
        ? sortSplitMeetingsForEdit(schedules.filter((s) => String(s.subjectId) === String(subject.id) && String(s.sectionId) === String(selectedSectionId)), subject)
        : [];

      const sharedSplitGroupId = targetDays.length > 1
        ? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `split-${subject.id}-${Date.now()}`)
        : (existingRecords[0]?.splitGroupId ?? null);

      const operations = targetDays.map((targetDay, index) => {
        const isSplit = targetDays.length > 1;
        const hasLab = Number(subject.labHours ?? 0) > 0;
        let meetingType: "lecture" | "laboratory" | null = null;
        if (isSplit) {
          if (hasLab) {
            const duration = targetDay.duration;
            const labSlots = Number(subject.labHours ?? 0) * 6;
            const lecSlots = Number(subject.lectureHours ?? 0) * 2;
            if (duration === labSlots) {
              meetingType = "laboratory";
            } else if (duration === lecSlots) {
              meetingType = "lecture";
            } else {
              meetingType = index === 0 ? "laboratory" : "lecture";
            }
          } else {
            meetingType = "lecture";
          }
        }

        return {
          ...(existingRecords[index]?.id ? { id: Number(existingRecords[index].id) } : {}),
          term_id: activeTerm.id,
          section_id: Number(selectedSectionId),
          subject_id: Number(subject.id),
          faculty_id: existingRecords[index]?.facultyId ? Number(existingRecords[index].facultyId) : null,
          room_id: (() => {
            const resolved = index === 0 ? resolvedRoom1Id : resolvedRoom2Id;
            return resolved === null || resolved === "" ? null : Number(resolved);
          })(),
          department_id: section.departmentId,
          day: targetDay.day,
          start_time: slotToTime24h(targetDay.startSlot),
          end_time: slotToTime24h(targetDay.startSlot + targetDay.duration),
          mode: index === 0 ? modalClassMode : modalDay2ClassMode,
          is_hybrid: false,
          preferred_pattern: modalPreferredPattern,
          split_group_id: sharedSplitGroupId,
          meeting_type: meetingType,
          meeting_index: index + 1,
          status: existingRecords[index]?.status ?? currentStatus
        };
      });

      const deleteIds = existingRecords
        .slice(targetDays.length)
        .map((schedule) => Number(schedule.id));

      let savedScheduleRecords: ApiScheduleRecord[];
      let deletedScheduleRecordIds: number[] = [];

      if (selectedRecommendationId !== null) {
        const response = await api.post<AcceptedRecommendationResponse>(
          `/schedule-recommendations/${selectedRecommendationId}/accept`
        );
        savedScheduleRecords = response.data.schedules;
      } else {
        const response = await api.post<AtomicScheduleResponse>('/schedules/batch', {
          operations,
          delete_ids: deleteIds
        });
        savedScheduleRecords = response.data.schedules ?? [];
        deletedScheduleRecordIds = response.data.deleted_schedule_ids ?? [];
      }

      const savedScheduleItems = savedScheduleRecords.map(mapApiScheduleToItem);
      const deletedScheduleIds = new Set((deletedScheduleRecordIds ?? []).map(String));

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

      setSchedules((previousSchedules) => {
        const savedScheduleIds = new Set(savedScheduleItems.map((item) => item.id));
        const savedScheduleKeys = new Set(
          savedScheduleItems.map((item) => `${item.termId}:${item.sectionId}:${item.courseId || item.subjectId}`)
        );
        return [
          ...previousSchedules.filter((item) => {
            const itemKey = `${item.termId}:${item.sectionId}:${item.courseId || item.subjectId}`;
            return !savedScheduleIds.has(item.id)
              && !deletedScheduleIds.has(item.id)
              && !savedScheduleKeys.has(itemKey);
          }),
          ...savedScheduleItems
        ];
      });
      setIsModalLoading(false);
      setDropContext(null);
      setSelectedRecommendationId(null);
      setConflictInfo(null);
      await refreshSchedules();
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
      shouldCloseModal = selectedRecommendationId === null;
    } finally {
      setIsModalLoading(false);
      if (shouldCloseModal) {
        setDropContext(null);
        setSelectedRecommendationId(null);
        setConflictInfo(null);
      }
    }
  };

  // Left unmemoized on purpose: it delegates to handleConfirmSchedule, which
  // closes over ~20 pieces of modal state. Memoizing this wrapper would pin a
  // stale handleConfirmSchedule, and neither function reaches a memoized child,
  // so there is nothing to gain.
  const handleModalConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = dropContext ? subjects.find((item) => String(item.id) === String(dropContext.subjectId)) : null;
    const isLabMeeting = (duration: number): boolean => {
      const labSlots = Number(subject?.labHours ?? 0) * 6;
      return labSlots > 0 && duration === labSlots;
    };
    const missingFirstRoom = modalClassMode === "on-site" && !modalRoomId;
    const missingSecondRoom = modalPreferredPattern
      && modalDay2Duration > 0
      && modalDay2ClassMode === "on-site"
      && !modalDay2RoomId;
    const invalidTba = (modalRoomId === "tba" && !isLabMeeting(modalDay1Duration))
      || (modalDay2RoomId === "tba" && !isLabMeeting(modalDay2Duration));
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
          await refreshSchedules();
          return;
        }
      }

      await api.delete(`/schedules/${target.id}`);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      toast.success("Schedule Removed", "Class schedule successfully removed.");
      await refreshSchedules();
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

  const handleClearAll = useCallback(() => {
    if (!isEditable || isClearingAll) return;
    if (schedules.length === 0) return;
    setIsClearAllModalOpen(true);
  }, [isEditable, isClearingAll, schedules]);

  const confirmClearAll = async (scope: "section" | "all" = "section") => {
    if (!isEditable || isClearingAll) {
      setIsClearAllModalOpen(false);
      return;
    }
    const targetSecId = selectedSectionId;
    const departmentSectionIds = new Set(
      sections
        .filter((section) => selectedDepartmentId === null || Number(section.departmentId) === Number(selectedDepartmentId))
        .map((section) => section.id)
    );
    const targetSchedules = scope === "all"
      ? schedules.filter((s) => departmentSectionIds.has(s.sectionId))
      : schedules.filter((s) => s.sectionId === targetSecId);
    if (targetSchedules.length === 0) {
      setIsClearAllModalOpen(false);
      return;
    }

    setIsClearingAll(true);
    const clearedCount = targetSchedules.length;
    const sectionName = sections.find((s) => s.id === targetSecId)?.name ?? "the section";
    const validSchedules = targetSchedules.filter((s) => !isNaN(Number(s.id)));

    // Optimistic UI update: immediately clear local state & update local storage cache
    setSchedules((prev) => {
      const updated = scope === "all"
        ? prev.filter((s) => !departmentSectionIds.has(s.sectionId))
        : prev.filter((s) => s.sectionId !== targetSecId);
      const cachedData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
      if (cachedData) {
        setCachedData<SchedulerCacheData>(schedulerCacheKey, {
          ...cachedData,
          schedules: updated,
        });
      }
      return updated;
    });

    setConflictInfo(null);
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
    setIsClearAllModalOpen(false);

    toast.success(
      "Schedule Cleared",
      scope === "all"
        ? `Removed ${clearedCount} class${clearedCount !== 1 ? "es" : ""} from the schedule.`
        : `Removed ${clearedCount} class${clearedCount !== 1 ? "es" : ""} from ${sectionName}.`
    );

    try {
      if (validSchedules.length > 0) {
        await api.post('/schedules/batch', {
          operations: [],
          delete_ids: validSchedules.map((s) => Number(s.id))
        });
      }
      await refreshSchedules();
    } catch (err) {
      const apiMsg = getApiErrorMessage(err);
      toast.error("Failed to clear schedules", apiMsg || "An error occurred.");
    } finally {
      setIsClearingAll(false);
    }
  };

  const cancelClearAll = useCallback(() => setIsClearAllModalOpen(false), []);

  const handleSubmitForApproval = useCallback(async () => {
    if (!selectedSectionId) return;
    setIsSubmitApprovalModalOpen(true);
  }, [selectedSectionId]);

  const confirmSubmitForApproval = async () => {
    if (!selectedSectionId || isSubmittingSchedule) return;
    const section = sections.find((s) => s.id === selectedSectionId);
    if (!section?.departmentId) {
      toast.error("Unable to Submit", "The selected section is not linked to a department.");
      setIsSubmitApprovalModalOpen(false);
      return;
    }

    try {
      setIsSubmittingSchedule(true);
      await api.post(`/departments/${section.departmentId}/submit-schedules`);

      // Optimistic update for all sections in this department to instantly reflect submission
      const deptSectionIds = new Set(
        sections
          .filter((s) => s.departmentId === section.departmentId)
          .map((s) => s.id)
      );
      setSchedules((prev) =>
        prev.map((item) =>
          deptSectionIds.has(item.sectionId)
            ? { ...item, status: "submitted" }
            : item
        )
      );

      toast.success("Submitted for Approval", "Department schedule submitted successfully.");
      // Background reload schedules to keep state completely in sync
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
      toast.error("Unable to Withdraw", "The selected section is not linked to a department.");
      setIsWithdrawSubmissionModalOpen(false);
      return;
    }

    if (sectionIds.length === 0) {
      toast.error("Select Sections", "Choose at least one section to unlock for revision.");
      return;
    }

    try {
      setIsWithdrawingSubmission(true);
      const response = await api.post<{ instructors_released?: number }>(
        `/departments/${section.departmentId}/withdraw-submission`,
        { section_ids: sectionIds.map((id) => Number(id)) }
      );

      const deptSectionIds = new Set(
        sections
          .filter((s) => s.departmentId === section.departmentId)
          .map((s) => s.id)
      );
      const selectedRevisionSectionIds = new Set(sectionIds);
      setSchedules((prev) =>
        prev.map((item) => {
          if (!deptSectionIds.has(item.sectionId) || !departmentWithdrawableStatuses.includes(item.status)) {
            return item;
          }

          const isUnlocked = selectedRevisionSectionIds.has(item.sectionId);

          // Sections unlocked for revision lose their instructor server-side —
          // the assignment is remade after re-approval — so drop it here too
          // instead of showing one the backend has already released.
          return isUnlocked
            ? { ...item, status: "revision", facultyId: null, facultyName: null }
            : { ...item, status: "completed" };
        })
      );

      const releasedInstructors = Number(response.data?.instructors_released ?? 0);
      const releasedNote = releasedInstructors > 0
        ? ` ${releasedInstructors} instructor ${releasedInstructors === 1 ? "assignment was" : "assignments were"} released and must be made again after re-approval.`
        : "";

      toast.success(
        "Submission Withdrawn",
        (departmentWithdrawalStage === "vpaa_approved"
          ? "VPAA approval was revoked and only the selected sections were unlocked for revision."
          : "Only the selected sections were unlocked for revision.") + releasedNote
      );
      refreshSchedules().catch(() => {});
      setIsWithdrawSubmissionModalOpen(false);
    } catch (err) {
      toast.error("Failed to withdraw", getApiErrorMessage(err) ?? "An error occurred.");
    } finally {
      setIsWithdrawingSubmission(false);
    }
  };

  const cancelWithdrawSubmission = useCallback(() => {
    if (!isWithdrawingSubmission) {
      setIsWithdrawSubmissionModalOpen(false);
    }
  }, [isWithdrawingSubmission]);

  const handleMarkSectionDone = useCallback(async () => {
    if (!selectedSectionId) return;
    if (isMarkingSectionDone) return;
    if (sectionSchedules.length === 0) {
      toast.error("Nothing to Mark Done", "Plot at least one subject before marking this section done.");
      return;
    }

    try {
      setIsMarkingSectionDone(true);
      const ids = sectionSchedules.map((s) => Number(s.id));
      await api.patch("/schedules/batch-status", { ids, status: "completed" });

      const sectionScheduleIds = new Set(sectionSchedules.map((schedule) => schedule.id));
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          sectionScheduleIds.has(schedule.id)
            ? { ...schedule, status: "completed" }
            : schedule
        )
      );
      toast.success("Section Done", "This section is now locked for plotting.");
      refreshSchedules().catch(() => {});
    } catch (err) {
      toast.error("Failed to mark section done", getApiErrorMessage(err) ?? "An error occurred.");
    } finally {
      setIsMarkingSectionDone(false);
    }
  }, [selectedSectionId, isMarkingSectionDone, sectionSchedules, refreshSchedules, toast]);

  const handleEditSection = useCallback(async () => {
    if (!selectedSectionId || isEditingSection) return;

    try {
      setIsEditingSection(true);
      const ids = sectionSchedules.map((s) => Number(s.id));
      await api.patch("/schedules/batch-status", { ids, status: "draft" });

      const sectionScheduleIds = new Set(sectionSchedules.map((schedule) => schedule.id));
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          sectionScheduleIds.has(schedule.id)
            ? { ...schedule, status: "draft" }
            : schedule
        )
      );
      toast.success("Section Editable", "You can plot and edit this section again.");
      refreshSchedules().catch(() => {});
    } catch (err) {
      toast.error("Failed to unlock section", getApiErrorMessage(err) ?? "An error occurred.");
    } finally {
      setIsEditingSection(false);
    }
  }, [selectedSectionId, isEditingSection, sectionSchedules, refreshSchedules, toast]);

  const handleResubmit = useCallback(async () => {
    if (!selectedSectionId || isResubmittingSection) return;
    try {
      setIsResubmittingSection(true);
      const ids = sectionSchedules.map((s) => Number(s.id));
      await api.patch("/schedules/batch-status", { ids, status: "revision" });

      const sectionScheduleIds = new Set(sectionSchedules.map((schedule) => schedule.id));
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
    if (!selectedSectionId) return;
    if (isFinalizing) return;
    try {
      setIsFinalizing(true);
      const ids = sectionSchedules.map((s) => Number(s.id));
      await api.patch("/schedules/batch-status", { ids, status: "finalized" });

      const sectionScheduleIds = new Set(sectionSchedules.map((schedule) => schedule.id));
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          sectionScheduleIds.has(schedule.id)
            ? { ...schedule, status: "finalized" }
            : schedule
        )
      );
      toast.success("Finalized", "Schedule successfully marked as finalized.");
      refreshSchedules().catch(() => {});
    } catch (err) {
      toast.error("Failed to finalize", getApiErrorMessage(err) ?? "An error occurred.");
    } finally {
      setIsFinalizing(false);
    }
  }, [selectedSectionId, isFinalizing, sectionSchedules, refreshSchedules, toast]);

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

  /**
   * Puts the server's overload question to the user and resolves with their
   * answer. The caller stays awaited across the prompt, so one assignment —
   * ask, then retry — reads as a single operation from its own point of view.
   */
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

  /**
   * Outcome of one faculty write, so the five entry points below can share the
   * request, the response unwrapping, the 404 resync and the overload question
   * while each still renders failures where its own UI expects them (popup text
   * vs toast).
   */
  type FacultyMutationOutcome =
    | { status: "ok"; schedules: ScheduleItem[] }
    | { status: "restricted"; message: string }
    | { status: "resynced" }
    | { status: "needs_overload_confirmation"; confirmation: OverloadConfirmation }
    | { status: "failed"; message: string };

  /**
   * PUT /schedules/{id} with a faculty id, or null to clear it.
   *
   * Callers apply the returned schedules themselves: the bulk path collects
   * every result and applies them in one state update.
   */
  const mutateScheduleFaculty = async (
    slotId: string,
    facultyId: string | null,
    confirmOverload = false
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
        ...(confirmOverload ? { confirm_overload: true } : {})
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

      // 409 means the write was withheld pending an answer, not refused, so it
      // must never reach the failure toast.
      const confirmation = overloadConfirmationFrom(err);
      if (confirmation) {
        return { status: "needs_overload_confirmation", confirmation };
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

  const facultySuccessToast = (facultyId: string | null) => {
    if (facultyId === null) {
      toast.success("Faculty Assignment Removed", "Faculty member removed from the schedule.");
      return;
    }
    const fac = faculties.find((f) => f.id === facultyId);
    toast.success("Faculty Assigned", `Successfully assigned ${fac?.name ?? "instructor"}.`);
  };

  const facultyFailureTitle = (facultyId: string | null) =>
    facultyId === null ? "Failed to remove faculty" : "Failed to assign faculty";

  const handlePopupFacultyMutation = async (slotId: string, facultyId: string | null) => {
    if (facultyActionSlotId === slotId) return;
    setFacultyActionSlotId(slotId);
    try {
      let outcome = await mutateScheduleFaculty(slotId, facultyId);

      // Answering No returns from inside the try, so the popup below is left
      // open with the instructor still selected — nothing was written.
      if (outcome.status === "needs_overload_confirmation") {
        const proceed = await askOverloadConfirmation(outcome.confirmation);
        if (!proceed) return;
        outcome = await mutateScheduleFaculty(slotId, facultyId, true);
      }
      if (outcome.status === "needs_overload_confirmation") return;

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
      let outcome = await mutateScheduleFaculty(slotId, facultyId);

      if (outcome.status === "needs_overload_confirmation") {
        const proceed = await askOverloadConfirmation(outcome.confirmation);
        if (!proceed) return;
        outcome = await mutateScheduleFaculty(slotId, facultyId, true);
      }
      if (outcome.status === "needs_overload_confirmation") return;

      if (outcome.status === "restricted") {
        toast.error("Assignment Restricted", outcome.message);
      } else if (outcome.status === "failed") {
        toast.error(facultyFailureTitle(facultyId), outcome.message);
      } else if (outcome.status === "ok") {
        applyUpdatedSchedules(outcome.schedules);
        facultySuccessToast(facultyId);
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

  /**
   * The batch request on its own: no toasts, no loading flag, and it reports the
   * overload question rather than mistaking it for a failure. Separate from the
   * handler so the confirmed retry can reuse it without re-entering the guard
   * the outer call already holds.
   */
  const submitBulkFacultyAssign = async (
    assignments: { scheduleIds: string[]; facultyId: string }[],
    confirmOverload: boolean
  ): Promise<
    | { status: "ok"; schedules: ScheduleItem[] }
    | { status: "needs_overload_confirmation"; confirmation: OverloadConfirmation }
    | { status: "failed"; error: unknown }
  > => {
    try {
      // One transaction server-side: a partial failure rolls the whole set back,
      // so the "Auto-Assign Failed" toast can no longer coexist with committed
      // assignments.
      const response = await api.patch<{ schedules?: ApiScheduleRecord[] }>("/schedules/batch-faculty", {
        assignments: assignments.map((assignment) => ({
          schedule_ids: assignment.scheduleIds.map(Number),
          faculty_id: Number(assignment.facultyId),
        })),
        ...(confirmOverload ? { confirm_overload: true } : {}),
      });

      return { status: "ok", schedules: (response.data.schedules ?? []).map(mapApiScheduleToItem) };
    } catch (err: unknown) {
      const confirmation = overloadConfirmationFrom(err);
      if (confirmation) {
        return { status: "needs_overload_confirmation", confirmation };
      }

      return { status: "failed", error: err };
    }
  };

  const handleBulkFacultyAssign = async (assignments: { scheduleIds: string[]; facultyId: string }[]): Promise<boolean> => {
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

      let outcome = await submitBulkFacultyAssign(assignments, false);

      // The batch is confirmed once, not per class: the server names every
      // instructor who ends up overloaded in a single payload. Answering No
      // returns from inside the try, so nothing is written, the modal keeps its
      // selection and neither the failure toast nor a refresh fires.
      if (outcome.status === "needs_overload_confirmation") {
        const proceed = await askOverloadConfirmation(outcome.confirmation);
        if (!proceed) return false;
        outcome = await submitBulkFacultyAssign(assignments, true);
      }
      if (outcome.status !== "ok") {
        // "failed" carries the original error so getApiErrorMessage() still
        // reads the server's own message below.
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
    // Plotting phase: clicking a placed class arms it for relocation
    if (isEditable) {
      setPlacementSubjectId(null);
      setConflictInfo(null);
      setMovingScheduleId((prev) => (prev === scheduleId ? null : scheduleId));
    }
  }, [schedules, isPhase2Active, currentStatus, isEditable]);

  // Arm a subject from the bank for click-to-place
  const handleSubjectCardClick = useCallback((subjectId: string) => {
    if (!isEditable) return;
    setMovingScheduleId(null);
    setConflictInfo(null);
    setPlacementSubjectId((prev) => (prev === subjectId ? null : subjectId));
  }, [isEditable]);

  // Cancel any armed placement/move
  const cancelPlacement = useCallback(() => {
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
  }, []);

  const handleCellClick = useCallback(async (dayIndex: number, timeIndex: number) => {
    if (!isEditable) return;
    if (isSummerWeekendBlocked(dayIndex)) {
      toast.error("Weekend Not Available", "Summer term classes are scheduled Monday through Friday.");
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
      const conflict = checkConflict(
        sched.courseId ?? sched.subjectId ?? "",
        sched.sectionId,
        null,
        sched.roomId,
        dayIndex,
        timeIndex,
        sched.durationSlots,
        sched.id,
        sched.preferredPattern
      );
      if (conflict) {
        // Keep the class armed so the user can try another slot
        setConflictInfo({
          dayIndex,
          startSlot: timeIndex,
          durationSlots: sched.durationSlots,
          message: conflict.message
        });
        return;
      }
      const dayName = FULL_DAY_NAMES[dayIndex];
      const startTime24h = slotToTime24h(timeIndex);
      const endTime24h = slotToTime24h(timeIndex + sched.durationSlots);

      try {
        const response = await api.put<ApiScheduleRecord>(`/schedules/${sched.id}`, {
          day: dayName,
          start_time: startTime24h,
          end_time: endTime24h
        });
        const updatedSchedule = mapApiScheduleToItem(response.data);
        setSchedules((previousSchedules) =>
          previousSchedules.map((schedule) =>
            schedule.id === updatedSchedule.id ? updatedSchedule : schedule
          )
        );
        await refreshSchedules();
        toast.success("Schedule Relocated", "Class schedule successfully relocated.");
      } catch (err) {
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
  }, [isEditable, placementSubjectId, movingScheduleId, schedules, checkConflict, refreshSchedules, refreshData, schedulerCacheKey, triggerConflictReminder, toast]);


  const activeTermText = useMemo(() => {
    if (!activeTerm) return "";
    const semMap: Record<string, string> = {
      '1st': '1st Semester',
      '2nd': '2nd Semester',
      'summer': 'Summer'
    };
    const sem = semMap[activeTerm.semester] || activeTerm.semester || '';
    return `${sem} AY ${activeTerm.academic_year || ''}`;
  }, [activeTerm]);

  return {
    userDepartmentId: user?.department_id ?? null,
    userProgramId: user?.program_id ?? null,
    placed,
    activeTermText,
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
    selectedRecommendationId,
    setSelectedRecommendationId,
    handleEditMovingSchedule,
    facultyAssignmentPopup,
    facultyActionSlotId,
    setFacultyAssignmentPopup,
    popupValidationError,
    popupConflictWarning,
    // One prompt for all three faculty entry points; the panel renders it once.
    overloadPrompt,
    confirmOverloadPrompt,
    cancelOverloadPrompt,
    isSectionDropdownOpen,
    setIsSectionDropdownOpen,
    isClearAllModalOpen,
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
    activeTerm,
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
    handleResubmit,
    handleFinalize,
    handleMarkSectionDone,
    handleEditSection,
    isMarkingSectionDone,
    isEditingSection,
    isResubmittingSection,
    isFinalizing,
    handlePopupFacultyChange,
    handleAssignFaculty,
    handleRemoveFaculty,
    handleInlineFacultyAssign,
    handleBulkFacultyAssign,
    handleFacultyAssignmentDone,
    handleRemoveInlineFaculty,
    handleAcceptedRecommendation,
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
