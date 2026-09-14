import type React from "react";
import { CheckCircle2, FlaskConical, GripVertical, LayoutGrid, Radio } from "lucide-react";
import type { Course } from "../types";
import { isLaboratorySubject } from "../hooks/useConflict";

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

const requirementBadgeClass = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold";

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
  const isInteractive = isEditable && !isScheduled;

  let roomBadge = null;
  // Derived like RuleEngine does: any laboratory component means a lab room is
  // required, whatever room_type_required says.
  if (isLaboratorySubject(course)) {
    roomBadge = (
      <span className={`${requirementBadgeClass} bg-[#4e0a10]/[0.07] text-[#4e0a10]`} title="Laboratory room required">
        <FlaskConical className="h-3 w-3" />
        Lab
      </span>
    );
  } else if (course.roomTypeRequired === "field") {
    roomBadge = (
      <span className={`${requirementBadgeClass} bg-amber-50 text-amber-700`} title="Field required">
        <LayoutGrid className="h-3 w-3" />
        Field
      </span>
    );
  } else if (course.roomTypeRequired === "online") {
    roomBadge = (
      <span className={`${requirementBadgeClass} bg-violet-50 text-violet-700`} title="Online room">
        <Radio className="h-3 w-3" />
        Online
      </span>
    );
  }

  return (
    <div
      draggable={isInteractive}
      onDragStart={(e) => isInteractive && onDragStart(e, course.id)}
      onDragEnd={onDragEnd}
      onClick={() => isInteractive && onClick(course.id)}
      onKeyDown={(e) => {
        if (isInteractive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(course.id);
        }
      }}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? isPlacementSelected : undefined}
      aria-label={`${course.code} ${course.name}${isScheduled ? ", plotted" : ""}`}
      className={`group relative flex select-none items-stretch gap-2 rounded-xl border bg-white py-2.5 pl-1.5 pr-3 text-xs outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#4e0a10]/40 ${
        isPlacementSelected
          ? "border-[#4e0a10] bg-[#4e0a10]/[0.04] ring-2 ring-[#4e0a10]/15"
          : isScheduled
            ? "cursor-default border-slate-200 bg-slate-50"
            : isEditable
              ? "cursor-grab border-slate-200 hover:border-slate-300 hover:shadow-sm active:cursor-grabbing"
              : "cursor-default border-slate-200"
      } ${isDragging ? "scale-95 opacity-30" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`w-1 shrink-0 rounded-full ${isScheduled ? "bg-slate-200" : isMajor ? "bg-[#4e0a10]" : "bg-[#c9952a]"}`}
      />

      <div className={`min-w-0 flex-1 ${isScheduled ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-black text-[#4e0a10]">{course.code}</span>
          {isScheduled ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Plotted
            </span>
          ) : isEditable ? (
            <GripVertical aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          ) : null}
        </div>

        <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-slate-600">
          {course.name}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
            {course.units} {course.units === 1 ? "unit" : "units"}
          </span>
          {roomBadge}
          {course.lectureHours > 0 && course.labHours > 0 && (
            <span className="text-[10px] font-semibold text-slate-400">
              {course.lectureHours} Lec · {course.labHours} Lab
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
