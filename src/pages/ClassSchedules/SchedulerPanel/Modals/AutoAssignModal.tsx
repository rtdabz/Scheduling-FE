import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, UserCheck, UserRound, Users, X } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Faculty, ScheduleItem, Subject } from "../types";
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
  const [courseId, setCourseId] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [sectionLimit, setSectionLimit] = useState("all");
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
  }, [schedules]);

  const courseOptions = useMemo(() => {
    const ids = new Set(groups.map((group) => group.courseId));
    return subjects.filter((subject) => ids.has(subject.id)).sort((left, right) => left.code.localeCompare(right.code));
  }, [groups, subjects]);

  const facultyLoads = useMemo(() => {
    const loads = new Map<string, number>();
    groups.forEach((group) => {
      if (group.assignedFacultyId) loads.set(group.assignedFacultyId, (loads.get(group.assignedFacultyId) ?? 0) + group.units);
    });
    assignments.forEach((assignment) => {
      loads.set(assignment.facultyId, (loads.get(assignment.facultyId) ?? 0) + assignment.units);
    });
    return loads;
  }, [assignments, groups]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setAssignments([]);
    setFacultyId(faculties.find((faculty) => faculty.departmentId === departmentId)?.id ?? faculties[0]?.id ?? "");
    setCourseId(courseOptions[0]?.id ?? "");
    setSectionFilter("all");
    setSectionLimit("all");
    setSelectedKeys([]);
  }, [departmentId, isOpen, faculties, courseOptions]);

  const selectedFaculty = faculties.find((faculty) => faculty.id === facultyId);
  const currentLoad = facultyLoads.get(facultyId) ?? 0;
  const maxUnits = selectedFaculty?.maxUnits ?? 24;
  const courseGroups = useMemo(() => groups.filter((group) =>
    group.courseId === courseId && (sectionFilter === "all" || group.sectionId === sectionFilter),
  ), [courseId, groups, sectionFilter]);

  const queuedKeys = new Set(assignments.map((assignment) => assignment.key));
  const getIssue = (group: SectionGroup): string | null => {
    if (group.assignedFacultyId || queuedKeys.has(group.key)) return "Already assigned";
    if (!group.schedules.every(canManageScheduleFaculty)) return "Assigned teaching department only";
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
      selectedGroup.key !== group.key && selectedKeys.includes(selectedGroup.key),
    );
    if (selectedGroupsForConflict.some((selectedGroup) => groupsOverlap(selectedGroup, group))) {
      return "Conflict";
    }
    if (currentLoad + group.units > maxUnits) return `Exceeds ${maxUnits}-unit load`;
    return null;
  };

  const selectedGroups = courseGroups.filter((group) => selectedKeys.includes(group.key));
  const isSaving = facultyActionSlotId === "bulk";

  const selectFaculty = (id: string) => {
    setFacultyId(id);
    setSelectedKeys([]);
  };

  const selectCourse = (id: string) => {
    setCourseId(id);
    setSectionFilter("all");
    setSelectedKeys([]);
  };

  const selectSectionFilter = (value: string) => {
    setSectionFilter(value);
    setSelectedKeys([]);
  };

  const selectSectionLimit = (value: string) => {
    setSectionLimit(value);
    setSelectedKeys([]);
  };

  const toggleGroup = (group: SectionGroup) => {
    if (getIssue(group)) return;
    setSelectedKeys((current) => {
      if (current.includes(group.key)) return current.filter((key) => key !== group.key);
      const selected = courseGroups.filter((item) => current.includes(item.key));
      const limit = sectionLimit === "all" ? Number.POSITIVE_INFINITY : Number(sectionLimit);
      const selectedUnits = selected.reduce((total, item) => total + item.units, currentLoad);
      if (selected.length >= limit || selectedUnits + group.units > maxUnits || selected.some((item) => groupsOverlap(item, group))) return current;
      return [...current, group.key];
    });
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
        scheduleIds: group.schedules.map((schedule) => schedule.id),
      })),
    ]);
    setSelectedKeys([]);
    setSectionFilter("all");
    setSectionLimit("all");
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
                <div className="grid gap-3 sm:grid-cols-3">
                  <SelectField label="Select Course" value={courseId} onChange={selectCourse} options={courseOptions.map((course) => ({ value: course.id, label: `${course.code} - ${course.name}` }))} placeholder="Select course" />
                  <SelectField label="Section" value={sectionFilter} onChange={selectSectionFilter} options={groups.filter((group) => group.courseId === courseId).map((group) => ({ value: group.sectionId, label: group.sectionName }))} placeholder="All Sections" allValue="all" />
                  <SelectField label="Choose Number of Sections" value={sectionLimit} onChange={selectSectionLimit} options={courseGroups.map((_, index) => ({ value: String(index + 1), label: `${index + 1} section${index === 0 ? "" : "s"}` }))} placeholder="All compatible" allValue="all" />
                </div>
                <SectionTable groups={courseGroups} selectedKeys={selectedKeys} getIssue={getIssue} onToggle={toggleGroup} />
                <button type="button" onClick={addToAssignmentList} disabled={selectedGroups.length === 0} className="mt-3 inline-flex self-end items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Assign</button>
              </main>
            </div>
          )}

          {step === 2 && <ReviewAssignments assignments={assignments} faculties={faculties} facultyLoads={facultyLoads} onRemove={removeAssignment} />}

          {step === 3 && <section className="mt-3 rounded-lg border border-emerald-200 bg-white p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" /><div><h3 className="text-base font-black text-slate-900">Confirm all assignments</h3><p className="mt-1 text-sm text-slate-600">Review the instructor load, courses, and sections before saving {assignments.length} assignment{assignments.length === 1 ? "" : "s"}.</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><SummaryTile label="Instructors" value={new Set(assignments.map((item) => item.facultyId)).size} /><SummaryTile label="Sections" value={assignments.length} /><SummaryTile label="Total Units" value={assignments.reduce((total, item) => total + item.units, 0)} /></div></section>}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4"><button type="button" onClick={() => step > 1 ? setStep((current) => current - 1) : onClose()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> {step > 1 ? "Back" : "Cancel"}</button><div className="flex gap-2">{step === 1 && assignments.length > 0 && <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Review Assignments <ChevronRight className="h-4 w-4" /></button>}{step === 2 && <button type="button" onClick={() => setStep(3)} disabled={assignments.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Continue <ChevronRight className="h-4 w-4" /></button>}{step === 3 && <button type="button" onClick={saveAssignments} disabled={isSaving || assignments.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {isSaving ? "Saving..." : "Save All Assignments"}</button>}</div></footer>
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
        const maximum = faculty.maxUnits ?? 24;
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
              <span className="flex justify-between gap-2 text-xs text-slate-500"><span>Basic Load</span><span className="whitespace-nowrap font-bold text-slate-800">{load} / {maximum}</span></span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (load / Math.max(1, maximum)) * 100)}%` }} /></span>
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

function SectionTable({ groups, selectedKeys, getIssue, onToggle }: { groups: SectionGroup[]; selectedKeys: string[]; getIssue: (group: SectionGroup) => string | null; onToggle: (group: SectionGroup) => void }) {
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
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5"><div className="flex items-center gap-2 text-sm font-black text-slate-800"><UserCheck className="h-4 w-4 text-blue-600" /> Compatible Sections</div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{selectedKeys.length} selected</span></div>
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
  const columns = useMemo<ColumnDef<QueuedAssignment>[]>(() => [
    {
      accessorKey: "facultyName",
      header: "Instructor",
      cell: ({ row }) => <span className="font-bold text-slate-900">{row.original.facultyName}</span>,
    },
    {
      id: "course",
      header: "Course",
      cell: ({ row }) => <div><p className="font-bold text-slate-800">{row.original.courseCode}</p><p className="text-[11px] text-slate-500">{row.original.courseName}</p></div>,
    },
    {
      accessorKey: "sectionName",
      header: "Section",
      cell: ({ row }) => <span className="font-semibold text-slate-700">{row.original.sectionName}</span>,
    },
    {
      accessorKey: "units",
      header: "Units",
      cell: ({ row }) => <span className="font-bold text-slate-700">{row.original.units}</span>,
    },
    {
      id: "load",
      header: "Projected Load",
      cell: ({ row }) => {
        const faculty = faculties.find((item) => item.id === row.original.facultyId);
        return <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800">{facultyLoads.get(row.original.facultyId) ?? 0} / {faculty?.maxUnits ?? 24} units</span>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(row.original.key); }} className="text-xs font-bold text-red-600 hover:text-red-700">Remove</button>,
    },
  ], [faculties, facultyLoads, onRemove]);

  const table = useReactTable({ data: assignments, columns, getCoreRowModel: getCoreRowModel() });

  if (assignments.length === 0) return <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">No assignments queued. Go back and add compatible sections.</div>;

  return <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3"><h3 className="text-sm font-black text-slate-900">Review Instructor Load, Courses, and Sections</h3><p className="mt-1 text-xs text-slate-500">Assignments remain editable until the final save step.</p></div><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 z-10 bg-[#4e0a10] text-[11px] uppercase text-white">{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => <th key={header.id} className="px-4 py-3 font-black">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody className="divide-y divide-slate-100">{table.getRowModel().rows.map((row) => <tr key={row.id} className="hover:bg-slate-50">{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div></section>;
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div>;
}
