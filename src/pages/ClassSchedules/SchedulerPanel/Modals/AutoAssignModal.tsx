import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, Layers3, Loader2, Pencil, Plus, Save, Search, Scale, SlidersHorizontal, Trash2, UserCheck, UserRound, Users, X } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Faculty, ScheduleItem, Subject } from "../types";
import { facultyEligibilityForSubject } from "../facultyEligibility";
import { LOAD_TIER_BADGE_CLASSES, LOAD_TIER_LABELS, basicLoadOf, loadTierForUnits, type LoadAllowances } from "../../../../lib/facultyLoad";
import type { LoadTier } from "../../../../lib/overloadConfirmation";
import WizardProgressStepper from "../GenerateSchedule/WizardProgressStepper";

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
  facultyActionSlotId: string | null;
  canManageScheduleFaculty: (schedule: ScheduleItem) => boolean;
  checkFacultyConflict: (facultyId: string, scheduleId: string) => string | null;
  onAssign: (assignments: AssignmentBatch[]) => Promise<boolean>;
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
    barClass: tier === "basic" ? "bg-blue-600" : tier === "beyond_ceiling" ? "bg-rose-500" : "bg-amber-500",
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

const scheduleLabel = (group: SectionGroup): string => group.schedules
  .slice()
  .sort((left, right) => left.dayIndex - right.dayIndex || left.startSlot - right.startSlot)
  .map((schedule) => `${schedule.day} ${schedule.startTime}-${schedule.endTime}`)
  .join(" | ");

