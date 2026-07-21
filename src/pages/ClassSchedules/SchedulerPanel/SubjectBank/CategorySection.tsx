import type React from "react";
import { ChevronDown } from "lucide-react";
import { getCategoryStyles } from "../constants";
import type { Subject } from "../types";
import SubjectCard from "./SubjectCard";

interface CategorySectionProps {
  category: Subject["category"];
  subjects: Subject[];
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

const categoryDotColor: Record<Subject["category"], string> = {
  major: "bg-blue-500",
  minor: "bg-purple-500",
};

export default function CategorySection({
  category,
  subjects,
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
  const styles = getCategoryStyles(category);
  const dotColor = categoryDotColor[category];

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white">
        <button
          type="button"
          onClick={() => onToggle(category)}
          className="w-full flex items-center justify-between px-1 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
            <span className="text-xs font-bold tracking-wider uppercase text-gray-500">
              {styles.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-400">
              {subjects.length}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
                isCollapsed ? "-rotate-90" : ""
              }`}
            />
          </div>
        </button>
      </div>

      {!isCollapsed && (
        <div className="mt-1 space-y-2 pl-1">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              isPlaced={scheduledSubjectIds.has(subject.id)}
              isEditable={isEditable}
              isDragging={dragSubjectId === subject.id}
              isSelected={placementSubjectId === subject.id}
              onClick={() => onSubjectClick(subject.id)}
              onDragStart={(e) => onDragStart(e, subject.id)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
