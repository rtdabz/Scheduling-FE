import type React from "react";
import { CheckCircle2, FlaskConical, LayoutGrid, Radio } from "lucide-react";
import type { Course } from "../types";

interface CourseCardProps {
  course: Course;
  isScheduled: boolean;
  isEditable: boolean;
  isDragging: boolean;
  isPlacementSelected: boolean;
  onClick: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

export default function CourseCard({
  course,
  isScheduled,
  isEditable,
  isDragging,
  isPlacementSelected,
  onClick,
  onDragStart,
  onDragEnd
}: CourseCardProps) {
  const isMajor = course.category === "major";

  let roomBadge = null;
  if (course.roomTypeRequired === "laboratory") {
    roomBadge = (
      <span className="flex items-center gap-1 bg-[#4e0a10]/5 text-[#4e0a10] border border-[#4e0a10]/15 rounded-full px-2 py-0.5 text-[10px] font-semibold">
        <FlaskConical className="w-2.5 h-2.5" />
        Lab Required
      </span>
    );
  } else if (course.roomTypeRequired === "field") {
    roomBadge = (
      <span className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-[10px] font-semibold">
        <LayoutGrid className="w-2.5 h-2.5" />
        Field Required
      </span>
    );
  } else if (course.roomTypeRequired === "online") {
    roomBadge = (
      <span className="flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 text-[10px] font-semibold">
        <Radio className="w-2.5 h-2.5" />
        Online Room
      </span>
    );
  }

  return (
    <div
      draggable={isEditable && !isScheduled}
      onDragStart={(e) => isEditable && !isScheduled && onDragStart(e, course.id)}
      onDragEnd={onDragEnd}
      onClick={() => isEditable && !isScheduled && onClick(course.id)}
      className={`bg-white border rounded-xl p-3 text-xs transition-all relative select-none ${
        isMajor ? "border-l-4 border-l-[#4e0a10]" : "border-l-4 border-l-[#d4af37]"
      } ${
        isScheduled
          ? "opacity-50 cursor-default bg-gray-50 border-gray-200"
          : isEditable
          ? "cursor-grab active:cursor-grabbing hover:shadow-md hover:border-gray-300"
          : "cursor-default"
      } ${isDragging ? "opacity-30 scale-95" : ""} ${
        isPlacementSelected ? "ring-2 ring-[#4e0a10] ring-offset-1 bg-[#4e0a10]/5 border-[#4e0a10]" : ""
      }`}
    >
      <div className="flex justify-between items-start gap-1">
        <span className="font-bold text-[#4e0a10] text-xs">{course.code}</span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            isMajor ? "bg-[#4e0a10]/10 text-[#4e0a10]" : "bg-[#d4af37]/20 text-[#8a7018]"
          }`}
        >
          {course.units} units
        </span>
      </div>

      <p className="text-gray-700 font-medium line-clamp-2 mt-1 leading-snug text-xs">
        {course.name}
      </p>

      <div className="mt-2.5 flex items-center justify-between gap-1 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {roomBadge}
          {course.lectureHours > 0 && course.labHours > 0 && (
            <span className="text-[10px] text-gray-400 font-medium">
              {course.lectureHours}Lec / {course.labHours}Lab
            </span>
          )}
        </div>
        {isScheduled && (
          <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold bg-green-50 px-1.5 py-0.5 rounded ml-auto">
            <CheckCircle2 className="w-3 h-3" /> Plotted
          </span>
        )}
      </div>
    </div>
  );
}
