import type React from "react";
import { CheckCircle2, MousePointerClick } from "lucide-react";
import { getCategoryStyles, getLeftAccentBorder } from "../constants";
import type { Subject } from "../types";

interface SubjectCardProps {
  subject: Subject;
  isPlaced: boolean;
  isEditable: boolean;
  isDragging: boolean;
  isSelected: boolean;
  onClick: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

export default function SubjectCard({
  subject,
  isPlaced,
  isEditable,
  isDragging,
  isSelected,
  onClick,
  onDragStart,
  onDragEnd
}: SubjectCardProps) {
  const styles = getCategoryStyles(subject.category);
  const leftBorder = getLeftAccentBorder(subject.category);

  return (
    <div
      draggable={isEditable}
      onDragStart={(e) => onDragStart(e, subject.id)}
      onDragEnd={onDragEnd}
      onClick={() => isEditable && onClick(subject.id)}
      onKeyDown={(e) => {
        if (isEditable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(subject.id);
        }
      }}
      role={isEditable ? "button" : undefined}
      tabIndex={isEditable ? 0 : undefined}
      aria-pressed={isEditable ? isSelected : undefined}
      title={subject.name}
      className={`bg-white border rounded-xl p-3 mb-2 select-none transition-all duration-150 motion-reduce:transition-none ${leftBorder} ${
        isSelected
          ? "border-[#4e0a10] ring-2 ring-[#4e0a10]/40 shadow-md"
          : "border-gray-200"
      } ${
        !isEditable
          ? "opacity-60 cursor-not-allowed"
          : "cursor-pointer hover:shadow-md hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[#4e0a10]/50"
      } ${isPlaced && !isSelected ? "opacity-60" : ""} ${isDragging ? "opacity-50 scale-95 rotate-1 shadow-lg" : ""}`}
    >
      <div className="flex justify-between items-start gap-1">
        <span className="text-sm font-bold text-gray-800 uppercase leading-tight">
          {subject.code}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isPlaced && (
            <span className="flex items-center gap-0.5 text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Placed
            </span>
          )}
          <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">
            {subject.units}u
          </span>
        </div>
      </div>

      <div className="text-xs text-gray-600 mt-1 leading-tight line-clamp-1">
        {subject.name}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-xs rounded-full px-2 py-0.5 border font-medium inline-block ${styles.typeBadge}`}>
          {styles.label}
        </span>
        {isSelected && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-[#4e0a10]">
            <MousePointerClick className="w-3.5 h-3.5" />
            Click a slot
          </span>
        )}
      </div>
    </div>
  );
}
