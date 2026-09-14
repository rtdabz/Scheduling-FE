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

/**
 * Whether the bank has anything to offer for the current workflow step.
 *
 * The panel animates the bank open and closed, so its column is laid out by
 * the parent - which has to know the bank would render nothing before it
 * reserves and animates that space.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const isCourseBankAvailable = (isPhase2Active: boolean, currentStatus: string): boolean =>
  !isPhase2Active || currentStatus === "approved";

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
  if (!isCourseBankAvailable(isPhase2Active, currentStatus)) return null;

  const visibleCategories = listCategories.filter((c) =>
    filteredSubjects.some((s) => s.category === c)
  );

  const classFilters: { value: SubjectClassification; label: string }[] = [
    { value: "all", label: "All" },
    { value: "major", label: "Major" },
    { value: "minor", label: "Minor" }
  ];

  const remainingSubjects = Math.max(0, totalSubjects - totalScheduled);
  const placedPercent = totalSubjects > 0 ? Math.min(100, Math.round((totalScheduled / totalSubjects) * 100)) : 0;

  return (
    <div id="schedule-builder-course-bank" className="flex h-[min(34rem,70vh)] w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white lg:h-full lg:min-h-[24rem]">
      <div className="shrink-0 border-b border-slate-200/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/[0.07] text-[#4e0a10]">
            <BookOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="text-sm font-black text-slate-900">Course Bank</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Click a course, then a time slot — or drag it</p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
        ) : selectedSectionId && totalSubjects > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-700">
                {totalScheduled}<span className="text-slate-400">/{totalSubjects}</span> placed
              </span>
              {remainingSubjects > 0 ? (
                <span className="text-amber-700">{remainingSubjects} to place</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  All placed
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div
                className={`h-full rounded-full transition-all duration-300 ${remainingSubjects === 0 ? "bg-emerald-500" : "bg-[#c9952a]"}`}
                style={{ width: `${placedPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-3">
        {isLoading ? <Skeleton className="h-[34px] w-full rounded-lg" /> : <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search code or title..."
          clearLabel="Clear course search"
          inputClassName="focus:ring-[#4e0a10]/15 focus:border-[#4e0a10]"
        />}

        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Filter courses by type">
          {isLoading ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-7 flex-1 rounded-md" />) : classFilters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={subjectClassFilter === value}
              onClick={() => setSubjectClassFilter(value)}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-bold transition-colors ${subjectClassFilter === value
                  ? "bg-[#4e0a10] text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {isLoading ? (
          <div className="pt-1">
            <div className="flex h-[34px] items-center gap-2 px-1">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-8 rounded-full" />
            </div>
            <div className="mt-1 space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={`sk-course-${idx}`} className="flex gap-2 rounded-xl border border-slate-200 bg-white py-2.5 pl-1.5 pr-3">
                  <Skeleton className="w-1 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="mt-1.5 h-3 w-full" />
                    <Skeleton className="mt-1 h-3 w-4/5" />
                    <Skeleton className="mt-2 h-4 w-24 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : sections.length === 0 || !selectedSectionId ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </span>
            <p className="text-xs font-bold text-slate-700">
              {sections.length === 0 ? "No sections available" : "No section selected"}
            </p>
            <p className="mt-0.5 max-w-[16rem] text-[11px] text-slate-500">
              {sections.length === 0
                ? "There are no sections for the selected semester."
                : "Select a section first to enable scheduling."}
            </p>
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <Search className="h-5 w-5 text-slate-400" />
            </span>
            <p className="text-xs font-bold text-slate-700">No courses found</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Try a different keyword or filter.</p>
          </div>
        ) : (
          visibleCategories.map((category) => (
            <div key={category}>
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
