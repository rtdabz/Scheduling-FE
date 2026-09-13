import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info, Layers3, ListChecks, Pencil, Plus, Save, Search, Scale, SlidersHorizontal, Trash2, UserCheck, UserRound, Users, X } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { INSTRUCTOR_ASSIGNABLE_STATUSES, type Faculty, type ScheduleItem, type Subject } from "../types";
import ProfileAvatar from "../../../../components/ui/ProfileAvatar";
import TableActionButton from "../../../../components/ui/TableActionButton";
import { useToast } from "../../../../context/ToastContext";
import { facultyEligibilityForSubject } from "../facultyEligibility";
import { LOAD_TIER_BADGE_CLASSES, LOAD_TIER_LABELS, basicLoadOf, loadTierForUnits, type LoadAllowances } from "../../../../lib/facultyLoad";
import type { LoadTier } from "../../../../lib/overloadConfirmation";
import WizardProgressStepper from "../GenerateSchedule/WizardProgressStepper";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";

/* Opening the wizard resets its local draft state. */
/* eslint-disable react-hooks/set-state-in-effect */

interface AssignmentBatch {
  scheduleIds: string[];
  facultyId: string;
}

interface AutoAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedules: ScheduleItem[];
  subjects: Subject[];
  faculties: Faculty[];
  departmentId: number | null;
  programId?: number | null;
  facultyActionSlotId: string | null;
  canManageScheduleFaculty: (schedule: ScheduleItem) => boolean;
  checkFacultyConflict: (facultyId: string, scheduleId: string) => string | null;
  onAssign: (assignments: AssignmentBatch[]) => Promise<boolean>;
  /** Clears the instructor from one class; omitted where removal is not offered. */
  onRemoveAssignment?: (scheduleIds: string[]) => Promise<boolean>;
  /** Cross-department assignment is restricted to the receiving department. */
  allowExternalInstructors?: boolean;
}

interface SectionGroup {
  key: string;
  courseId: string;
  yearLevel: number;
  sectionId: string;
  sectionName: string;
  courseCode: string;
  courseName: string;
  units: number;
  schedules: ScheduleItem[];
  assignedFacultyId: string | null;
}

interface QueuedAssignment {
  key: string;
  facultyId: string;
  facultyName: string;
  courseCode: string;
  courseName: string;
  sectionName: string;
  units: number;
  schedule: string;
  mode: string;
  scheduleIds: string[];
}

const steps = [
  { id: 1, title: "Build Assignment List" },
  { id: 2, title: "Review Assignments" },
  { id: 3, title: "Confirm & Save" },
];

const overlaps = (left: ScheduleItem, right: ScheduleItem): boolean =>
  left.dayIndex === right.dayIndex
  && left.startSlot < right.startSlot + right.durationSlots
  && right.startSlot < left.startSlot + left.durationSlots;

const groupsOverlap = (left: SectionGroup, right: SectionGroup): boolean =>
  left.schedules.some((leftSchedule) => right.schedules.some((rightSchedule) => overlaps(leftSchedule, rightSchedule)));

/**
 * An instructor's load bands. Basic Load is what the server calls
 * `required_units` (max_units - deload_units); the fallback recomputes it from
 * the raw columns so an older cached payload still reads correctly. There is no
 * magic default any more: an instructor with nothing configured has a Basic Load
 * of 0, which reads as "no load recorded" rather than an invented 24-unit cap.
 */
const loadBandsOf = (faculty?: Faculty): LoadAllowances => ({
  basicLoad: faculty?.requiredUnits ?? basicLoadOf(faculty?.maxUnits, faculty?.deloadUnits),
  overloadUnits: faculty?.overloadUnits ?? 0,
  probonoUnits: faculty?.probonoUnits ?? 0,
});

interface LoadDisplay {
  bands: LoadAllowances;
  tier: LoadTier | null;
  label: string;
  badgeClass: string;
  percentage: number;
  barClass: string;
}

/**
 * How a load reads on screen. The bar fills against Basic Load, so once it is
 * full the band name carries the rest of the story — that is the point of the
 * change: past Basic Load is a label now, not a wall.
 */
const loadDisplay = (faculty: Faculty | undefined, units: number): LoadDisplay => {
  const bands = loadBandsOf(faculty);

  // No Basic Load recorded means there is no band to report, and it is the same
  // condition under which the server's confirmation leaves the instructor alone.
  if (bands.basicLoad <= 0) {
    return {
      bands,
      tier: null,
      label: "No load recorded",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
      percentage: 0,
      barClass: "bg-slate-300",
    };
  }

  const tier = loadTierForUnits(bands, units);

  return {
    bands,
    tier,
    label: LOAD_TIER_LABELS[tier],
    badgeClass: LOAD_TIER_BADGE_CLASSES[tier],
    percentage: Math.min(100, (units / bands.basicLoad) * 100),
    barClass: tier === "basic" ? "bg-emerald-500" : tier === "beyond_ceiling" ? "bg-rose-500" : "bg-amber-500",
  };
};

/**
 * In any band above Basic Load — which is exactly the set the server asks about
 * when the batch is saved, so the counts shown here and the prompt agree. An
 * instructor with no recorded load is not past anything.
 */
const isPastBasicLoad = (faculty: Faculty | undefined, units: number): boolean => {
  const { tier } = loadDisplay(faculty, units);

  return tier !== null && tier !== "basic";
};

const MODE_ORDER: Record<string, number> = { "on-site": 0, field: 1, online: 2 };
const MODE_LABELS: Record<string, string> = { "on-site": "On-site", field: "Field", online: "Online" };

/**
 * 'Mon/Wed 7 PM-8:30 PM | Tue 9 AM-11 AM'. `schedules.day` is one row per
 * meeting, so meetings at the same time and mode fold into one entry, and
 * in-person entries come before online ones.
 */
