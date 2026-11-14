import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, DoorOpen, GraduationCap, Printer, RotateCcw, Send, UserCheck, UserMinus } from "lucide-react";
import { yearLevelLabel } from "./constants";
import type { DepartmentSectionProgress, ScheduleItem, SectionDoneCandidate, Section, WithdrawalStage } from "./types";
import Skeleton from "../../../components/ui/Skeleton";
import SearchField from "./components/SearchField";
import GenerateScheduleButton from "./GenerateSchedule/GenerateScheduleButton";
import { EDITABLE_STATUSES } from "../../../lib/scheduleStatuses";
import WorkflowGuideButton from "../../../components/help/WorkflowGuideButton";
import {
  REVISION_STATUS_BADGE,
  REVISION_STATUS_LABELS,
  SUBMISSION_STATUS_BADGE,
  SUBMISSION_STATUS_LABELS,
} from "../../../lib/submissionStatus";

interface GroupedYear {
  yearLevel: number;
  sections: Section[];
}

interface TopBarProps {
  sections: Section[];
  selectedSectionId: string;
  isSectionDropdownOpen: boolean;
  setIsSectionDropdownOpen: (value: boolean) => void;
  handleSectionSelect: (sectionId: string) => void;
  groupedSections: GroupedYear[];
  currentStatus: ScheduleItem["status"];
  isPhase1Completed: boolean;
  isPhase2Active: boolean;
  isPhase2Completed: boolean;
  totalScheduled: number;
  totalSubjects: number;
  assignedSlotsCount: number;
  totalSlotsCount: number;
  unassignedSlotsCount: number;
  departmentSectionProgress: DepartmentSectionProgress[];
  sectionFinalizeCandidates: SectionDoneCandidate[];
  sectionReassignCandidates: SectionDoneCandidate[];
  departmentTotalSections: number;
  departmentDoneSections: number;
  departmentRemainingSections: number;
  departmentReadyToSubmit: boolean;
  departmentHasSchedules?: boolean;
  departmentCorrectionsRequired?: boolean;
  departmentHasSubmittedSchedule: boolean;
  departmentHasWithdrawableSubmission: boolean;
  departmentWithdrawalStage: WithdrawalStage;
  handleSubmitForApproval: () => void;
  handleWithdrawSubmission: () => void;
  canWithdrawSubmission: boolean;
  isWithdrawingSubmission: boolean;
  onPrint: () => void;
  onOpenRoomTransfer?: () => void;
  pendingRoomTransferCount?: number;
  onGenerateYearLevel?: () => void;
  onResetSchedules?: () => void;
  canResetSchedules?: boolean;
  isClearingAll?: boolean;
  onAutoAssign?: () => void;
  onClearInstructors?: () => void;
  clearableSectionInstructorCount: number;
  clearableDepartmentInstructorCount: number;
  isClearingSectionInstructors: boolean;
  isLoading?: boolean;
  canUpdateSchedule: boolean;
  canSubmitSchedule: boolean;
  canAssignInstructor: boolean;

  isEditingSection: boolean;
  isFinalizing: boolean;
  handleEditSection: () => Promise<void>;
  handleFinalize: () => Promise<void>;
  sectionSchedules: ScheduleItem[];
}

function SubmissionBadges({ section }: { section: Section | undefined }) {
  if (section?.resetSinceSubmission || section?.revisionStatus === "reset") return null;
  const submission = section?.submissionStatus ?? "draft";
  const revision = section?.revisionStatus ?? "initial";
  const badge = "rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset";
  return (
    <>
      <span className={`${SUBMISSION_STATUS_BADGE[submission]} ${badge}`} title="Submission status">
        {SUBMISSION_STATUS_LABELS[submission]}
      </span>
      <span className={`${REVISION_STATUS_BADGE[revision]} ${badge}`} title="Revision status">
        {REVISION_STATUS_LABELS[revision]}
      </span>
    </>
  );
}

type StepState = "done" | "active" | "upcoming";

