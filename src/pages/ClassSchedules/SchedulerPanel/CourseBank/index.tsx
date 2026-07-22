import type React from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Search } from "lucide-react";
import type { Course, Section } from "../types";
import type { SubjectClassification } from "../constants";
import CategorySection from "./CategorySection";
import Skeleton from "../../../../components/ui/Skeleton";
import SearchField from "../components/SearchField";

interface CourseBankProps {
  sections: Section[];
  isPhase2Active: boolean;
  currentStatus: string;
  selectedSectionId: string;
  totalScheduled: number;
  totalSubjects: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  subjectClassFilter: SubjectClassification;
  setSubjectClassFilter: (value: SubjectClassification) => void;
  listCategories: Course["category"][];
  filteredSubjects: Course[];
  collapsedCategories: Record<string, boolean>;
  toggleCategory: (category: string) => void;
  scheduledSubjectIds: Set<string>;
  isEditable: boolean;
  dragSubjectId: string | null;
  placementSubjectId: string | null;
  handleSubjectCardClick: (id: string) => void;
  handleDragStartFromBank: (e: React.DragEvent, id: string) => void;
  handleDragEnd: () => void;
  isLoading?: boolean;
}

export default function CourseBank({
  sections,
  isPhase2Active,
  currentStatus,
  selectedSectionId,
  totalScheduled,
  totalSubjects,
  searchQuery,
  setSearchQuery,
  subjectClassFilter,
  setSubjectClassFilter,
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
  handleDragEnd,
  isLoading = false
}: CourseBankProps) {
  if (isPhase2Active && currentStatus !== "approved") return null;

  const visibleCategories = listCategories.filter((c) =>
    filteredSubjects.some((s) => s.category === c)
  );

  const classFilters: { value: SubjectClassification; label: string }[] = [
    { value: "all", label: "All" },
    { value: "major", label: "Major" },
    { value: "minor", label: "Minor" }
  ];

  return (
    <div className="w-full lg:w-1/4 min-w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden h-full">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#4e0a10]" />
          <span className="text-base font-semibold text-gray-800">Course Bank</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Click a course, then click a time slot — or drag it onto the timetable
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
        <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search courses..."
          clearLabel="Clear course search"
        />

        <div className="flex items-center gap-1 mt-2.5 bg-gray-100 rounded-lg p-0.5" role="group" aria-label="Filter courses by type">
          {classFilters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={subjectClassFilter === value}
              onClick={() => setSubjectClassFilter(value)}
              className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-colors ${
                subjectClassFilter === value
                  ? "bg-white text-[#4e0a10] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, idx) => (
            <div key={`sk-course-${idx}`} className="bg-white border border-gray-200 border-l-4 border-l-gray-300 rounded-xl p-3 mb-2 animate-pulse">
              <div className="flex justify-between items-start gap-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-8 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full mt-2" />
              <div className="mt-2.5 flex items-center justify-between">
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-gray-500">
              No sections available for the selected semester.
            </p>
          </div>
        ) : !selectedSectionId ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-gray-500">
              Select a section first to enable scheduling.
            </p>
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <Search className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400 font-medium">No courses found</p>
            <p className="text-xs text-gray-300 mt-0.5">Try a different keyword</p>
          </div>
        ) : (
          visibleCategories.map((category, visibleIdx) => (
            <div key={category}>
              {visibleIdx > 0 && <div className="border-t border-gray-100 my-1" />}
              <CategorySection
                category={category}
                courses={filteredSubjects.filter((s) => s.category === category)}
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
