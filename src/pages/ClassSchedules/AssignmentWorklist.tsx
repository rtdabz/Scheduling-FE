import { useMemo } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Lock,
  MapPin,
  UserX,
} from "lucide-react";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { instructorOptionLabel } from "./SchedulerPanel/EmploymentBadge";

export interface WorklistMeeting {
  id: number;
  day: string;
  startTime: string;
  endTime: string;
  roomName: string;
}

export interface WorklistEligibleFaculty {
  id: number;
  name: string;
  employmentType?: "full-time" | "part-time";
  conflict: string | null;
  /** Pro-Bono or workload-limit note for this class, e.g. "Pro-Bono 37/36". */
  loadNote?: string | null;
}

export interface WorklistClass {
  key: string;
  scheduleId: number;
  courseCode: string;
  courseName: string;
  units: number;
  sectionName: string;
  facultyId: number | null;
  facultyName: string | null;
  locked: boolean;
  meetings: WorklistMeeting[];
  eligible: WorklistEligibleFaculty[];
  restrictionNote: string | null;
}

interface AssignmentWorklistProps {
  classes: WorklistClass[];
  busyScheduleId: number | null;
  onAssign: (scheduleId: number, facultyId: number | null) => void;
  emptyMessage: string;
}

const DAY_ABBREVIATIONS: Record<string, string> = {
  Monday: "M",
  Tuesday: "T",
  Wednesday: "W",
  Thursday: "Th",
  Friday: "F",
  Saturday: "Sa",
  Sunday: "Su",
};

const DAY_ORDER = Object.keys(DAY_ABBREVIATIONS);

export const meetingPatterns = (meetings: WorklistMeeting[]): string[] => {
  const byTime = new Map<string, string[]>();
  for (const meeting of meetings) {
    const timeKey = `${meeting.startTime} - ${meeting.endTime}`;
    byTime.set(timeKey, [...(byTime.get(timeKey) ?? []), meeting.day]);
  }

  return [...byTime.entries()].map(([time, days]) => {
    const abbreviated = [...days]
      .sort((left, right) => DAY_ORDER.indexOf(left) - DAY_ORDER.indexOf(right))
      .map((day) => DAY_ABBREVIATIONS[day] ?? day)
      .join("");
    return `${abbreviated} ${time}`;
  });
};

/** Indent that lines secondary row content up with the course code, past the status icon. */
const ROW_INDENT = "pl-[22px]";