const stepStateStyles: Record<StepState, { marker: string; label: string; meta: string }> = {
  done: { marker: "bg-emerald-500 text-white", label: "text-white", meta: "text-emerald-300" },
  active: { marker: "bg-[#C9952A] text-[#36060b] ring-2 ring-[#C9952A]/30", label: "text-[#F5C842]", meta: "text-white/70" },
  upcoming: { marker: "border border-white/30 text-white/50", label: "text-white/55", meta: "text-white/45" },
};

/** The system header's maroon gradient (index.css) for the workspace header band. Pair with light text. */
const HEADER_BAND = "bg-wicars-header";

function WorkflowStep({ index, label, meta, state }: { index: number; label: string; meta?: string; state: StepState }) {
  const styles = stepStateStyles[state];
  return (
    <li className="flex min-w-0 items-center gap-2" aria-current={state === "active" ? "step" : undefined}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300 ${styles.marker}`}>
        {state === "done" ? <CheckCircle2 className="h-4 w-4" aria-label="Completed" /> : index}
      </span>
      <span className="min-w-0 leading-tight">
        <span className={`block truncate text-[13px] font-bold ${styles.label}`}>{label}</span>
        {meta && <span className={`block truncate text-[11px] font-medium tabular-nums ${styles.meta}`}>{meta}</span>}
      </span>
    </li>
  );
}

interface ActionButtonProps {
  selectedSectionId: string;
  currentStatus: ScheduleItem["status"];
  readyFinalizeCount: number;
  finalizedSectionCount: number;
  isEditingSection: boolean;
  isFinalizing: boolean;
  handleEditSection: () => Promise<void>;
  handleFinalize: () => Promise<void>;
  sectionSchedules: ScheduleItem[];
  canAssignInstructor: boolean;
}

function ActionButton({
  selectedSectionId,
  currentStatus,
  readyFinalizeCount,
  finalizedSectionCount,
  isEditingSection,
  isFinalizing,
  handleEditSection,
  handleFinalize,
  sectionSchedules,
  canAssignInstructor
}: ActionButtonProps) {
  if (!selectedSectionId) return null;
  switch (currentStatus) {
    case "submitted":
      return <button disabled className="inline-flex h-9 items-center px-3.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-lg cursor-not-allowed">Pending Dean Approval</button>;
    case "conditionally_approved":
      return <button disabled className="inline-flex h-9 items-center px-3.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg cursor-not-allowed">Conditionally Approved</button>;
    case "approved_by_dean":
      return <button disabled className="inline-flex h-9 items-center px-3.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-lg cursor-not-allowed">Pending VPAA Approval</button>;
    case "approved":
    case "faculty_assignment":
    case "reassignment": {
      if (!canAssignInstructor) return null;
      const unassigned = sectionSchedules.filter((s) => !s.facultyId).length;
      const allAssigned = unassigned === 0;
      const missingFacultyCourses = [...new Set(
        sectionSchedules.filter((s) => !s.facultyId).map((s) => s.courseCode),
      )];
      const missingFacultyLabel = missingFacultyCourses.length > 0
        ? `Missing instructor: ${missingFacultyCourses.join(", ")}`
        : undefined;
      return (
        <button
          onClick={handleFinalize}
          disabled={!allAssigned || isFinalizing}
          title={!allAssigned
            ? missingFacultyLabel
            : readyFinalizeCount > 1
              ? `Review and finalize ${readyFinalizeCount} ready sections`
              : "Finalize this section"}
          className={`inline-flex h-9 items-center justify-center gap-2 px-3.5 text-xs font-bold rounded-lg transition-colors duration-150 ${
            allAssigned && !isFinalizing
              ? "bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
              : allAssigned
              ? "bg-emerald-700 text-white cursor-wait opacity-80"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isFinalizing && <LoadingSpinner className="h-4 w-4" />}
          {allAssigned
            ? (isFinalizing ? "Finalizing..." : readyFinalizeCount > 1 ? `Finalize (${readyFinalizeCount})` : "Finalize")
            : `${unassigned} need an instructor`}
        </button>
      );
    }
    case "finalized":
      if (!canAssignInstructor) return null;
      return (
        <button
          onClick={handleEditSection}
          disabled={isEditingSection}
          title={finalizedSectionCount > 1 ? `Choose which of ${finalizedSectionCount} finalized sections to reassign` : "Reassign instructors for this finalized section"}
          className={`inline-flex h-9 items-center justify-center gap-2 px-3.5 text-xs font-bold rounded-lg transition-colors duration-150 ${
            isEditingSection
              ? "bg-[#C9952A] text-white cursor-wait opacity-80"
              : "bg-[#C9952A] hover:bg-[#b8841f] text-white cursor-pointer"
          }`}
        >
          {isEditingSection && <LoadingSpinner className="h-4 w-4" />}
          {isEditingSection ? "Unlocking..." : finalizedSectionCount > 1 ? `Reassignment (${finalizedSectionCount})` : "Reassignment"}
        </button>
      );
    default:
      return null;
  }
}

