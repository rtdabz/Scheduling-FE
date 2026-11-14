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

const requirementBadgeClass = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold";

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
  if (isLaboratorySubject(course)) {
    roomBadge = (
      <span className={`${requirementBadgeClass} bg-[#4e0a10]/[0.07] text-[#4e0a10]`} title="Laboratory room required">
        <FlaskConical className="h-3 w-3" />
        Lab room
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

  const hours = [
    course.lectureHours > 0 ? `${course.lectureHours} Lec` : null,
    course.labHours > 0 ? `${course.labHours} Lab` : null,
  ].filter(Boolean).join(" · ");

  const status = isPlacementSelected ? (
    <span className="shrink-0 rounded bg-[#4e0a10] px-1.5 py-0.5 text-[10px] font-semibold text-white">Selected</span>
  ) : isScheduled ? (
    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Plotted
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[#8a5a12]">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#c9952a]" />
      To plot
    </span>
  );

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
      className={`group relative flex select-none items-stretch gap-2.5 rounded-lg border py-2 pl-2 pr-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#4e0a10]/40 ${
        isPlacementSelected
          ? "border-[#4e0a10] bg-[#fdf9f3] ring-1 ring-[#4e0a10]"
          : isScheduled
            ? "cursor-default border-slate-200 bg-slate-50/70"
            : isEditable
              ? "cursor-grab border-slate-200 bg-white hover:border-[#4e0a10]/40 hover:bg-[#fdf9f3] active:cursor-grabbing"
              : "cursor-default border-slate-200 bg-white"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`w-[3px] shrink-0 rounded-full ${isScheduled ? "bg-slate-200" : isMajor ? "bg-[#4e0a10]" : "bg-[#c9952a]"}`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-[13px] font-bold ${isScheduled ? "text-slate-500" : "text-[#4e0a10]"}`}>{course.code}</span>
          {status}
        </div>

        <p className={`mt-0.5 line-clamp-2 text-xs leading-snug ${isScheduled ? "text-slate-400" : "text-slate-600"}`}>
          {course.name}
        </p>

        <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] ${isScheduled ? "opacity-60" : ""}`}>
          <span className="font-semibold text-slate-700">
            {course.units} {course.units === 1 ? "unit" : "units"}
          </span>
          {hours && <span className="text-slate-500">{hours}</span>}
          {roomBadge}
        </div>
      </div>

      {isInteractive && (
        <GripVertical aria-hidden="true" className="h-4 w-4 shrink-0 self-center text-slate-300 transition-colors group-hover:text-slate-500" />
      )}
    </div>
  );
}
