import type React from "react";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
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
  /** Shown in the header: the selected section's curriculum picker. */
  curriculumControl?: React.ReactNode;
}

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
  isLoading = false,
  curriculumControl
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

  return (
    <div id="schedule-builder-course-bank" className="flex h-[min(34rem,70vh)] w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:h-full lg:min-h-[24rem]">
      <div className="bg-wicars-header relative shrink-0 border-b border-[#36060b] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">Manual Plotting</h2>
          {!isLoading && curriculumControl}
        </div>
        <p className="mt-0.5 text-[11px] text-white/70">Select a subject, then click a time slot — or drag it.</p>

        {isLoading ? (
          <Skeleton className="mt-2.5 h-4 w-40 rounded bg-white/20" />
        ) : selectedSectionId && totalSubjects > 0 && (
          <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] font-semibold" aria-label="Plotting progress for this section">
            <span className="text-white">
              <span className="tabular-nums">{totalScheduled}</span>
              <span className="text-white/60"> of {totalSubjects}</span> plotted
            </span>
            {remainingSubjects > 0 ? (
              <span className="rounded-full bg-[#c9952a]/25 px-2 py-0.5 text-[#f3d18a]">
                <span className="tabular-nums">{remainingSubjects}</span> remaining
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All plotted
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-b border-slate-200 bg-[#faf7f3] px-3 py-2.5">
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
              className={`selection-indicator flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors ${subjectClassFilter === value
                  ? ""
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {isLoading ? (
          <div className="pt-1">
            <div className="flex h-[34px] items-center gap-2 px-1">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-8 rounded-full" />
            </div>
            <div className="mt-1 space-y-1.5">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={`sk-course-${idx}`} className="flex gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-3">
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
            <AlertTriangle className="mb-2 h-5 w-5 text-slate-400" aria-hidden="true" />
            <p className="text-xs font-semibold text-slate-700">
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
            <Search className="mb-2 h-5 w-5 text-slate-400" aria-hidden="true" />
            <p className="text-xs font-semibold text-slate-700">No courses found</p>
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