export default function TopBar({
  sections,
  selectedSectionId,
  isSectionDropdownOpen,
  setIsSectionDropdownOpen,
  handleSectionSelect,
  groupedSections,
  currentStatus,
  isPhase1Completed,
  isPhase2Active,
  isPhase2Completed,
  totalScheduled,
  totalSubjects,
  assignedSlotsCount,
  totalSlotsCount,
  unassignedSlotsCount,
  departmentSectionProgress,
  sectionFinalizeCandidates,
  sectionReassignCandidates,
  departmentTotalSections,
  departmentDoneSections,
  departmentRemainingSections,
  departmentReadyToSubmit,
  departmentHasSchedules = departmentSectionProgress.some((section) => section.plottedCourses > 0),
  departmentCorrectionsRequired = false,
  departmentHasSubmittedSchedule,
  departmentHasWithdrawableSubmission,
  departmentWithdrawalStage,
  handleSubmitForApproval,
  handleWithdrawSubmission,
  canWithdrawSubmission,
  isWithdrawingSubmission,
  onPrint,
  onOpenRoomTransfer,
  pendingRoomTransferCount = 0,
  onGenerateYearLevel,
  onResetSchedules,
  canResetSchedules = false,
  isClearingAll = false,
  onAutoAssign,
  onClearInstructors,
  clearableSectionInstructorCount,
  clearableDepartmentInstructorCount,
  isClearingSectionInstructors,
  isLoading = false,
  canSubmitSchedule,
  canAssignInstructor,
  isEditingSection,
  isFinalizing,
  handleEditSection,
  handleFinalize,
  sectionSchedules
}: TopBarProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const sectionListScrollTopRef = useRef<number>(0);

  const [sectionSearch, setSectionSearch] = useState("");
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const readyFinalizeCount = sectionFinalizeCandidates.filter((candidate) => candidate.isReady).length;
  const finalizedSectionCount = sectionReassignCandidates.filter((candidate) => candidate.isReady).length;

  const handleSectionListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sectionListScrollTopRef.current = e.currentTarget.scrollTop;
  };
  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const remainingSubjects = Math.max(0, totalSubjects - totalScheduled);
  const plottingActive = EDITABLE_STATUSES.includes(currentStatus);
  const submissionSections = departmentSectionProgress.filter((section) => EDITABLE_STATUSES.includes(section.status));
  const hasReturnedSchedule = submissionSections.some((progress) =>
    sections.some((section) => section.id === progress.sectionId && !section.resetSinceSubmission
      && section.revisionStatus !== "reset" && section.submissionStatus === "rejected")
  );

  useEffect(() => {
    const closeReadiness = () => setIsReadinessOpen(false);
    window.addEventListener("schedule-workspace-reset", closeReadiness);
    return () => window.removeEventListener("schedule-workspace-reset", closeReadiness);
  }, []);

  const filteredGroupedSections = useMemo(() => {
    const query = sectionSearch.trim().toLowerCase();
    if (!query) return groupedSections;

    return groupedSections
      .map((group) => ({
        ...group,
        sections: group.sections.filter((section) =>
          `${section.name} ${yearLevelLabel(section.yearLevel)}`.toLowerCase().includes(query)
        )
      }))
      .filter((group) => group.sections.length > 0);
  }, [groupedSections, sectionSearch]);

  const nextStep = useMemo(() => {
    if (!selectedSectionId) {
      return {
        title: "Select a section to begin",
        description: "Choose the class section that needs scheduling.",
      };
    }

    if (plottingActive) {
      if (departmentCorrectionsRequired && hasReturnedSchedule && !selectedSection?.resetSinceSubmission) {
        return {
          title: "Review returned schedule",
          description: "Apply the rejection feedback where corrections are needed. Other sections may keep their existing timetables.",
        };
      }
      const isRev = currentStatus === "revision";
      if (remainingSubjects > 0) {
        return {
          title: isRev ? "Revision: Plot remaining subjects" : "Plot remaining subjects",
          description: `${remainingSubjects} subject${remainingSubjects !== 1 ? "s" : ""} still need time and room placement.`,
        };
      }

      return {
        title: isRev ? "Revision fully plotted" : "Section fully plotted",
        description: "It stays editable until the department schedule is submitted to the Dean.",
      };
    }

    if (currentStatus === "submitted") {
      return {
        title: "Waiting for Dean review",
        description: "The schedule is locked while it is pending approval.",
      };
    }

    if (currentStatus === "approved_by_dean" || currentStatus === "conditionally_approved") {
      return {
        title: "Waiting for VPAA review",
        description: "No edits are available until the review is completed.",
      };
    }

    if (currentStatus === "approved") {
      return {
        title: "Start instructor assignment",
        description: "The timetable is approved. Begin assigning instructors to each class.",
      };
    }

    if (currentStatus === "faculty_assignment") {
      return {
        title: unassignedSlotsCount > 0 ? "Complete instructor assignment" : "Ready to finalize",
        description: unassignedSlotsCount > 0
          ? `${unassignedSlotsCount} class${unassignedSlotsCount !== 1 ? "es" : ""} still need an instructor.`
          : "All classes have assigned instructors.",
      };
    }

    if (currentStatus === "reassignment") {
      return {
        title: "Instructor reassignment in progress",
        description: "Assign an instructor to every class before finalizing. Timetable details remain locked.",
      };
    }

    if (currentStatus === "finalized") {
      return {
        title: "Schedule finalized",
        description: "Reassignment unlocks instructor assignment for each section. Timetable details remain locked.",
      };
    }

    return {
      title: "Review returned schedule",
      description: "Check the comments or conflicts, then resubmit when ready.",
    };
  }, [currentStatus, remainingSubjects, selectedSectionId, unassignedSlotsCount, plottingActive, departmentCorrectionsRequired, hasReturnedSchedule, selectedSection?.resetSinceSubmission]);

  const departmentSubmitLabel = hasReturnedSchedule ? "Resubmit Schedule" : "Submit Schedule";

  const getDepartmentStatusLabel = (section: DepartmentSectionProgress) => {
    if (section.isDone) return "Plotted";
    const req = section.requiredCourses ?? section.requiredSubjects ?? 0;
    const plotted = section.plottedCourses ?? section.plottedSubjects ?? 0;
    if (req > plotted) {
      return `${Math.max(0, req - plotted)} unplaced`;
    }
    return "Not plotted";
  };

  useEffect(() => {
    if (!isSectionDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsSectionDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSectionDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSectionDropdownOpen, setIsSectionDropdownOpen]);

  useEffect(() => {
    if (!isSectionDropdownOpen || !listboxRef.current) return;

    if (sectionListScrollTopRef.current > 0) {
      listboxRef.current.scrollTop = sectionListScrollTopRef.current;
    } else if (selectedSectionId) {
      const selectedEl = listboxRef.current.querySelector<HTMLElement>('[aria-selected="true"]');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isSectionDropdownOpen, selectedSectionId]);

  const plottingState: StepState = isPhase1Completed ? "done" : "active";
  const assignmentState: StepState = isPhase2Completed ? "done" : isPhase2Active ? "active" : "upcoming";
  const isAssignmentStatus = ["approved", "faculty_assignment", "reassignment"].includes(currentStatus);
  const toolButtonClass = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors";
  // Buttons that sit on the maroon header band.
  const bandButtonClass = `${toolButtonClass} border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/20`;
  const bandDangerButtonClass = `${toolButtonClass} border-white/20 bg-white/10 text-red-200 hover:border-red-300/50 hover:bg-red-500/20 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50`;

  // One progress overview for the whole workspace: subjects while plotting, classes once instructors are assigned.
  const tracksInstructors = isPhase2Active || isPhase2Completed;
  const progressDone = tracksInstructors ? assignedSlotsCount : totalScheduled;
  const progressTotal = tracksInstructors ? totalSlotsCount : totalSubjects;
  const progressRemaining = Math.max(0, progressTotal - progressDone);
  const progressPercent = progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0;
  const progressComplete = progressTotal > 0 && progressRemaining === 0;
  const progressDoneLabel = tracksInstructors ? "Assigned" : "Plotted";
  const progressRemainingLabel = tracksInstructors ? "Unassigned" : "Remaining";
  const statLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
  const showDepartmentReadiness = Boolean(selectedSectionId) && departmentTotalSections > 0;
  const departmentComplete = departmentReadyToSubmit || departmentRemainingSections === 0;

  const workflowStepper = (
    <ol className="flex min-w-0 items-center gap-2.5 select-none" aria-label="Scheduling workflow">
      <WorkflowStep
        index={1}
        label="Plotting"
        meta={selectedSectionId ? `${totalScheduled}/${totalSubjects} plotted` : undefined}
        state={plottingState}
      />
      <li role="presentation" aria-hidden="true" className="flex w-6 shrink-0 items-center sm:w-10">
        <span className={`h-0.5 w-full rounded-full transition-colors duration-300 ${isPhase2Active ? "bg-emerald-400" : "bg-white/20"}`} />
      </li>
      <WorkflowStep
        index={2}
        label="Instructor Assignment"
        meta={assignmentState === "upcoming"
          ? "After approval"
          : selectedSectionId ? `${assignedSlotsCount}/${totalSlotsCount} assigned` : undefined}
        state={assignmentState}
      />
    </ol>
  );

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
      {/* Section, workflow, actions: one grid row on wide screens, a predictable stack below. */}
      <div className={`grid grid-cols-1 items-center gap-x-5 gap-y-2.5 rounded-t-xl px-4 py-2.5 md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_auto] ${HEADER_BAND}`}>
        <div id="schedule-builder-section" data-selected-section-id={selectedSectionId || undefined} className="relative shrink-0" ref={dropdownRef}>
          {isLoading ? <Skeleton className="h-10 w-full rounded-lg sm:w-[232px]" /> : <><button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isSectionDropdownOpen}
            onClick={() => setIsSectionDropdownOpen(!isSectionDropdownOpen)}
            className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-white/20 bg-white/10 pl-1 pr-2.5 text-left outline-none transition-colors hover:border-white/35 hover:bg-white/15 focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/40 sm:w-[232px]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-[#F5C842]">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/60">Section</span>
              <span className="block truncate text-[13px] font-bold text-white">
                {selectedSection ? (
                  <>
                    {selectedSection.name}
                    <span className="font-medium text-white/65"> · {yearLevelLabel(selectedSection.yearLevel)}</span>
                  </>
                ) : (
                  "Select a section"
                )}
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-white/60 transition-transform duration-150 ${isSectionDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {isSectionDropdownOpen && (
            <div className="absolute left-0 z-50 mt-1.5 w-[min(100vw-1rem,22rem)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg animate-in fade-in slide-in-from-top-1 duration-150 sm:min-w-[300px]">
              <div className="p-2 border-b border-gray-100">
                <SearchField
                  value={sectionSearch}
                  onChange={setSectionSearch}
                  placeholder="Search section..."
                  clearLabel="Clear section search"
                  inputClassName="focus:ring-[#4e0a10]/15 focus:border-[#4e0a10]"
                />
              </div>
              <div
                ref={listboxRef}
                onScroll={handleSectionListScroll}
                role="listbox"
                aria-label="Available sections"
                className="max-h-80 overflow-y-auto py-1"
              >
              {filteredGroupedSections.length === 0 ? (
                <p className="px-4 py-2.5 text-sm text-gray-400">No sections available.</p>
              ) : (
                filteredGroupedSections.map((group) => (
                  <div key={group.yearLevel}>
                    <div className="px-4 py-2 text-xs font-bold text-[#4e0a10] uppercase tracking-wider bg-gray-50 border-b border-gray-100 select-none sticky top-0">
                      {yearLevelLabel(group.yearLevel)}
                    </div>
                    {group.sections.map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => handleSectionSelect(sec.id)}
                        role="option"
                        aria-selected={selectedSectionId === sec.id}
                        className={`w-full text-left pl-7 pr-4 py-2.5 text-sm transition-colors ${
                          selectedSectionId === sec.id
                            ? "text-[#4e0a10] bg-[#4e0a10]/5 font-semibold"
                            : "text-gray-700 font-normal hover:bg-gray-50"
                        }`}
                      >
                        {sec.name}
                      </button>
                    ))}
                  </div>
                ))
              )}
              </div>
            </div>
          )}</>}
        </div>

        <div id="schedule-builder-workflow" className="flex min-w-0 justify-start">
          {isLoading ? (
            <div className="flex w-full max-w-md items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" /><Skeleton className="h-8 flex-1 rounded-lg" />
              <Skeleton className="h-0.5 w-12 rounded-full" />
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" /><Skeleton className="h-8 flex-1 rounded-lg" />
            </div>
          ) : workflowStepper}
        </div>

        <div role="toolbar" aria-label="Schedule actions" className="flex min-w-0 flex-wrap items-center gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
          {!isLoading && (
            <WorkflowGuideButton
              guideId={
                plottingActive
                  ? "schedule-builder-plotting"
                  : isAssignmentStatus
                    ? "schedule-builder-faculty-assignment"
                    : "schedule-builder-review"
              }
            />
          )}
          {isLoading ? <><Skeleton className="h-9 w-28 rounded-lg" /><Skeleton className="h-9 w-24 rounded-lg" /></> : <>{onAutoAssign && isAssignmentStatus ? (
            <>
              <button
                id="schedule-builder-auto-assign"
                type="button"
                onClick={onAutoAssign}
                className={`${toolButtonClass} border-[#C9952A] bg-[#C9952A] font-bold text-[#36060b] hover:border-[#F5C842] hover:bg-[#F5C842]`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Assign</span>
              </button>
              {onClearInstructors && (
                <button
                  type="button"
                  onClick={onClearInstructors}
                  disabled={(clearableSectionInstructorCount === 0 && clearableDepartmentInstructorCount === 0) || isClearingSectionInstructors}
                  className={bandDangerButtonClass}
                  title="Remove manageable instructor assignments from this section or the whole department"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  <span>{isClearingSectionInstructors ? "Clearing..." : "Clear Instructors"}</span>
                </button>
              )}
            </>
          ) : plottingActive && (
            <>
              {onGenerateYearLevel && (
                <div id="schedule-builder-generate">
                  <GenerateScheduleButton
                    onClick={onGenerateYearLevel}
                  />
                </div>
              )}
              {onResetSchedules && (canResetSchedules || isClearingAll) && (
                <button
                  type="button"
                  onClick={onResetSchedules}
                  disabled={!canResetSchedules || isClearingAll}
                  className={bandDangerButtonClass}
                  title="Clear plotted schedules from selected sections"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{isClearingAll ? "Resetting..." : "Reset"}</span>
                </button>
              )}
            </>
          )}</>}
          <span aria-hidden="true" className="mx-0.5 hidden h-6 w-px bg-white/20 sm:block" />
          {!isLoading && onOpenRoomTransfer && (
              <button
                id="schedule-builder-room-transfer"
                type="button"
                onClick={onOpenRoomTransfer}
                aria-haspopup="dialog"
                aria-label="Reassign Room Schedule"
                aria-describedby={pendingRoomTransferCount > 0 ? 'schedule-builder-room-transfer-count' : undefined}
                title="Review schedules needing a room and transfer them to suitable rooms"
                className={bandButtonClass}
              >
                <DoorOpen className="h-3.5 w-3.5" />
                <span>Reassign Room Schedule</span>
                {pendingRoomTransferCount > 0 && <span id="schedule-builder-room-transfer-count" role="status" aria-label="Pending room schedule reassignments" className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#C9952A] px-1.5 py-0.5 text-[11px] font-bold leading-4 text-[#36060b]">{pendingRoomTransferCount}<span className="sr-only"> pending room schedule reassignments</span></span>}
              </button>
          )}
          {isLoading ? <Skeleton className="h-9 w-20 rounded-lg" /> : (
            <button
              type="button"
              onClick={onPrint}
              title="Print schedule"
              className={bandButtonClass}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>
          )}
        </div>
      </div>

      <div id="schedule-builder-next-step" className="rounded-b-xl border-t border-slate-200 bg-[#faf7f3] px-4 py-2.5">
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
          {isLoading ? (
            <div className="flex items-center gap-5">
              <Skeleton className="h-8 w-14" /><Skeleton className="h-8 w-14" /><Skeleton className="h-8 w-28" />
            </div>
          ) : selectedSectionId ? (
            // One stat pattern across the row: label, value line, then bar. Remaining only shows while work is left.
            <div id="schedule-builder-progress" role="group" aria-label={tracksInstructors ? "Instructor assignment progress" : "Plotting progress"} className="flex items-start gap-5">
              <div className="w-36">
                <p className={statLabelClass}>{progressDoneLabel}</p>
                <p className="mt-0.5 flex items-baseline gap-1 text-sm font-bold leading-5 tabular-nums text-slate-900">
                  {progressDone}
                  <span className="text-xs font-semibold text-slate-400">of {progressTotal}</span>
                  <span className={`ml-auto text-xs font-bold ${progressComplete ? "text-emerald-700" : "text-slate-700"}`}>{progressPercent}%</span>
                </p>
                <div
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-label={`${progressDoneLabel} ${progressDone} of ${progressTotal}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${progressComplete ? "bg-emerald-600" : "bg-[#c9952a]"}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              {progressRemaining > 0 && (
                <div>
                  <p className={statLabelClass}>{progressRemainingLabel}</p>
                  <p className="mt-0.5 text-sm font-bold leading-5 tabular-nums text-[#8a5a12]">{progressRemaining}</p>
                </div>
              )}
            </div>
          ) : (
            <div aria-hidden="true" className="hidden md:block" />
          )}

          <div className={`min-w-0 ${selectedSectionId || isLoading ? "md:border-l md:border-slate-200 md:pl-5" : ""}`}>
            {isLoading ? (
              <><Skeleton className="h-4 w-48" /><Skeleton className="mt-1.5 h-3 w-64 max-w-full" /></>
            ) : (
              <>
                <p className={`${statLabelClass} !text-[#4e0a10]`}>Next step</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[13px] font-bold leading-5 text-slate-900">{nextStep.title}</p>
                  {sectionSchedules.length > 0 && <SubmissionBadges section={selectedSection} />}
                </div>
                <p className="mt-0.5 text-xs leading-4 text-slate-500">{nextStep.description}</p>
              </>
            )}
          </div>

          <div className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:col-span-2 xl:col-span-1 xl:justify-end ${showDepartmentReadiness || isLoading ? "xl:border-l xl:border-slate-200 xl:pl-5" : ""}`}>
            {isLoading ? (
              <><Skeleton className="h-8 w-36" /><Skeleton className="h-9 w-28 rounded-lg" /></>
            ) : (
              <>
                {showDepartmentReadiness && (
                  <>
                    <div className="w-44">
                      <p className={statLabelClass}>Department readiness</p>
                      <p className={`mt-0.5 flex items-center gap-1 text-xs font-semibold leading-5 ${departmentComplete ? "text-emerald-700" : "text-slate-800"}`}>
                        {departmentComplete && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                        <span>
                          <span className="tabular-nums">{departmentDoneSections}<span className={departmentComplete ? "" : "text-slate-400"}> of {departmentTotalSections}</span></span> sections plotted
                        </span>
                      </p>
                      {/* A solid bar: one segment per section turned into a dashed line once a department has many sections. */}
                      <div
                        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                        role="progressbar"
                        aria-label={`${departmentDoneSections} of ${departmentTotalSections} sections complete`}
                        aria-valuemin={0}
                        aria-valuemax={departmentTotalSections}
                        aria-valuenow={departmentDoneSections}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${departmentComplete ? "bg-emerald-600" : "bg-[#c9952a]"}`}
                          style={{ width: `${departmentTotalSections > 0 ? Math.min(100, (departmentDoneSections / departmentTotalSections) * 100) : 0}%` }}
                        />
                      </div>
                    </div>

                    {departmentCorrectionsRequired && departmentHasSchedules && hasReturnedSchedule && (
                      <p role="status" className="text-xs font-semibold text-amber-800">
                        Save the needed timetable corrections before resubmitting.
                      </p>
                    )}
                    {!departmentHasSubmittedSchedule && departmentHasSchedules ? (
                      <button
                        type="button"
                        onClick={() => setIsReadinessOpen(!isReadinessOpen)}
                        aria-expanded={isReadinessOpen}
                        className={`${toolButtonClass} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
                      >
                        View sections
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isReadinessOpen ? "rotate-180" : ""}`} />
                      </button>
                    ) : departmentHasSubmittedSchedule ? (
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Submitted
                      </span>
                    ) : null}
                    {departmentHasWithdrawableSubmission && canWithdrawSubmission && !departmentReadyToSubmit && (
                      <button
                        type="button"
                        onClick={handleWithdrawSubmission}
                        disabled={isWithdrawingSubmission}
                        title={`Recall selected sections from ${departmentWithdrawalStage === "vpaa_review" ? "VPAA" : "Dean"} review`}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 text-xs font-bold text-orange-700 transition-colors hover:bg-orange-50 disabled:cursor-wait disabled:opacity-70"
                      >
                        {isWithdrawingSubmission ? (
                          <LoadingSpinner className="h-3.5 w-3.5" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        {isWithdrawingSubmission ? "Recalling..." : "Recall Submission"}
                      </button>
                    )}
                    {departmentHasSchedules && submissionSections.length > 0 && canSubmitSchedule && (
                      <button
                        type="button"
                        onClick={handleSubmitForApproval}
                        disabled={!departmentReadyToSubmit}
                        title={departmentRemainingSections > 0
                          ? "Fully plot every section before submitting"
                          : departmentCorrectionsRequired ? "Save the needed timetable corrections before resubmitting" : "Review department readiness before submitting to the Dean"}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 text-xs font-bold text-white transition-colors hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {departmentSubmitLabel}
                      </button>
                    )}
                  </>
                )}
                <ActionButton
                  selectedSectionId={selectedSectionId}
                  currentStatus={currentStatus}
                  readyFinalizeCount={readyFinalizeCount}
                  finalizedSectionCount={finalizedSectionCount}
                  isEditingSection={isEditingSection}
                  isFinalizing={isFinalizing}
                  handleEditSection={handleEditSection}
                  handleFinalize={handleFinalize}
                  sectionSchedules={sectionSchedules}
                  canAssignInstructor={canAssignInstructor}
                />
              </>
            )}
          </div>
        </div>

        {isReadinessOpen && departmentHasSchedules && !isLoading && selectedSectionId && departmentTotalSections > 0 && !departmentHasSubmittedSchedule && (
          <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2.5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {departmentSectionProgress.map((section) => (
              <button
                key={section.sectionId}
                type="button"
                onClick={() => handleSectionSelect(section.sectionId)}
                className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  section.isSelected
                    ? "border-[#4e0a10] bg-[#4e0a10]/5"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="block truncate text-[11px] font-bold text-slate-800">{section.sectionName}</span>
                <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${
                  section.isDone ? "text-emerald-700" : "text-amber-700"
                }`}>
                  {section.isDone ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">{getDepartmentStatusLabel(section)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
import LoadingSpinner from "../../../components/ui/LoadingSpinner";