export default function AutoAssignModal({
  isOpen,
  onClose,
  schedules,
  subjects,
  faculties,
  departmentId,
  facultyActionSlotId,
  canManageScheduleFaculty,
  checkFacultyConflict,
  onAssign,
}: AutoAssignModalProps) {
  const [step, setStep] = useState(1);
  const [facultyId, setFacultyId] = useState("");
  const [yearLevel, setYearLevel] = useState("1");
  const [courseId, setCourseId] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<QueuedAssignment[]>([]);

  const groups = useMemo<SectionGroup[]>(() => {
    const map = new Map<string, SectionGroup>();
    schedules
      .filter((schedule) => ["approved", "faculty_assignment"].includes(schedule.status))
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
          assignedFacultyId: schedule.facultyId,
        });
      });
    return [...map.values()].sort((left, right) => left.courseCode.localeCompare(right.courseCode) || left.sectionName.localeCompare(right.sectionName));
  }, [schedules, subjects]);

  const courseOptions = useMemo(() => {
    const ids = new Set(groups.filter((group) => group.yearLevel === Number(yearLevel)).map((group) => group.courseId));
    return subjects.filter((subject) => ids.has(subject.id)).sort((left, right) => left.code.localeCompare(right.code));
  }, [groups, subjects, yearLevel]);

  const facultyLoads = useMemo(() => {
    const loads = new Map<string, number>();
    // Seeded from the server's own figure instead of by summing the visible
    // groups: `assignedUnits` covers the whole term, so a filtered view no
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
    setFacultyId(faculties.find((faculty) => faculty.departmentId === departmentId)?.id ?? faculties[0]?.id ?? "");
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
    if (group.assignedFacultyId || queuedKeys.has(group.key)) return "Already assigned";
    if (!group.schedules.every(canManageScheduleFaculty)) return "Assigned teaching department only";

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
    for (const schedule of group.schedules) {
      const issue = checkFacultyConflict(facultyId, schedule.id);
      if (issue) return issue;
    }
    const queuedFacultySchedules = assignments
      .filter((assignment) => assignment.facultyId === facultyId)
      .flatMap((assignment) => assignment.scheduleIds)
      .map((scheduleId) => schedules.find((schedule) => schedule.id === scheduleId))
      .filter((schedule): schedule is ScheduleItem => !!schedule);
    if (group.schedules.some((schedule) => queuedFacultySchedules.some((queued) => overlaps(schedule, queued)))) {
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
        mode: group.schedules[0]?.mode ?? "Lecture",
        scheduleIds: group.schedules.map((schedule) => schedule.id),
      })),
    ]);
    setSelectedKeys([]);
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2" onClick={(event) => event.target === event.currentTarget && !isSaving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="auto-assign-title" className="flex h-[calc(100vh-16px)] w-[calc(100vw-16px)] max-w-none flex-col overflow-hidden rounded-lg bg-slate-50 shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#3a0809] bg-[#4e0a10] px-5 py-4 text-white">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"><UserCheck className="h-5 w-5" /></div><div><h2 id="auto-assign-title" className="text-base font-black text-white">Assign Instructors</h2><p className="text-xs text-white/75">Queue compatible sections, review loads, then save all assignments together.</p></div></div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close auto-assign" className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <WizardProgressStepper currentStep={step} steps={steps} ariaLabel="Auto-assign instructor steps" />

          {step === 1 && (
            <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[440px_minmax(0,1fr)]">
              <InstructorList faculties={faculties} departmentId={departmentId} facultyId={facultyId} facultyLoads={facultyLoads} onSelect={selectFaculty} />
              <main className="flex min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Year Level" value={yearLevel} onChange={selectYearLevel} options={[{ value: "1", label: "1st Year" }, { value: "2", label: "2nd Year" }, { value: "3", label: "3rd Year" }, { value: "4", label: "4th Year" }]} placeholder="Select year level" />
                  <SelectField label="Select Course" value={courseId} onChange={selectCourse} options={courseOptions.map((course) => ({ value: course.id, label: `${course.code} - ${course.name}` }))} placeholder="Select course" />
                </div>
                <SectionTable groups={courseGroups} selectedKeys={selectedKeys} getIssue={getIssue} onToggle={toggleGroup} onSelectAll={selectAllGroups} selectAllChecked={allSelectableGroupsSelected} selectAllDisabled={selectableCourseGroupKeys.length === 0} />
                <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                  {selectedFaculty && (
                    <p className="mr-auto text-xs font-semibold text-slate-600">
                      {currentLoad}
                      {selectedUnits > 0 && <span className="text-slate-500"> + {selectedUnits}</span>}
                      {" / "}{projectedLoad.bands.basicLoad} units
                      <span className={`ml-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${projectedLoad.badgeClass}`}>{projectedLoad.label}</span>
                    </p>
                  )}
                  <button type="button" onClick={addToAssignmentList} disabled={selectedGroups.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Assign</button>
                </div>
              </main>
            </div>
          )}

          {step === 2 && <ReviewAssignments assignments={assignments} faculties={faculties} facultyLoads={facultyLoads} onRemove={removeAssignment} />}

          {step === 3 && <ConfirmAssignments assignments={assignments} faculties={faculties} facultyLoads={facultyLoads} onEdit={() => setStep(2)} />}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          {step === 3 ? <ConfirmValidationSummary assignments={assignments} faculties={faculties} facultyLoads={facultyLoads} /> : <span />}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => step > 1 ? setStep((current) => current - 1) : onClose()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> {step > 1 ? "Back" : "Cancel"}</button>
            {step === 1 && assignments.length > 0 && <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Review Assignments <ChevronRight className="h-4 w-4" /></button>}
            {step === 2 && <button type="button" onClick={() => setStep(3)} disabled={assignments.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Continue <ChevronRight className="h-4 w-4" /></button>}
            {step === 3 && <button type="button" onClick={saveAssignments} disabled={isSaving || assignments.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isSaving ? "Saving..." : "Save Assignments"}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}

function InstructorList({ faculties, departmentId, facultyId, facultyLoads, onSelect }: { faculties: Faculty[]; departmentId: number | null; facultyId: string; facultyLoads: Map<string, number>; onSelect: (id: string) => void }) {
  const [tab, setTab] = useState<"department" | "external">("department");
  const visibleFaculties = useMemo(
    () => faculties.filter((faculty) => tab === "department" ? faculty.departmentId === departmentId : faculty.departmentId !== departmentId),
    [departmentId, faculties, tab],
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
            className={`grid w-full grid-cols-[minmax(0,1fr)_132px_24px] items-center gap-3 rounded-lg border px-3 py-3 text-left shadow-sm transition-colors ${
              selected
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              {faculty.profilePicture ? (
                  <img src={faculty.profilePicture} alt={faculty.name} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UserRound className="h-6 w-6" /></span>
              )}
              <span className="min-w-0">
                <span className="block break-words text-sm font-black leading-5 text-slate-900">{faculty.name}</span>
                <span className={`mt-1 flex items-center gap-2 text-xs font-medium ${selected ? "text-blue-600" : "text-slate-500"}`}>
                  <span className={`h-2 w-2 rounded-full ${selected ? "bg-blue-600" : faculty.status === "inactive" ? "bg-slate-300" : "bg-emerald-500"}`} />
                  {selected ? "Selected" : faculty.status === "inactive" ? "Inactive" : "Current"}
                  {tab === "external" && <span className="truncate text-slate-400">· {faculty.departmentCode ?? faculty.departmentName ?? "External"}</span>}
                </span>
              </span>
            </span>
            <span className="block min-w-0">
              <span className="flex justify-between gap-2 text-xs text-slate-500"><span>Basic Load</span><span className="whitespace-nowrap font-bold text-slate-800">{load} / {display.bands.basicLoad}</span></span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${display.barClass}`} style={{ width: `${display.percentage}%` }} /></span>
              {display.tier !== "basic" && <span className={`mt-1.5 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${display.badgeClass}`}>{display.label}</span>}
            </span>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${selected ? "bg-blue-600 text-white" : "text-transparent"}`}><Check className="h-4 w-4" /></span>
          </button>
        );
      },
    },
  ], [facultyId, facultyLoads, onSelect, tab]);

  const table = useReactTable({ data: visibleFaculties, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex shrink-0 items-center gap-2 pb-2 text-base font-black text-slate-900">
        <Users className="h-5 w-5 text-blue-600" /> Select Instructor
      </div>
      <div className="mb-2 flex shrink-0 border-b border-slate-200">
        {([
          ["department", "Department Instructors"],
          ["external", "External Instructors"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value);
              onSelect((faculties.find((faculty) => value === "department" ? faculty.departmentId === departmentId : faculty.departmentId !== departmentId)?.id) ?? "");
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-bold transition-colors ${tab === value ? "border-[#4e0a10] text-[#4e0a10]" : "border-transparent text-slate-400 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto overflow-x-hidden pr-1" style={{ contain: "layout paint" }}>
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
  return <label className="text-xs font-bold text-slate-700">{label}<div className="relative mt-1.5"><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold outline-none focus:border-blue-500"><option value={allValue ?? ""}>{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-slate-400" /></div></label>;
}

function SectionTable({ groups, selectedKeys, getIssue, onToggle, onSelectAll, selectAllChecked, selectAllDisabled }: { groups: SectionGroup[]; selectedKeys: string[]; getIssue: (group: SectionGroup) => string | null; onToggle: (group: SectionGroup) => void; onSelectAll: () => void; selectAllChecked: boolean; selectAllDisabled: boolean }) {
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
                ? "border-blue-600 bg-blue-600 text-white"
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
          <span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-bold ${
            issue
              ? "border-amber-200 bg-amber-100 text-amber-800"
              : "border-emerald-200 bg-emerald-100 text-emerald-800"
          }`}>
            {issue ?? "Available"}
          </span>
        );
      },
    },
  ], [getIssue, selectedKeys]);

  const table = useReactTable({
    data: groups,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5"><div className="flex items-center gap-2 text-sm font-black text-slate-800"><UserCheck className="h-4 w-4 text-blue-600" /> Compatible Sections</div><div className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{selectedKeys.length} selected</span><label className={`inline-flex items-center gap-1.5 text-xs font-bold ${selectAllDisabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"}`}><input type="checkbox" checked={selectAllChecked} onChange={onSelectAll} disabled={selectAllDisabled} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Select all</label></div></div>
      {groups.length === 0 ? <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-500">No compatible sections are available for this course.</div> : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead className="sticky top-0 z-10 bg-[#4e0a10] text-[11px] uppercase text-white">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className={`px-3 py-3 font-black ${header.column.id === "selected" ? "w-12 pl-4" : ""}`}>
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
                  <tr key={row.id} aria-disabled={!!issue} onClick={() => onToggle(row.original)} className={issue ? "cursor-not-allowed bg-slate-50/70" : "cursor-pointer hover:bg-blue-50/40"}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={`px-3 py-2.5 ${cell.column.id === "selected" ? "pl-4" : ""}`}>
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

  if (assignments.length === 0) return <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">No assignments queued. Go back and add compatible sections.</div>;

  return (
    <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <h3 className="text-sm font-black text-slate-900">Review Instructor Load, Courses, and Sections</h3>
        <p className="mt-1 text-xs text-slate-500">Assignments remain editable until the final save step.</p>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3"><h4 className="text-sm font-black text-slate-900">Instructors</h4><span className="ml-auto rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">{facultyGroups.length}</span></div>
          <div className="flex shrink-0 gap-2 border-b border-slate-100 p-3"><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search instructors..." aria-label="Search instructors" className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-2 text-xs outline-none focus:border-blue-500" /></label><div className="relative"><button type="button" onClick={() => setShowSortMenu((current) => !current)} aria-label="Sort instructors" aria-expanded={showSortMenu} title="Sort instructors" className={`h-full rounded-md border px-2.5 hover:bg-slate-50 ${showSortMenu ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}><SlidersHorizontal className="h-4 w-4" /></button>{showSortMenu && <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-lg">{([['name', 'Name'], ['sections', 'Most sections'], ['load', 'Highest load']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setSortMode(value); setShowSortMenu(false); }} className={`block w-full rounded px-2.5 py-2 text-left text-xs font-semibold ${sortMode === value ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div>}</div></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {filteredGroups.map(({ facultyId, faculty, items }) => {
              const load = facultyLoads.get(facultyId) ?? 0;
              const display = loadDisplay(faculty, load);
              const selected = selectedGroup?.facultyId === facultyId;
              return <button key={facultyId} type="button" onClick={() => setSelectedFacultyId(facultyId)} aria-pressed={selected} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected ? "border-blue-500 bg-blue-50/70" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}><div className="flex items-center gap-3">{faculty?.profilePicture ? <img src={faculty.profilePicture} alt="" loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-full border border-slate-200 object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UserRound className="h-5 w-5" /></span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900">{faculty?.name ?? items[0].facultyName}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{faculty?.departmentCode ?? faculty?.departmentName ?? "Instructor"}</span></span><span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{items.length} sections</span></div><div className="mt-3 flex items-center justify-between text-[11px]"><span className="font-semibold text-slate-500">{load} / {display.bands.basicLoad} units</span><span className="font-bold text-slate-500">{display.label}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${display.barClass}`} style={{ width: `${display.percentage}%` }} /></div></button>;
            })}
            {filteredGroups.length === 0 && <p className="px-3 py-8 text-center text-xs font-semibold text-slate-500">No matching instructors.</p>}
          </div>
          <div className="shrink-0 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">Showing {filteredGroups.length} of {facultyGroups.length} instructors</div>
        </aside>
        {selectedGroup ? (() => { const { facultyId, faculty, items } = selectedGroup; const load = facultyLoads.get(facultyId) ?? 0; const display = loadDisplay(faculty, load); return <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto"><div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(210px,1.2fr)_repeat(3,minmax(110px,1fr))] sm:items-center"><div className="flex items-center gap-3">{faculty?.profilePicture ? <img src={faculty.profilePicture} alt="" className="h-14 w-14 rounded-full border border-slate-200 object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UserRound className="h-7 w-7" /></span>}<div className="min-w-0"><h4 className="truncate text-base font-black text-slate-900">{faculty?.name ?? items[0].facultyName}</h4><p className="mt-1 text-sm text-slate-500">{faculty?.departmentCode ?? faculty?.departmentName ?? "Instructor"}</p></div></div><div><p className="text-xs font-semibold text-slate-500">Current load</p><p className="mt-1 text-base font-black text-slate-900">{load} <span className="font-medium text-slate-500">/ {display.bands.basicLoad} units</span></p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${display.barClass}`} style={{ width: `${display.percentage}%` }} /></div></div><div><p className="text-xs font-semibold text-slate-500">Sections assigned</p><p className="mt-1 text-xl font-black text-slate-900">{items.length}</p></div><div><p className="text-xs font-semibold text-slate-500">Load status</p><span className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-bold ${display.badgeClass}`}>{display.label}</span></div></div><section className="rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600"><BookOpen className="h-4 w-4" /></span><h4 className="text-sm font-black text-slate-900">Assigned Courses</h4></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{items.length} sections assigned</span></div><div className="space-y-2 p-3">{items.map((assignment) => <div key={assignment.key} className="grid items-center gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(180px,1fr)_minmax(120px,0.9fr)_minmax(100px,0.8fr)_80px_auto]"><div className="min-w-0"><p className="text-sm font-black text-slate-900">{assignment.courseCode}</p><p className="truncate text-xs text-slate-500">{assignment.courseName}</p></div><div><p className="text-[11px] font-semibold text-slate-500">Schedule</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-700">{assignment.schedule}</p></div><div><p className="text-[11px] font-semibold text-slate-500">Section</p><span className="mt-1 inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{assignment.sectionName}</span></div><div><p className="text-[11px] font-semibold text-slate-500">Units</p><span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{assignment.units} units</span></div><button type="button" onClick={() => onRemove(assignment.key)} aria-label={`Remove ${assignment.courseCode} ${assignment.sectionName}`} title="Remove assignment" className="justify-self-end rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>)}</div></section><div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p><span className="font-bold">Review the instructor's load and assigned sections before proceeding to final save.</span><br /><span className="text-blue-700">Anything past Basic Load is allowed — it runs into the overload allowance, then pro bono — and is confirmed once when you save.</span></p></div></main>; })() : <main className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm font-semibold text-slate-500">Select an instructor to review assignments.</main>}
      </div>
    </section>
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
    <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-emerald-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.3fr)_repeat(4,minmax(120px,1fr))] lg:items-center">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span><div><h3 className="text-lg font-black text-slate-900">Ready to Save Assignments</h3><p className="mt-1 text-xs leading-5 text-slate-600">Confirm instructor loads and assigned sections before saving.</p></div></div>
          <ConfirmMetric icon={<Users className="h-5 w-5" />} value={groups.length} label="Instructors" detail="All assigned" color="blue" />
          <ConfirmMetric icon={<Layers3 className="h-5 w-5" />} value={assignments.length} label="Sections" detail="All assigned" color="green" />
          <ConfirmMetric icon={<BookOpen className="h-5 w-5" />} value={totalUnits} label="Units" detail="Total load" color="purple" />
          <ConfirmMetric icon={<Scale className="h-5 w-5" />} value={overloaded.length ? "Overload" : "Balanced"} label="Load Status" detail={overloaded.length ? `${overloaded.length} instructor${overloaded.length === 1 ? "" : "s"} past Basic Load — you will be asked to confirm` : "No overload detected"} color="green" />
        </div>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-xs font-black uppercase tracking-wide text-[#4e0a10]">Final Assignment Review</h4><button type="button" onClick={() => setExpandedIds(allExpanded ? [] : groups.map((group) => group.facultyId))} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">{allExpanded ? "Collapse All" : "Expand All"}<ChevronDown className="h-3.5 w-3.5" /></button></div>
        <div className="space-y-2">
          {groups.map(({ facultyId, faculty, items }) => {
            const expanded = expandedIds.includes(facultyId);
            const load = facultyLoads.get(facultyId) ?? 0;
            const display = loadDisplay(faculty, load);
            const name = faculty?.name ?? items[0].facultyName;
            const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
            return (
              <article key={facultyId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4e0a10] text-xs font-black text-white">{initials}</span>
                  <div className="min-w-[160px] flex-1"><p className="text-sm font-black text-slate-900">{name}</p><p className="mt-0.5 text-xs text-slate-500">{faculty?.departmentCode ?? faculty?.departmentName ?? "Instructor"}<span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-bold ${display.badgeClass}`}>{display.label}</span></p></div>
                  <div className="text-right"><p className="text-sm font-black text-slate-900">{load} / {display.bands.basicLoad} units</p><p className="text-xs text-slate-500">{items.length} section{items.length === 1 ? "" : "s"} assigned</p></div>
                  <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-md border border-[#4e0a10]/20 px-3 py-2 text-xs font-bold text-[#4e0a10] hover:bg-[#4e0a10]/5"><Pencil className="h-3.5 w-3.5" /> Edit Assignment</button>
                  <button type="button" onClick={() => toggleGroup(facultyId)} aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`} className="rounded-md p-2 text-[#4e0a10] hover:bg-slate-50">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                </div>
                {expanded && <div className="border-t border-slate-200 p-3"><div className="hidden grid-cols-[0.7fr_1.2fr_1.2fr_70px_90px] gap-3 px-3 pb-2 text-[10px] font-black uppercase tracking-wide text-slate-500 sm:grid"><span>Course</span><span>Course Title</span><span>Section / Schedule</span><span>Units</span><span>Type</span></div><div className="divide-y divide-slate-100 rounded-md border border-slate-200">{items.map((assignment) => <div key={assignment.key} className="grid gap-2 px-3 py-3 text-xs sm:grid-cols-[0.7fr_1.2fr_1.2fr_70px_90px] sm:items-center"><span className="font-black text-slate-900">{assignment.courseCode}</span><span className="text-slate-600">{assignment.courseName}</span><span><span className="font-bold text-slate-800">{assignment.sectionName}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{assignment.schedule}</span></span><span className="font-black text-slate-800">{assignment.units}</span><span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold capitalize text-slate-700">{assignment.mode}</span></div>)}<div className="flex justify-end border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-800">Total Load: {items.reduce((total, item) => total + item.units, 0)} units</div></div></div>}
              </article>
            );
          })}
        </div>
      </div>

    </section>
  );
}

function ConfirmValidationSummary({ assignments, faculties, facultyLoads }: { assignments: QueuedAssignment[]; faculties: Faculty[]; facultyLoads: Map<string, number> }) {
  const facultyIds = [...new Set(assignments.map((assignment) => assignment.facultyId))];
  const overloadCount = facultyIds.filter((facultyId) => isPastBasicLoad(
    faculties.find((item) => item.id === facultyId),
    facultyLoads.get(facultyId) ?? 0,
  )).length;
  const totalUnits = assignments.reduce((total, assignment) => total + assignment.units, 0);
  return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[11px] text-slate-700"><span className="flex items-center gap-1.5 font-black text-slate-800"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Validation Summary</span><span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> {overloadCount ? `${overloadCount} instructor${overloadCount === 1 ? "" : "s"} past Basic Load` : "Every instructor is within Basic Load"}</span><span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> All {assignments.length} sections assigned</span><span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> {totalUnits} units will be saved</span></div>;
}

function ConfirmMetric({ icon, value, label, detail, color }: { icon: React.ReactNode; value: string | number; label: string; detail: string; color: "blue" | "green" | "purple" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", purple: "bg-purple-50 text-purple-700" };
  return <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colors[color]}`}>{icon}</span><div className="min-w-0"><p className="text-lg font-black text-slate-900">{value}</p><p className="text-xs font-bold text-slate-700">{label}</p><p className="truncate text-[11px] text-slate-500">{detail}</p></div></div>;
}


function SummaryTile({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div>;
}
