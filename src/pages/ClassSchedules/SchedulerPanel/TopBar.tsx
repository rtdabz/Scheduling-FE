import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, GraduationCap, Printer, RotateCcw, Send, UserCheck, UserMinus } from "lucide-react";
import { yearLevelLabel } from "./constants";
import type { DepartmentSectionProgress, ScheduleItem, SectionDoneCandidate, Section, WithdrawalStage } from "./types";
import Skeleton from "../../../components/ui/Skeleton";
import SearchField from "./components/SearchField";
import GenerateScheduleButton from "./GenerateSchedule/GenerateScheduleButton";
import WorkflowGuideButton from "../../../components/help/WorkflowGuideButton";

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
  sectionDoneCandidates: SectionDoneCandidate[];
  sectionFinalizeCandidates: SectionDoneCandidate[];
  sectionReassignCandidates: SectionDoneCandidate[];
  openMarkSectionsDone: () => void;
  departmentTotalSections: number;
  departmentDoneSections: number;
  departmentRemainingSections: number;
  departmentReadyToSubmit: boolean;
  departmentHasSubmittedSchedule: boolean;
  departmentHasWithdrawableSubmission: boolean;
  departmentWithdrawalStage: WithdrawalStage;
  handleSubmitForApproval: () => void;
  handleWithdrawSubmission: () => void;
  canWithdrawSubmission: boolean;
  isWithdrawingSubmission: boolean;
  onPrint: () => void;
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
  isResubmittingSection: boolean;
  isFinalizing: boolean;
  handleEditSection: () => Promise<void>;
  handleResubmit: () => Promise<void>;
  handleFinalize: () => Promise<void>;
  sectionSchedules: ScheduleItem[];
}

// Tinted rather than solid: the badge labels state, and solid fills competed
// with the section's primary action for attention.
const statusBadgeConfigs: Record<string, { cls: string; label: string }> = {
  draft: { cls: "bg-slate-100 text-slate-600 ring-slate-200", label: "Draft" },
  completed: { cls: "bg-[#4e0a10]/[0.07] text-[#4e0a10] ring-[#4e0a10]/15", label: "Done" },
  submitted: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Pending Dean Approval" },
  approved_by_dean: { cls: "bg-blue-50 text-blue-700 ring-blue-200", label: "Pending VPAA Approval" },
  conditionally_approved: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Conditionally Approved" },
  rejected_by_dean: { cls: "bg-red-50 text-red-700 ring-red-200", label: "Rejected by Dean" },
  approved: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Approved" },
  faculty_assignment: { cls: "bg-violet-50 text-violet-700 ring-violet-200", label: "Instructor Assignment" },
  reassignment: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Reassignment" },
  finalized: { cls: "bg-emerald-100 text-emerald-800 ring-emerald-200", label: "Finalized" },
  rejected: { cls: "bg-red-50 text-red-700 ring-red-200", label: "Rejected" },
  revision: { cls: "bg-orange-50 text-orange-700 ring-orange-200", label: "Under Revision" }
};

function StatusBadge({ status }: { status: ScheduleItem["status"] }) {
  const cfg = statusBadgeConfigs[status] || {
    cls: "bg-red-50 text-red-700 ring-red-200",
    label: "Unknown"
  };
  return (
    <span className={`${cfg.cls} rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset`}>
      {cfg.label}
    </span>
  );
}

type StepState = "done" | "active" | "upcoming";

const stepStateStyles: Record<StepState, { marker: string; label: string; meta: string }> = {
  done: { marker: "bg-emerald-600 text-white", label: "text-slate-800", meta: "text-emerald-700" },
  active: { marker: "bg-[#4e0a10] text-white ring-4 ring-[#4e0a10]/10", label: "text-[#4e0a10]", meta: "text-slate-500" },
  upcoming: { marker: "border border-slate-300 bg-white text-slate-400", label: "text-slate-400", meta: "text-slate-400" },
};

