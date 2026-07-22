import type React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

  const title = category === "major" ? "Major Courses" : "Minor Courses";
  const scheduledCount = courses.filter((c) => scheduledSubjectIds.has(c.id)).length;

  return (
    <div className="mb-2">
      <button
        onClick={() => onToggle(category)}
        className="w-full flex items-center justify-between py-1.5 px-1 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          )}
          <span>{title}</span>
          <span className="text-[10px] text-gray-400 font-normal">
            ({scheduledCount}/{courses.length})
          </span>
        </div>
      </button>

      {!isCollapsed && (
        <div className="space-y-2 mt-1">
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
    </div>
  );
}
