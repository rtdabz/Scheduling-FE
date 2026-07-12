import type React from "react";
import { CheckCircle2, ChevronDown, GraduationCap, LayoutGrid, Printer, Users, FileText } from "lucide-react";
import { yearLevelLabel } from "./constants";
import type { ScheduleItem, Section } from "./types";
import Skeleton from "../../../components/ui/Skeleton";

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
  renderStatusBadge: (status: ScheduleItem["status"]) => React.ReactNode;
  renderActionButton: () => React.ReactNode;
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
  renderStatusBadge,
  renderActionButton,
  onPrint,
  onTeachingLoad,
  isLoading = false
}: TopBarProps) {
  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  return (
    <div className="flex flex-col gap-4 bg-white px-6 py-4 border-b border-gray-200 rounded-t-2xl shadow-sm">
      {/* Row 1: Section Selector & Utility Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3.5 border-b border-gray-100">
        {/* Left: Grouped Section Selector and Active Indicator */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Section:</span>
            <div className="relative">
              <button
                type="button"
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
                <div className="absolute left-0 mt-1.5 w-full min-w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150 max-h-80 overflow-y-auto">
                  {groupedSections.length === 0 ? (
                    <p className="px-4 py-2.5 text-sm text-gray-400">No sections available.</p>
                  ) : (
                    groupedSections.map((group) => (
                      <div key={group.yearLevel}>
                        <div className="px-4 py-2 text-xs font-bold text-[#4e0a10] uppercase tracking-wider bg-gray-50 border-b border-gray-100 select-none sticky top-0">
                          {yearLevelLabel(group.yearLevel)}
                        </div>
                        {group.sections.map((sec) => (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => handleSectionSelect(sec.id)}
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
        </div>

        {/* Right: Print */}
        <div className="flex items-center gap-3">
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

      {/* Row 2: Stepper Pipeline & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
        {/* Left: Progress Stepper */}
        <div className="flex items-center gap-3 select-none justify-start">
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

          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-300 ${
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

        {/* Right: Approval & Workflow Actions */}
        <div className="flex items-center gap-3">
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
