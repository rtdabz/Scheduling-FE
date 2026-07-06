import React, { useEffect, useState, useMemo } from "react";
import { CheckCircle2, LayoutGrid, Users } from "lucide-react";
import {
  DAYS,
  getSubjectClassification,
  slotToTimeStr
} from "../constants";
import type { ConflictInfo, DropContext, FacultyAssignmentPopupState, ScheduleItem, Subject, Room, Section, Faculty } from "../types";
import type { SubjectClassification } from "../constants";
import { useConflict } from "./useConflict";
import { useDragDrop } from "./useDragDrop";
import { useToast } from "../../../../context/ToastContext";
import api from "../../../../lib/api";

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

export const useScheduler = () => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [activeTerm, setActiveTerm] = useState<any>(null);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await api.get<any[]>('/rooms');
        const userJson = localStorage.getItem('user');
        const user = userJson ? JSON.parse(userJson) : null;
        const isVpaa = user?.role?.toLowerCase() === 'vpaa';

        let apiRooms = res.data;
        if (!isVpaa && user?.department_id) {
          apiRooms = apiRooms.filter(r => r.department_id === null || Number(r.department_id) === Number(user.department_id));
        }

        const mappedRooms = apiRooms.map((r: any) => ({
          id: r.id.toString(),
          name: r.room_code + (r.room_name ? ` - ${r.room_name}` : ''),
          departmentId: r.department_id
        }));
        setRooms(mappedRooms);
      } catch (err) {
        console.error("Failed to fetch rooms", err);
        setRooms([]);
      }
    };
    fetchRooms();
  }, []);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const userJson = localStorage.getItem('user');
        const user = userJson ? JSON.parse(userJson) : null;
        const isVpaa = user?.role?.toLowerCase() === 'vpaa';

        let res;
        if (!isVpaa && user?.department_id) {
          res = await api.get<any[]>(`/sections/department/${user.department_id}`);
        } else {
          res = await api.get<any[]>('/sections');
        }

        let apiSections = res.data;
        if (activeTerm) {
          apiSections = apiSections.filter((s: any) => Number(s.term_id) === Number(activeTerm.id));
        }

        const mapped: Section[] = apiSections.map((s: any) => ({
          id: s.id.toString(),
          name: s.section_name,
          yearLevel: Number(s.year_level),
          departmentId: s.department_id
        }));
        setSections(mapped);
      } catch (err) {
        console.error("Failed to fetch sections", err);
        setSections([]);
      }
    };
    fetchSections();
  }, [activeTerm]);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const res = await api.get<any[]>('/subjects');
        const userJson = localStorage.getItem('user');
        const user = userJson ? JSON.parse(userJson) : null;
        const isVpaa = user?.role?.toLowerCase() === 'vpaa';

        let apiSubjects = res.data;
        if (!isVpaa && user?.department_id) {
          apiSubjects = apiSubjects.filter((s: any) =>
            s.department_id === null ||
            s.subject_category === 'gec' ||               // ← add this line
            Number(s.department_id) === Number(user.department_id)
          );
        }

      const mapped: Subject[] = apiSubjects.map((s: any) => ({
        id: s.id.toString(),
        code: s.subject_code,
        name: s.subject_name,
        units: s.units,
        lectureHours: s.lecture_hours ?? 0,
        labHours: s.lab_hours ?? 0,
        category: s.subject_category as Subject['category'],
        semester: s.semester as Subject['semester'],
        departmentId: s.department_id ?? null,
        yearLevel: Number(s.year_level),   // ← add this
      }));

        setSubjects(mapped);
      } catch (err) {
        console.error("Failed to fetch subjects", err);
        setSubjects([]);
      }
    };
    fetchSubjects();
  }, []);

  useEffect(() => {
    const fetchFaculties = async () => {
      try {
        const res = await api.get<any[]>('/faculties');
        const mapped = res.data.map((f: any) => ({
          id: f.id.toString(),
          name: `${f.first_name} ${f.last_name}`
        }));
        setFaculties(mapped);
      } catch (err) {
        console.error("Failed to fetch faculties", err);
      }
    };
    fetchFaculties();
  }, []);

  useEffect(() => {
    const fetchActiveTerm = async () => {
      try {
        const res = await api.get<any>('/terms/active');
        setActiveTerm(res.data);
      } catch (err) {
        console.error("Failed to fetch active term", err);
      }
    };
    fetchActiveTerm();
  }, []);

  const [placed, setPlaced] = useState<Record<string, string>>({});
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

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedYearLevel, setSelectedYearLevel] = useState<number | null>(null);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<Record<string, ScheduleItem["status"]>>({});

  const refreshSchedules = async () => {
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
    } catch (err) {
      console.error("Failed to fetch schedules", err);
    }
  };

  useEffect(() => {
    if (rooms.length > 0) {
      refreshSchedules();
    }
  }, [rooms, activeTerm]);

  const [dropContext, setDropContext] = useState<DropContext | null>(null);
  const [modalRoomId, setModalRoomId] = useState<string>("");
  const [modalClassMode, setModalClassMode] = useState<"on-site" | "online" | "field">("on-site");
  const [modalIsHybrid, setModalIsHybrid] = useState<boolean>(false);
  const [modalPreferredPattern, setModalPreferredPattern] = useState<"MW" | "TTh" | null>(null);
  const [modalValidationError, setModalValidationError] = useState<string>("");
  const [modalConflict, setModalConflict] = useState<string | null>(null);

  const [facultyAssignmentPopup, setFacultyAssignmentPopup] = useState<FacultyAssignmentPopupState | null>(null);
  const [popupValidationError, setPopupValidationError] = useState<string>("");
  const [popupConflictWarning, setPopupConflictWarning] = useState<string>("");

  const [isSectionDropdownOpen, setIsSectionDropdownOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
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

  const currentStatus: ScheduleItem["status"] = useMemo(() => {
    if (selectedSectionId && scheduleStatus[selectedSectionId]) {
      return scheduleStatus[selectedSectionId];
    }
    const secSchedules = schedules.filter((s) => s.sectionId === selectedSectionId);
    return secSchedules.length > 0 ? secSchedules[0].status : "draft";
  }, [schedules, selectedSectionId, scheduleStatus]);

  const isPhase2Active = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isEditable = currentStatus === "draft";
  const isPhase1Completed = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isPhase2Completed = currentStatus === "finalized";

  const sectionSchedules = schedules.filter((s) => s.sectionId === selectedSectionId);
  const scheduledSubjectIds = new Set(sectionSchedules.map((s) => s.subjectId));

  const visibleSections = useMemo(
    () => selectedYearLevel == null
      ? sections
      : sections.filter((s) => s.yearLevel === selectedYearLevel),
    [sections, selectedYearLevel]
  );
  const yearLevels = useMemo(
    () => Array.from(new Set(sections.map((s) => s.yearLevel))).sort((a, b) => a - b),
    [sections]
  );
  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  const semesterSubjects = useMemo(() => {
    if (sections.length === 0) return [];
    if (!activeTerm?.semester) return subjects;
    return subjects.filter((s) => s.semester === activeTerm.semester);
  }, [subjects, activeTerm, sections]);

  const totalSubjects = useMemo(() => {
    if (!selectedSection) return semesterSubjects.length;
    return semesterSubjects.filter((s) => s.yearLevel === selectedSection.yearLevel).length;
  }, [semesterSubjects, selectedSection]);

  const totalScheduled = new Set(sectionSchedules.map((s) => s.subjectId)).size;

  const totalSlotsCount = sectionSchedules.length;
  const assignedSlotsCount = sectionSchedules.filter((s) => !!s.facultyId).length;
  const unassignedSlotsCount = totalSlotsCount - assignedSlotsCount;

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

  useEffect(() => {
    const nextPlaced: Record<string, string> = {};
    schedules.forEach((s) => {
      for (let offset = 0; offset < s.durationSlots; offset++) {
        nextPlaced[`${s.dayIndex}-${s.startSlot + offset}`] = s.subjectId;
      }
    });
    setPlaced(nextPlaced);
  }, [schedules]);

  useEffect(() => {
    if (!dropContext) return;
    const subject = subjects.find((s) => s.id === dropContext.subjectId);
    const isFieldSubject = subject?.category === "pathfit" || subject?.category === "nstp";
    if (isFieldSubject) {
      setModalClassMode("field");
    } else if (dropContext.isRescheduling && dropContext.scheduleId) {
      const existing = schedules.find((s) => s.id === dropContext.scheduleId);
      if (existing) {
        setModalRoomId(existing.roomId);
        setModalClassMode(existing.mode ?? "on-site");
        setModalIsHybrid(existing.isHybrid ?? false);
        setModalPreferredPattern(existing.preferredPattern ?? null);
      }
    } else {
      setModalRoomId("");
      setModalClassMode("on-site");
      setModalIsHybrid(false);
      setModalPreferredPattern(null);
    }
    setModalValidationError("");
    setModalConflict(null);
  }, [dropContext, schedules]);

  useEffect(() => {
    if (modalClassMode === "online") {
      setModalRoomId("online");
    } else if (modalClassMode === "field") {
      setModalRoomId("field");
    } else if (modalClassMode === "on-site" && (modalRoomId === "online" || modalRoomId === "field")) {
      setModalRoomId("");
    }
  }, [modalClassMode]);

  useEffect(() => {
    if (dropContext && modalRoomId) {
      const subject = subjects.find((s) => s.id === dropContext.subjectId);
      if (subject) {
        const conflict = checkConflict(
          dropContext.subjectId,
          selectedSectionId,
          null,
          modalRoomId,
          dropContext.dayIndex,
          dropContext.startSlot,
          subject.units * 2,
          dropContext.isRescheduling ? dropContext.scheduleId : undefined
        );
        setModalConflict(conflict ? conflict.message : null);
      }
    } else {
      setModalConflict(null);
    }
  }, [modalRoomId, dropContext]);

  const onScheduleRelocated = async (scheduleId: string, dayIndex: number, startSlot: number) => {
    const sched = schedules.find((s) => s.id === scheduleId);
    if (!sched) return;
    const dayName = fullDayNames[dayIndex];
    const startTime24h = slotToTime24h(startSlot);
    const endTime24h = slotToTime24h(startSlot + sched.durationSlots);

    try {
      await api.put(`/schedules/${scheduleId}`, {
        day: dayName,
        start_time: startTime24h,
        end_time: endTime24h
      });
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
    const durationSlots = subject.units * 2;
    const conflict = checkConflict(
      dropContext.subjectId, selectedSectionId, null, modalRoomId,
      dropContext.dayIndex, dropContext.startSlot, durationSlots,
      dropContext.isRescheduling ? dropContext.scheduleId : undefined
    );
    if (conflict) {
      setConflictInfo({ dayIndex: dropContext.dayIndex, startSlot: dropContext.startSlot, durationSlots, message: conflict.message });
      setDropContext(null);
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

    const dayName = fullDayNames[dropContext.dayIndex];
    const startTime24h = slotToTime24h(dropContext.startSlot);
    const endTime24h = slotToTime24h(dropContext.startSlot + durationSlots);

    try {
      if (dropContext.isRescheduling && dropContext.scheduleId) {
        await api.put(`/schedules/${dropContext.scheduleId}`, {
          room_id: Number(resolvedRoomId),
          day: dayName,
          start_time: startTime24h,
          end_time: endTime24h,
          mode: modalClassMode,
          is_hybrid: modalIsHybrid,
          preferred_pattern: modalPreferredPattern
        });
        toast.success("Schedule Updated", "Class schedule successfully relocated.");
      } else {
        await api.post('/schedules', {
          term_id: activeTerm.id,
          section_id: Number(selectedSectionId),
          subject_id: Number(dropContext.subjectId),
          faculty_id: null,
          room_id: Number(resolvedRoomId),
          department_id: section.departmentId,
          day: dayName,
          start_time: startTime24h,
          end_time: endTime24h,
          mode: modalClassMode,
          is_hybrid: modalIsHybrid,
          preferred_pattern: modalPreferredPattern,
          status: "draft"
        });
        toast.success("Schedule Created", "Class schedule successfully plotted.");
      }
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Operation Failed", "Could not save the schedule to the database.");
    }
    setDropContext(null);
    setConflictInfo(null);
  };

  const handleModalConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalRoomId) {
      setModalValidationError("Please select a room.");
      return;
    }
    if (modalConflict) return;
    setIsModalLoading(true);
    setTimeout(() => {
      setIsModalLoading(false);
      handleConfirmSchedule(e);
    }, 500);
  };

  const handleRemoveSchedule = async (scheduleId: string) => {
    if (!isEditable) return;
    try {
      await api.delete(`/schedules/${scheduleId}`);
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
    try {
      await Promise.all(
        sectionSchedules.map((s) =>
          api.put(`/schedules/${s.id}`, { status: "submitted" })
        )
      );
      toast.success("Submitted for Approval", "Schedule submitted successfully.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit", "An error occurred.");
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
    const fac = faculties.find((f) => f.id === facultyId);
    if (!fac) return;
    try {
      await api.put(`/schedules/${scheduleId}`, { faculty_id: Number(facultyId) });
      toast.success("Faculty Assigned", `Successfully assigned ${fac.name}.`);
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to assign faculty", "An error occurred.");
    }
    setFacultyAssignmentPopup(null);
  };

  const handleRemoveFaculty = async () => {
    if (!facultyAssignmentPopup) return;
    const { scheduleId } = facultyAssignmentPopup;
    try {
      await api.put(`/schedules/${scheduleId}`, { faculty_id: null });
      toast.success("Faculty Assignment Removed", "Faculty member removed from the schedule.");
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove faculty", "An error occurred.");
    }
    setFacultyAssignmentPopup(null);
  };

  const handleInlineFacultyAssign = async (slotId: string, facId: string) => {
    if (!facId) return;
    const fac = faculties.find((f) => f.id === facId);
    if (!fac) return;
    const conflict = checkFacultyConflict(facId, slotId);
    if (conflict) {
      if (confirm(`${conflict}\n\nAssign anyway?`)) {
        try {
          await api.put(`/schedules/${slotId}`, { faculty_id: Number(facId) });
          await refreshSchedules();
        } catch (err) {
          console.error(err);
          toast.error("Failed to assign faculty", "An error occurred.");
        }
      }
    } else {
      try {
        await api.put(`/schedules/${slotId}`, { faculty_id: Number(facId) });
        await refreshSchedules();
      } catch (err) {
        console.error(err);
        toast.error("Failed to assign faculty", "An error occurred.");
      }
    }
  };

  const handleRemoveInlineFaculty = async (slotId: string) => {
    try {
      await api.put(`/schedules/${slotId}`, { faculty_id: null });
      await refreshSchedules();
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove faculty", "An error occurred.");
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

  const handleYearLevelSelect = (year: number | null) => {
    setSelectedYearLevel(year);
    setIsYearDropdownOpen(false);
    // If the current section no longer belongs to the chosen year, clear it
    // so the user picks a section within that year level.
    if (year != null) {
      const stillValid = sections.some(
        (s) => s.id === selectedSectionId && s.yearLevel === year
      );
      if (!stillValid) {
        setSelectedSectionId("");
        setConflictInfo(null);
        setPlacementSubjectId(null);
        setMovingScheduleId(null);
      }
    }
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
        sched.id
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

      api.put(`/schedules/${sched.id}`, {
        day: dayName,
        start_time: startTime24h,
        end_time: endTime24h
      }).then(() => {
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
      case "draft":
        return <button onClick={handleSubmitForApproval} className="px-4 py-2 bg-[#4e0a10] hover:bg-[#3a0809] text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer">Submit for Approval</button>;
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

  return {
    placed,
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
    setSchedules,
    selectedSectionId,
    selectedYearLevel,
    isYearDropdownOpen,
    setIsYearDropdownOpen,
    handleYearLevelSelect,
    visibleSections,
    yearLevels,
    scheduleStatus,
    setScheduleStatus,
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
    modalValidationError,
    setModalValidationError,
    modalConflict,
    handleEditMovingSchedule,
    facultyAssignmentPopup,
    setFacultyAssignmentPopup,
    popupValidationError,
    popupConflictWarning,
    isSectionDropdownOpen,
    setIsSectionDropdownOpen,
    isClearAllModalOpen,
    confirmClearAll,
    cancelClearAll,
    isRoomViewOpen,
    setIsRoomViewOpen,
    isPrintModalOpen,
    setIsPrintModalOpen,
    roomViewRoomId,
    setRoomViewRoomId,
    isAssignedListCollapsed,
    setIsAssignedListCollapsed,
    collapsedCategories,
    conflictInfo,
    setConflictInfo,
    isModalLoading,
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
