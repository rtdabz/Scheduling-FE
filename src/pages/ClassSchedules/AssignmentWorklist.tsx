import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  MapPin,
  UserX,
} from "lucide-react";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

/**
 * The list half of the instructor-assignment workspace.
 *
 * The weekly grid answers "when does this run"; the work itself is "which
 * classes still have nobody", which meant scanning seven columns for amber
 * blocks. This groups the same schedules by section and offers the instructor
 * picker inline, so clearing a department is a column of selects rather than a
 * modal round-trip per class.
 *
 * One row is one class, not one meeting. `schedules.day` stores a row per
 * meeting, so an MWF class is three rows in the grid; assigning any one of them
 * assigns the whole split group, and showing three rows would imply three
 * decisions.
 */

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
  /** Why this instructor cannot take the class, or null when they can. */
  conflict: string | null;
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
  /** Approved and finalized, or already marked done — the picker is read-only. */
  locked: boolean;
  meetings: WorklistMeeting[];
  eligible: WorklistEligibleFaculty[];
  /** Program or department restriction to explain an empty picker. */
  restrictionNote: string | null;
}

interface AssignmentWorklistProps {
  classes: WorklistClass[];
  /** The class whose assignment is in flight, so only its row shows a spinner. */
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

/**
 * "MWF 8:00 AM - 9:00 AM" rather than three separate lines, collapsing the days
 * that share a time. A class whose meetings run at different times keeps them
 * on separate lines, because there is no honest way to fold those together.
 */
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

  // Sections that still need somebody open themselves; a finished section stays
  // folded so the remaining work is what fills the screen.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setCollapsed((previous) => {
      const next = { ...previous };
      for (const group of groups) {
        if (!(group.sectionName in next)) next[group.sectionName] = group.pending === 0;
      }
      return next;
    });
  }, [groups]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
        <p className="text-sm font-black text-slate-700">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.sectionName] ?? false;
        const assigned = group.items.length - group.pending;
        return (
          <section
            key={group.sectionName}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => setCollapsed((previous) => ({
                ...previous,
                [group.sectionName]: !isCollapsed,
              }))}
              aria-expanded={!isCollapsed}
              aria-label={`Section ${group.sectionName}`}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                {isCollapsed
                  ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="truncate text-sm font-black text-[#4e0a10]">{group.sectionName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                <span
                  className={`text-xs font-black ${group.pending ? "text-amber-700" : "text-emerald-700"}`}
                >
                  {group.pending ? `${group.pending} need instructor` : `all ${assigned} assigned`}
                </span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:block">
                  <span
                    className={`block h-full rounded-full ${group.pending ? "bg-[#C9952A]" : "bg-emerald-600"}`}
                    style={{ width: `${Math.round((assigned / group.items.length) * 100)}%` }}
                  />
                </span>
              </span>
            </button>

            {!isCollapsed && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {group.items.map((item) => (
                  <WorklistRow
                    key={item.key}
                    item={item}
                    isBusy={busyScheduleId === item.scheduleId}
                    onAssign={onAssign}
                  />
                ))}
              </ul>
            )}
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
  const isAssigned = item.facultyId !== null;

  return (
    <li
      className={`flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between ${
        isAssigned ? "" : "bg-amber-50/40"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
            isAssigned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {isAssigned ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">
            {item.courseCode}
            <span className="font-bold text-slate-500"> · {item.courseName}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
            {patterns.map((pattern) => (
              <span key={pattern} className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 text-[#C9952A]" />
                {pattern}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-[#C9952A]" />
              {[...new Set(item.meetings.map((meeting) => meeting.roomName))].join(", ")}
            </span>
            {item.units > 0 && <span>{item.units} units</span>}
          </div>
          {item.restrictionNote && item.eligible.length === 0 && (
            <p className="mt-1 text-[11px] font-bold text-[#7a4c08]">{item.restrictionNote}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 lg:w-80">
        {item.locked ? (
          <span className="flex h-9 flex-1 items-center justify-end truncate px-1 text-xs font-black text-slate-600">
            {item.facultyName ?? "No instructor"}
          </span>
        ) : (
          <>
            <div className="relative flex-1">
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
                className={`h-9 w-full appearance-none truncate rounded-xl border bg-white pl-3 pr-8 text-xs font-bold outline-none transition-colors focus:border-[#C9952A] disabled:cursor-wait disabled:opacity-60 ${
                  isAssigned
                    ? "border-emerald-300 text-emerald-900"
                    : "border-amber-300 text-amber-900"
                }`}
              >
                <option value="">
                  {item.eligible.length === 0 ? "No eligible instructor" : "Select an instructor"}
                </option>
                {item.eligible.map((faculty) => (
                  <option key={faculty.id} value={faculty.id}>
                    {faculty.conflict ? `${faculty.name} — Conflict` : faculty.name}
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
            >
              <UserX className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