const scheduleLabel = (group: SectionGroup): string => {
  const entries = new Map<string, ScheduleItem[]>();
  group.schedules
    .slice()
    .sort((left, right) => left.dayIndex - right.dayIndex || left.startSlot - right.startSlot)
    .forEach((schedule) => {
      const key = `${schedule.startTime}|${schedule.endTime}|${schedule.mode ?? ""}`;
      entries.set(key, [...(entries.get(key) ?? []), schedule]);
    });
  return [...entries.values()]
    .sort((left, right) => (MODE_ORDER[left[0].mode ?? ""] ?? 3) - (MODE_ORDER[right[0].mode ?? ""] ?? 3))
    .map((meetings) => {
      const days = meetings.length === 1 ? meetings[0].day : meetings.map((meeting) => meeting.day.slice(0, 3)).join("/");
      return `${days} ${meetings[0].startTime}-${meetings[0].endTime}`;
    })
    .join(" | ");
};

/** 'On-site | Online': every delivery mode the class uses, in-person first. */
const modesLabel = (group: SectionGroup): string => [...new Set(group.schedules.map((schedule) => schedule.mode ?? "on-site"))]
  .sort((left, right) => (MODE_ORDER[left] ?? 3) - (MODE_ORDER[right] ?? 3))
  .map((mode) => MODE_LABELS[mode] ?? mode)
  .join(" | ");

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const STEP_HELP: Record<number, string> = {
  1: "Pick an instructor, tick sections of a course, then add them to the list. Repeat for other courses or instructors.",
  2: "Check each instructor's load and remove anything that should not be assigned.",
  3: "Nothing is saved until you click Save Assignments.",
};

