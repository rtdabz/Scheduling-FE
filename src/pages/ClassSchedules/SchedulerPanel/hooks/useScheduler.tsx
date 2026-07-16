import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { CheckCircle2, LayoutGrid, Users } from "lucide-react";
import {
  DAYS,
  getSubjectClassification,
  slotToTimeStr
} from "../constants";
import type { ConflictInfo, DepartmentSectionProgress, DropContext, FacultyAssignmentPopupState, ScheduleItem, Subject, Room, Section, Faculty } from "../types";
import type { SubjectClassification } from "../constants";
import { useConflict } from "./useConflict";
import { useDragDrop } from "./useDragDrop";
import { useToast } from "../../../../context/ToastContext";
import api from "../../../../lib/api";
import { getCachedData, loadCachedData, setCachedData } from "../../../../lib/dataCache";

const dayMapToIndex: Record<string, number> = {
  "Monday": 0,
  "Tuesday": 1,
  "Wednesday": 2,
  "Thursday": 3,
  "Friday": 4,
  "Saturday": 5,
  "Sunday": 6
};

const fullDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const timeStrToSlot = (timeStr: string): number => {
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const totalMinutes = hours * 60 + minutes;
  return Math.max(0, Math.floor((totalMinutes - 420) / 30));
};

const slotToTime24h = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

const getSplitDayOneDuration = (totalSlots: number): number => Math.ceil(totalSlots / 2);

const buildPreferredPattern = (day1Index: number, day2Index: number): string => `days:${day1Index}-${day2Index}`;

const getPreferredPatternDayIndexes = (preferredPattern?: string | null): [number, number] | null => {
  if (!preferredPattern) return null;
  if (preferredPattern === "MW") return [0, 2];
  if (preferredPattern === "TTh") return [1, 3];

  const customMatch = preferredPattern.match(/^days:([0-5])-([0-5])$/);
  if (!customMatch) return null;

  return [Number(customMatch[1]), Number(customMatch[2])];
};

const getNextMeetingDayIndex = (dayIndex: number): number => (dayIndex + 1) % DAYS.length;

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

interface StoredUser {
  id?: number;
  department_id?: number;
  role?: string;
}

interface SchedulerCacheData {
  rooms: Room[];
  sections: Section[];
  subjects: Subject[];
  faculties: Faculty[];
  activeTerm: any;
  departments: any[];
  users: any[];
  schedules: ScheduleItem[];
}

interface ApiScheduleRecord {
  id: number | string;
  subject_id: number | string;
  section_id: number | string;
  room_id: number | string;
  faculty_id?: number | string | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: "on-site" | "online" | "field";
  status: ScheduleItem["status"];
  is_hybrid?: boolean | number;
  preferred_pattern?: string | null;
  subject?: {
    subject_code?: string;
    subject_name?: string;
    subject_category?: ScheduleItem["subjectType"];
  } | null;
  section?: {
    section_name?: string;
  } | null;
  faculty?: {
    first_name?: string;
    last_name?: string;
  } | null;
  room?: {
    room_code?: string;
    room_name?: string | null;
  } | null;
}

const hasUsableSchedulerCache = (data: SchedulerCacheData | undefined): data is SchedulerCacheData => {
  return Boolean(data?.activeTerm && data.sections.length > 0);
};

const mapApiScheduleToItem = (item: ApiScheduleRecord): ScheduleItem => {
  const dayIndex = dayMapToIndex[item.day] ?? 0;
  const startSlot = timeStrToSlot(item.start_time);
  const endSlot = timeStrToSlot(item.end_time);
  const durationSlots = endSlot - startSlot;

  let roomName = "";
  if (item.room) {
    if (item.room.room_code === "ONLINE") roomName = "Online";
    else if (item.room.room_code === "FIELD") roomName = "Field";
    else roomName = item.room.room_code + (item.room.room_name ? ` - ${item.room.room_name}` : "");
  }

  let roomIdStr = item.room_id.toString();
  if (item.room?.room_code === "ONLINE") roomIdStr = "online";
  else if (item.room?.room_code === "FIELD") roomIdStr = "field";

  return {
    id: item.id.toString(),
    subjectId: item.subject_id.toString(),
    subjectCode: item.subject?.subject_code ?? "",
    subjectName: item.subject?.subject_name ?? "",
    subjectType: item.subject?.subject_category ?? "major",
    sectionName: item.section?.section_name ?? "",
    roomName,
    day: DAYS[dayIndex] || "Mon",
    startTime: slotToTimeStr(startSlot),
    endTime: slotToTimeStr(endSlot),
    mode: item.mode ?? "on-site",
    facultyName: item.faculty ? `${item.faculty.first_name ?? ""} ${item.faculty.last_name ?? ""}`.trim() : null,
    facultyId: item.faculty_id ? item.faculty_id.toString() : null,
    status: item.status,
    dayIndex,
    startSlot,
    durationSlots,
    sectionId: item.section_id.toString(),
    roomId: roomIdStr,
    isHybrid: !!item.is_hybrid,
    preferredPattern: item.preferred_pattern ?? null
  };
};

