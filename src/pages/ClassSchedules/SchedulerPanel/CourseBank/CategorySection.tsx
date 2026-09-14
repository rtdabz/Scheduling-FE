import type React from "react";
import { ChevronDown } from "lucide-react";
import type { Course } from "../types";
import CourseCard from "./CourseCard";

interface CategorySectionProps {
  category: Course["category"];
  courses: Course[];
  isCollapsed: boolean;
  onToggle: (category: string) => void;
  scheduledSubjectIds: Set<string>;
  isEditable: boolean;
  dragSubjectId: string | null;
  placementSubjectId: string | null;
  onSubjectClick: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

export default function CategorySection({
  category,
  courses,
  isCollapsed,
  onToggle,
  scheduledSubjectIds,
  isEditable,
  dragSubjectId,
  placementSubjectId,
  onSubjectClick,
  onDragStart,
  onDragEnd
}: CategorySectionProps) {
  if (courses.length === 0) return null;

  const isMajor = category === "major";
  const title = isMajor ? "Major Courses" : "Minor Courses";
  const scheduledCount = courses.filter((c) => scheduledSubjectIds.has(c.id)).length;
  const isComplete = scheduledCount === courses.length;

  return (
    <section className="pb-2">
      <button
        type="button"
        onClick={() => onToggle(category)}
        aria-expanded={!isCollapsed}
        className="sticky top-0 z-10 flex w-full items-center gap-2 bg-white/95 px-1 py-2 text-left backdrop-blur-sm"
      >
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isMajor ? "bg-[#4e0a10]" : "bg-[#c9952a]"}`} />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">{title}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
          isComplete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
        }`}>
          {scheduledCount}/{courses.length}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`} />
      </button>

      {!isCollapsed && (
        <div className="mt-1 space-y-2">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              isScheduled={scheduledSubjectIds.has(course.id)}
              isEditable={isEditable}
              isDragging={dragSubjectId === course.id}
              isPlacementSelected={placementSubjectId === course.id}
              onClick={onSubjectClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </section>
  );
}
