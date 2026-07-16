import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, GraduationCap, LayoutGrid, Printer, Send, Users } from "lucide-react";
import { yearLevelLabel } from "./constants";
import type { DepartmentSectionProgress, ScheduleItem, Section } from "./types";
import Skeleton from "../../../components/ui/Skeleton";
import SearchField from "./components/SearchField";

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
  renderStatusBadge: (status: ScheduleItem["status"]) => React.ReactNode;
  renderActionButton: () => React.ReactNode;
  handleSubmitForApproval: () => void;
  onPrint: () => void;
  onTeachingLoad: () => void;
  isLoading?: boolean;
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
  renderStatusBadge,
  renderActionButton,
  handleSubmitForApproval,
  onPrint,
  onTeachingLoad,
  isLoading = false
}: TopBarProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sectionSearch, setSectionSearch] = useState("");
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
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

    if (currentStatus === "draft") {
      if (remainingSubjects > 0) {
        return {
          title: "Plot remaining subjects",
          description: `${remainingSubjects} subject${remainingSubjects !== 1 ? "s" : ""} still need time and room placement.`,
        };
      }

      return {
        title: "Section ready to mark done",
        description: "Review this section, then click Done to lock it for department submission.",
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

    if (currentStatus === "approved_by_dean") {
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
    ? "Submit Department Schedule"
    : `${departmentRemainingSections} section${departmentRemainingSections !== 1 ? "s" : ""} remaining`;

  const getDepartmentStatusLabel = (section: DepartmentSectionProgress) => {
    if (section.isDone) return "Done";
    if (section.requiredSubjects > section.plottedSubjects) {
      return `${Math.max(0, section.requiredSubjects - section.plottedSubjects)} unplaced`;
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

  const phasePipeline = (
    <div className="flex items-center gap-3 select-none overflow-x-auto py-1">
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-300 ${
        isPhase1Completed
          ? "bg-green-600 text-white border-green-600 shadow-sm"
          : "bg-[#4e0a10] text-white border-[#4e0a10] shadow-sm"
      }`}>
        {isPhase1Completed ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <LayoutGrid className="w-4 h-4" />
        )}
        <span>Plotting</span>
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-white/20 text-white">1</span>
      </div>

      <div className="flex items-center gap-0">
        <div className={`w-6 h-0.5 transition-all duration-300 ${
          isPhase2Active ? "bg-green-500" : "bg-gray-200"
        }`} />
        <div className={`w-2 h-2 rounded-full mx-0.5 transition-all duration-300 ${
          isPhase2Active ? "bg-green-500" : "bg-gray-300"
        }`} />
        <div className={`w-6 h-0.5 transition-all duration-300 ${
          isPhase2Active ? "bg-green-500" : "bg-gray-200"
        }`} />
      </div>

      <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-300 whitespace-nowrap ${
        isPhase2Completed
          ? "bg-green-600 text-white border-green-600 shadow-sm"
          : isPhase2Active
          ? "bg-purple-600 text-white border-purple-600 shadow-sm"
          : "bg-white text-gray-400 border-gray-200"
      }`}>
        {isPhase2Completed ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Users className="w-4 h-4" />
        )}
        <span>Faculty Assignment</span>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
          isPhase2Active || isPhase2Completed ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
        }`}>2</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 bg-white px-6 py-4 border-b border-gray-200 rounded-t-2xl shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3.5 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Section:</span>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isSectionDropdownOpen}
                onClick={() => setIsSectionDropdownOpen(!isSectionDropdownOpen)}
                className="flex items-center justify-between text-sm bg-white border border-gray-300 rounded-lg px-4 py-2 outline-none hover:border-gray-400 focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] font-medium gap-2 min-w-[220px] transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-800">
                  <GraduationCap className="w-4 h-4 text-[#4e0a10]" />
                  {isLoading ? (
                    <Skeleton className="h-4 w-32" />
                  ) : selectedSection ? (
                    `${selectedSection.name} — ${yearLevelLabel(selectedSection.yearLevel)}`
                  ) : (
                    "Select a Section"
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${isSectionDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {isSectionDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-full min-w-[300px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-150 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <SearchField
                      value={sectionSearch}
                      onChange={setSectionSearch}
                      placeholder="Search section..."
                      clearLabel="Clear section search"
                      inputClassName="focus:ring-[#4e0a10]/15 focus:border-[#4e0a10]"
                    />
                  </div>
                  <div role="listbox" aria-label="Available sections" className="max-h-80 overflow-y-auto py-1">
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
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg select-none">
              <Skeleton className="h-4 w-24" />
            </div>
          ) : selectedSectionId && selectedSection && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg select-none">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Active:</span>
              <span className="text-sm font-bold text-amber-800">
                {selectedSection.name}
              </span>
            </div>
          )}
          {phasePipeline}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onPrint}
            title="Print Schedule"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Schedule</span>
          </button>
          <button
            type="button"
            onClick={onTeachingLoad}
            title="Print Teaching Load"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#4e0a10] hover:bg-[#C9952A] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer shadow-sm border border-transparent"
          >
            <FileText className="w-4 h-4" />
            <span>Print Teaching Load</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3 pt-1">
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-[#4e0a10]/10 bg-[#4e0a10]/5 px-4 py-2.5">
            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(300px,0.95fr)_minmax(460px,1.05fr)] gap-3 items-center">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#4e0a10]">Next step</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{nextStep.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{nextStep.description}</p>
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

              {selectedSectionId && departmentTotalSections > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
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
                          {departmentReadyToSubmit ? "Ready to submit" : `${departmentRemainingSections} remaining`}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsReadinessOpen(!isReadinessOpen)}
                      aria-expanded={isReadinessOpen}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      View sections
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isReadinessOpen ? "rotate-180" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitForApproval}
                      disabled={!departmentReadyToSubmit}
                      title={
                        departmentReadyToSubmit
                          ? "Submit the complete department schedule to the Dean"
                          : departmentHasSubmittedSchedule
                          ? "Department schedule is already under review"
                          : "All sections must be marked Done before submission"
                      }
                      className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all xl:min-w-[190px] ${
                        departmentReadyToSubmit
                          ? "bg-[#4e0a10] text-white hover:bg-[#3a0809] shadow-sm cursor-pointer"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      {departmentSubmitLabel}
                    </button>
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
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start xl:justify-end gap-3">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </>
          ) : (
            <>
              {renderStatusBadge(currentStatus)}
              {renderActionButton()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