export default function AutoAssignModal({
  isOpen,
  onClose,
  schedules,
  subjects,
  faculties: providedFaculties,
  departmentId,
  programId = null,
  facultyActionSlotId,
  canManageScheduleFaculty,
  checkFacultyConflict,
  onAssign,
  onRemoveAssignment,
  allowExternalInstructors = true,
}: AutoAssignModalProps) {
  const { confirm } = useToast();
  // The server scopes Program Heads too, but keep the modal fail-closed so a
  // stale scheduler cache cannot expose another program's instructors.
  const faculties = useMemo(
    () => providedFaculties.filter((faculty) => (
      programId === null || Number(faculty.programId ?? 0) === Number(programId)
    )),
    [programId, providedFaculties],
  );
  const [step, setStep] = useState(1);
  const [facultyId, setFacultyId] = useState("");
  const [yearLevel, setYearLevel] = useState("1");
  const [courseId, setCourseId] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<QueuedAssignment[]>([]);

  const groups = useMemo<SectionGroup[]>(() => {
    const map = new Map<string, SectionGroup>();
    schedules
      .filter((schedule) => INSTRUCTOR_ASSIGNABLE_STATUSES.includes(schedule.status))
      .forEach((schedule) => {
        const key = `${schedule.courseId}:${schedule.sectionId}`;
        const existing = map.get(key);
        if (existing) {
          existing.schedules.push(schedule);
          if (schedule.facultyId) existing.assignedFacultyId = schedule.facultyId;
          return;
        }
        map.set(key, {
          key,
          courseId: schedule.courseId,
          yearLevel: Number(subjects.find((subject) => subject.id === schedule.courseId)?.yearLevel ?? 1),
          sectionId: schedule.sectionId,
          sectionName: schedule.sectionName,
          courseCode: schedule.courseCode,
          courseName: schedule.courseName,
          units: schedule.totalUnits,
          schedules: [schedule],
          assignedFacultyId: null,
        });
      });
    return [...map.values()]
      .map((group) => ({
        ...group,
        // A split class can have one meeting block saved before another. Keep it
        // assignable until every block has an instructor.
        assignedFacultyId: group.schedules.every((schedule) => Boolean(schedule.facultyId))
          ? group.schedules[0]?.facultyId ?? null
          : null,
      }))
      .sort((left, right) => left.courseCode.localeCompare(right.courseCode) || left.sectionName.localeCompare(right.sectionName));
  }, [schedules, subjects]);

  const courseOptions = useMemo(() => {
    const ids = new Set(groups.filter((group) => group.yearLevel === Number(yearLevel)).map((group) => group.courseId));
    return subjects.filter((subject) => ids.has(subject.id)).sort((left, right) => left.code.localeCompare(right.code));
  }, [groups, subjects, yearLevel]);

  const facultyLoads = useMemo(() => {
    const loads = new Map<string, number>();
    // Seeded from the server's own figure instead of by summing the visible
    // groups: `assignedUnits` covers the whole semester, so a filtered view no
    // longer under-reports a load, and the already-assigned groups are inside it
    // already — adding them here counted them twice. Only queued rows, which
    // nothing has written yet, are added on top.
    faculties.forEach((faculty) => {
      loads.set(faculty.id, faculty.assignedUnits ?? 0);
    });
    assignments.forEach((assignment) => {
      loads.set(assignment.facultyId, (loads.get(assignment.facultyId) ?? 0) + assignment.units);
    });
    return loads;
  }, [assignments, faculties]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setAssignments([]);
    setFacultyId(faculties.find((faculty) => departmentId !== null && Number(faculty.departmentId) === Number(departmentId))?.id ?? faculties[0]?.id ?? "");
    const initialYearLevel = [1, 2, 3, 4].find((level) => groups.some((group) => group.yearLevel === level)) ?? 1;
    const initialCourseIds = new Set(groups.filter((group) => group.yearLevel === initialYearLevel).map((group) => group.courseId));
    const initialCourse = subjects.filter((subject) => initialCourseIds.has(subject.id)).sort((left, right) => left.code.localeCompare(right.code))[0];
    setYearLevel(String(initialYearLevel));
    setCourseId(initialCourse?.id ?? "");
    setSelectedKeys([]);
  }, [departmentId, isOpen, faculties, groups, subjects]);

  const selectedFaculty = faculties.find((faculty) => faculty.id === facultyId);
  const currentLoad = facultyLoads.get(facultyId) ?? 0;
  const courseGroups = useMemo(() => groups.filter((group) =>
    group.yearLevel === Number(yearLevel) && group.courseId === courseId,
  ), [courseId, groups, yearLevel]);

  const queuedKeys = new Set(assignments.map((assignment) => assignment.key));
  const getIssue = (group: SectionGroup, selectionKeys = selectedKeys): string | null => {
    if (group.assignedFacultyId) {
      const assignedFaculty = faculties.find((faculty) => faculty.id === group.assignedFacultyId);
      const assignedName = assignedFaculty?.name ?? group.schedules.find((schedule) => schedule.facultyId === group.assignedFacultyId)?.facultyName ?? "Instructor";
      const assignedDepartment = assignedFaculty?.departmentName ?? assignedFaculty?.departmentCode ?? "assigned department";
      return `Assigned Instructor: ${assignedName} from ${assignedDepartment}`;
    }
    if (queuedKeys.has(group.key)) return "Queued for assignment";
    const pendingSchedules = group.schedules.filter((schedule) => !schedule.facultyId);
    if (!pendingSchedules.every(canManageScheduleFaculty)) return "Assigned teaching department only";

    // A major is taught by its own department and, when the course names one, its
    // own program — the save refuses anything else.
    if (selectedFaculty) {
      const subject = subjects.find((item) => item.id === group.courseId);
      const eligibility = facultyEligibilityForSubject(
        selectedFaculty,
        subject,
        group.schedules[0]?.departmentId ?? departmentId,
      );
      if (!eligibility.eligible) return eligibility.reason;
    }
    for (const schedule of pendingSchedules) {
      const issue = checkFacultyConflict(facultyId, schedule.id);
      if (issue) return issue;
    }
    const queuedFacultySchedules = assignments
      .filter((assignment) => assignment.facultyId === facultyId)
      .flatMap((assignment) => assignment.scheduleIds)
      .map((scheduleId) => schedules.find((schedule) => schedule.id === scheduleId))
      .filter((schedule): schedule is ScheduleItem => !!schedule);
    if (pendingSchedules.some((schedule) => queuedFacultySchedules.some((queued) => overlaps(schedule, queued)))) {
      return "Conflicts with a queued assignment";
    }
    const selectedGroupsForConflict = groups.filter((selectedGroup) =>
      selectedGroup.key !== group.key && selectionKeys.includes(selectedGroup.key),
    );
    if (selectedGroupsForConflict.some((selectedGroup) => groupsOverlap(selectedGroup, group))) {
      return "Conflict";
    }
    // Load is deliberately absent from this list. Assignment continues past Basic
    // Load into the overload allowance and then pro bono, so a heavy load is
    // labelled beside the instructor and confirmed on save — only genuine
    // conflicts and eligibility still block a section.
    const facultyCeiling = selectedFaculty?.unitCeiling
      ?? (selectedFaculty
        ? basicLoadOf(selectedFaculty.maxUnits, selectedFaculty.deloadUnits)
          + Math.max(0, selectedFaculty.overloadUnits ?? 0)
          + Math.max(0, selectedFaculty.probonoUnits ?? 0)
        : 0);
    const selectedUnitsForLoad = groups
      .filter((selectedGroup) => selectionKeys.includes(selectedGroup.key))
      .reduce((total, selectedGroup) => total + selectedGroup.units, 0);
    if (facultyCeiling > 0 && currentLoad + selectedUnitsForLoad + group.units > facultyCeiling) {
      return `Exceeds the ${facultyCeiling}-unit ceiling`;
    }
    return null;
  };

  const selectedGroups = courseGroups.filter((group) => selectedKeys.includes(group.key));
  const selectedUnits = selectedGroups.reduce((total, group) => total + group.units, 0);
  // Where ticking these sections would leave the instructor, so the band is
  // visible before anything is queued — let alone saved.
  const projectedLoad = loadDisplay(selectedFaculty, currentLoad + selectedUnits);
  const isSaving = facultyActionSlotId === "bulk";

  const selectFaculty = (id: string) => {
    setFacultyId(id);
    setSelectedKeys([]);
  };

  const selectCourse = (id: string) => {
    setCourseId(id);
    setSelectedKeys([]);
  };

  const selectYearLevel = (value: string) => {
    const matchingCourseIds = new Set(groups.filter((group) => group.yearLevel === Number(value)).map((group) => group.courseId));
    const firstCourse = subjects.filter((subject) => matchingCourseIds.has(subject.id)).sort((left, right) => left.code.localeCompare(right.code))[0];
    setYearLevel(value);
    setCourseId(firstCourse?.id ?? "");
    setSelectedKeys([]);
  };

  const toggleGroup = (group: SectionGroup) => {
    if (getIssue(group)) return;
    setSelectedKeys((current) => {
      if (current.includes(group.key)) return current.filter((key) => key !== group.key);
      const selected = courseGroups.filter((item) => current.includes(item.key));
      // Only a time clash with something already ticked stops a section being
      // added; the units it adds are reported, not refused.
      if (selected.some((item) => groupsOverlap(item, group))) return current;
      return [...current, group.key];
    });
  };

  const selectableCourseGroupKeys = (() => {
    const keys: string[] = [];

    courseGroups.forEach((group) => {
      if (getIssue(group, keys) === null) {
        keys.push(group.key);
      }
    });

    return keys;
  })();
  const allSelectableGroupsSelected = selectableCourseGroupKeys.length > 0
    && selectableCourseGroupKeys.every((key) => selectedKeys.includes(key))
    && selectedKeys.filter((key) => courseGroups.some((group) => group.key === key)).length === selectableCourseGroupKeys.length;

  const selectAllGroups = () => {
    const courseGroupKeys = new Set(courseGroups.map((group) => group.key));
    if (allSelectableGroupsSelected) {
      setSelectedKeys((current) => current.filter((key) => !courseGroupKeys.has(key)));
      return;
    }

    setSelectedKeys((current) => [
      ...current.filter((key) => !courseGroupKeys.has(key)),
      ...selectableCourseGroupKeys,
    ]);
  };

  const addToAssignmentList = () => {
    if (!selectedFaculty || selectedGroups.length === 0) return;
    setAssignments((current) => [
      ...current,
      ...selectedGroups.map((group) => ({
        key: group.key,
        facultyId: selectedFaculty.id,
        facultyName: selectedFaculty.name,
        courseCode: group.courseCode,
        courseName: group.courseName,
        sectionName: group.sectionName,
        units: group.units,
        schedule: scheduleLabel(group),
        mode: modesLabel(group),
        scheduleIds: group.schedules.filter((schedule) => !schedule.facultyId).map((schedule) => schedule.id),
      })),
    ]);
    setSelectedKeys([]);
  };

  /** Why an assigned class cannot be cleared here, or null when it can. */
  const removalBlockedReason = (group: SectionGroup): string | null => {
    const assigned = group.schedules.filter((schedule) => schedule.facultyId);
    if (assigned.some((schedule) => schedule.status === "finalized")) return "A finalized schedule cannot be changed.";
    if (assigned.some((schedule) => schedule.facultyAssignmentDone)) return "Assignments are marked done. Choose Reassignment first.";
    if (!assigned.every(canManageScheduleFaculty)) return "Only the assigned teaching department can change this instructor.";
    return null;
  };

  const removeClassAssignment = async (group: SectionGroup) => {
    if (!onRemoveAssignment || removalBlockedReason(group)) return;
    const holder = group.schedules.find((schedule) => schedule.facultyId);
    const name = faculties.find((faculty) => faculty.id === holder?.facultyId)?.name ?? holder?.facultyName ?? "the instructor";
    const confirmed = await confirm({
      title: "Remove instructor",
      message: `Remove ${name} from ${group.courseCode} ${group.sectionName}? Every meeting of this class loses its instructor, and it can be assigned again right away.`,
      eyebrow: "Reassignment",
      confirmLabel: "Remove instructor",
      variant: "danger",
    });
    if (!confirmed) return;
    await onRemoveAssignment(group.schedules.filter((schedule) => schedule.facultyId).map((schedule) => schedule.id));
  };

  const removeAssignment = (key: string) => setAssignments((current) => current.filter((assignment) => assignment.key !== key));

  const saveAssignments = async () => {
    const byFaculty = new Map<string, AssignmentBatch>();
    assignments.forEach((assignment) => {
      const existing = byFaculty.get(assignment.facultyId);
      if (existing) existing.scheduleIds.push(...assignment.scheduleIds);
      else byFaculty.set(assignment.facultyId, { facultyId: assignment.facultyId, scheduleIds: [...assignment.scheduleIds] });
    });
    const success = await onAssign([...byFaculty.values()]);
    if (success) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:items-center" onClick={(event) => event.target === event.currentTarget && !isSaving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="auto-assign-title" className="flex min-h-[calc(100dvh-1rem)] w-full max-w-none flex-col overflow-hidden rounded-lg bg-white shadow-2xl sm:h-[calc(100vh-16px)] sm:min-h-0 sm:w-[calc(100vw-16px)]">
        <header className="flex shrink-0 items-center gap-3 bg-[#4e0a10] px-4 py-3 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"><UserCheck className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="auto-assign-title" className="truncate text-base font-black text-white sm:text-lg">Assign Instructors</h2>
            <p className="truncate text-xs font-semibold text-white/70">{steps[step - 1].title} &middot; Step {step} of {steps.length}</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close auto-assign" className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <div className="shrink-0 bg-white px-3 py-2.5 sm:px-4">
          <WizardProgressStepper currentStep={step} steps={steps} ariaLabel="Auto-assign instructor steps" />
        </div>

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-parchment p-3 sm:p-4 lg:overflow-hidden">
          {step === 1 && (
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[400px_minmax(0,1fr)]">
              <InstructorList faculties={faculties} departmentId={departmentId} facultyId={facultyId} facultyLoads={facultyLoads} onSelect={selectFaculty} allowExternalInstructors={allowExternalInstructors} />
              <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="grid shrink-0 gap-3 border-b border-slate-100 p-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <SelectField label="Year level" value={yearLevel} onChange={selectYearLevel} options={[{ value: "1", label: "1st Year" }, { value: "2", label: "2nd Year" }, { value: "3", label: "3rd Year" }, { value: "4", label: "4th Year" }]} placeholder="Select year level" />
                  <SelectField label="Course" value={courseId} onChange={selectCourse} options={courseOptions.map((course) => ({ value: course.id, label: `${course.code} - ${course.name}` }))} placeholder="Select course" />
                </div>
                <SectionTable groups={courseGroups} selectedKeys={selectedKeys} getIssue={getIssue} onToggle={toggleGroup} onSelectAll={selectAllGroups} selectAllChecked={allSelectableGroupsSelected} selectAllDisabled={selectableCourseGroupKeys.length === 0} onRemove={onRemoveAssignment ? removeClassAssignment : undefined} removalBlockedReason={removalBlockedReason} busy={isSaving} />
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
                  {selectedFaculty ? (
                    <div className="mr-auto min-w-0 text-xs text-slate-600">
                      <span className="font-bold text-slate-900">{selectedFaculty.name}</span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <span className="font-semibold tabular-nums">{currentLoad}{selectedUnits > 0 && <span className="text-[#4e0a10]"> + {selectedUnits}</span>} / {projectedLoad.bands.basicLoad} units</span>
                      <span className={`ml-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${projectedLoad.badgeClass}`}>{projectedLoad.label}</span>
                    </div>
                  ) : (
                    <p className="mr-auto text-xs font-semibold text-slate-500">Select an instructor to see which sections they can take.</p>
                  )}
                  <button type="button" onClick={addToAssignmentList} disabled={selectedGroups.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-40">
                    <Plus className="h-3.5 w-3.5" /> {selectedGroups.length ? `Add ${plural(selectedGroups.length, "section")} to list` : "Add to list"}
                  </button>
                </div>
              </section>
            </div>
          )}

          {step === 2 && <ReviewAssignments assignments={assignments} faculties={faculties} facultyLoads={facultyLoads} onRemove={removeAssignment} />}

          {step === 3 && <ConfirmAssignments assignments={assignments} faculties={faculties} facultyLoads={facultyLoads} onEdit={() => setStep(2)} />}
        </main>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          {step === 3 ? (
            <ConfirmValidationSummary assignments={assignments} faculties={faculties} facultyLoads={facultyLoads} />
          ) : step === 1 && assignments.length > 0 ? (
            <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs font-bold text-[#4e0a10]">
              <ListChecks className="h-4 w-4 shrink-0" />
              {plural(assignments.length, "section")} on the list for {plural(new Set(assignments.map((assignment) => assignment.facultyId)).size, "instructor")}
            </p>
          ) : (
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-500">{STEP_HELP[step]}</p>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => step > 1 ? setStep((current) => current - 1) : onClose()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              {step > 1 ? <><ChevronLeft className="h-4 w-4" /> Back</> : "Cancel"}
            </button>
            {step === 1 && (
              <button type="button" onClick={() => setStep(2)} disabled={assignments.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50">
                Review {assignments.length > 0 && `(${assignments.length})`} <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 2 && (
              <button type="button" onClick={() => setStep(3)} disabled={assignments.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50">
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 3 && (
              <button type="button" onClick={saveAssignments} disabled={isSaving || assignments.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-5 py-2 text-sm font-black text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50">
                {isSaving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} {isSaving ? "Saving..." : "Save Assignments"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function InstructorList({ faculties, departmentId, facultyId, facultyLoads, onSelect, allowExternalInstructors = true }: { faculties: Faculty[]; departmentId: number | null; facultyId: string; facultyLoads: Map<string, number>; onSelect: (id: string) => void; allowExternalInstructors?: boolean }) {
  const [tab, setTab] = useState<"department" | "external">("department");
  // Department ids arrive from the API as numbers in the type contract, but
  // database-backed JSON responses may contain numeric strings. Normalize both
  // sides so department instructors are not hidden by a strict type mismatch.
  const normalizedDepartmentId = departmentId === null ? null : Number(departmentId);
  const visibleFaculties = useMemo(
    () => faculties.filter((faculty) => {
      const isDepartmentInstructor = normalizedDepartmentId !== null
        && faculty.departmentId !== null
        && faculty.departmentId !== undefined
        && Number(faculty.departmentId) === normalizedDepartmentId;
      return tab === "department" ? isDepartmentInstructor : !isDepartmentInstructor;
    }),
    [faculties, normalizedDepartmentId, tab],
  );
  const columns = useMemo<ColumnDef<Faculty>[]>(() => [
    {
      id: "instructorCard",
      cell: ({ row }) => {
        const faculty = row.original;
        const load = facultyLoads.get(faculty.id) ?? 0;
        const display = loadDisplay(faculty, load);
        const selected = faculty.id === facultyId;
        return (
          <button
            type="button"
            onClick={() => onSelect(faculty.id)}
            aria-pressed={selected}
            style={{ contentVisibility: "auto", containIntrinsicSize: "84px" }}
            className={`grid w-full grid-cols-[minmax(0,1fr)_120px_20px] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              selected
                ? "border-[#4e0a10]/40 bg-[#4e0a10]/[0.04] ring-1 ring-[#4e0a10]/20"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              {faculty.profilePicture ? (
                  <img src={faculty.profilePicture} alt={faculty.name} loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover" />
              ) : (
                <ProfileAvatar className="h-10 w-10 shrink-0 rounded-full" iconClassName="h-5 w-5" />
              )}
              <span className="min-w-0">
                <span className="block break-words text-sm font-black leading-5 text-slate-900">{faculty.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${faculty.status === "inactive" ? "bg-slate-300" : "bg-emerald-500"}`} />
                  {faculty.status === "inactive" ? "Inactive" : "Active"}
                  {tab === "external" && <span className="truncate text-slate-400">· {faculty.departmentCode ?? faculty.departmentName ?? "External"}</span>}
                </span>
              </span>
            </span>
            <span className="block min-w-0">
              <span className="flex justify-between gap-2 text-[11px] text-slate-500"><span>Load</span><span className="whitespace-nowrap font-bold tabular-nums text-slate-800">{load} / {display.bands.basicLoad}</span></span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${display.barClass}`} style={{ width: `${display.percentage}%` }} /></span>
              {display.tier !== "basic" && <span className={`mt-1.5 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${display.badgeClass}`}>{display.label}</span>}
            </span>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${selected ? "bg-[#4e0a10] text-white" : "border border-slate-200 text-transparent"}`}><Check className="h-3 w-3" /></span>
          </button>
        );
      },
    },
  ], [facultyId, facultyLoads, onSelect, tab]);

  const table = useReactTable({ data: visibleFaculties, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <aside className="flex max-h-[420px] min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:max-h-none">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3 text-sm font-black text-slate-900">
        <Users className="h-4 w-4 text-[#4e0a10]" /> Instructor
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{visibleFaculties.length}</span>
      </div>
      {allowExternalInstructors && <div className="flex shrink-0 border-b border-slate-200 px-3">
        {([
          ["department", "My department"],
          ["external", "Other departments"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value);
              onSelect((faculties.find((faculty) => {
                const isDepartmentInstructor = normalizedDepartmentId !== null
                  && faculty.departmentId !== null
                  && faculty.departmentId !== undefined
                  && Number(faculty.departmentId) === normalizedDepartmentId;
                return value === "department" ? isDepartmentInstructor : !isDepartmentInstructor;
              })?.id) ?? "");
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-bold transition-colors ${tab === value ? "border-[#4e0a10] text-[#4e0a10]" : "border-transparent text-slate-400 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>}
      <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto overflow-x-hidden px-3 pb-2" style={{ contain: "layout paint" }}>
        <table className="w-full table-fixed border-separate border-spacing-y-2">
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visibleFaculties.length === 0 && <p className="px-3 py-8 text-center text-xs font-semibold text-slate-500">No instructors in this group.</p>}
      </div>
    </aside>
  );
}

function SelectField({ label, value, onChange, options, placeholder, allValue }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder: string; allValue?: string }) {
  return <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}<div className="relative mt-1"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25"><option value={allValue ?? ""}>{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-slate-400" /></div></label>;
}

function SectionTable({ groups, selectedKeys, getIssue, onToggle, onSelectAll, selectAllChecked, selectAllDisabled, onRemove, removalBlockedReason, busy }: { groups: SectionGroup[]; selectedKeys: string[]; getIssue: (group: SectionGroup) => string | null; onToggle: (group: SectionGroup) => void; onSelectAll: () => void; selectAllChecked: boolean; selectAllDisabled: boolean; onRemove?: (group: SectionGroup) => void; removalBlockedReason: (group: SectionGroup) => string | null; busy: boolean }) {
  const columns = useMemo<ColumnDef<SectionGroup>[]>(() => [
    {
      id: "selected",
      header: "",
      cell: ({ row }) => {
        const alreadyAssigned = !!row.original.assignedFacultyId;
        const selected = alreadyAssigned || selectedKeys.includes(row.original.key);
        return (
          <span className={`flex h-5 w-5 items-center justify-center rounded border ${
            alreadyAssigned
              ? "border-slate-400 bg-slate-400 text-white"
              : selected
                ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                : "border-slate-300 bg-white"
          }`}>
            {selected && <Check className="h-3 w-3" />}
          </span>
        );
      },
    },
    {
      accessorKey: "sectionName",
      header: "Section",
      cell: ({ row }) => <span className="text-sm font-bold text-slate-800">{row.original.sectionName}</span>,
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => <span className="whitespace-nowrap text-xs font-medium text-slate-600">{scheduleLabel(row.original)}</span>,
    },
    {
      accessorKey: "units",
      header: "Units",
      cell: ({ row }) => <span className="text-sm font-bold text-slate-700">{row.original.units}</span>,
    },
    {
      id: "availability",
      header: "Availability",
      cell: ({ row }) => {
        const issue = getIssue(row.original);
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${issue ? "text-slate-500" : "text-emerald-700"}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${issue ? "bg-amber-400" : "bg-emerald-500"}`} />
            {issue ?? "Available"}
          </span>
        );
      },
    },
    ...(onRemove ? [{
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }: { row: { original: SectionGroup } }) => {
        if (!row.original.assignedFacultyId) return null;
        const blocked = removalBlockedReason(row.original);
        return (
          <div className="flex justify-end">
            <TableActionButton
              label={blocked ?? "Remove instructor"}
              aria-label={`Remove instructor from ${row.original.courseCode} ${row.original.sectionName}`}
              variant="danger"
              disabled={Boolean(blocked) || busy}
              onClick={(event) => { event.stopPropagation(); onRemove(row.original); }}
            >
              <Trash2 size={15} />
            </TableActionButton>
          </div>
        );
      },
    } satisfies ColumnDef<SectionGroup>] : []),
  ], [busy, getIssue, onRemove, removalBlockedReason, selectedKeys]);

  const table = useReactTable({
    data: groups,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2.5"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><Layers3 className="h-4 w-4 text-[#4e0a10]" /> Sections <span className="text-xs font-semibold text-slate-400">{groups.length}</span></div><div className="flex items-center gap-3">{selectedKeys.length > 0 && <span className="rounded-full bg-[#4e0a10]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#4e0a10]">{selectedKeys.length} selected</span>}<label className={`inline-flex items-center gap-1.5 text-xs font-bold ${selectAllDisabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"}`}><input type="checkbox" checked={selectAllChecked} onChange={onSelectAll} disabled={selectAllDisabled} className="h-4 w-4 rounded border-slate-300 accent-[#4e0a10]" /> Select all available</label></div></div>
      {groups.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center"><Layers3 className="h-6 w-6 text-slate-300" /><p className="text-sm font-semibold text-slate-600">No sections to assign</p><p className="text-xs text-slate-500">Pick another course or year level.</p></div> : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead className="sticky top-0 z-10 border-y border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className={`px-3 py-2 font-bold ${header.column.id === "selected" ? "w-12 pl-4" : header.column.id === "actions" ? "w-20 pr-4" : ""}`}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.map((row) => {
                const issue = getIssue(row.original);
                return (
                  <tr key={row.id} aria-disabled={!!issue} onClick={() => onToggle(row.original)} className={issue ? "cursor-not-allowed" : selectedKeys.includes(row.original.key) ? "cursor-pointer bg-[#4e0a10]/[0.04]" : "cursor-pointer hover:bg-slate-50"}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={`px-3 py-2.5 ${cell.column.id === "selected" ? "pl-4" : cell.column.id === "actions" ? "pr-4" : ""}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReviewAssignments({ assignments, faculties, facultyLoads, onRemove }: { assignments: QueuedAssignment[]; faculties: Faculty[]; facultyLoads: Map<string, number>; onRemove: (key: string) => void }) {
  const [search, setSearch] = useState("");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<"name" | "sections" | "load">("name");
  const facultyGroups = [...new Set(assignments.map((assignment) => assignment.facultyId))].map((facultyId) => ({
    facultyId,
    faculty: faculties.find((item) => item.id === facultyId),
    items: assignments.filter((assignment) => assignment.facultyId === facultyId),
  }));
  const filteredGroups = facultyGroups
    .filter(({ faculty, items }) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [faculty?.name, faculty?.departmentCode, faculty?.departmentName, ...items.flatMap((item) => [item.courseCode, item.courseName, item.sectionName])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((left, right) => {
      if (sortMode === "sections") return right.items.length - left.items.length;
      if (sortMode === "load") return (facultyLoads.get(right.facultyId) ?? 0) - (facultyLoads.get(left.facultyId) ?? 0);
      return (left.faculty?.name ?? left.items[0].facultyName).localeCompare(right.faculty?.name ?? right.items[0].facultyName);
    });
  const [selectedFacultyId, setSelectedFacultyId] = useState(facultyGroups[0]?.facultyId ?? "");
  const selectedGroup = facultyGroups.find((group) => group.facultyId === selectedFacultyId) ?? filteredGroups[0] ?? facultyGroups[0];

  useEffect(() => {
    if (!selectedGroup && facultyGroups[0]) setSelectedFacultyId(facultyGroups[0].facultyId);
    else if (selectedGroup && !filteredGroups.some((group) => group.facultyId === selectedGroup.facultyId) && filteredGroups[0]) setSelectedFacultyId(filteredGroups[0].facultyId);
  }, [filteredGroups, facultyGroups, selectedGroup]);

  if (assignments.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <ListChecks className="h-7 w-7 text-slate-300" />
        <p className="text-sm font-bold text-slate-700">The assignment list is empty</p>
        <p className="text-xs text-slate-500">Go back and add sections to an instructor.</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex max-h-[420px] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:max-h-none">
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
          <Users className="h-4 w-4 text-[#4e0a10]" />
          <h4 className="text-sm font-black text-slate-900">Instructors</h4>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{facultyGroups.length}</span>
        </div>
        <div className="flex shrink-0 gap-2 border-b border-slate-100 px-3 pb-3">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search instructor, course, section" aria-label="Search instructors" className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-2 text-xs outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25" />
          </label>
          <div className="relative">
            <button type="button" onClick={() => setShowSortMenu((current) => !current)} aria-label="Sort instructors" aria-expanded={showSortMenu} title="Sort instructors" className={`flex h-9 items-center rounded-lg border px-2.5 transition ${showSortMenu ? "border-[#4e0a10]/30 bg-[#4e0a10]/5 text-[#4e0a10]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 origin-top-right rounded-lg border border-slate-200 bg-white p-1 shadow-lg motion-safe:animate-dropdownIn">
                {([["name", "Name"], ["sections", "Most sections"], ["load", "Highest load"]] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => { setSortMode(value); setShowSortMenu(false); }} className={`block w-full rounded-md px-2.5 py-2 text-left text-xs font-semibold ${sortMode === value ? "bg-[#4e0a10]/5 text-[#4e0a10]" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {filteredGroups.map(({ facultyId, faculty, items }) => {
            const load = facultyLoads.get(facultyId) ?? 0;
            const display = loadDisplay(faculty, load);
            const selected = selectedGroup?.facultyId === facultyId;
            return (
              <button key={facultyId} type="button" onClick={() => setSelectedFacultyId(facultyId)} aria-pressed={selected} className={`w-full rounded-lg border p-2.5 text-left transition-colors ${selected ? "border-[#4e0a10]/40 bg-[#4e0a10]/[0.04] ring-1 ring-[#4e0a10]/20" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                <div className="flex items-center gap-2.5">
                  <ProfileAvatar src={faculty?.profilePicture} className="h-9 w-9 shrink-0 rounded-full border border-slate-200" iconClassName="h-4 w-4" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-900">{faculty?.name ?? items[0].facultyName}</span>
                    <span className="block truncate text-[11px] text-slate-500">{faculty?.departmentCode ?? faculty?.departmentName ?? "Instructor"} &middot; {plural(items.length, "section")}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-semibold tabular-nums text-slate-600">{load} / {display.bands.basicLoad} units</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${display.badgeClass}`}>{display.label}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${display.barClass}`} style={{ width: `${display.percentage}%` }} /></div>
              </button>
            );
          })}
          {filteredGroups.length === 0 && <p className="px-3 py-8 text-center text-xs font-semibold text-slate-500">No matching instructors.</p>}
        </div>
        {search.trim() && <div className="shrink-0 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">Showing {filteredGroups.length} of {facultyGroups.length} instructors</div>}
      </aside>

      {selectedGroup ? (() => {
        const { facultyId, faculty, items } = selectedGroup;
        const load = facultyLoads.get(facultyId) ?? 0;
        const display = loadDisplay(faculty, load);
        const name = faculty?.name ?? items[0].facultyName;
        return (
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid shrink-0 gap-4 border-b border-slate-100 p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                {faculty?.profilePicture ? <img src={faculty.profilePicture} alt="" className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UserRound className="h-6 w-6" /></span>}
                <div className="min-w-0">
                  <h4 className="truncate text-base font-black text-slate-900">{name}</h4>
                  <p className="truncate text-xs text-slate-500">{faculty?.departmentCode ?? faculty?.departmentName ?? "Instructor"} &middot; {plural(items.length, "section")} on the list</p>
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-slate-500">Load after saving</span>
                  <span className="font-black tabular-nums text-slate-900">{load} <span className="font-medium text-slate-500">/ {display.bands.basicLoad}</span></span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${display.barClass}`} style={{ width: `${display.percentage}%` }} /></div>
              </div>
              <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-bold ${display.badgeClass}`}>{display.label}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-bold">Course</th>
                    <th className="px-3 py-2 font-bold">Section</th>
                    <th className="px-3 py-2 font-bold">Schedule</th>
                    <th className="px-3 py-2 font-bold">Mode</th>
                    <th className="px-3 py-2 text-right font-bold">Units</th>
                    <th className="w-20 px-4 py-2 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((assignment) => (
                    <tr key={assignment.key} className="align-top hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-black text-slate-900">{assignment.courseCode}</p>
                        <p className="max-w-[260px] truncate text-xs text-slate-500">{assignment.courseName}</p>
                      </td>
                      <td className="px-3 py-2.5 text-sm font-bold text-slate-800">{assignment.sectionName}</td>
                      <td className="px-3 py-2.5 text-xs font-medium leading-5 text-slate-600">{assignment.schedule}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-600">{assignment.mode}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-black tabular-nums text-slate-800">{assignment.units}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end">
                          <TableActionButton label="Remove from list" aria-label={`Remove ${assignment.courseCode} ${assignment.sectionName}`} variant="danger" onClick={() => onRemove(assignment.key)}>
                            <Trash2 size={15} />
                          </TableActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="flex shrink-0 items-start gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              Going past Basic Load is allowed: it uses the overload allowance, then pro bono, and you confirm it once when saving.
            </p>
          </section>
        );
      })() : (
        <section className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm font-semibold text-slate-500">Select an instructor to review their assignments.</section>
      )}
    </div>
  );
}

function ConfirmAssignments({ assignments, faculties, facultyLoads, onEdit }: { assignments: QueuedAssignment[]; faculties: Faculty[]; facultyLoads: Map<string, number>; onEdit: () => void }) {
  const groups = [...new Set(assignments.map((assignment) => assignment.facultyId))].map((facultyId) => ({
    facultyId,
    faculty: faculties.find((item) => item.id === facultyId),
    items: assignments.filter((assignment) => assignment.facultyId === facultyId),
  }));
  const [expandedIds, setExpandedIds] = useState<string[]>(groups[0] ? [groups[0].facultyId] : []);
  const totalUnits = assignments.reduce((total, assignment) => total + assignment.units, 0);
  const overloaded = groups.filter(({ facultyId, faculty }) => isPastBasicLoad(faculty, facultyLoads.get(facultyId) ?? 0));
  const allExpanded = groups.length > 0 && expandedIds.length === groups.length;

  const toggleGroup = (facultyId: string) => setExpandedIds((current) => current.includes(facultyId)
    ? current.filter((id) => id !== facultyId)
    : [...current, facultyId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <section className="grid shrink-0 gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(240px,1.2fr)_repeat(4,minmax(0,1fr))] lg:items-center">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${overloaded.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {overloaded.length ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div>
            <h3 className="text-base font-black text-slate-900">Ready to save</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              {overloaded.length
                ? "Some loads go past Basic Load. You will be asked to confirm them."
                : "Every instructor stays within Basic Load."}
            </p>
          </div>
        </div>
        <ConfirmMetric icon={<Users className="h-4 w-4" />} value={groups.length} label={groups.length === 1 ? "Instructor" : "Instructors"} />
        <ConfirmMetric icon={<Layers3 className="h-4 w-4" />} value={assignments.length} label={assignments.length === 1 ? "Section" : "Sections"} />
        <ConfirmMetric icon={<BookOpen className="h-4 w-4" />} value={totalUnits} label="Total units" />
        <ConfirmMetric icon={<Scale className="h-4 w-4" />} value={overloaded.length ? `${overloaded.length} past Basic` : "Balanced"} label="Load status" warn={overloaded.length > 0} />
      </section>

      <section className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <h4 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Assignments by instructor</h4>
          {groups.length > 1 && (
            <button type="button" onClick={() => setExpandedIds(allExpanded ? [] : groups.map((group) => group.facultyId))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-[#4e0a10] hover:bg-[#4e0a10]/5">
              {allExpanded ? "Collapse all" : "Expand all"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${allExpanded ? "-rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {groups.map(({ facultyId, faculty, items }) => {
          const expanded = expandedIds.includes(facultyId);
          const load = facultyLoads.get(facultyId) ?? 0;
          const display = loadDisplay(faculty, load);
          const name = faculty?.name ?? items[0].facultyName;
          return (
            <article key={facultyId} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => toggleGroup(facultyId)} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`} className="flex min-w-[200px] flex-1 items-center gap-3 text-left">
                  <ProfileAvatar src={faculty?.profilePicture} alt={name} className="h-10 w-10 shrink-0 rounded-full" iconClassName="h-5 w-5" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-900">{name}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{faculty?.departmentCode ?? faculty?.departmentName ?? "Instructor"} &middot; {plural(items.length, "section")}</span>
                  </span>
                </button>
                <div className="text-right">
                  <p className="text-sm font-black tabular-nums text-slate-900">{load} <span className="font-medium text-slate-500">/ {display.bands.basicLoad} units</span></p>
                  <span className={`mt-0.5 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${display.badgeClass}`}>{display.label}</span>
                </div>
                <TableActionButton label="Edit assignments" aria-label={`Edit assignments for ${name}`} variant="edit" onClick={onEdit}><Pencil size={15} /></TableActionButton>
                <button type="button" onClick={() => toggleGroup(facultyId)} aria-hidden="true" tabIndex={-1} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"><ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "-rotate-180" : ""}`} /></button>
              </div>
              {expanded && (
                <div className="overflow-x-auto border-t border-slate-100 motion-safe:animate-dropdownIn">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-bold">Course</th>
                        <th className="px-3 py-2 font-bold">Section</th>
                        <th className="px-3 py-2 font-bold">Schedule</th>
                        <th className="px-3 py-2 font-bold">Mode</th>
                        <th className="px-4 py-2 text-right font-bold">Units</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((assignment) => (
                        <tr key={assignment.key} className="align-top">
                          <td className="px-4 py-2.5"><span className="block font-black text-slate-900">{assignment.courseCode}</span><span className="block max-w-[260px] truncate text-slate-500">{assignment.courseName}</span></td>
                          <td className="px-3 py-2.5 font-bold text-slate-800">{assignment.sectionName}</td>
                          <td className="px-3 py-2.5 leading-5 text-slate-600">{assignment.schedule}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">{assignment.mode}</td>
                          <td className="px-4 py-2.5 text-right font-black tabular-nums text-slate-800">{assignment.units}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50/70">
                        <td colSpan={4} className="px-4 py-2 text-right font-bold text-slate-500">Units added</td>
                        <td className="px-4 py-2 text-right font-black tabular-nums text-slate-900">{items.reduce((total, item) => total + item.units, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ConfirmValidationSummary({ assignments, faculties, facultyLoads }: { assignments: QueuedAssignment[]; faculties: Faculty[]; facultyLoads: Map<string, number> }) {
  const facultyIds = [...new Set(assignments.map((assignment) => assignment.facultyId))];
  const overloadCount = facultyIds.filter((facultyId) => isPastBasicLoad(
    faculties.find((item) => item.id === facultyId),
    facultyLoads.get(facultyId) ?? 0,
  )).length;
  const totalUnits = assignments.reduce((total, assignment) => total + assignment.units, 0);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
      <span className={`flex items-center gap-1.5 ${overloadCount ? "text-amber-700" : ""}`}>
        {overloadCount ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
        {overloadCount ? `${plural(overloadCount, "instructor")} past Basic Load` : "All within Basic Load"}
      </span>
      <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {plural(assignments.length, "section")}</span>
      <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {plural(totalUnits, "unit")} to save</span>
    </div>
  );
}

function ConfirmMetric({ icon, value, label, warn = false }: { icon: React.ReactNode; value: string | number; label: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${warn ? "bg-amber-100 text-amber-700" : "bg-white text-[#4e0a10]"}`}>{icon}</span>
      <div className="min-w-0">
        <p className={`truncate text-base font-black tabular-nums ${warn ? "text-amber-700" : "text-slate-900"}`}>{value}</p>
        <p className="truncate text-[11px] font-semibold text-slate-500">{label}</p>
      </div>
    </div>
  );
}
