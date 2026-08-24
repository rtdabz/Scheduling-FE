import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, GraduationCap, LayoutGrid, Printer, RotateCcw, Send, UserCheck, Users } from "lucide-react";
import { yearLevelLabel } from "./constants";
import type { DepartmentSectionProgress, ScheduleItem, Section, WithdrawalStage } from "./types";
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
  onGenerate?: (sectionId: string) => void;
  onGenerateYearLevel?: () => void;
  onAutoAssign?: () => void;
  isGenerateDisabled?: boolean;
  isSectionGenerateDisabled?: boolean;
  isLoading?: boolean;

  isMarkingSectionDone: boolean;
  isEditingSection: boolean;
  isResubmittingSection: boolean;
  isFinalizing: boolean;
  handleMarkSectionDone: () => Promise<void>;
  handleEditSection: () => Promise<void>;
  handleResubmit: () => Promise<void>;
  handleFinalize: () => Promise<void>;
  sectionSchedules: ScheduleItem[];
}

const statusBadgeConfigs: Record<string, { cls: string; label: string }> = {
  draft: { cls: "bg-slate-500 text-white", label: "Draft" },
  completed: { cls: "bg-[#4e0a10] text-white", label: "Done" },
  submitted: { cls: "bg-yellow-500 text-white", label: "Pending Dean Approval" },
  approved_by_dean: { cls: "bg-blue-600 text-white", label: "Pending VPAA Approval" },
  conditionally_approved: { cls: "bg-amber-500 text-white", label: "Conditionally Approved" },
  rejected_by_dean: { cls: "bg-red-600 text-white", label: "Rejected by Dean" },
  approved: { cls: "bg-green-600 text-white", label: "Approved" },
  faculty_assignment: { cls: "bg-purple-600 text-white", label: "Faculty Assignment" },
  finalized: { cls: "bg-emerald-800 text-white", label: "Finalized" },
  rejected: { cls: "bg-red-600 text-white", label: "Rejected" },
  revision: { cls: "bg-orange-600 text-white", label: "Under Revision" }
};

function StatusBadge({ status }: { status: ScheduleItem["status"] }) {
  const cfg = statusBadgeConfigs[status] || {
    cls: "bg-red-500 text-white",
    label: "UNKNOWN"
  };
  return (
    <span className={`${cfg.cls} px-3 py-1 rounded-full text-xs font-medium`}>
      {cfg.label}
    </span>
  );
}

interface ActionButtonProps {
  selectedSectionId: string;
  currentStatus: ScheduleItem["status"];
  totalSubjects: number;
  totalScheduled: number;
  isMarkingSectionDone: boolean;
  isEditingSection: boolean;
  isResubmittingSection: boolean;
  isFinalizing: boolean;
  handleMarkSectionDone: () => Promise<void>;
  handleEditSection: () => Promise<void>;
  handleResubmit: () => Promise<void>;
  handleFinalize: () => Promise<void>;
  sectionSchedules: ScheduleItem[];
}

