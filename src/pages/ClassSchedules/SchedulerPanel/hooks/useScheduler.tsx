import React, { useEffect, useState } from "react";
import { CheckCircle2, LayoutGrid, Users } from "lucide-react";
import {
  DAYS,
  DEFAULT_SCHEDULES,
  MOCK_FACULTY,
  MOCK_ROOMS,
  MOCK_SECTIONS,
  MOCK_SUBJECTS,
  YEAR_LEVELS,
  getSubjectClassification,
  slotToTimeStr
} from "../constants";
import type { ConflictInfo, DropContext, FacultyAssignmentPopupState, ScheduleItem, Subject } from "../types";
import type { SubjectClassification } from "../constants";
import { useConflict } from "./useConflict";
import { useDragDrop } from "./useDragDrop";
import { useToast } from "../../../../context/ToastContext";

export const useScheduler = () => {
  const { toast } = useToast();
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

  const [schedules, setSchedules] = useState<ScheduleItem[]>(DEFAULT_SCHEDULES);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("sec-cit-1");
  // Year-level filter (1st–4th year). null = All Years.
  const [selectedYearLevel, setSelectedYearLevel] = useState<number | null>(
    () => MOCK_SECTIONS.find((s) => s.id === "sec-cit-1")?.yearLevel ?? null
  );
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<Record<string, ScheduleItem["status"]>>({
    "sec-cit-1": "draft",
    "sec-cit-2": "faculty_assignment",
    "sec-cit-3": "draft",
    "sec-cas-1": "draft",
    "sec-cas-2": "draft"
  });

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
  const [roomViewRoomId, setRoomViewRoomId] = useState<string>(MOCK_ROOMS[0]?.id ?? "");
  const [isAssignedListCollapsed, setIsAssignedListCollapsed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const currentStatus: ScheduleItem["status"] = selectedSectionId
    ? (scheduleStatus[selectedSectionId] ?? "draft")
    : "draft";

  const isPhase2Active = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isEditable = currentStatus === "draft";
  const isPhase1Completed = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isPhase2Completed = currentStatus === "finalized";

  const sectionSchedules = schedules.filter((s) => s.sectionId === selectedSectionId);
  const scheduledSubjectIds = new Set(sectionSchedules.map((s) => s.subjectId));

  // Sections available for the active year-level filter (null = all years).
  const visibleSections =
    selectedYearLevel == null
      ? MOCK_SECTIONS
      : MOCK_SECTIONS.filter((s) => s.yearLevel === selectedYearLevel);
  const yearLevels = YEAR_LEVELS;
  const totalSubjects = MOCK_SUBJECTS.length;
  const totalScheduled = new Set(sectionSchedules.map((s) => s.subjectId)).size;

  const totalSlotsCount = sectionSchedules.length;
  const assignedSlotsCount = sectionSchedules.filter((s) => !!s.facultyId).length;
  const unassignedSlotsCount = totalSlotsCount - assignedSlotsCount;

  const dropSubject = dropContext
    ? MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId) ?? null
    : null;
  const dropSubjectIsField =
    dropSubject?.category === "pathfit" || dropSubject?.category === "nstp";

  const listCategories: Subject["category"][] = ["major", "gec", "gee", "pathfit", "nstp"];

  const filteredSubjects = MOCK_SUBJECTS.filter((subject) => {
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

  const { checkConflict, checkFacultyConflict, getDragOverConflict } = useConflict({
    schedules,
    selectedSectionId,
    dragSubjectId,
    draggedScheduleId
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
    const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
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
      const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
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

  const dragDrop = useDragDrop({
    schedules,
    selectedSectionId,
    dragSubjectId,
    draggedScheduleId,
    hoveredCell,
    setDragSubjectId,
    setDraggedScheduleId,
    setDragFromCell,
    setHoveredCell,
    setSchedules,
    setDropContext,
    setConflictInfo,
    checkConflict
  });

  const handleConfirmSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropContext) return;
    if (!modalRoomId) {
      setModalValidationError("Please select a Room before confirming.");
      return;
    }
    const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
    if (!subject) return;
    const durationSlots = subject.units * 2;
    const conflict = checkConflict(
      dropContext.subjectId, selectedSectionId, null, modalRoomId,
      dropContext.dayIndex, dropContext.startSlot, durationSlots
    );
    if (conflict) {
      setConflictInfo({ dayIndex: dropContext.dayIndex, startSlot: dropContext.startSlot, durationSlots, message: conflict.message });
      setDropContext(null);
      return;
    }
    const room = MOCK_ROOMS.find((r) => r.id === modalRoomId);
    const section = MOCK_SECTIONS.find((s) => s.id === selectedSectionId);
    if (dropContext.isRescheduling && dropContext.scheduleId) {
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === dropContext.scheduleId
            ? {
                ...s,
                roomId: modalRoomId,
                roomName: modalRoomId === "online" ? "Online" : modalRoomId === "field" ? "Field" : (room?.name ?? ""),
                mode: modalClassMode,
                isHybrid: modalIsHybrid,
                preferredPattern: modalPreferredPattern
              }
            : s
        )
      );
    } else {
      const newSchedule: ScheduleItem = {
        id: `sched-${Date.now()}`,
        subjectId: dropContext.subjectId,
        subjectCode: subject.code,
        subjectName: subject.name,
        subjectType: subject.category,
        sectionName: section?.name ?? "",
        roomName: modalRoomId === "online" ? "Online" : modalRoomId === "field" ? "Field" : (room?.name ?? ""),
        day: DAYS[dropContext.dayIndex],
        startTime: slotToTimeStr(dropContext.startSlot),
        endTime: slotToTimeStr(dropContext.startSlot + durationSlots),
        mode: modalClassMode,
        isHybrid: modalIsHybrid,
        preferredPattern: modalPreferredPattern,
        facultyName: null,
        facultyId: null,
        status: "draft",
        dayIndex: dropContext.dayIndex,
        startSlot: dropContext.startSlot,
        durationSlots,
        sectionId: selectedSectionId,
        roomId: modalRoomId
      };
      setSchedules((prev) => [...prev, newSchedule]);
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

  const handleRemoveSchedule = (scheduleId: string) => {
    if (!isEditable) return;
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    setDeleteConfirmScheduleId(null);
    setConflictInfo(null);
    setMovingScheduleId((prev) => (prev === scheduleId ? null : prev));
  };

  const handleClearAll = () => {
    if (!isEditable || sectionSchedules.length === 0) return;
    setIsClearAllModalOpen(true);
  };

  const confirmClearAll = () => {
    if (!isEditable) {
      setIsClearAllModalOpen(false);
      return;
    }
    const clearedCount = sectionSchedules.length;
    const sectionName = MOCK_SECTIONS.find((s) => s.id === selectedSectionId)?.name ?? "the section";
    setSchedules((prev) => prev.filter((s) => s.sectionId !== selectedSectionId));
    setConflictInfo(null);
    setPlacementSubjectId(null);
    setMovingScheduleId(null);
    setIsClearAllModalOpen(false);
    toast.success(
      "Schedule Cleared",
      `Removed ${clearedCount} class${clearedCount !== 1 ? "es" : ""} from ${sectionName}.`
    );
  };

  const cancelClearAll = () => setIsClearAllModalOpen(false);

  const handleSubmitForApproval = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "submitted" }));
  };

  const handleResubmit = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "draft" }));
  };

  const handleStartFacultyAssignment = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "faculty_assignment" }));
  };

  const handleFinalize = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "finalized" }));
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

  const handleAssignFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyAssignmentPopup) return;
    const { scheduleId, facultyId } = facultyAssignmentPopup;
    if (!facultyId) {
      setPopupValidationError("Please select a faculty member first.");
      return;
    }
    const fac = MOCK_FACULTY.find((f) => f.id === facultyId);
    if (!fac) return;
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? { ...s, facultyId, facultyName: fac.name } : s))
    );
    setFacultyAssignmentPopup(null);
  };

  const handleRemoveFaculty = () => {
    if (!facultyAssignmentPopup) return;
    const { scheduleId } = facultyAssignmentPopup;
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? { ...s, facultyId: null, facultyName: null } : s))
    );
    setFacultyAssignmentPopup(null);
  };

  const handleInlineFacultyAssign = (slotId: string, facId: string) => {
    if (!facId) return;
    const fac = MOCK_FACULTY.find((f) => f.id === facId);
    if (!fac) return;
    const conflict = checkFacultyConflict(facId, slotId);
    if (conflict) {
      if (confirm(`${conflict}\n\nAssign anyway?`)) {
        setSchedules((prev) =>
          prev.map((s) => s.id === slotId ? { ...s, facultyId: facId, facultyName: fac.name } : s)
        );
      }
    } else {
      setSchedules((prev) =>
        prev.map((s) => s.id === slotId ? { ...s, facultyId: facId, facultyName: fac.name } : s)
      );
    }
  };

  const handleRemoveInlineFaculty = (slotId: string) => {
    setSchedules((prev) =>
      prev.map((s) => s.id === slotId ? { ...s, facultyId: null, facultyName: null } : s)
    );
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
      const stillValid = MOCK_SECTIONS.some(
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
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === movingScheduleId
            ? {
                ...s,
                dayIndex,
                startSlot: timeIndex,
                day: DAYS[dayIndex],
                startTime: slotToTimeStr(timeIndex),
                endTime: slotToTimeStr(timeIndex + s.durationSlots)
              }
            : s
        )
      );
      setMovingScheduleId(null);
      setConflictInfo(null);
    }
  };

  const renderStatusBadge = (status: ScheduleItem["status"]) => {
    const configs: Record<string, { cls: string; label: string }> = {
      draft: { cls: "bg-slate-500 text-white", label: "Draft" },
      submitted: { cls: "bg-yellow-500 text-white", label: "Submitted" },
      approved_by_dean: { cls: "bg-blue-600 text-white", label: "Approved by Dean" },
      rejected_by_dean: { cls: "bg-red-600 text-white", label: "Rejected by Dean" },
      approved: { cls: "bg-green-600 text-white", label: "Approved (VPAA)" },
      faculty_assignment: { cls: "bg-purple-600 text-white", label: "Faculty Assignment" },
      finalized: { cls: "bg-emerald-800 text-white", label: "Finalized" },
      rejected: { cls: "bg-red-600 text-white", label: "Rejected" }
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
        return <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Pending Approval</button>;
      case "approved_by_dean":
        return <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Awaiting VPAA Approval</button>;
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
