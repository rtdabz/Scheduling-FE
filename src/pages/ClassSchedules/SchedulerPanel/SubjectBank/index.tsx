import type React from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Search, X } from "lucide-react";
import type { Subject } from "../types";
import CategorySection from "./CategorySection";

interface SubjectBankProps {
  isPhase2Active: boolean;
  currentStatus: string;
  selectedSectionId: string;
  totalScheduled: number;
  totalSubjects: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  listCategories: Subject["category"][];
  filteredSubjects: Subject[];
  collapsedCategories: Record<string, boolean>;
  toggleCategory: (category: string) => void;
  scheduledSubjectIds: Set<string>;
  isEditable: boolean;
  dragSubjectId: string | null;
  placementSubjectId: string | null;
  handleSubjectCardClick: (id: string) => void;
  handleDragStartFromBank: (e: React.DragEvent, id: string) => void;
  handleDragEnd: () => void;
}

export default function SubjectBank({
  isPhase2Active,
  currentStatus,
  selectedSectionId,
  totalScheduled,
  totalSubjects,
  searchQuery,
  setSearchQuery,
  listCategories,
  filteredSubjects,
  collapsedCategories,
  toggleCategory,
  scheduledSubjectIds,
  isEditable,
  dragSubjectId,
  placementSubjectId,
  handleSubjectCardClick,
  handleDragStartFromBank,
  handleDragEnd
}: SubjectBankProps) {
  if (isPhase2Active && currentStatus !== "approved") return null;

  const visibleCategories = listCategories.filter((c) =>
    filteredSubjects.some((s) => s.category === c)
  );

  return (
    <div className="w-full lg:w-1/4 min-w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden h-full">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#4e0a10]" />
          <span className="text-base font-semibold text-gray-800">Subject Bank</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Click a subject, then click a time slot — or drag it onto the timetable
        </p>
        <div className="flex items-center gap-2 mt-2.5">
          <span className="flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            {totalScheduled} Placed
          </span>
          <span className="bg-gray-100 text-gray-500 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
            {totalSubjects - totalScheduled} Remaining
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-gray-700 placeholder:text-gray-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!selectedSectionId ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-gray-500">
              Select a section first to enable scheduling.
            </p>
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <Search className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400 font-medium">No subjects found</p>
            <p className="text-xs text-gray-300 mt-0.5">Try a different keyword</p>
          </div>
        ) : (
          visibleCategories.map((category, visibleIdx) => (
            <div key={category}>
              {visibleIdx > 0 && <div className="border-t border-gray-100 my-1" />}
              <CategorySection
                category={category}
                subjects={filteredSubjects.filter((s) => s.category === category)}
                isCollapsed={collapsedCategories[category] === true}
                onToggle={toggleCategory}
                scheduledSubjectIds={scheduledSubjectIds}
                isEditable={isEditable}
                dragSubjectId={dragSubjectId}
                placementSubjectId={placementSubjectId}
                onSubjectClick={handleSubjectCardClick}
                onDragStart={handleDragStartFromBank}
                onDragEnd={handleDragEnd}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