function ActionButton({
  selectedSectionId,
  currentStatus,
  totalSubjects,
  totalScheduled,
  isMarkingSectionDone,
  isEditingSection,
  isResubmittingSection,
  isFinalizing,
  handleMarkSectionDone,
  handleEditSection,
  handleResubmit,
  handleFinalize,
  sectionSchedules
}: ActionButtonProps) {
  if (!selectedSectionId) return null;
  switch (currentStatus) {
    case "draft":
    case "revision": {
      const remaining = Math.max(0, totalSubjects - totalScheduled);
      const canMarkDone = totalSubjects > 0 && remaining === 0;
      return (
        <button
          onClick={handleMarkSectionDone}
          disabled={!canMarkDone || isMarkingSectionDone}
          title={!canMarkDone ? `${remaining} subject${remaining !== 1 ? "s" : ""} still need placement` : "Mark this section as done"}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
            canMarkDone && !isMarkingSectionDone
              ? "bg-[#4e0a10] hover:bg-[#3a0809] text-white cursor-pointer"
              : canMarkDone
              ? "bg-[#4e0a10] text-white cursor-wait opacity-80"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isMarkingSectionDone && <LoadingSpinner className="h-4 w-4" />}
          {canMarkDone ? (isMarkingSectionDone ? "Marking..." : "Done") : `${remaining} unplaced`}
        </button>
      );
    }
    case "completed":
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
    case "faculty_assignment": {
      const unassigned = sectionSchedules.filter((s) => !s.facultyId).length;
      const allAssigned = unassigned === 0;
      return (
        <button
          onClick={handleFinalize}
          disabled={!allAssigned || isFinalizing}
          title={!allAssigned ? `${unassigned} slot${unassigned !== 1 ? "s" : ""} still need faculty` : undefined}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
            allAssigned && !isFinalizing
              ? "bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
              : allAssigned
              ? "bg-emerald-700 text-white cursor-wait opacity-80"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isFinalizing && <LoadingSpinner className="h-4 w-4" />}
          {allAssigned ? (isFinalizing ? "Finalizing..." : "Mark as Finalized") : `${unassigned} slots still need faculty`}
        </button>
      );
    }
    case "finalized":
      return <button disabled className="px-4 py-2 bg-emerald-800 text-white text-sm font-semibold rounded-lg cursor-not-allowed opacity-75">Schedule Finalized</button>;
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
  onGenerate,
  onGenerateYearLevel,
  onAutoAssign,
  isGenerateDisabled,
  isSectionGenerateDisabled,
  isLoading = false,
  isMarkingSectionDone,
  isEditingSection,
  isResubmittingSection,
  isFinalizing,
  handleMarkSectionDone,
  handleEditSection,
  handleResubmit,
  handleFinalize,
  sectionSchedules
}: TopBarProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const printDropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const sectionListScrollTopRef = useRef<number>(0);

  const [sectionSearch, setSectionSearch] = useState("");
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const [isPrintDropdownOpen, setIsPrintDropdownOpen] = useState(false);

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
        title: "Start faculty assignment",
        description: "The timetable is approved. Begin assigning instructors to each class.",
      };
    }

    if (currentStatus === "faculty_assignment") {
      return {
        title: unassignedSlotsCount > 0 ? "Complete faculty assignment" : "Ready to finalize",
        description: unassignedSlotsCount > 0
          ? `${unassignedSlotsCount} class${unassignedSlotsCount !== 1 ? "es" : ""} still need an instructor.`
          : "All classes have assigned instructors.",
      };
    }

    if (currentStatus === "finalized") {
      return {
        title: "Schedule finalized",
        description: "This section is complete and ready for printing or review.",
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
    // Gated on either menu: the handlers close both, so registering only while
    // the section dropdown was open left the Print menu undismissable by an
    // outside click or Escape.
    if (!isSectionDropdownOpen && !isPrintDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsSectionDropdownOpen(false);
      }
      if (!printDropdownRef.current?.contains(event.target as Node)) {
        setIsPrintDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSectionDropdownOpen(false);
        setIsPrintDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSectionDropdownOpen, isPrintDropdownOpen, setIsSectionDropdownOpen, setIsPrintDropdownOpen]);

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

  const phasePipeline = (
    <div className="grid w-full max-w-[430px] grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2 select-none">
      <div className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-all duration-300 ${
        isPhase1Completed
          ? "bg-green-600 text-white border-green-600 shadow-sm"
          : "bg-[#4e0a10] text-white border-[#4e0a10] shadow-sm"
      }`}>
        {isPhase1Completed ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <LayoutGrid className="w-4 h-4 shrink-0" />
        )}
        <span className="truncate">Plotting</span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white">1</span>
      </div>

      <div className="flex items-center justify-center">
        <div className={`h-0.5 flex-1 transition-all duration-300 ${
          isPhase2Active ? "bg-green-500" : "bg-gray-300"
        }`} />
        <div className={`mx-1 h-2 w-2 shrink-0 rounded-full transition-all duration-300 ${
          isPhase2Active ? "bg-green-500" : "bg-gray-300"
        }`} />
      </div>

      <div className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-all duration-300 ${
        isPhase2Completed
          ? "bg-green-600 text-white border-green-600 shadow-sm"
          : isPhase2Active
          ? "bg-purple-600 text-white border-purple-600 shadow-sm"
          : "bg-white text-gray-400 border-gray-200"
      }`}>
        {isPhase2Completed ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <Users className="w-4 h-4 shrink-0" />
        )}
        <span className="truncate">Faculty Assignment</span>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          isPhase2Active || isPhase2Completed ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
        }`}>2</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-t-2xl border-b border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-5">
      <div className="grid grid-cols-1 gap-3 border-b border-gray-100 pb-3 xl:grid-cols-[minmax(360px,1fr)_minmax(340px,0.85fr)_auto] xl:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Section:</span>
            <div id="schedule-builder-section" className="relative" ref={dropdownRef}>
              {isLoading ? <Skeleton className="h-[38px] w-[220px] rounded-lg" /> : <><button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isSectionDropdownOpen}
                onClick={() => setIsSectionDropdownOpen(!isSectionDropdownOpen)}
                className="flex min-w-0 w-full max-w-[280px] items-center justify-between gap-2 overflow-hidden rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium outline-none transition-colors hover:border-gray-400 focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20 sm:min-w-[220px]"
              >
                <span className="flex min-w-0 items-center gap-2 overflow-hidden text-gray-800">
                  <GraduationCap className="w-4 h-4 shrink-0 text-[#4e0a10]" />
                  {selectedSection ? (
                    `${selectedSection.name} — ${yearLevelLabel(selectedSection.yearLevel)}`
                  ) : (
                    "Select a Section"
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${isSectionDropdownOpen ? "rotate-180" : ""}`} />
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
          </div>

          {isLoading ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 select-none">
              <Skeleton className="h-4 w-24" />
            </div>
          ) : selectedSectionId && selectedSection && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 select-none">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Active:</span>
              <span className="text-sm font-bold text-amber-800">
                {selectedSection.name}
              </span>
            </div>
          )}
        </div>

        <div id="schedule-builder-workflow" className="flex min-w-0 justify-start xl:justify-center">
          {isLoading ? <div className="grid w-full max-w-2xl grid-cols-[1fr_32px_1fr] items-center"><Skeleton className="h-9 w-full rounded-xl" /><div className="px-1"><Skeleton className="h-1 w-full rounded-full" /></div><Skeleton className="h-9 w-full rounded-xl" /></div> : phasePipeline}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          {!isLoading && (
            <WorkflowGuideButton
              guideId={
                ["draft", "revision"].includes(currentStatus)
                  ? "schedule-builder-plotting"
                  : ["approved", "faculty_assignment"].includes(currentStatus)
                    ? "schedule-builder-faculty-assignment"
                    : "schedule-builder-review"
              }
            />
          )}
          {isLoading ? <><Skeleton className="h-8 w-28 rounded-xl" /><Skeleton className="h-[38px] w-24 rounded-lg" /><Skeleton className="h-[38px] w-24 rounded-lg" /></> : <>{onAutoAssign && ["approved", "faculty_assignment"].includes(currentStatus) ? (
            <button
              id="schedule-builder-auto-assign"
              type="button"
              onClick={onAutoAssign}
              className="flex items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Auto-Assign</span>
            </button>
          ) : onGenerate && (
            <div id="schedule-builder-generate">
              <GenerateScheduleButton
                disabled={Boolean(isGenerateDisabled)}
                sectionDisabled={Boolean(isSectionGenerateDisabled)}
                onClick={() => selectedSectionId && onGenerate(selectedSectionId)}
                onYearLevelClick={onGenerateYearLevel}
              />
            </div>
          )}</>}
          {isLoading ? <><Skeleton className="h-[38px] w-24 rounded-lg" /></> : <>
          <div className="relative" ref={printDropdownRef}>
            <button
              type="button"
              onClick={() => setIsPrintDropdownOpen(!isPrintDropdownOpen)}
              aria-haspopup="menu"
              aria-expanded={isPrintDropdownOpen}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isPrintDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {isPrintDropdownOpen && (
              <div role="menu" className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setIsPrintDropdownOpen(false); onPrint(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Printer className="w-4 h-4 text-[#4e0a10]" />
                  Print Schedule
                </button>
              </div>
            )}
          </div></>}
        </div>
      </div>

        <div id="schedule-builder-next-step" className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.15fr)_auto] xl:items-center">
              <div className="flex min-w-0 flex-col gap-3 rounded-lg px-1 py-1 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isLoading ? <><Skeleton className="h-2.5 w-14" /><Skeleton className="h-5 w-16 rounded-full" /></> : <><p className="text-[10px] font-extrabold uppercase tracking-wider text-[#4e0a10]">Next step</p><StatusBadge status={currentStatus} /></>}
                  </div>
                  {isLoading ? <><Skeleton className="mt-1 h-4 w-40" /><Skeleton className="mt-1 h-3 w-64 max-w-full" /></> : <><p className="text-sm font-bold text-gray-800 mt-0.5">{nextStep.title}</p><p className="text-xs text-gray-500 mt-0.5">{nextStep.description}</p></>}
                </div>
                {selectedSectionId && (
                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                    <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600">
                      {totalScheduled}/{totalSubjects} plotted
                    </span>
                    {isPhase2Active && (
                      <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600">
                        {assignedSlotsCount}/{totalSlotsCount} assigned
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-2.5 w-32" />
                      <div className="mt-1 flex items-center gap-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                      <Skeleton className="mt-2 h-1.5 w-full max-w-xs rounded-full" />
                    </div>
                    <Skeleton className="h-9 w-24 rounded-lg" />
                    <Skeleton className="h-9 w-[190px] rounded-lg" />
                  </div>
                </div>
              ) : selectedSectionId && departmentTotalSections > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 mr-auto">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">Department readiness</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <p className="text-sm font-bold text-gray-800">
                          {departmentDoneSections}/{departmentTotalSections} sections done
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          departmentReadyToSubmit
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}>
                          {departmentReadyToSubmit ? "All sections complete" : `${departmentRemainingSections} remaining`}
                        </span>
                      </div>
                      <div className="mt-2 flex h-1.5 w-full max-w-xs gap-0.5 overflow-hidden rounded-full" aria-label={`${departmentDoneSections} of ${departmentTotalSections} sections complete`}>
                        {departmentSectionProgress.map((section) => (
                          <span
                            key={section.sectionId}
                            className={`h-full flex-1 first:rounded-l-full last:rounded-r-full ${section.isDone ? "bg-emerald-500" : "bg-gray-200"}`}
                          />
                        ))}
                      </div>
                    </div>

                    {!departmentHasSubmittedSchedule ? <button
                      type="button"
                      onClick={() => setIsReadinessOpen(!isReadinessOpen)}
                      aria-expanded={isReadinessOpen}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      View sections
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isReadinessOpen ? "rotate-180" : ""}`} />
                    </button> : (
                      <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Submitted
                      </span>
                    )}
                    {departmentHasWithdrawableSubmission && canWithdrawSubmission ? (
                      <button
                        type="button"
                        onClick={handleWithdrawSubmission}
                        disabled={isWithdrawingSubmission}
                        title={departmentWithdrawalStage === "vpaa_approved"
                          ? "Revoke VPAA approval and withdraw selected sections for revision"
                          : `Withdraw selected sections from ${departmentWithdrawalStage === "vpaa_review" ? "VPAA" : "Dean"} review`}
                        className="flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition-all hover:bg-orange-100 disabled:cursor-wait disabled:opacity-70 xl:min-w-[190px]"
                      >
                        {isWithdrawingSubmission ? (
                          <LoadingSpinner className="w-4 h-4" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        {isWithdrawingSubmission
                          ? "Withdrawing..."
                          : departmentWithdrawalStage === "vpaa_approved"
                            ? "Withdraw Schedule"
                            : "Withdraw Submission"}
                      </button>
                    ) : departmentReadyToSubmit ? (
                      <button
                        type="button"
                        onClick={handleSubmitForApproval}
                        title="Submit the complete department schedule to the Dean"
                        className="flex items-center justify-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#3a0809] xl:min-w-[170px]"
                      >
                        <Send className="w-4 h-4" />
                        {departmentSubmitLabel}
                      </button>
                    ) : null}
                  </div>

                  {isReadinessOpen && (
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2 border-t border-gray-100 pt-2">
                      {departmentSectionProgress.map((section) => (
                        <button
                          key={section.sectionId}
                          type="button"
                          onClick={() => handleSectionSelect(section.sectionId)}
                          className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                            section.isSelected
                              ? "border-[#4e0a10] bg-[#4e0a10]/5"
                              : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                          }`}
                        >
                          <span className="block text-[11px] font-bold text-gray-800 truncate">{section.sectionName}</span>
                          <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${
                            section.isDone ? "text-emerald-700" : "text-amber-700"
                          }`}>
                            {section.isDone ? (
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                            )}
                            <span className="truncate">{getDepartmentStatusLabel(section)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

        <div className="flex min-w-[130px] flex-col items-stretch justify-center gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-sm xl:items-end">
          <span className="px-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Section action</span>
          {isLoading ? (
            <Skeleton className="h-9 w-28 rounded-lg" />
          ) : (
            <ActionButton
              selectedSectionId={selectedSectionId}
              currentStatus={currentStatus}
              totalSubjects={totalSubjects}
              totalScheduled={totalScheduled}
              isMarkingSectionDone={isMarkingSectionDone}
              isEditingSection={isEditingSection}
              isResubmittingSection={isResubmittingSection}
              isFinalizing={isFinalizing}
              handleMarkSectionDone={handleMarkSectionDone}
              handleEditSection={handleEditSection}
              handleResubmit={handleResubmit}
              handleFinalize={handleFinalize}
              sectionSchedules={sectionSchedules}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
import LoadingSpinner from "../../../components/ui/LoadingSpinner";
