import type React from "react";
import { CheckCircle2, ChevronDown, GraduationCap, LayoutGrid, Printer, Users } from "lucide-react";
import { yearLevelLabel } from "./constants";
import type { ScheduleItem, Section } from "./types";

interface TopBarProps {
  sections: Section[];
  selectedSectionId: string;
  isSectionDropdownOpen: boolean;
  setIsSectionDropdownOpen: (value: boolean) => void;
  handleSectionSelect: (sectionId: string) => void;
  selectedYearLevel: number | null;
  isYearDropdownOpen: boolean;
  setIsYearDropdownOpen: (value: boolean) => void;
  handleYearLevelSelect: (year: number | null) => void;
  visibleSections: Section[];
  yearLevels: number[];
  currentStatus: ScheduleItem["status"];
  setScheduleStatus: (value: any) => void;
  isPhase1Completed: boolean;
  isPhase2Active: boolean;
  isPhase2Completed: boolean;
  renderStatusBadge: (status: ScheduleItem["status"]) => React.ReactNode;
  renderActionButton: () => React.ReactNode;
  onPrint: () => void;
}

export default function TopBar({
  sections,
  selectedSectionId,
  isSectionDropdownOpen,
  setIsSectionDropdownOpen,
  handleSectionSelect,
  selectedYearLevel,
  isYearDropdownOpen,
  setIsYearDropdownOpen,
  handleYearLevelSelect,
  visibleSections,
  yearLevels,
  currentStatus,
  setScheduleStatus,
  isPhase1Completed,
  isPhase2Active,
  isPhase2Completed,
  renderStatusBadge,
  renderActionButton,
  onPrint
}: TopBarProps) {
  return (
    <div className="flex flex-col gap-4 bg-white px-6 py-4 border-b border-gray-200 rounded-t-2xl shadow-sm">
      {/* Row 1: Context Filters & Utility Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3.5 border-b border-gray-100">
        {/* Left: Filters and Active Indicator */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Year Level:</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
                className="flex items-center justify-between text-sm bg-white border border-gray-300 rounded-lg px-4 py-2 outline-none hover:border-gray-400 focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] font-medium gap-2 min-w-[150px] transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-800">
                  <GraduationCap className="w-4 h-4 text-[#4e0a10]" />
                  {selectedYearLevel == null ? "All Year Levels" : yearLevelLabel(selectedYearLevel)}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${isYearDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {isYearDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => handleYearLevelSelect(null)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      selectedYearLevel == null
                        ? "text-[#4e0a10] bg-[#4e0a10]/5 font-semibold"
                        : "text-gray-700 font-normal hover:bg-gray-50"
                    }`}
                  >
                    All Year Levels
                  </button>
                  {yearLevels.map((year) => (
                    <button
                      key={year}
                      type="button"
                      onClick={() => handleYearLevelSelect(year)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        selectedYearLevel === year
                          ? "text-[#4e0a10] bg-[#4e0a10]/5 font-semibold"
                          : "text-gray-700 font-normal hover:bg-gray-50"
                      }`}
                    >
                      {yearLevelLabel(year)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Section:</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSectionDropdownOpen(!isSectionDropdownOpen)}
                className="flex items-center justify-between text-sm bg-white border border-gray-300 rounded-lg px-4 py-2 outline-none hover:border-gray-400 focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] font-medium gap-2 min-w-[160px] transition-colors"
              >
                <span className="text-gray-808">{sections.find((s) => s.id === selectedSectionId)?.name ?? "-- Choose Section --"}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${isSectionDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {isSectionDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  {visibleSections.length === 0 ? (
                    <p className="px-4 py-2.5 text-sm text-gray-400">No sections for this year level.</p>
                  ) : (
                    visibleSections.map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => handleSectionSelect(sec.id)}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          selectedSectionId === sec.id
                            ? "text-[#4e0a10] bg-[#4e0a10]/5 font-semibold"
                            : "text-gray-700 font-normal hover:bg-gray-50"
                        }`}
                      >
                        {sec.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {selectedSectionId && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg select-none">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Active:</span>
              <span className="text-sm font-bold text-amber-800">
                {sections.find((s) => s.id === selectedSectionId)?.name}
              </span>
            </div>
          )}
        </div>

        {/* Right: Print and DEV Tools */}
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
          <div className="w-px h-7 bg-gray-200 mx-1 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium">DEV:</span>
            <select
              value={currentStatus}
              onChange={(e) => {
                if (!selectedSectionId) return;
                setScheduleStatus((prev) => ({
                  ...prev,
                  [selectedSectionId]: e.target.value as ScheduleItem["status"]
                }));
              }}
              className="text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1 font-medium text-gray-600 outline-none hover:border-gray-300 focus:border-[#4e0a10] cursor-pointer transition-colors"
            >
              <option value="draft">draft</option>
              <option value="submitted">submitted</option>
              <option value="approved_by_dean">approved_by_dean</option>
              <option value="rejected_by_dean">rejected_by_dean</option>
              <option value="approved">approved</option>
              <option value="faculty_assignment">faculty_assignment</option>
              <option value="finalized">finalized</option>
              <option value="rejected">rejected</option>
            </select>
          </div>
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
          {renderStatusBadge(currentStatus)}
          {renderActionButton()}
        </div>
      </div>
    </div>
  );
}
