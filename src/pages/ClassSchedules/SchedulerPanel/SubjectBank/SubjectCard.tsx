import type React from "react";
import { CheckCircle2 } from "lucide-react";
import { getCategoryStyles, getLeftAccentBorder } from "../constants";
import type { Subject } from "../types";

interface SubjectCardProps {
  subject: Subject;
  isPlaced: boolean;
  isEditable: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

export default function SubjectCard({
  subject,
  isPlaced,
  isEditable,
  isDragging,
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
      title={subject.name}
      className={`bg-white border border-gray-200 rounded-xl p-3 mb-2 select-none transition-all duration-150 ${leftBorder} ${
        !isEditable
          ? "opacity-60 cursor-not-allowed"
          : isPlaced
          ? "opacity-60 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5"
          : "cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5"
      } ${isDragging ? "opacity-50 scale-95 rotate-1 shadow-lg" : ""}`}
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

      <div className="text-xs text-gray-500 mt-1 leading-tight line-clamp-1">
        {subject.name}
      </div>

      <div className="mt-2">
        <span className={`text-xs rounded-full px-2 py-0.5 border font-medium inline-block ${styles.typeBadge}`}>
          {styles.label}
        </span>
      </div>
    </div>
  );
}