function WorkflowStep({ index, label, meta, state }: { index: number; label: string; meta?: string; state: StepState }) {
  const styles = stepStateStyles[state];
  return (
    <li className="flex min-w-0 items-center gap-2.5" aria-current={state === "active" ? "step" : undefined}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black transition-colors duration-300 ${styles.marker}`}>
        {state === "done" ? <CheckCircle2 className="h-4 w-4" aria-label="Completed" /> : index}
      </span>
      <span className="min-w-0 leading-tight">
        <span className={`block truncate text-sm font-bold ${styles.label}`}>{label}</span>
        {meta && <span className={`block truncate text-[11px] font-semibold ${styles.meta}`}>{meta}</span>}
      </span>
    </li>
  );
}

interface ActionButtonProps {
  selectedSectionId: string;
  currentStatus: ScheduleItem["status"];
  totalSubjects: number;
  totalScheduled: number;
  readySectionCount: number;
  readyFinalizeCount: number;
  finalizedSectionCount: number;
  isEditingSection: boolean;
  isResubmittingSection: boolean;
  isFinalizing: boolean;
  openMarkSectionsDone: () => void;
  handleEditSection: () => Promise<void>;
  handleResubmit: () => Promise<void>;
  handleFinalize: () => Promise<void>;
  sectionSchedules: ScheduleItem[];
  canUpdateSchedule: boolean;
  canAssignInstructor: boolean;
}

function ActionButton({
  selectedSectionId,
  currentStatus,
  totalSubjects,
  totalScheduled,
  readySectionCount,
  readyFinalizeCount,
  finalizedSectionCount,
  isEditingSection,
  isResubmittingSection,
  isFinalizing,
  openMarkSectionsDone,
  handleEditSection,
  handleResubmit,
  handleFinalize,
  sectionSchedules,
  canUpdateSchedule,
  canAssignInstructor
}: ActionButtonProps) {
  if (!selectedSectionId) return null;
  switch (currentStatus) {
    case "draft":
    case "revision": {
      if (!canUpdateSchedule) return null;
      const remaining = Math.max(0, totalSubjects - totalScheduled);
      const canMarkDone = totalSubjects > 0 && remaining === 0;
      return (
        <button
          onClick={openMarkSectionsDone}
          disabled={!canMarkDone}
          title={!canMarkDone
            ? `${remaining} subject${remaining !== 1 ? "s" : ""} still need placement`
            : readySectionCount > 1
              ? `Review and mark ${readySectionCount} ready sections done`
              : "Mark this section as done"}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
            canMarkDone
              ? "bg-[#4e0a10] hover:bg-[#3a0809] text-white cursor-pointer"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {canMarkDone ? (readySectionCount > 1 ? `Done (${readySectionCount})` : "Done") : `${remaining} unplaced`}
        </button>
      );
    }
    case "completed":
      if (!canUpdateSchedule) return null;
      return (
        <button
          onClick={handleEditSection}
          disabled={isEditingSection}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
            isEditingSection
              ? "bg-[#C9952A] text-white cursor-wait opacity-80"
              : "bg-[#C9952A] hover:bg-[#b8841f] text-white cursor-pointer"
          }`}
        >
          {isEditingSection && <LoadingSpinner className="h-4 w-4" />}
          {isEditingSection ? "Unlocking..." : "Edit"}
        </button>
      );
    case "submitted":
      return <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Pending Dean Approval</button>;
    case "conditionally_approved":
      return <button disabled className="px-4 py-2 bg-amber-100 text-amber-700 text-sm font-semibold rounded-lg cursor-not-allowed">Conditionally Approved</button>;
    case "approved_by_dean":
      return <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Pending VPAA Approval</button>;
    case "rejected_by_dean":
    case "rejected":
      if (!canUpdateSchedule) return null;
      return (
        <button
          onClick={handleResubmit}
          disabled={isResubmittingSection}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
            isResubmittingSection
              ? "bg-orange-500 text-white cursor-wait opacity-80"
              : "bg-orange-500 hover:bg-orange-600 text-white cursor-pointer"
          }`}
        >
          {isResubmittingSection && <LoadingSpinner className="h-4 w-4" />}
          {isResubmittingSection ? "Resubmitting..." : "Resubmit"}
        </button>
      );
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
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
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
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
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
  sectionDoneCandidates,
  sectionFinalizeCandidates,
  sectionReassignCandidates,
  openMarkSectionsDone,
  departmentTotalSections,
  departmentDoneSections,
  departmentRemainingSections,
  departmentReadyToSubmit,
  departmentHasSubmittedSchedule,
  departmentHasWithdrawableSubmission,
  departmentWithdrawalStage,
  handleSubmitForApproval,
  handleWithdrawSubmission,
  canWithdrawSubmission,
  isWithdrawingSubmission,
  onPrint,
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
  canUpdateSchedule,
  canSubmitSchedule,
  canAssignInstructor,
  isEditingSection,
  isResubmittingSection,
  isFinalizing,
  handleEditSection,
  handleResubmit,
  handleFinalize,
  sectionSchedules
}: TopBarProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const sectionListScrollTopRef = useRef<number>(0);

  const [sectionSearch, setSectionSearch] = useState("");
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const readySectionCount = sectionDoneCandidates.filter((candidate) => candidate.isReady).length;
  const readyFinalizeCount = sectionFinalizeCandidates.filter((candidate) => candidate.isReady).length;
  const finalizedSectionCount = sectionReassignCandidates.filter((candidate) => candidate.isReady).length;

  const handleSectionListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sectionListScrollTopRef.current = e.currentTarget.scrollTop;
  };
  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const remainingSubjects = Math.max(0, totalSubjects - totalScheduled);

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

    if (currentStatus === "draft" || currentStatus === "revision") {
      const isRev = currentStatus === "revision";
      if (remainingSubjects > 0) {
        return {
          title: isRev ? "Revision: Plot remaining subjects" : "Plot remaining subjects",
          description: `${remainingSubjects} subject${remainingSubjects !== 1 ? "s" : ""} still need time and room placement.`,
        };
      }

      return {
        title: isRev ? "Revision ready to mark done" : "Section ready to mark done",
        description: isRev
          ? "Review this revised section, then click Done to lock it for department submission."
          : "Review this section, then click Done to lock it for department submission.",
      };
    }

    if (currentStatus === "completed") {
      return {
        title: "Section marked done",
        description: "Plotting is locked for this section. Use Edit to make changes.",
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
  }, [currentStatus, remainingSubjects, selectedSectionId, unassignedSlotsCount]);

  const departmentSubmitLabel = departmentHasSubmittedSchedule
    ? "Already submitted"
    : departmentReadyToSubmit
    ? "Submit Schedule"
    : `${departmentRemainingSections} section${departmentRemainingSections !== 1 ? "s" : ""} remaining`;

  const getDepartmentStatusLabel = (section: DepartmentSectionProgress) => {
    if (section.isDone) return "Done";
    const req = section.requiredCourses ?? section.requiredSubjects ?? 0;
    const plotted = section.plottedCourses ?? section.plottedSubjects ?? 0;
    if (req > plotted) {
      return `${Math.max(0, req - plotted)} unplaced`;
    }
    return "Needs Done";
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
  const toolButtonClass = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold shadow-sm transition-colors";

  const workflowStepper = (
    <ol className="flex min-w-0 items-center gap-3 select-none" aria-label="Scheduling workflow">
      <WorkflowStep
        index={1}
        label="Plotting"
        meta={selectedSectionId ? `${totalScheduled}/${totalSubjects} plotted` : undefined}
        state={plottingState}
      />
      <li role="presentation" aria-hidden="true" className="flex w-10 shrink-0 items-center sm:w-16">
        <span className={`h-0.5 w-full rounded-full transition-colors duration-300 ${isPhase2Active ? "bg-emerald-500" : "bg-slate-200"}`} />
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
    <div className="flex flex-col rounded-t-2xl border-b border-slate-200 bg-white shadow-sm">
      {/* Toolbar: what you are editing, where it is in the workflow, and the phase tools. */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 xl:flex-row xl:items-center xl:gap-6">
        <div id="schedule-builder-section" className="relative shrink-0" ref={dropdownRef}>
          {isLoading ? <Skeleton className="h-[46px] w-full rounded-xl sm:w-[260px]" /> : <><button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isSectionDropdownOpen}
            onClick={() => setIsSectionDropdownOpen(!isSectionDropdownOpen)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-left outline-none transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20 sm:w-[260px]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/[0.07] text-[#4e0a10]">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Section</span>
              <span className="block truncate text-sm font-bold text-slate-800">
                {selectedSection ? (
                  <>
                    {selectedSection.name}
                    <span className="font-medium text-slate-500"> · {yearLevelLabel(selectedSection.yearLevel)}</span>
                  </>
                ) : (
                  "Select a section"
                )}
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${isSectionDropdownOpen ? "rotate-180" : ""}`} />
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

        <div id="schedule-builder-workflow" className="flex min-w-0 flex-1 justify-start xl:justify-center">
          {isLoading ? (
            <div className="flex w-full max-w-md items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" /><Skeleton className="h-8 flex-1 rounded-lg" />
              <Skeleton className="h-0.5 w-12 rounded-full" />
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" /><Skeleton className="h-8 flex-1 rounded-lg" />
            </div>
          ) : workflowStepper}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          {!isLoading && (
            <WorkflowGuideButton
              guideId={
                ["draft", "revision"].includes(currentStatus)
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
                className={`${toolButtonClass} border-[#4e0a10] bg-[#4e0a10] text-white hover:bg-[#3a0809]`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Auto-Assign</span>
              </button>
              {onClearInstructors && (
                <button
                  type="button"
                  onClick={onClearInstructors}
                  disabled={(clearableSectionInstructorCount === 0 && clearableDepartmentInstructorCount === 0) || isClearingSectionInstructors}
                  className={`${toolButtonClass} border-slate-200 bg-white text-red-700 hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50`}
                  title="Remove manageable instructor assignments from this section or the whole department"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  <span>{isClearingSectionInstructors ? "Clearing..." : "Clear Instructors"}</span>
                </button>
              )}
            </>
          ) : ["draft", "revision"].includes(currentStatus) && (
            <>
              {onGenerateYearLevel && (
                <div id="schedule-builder-generate">
                  <GenerateScheduleButton
                    onClick={onGenerateYearLevel}
                  />
                </div>
              )}
              {onResetSchedules && (
                <button
                  type="button"
                  onClick={onResetSchedules}
                  disabled={!canResetSchedules || isClearingAll}
                  className={`${toolButtonClass} border-slate-200 bg-white text-red-700 hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50`}
                  title="Clear plotted schedules from selected sections"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{isClearingAll ? "Resetting..." : "Reset"}</span>
                </button>
              )}
            </>
          )}</>}
          <span aria-hidden="true" className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block" />
          {isLoading ? <Skeleton className="h-9 w-20 rounded-lg" /> : (
            <button
              type="button"
              onClick={onPrint}
              title="Print schedule"
              className={`${toolButtonClass} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>
          )}
        </div>
      </div>

      {/* Status strip: the next step, department readiness, and the section's primary action. */}
      <div id="schedule-builder-next-step" className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto] xl:items-center xl:gap-0 xl:divide-x xl:divide-slate-200">
          <div className="min-w-0 xl:pr-5">
            {isLoading ? (
              <><Skeleton className="h-4 w-36 rounded-full" /><Skeleton className="mt-1.5 h-4 w-48" /><Skeleton className="mt-1 h-3 w-64 max-w-full" /></>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#4e0a10]">Next step</span>
                  <StatusBadge status={currentStatus} />
                </div>
                <p className="mt-1 text-sm font-bold text-slate-800">{nextStep.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{nextStep.description}</p>
              </>
            )}
          </div>

          {isLoading ? (
            <div className="min-w-0 xl:px-5">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="mt-1.5 h-4 w-40" />
              <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
            </div>
          ) : selectedSectionId && departmentTotalSections > 0 ? (
            <div className="min-w-0 xl:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Department readiness</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">
                      {departmentDoneSections}<span className="text-slate-400">/{departmentTotalSections}</span> sections done
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      departmentReadyToSubmit || departmentRemainingSections === 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {departmentReadyToSubmit || departmentRemainingSections === 0 ? "All sections complete" : `${departmentRemainingSections} remaining`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!departmentHasSubmittedSchedule ? (
                    <button
                      type="button"
                      onClick={() => setIsReadinessOpen(!isReadinessOpen)}
                      aria-expanded={isReadinessOpen}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      View sections
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isReadinessOpen ? "rotate-180" : ""}`} />
                    </button>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Submitted
                    </span>
                  )}
                  {departmentHasWithdrawableSubmission && canWithdrawSubmission && !departmentReadyToSubmit ? (
                    <button
                      type="button"
                      onClick={handleWithdrawSubmission}
                      disabled={isWithdrawingSubmission}
                      title={departmentWithdrawalStage === "vpaa_approved"
                        ? "Revoke VPAA approval and recall selected sections for revision"
                        : `Recall selected sections from ${departmentWithdrawalStage === "vpaa_review" ? "VPAA" : "Dean"} review`}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 text-xs font-bold text-orange-700 transition-colors hover:bg-orange-50 disabled:cursor-wait disabled:opacity-70"
                    >
                      {isWithdrawingSubmission ? (
                        <LoadingSpinner className="h-3.5 w-3.5" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {isWithdrawingSubmission
                        ? "Recalling..."
                        : departmentWithdrawalStage === "vpaa_approved"
                          ? "Recall Schedule"
                          : "Recall Submission"}
                    </button>
                  ) : departmentReadyToSubmit && canSubmitSchedule ? (
                    <button
                      type="button"
                      onClick={handleSubmitForApproval}
                      title="Submit the complete department schedule to the Dean"
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#3a0809]"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {departmentSubmitLabel}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" aria-label={`${departmentDoneSections} of ${departmentTotalSections} sections complete`}>
                {departmentSectionProgress.map((section) => (
                  <span
                    key={section.sectionId}
                    className={`h-full flex-1 first:rounded-l-full last:rounded-r-full ${section.isDone ? "bg-emerald-500" : "bg-slate-200"}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div aria-hidden="true" className="hidden xl:block" />
          )}

          <div className="flex items-center xl:justify-end xl:pl-5">
            {isLoading ? (
              <Skeleton className="h-9 w-32 rounded-lg" />
            ) : (
              <ActionButton
                selectedSectionId={selectedSectionId}
                currentStatus={currentStatus}
                totalSubjects={totalSubjects}
                totalScheduled={totalScheduled}
                readySectionCount={readySectionCount}
                readyFinalizeCount={readyFinalizeCount}
                finalizedSectionCount={finalizedSectionCount}
                isEditingSection={isEditingSection}
                isResubmittingSection={isResubmittingSection}
                isFinalizing={isFinalizing}
                openMarkSectionsDone={openMarkSectionsDone}
                handleEditSection={handleEditSection}
                handleResubmit={handleResubmit}
                handleFinalize={handleFinalize}
                sectionSchedules={sectionSchedules}
                canUpdateSchedule={canUpdateSchedule}
                canAssignInstructor={canAssignInstructor}
              />
            )}
          </div>
        </div>

        {isReadinessOpen && !isLoading && selectedSectionId && departmentTotalSections > 0 && !departmentHasSubmittedSchedule && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
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
