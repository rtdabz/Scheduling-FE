import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info, Layers3, ListChecks, Pencil, Plus, Save, Search, Scale, SlidersHorizontal, UserCheck, UserRound, Users, X } from 'lucide-react';
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../../../../components/ui/DataTable";
import { useDataTable } from "../../../../components/ui/useDataTable";
import { INSTRUCTOR_ASSIGNABLE_STATUSES, type Faculty, type ScheduleItem, type Subject } from "../types";
import ProfileAvatar from "../../../../components/ui/ProfileAvatar";
import TableActionButton from "../../../../components/ui/TableActionButton";
import { useToast } from "../../../../context/ToastContext";
import { facultyEligibilityForSubject } from "../facultyEligibility";
import { AVAILABILITY_WARNING_TITLE, isAvailabilityWarning } from "../../../../lib/availabilityWindows";
import { LOAD_TIER_BADGE_CLASSES, LOAD_TIER_LABELS, basicLoadOf, loadTierForUnits, type LoadAllowances, type LoadTier } from "../../../../lib/facultyLoad";
import { employmentLabel } from "../EmploymentBadge";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import './AutoAssignModal.css';

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
  onRemoveAssignment?: (scheduleIds: string[]) => Promise<boolean>;
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
  conflict?: string | null;
}

const steps = [
  { id: 1, title: "Build list" },
  { id: 2, title: "Review" },
  { id: 3, title: "Confirm & save" },
];

const overlaps = (left: ScheduleItem, right: ScheduleItem): boolean =>
  left.dayIndex === right.dayIndex
  && left.startSlot < right.startSlot + right.durationSlots
  && right.startSlot < left.startSlot + left.durationSlots;

const QUEUED_ISSUE = "Queued for assignment";

const loadBandsOf = (faculty?: Faculty): LoadAllowances => ({
  basicLoad: faculty?.requiredUnits ?? basicLoadOf(faculty?.maxUnits, faculty?.deloadUnits),
  overloadUnits: faculty?.overloadUnits ?? 0,
});

interface LoadDisplay {
  bands: LoadAllowances;
  ceiling: number;
  tier: LoadTier | null;
  label: string;
  badgeClass: string;
  percentage: number;
  barClass: string;
}

const loadDisplay = (faculty: Faculty | undefined, units: number): LoadDisplay => {
  const bands = loadBandsOf(faculty);
  const ceiling = bands.basicLoad + Math.max(0, bands.overloadUnits);

  if (ceiling <= 0) {
    return {
      bands,
      ceiling,
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
    ceiling,
    tier,
    label: tier === "basic" ? "Total Load" : LOAD_TIER_LABELS[tier],
    badgeClass: LOAD_TIER_BADGE_CLASSES[tier],
    percentage: Math.min(100, (units / ceiling) * 100),
    barClass: tier === "basic" ? "bg-emerald-500" : tier === "beyond_ceiling" ? "bg-rose-500" : "bg-amber-500",
  };
};

const exceedsCeiling = (faculty: Faculty | undefined, units: number): boolean => {
  const { ceiling } = loadDisplay(faculty, units);

  return ceiling > 0 && units > ceiling;
};

const isPastBasicLoad = (faculty: Faculty | undefined, units: number): boolean => {
  const { tier } = loadDisplay(faculty, units);

  return tier !== null && tier !== "basic";
};

const MODE_ORDER: Record<string, number> = { "on-site": 0, field: 1, online: 2 };
const MODE_LABELS: Record<string, string> = { "on-site": "On-site", field: "Field", online: "Online" };

const scheduleEntries = (group: SectionGroup): { label: string; scheduleIds: string[] }[] => {
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
      return { label: `${days} ${meetings[0].startTime}-${meetings[0].endTime}`, scheduleIds: meetings.map((meeting) => meeting.id) };
    });
};

const scheduleLabel = (group: SectionGroup): string => scheduleEntries(group).map((entry) => entry.label).join(" | ");

const meetingLabel = (schedule: ScheduleItem): string => `${schedule.day} ${schedule.startTime}-${schedule.endTime}`;

interface ConflictDetail {
  message: string;
  scheduleIds: Set<string>;
  counterpartIds: string[];
}

