import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";

export type SetupCourseOption = {
  id: string;
  code: string;
  name: string;
  meta?: string;
};

export function CourseIdentity({
  code,
  name,
  meta,
  trailing,
}: {
  code: string;
  name: string;
  meta?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#4e0a10]/10 text-[#4e0a10]" title="Course" aria-hidden="true">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="text-sm font-black leading-tight text-slate-950">{code}</span>
        </div>
        <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-slate-700">{name}</p>
        {meta && <p className="text-[11px] font-semibold leading-tight text-slate-500">{meta}</p>}
      </div>
      {trailing}
    </div>
  );
}

export default function SetupCourseSelector({
  courses,
  selectedIds,
  onToggle,
  disabled = false,
  emptyText = "No courses are available for this configuration.",
}: {
  courses: SetupCourseOption[];
  selectedIds: ReadonlySet<string>;
  onToggle: (courseId: string) => void;
  disabled?: boolean;
  emptyText?: string;
}) {
  if (courses.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="grid gap-1.5 lg:grid-cols-2">
      {courses.map((course) => {
        const selected = selectedIds.has(course.id);
        return (
          <label
            key={course.id}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 transition ${
              selected
                ? "border-[#4e0a10] bg-[#4e0a10]/5 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={disabled}
              onChange={() => onToggle(course.id)}
              className="mt-1.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#4e0a10]"
            />
            <CourseIdentity code={course.code} name={course.name} meta={course.meta} />
          </label>
        );
      })}
    </div>
  );
}