export default function AssignmentWorklist({
  classes,
  busyScheduleId,
  onAssign,
  emptyMessage,
}: AssignmentWorklistProps) {
  const groups = useMemo(() => {
    const bySection = new Map<string, WorklistClass[]>();
    for (const item of classes) {
      bySection.set(item.sectionName, [...(bySection.get(item.sectionName) ?? []), item]);
    }
    return [...bySection.entries()]
      .map(([sectionName, items]) => ({
        sectionName,
        items,
        pending: items.filter((item) => item.facultyId === null).length,
      }))
      .sort((left, right) => left.sectionName.localeCompare(right.sectionName));
  }, [classes]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-700">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const assigned = group.items.length - group.pending;
        const complete = group.pending === 0;
        const percent = Math.round((assigned / group.items.length) * 100);
        return (
          <section
            key={group.sectionName}
            aria-label={`Section ${group.sectionName}`}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <h3 className="min-w-0 truncate text-[15px] font-bold tracking-tight text-[#5A1220]">
                {group.sectionName}
              </h3>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs font-medium tabular-nums text-slate-500">
                  {assigned}/{group.items.length} assigned
                </span>
                <span
                  aria-hidden="true"
                  className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/70 sm:block"
                >
                  <span
                    className={`block h-full rounded-full ${complete ? "bg-emerald-600" : "bg-[#F5A623]"}`}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                    complete
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-amber-50 text-[#8A5A12] ring-amber-200"
                  }`}
                >
                  {complete
                    ? <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                    : <AlertTriangle aria-hidden="true" className="h-3 w-3" />}
                  {complete ? `all ${assigned} assigned` : `${group.pending} need instructor`}
                </span>
              </div>
            </header>

            <ul className="divide-y divide-slate-100">
              {group.items.map((item) => (
                <WorklistRow
                  key={item.key}
                  item={item}
                  isBusy={busyScheduleId === item.scheduleId}
                  onAssign={onAssign}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function WorklistRow({
  item,
  isBusy,
  onAssign,
}: {
  item: WorklistClass;
  isBusy: boolean;
  onAssign: (scheduleId: number, facultyId: number | null) => void;
}) {
  const patterns = meetingPatterns(item.meetings);
  const rooms = [...new Set(item.meetings.map((meeting) => meeting.roomName))].join(", ");
  const isAssigned = item.facultyId !== null;

  return (
    <li
      className={`relative grid gap-2.5 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-6 ${
        isAssigned ? "" : "bg-amber-50/30"
      }`}
    >
      {/* Amber rail marks a class that still needs an instructor. */}
      {!isAssigned && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-[#F5A623]" />
      )}

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            role="img"
            aria-label={isAssigned ? "Instructor assigned" : "Needs instructor"}
            className={`shrink-0 ${isAssigned ? "text-emerald-600" : "text-[#C9952A]"}`}
          >
            {isAssigned ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          </span>
          <span className="shrink-0 text-[13px] font-bold text-[#5A1220]">{item.courseCode}</span>
          <span className="min-w-0 truncate text-sm font-medium text-slate-800" title={item.courseName}>
            {item.courseName}
          </span>
        </div>
        <div className={`mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-slate-500 ${ROW_INDENT}`}>
          {patterns.map((pattern) => (
            <span key={pattern} className="inline-flex items-center gap-1 tabular-nums">
              <Clock aria-hidden="true" className="h-3 w-3 text-slate-400" />
              {pattern}
            </span>
          ))}
          {rooms && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" className="h-3 w-3 text-slate-400" />
              {rooms}
            </span>
          )}
          {item.units > 0 && (
            <span className="inline-flex items-center gap-1">
              <BookOpen aria-hidden="true" className="h-3 w-3 text-slate-400" />
              {item.units} units
            </span>
          )}
        </div>
        {item.restrictionNote && item.eligible.length === 0 && (
          <p className={`mt-1 text-xs font-medium text-[#8A5A12] ${ROW_INDENT}`}>{item.restrictionNote}</p>
        )}
      </div>

      <div className={`flex min-w-0 items-center gap-2 ${ROW_INDENT} lg:pl-0`}>
        {item.locked ? (
          <span className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
            <Lock aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate">{item.facultyName ?? "No instructor"}</span>
          </span>
        ) : (
          <>
            <div className="relative min-w-0 flex-1">
              <label className="sr-only" htmlFor={`worklist-faculty-${item.key}`}>
                Instructor for {item.courseCode} {item.sectionName}
              </label>
              <select
                id={`worklist-faculty-${item.key}`}
                value={item.facultyId === null ? "" : String(item.facultyId)}
                disabled={isBusy}
                onChange={(event) => onAssign(
                  item.scheduleId,
                  event.target.value === "" ? null : Number(event.target.value),
                )}
                className={`h-9 w-full appearance-none truncate rounded-lg border bg-white pl-3 pr-8 text-xs font-semibold outline-none transition-colors focus-visible:border-[#5A1220] focus-visible:ring-2 focus-visible:ring-[#5A1220]/15 disabled:cursor-wait disabled:opacity-60 ${
                  isAssigned
                    ? "border-slate-200 text-slate-900"
                    : "border-amber-300 text-[#8A5A12]"
                }`}
              >
                <option value="">
                  {item.eligible.length === 0 ? "No eligible instructor" : "Select an instructor"}
                </option>
                {item.eligible.map((faculty) => (
                  <option
                    key={faculty.id}
                    value={faculty.id}
                    className={faculty.conflict ? "font-bold text-red-600" : "font-normal text-slate-900"}
                  >
                    {instructorOptionLabel(faculty.name, faculty.employmentType, Boolean(faculty.conflict))}
                    {faculty.loadNote ? ` - ${faculty.loadNote}` : ""}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                {isBusy
                  ? <LoadingSpinner className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onAssign(item.scheduleId, null)}
              disabled={isBusy || !isAssigned}
              title="Remove this instructor"
              aria-label={`Remove instructor from ${item.courseCode} ${item.sectionName}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-300 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
            >
              <UserX className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