const modesLabel = (group: SectionGroup): string => [...new Set(group.schedules.map((schedule) => schedule.mode ?? "on-site"))]
  .sort((left, right) => (MODE_ORDER[left] ?? 3) - (MODE_ORDER[right] ?? 3))
  .map((mode) => MODE_LABELS[mode] ?? mode)
  .join(" | ");

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const STEP_HELP: Record<number, string> = {
  1: "Add sections to the list, then review.",
  2: "Check loads and remove assignments as needed.",
  3: "Save to apply these assignments.",
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
  const { confirm, toast } = useToast();
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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? []).filter(element => !element.closest('[inert]'));
    const timer = window.setTimeout(() => (controls()[0] ?? dialog)?.focus(), 0);
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).at(-1) !== dialog) return;
      const elements = controls();
      const first = elements[0]; const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && facultyActionSlotId !== 'bulk' && Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).at(-1) === dialogRef.current) {
        event.preventDefault(); event.stopPropagation(); onClose();
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [facultyActionSlotId, isOpen, onClose]);

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

  const courseProgramLabels = useMemo(() => {
    const programs = new Map<string, Set<string>>();
    groups
      .filter((group) => group.yearLevel === Number(yearLevel))
      .forEach((group) => {
        const code = group.schedules[0]?.programCode;
        if (!code) return;
        programs.set(group.courseId, (programs.get(group.courseId) ?? new Set()).add(code));
      });
    return new Map(courseOptions.map((course) => {
      const codes = course.programCode ? [course.programCode] : [...(programs.get(course.id) ?? [])].sort();
      return [course.id, codes.join(", ")];
    }));
  }, [courseOptions, groups, yearLevel]);

  const facultyLoads = useMemo(() => {
    const loads = new Map<string, number>();
    faculties.forEach((faculty) => {
      loads.set(faculty.id, faculty.assignedUnits ?? 0);
    });
    assignments.forEach((assignment) => {
      loads.set(assignment.facultyId, (loads.get(assignment.facultyId) ?? 0) + assignment.units);
    });
    return loads;
  }, [assignments, faculties]);

  const checkedAssignments = useMemo(() => {
    const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
    const schedulesOf = (assignment: QueuedAssignment) => assignment.scheduleIds
      .map((scheduleId) => scheduleById.get(scheduleId))
      .filter((schedule): schedule is ScheduleItem => !!schedule);
    return assignments.map((assignment) => {
      const own = schedulesOf(assignment);
      let conflict: string | null = null;
      for (const scheduleId of assignment.scheduleIds) {
        conflict = checkFacultyConflict(assignment.facultyId, scheduleId);
        if (conflict) break;
      }
      if (!conflict) {
        const clash = assignments.find((other) => other.key !== assignment.key
          && other.facultyId === assignment.facultyId
          && schedulesOf(other).some((schedule) => own.some((mine) => overlaps(mine, schedule))));
        if (clash) conflict = `Overlaps ${clash.courseCode} ${clash.sectionName} on the list`;
      }
      return { ...assignment, conflict };
    });
  }, [assignments, checkFacultyConflict, schedules]);

  const initializedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      initializedForRef.current = null;
      return;
    }
    const initKey = String(departmentId);
    if (initializedForRef.current === initKey) return;
    if (groups.length > 0) initializedForRef.current = initKey;
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
  const getIssue = (group: SectionGroup): string | null => {
    if (group.assignedFacultyId) {
      const assignedFaculty = faculties.find((faculty) => faculty.id === group.assignedFacultyId);
      const assignedName = assignedFaculty?.name ?? group.schedules.find((schedule) => schedule.facultyId === group.assignedFacultyId)?.facultyName ?? "Instructor";
      const assignedDepartment = assignedFaculty?.departmentName ?? assignedFaculty?.departmentCode ?? "assigned department";
      return `Assigned Instructor: ${assignedName} from ${assignedDepartment}`;
    }
    if (queuedKeys.has(group.key)) {
      const queued = assignments.find((assignment) => assignment.key === group.key);
      const queuedName = faculties.find((faculty) => faculty.id === queued?.facultyId)?.name;
      return queuedName ? `Queued to ${queuedName}` : QUEUED_ISSUE;
    }
    const pendingSchedules = group.schedules.filter((schedule) => !schedule.facultyId);
    if (!pendingSchedules.every(canManageScheduleFaculty)) return "Assigned teaching department only";

    if (selectedFaculty) {
      const subject = subjects.find((item) => item.id === group.courseId);
      const eligibility = facultyEligibilityForSubject(
        selectedFaculty,
        subject,
        group.schedules[0]?.departmentId ?? departmentId,
      );
      if (!eligibility.eligible) return eligibility.reason;
    }
    return null;
  };

  const getConflictDetail = (group: SectionGroup, selectionKeys = selectedKeys): ConflictDetail | null => {
    if (group.assignedFacultyId || queuedKeys.has(group.key) || !facultyId) return null;
    const pendingSchedules = group.schedules.filter((schedule) => !schedule.facultyId);
    const instructorClashes = pendingSchedules
      .map((schedule) => ({ schedule, message: checkFacultyConflict(facultyId, schedule.id) }))
      .filter((clash): clash is { schedule: ScheduleItem; message: string } => !!clash.message);
    if (instructorClashes.length > 0) {
      return { message: instructorClashes[0].message, scheduleIds: new Set(instructorClashes.map((clash) => clash.schedule.id)), counterpartIds: [] };
    }
    const others: { label: string; schedules: ScheduleItem[] }[] = [
      ...assignments
        .filter((assignment) => assignment.facultyId === facultyId)
        .map((assignment) => ({
          label: `${assignment.courseCode} ${assignment.sectionName} on the list`,
          schedules: assignment.scheduleIds
            .map((scheduleId) => schedules.find((schedule) => schedule.id === scheduleId))
            .filter((schedule): schedule is ScheduleItem => !!schedule),
        })),
      ...groups
        .filter((selectedGroup) => selectedGroup.key !== group.key && selectionKeys.includes(selectedGroup.key))
        .map((selectedGroup) => ({ label: selectedGroup.sectionName, schedules: selectedGroup.schedules })),
    ];
    for (const other of others) {
      const clashing = pendingSchedules.filter((schedule) => other.schedules.some((theirs) => overlaps(schedule, theirs)));
      if (clashing.length > 0) {
        return {
          message: `Overlaps ${other.label} · ${clashing.map(meetingLabel).join(", ")}`,
          scheduleIds: new Set(clashing.map((schedule) => schedule.id)),
          counterpartIds: other.schedules
            .filter((theirs) => clashing.some((schedule) => overlaps(schedule, theirs)))
            .map((theirs) => theirs.id),
        };
      }
    }
    return null;
  };
  const getConflict = (group: SectionGroup, selectionKeys = selectedKeys): string | null =>
    getConflictDetail(group, selectionKeys)?.message ?? null;
  const getConflictMeetings = (group: SectionGroup): Set<string> =>
    getConflictDetail(group)?.scheduleIds ?? new Set();

  const clashPartners = new Map<string, string[]>();
  courseGroups.forEach((group) => {
    if (getIssue(group)) return;
    getConflictDetail(group)?.counterpartIds.forEach((id) => {
      clashPartners.set(id, [...(clashPartners.get(id) ?? []), group.sectionName]);
    });
  });

  const selectedGroups = courseGroups.filter((group) => selectedKeys.includes(group.key));
  const selectedUnits = selectedGroups.reduce((total, group) => total + group.units, 0);
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
    if (selectedKeys.includes(group.key)) {
      setSelectedKeys((current) => current.filter((key) => key !== group.key));
      return;
    }
    if (getConflict(group)) return;
    if (selectedFaculty && exceedsCeiling(selectedFaculty, currentLoad + selectedUnits + group.units)) {
      toast.error(
        "Unit limit reached",
        `${selectedFaculty.name} would carry ${currentLoad + selectedUnits + group.units} of ${projectedLoad.ceiling} units (basic load + overload). Choose another instructor for ${group.courseCode} ${group.sectionName}.`,
      );
      return;
    }
    setSelectedKeys((current) => [...current, group.key]);
  };

  const selectableCourseGroupKeys = (() => {
    const keys: string[] = [];
    let units = currentLoad;

    courseGroups.forEach((group) => {
      if (
        getIssue(group) === null
        && getConflict(group, keys) === null
        && !exceedsCeiling(selectedFaculty, units + group.units)
      ) {
        keys.push(group.key);
        units += group.units;
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
        conflict: getConflict(group),
      })),
    ]);
    setSelectedKeys([]);
  };

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

  const hasBlockedAssignments = checkedAssignments.some((assignment) => assignment.conflict)
    || [...new Set(checkedAssignments.map((assignment) => assignment.facultyId))]
      .some((id) => exceedsCeiling(faculties.find((faculty) => faculty.id === id), facultyLoads.get(id) ?? 0));

  const saveAssignments = async () => {
    if (hasBlockedAssignments) return;
    const byFaculty = new Map<string, AssignmentBatch>();
    checkedAssignments.forEach((assignment) => {
      const existing = byFaculty.get(assignment.facultyId);
      if (existing) existing.scheduleIds.push(...assignment.scheduleIds);
      else byFaculty.set(assignment.facultyId, { facultyId: assignment.facultyId, scheduleIds: [...assignment.scheduleIds] });
    });
    const success = await onAssign([...byFaculty.values()]);
    if (success) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="assign-modal-overlay" onClick={(event) => event.target === event.currentTarget && !isSaving && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="auto-assign-title" aria-describedby="auto-assign-description" tabIndex={-1} className="assign-modal">
        <header className="assign-modal-header">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"><UserCheck className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="auto-assign-title" className="truncate text-base font-black text-white sm:text-lg">Assign Instructors</h2>
            <p id="auto-assign-description" className="sr-only">{steps[step - 1].title}. Step {step} of {steps.length}. Nothing is saved until you confirm.</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close auto-assign" className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <nav className="assign-progress" aria-label="Auto-assign instructor steps"><ol>{steps.map(item => <li key={item.id} aria-current={step === item.id ? 'step' : undefined} data-complete={step > item.id}><span className="assign-step-number" aria-hidden="true">{step > item.id ? <Check size={13} /> : item.id}</span><span>{item.title}</span></li>)}</ol><span className="assign-step-count" aria-hidden="true">Step {step} of 3</span></nav>

        <main className="assign-modal-body" aria-busy={isSaving} inert={isSaving}>
          {step === 1 && (
            <div className="assign-columns">
              <InstructorList faculties={faculties} departmentId={departmentId} facultyId={facultyId} facultyLoads={facultyLoads} onSelect={selectFaculty} allowExternalInstructors={allowExternalInstructors} />
              <section aria-label="Course and sections" className="assign-course-panel">
                <div className="assign-course-filters">
                  <SelectField label="Year level" value={yearLevel} onChange={selectYearLevel} options={[{ value: "1", label: "1st Year" }, { value: "2", label: "2nd Year" }, { value: "3", label: "3rd Year" }, { value: "4", label: "4th Year" }]} placeholder="Select year level" />
                  <SelectField label="Course" value={courseId} onChange={selectCourse} options={courseOptions.map((course) => {
                    const programs = courseProgramLabels.get(course.id);
                    return { value: course.id, label: `${course.code} - ${course.name}${programs ? ` (${programs})` : ""}` };
                  })} placeholder="Select course" />
                </div>
                <SectionTable groups={courseGroups} selectedKeys={selectedKeys} getIssue={getIssue} getConflict={getConflict} getConflictMeetings={getConflictMeetings} clashPartners={clashPartners} onToggle={toggleGroup} onSelectAll={selectAllGroups} selectAllChecked={allSelectableGroupsSelected} selectAllDisabled={selectableCourseGroupKeys.length === 0} onRemove={onRemoveAssignment ? removeClassAssignment : undefined} removalBlockedReason={removalBlockedReason} busy={isSaving} />
                <div className="assign-selection-actions" data-selected={selectedGroups.length > 0}>
                  {selectedFaculty ? (
                    <div className="min-w-0 flex-1 text-xs text-slate-600" role="status">
                      <p className="assign-selected-title">{selectedGroups.length ? `${plural(selectedGroups.length, 'section')} selected` : 'Select available sections'}</p>
                      <p>{selectedFaculty.name} · Projected load <strong className="tabular-nums">{currentLoad + selectedUnits} / {projectedLoad.ceiling} units</strong>{projectedLoad.tier !== 'basic' && ` · ${projectedLoad.label}`}</p>
                    </div>
                  ) : (
                    <p className="mr-auto text-xs font-semibold text-slate-500">Select an instructor to see which sections they can take.</p>
                  )}
                  <button type="button" onClick={addToAssignmentList} disabled={selectedGroups.length === 0} className="assign-button assign-button-primary">
                    <Plus className="h-3.5 w-3.5" /> {selectedGroups.length ? `Add ${plural(selectedGroups.length, "section")} to list` : "Add to list"}
                  </button>
                </div>
              </section>
            </div>
          )}

          {step === 2 && <ReviewAssignments assignments={checkedAssignments} faculties={faculties} facultyLoads={facultyLoads} onRemove={removeAssignment} />}

          {step === 3 && <ConfirmAssignments assignments={checkedAssignments} faculties={faculties} facultyLoads={facultyLoads} blocked={hasBlockedAssignments} onEdit={() => setStep(2)} />}
        </main>

        <footer className="assign-modal-footer">
          <p role="status" className="sr-only">{isSaving ? 'Saving assignments…' : ''}</p>
          {step === 3 ? (
            <ConfirmValidationSummary assignments={checkedAssignments}faculties={faculties} facultyLoads={facultyLoads} />
          ) : step === 1 && assignments.length > 0 ? (
            <p role="status" className="assign-pending-summary">
              <ListChecks className="h-4 w-4 shrink-0" />
              {plural(assignments.length, "section")} pending · {plural(new Set(assignments.map((assignment) => assignment.facultyId)).size, "instructor")}
            </p>
          ) : (
            <p className="assign-footer-help">{STEP_HELP[step]}</p>
          )}
          <div className="assign-footer-buttons">
            <button type="button" onClick={() => step > 1 ? setStep((current) => current - 1) : onClose()} disabled={isSaving} className="assign-button assign-button-secondary">
              {step > 1 ? <><ChevronLeft className="h-4 w-4" /> Back</> : "Cancel"}
            </button>
            {step === 1 && (
              <button type="button" onClick={() => setStep(2)} disabled={assignments.length === 0} className="assign-button assign-button-primary">
                Review {assignments.length > 0 && `(${assignments.length})`} <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 2 && (
              <button type="button" onClick={() => setStep(3)} disabled={assignments.length === 0} className="assign-button assign-button-primary">
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 3 && (
              <button type="button" onClick={saveAssignments} disabled={isSaving || assignments.length === 0 || hasBlockedAssignments} className="assign-button assign-button-primary">
                {isSaving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} {isSaving ? "Saving..." : "Save Assignments"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

type EmploymentFilter = "all" | "full-time" | "part-time";

const EMPLOYMENT_FILTERS: [EmploymentFilter, string][] = [
  ["all", "All"],
  ["full-time", "Full-time"],
  ["part-time", "Part-time"],
];

const employmentRank = (faculty: Faculty): number =>
  faculty.employmentType === "full-time" ? 0 : faculty.employmentType === "part-time" ? 1 : 2;

function InstructorList({ faculties, departmentId, facultyId, facultyLoads, onSelect, allowExternalInstructors = true }: { faculties: Faculty[]; departmentId: number | null; facultyId: string; facultyLoads: Map<string, number>; onSelect: (id: string) => void; allowExternalInstructors?: boolean }) {
  const [tab, setTab] = useState<"department" | "external">("department");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employment, setEmployment] = useState<EmploymentFilter>("all");
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
  const externalDepartments = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    if (tab !== "external") return [];
    visibleFaculties.forEach((faculty) => {
      const key = String(faculty.departmentId ?? "none");
      const label = faculty.departmentCode ?? faculty.departmentName ?? "No department";
      counts.set(key, { label, count: (counts.get(key)?.count ?? 0) + 1 });
    });
    return [...counts.entries()]
      .map(([value, { label, count }]) => ({ value, label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tab, visibleFaculties]);
  const activeDepartment = tab === "external" && externalDepartments.some((d) => d.value === departmentFilter) ? departmentFilter : "";
  const query = search.trim().toLowerCase();
  const searchedFaculties = useMemo(
    () => visibleFaculties.filter((faculty) => {
      if (activeDepartment !== "" && String(faculty.departmentId ?? "none") !== activeDepartment) return false;
      return query === "" || [faculty.name, faculty.departmentCode, faculty.departmentName, faculty.programCode]
        .some((value) => (value ?? "").toLowerCase().includes(query));
    }),
    [activeDepartment, query, visibleFaculties],
  );
  const employmentCounts = useMemo(() => ({
    all: searchedFaculties.length,
    "full-time": searchedFaculties.filter((faculty) => faculty.employmentType === "full-time").length,
    "part-time": searchedFaculties.filter((faculty) => faculty.employmentType === "part-time").length,
  }), [searchedFaculties]);
  const matchingFaculties = useMemo(
    () => employment === "all"
      ? [...searchedFaculties].sort((a, b) => employmentRank(a) - employmentRank(b))
      : searchedFaculties.filter((faculty) => faculty.employmentType === employment),
    [employment, searchedFaculties],
  );
  return (
    <aside aria-label="Instructor selection" className="assign-instructor-panel">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3 text-sm font-black text-slate-900">
        <Users className="h-4 w-4 text-[#4e0a10]" /> Instructor
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
          {query || activeDepartment || employment !== "all" ? `${matchingFaculties.length} of ${visibleFaculties.length}` : visibleFaculties.length}
        </span>
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
            aria-pressed={tab === value}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-bold transition-colors ${tab === value ? "border-[#4e0a10] text-[#4e0a10]" : "border-transparent text-slate-400 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>}
      {tab === "external" && externalDepartments.length > 0 && (
        <div className="relative shrink-0 px-3 pt-2.5">
          <select
            value={activeDepartment}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            aria-label="Filter instructors by department"
            className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-xs font-semibold text-slate-800 outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25"
          >
            <option value="">All departments ({visibleFaculties.length})</option>
            {externalDepartments.map((department) => (
              <option key={department.value} value={department.value}>{department.label} ({department.count})</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-5 top-[18px] h-4 w-4 text-slate-400" />
        </div>
      )}
      <div className="relative shrink-0 px-3 pt-2.5">
        <Search className="pointer-events-none absolute left-[22px] top-5 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search instructors"
          aria-label="Search instructors to assign"
          className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-8 text-xs outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear instructor search"
            className="absolute right-5 top-[18px] rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div role="group" aria-label="Filter instructors by employment type" className="flex shrink-0 gap-1.5 px-3 pt-2.5">
        {EMPLOYMENT_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setEmployment(value)}
            aria-pressed={employment === value}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
              employment === value
                ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {label}{' '}
            <span className={`tabular-nums ${employment === value ? "text-white/75" : "text-slate-400"}`}>{employmentCounts[value]}</span>
          </button>
        ))}
      </div>
      <div className="assign-instructor-scroll" role="region" aria-label="Instructors" tabIndex={0}>
        <ul className="assign-instructor-list">
          {matchingFaculties.map((faculty) => {
            const load = facultyLoads.get(faculty.id) ?? 0;
            const display = loadDisplay(faculty, load);
            return <li key={faculty.id}>
              <button type="button" onClick={() => onSelect(faculty.id)} aria-pressed={faculty.id === facultyId} className="assign-instructor-option" style={{ contentVisibility: 'auto', containIntrinsicSize: '100px' }}>
                <span aria-hidden="true"><ProfileAvatar src={faculty.profilePicture} alt="" className="h-8 w-8 shrink-0 rounded-full" iconClassName="h-4 w-4" /></span>
                <span className="assign-instructor-identity"><span className="assign-instructor-name">{faculty.name}</span><span className="assign-instructor-meta">{employmentLabel(faculty.employmentType) ?? 'Employment not recorded'} · {faculty.status === 'inactive' ? 'Inactive' : 'Active'}{tab === 'external' && ` · ${faculty.departmentCode ?? faculty.departmentName ?? 'External'}`}</span></span>
                <span className="assign-instructor-check" aria-hidden="true">{faculty.id === facultyId && <Check size={16} />}</span>
                <span className="assign-instructor-load"><span>Teaching load <strong>{load} / {display.ceiling} units</strong></span><span className="assign-load-track" aria-hidden="true"><span className={display.barClass} style={{width: `${display.percentage}%`}} /></span>{display.tier !== 'basic' && <span className="assign-load-notice">{display.label}</span>}</span>
              </button>
            </li>;
          })}
        </ul>
        {matchingFaculties.length === 0 && (
          <p className="px-3 py-8 text-center text-xs font-semibold text-slate-500">
            {query && searchedFaculties.length === 0 && visibleFaculties.length > 0
              ? `No instructor matches “${search.trim()}”.`
              : employment !== "all" && searchedFaculties.length > 0
                ? `No ${employment} instructors here.`
                : "No instructors in this group."}
          </p>
        )}
      </div>
    </aside>
  );
}

function SelectField({ label, value, onChange, options, placeholder, allValue }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder: string; allValue?: string }) {
  return <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}<div className="relative mt-1"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25"><option value={allValue ?? ""}>{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-slate-400" /></div></label>;
}

function SectionTable({ groups, selectedKeys, getIssue, getConflict, getConflictMeetings, clashPartners, onToggle, onSelectAll, selectAllChecked, selectAllDisabled, onRemove, removalBlockedReason, busy }: { groups: SectionGroup[]; selectedKeys: string[]; getIssue: (group: SectionGroup) => string | null; getConflict: (group: SectionGroup) => string | null; getConflictMeetings: (group: SectionGroup) => Set<string>; clashPartners: Map<string, string[]>; onToggle: (group: SectionGroup) => void; onSelectAll: () => void; selectAllChecked: boolean; selectAllDisabled: boolean; onRemove?: (group: SectionGroup) => void; removalBlockedReason: (group: SectionGroup) => string | null; busy: boolean }) {
  const columns = useMemo<ColumnDef<SectionGroup>[]>(() => [
    {
      id: "selected",
      header: () => <span className="sr-only">Select</span>,
      size: 44,
      enableSorting: false,
      meta: { stopRowClick: true },
      cell: ({ row }) => {
        const selected = selectedKeys.includes(row.original.key);
        return (
          <label className="assign-section-checkbox"><input type="checkbox" aria-label={`Select ${row.original.courseCode} ${row.original.sectionName}`} aria-describedby={`assignment-availability-${row.original.key}`} checked={selected} disabled={busy || Boolean(getIssue(row.original)) || (!selected && Boolean(getConflict(row.original)))} onChange={() => onToggle(row.original)} /></label>
        );
      },
    },
    {
      accessorKey: "sectionName",
      header: "Section",
      size: 110,
      cell: ({ row }) => <span className="text-sm font-bold text-slate-800">{row.original.sectionName}</span>,
    },
    {
      id: "schedule",
      header: "Schedule",
      enableSorting: false,
      cell: ({ row }) => {
        const clashing = getIssue(row.original) ? new Set<string>() : getConflictMeetings(row.original);
        return (
          <span className="assign-section-meetings">
            {scheduleEntries(row.original).map((entry) => {
              const partners = [...new Set(entry.scheduleIds.flatMap((id) => clashPartners.get(id) ?? []))];
              const red = partners.length > 0 || entry.scheduleIds.some((id) => clashing.has(id));
              return (
                <span key={entry.label} className="assign-section-meeting">
                  {red
                    ? <span className="rounded bg-rose-100 px-1 py-0.5 font-bold text-rose-700 ring-1 ring-rose-200" title={partners.length ? `Conflicts with ${partners.join(", ")}` : "Conflicts for this instructor"}>{entry.label}</span>
                    : entry.label}
                </span>
              );
            })}
          </span>
        );
      },
    },
    {
      accessorKey: "units",
      header: "Units",
      size: 56,
      cell: ({ row }) => <span className="text-sm font-bold text-slate-700">{row.original.units}</span>,
    },
    {
      id: "availability",
      accessorFn: (group) => getIssue(group) ?? getConflict(group) ?? "Available",
      header: "Availability",
      cell: ({ row }) => {
        const issue = getIssue(row.original);
        const conflict = issue ? null : getConflict(row.original);
        if (conflict) {
          return (
            <div id={`assignment-availability-${row.original.key}`} className="assign-availability">
              <span className="assign-status assign-status-conflict"><AlertTriangle size={13} aria-hidden="true" />
                {isAvailabilityWarning(conflict) ? AVAILABILITY_WARNING_TITLE : "Conflict"}
              </span>
              <details className="assign-conflict-details" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><summary>View reason<span className="sr-only"> for {row.original.sectionName}</span></summary><p>{conflict}</p></details>
            </div>
          );
        }
        const blocks = issue ? [] : [...new Set(row.original.schedules.flatMap((schedule) => clashPartners.get(schedule.id) ?? []))];
        return (
          <div id={`assignment-availability-${row.original.key}`} className="assign-availability">
            <span className={`assign-status ${issue ? 'assign-status-neutral' : 'assign-status-available'}`}>
              {issue ? <Info size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
              {issue ? row.original.assignedFacultyId ? 'Assigned' : issue.startsWith('Queued') ? 'On list' : 'Unavailable' : 'Available'}
            </span>
            {issue && <span className="assign-status-detail">{issue.replace(/^Assigned Instructor: /, '')}</span>}
            {blocks.length > 0 && <span className="assign-status-detail text-rose-700">Conflicts with {blocks.join(", ")}</span>}
          </div>
        );
      },
    },
    ...(onRemove ? [{
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      size: 56,
      enableSorting: false,
      meta: { align: "right" as const, stopRowClick: true },
      cell: ({ row }: { row: { original: SectionGroup } }) => {
        if (!onRemove || !row.original.assignedFacultyId) return null;
        const blocked = removalBlockedReason(row.original);
        return (
          <div className="flex justify-end">
            <TableActionButton
              label={blocked ?? "Remove instructor"}
              aria-label={`Remove instructor from ${row.original.courseCode} ${row.original.sectionName}`}
              variant="remove"
              disabled={Boolean(blocked) || busy}
              onClick={(event) => { event.stopPropagation(); onRemove(row.original); }}
            >
              <X size={15} />
            </TableActionButton>
          </div>
        );
      },
    } satisfies ColumnDef<SectionGroup>] : []),
  ], [busy, clashPartners, getConflict, getConflictMeetings, getIssue, onRemove, onToggle, removalBlockedReason, selectedKeys]);

  const table = useDataTable({
    data: groups,
    columns,
    pageSize: false,
    getRowId: (group) => group.key,
  });

  return (
    <section aria-label="Section selection" className="assign-section-panel">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2.5"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><Layers3 className="h-4 w-4 text-[#4e0a10]" /> Sections <span className="text-xs font-semibold text-slate-400">{groups.length}</span></div><div className="flex items-center gap-3">{selectedKeys.length > 0 && <span className="rounded-full bg-[#4e0a10]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#4e0a10]">{selectedKeys.length} selected</span>}<label className={`inline-flex items-center gap-1.5 text-xs font-bold ${selectAllDisabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"}`}><input type="checkbox" checked={selectAllChecked} onChange={onSelectAll} disabled={selectAllDisabled} className="h-4 w-4 rounded border-slate-300 accent-[#4e0a10]" /> Select all available</label></div></div>
      {groups.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center"><Layers3 className="h-6 w-6 text-slate-300" /><p className="text-sm font-semibold text-slate-600">No sections to assign</p><p className="text-xs text-slate-500">Pick another course or year level.</p></div> : (
        <DataTable
          table={table}
          variant="embedded"
          className="flex min-h-0 flex-1 flex-col"
          scrollClassName="assign-section-scroll"
          tableClassName="assign-sections-table"
          ariaLabel="Sections"
          onRowClick={onToggle}
          rowClassName={(group) => (getIssue(group)
            ? "!cursor-not-allowed"
            : getConflict(group)
              ? selectedKeys.includes(group.key) ? "!bg-orange-100/70" : "!bg-orange-50/60"
              : selectedKeys.includes(group.key) ? "!bg-[#4e0a10]/[0.04]" : "")}
        />
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
    <div className="assign-columns assign-review-columns">
      <aside aria-label="Queued instructors" className="assign-review-instructors">
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
                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                  <span className="mr-auto font-semibold tabular-nums text-slate-600">{load} / {display.ceiling} units</span>
                  <ConflictCountBadge items={items} />
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
          <section aria-label="Queued sections" className="assign-course-panel">
            <div className="assign-review-heading">
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
                  <span className="font-black tabular-nums text-slate-900">{load} <span className="font-medium text-slate-500">/ {display.ceiling}</span></span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${display.barClass}`} style={{ width: `${display.percentage}%` }} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ConflictCountBadge items={items} large />
                <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-bold ${display.badgeClass}`}>{display.label}</span>
              </div>
            </div>

            <AssignmentItemsTable
              items={items}
              onRemove={onRemove}
              className="flex min-h-0 flex-1 flex-col"
              scrollClassName="min-h-0 flex-1 overflow-auto"
            />

            <p className="flex shrink-0 items-start gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              Basic Load plus overload allowance is the maximum teaching load.
            </p>
          </section>
        );
      })() : (
        <section className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm font-semibold text-slate-500">Select an instructor to review their assignments.</section>
      )}
    </div>
  );
}

function ConflictCountBadge({ items, large = false }: { items: QueuedAssignment[]; large?: boolean }) {
  const count = items.filter((item) => item.conflict).length;
  if (count === 0) return null;
  return (
      <span className={`inline-flex w-fit items-center gap-1 border border-red-200 bg-red-50 font-bold text-red-700 ${large ? "rounded-md px-2 py-1 text-xs" : "rounded px-1.5 py-0.5 text-[10px]"}`}>
      <AlertTriangle className={large ? "h-3.5 w-3.5" : "h-3 w-3"} /> {plural(count, "conflict")}
    </span>
  );
}

function AssignmentItemsTable({ items, onRemove, showTotal = false, className, scrollClassName }: { items: QueuedAssignment[]; onRemove?: (key: string) => void; showTotal?: boolean; className?: string; scrollClassName?: string }) {
  const columns = useMemo<ColumnDef<QueuedAssignment>[]>(() => [
    {
      id: "course",
      accessorKey: "courseCode",
      header: "Course",
      meta: { cellClassName: "align-top" },
      cell: ({ row }) => (
        <>
          <p className="text-sm font-black text-slate-900">{row.original.courseCode}</p>
          <p className="assign-course-name">{row.original.courseName}</p>
        </>
      ),
    },
    { id: "section", accessorKey: "sectionName", header: "Section", meta: { cellClassName: "align-top text-sm font-bold text-slate-800" } },
    {
      id: "schedule",
      accessorKey: "schedule",
      header: "Schedule",
      enableSorting: false,
      meta: { cellClassName: "align-top font-medium leading-5 text-slate-600" },
      cell: ({ row }) => (
        <>
          {row.original.schedule}
          {row.original.conflict && (
            <span className="mt-1 flex w-fit items-center gap-1 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700" title={row.original.conflict}>
              <AlertTriangle className="h-3 w-3 shrink-0" /> {row.original.conflict}
            </span>
          )}
        </>
      ),
    },
    { id: "mode", accessorKey: "mode", header: "Mode", meta: { cellClassName: "whitespace-nowrap align-top text-slate-600" } },
    {
      id: "units",
      accessorKey: "units",
      header: "Units",
      meta: { align: "right", cellClassName: "align-top text-sm font-black tabular-nums text-slate-800" },
      ...(showTotal ? { footer: () => <span className="font-black tabular-nums text-slate-900">{items.reduce((total, item) => total + item.units, 0)}</span> } : {}),
    },
    ...(onRemove ? [{
      id: "actions",
      header: "Actions",
      size: 80,
      enableSorting: false,
      meta: { align: "right" as const, cellClassName: "align-top" },
      cell: ({ row }: { row: { original: QueuedAssignment } }) => (
        <div className="flex justify-end">
          <TableActionButton label="Remove from list" aria-label={`Remove ${row.original.courseCode} ${row.original.sectionName}`} variant="remove" onClick={() => onRemove(row.original.key)}>
            <X size={15} />
          </TableActionButton>
        </div>
      ),
    } satisfies ColumnDef<QueuedAssignment>] : []),
  ], [items, onRemove, showTotal]);

  const withFooterLabel = showTotal
    ? columns.map((column, index) => (index === 0 ? { ...column, footer: () => <span className="text-slate-500">Units added</span> } : column))
    : columns;

  const table = useDataTable({ data: items, columns: withFooterLabel, pageSize: false, getRowId: (item) => item.key });

  return (
    <DataTable
      table={table}
      variant="embedded"
      density="compact"
      className={className}
      scrollClassName={scrollClassName}
      tableClassName="assign-review-table"
      ariaLabel="Queued assignments"
      emptyTitle="No sections on the list."
      emptyDescription=""
    />
  );
}

function ConfirmAssignments({ assignments, faculties, facultyLoads, blocked, onEdit }: { assignments: QueuedAssignment[]; faculties: Faculty[]; facultyLoads: Map<string, number>; blocked: boolean; onEdit: () => void }) {
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
    <div className="assign-confirm-content">
      <section className="assign-confirm-summary">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${blocked ? 'bg-red-50 text-red-700' : overloaded.length ? 'bg-amber-50 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
            {blocked || overloaded.length ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div>
            <h3 className="text-base font-black text-slate-900">{blocked ? 'Resolve issues before saving' : 'Ready to save'}</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              {blocked ? assignments.some(assignment => assignment.conflict) ? 'Remove conflicting assignments before saving.' : 'Teaching load exceeds the unit limit.' : overloaded.length
                ? "Some loads go past Basic Load and use the overload allowance."
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
                  <p className="text-sm font-black tabular-nums text-slate-900">{load} <span className="font-medium text-slate-500">/ {display.ceiling} units</span></p>
                  <span className="mt-0.5 inline-flex items-center gap-1">
                    <ConflictCountBadge items={items} />
                    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${display.badgeClass}`}>{display.label}</span>
                  </span>
                </div>
                <TableActionButton label="Edit assignments" aria-label={`Edit assignments for ${name}`} variant="edit" onClick={onEdit}><Pencil size={15} /></TableActionButton>
                <button type="button" onClick={() => toggleGroup(facultyId)} aria-hidden="true" tabIndex={-1} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"><ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "-rotate-180" : ""}`} /></button>
              </div>
              {expanded && (
                <div className="border-t border-slate-100 motion-safe:animate-dropdownIn">
                  <AssignmentItemsTable items={items} showTotal />
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
      <span className={`flex items-center gap-1.5 ${overloadCount ? "text-amber-800" : ""}`}>
        {overloadCount ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
        {overloadCount ? `${plural(overloadCount, "instructor")} past Basic Load` : "All within Basic Load"}
      </span>
      <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {plural(assignments.length, "section")}</span>
      {assignments.some((assignment) => assignment.conflict) && (
        <span className="flex items-center gap-1.5 text-orange-700">
          <AlertTriangle className="h-3.5 w-3.5" /> {plural(assignments.filter((assignment) => assignment.conflict).length, "conflict")} · remove to save
        </span>
      )}
      <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {plural(totalUnits, "unit")} to save</span>
    </div>
  );
}

function ConfirmMetric({ icon, value, label, warn = false }: { icon: React.ReactNode; value: string | number; label: string; warn?: boolean }) {
  return (
    <div className="assign-confirm-metric">
      <span className={warn ? 'text-amber-800' : 'text-primary'} aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className={`truncate text-base font-black tabular-nums ${warn ? "text-amber-700" : "text-slate-900"}`}>{value}</p>
        <p className="truncate text-[11px] font-semibold text-slate-500">{label}</p>
      </div>
    </div>
  );
}