export const useScheduler = () => {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const schedulerCacheKey = `scheduler:${user?.role ?? 'user'}:${user?.id ?? user?.department_id ?? 'current'}`;
  const cachedSchedulerData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
  const canUseInitialCache = hasUsableSchedulerCache(cachedSchedulerData);
  const [rooms, setRooms] = useState<Room[]>(canUseInitialCache ? cachedSchedulerData.rooms : []);
  const [sections, setSections] = useState<Section[]>(canUseInitialCache ? cachedSchedulerData.sections : []);
  const [subjects, setSubjects] = useState<Subject[]>(canUseInitialCache ? cachedSchedulerData.subjects : []);
  const [faculties, setFaculties] = useState<Faculty[]>(canUseInitialCache ? cachedSchedulerData.faculties : []);
  const [activeTerm, setActiveTerm] = useState<any>(canUseInitialCache ? cachedSchedulerData.activeTerm : null);
  const [departments, setDepartments] = useState<any[]>(canUseInitialCache ? cachedSchedulerData.departments : []);
  const [users, setUsers] = useState<any[]>(canUseInitialCache ? cachedSchedulerData.users : []);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(canUseInitialCache ? cachedSchedulerData.schedules : []);
  const [isLoading, setIsLoading] = useState(!canUseInitialCache);

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
      setIsLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    const fetchRooms = api.get<any[]>('/rooms', { signal }).then(res => {
      let apiRooms = res.data;
      if (!isVpaa && user?.department_id) {
        apiRooms = apiRooms.filter((r: any) => r.department_id === null || Number(r.department_id) === Number(user.department_id));
      }
      return apiRooms.map((r: any) => ({
        id: r.id.toString(),
        name: r.room_code + (r.room_name ? ` - ${r.room_name}` : ''),
        departmentId: r.department_id,
        roomType: r.room_type
      }));
    });

    // Query subjects using department_id parameter to filter at database level
    const subjectsUrl = !isVpaa && user?.department_id
      ? `/subjects?department_id=${user.department_id}`
      : '/subjects';

    const fetchSubjects = api.get<any[]>(subjectsUrl, { signal }).then(res => {
      const apiSubjects = res.data;
      return apiSubjects.map((s: any) => ({
        id: s.id.toString(),
        code: s.subject_code,
        name: s.subject_name,
        units: s.units,
        lectureHours: s.lecture_hours ?? 0,
        labHours: s.lab_hours ?? 0,
        category: s.subject_category as Subject['category'],
        semester: s.semester as Subject['semester'],
        departmentId: s.department_id ?? null,
        yearLevel: Number(s.year_level),
        roomTypeRequired: s.room_type_required
      }));
    });

    const fetchFaculties = api.get<any[]>('/faculties', { signal }).then(res =>
      res.data.map((f: any) => ({
        id: f.id.toString(),
        name: `${f.first_name} ${f.last_name}`,
        employmentType: f.employment_type,
        departmentId: f.department_id,
        departmentCode: f.department?.department_code,
        departmentName: f.department?.department_name,
        maxUnits: f.max_units ? Number(f.max_units) : undefined
      }))
    );

    const fetchTerm = api.get<any>('/terms/active', { signal }).then(res => res.data);

    // Parallel fetch sections and schedules
    const sectionsUrl = !isVpaa && user?.department_id
      ? `/sections/department/${user.department_id}`
      : '/sections';
    const fetchSections = api.get<any[]>(sectionsUrl, { signal }).then(res => res.data);
    const fetchSchedules = api.get<any[]>('/schedules', { signal }).then(res => res.data);
    const fetchDepartments = api.get<any[]>('/departments', { signal }).then(res => res.data);
    const fetchUsers = api.get<any[]>('/user', { signal }).then(res => res.data);

    setIsLoading(true);

    loadCachedData<SchedulerCacheData>(schedulerCacheKey, async () => {
      const [mappedRooms, mappedSubjects, mappedFaculties, term, rawSections, rawSchedules, rawDepartments, rawUsers] = await Promise.all([fetchRooms, fetchSubjects, fetchFaculties, fetchTerm, fetchSections, fetchSchedules, fetchDepartments, fetchUsers]);

      // Filter sections by term_id immediately once loaded
      const filteredSections = rawSections
        .filter((s: any) => Number(s.term_id) === Number(term.id))
        .map((s: any) => ({
          id: s.id.toString(),
          name: s.section_name,
          yearLevel: Number(s.year_level),
          departmentId: s.department_id,
          numberOfStudents: Number(s.number_of_students)
        }));

      // Filter and map schedules by term_id immediately once loaded
      const filteredSchedules = rawSchedules
        .filter((item: any) => Number(item.term_id) === Number(term.id))
        .map((item: any) => {
          const dayIndex = dayMapToIndex[item.day] ?? 0;
          const startSlot = timeStrToSlot(item.start_time);
          const endSlot = timeStrToSlot(item.end_time);
          const durationSlots = endSlot - startSlot;

          let roomName = "";
          if (item.room) {
            if (item.room.room_code === "ONLINE") roomName = "Online";
            else if (item.room.room_code === "FIELD") roomName = "Field";
            else roomName = item.room.room_code + (item.room.room_name ? ` - ${item.room.room_name}` : '');
          }

          let roomIdStr = item.room_id.toString();
          if (item.room?.room_code === "ONLINE") roomIdStr = "online";
          else if (item.room?.room_code === "FIELD") roomIdStr = "field";

          return {
            id: item.id.toString(),
            subjectId: item.subject_id.toString(),
            subjectCode: item.subject?.subject_code ?? "",
            subjectName: item.subject?.subject_name ?? "",
            subjectType: item.subject?.subject_category as any,
            sectionName: item.section?.section_name ?? "",
            roomName,
            day: DAYS[dayIndex] || "Mon",
            startTime: slotToTimeStr(startSlot),
            endTime: slotToTimeStr(endSlot),
            mode: item.mode ?? "on-site",
            facultyName: item.faculty ? `${item.faculty.first_name} ${item.faculty.last_name}` : null,
            facultyId: item.faculty_id ? item.faculty_id.toString() : null,
            status: item.status,
            dayIndex,
            startSlot,
            durationSlots,
            sectionId: item.section_id.toString(),
            roomId: roomIdStr,
            isHybrid: !!item.is_hybrid,
            preferredPattern: item.preferred_pattern
          };
        });

      return {
        rooms: mappedRooms,
        subjects: mappedSubjects,
        faculties: mappedFaculties,
        activeTerm: term,
        departments: rawDepartments,
        users: rawUsers,
        sections: filteredSections,
        schedules: filteredSchedules,
      };
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
      })
      .catch(() => {
        // Safe no-op on abort or fetch error to preserve previous/alternate state instances
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isVpaa, schedulerCacheKey, user?.department_id]);




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

  const [selectedSectionId, setSelectedSectionId] = useState<string>("");


  const refreshSchedules = useCallback(async () => {
    try {
      const res = await api.get<any[]>('/schedules');
      let apiData = res.data;
      if (activeTerm) {
        apiData = apiData.filter((item: any) => Number(item.term_id) === Number(activeTerm.id));
      }
      const mapped = apiData.map((item: any) => {
        const dayIndex = dayMapToIndex[item.day] ?? 0;
        const startSlot = timeStrToSlot(item.start_time);
        const endSlot = timeStrToSlot(item.end_time);
        const durationSlots = endSlot - startSlot;

        let roomName = "";
        if (item.room) {
          if (item.room.room_code === "ONLINE") roomName = "Online";
          else if (item.room.room_code === "FIELD") roomName = "Field";
          else roomName = item.room.room_code + (item.room.room_name ? ` - ${item.room.room_name}` : '');
        }

        let roomIdStr = item.room_id.toString();
        if (item.room?.room_code === "ONLINE") roomIdStr = "online";
        else if (item.room?.room_code === "FIELD") roomIdStr = "field";

        return {
          id: item.id.toString(),
          subjectId: item.subject_id.toString(),
          subjectCode: item.subject?.subject_code ?? "",
          subjectName: item.subject?.subject_name ?? "",
          subjectType: item.subject?.subject_category as any,
          sectionName: item.section?.section_name ?? "",
          roomName,
          day: DAYS[dayIndex] || "Mon",
          startTime: slotToTimeStr(startSlot),
          endTime: slotToTimeStr(endSlot),
          mode: item.mode ?? "on-site",
          facultyName: item.faculty ? `${item.faculty.first_name} ${item.faculty.last_name}` : null,
          facultyId: item.faculty_id ? item.faculty_id.toString() : null,
          status: item.status,
          dayIndex,
          startSlot,
          durationSlots,
          sectionId: item.section_id.toString(),
          roomId: roomIdStr,
          isHybrid: !!item.is_hybrid,
          preferredPattern: item.preferred_pattern
        };
      });
      setSchedules(mapped);
      const cachedData = getCachedData<SchedulerCacheData>(schedulerCacheKey);
      if (cachedData) {
        setCachedData<SchedulerCacheData>(schedulerCacheKey, {
          ...cachedData,
          schedules: mapped,
        });
      }
    } catch {
      // silently fail
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTerm, schedulerCacheKey]);

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
  const [modalClassMode, setModalClassMode] = useState<"on-site" | "online" | "field">("on-site");
  const [modalIsHybrid, setModalIsHybrid] = useState<boolean>(false);
  const [modalPreferredPattern, setModalPreferredPattern] = useState<string | null>(null);
  const [modalDay1Index, setModalDay1Index] = useState<number>(0);
  const [modalDay2Index, setModalDay2Index] = useState<number>(2);
  const [modalDay1StartSlot, setModalDay1StartSlot] = useState<number>(0);
  const [modalDay1Duration, setModalDay1Duration] = useState<number>(0);
  const [modalDay2StartSlot, setModalDay2StartSlot] = useState<number>(0);
  const [isDay2ModifiedByUser, setIsDay2ModifiedByUser] = useState<boolean>(false);
  const [modalValidationError, setModalValidationError] = useState<string>("");
  const [modalConflict, setModalConflict] = useState<string | null>(null);

  const [facultyAssignmentPopup, setFacultyAssignmentPopup] = useState<FacultyAssignmentPopupState | null>(null);
  const [facultyActionSlotId, setFacultyActionSlotId] = useState<string | null>(null);
  const [popupValidationError, setPopupValidationError] = useState<string>("");
  const [popupConflictWarning, setPopupConflictWarning] = useState<string>("");

  const [isSectionDropdownOpen, setIsSectionDropdownOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isSubmitApprovalModalOpen, setIsSubmitApprovalModalOpen] = useState(false);
  const [isRoomViewOpen, setIsRoomViewOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isTeachingLoadOpen, setIsTeachingLoadOpen] = useState(false);
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

  const isPhase2Active = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isEditable = currentStatus === "draft";
  const isPhase1Completed = ["completed", "approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isPhase2Completed = currentStatus === "finalized";

  const scheduledSubjectIds = useMemo(
    () => new Set(sectionSchedules.map((s) => s.subjectId)),
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

  const semesterSubjects = useMemo(() => {
    if (sections.length === 0) return [];
    if (!activeTerm?.semester) return subjects;
    return subjects.filter((s) => s.semester === activeTerm.semester);
  }, [subjects, activeTerm, sections]);

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
          requiredSubjects,
          plottedSubjects,
          status,
          isDone: isFullyPlotted && departmentReadyStatuses.includes(status),
          isSelected: section.id === selectedSectionId
        };
      });
  }, [schedules, sections, selectedDepartmentId, selectedSectionId, semesterSubjects]);

  const departmentTotalSections = departmentSectionProgress.length;
  const departmentDoneSections = departmentSectionProgress.filter((section) => section.isDone).length;
  const departmentRemainingSections = Math.max(0, departmentTotalSections - departmentDoneSections);
  const departmentHasSubmittedSchedule = departmentSectionProgress.some((section) =>
    departmentSubmittedStatuses.includes(section.status)
  );
  const departmentReadyToSubmit =
    departmentTotalSections > 0 &&
    departmentRemainingSections === 0 &&
    !departmentHasSubmittedSchedule &&
    departmentSectionProgress.every((section) => section.status === "completed");

  const dropSubject = dropContext
    ? subjects.find((s) => s.id === dropContext.subjectId) ?? null
    : null;
  const dropSubjectIsField =
    dropSubject?.category === "pathfit" || dropSubject?.category === "nstp";

  const listCategories: Subject["category"][] = ["major", "gec", "gee", "pathfit", "nstp"];

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

  const { checkConflict, checkFacultyConflict, getDragOverConflict } = useConflict({
    schedules,
    selectedSectionId,
    dragSubjectId,
    draggedScheduleId,
    rooms,
    subjects,
    faculties
  });

  // Derive placed map from schedules — no extra state or render cycle needed
  const placed = useMemo(() => {
    const nextPlaced: Record<string, string> = {};
    schedules.forEach((s) => {
      for (let offset = 0; offset < s.durationSlots; offset++) {
        nextPlaced[`${s.dayIndex}-${s.startSlot + offset}`] = s.subjectId;
      }
    });
    return nextPlaced;
  }, [schedules]);

  useEffect(() => {
    if (dropContext) {
      const subject = subjects.find((s) => s.id === dropContext.subjectId);
      const isFieldSubject = subject?.category === "pathfit" || subject?.category === "nstp";
      const totalSlots = subject ? subject.units * 2 : 0;

      if (isFieldSubject) {
        setModalClassMode("field");
        setModalRoomId("");
        setModalIsHybrid(false);
        setModalPreferredPattern(null);
        setModalDay1Index(dropContext.dayIndex);
        setModalDay2Index(getNextMeetingDayIndex(dropContext.dayIndex));
        setModalDay1StartSlot(dropContext.startSlot);
        setModalDay1Duration(totalSlots);
        setModalDay2StartSlot(dropContext.startSlot);
        setIsDay2ModifiedByUser(false);
      } else if (dropContext.isRescheduling && dropContext.scheduleId) {
        const targetSched = schedules.find((s) => s.id === dropContext.scheduleId);
        if (targetSched) {
          setModalRoomId(targetSched.roomId);
          setModalClassMode(targetSched.mode ?? "on-site");
          setModalIsHybrid(targetSched.isHybrid ?? false);
          setModalPreferredPattern(targetSched.preferredPattern ?? null);
          const patternDays = getPreferredPatternDayIndexes(targetSched.preferredPattern);

          const existing = schedules.filter(
            (s) => s.subjectId === targetSched.subjectId && s.sectionId === selectedSectionId
          );
          const sorted = [...existing].sort((a, b) => a.dayIndex - b.dayIndex);

          if (sorted.length >= 2) {
            setModalDay1Index(patternDays?.[0] ?? sorted[0].dayIndex);
            setModalDay2Index(patternDays?.[1] ?? sorted[1].dayIndex);
            setModalPreferredPattern(targetSched.preferredPattern ?? buildPreferredPattern(sorted[0].dayIndex, sorted[1].dayIndex));
            setModalDay1StartSlot(sorted[0].startSlot);
            setModalDay1Duration(sorted[0].durationSlots);
            setModalDay2StartSlot(sorted[1].startSlot);
            setIsDay2ModifiedByUser(true);
          } else if (sorted.length === 1) {
            setModalDay1Index(patternDays?.[0] ?? sorted[0].dayIndex);
            setModalDay2Index(patternDays?.[1] ?? getNextMeetingDayIndex(sorted[0].dayIndex));
            setModalDay1StartSlot(sorted[0].startSlot);
            setModalDay1Duration(sorted[0].durationSlots);
            setModalDay2StartSlot(sorted[0].startSlot);
            setIsDay2ModifiedByUser(false);
          } else {
            setModalDay1Index(dropContext.dayIndex);
            setModalDay2Index(getNextMeetingDayIndex(dropContext.dayIndex));
            setModalDay1StartSlot(dropContext.startSlot);
            setModalDay1Duration(totalSlots);
            setModalDay2StartSlot(dropContext.startSlot);
            setIsDay2ModifiedByUser(false);
          }
        }
      } else {
        let resolvedRoomId = "";
        if (subject && !isFieldSubject) {
          const matchingTypeRooms = rooms.filter(r => 
            !subject.roomTypeRequired || r.roomType === subject.roomTypeRequired
          );
          const nonConflictingRoom = matchingTypeRooms.find(r => {
            const conflict = checkConflict(
              subject.id,
              selectedSectionId,
              null,
              r.id,
              dropContext.dayIndex,
              dropContext.startSlot,
              totalSlots,
              undefined,
              null
            );
            return !conflict || conflict.conflictType !== "room";
          });
          resolvedRoomId = nonConflictingRoom?.id || (matchingTypeRooms.length > 0 ? matchingTypeRooms[0].id : (rooms.length > 0 ? rooms[0].id : ""));
        }

        setModalRoomId(resolvedRoomId);
        setModalClassMode("on-site");
        setModalIsHybrid(false);
        setModalPreferredPattern(null);
        setModalDay1Index(dropContext.dayIndex);
        setModalDay2Index(getNextMeetingDayIndex(dropContext.dayIndex));
        setModalDay1StartSlot(dropContext.startSlot);
        setModalDay1Duration(totalSlots);
        setModalDay2StartSlot(dropContext.startSlot);
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
      setIsDay2ModifiedByUser(false);
    }
    setModalValidationError("");
    setModalConflict(null);
  }, [dropContext, schedules, selectedSectionId]);

  useEffect(() => {
    if (!dropContext || !modalPreferredPattern) return;

    const subject = subjects.find((s) => s.id === dropContext.subjectId);
    const totalSlots = subject ? subject.units * 2 : 0;
    const patternDays = getPreferredPatternDayIndexes(modalPreferredPattern);

    if (patternDays) {
      setModalDay1Index(patternDays[0]);
      setModalDay2Index(patternDays[1]);
    }
    setModalDay1Duration(getSplitDayOneDuration(totalSlots));
    setIsDay2ModifiedByUser(false);
    setModalDay2StartSlot(modalDay1StartSlot);
  }, [dropContext, modalPreferredPattern, modalDay1StartSlot, subjects]);

  useEffect(() => {
    if (!isDay2ModifiedByUser) {
      setModalDay2StartSlot(modalDay1StartSlot);
    }
  }, [modalDay1StartSlot, isDay2ModifiedByUser]);

  useEffect(() => {
    if (modalClassMode === "online") {
      setModalIsHybrid(false);
      setModalRoomId("online");
    } else if (modalClassMode === "field") {
      setModalIsHybrid(false);
      setModalRoomId("field");
    } else if (modalClassMode === "on-site" && (modalRoomId === "online" || modalRoomId === "field")) {
      // Re-assign first available room if none is set
      if (!modalRoomId || modalRoomId === "online" || modalRoomId === "field") {
        const subject = dropContext ? subjects.find((s) => s.id === dropContext.subjectId) : null;
        const matchingTypeRooms = rooms.filter(r => 
          !subject?.roomTypeRequired || r.roomType === subject.roomTypeRequired
        );
        const defaultRoomId = matchingTypeRooms.length > 0 ? matchingTypeRooms[0].id : (rooms.length > 0 ? rooms[0].id : "");
        setModalRoomId(defaultRoomId);
      }
    }
  }, [modalClassMode, dropContext, subjects, rooms]);

  useEffect(() => {
    if (dropContext && modalRoomId) {
      const subject = subjects.find((s) => s.id === dropContext.subjectId);
      if (subject) {
        const excludeIds = dropContext.isRescheduling
          ? schedules.filter(s => s.subjectId === subject.id && s.sectionId === selectedSectionId).map(s => s.id)
          : [];

        const totalSlots = subject.units * 2;
        const d1 = modalDay1Duration;
        const d2 = totalSlots - d1;
        const patternDays = getPreferredPatternDayIndexes(modalPreferredPattern);

        let conflict: { message: string } | null = null;

        if (patternDays) {
          if (d1 > 0) {
            conflict = checkConflict(
              dropContext.subjectId, selectedSectionId, null, modalRoomId,
              patternDays[0], modalDay1StartSlot, d1, excludeIds, modalPreferredPattern
            );
          }
          if (!conflict && d2 > 0) {
            conflict = checkConflict(
              dropContext.subjectId, selectedSectionId, null, modalRoomId,
              patternDays[1], modalDay2StartSlot, d2, excludeIds, modalPreferredPattern
            );
          }
        } else {
          conflict = checkConflict(
            dropContext.subjectId, selectedSectionId, null, modalRoomId,
            dropContext.dayIndex, dropContext.startSlot, totalSlots, excludeIds, modalPreferredPattern
          );
        }

        setModalConflict(conflict ? conflict.message : null);
      }
    } else {
      setModalConflict(null);
    }
  }, [
    modalRoomId,
    dropContext,
    modalPreferredPattern,
    modalDay1Index,
    modalDay2Index,
    modalDay1StartSlot,
    modalDay1Duration,
    modalDay2StartSlot
  ]);

  const onScheduleRelocated = async (scheduleId: string, dayIndex: number, startSlot: number) => {
    const sched = schedules.find((s) => s.id === scheduleId);
    if (!sched) return;
    const dayName = fullDayNames[dayIndex];
    const startTime24h = slotToTime24h(startSlot);
    const endTime24h = slotToTime24h(startSlot + sched.durationSlots);

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
      console.error(err);
      toast.error("Relocation Failed", "Could not save the new schedule slot.");
    }
  };

  const dragDrop = useDragDrop({
    schedules,
    selectedSectionId,
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
    onScheduleRelocated
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

    const totalSlots = subject.units * 2;
    const d1 = modalDay1Duration;
    const d2 = totalSlots - d1;
    const patternDays = getPreferredPatternDayIndexes(modalPreferredPattern);

    // Exclude current slots from conflict checking when rescheduling
    const excludeIds = dropContext.isRescheduling
      ? schedules.filter(s => s.subjectId === subject.id && s.sectionId === selectedSectionId).map(s => s.id)
      : [];

    let resolvedDay1StartSlot = -1;
    let resolvedDay2StartSlot = -1;

    // Check if the current user-specified slots have no conflicts
    let currentHasConflict = false;
    if (patternDays) {
      const conflictDay1 = d1 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalRoomId, patternDays[0], modalDay1StartSlot, d1, excludeIds, modalPreferredPattern) : null;
      const conflictDay2 = d2 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalRoomId, patternDays[1], modalDay2StartSlot, d2, excludeIds, modalPreferredPattern) : null;
      if (conflictDay1 || conflictDay2) currentHasConflict = true;
    } else {
      const conflict = checkConflict(subject.id, selectedSectionId, null, modalRoomId, dropContext.dayIndex, dropContext.startSlot, totalSlots, excludeIds, modalPreferredPattern);
      if (conflict) currentHasConflict = true;
    }

    if (!currentHasConflict) {
      resolvedDay1StartSlot = modalPreferredPattern ? modalDay1StartSlot : dropContext.startSlot;
      resolvedDay2StartSlot = modalPreferredPattern && d2 > 0 ? modalDay2StartSlot : -1;
    } else {
      // Slot search resolution: look circularly for a slot where both segments fit
      const maxSlots = 28;
      const maxDuration = Math.max(d1, d2);

      for (let offset = 0; offset < maxSlots; offset++) {
        const s = (modalDay1StartSlot + offset) % (maxSlots - maxDuration + 1);
        if (s + maxDuration > maxSlots) continue;

        let hasConflict = false;
        if (patternDays) {
          const conflictDay1 = d1 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalRoomId, patternDays[0], s, d1, excludeIds, modalPreferredPattern) : null;
          const conflictDay2 = d2 > 0 ? checkConflict(subject.id, selectedSectionId, null, modalRoomId, patternDays[1], s, d2, excludeIds, modalPreferredPattern) : null;
          if (conflictDay1 || conflictDay2) hasConflict = true;
        } else {
          const conflict = checkConflict(subject.id, selectedSectionId, null, modalRoomId, dropContext.dayIndex, s, totalSlots, excludeIds, modalPreferredPattern);
          if (conflict) hasConflict = true;
        }

        if (!hasConflict) {
          resolvedDay1StartSlot = s;
          resolvedDay2StartSlot = modalPreferredPattern && d2 > 0 ? s : -1;
          break;
        }
      }
    }

    if (resolvedDay1StartSlot === -1) {
      setModalValidationError("No available time slots found that satisfy all scheduling constraints.");
      return;
    }

    const section = sections.find((s) => s.id === selectedSectionId);
    if (!section) return;

    let resolvedRoomId = modalRoomId;
    if (modalRoomId === "online") {
      const onlineRoom = rooms.find(r => r.name.toLowerCase().includes("online"));
      if (onlineRoom) resolvedRoomId = onlineRoom.id;
    } else if (modalRoomId === "field") {
      const fieldRoom = rooms.find(r => r.name.toLowerCase().includes("field"));
      if (fieldRoom) resolvedRoomId = fieldRoom.id;
    }

    const targetDays = [];
    if (patternDays) {
      if (d1 > 0) targetDays.push({ day: fullDayNames[patternDays[0]], startSlot: resolvedDay1StartSlot, duration: d1 });
      if (d2 > 0) targetDays.push({ day: fullDayNames[patternDays[1]], startSlot: resolvedDay2StartSlot, duration: d2 });
    } else {
      targetDays.push({ day: fullDayNames[dropContext.dayIndex], startSlot: resolvedDay1StartSlot, duration: totalSlots });
    }

    setIsModalLoading(true);
    try {
      const savedScheduleItems: ScheduleItem[] = [];
      const deletedScheduleIds = new Set<string>();
      const rememberSavedSchedule = (item: ApiScheduleRecord) => {
        savedScheduleItems.push(mapApiScheduleToItem(item));
      };

      if (dropContext.isRescheduling) {
        const existingRecords = schedules.filter(
          s => s.subjectId === subject.id && s.sectionId === selectedSectionId
        );

        if (targetDays.length === 2) {
          if (existingRecords.length === 2) {
            const dayOneResponse = await api.put<ApiScheduleRecord>(`/schedules/${existingRecords[0].id}`, {
              room_id: Number(resolvedRoomId),
              day: targetDays[0].day,
              start_time: slotToTime24h(targetDays[0].startSlot),
              end_time: slotToTime24h(targetDays[0].startSlot + targetDays[0].duration),
              mode: modalClassMode,
              is_hybrid: modalIsHybrid,
              preferred_pattern: modalPreferredPattern
            });
            rememberSavedSchedule(dayOneResponse.data);
            const dayTwoResponse = await api.put<ApiScheduleRecord>(`/schedules/${existingRecords[1].id}`, {
              room_id: Number(resolvedRoomId),
              day: targetDays[1].day,
              start_time: slotToTime24h(targetDays[1].startSlot),
              end_time: slotToTime24h(targetDays[1].startSlot + targetDays[1].duration),
              mode: modalClassMode,
              is_hybrid: modalIsHybrid,
              preferred_pattern: modalPreferredPattern
            });
            rememberSavedSchedule(dayTwoResponse.data);
          } else if (existingRecords.length === 1) {
            const dayOneResponse = await api.put<ApiScheduleRecord>(`/schedules/${existingRecords[0].id}`, {
              room_id: Number(resolvedRoomId),
              day: targetDays[0].day,
              start_time: slotToTime24h(targetDays[0].startSlot),
              end_time: slotToTime24h(targetDays[0].startSlot + targetDays[0].duration),
              mode: modalClassMode,
              is_hybrid: modalIsHybrid,
              preferred_pattern: modalPreferredPattern
            });
            rememberSavedSchedule(dayOneResponse.data);
            const dayTwoResponse = await api.post<ApiScheduleRecord>('/schedules', {
              term_id: activeTerm.id,
              section_id: Number(selectedSectionId),
              subject_id: Number(subject.id),
              faculty_id: null,
              room_id: Number(resolvedRoomId),
              department_id: section.departmentId,
              day: targetDays[1].day,
              start_time: slotToTime24h(targetDays[1].startSlot),
              end_time: slotToTime24h(targetDays[1].startSlot + targetDays[1].duration),
              mode: modalClassMode,
              is_hybrid: modalIsHybrid,
              preferred_pattern: modalPreferredPattern,
              status: "draft"
            });
            rememberSavedSchedule(dayTwoResponse.data);
          } else {
            for (const t of targetDays) {
              const response = await api.post<ApiScheduleRecord>('/schedules', {
                term_id: activeTerm.id,
                section_id: Number(selectedSectionId),
                subject_id: Number(subject.id),
                faculty_id: null,
                room_id: Number(resolvedRoomId),
                department_id: section.departmentId,
                day: t.day,
                start_time: slotToTime24h(t.startSlot),
                end_time: slotToTime24h(t.startSlot + t.duration),
                mode: modalClassMode,
                is_hybrid: modalIsHybrid,
                preferred_pattern: modalPreferredPattern,
                status: "draft"
              });
              rememberSavedSchedule(response.data);
            }
          }
        } else {
          // targetDays.length === 1
          if (existingRecords.length === 2) {
            const response = await api.put<ApiScheduleRecord>(`/schedules/${existingRecords[0].id}`, {
              room_id: Number(resolvedRoomId),
              day: targetDays[0].day,
              start_time: slotToTime24h(targetDays[0].startSlot),
              end_time: slotToTime24h(targetDays[0].startSlot + targetDays[0].duration),
              mode: modalClassMode,
              is_hybrid: modalIsHybrid,
              preferred_pattern: modalPreferredPattern
            });
            rememberSavedSchedule(response.data);
            await api.delete(`/schedules/${existingRecords[1].id}`);
            deletedScheduleIds.add(existingRecords[1].id);
          } else if (existingRecords.length === 1) {
            const response = await api.put<ApiScheduleRecord>(`/schedules/${existingRecords[0].id}`, {
              room_id: Number(resolvedRoomId),
              day: targetDays[0].day,
              start_time: slotToTime24h(targetDays[0].startSlot),
              end_time: slotToTime24h(targetDays[0].startSlot + targetDays[0].duration),
              mode: modalClassMode,
              is_hybrid: modalIsHybrid,
              preferred_pattern: modalPreferredPattern
            });
            rememberSavedSchedule(response.data);
          }
        }

        if (resolvedDay1StartSlot !== modalDay1StartSlot) {
          toast.success("Schedule Updated at Alternative Time", `Preferred time was occupied. Relocated to ${slotToTimeStr(resolvedDay1StartSlot)}.`);
        } else {
          toast.success("Schedule Updated", "Class schedule successfully updated.");
        }
      } else {
        for (const t of targetDays) {
          const response = await api.post<ApiScheduleRecord>('/schedules', {
            term_id: activeTerm.id,
            section_id: Number(selectedSectionId),
            subject_id: Number(subject.id),
            faculty_id: null,
            room_id: Number(resolvedRoomId),
            department_id: section.departmentId,
            day: t.day,
            start_time: slotToTime24h(t.startSlot),
            end_time: slotToTime24h(t.startSlot + t.duration),
            mode: modalClassMode,
            is_hybrid: modalIsHybrid,
            preferred_pattern: modalPreferredPattern,
            status: "draft"
          });
          rememberSavedSchedule(response.data);
        }

        if (resolvedDay1StartSlot !== modalDay1StartSlot) {
          toast.success("Schedule Created at Alternative Time", `Preferred time was occupied. Plotted to ${slotToTimeStr(resolvedDay1StartSlot)}.`);
        } else {
          toast.success("Schedule Created", "Class schedule successfully plotted.");
        }
      }
      if (savedScheduleItems.length > 0 || deletedScheduleIds.size > 0) {
        setSchedules((previousSchedules) => {
          const savedScheduleIds = new Set(savedScheduleItems.map((item) => item.id));
          return [
            ...previousSchedules.filter((item) => !savedScheduleIds.has(item.id) && !deletedScheduleIds.has(item.id)),
            ...savedScheduleItems
          ];
        });
      }
      setIsModalLoading(false);
      setDropContext(null);
      setConflictInfo(null);
      await refreshSchedules();
    } catch (err: any) {
      console.error(err);
      const violations = err?.response?.data?.violations;
      if (Array.isArray(violations) && violations.length > 0) {
        const messages = violations.map((v: any) => v.message).join(" ");
        toast.error("Schedule Conflict", messages);
      } else {
        toast.error("Operation Failed", "Could not save the schedule to the database.");
      }
    } finally {
      setIsModalLoading(false);
      setDropContext(null);
      setConflictInfo(null);
    }
  };

  const handleModalConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalRoomId) {
      setModalValidationError("Please select a room.");
      return;
    }
    if (modalConflict) return;
    handleConfirmSchedule(e);
  };

  const handleRemoveSchedule = async (scheduleId: string) => {
    if (!isEditable) return;
    const target = schedules.find(s => s.id === scheduleId);
    try {
      if (target && target.preferredPattern) {
        const linked = schedules.filter(
          s => s.subjectId === target.subjectId &&
               s.sectionId === target.sectionId &&
               s.preferredPattern === target.preferredPattern
        );
        await Promise.all(linked.map(s => api.delete(`/schedules/${s.id}`)));
      } else {
        await api.delete(`/schedules/${scheduleId}`);
      }
      toast.success("Schedule Removed", "Class schedule successfully removed.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove schedule", "An error occurred.");
    }
    setDeleteConfirmScheduleId(null);
    setConflictInfo(null);
    setMovingScheduleId((prev) => (prev === scheduleId ? null : prev));
  };

  const handleClearAll = () => {
    if (!isEditable || sectionSchedules.length === 0) return;
    setIsClearAllModalOpen(true);
  };

  const confirmClearAll = async () => {
    if (!isEditable) {
      setIsClearAllModalOpen(false);
      return;
    }
    const clearedCount = sectionSchedules.length;
    const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? "the section";
    try {
      await Promise.all(sectionSchedules.map((s) => api.delete(`/schedules/${s.id}`)));
      toast.success(
        "Schedule Cleared",
        `Removed ${clearedCount} class${clearedCount !== 1 ? "es" : ""} from ${sectionName}.`
      );
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to clear schedules", "An error occurred.");
    }
    setConflictInfo(null);
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
    setIsClearAllModalOpen(false);
  };

  const cancelClearAll = () => setIsClearAllModalOpen(false);

  const handleSubmitForApproval = async () => {
    if (!selectedSectionId) return;
    setIsSubmitApprovalModalOpen(true);
  };

  const confirmSubmitForApproval = async () => {
    if (!selectedSectionId) return;
    const section = sections.find((s) => s.id === selectedSectionId);
    if (!section?.departmentId) {
      toast.error("Unable to Submit", "The selected section is not linked to a department.");
      setIsSubmitApprovalModalOpen(false);
      return;
    }

    try {
      await api.post(`/departments/${section.departmentId}/submit-schedules`);
      toast.success("Submitted for Approval", "Department schedule submitted successfully.");
      await refreshSchedules();
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      toast.error("Failed to submit", apiError.response?.data?.message || "An error occurred.");
    } finally {
      setIsSubmitApprovalModalOpen(false);
    }
  };

  const cancelSubmitForApproval = () => setIsSubmitApprovalModalOpen(false);

  const handleMarkSectionDone = async () => {
    if (!selectedSectionId) return;
    if (sectionSchedules.length === 0) {
      toast.error("Nothing to Mark Done", "Plot at least one subject before marking this section done.");
      return;
    }

    try {
      await Promise.all(
        sectionSchedules.map((s) =>
          api.put(`/schedules/${s.id}`, { status: "completed" })
        )
      );
      const sectionScheduleIds = new Set(sectionSchedules.map((schedule) => schedule.id));
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          sectionScheduleIds.has(schedule.id)
            ? { ...schedule, status: "completed" }
            : schedule
        )
      );
      toast.success("Section Done", "This section is now locked for plotting.");
      await refreshSchedules();
    } catch {
      toast.error("Failed to mark section done", "An error occurred.");
    }
  };

  const handleEditSection = async () => {
    if (!selectedSectionId) return;

    try {
      await Promise.all(
        sectionSchedules.map((s) =>
          api.put(`/schedules/${s.id}`, { status: "draft" })
        )
      );
      const sectionScheduleIds = new Set(sectionSchedules.map((schedule) => schedule.id));
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          sectionScheduleIds.has(schedule.id)
            ? { ...schedule, status: "draft" }
            : schedule
        )
      );
      toast.success("Section Editable", "You can plot and edit this section again.");
      await refreshSchedules();
    } catch {
      toast.error("Failed to unlock section", "An error occurred.");
    }
  };

  const handleResubmit = async () => {
    if (!selectedSectionId) return;
    try {
      await Promise.all(
        sectionSchedules.map((s) =>
          api.put(`/schedules/${s.id}`, { status: "draft" })
        )
      );
      toast.success("Resubmitted", "Schedule successfully returned to draft.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to resubmit", "An error occurred.");
    }
  };

  const handleStartFacultyAssignment = async () => {
    if (!selectedSectionId) return;
    try {
      await Promise.all(
        sectionSchedules.map((s) =>
          api.put(`/schedules/${s.id}`, { status: "faculty_assignment" })
        )
      );
      toast.success("Faculty Assignment Started", "Faculty assignment phase is now active.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to start faculty assignment", "An error occurred.");
    }
  };

  const handleFinalize = async () => {
    if (!selectedSectionId) return;
    try {
      await Promise.all(
        sectionSchedules.map((s) =>
          api.put(`/schedules/${s.id}`, { status: "finalized" })
        )
      );
      toast.success("Finalized", "Schedule successfully marked as finalized.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to finalize", "An error occurred.");
    }
  };

  const handlePopupFacultyChange = (fId: string) => {
    if (!facultyAssignmentPopup) return;
    setFacultyAssignmentPopup((prev) => (prev ? { ...prev, facultyId: fId } : null));
    setPopupValidationError("");
    if (fId) {
      const conflict = checkFacultyConflict(fId, facultyAssignmentPopup.scheduleId);
      setPopupConflictWarning(conflict ?? "");
    } else {
      setPopupConflictWarning("");
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
    if (facultyActionSlotId === scheduleId) return;
    const fac = faculties.find((f) => f.id === facultyId);
    if (!fac) return;
    setFacultyActionSlotId(scheduleId);
    try {
      const response = await api.put<ApiScheduleRecord>(`/schedules/${scheduleId}`, { faculty_id: Number(facultyId) });
      const updatedSchedule = mapApiScheduleToItem(response.data);
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          schedule.id === updatedSchedule.id ? updatedSchedule : schedule
        )
      );
      toast.success("Faculty Assigned", `Successfully assigned ${fac.name}.`);
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to assign faculty", "An error occurred.");
    } finally {
      setFacultyActionSlotId(null);
    }
    setFacultyAssignmentPopup(null);
  };

  const handleRemoveFaculty = async () => {
    if (!facultyAssignmentPopup) return;
    const { scheduleId } = facultyAssignmentPopup;
    if (facultyActionSlotId === scheduleId) return;
    setFacultyActionSlotId(scheduleId);
    try {
      const response = await api.put<ApiScheduleRecord>(`/schedules/${scheduleId}`, { faculty_id: null });
      const updatedSchedule = mapApiScheduleToItem(response.data);
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          schedule.id === updatedSchedule.id ? updatedSchedule : schedule
        )
      );
      toast.success("Faculty Assignment Removed", "Faculty member removed from the schedule.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove faculty", "An error occurred.");
    } finally {
      setFacultyActionSlotId(null);
    }
    setFacultyAssignmentPopup(null);
  };

  const handleInlineFacultyAssign = async (slotId: string, facId: string) => {
    if (!facId) return;
    if (facultyActionSlotId === slotId) return;
    const fac = faculties.find((f) => f.id === facId);
    if (!fac) return;
    setFacultyActionSlotId(slotId);
    try {
      const response = await api.put<ApiScheduleRecord>(`/schedules/${slotId}`, { faculty_id: Number(facId) });
      const updatedSchedule = mapApiScheduleToItem(response.data);
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          schedule.id === updatedSchedule.id ? updatedSchedule : schedule
        )
      );
      toast.success("Faculty Assigned", `Successfully assigned ${fac.name}.`);
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to assign faculty", "An error occurred.");
    } finally {
      setFacultyActionSlotId(null);
    }
  };

  const handleRemoveInlineFaculty = async (slotId: string) => {
    if (facultyActionSlotId === slotId) return;
    setFacultyActionSlotId(slotId);
    try {
      const response = await api.put<ApiScheduleRecord>(`/schedules/${slotId}`, { faculty_id: null });
      const updatedSchedule = mapApiScheduleToItem(response.data);
      setSchedules((previousSchedules) =>
        previousSchedules.map((schedule) =>
          schedule.id === updatedSchedule.id ? updatedSchedule : schedule
        )
      );
      toast.success("Faculty Assignment Removed", "Faculty member removed from the schedule.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove faculty", "An error occurred.");
    } finally {
      setFacultyActionSlotId(null);
    }
  };

  const getClassesCountForDay = (dayIdx: number) =>
    sectionSchedules.filter((s) => s.dayIndex === dayIdx).length;

  const toggleCategory = (category: string) =>
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }));

  const handleSectionSelect = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    setIsSectionDropdownOpen(false);
    setConflictInfo(null);
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
  };


  const handleEditMovingSchedule = () => {
    if (!movingScheduleId) return;
    const sched = schedules.find((s) => s.id === movingScheduleId);
    if (!sched) return;
    setDropContext({
      subjectId: sched.subjectId,
      dayIndex: sched.dayIndex,
      startSlot: sched.startSlot,
      isRescheduling: true,
      scheduleId: sched.id
    });
    setMovingScheduleId(null);
  };

  const handleScheduleCardClick = (scheduleId: string) => {
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
  };

  // Arm a subject from the bank for click-to-place
  const handleSubjectCardClick = (subjectId: string) => {
    if (!isEditable) return;
    setMovingScheduleId(null);
    setConflictInfo(null);
    setPlacementSubjectId((prev) => (prev === subjectId ? null : subjectId));
  };

  // Cancel any armed placement/move
  const cancelPlacement = () => {
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
  };

  // Click a time slot to place the armed subject or move the armed class
  const handleCellClick = (dayIndex: number, timeIndex: number) => {
    if (!isEditable) return;

    if (placementSubjectId) {
      setDropContext({
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
        sched.subjectId,
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
      const dayName = fullDayNames[dayIndex];
      const startTime24h = slotToTime24h(timeIndex);
      const endTime24h = slotToTime24h(timeIndex + sched.durationSlots);

      api.put<ApiScheduleRecord>(`/schedules/${sched.id}`, {
        day: dayName,
        start_time: startTime24h,
        end_time: endTime24h
      }).then((response) => {
        const updatedSchedule = mapApiScheduleToItem(response.data);
        setSchedules((previousSchedules) =>
          previousSchedules.map((schedule) =>
            schedule.id === updatedSchedule.id ? updatedSchedule : schedule
          )
        );
        refreshSchedules();
        toast.success("Schedule Relocated", "Class schedule successfully relocated.");
      }).catch(err => {
        console.error(err);
        toast.error("Failed to relocate schedule", "An error occurred.");
      });
      setMovingScheduleId(null);
      setConflictInfo(null);
    }
  };

  const renderStatusBadge = (status: ScheduleItem["status"]) => {
    const configs: Record<string, { cls: string; label: string }> = {
      draft: { cls: "bg-slate-500 text-white", label: "Draft" },
      completed: { cls: "bg-[#4e0a10] text-white", label: "Done" },
      submitted: { cls: "bg-yellow-500 text-white", label: "Pending Dean Approval" },
      approved_by_dean: { cls: "bg-blue-600 text-white", label: "Pending VPAA Approval" },
      rejected_by_dean: { cls: "bg-red-600 text-white", label: "Rejected by Dean" },
      approved: { cls: "bg-green-600 text-white", label: "Approved" },
      faculty_assignment: { cls: "bg-purple-600 text-white", label: "Faculty Assignment" },
      finalized: { cls: "bg-emerald-800 text-white", label: "Finalized" },
      rejected: { cls: "bg-red-605 text-white", label: "Rejected" }
    };
    const cfg = configs[status];
    if (!cfg) return null;
    return (
      <span className={`${cfg.cls} px-3 py-1 rounded-full text-xs font-medium`}>
        {cfg.label}
      </span>
    );
  };

  const renderActionButton = () => {
    if (!selectedSectionId) return null;
    switch (currentStatus) {
      case "draft": {
        const remaining = Math.max(0, totalSubjects - totalScheduled);
        const canMarkDone = totalSubjects > 0 && remaining === 0;
        return (
          <button
            onClick={handleMarkSectionDone}
            disabled={!canMarkDone}
            title={!canMarkDone ? `${remaining} subject${remaining !== 1 ? "s" : ""} still need placement` : "Mark this section as done"}
            className={`px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
              canMarkDone
                ? "bg-[#4e0a10] hover:bg-[#3a0809] text-white cursor-pointer"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {canMarkDone ? "Done" : `${remaining} unplaced`}
          </button>
        );
      }
      case "completed":
        return <button onClick={handleEditSection} className="px-4 py-2 bg-[#C9952A] hover:bg-[#b8841f] text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer">Edit</button>;
      case "submitted":
        return <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Pending Dean Approval</button>;
      case "approved_by_dean":
        return <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Pending VPAA Approval</button>;
      case "rejected_by_dean":
        return <button onClick={handleResubmit} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer">Resubmit to Dean</button>;
      case "rejected":
        return <button onClick={handleResubmit} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer">Resubmit</button>;
      case "approved":
        return <button onClick={handleStartFacultyAssignment} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer">Start Faculty Assignment</button>;
      case "faculty_assignment": {
        const unassigned = sectionSchedules.filter((s) => !s.facultyId).length;
        const allAssigned = unassigned === 0;
        return (
          <button
            onClick={handleFinalize}
            disabled={!allAssigned}
            title={!allAssigned ? `${unassigned} slot${unassigned !== 1 ? "s" : ""} still need faculty` : undefined}
            className={`px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
              allAssigned
                ? "bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {allAssigned ? "Mark as Finalized" : `${unassigned} slots still need faculty`}
          </button>
        );
      }
      case "finalized":
        return <button disabled className="px-4 py-2 bg-emerald-800 text-white text-sm font-semibold rounded-lg cursor-not-allowed opacity-75">Schedule Finalized</button>;
      default:
        return null;
    }
  };

  const plottingPhaseIcon = isPhase1Completed
    ? <CheckCircle2 className="w-4 h-4" />
    : <LayoutGrid className="w-4 h-4" />;

  const facultyPhaseIcon = isPhase2Completed
    ? <CheckCircle2 className="w-4 h-4" />
    : <Users className="w-4 h-4" />;

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
    handleEditMovingSchedule,
    facultyAssignmentPopup,
    facultyActionSlotId,
    setFacultyAssignmentPopup,
    popupValidationError,
    popupConflictWarning,
    isSectionDropdownOpen,
    setIsSectionDropdownOpen,
    isClearAllModalOpen,
    isSubmitApprovalModalOpen,
    confirmSubmitForApproval,
    cancelSubmitForApproval,
    confirmClearAll,
    cancelClearAll,
    isRoomViewOpen,
    setIsRoomViewOpen,
    isPrintModalOpen,
    setIsPrintModalOpen,
    isTeachingLoadOpen,
    setIsTeachingLoadOpen,
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
    dropSubject,
    dropSubjectIsField,
    listCategories,
    filteredSubjects,
    checkConflict,
    checkFacultyConflict,
    getDragOverConflict,
    handleConfirmSchedule,
    handleModalConfirm,
    handleRemoveSchedule,
    handleClearAll,
    handleSubmitForApproval,
    handleResubmit,
    handleStartFacultyAssignment,
    handleFinalize,
    handlePopupFacultyChange,
    handleAssignFaculty,
    handleRemoveFaculty,
    handleInlineFacultyAssign,
    handleRemoveInlineFaculty,
    getClassesCountForDay,
    toggleCategory,
    handleSectionSelect,
    handleScheduleCardClick,
    renderStatusBadge,
    renderActionButton,
    plottingPhaseIcon,
    facultyPhaseIcon,
    ...dragDrop
  };
};
