import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BookOpen, Building2, Check, Info, Save, Search, Trash2, TriangleAlert } from 'lucide-react';
import api from '../../lib/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import type { ColumnDef } from '@tanstack/react-table';
import TableActionButton from '../../components/ui/TableActionButton';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import { useToast } from '../../context/ToastContext';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import { programLabel, programName } from '../../lib/programLabel';

interface ApiErrorResponse { message?: string }
interface DepartmentOption { id: number; department_code: string; department_name: string; logo?: string | null }

interface CourseRow {
  id: number;
  course_code: string;
  course_name: string;
  year_level?: number | null;
  units?: number | null;
  course_category?: string | null;
  department_id?: number | null;
  department_code?: string | null;
  department_name?: string | null;
  teaching_department_id: number | null;
  teaching_department_code?: string | null;
  teaching_department_name?: string | null;
  teaching_program_id?: number | null;
  teaching_program_code?: string | null;
  teaching_program_name?: string | null;
  program_code?: string | null;
  program_name?: string | null;
  program_major?: string | null;
  curriculum_program_code?: string | null;
  curriculum_program_name?: string | null;
  curriculum_program_major?: string | null;
  delegable: boolean;
  /**
   * Classes this semester that already have an instructor. While any do, the
   * server refuses to change who teaches the course, so the page locks it too.
   */
  instructor_assigned_classes?: number;
}
interface PageData {
  courses: CourseRow[];
  departments: DepartmentOption[];
  programs: { id: number; department_id: number; code: string; name?: string | null; major?: string | null }[];
  /** The department whose courses these are — the acting user's own. */
  currentDepartmentId: number | null;
  /** False when the department has published no curriculum, so there is nothing to offer. */
  hasActiveCurriculum: boolean;
  /** The semester the list is scoped to; null when no semester is active and nothing is narrowed. */
  activeSemester: ActiveSemester | null;
}

interface ActiveSemester {
  id: number;
  academic_year?: string | null;
  semester?: string | null;
}

interface IndexResponse {
  courses?: CourseRow[];
  departments?: DepartmentOption[];
  current_department_id?: number | null;
  has_active_curriculum?: boolean;
  active_semester?: ActiveSemester | null;
  programs?: PageData['programs'];
}

// v10 carries instructor_assigned_classes, which locks a course that is already being taught.
const cacheKey = 'page:course-teaching-assignments:v10';

const SEMESTER_LABELS: Record<string, string> = { '1st': '1st Semester', '2nd': '2nd Semester', summer: 'Summer' };
const fullSemesterLabel = (semester: ActiveSemester | null) => (semester
  ? [SEMESTER_LABELS[semester.semester ?? ''] ?? semester.semester, semester.academic_year].filter(Boolean).join(', ')
  : '');

const YEAR_LEVELS = [1, 2, 3, 4];
const YEAR_LABELS: Record<number, string> = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };

const errorMessage = (error: unknown, fallback: string) =>
  (axios.isAxiosError<ApiErrorResponse>(error) ? error.response?.data?.message : null) || fallback;
const unitsOf = (course: CourseRow) => Number(course.units ?? 0) || 0;
const yearOf = (course: CourseRow) => Number(course.year_level ?? 0) || 0;
/** A GEC/GEE minor belongs to no college, so it reads as shared rather than blank. */
const ownerOf = (course: CourseRow) => course.department_code ?? 'Shared';
const programOf = (course: CourseRow) => ({
  code: course.curriculum_program_code ?? course.program_code ?? 'Shared',
  name: programName(
    {
      name: course.curriculum_program_name ?? course.program_name,
      major: course.curriculum_program_major ?? course.program_major,
    },
    'All programs'
  ),
});

/**
 * Who teaches the course today: the recorded college, or the owner teaching its
 * own course when nothing has been recorded.
 */
const instructorClassesOf = (course: CourseRow) => Number(course.instructor_assigned_classes ?? 0) || 0;
const instructorLockMessage = (course: CourseRow) => {
  const classes = instructorClassesOf(course);
  return `${course.course_code} already has an instructor in ${classes} ${classes === 1 ? 'class' : 'classes'} this semester. Remove those instructor assignments before changing who teaches it.`;
};

const currentTeacherOf = (course: CourseRow) =>
  course.teaching_program_code
  ?? course.teaching_department_code
  ?? (course.department_code ? `${course.department_code} (owner)` : 'Not yet assigned');

export default function CourseTeachingAssignments() {
  const { toast, confirm } = useToast();
  const cached = getCachedData<PageData>(cacheKey);
  const [courses, setCourses] = useState<CourseRow[]>(cached?.courses ?? []);
  const [departments, setDepartments] = useState<DepartmentOption[]>(cached?.departments ?? []);
  const [programs, setPrograms] = useState<PageData['programs']>(cached?.programs ?? []);
  const [currentDepartmentId, setCurrentDepartmentId] = useState<number | null>(cached?.currentDepartmentId ?? null);
  const [hasActiveCurriculum, setHasActiveCurriculum] = useState(cached?.hasActiveCurriculum ?? true);
  const [activeSemester, setActiveSemester] = useState<ActiveSemester | null>(cached?.activeSemester ?? null);
  const [target, setTarget] = useState<string | null>(null);
  const [targetProgramId, setTargetProgramId] = useState('');
  const [yearLevel, setYearLevel] = useState<number | null>(null);
  const [courseId, setCourseId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const courseTeachingGuideSteps = useMemo(() => [
    { element: '#course-teaching-target button', action: 'click' as const, taskHint: 'Click a department card to continue.', title: 'Choose the teaching department', description: 'Select who will teach the minor courses.', side: 'right' as const },
    { element: '#course-teaching-filters select', action: 'select' as const, taskHint: 'Change a filter to continue.', title: 'Choose a year and program', description: 'Work on one year level. You can also select a receiving program.', side: 'bottom' as const },
    { element: '#course-teaching-courses tbody input[type="checkbox"]:not([disabled])', waitFor: '#course-teaching-courses', action: 'toggle' as const, skipIfMissing: true, taskHint: 'Tick a course checkbox to continue.', title: 'Select minor courses', description: 'Choose the minor courses you want to assign.', side: 'top' as const },
    { element: '#course-teaching-save', title: 'Save the assignment', description: 'Save before creating schedules or assigning instructors.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'course-teaching', isReady: !loading, steps: courseTeachingGuideSteps, mission: 'Assign Course Teaching' });

  const liveRevision = useLiveRevision(['assignments', 'courses', 'curriculum']);

  useEffect(() => {
    let active = true;
    loadCachedData<PageData>(cacheKey, async () => {
      const response = await api.get<IndexResponse>('/course-teaching-assignments');
      return {
        courses: Array.isArray(response.data.courses) ? response.data.courses : [],
        departments: Array.isArray(response.data.departments) ? response.data.departments : [],
        programs: Array.isArray(response.data.programs) ? response.data.programs : [],
        currentDepartmentId: response.data.current_department_id ?? null,
        hasActiveCurriculum: response.data.has_active_curriculum ?? false,
        activeSemester: response.data.active_semester ?? null,
      };
    }, true).then((data) => {
      if (!active) return;
      setCourses(data.courses);
      setDepartments(data.departments);
      setPrograms(data.programs);
      setCurrentDepartmentId(data.currentDepartmentId);
      setHasActiveCurriculum(data.hasActiveCurriculum);
      setActiveSemester(data.activeSemester);
      setError(null);
    }).catch((loadError) => {
      if (active) setError(errorMessage(loadError, 'Unable to load course teaching assignments.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [liveRevision]);

  const ownDepartment = departments.find((department) => department.id === currentDepartmentId) ?? null;
  const availableDepartments = useMemo(() => departments, [departments]);
  const activeTarget = target && availableDepartments.some((department) => String(department.id) === target)
    ? target
    : String(availableDepartments[0]?.id ?? '');
  const targetDepartment = availableDepartments.find((department) => String(department.id) === activeTarget) ?? null;
  const targetPrograms = useMemo(
    () => programs.filter((program) => Number(program.department_id) === Number(targetDepartment?.id)),
    [programs, targetDepartment?.id],
  );
  const selectedProgram = targetPrograms.find((program) => String(program.id) === targetProgramId) ?? null;
  const effectiveTargetDepartment = selectedProgram
    ? departments.find((department) => department.id === selectedProgram.department_id) ?? targetDepartment
    : targetDepartment;

  // The curriculum's courses, split the way the page acts on them: minors are
  // selectable per year level, majors only get counted so their absence is explained.
  // The year comes from the curriculum placement, so these tabs are this
  // department's — the same subject can sit in a different year for another college.
  const byYear = useMemo(() => {
    const minors = new Map<number, CourseRow[]>();
    const majors = new Map<number, number>();

    courses.forEach((course) => {
      const year = yearOf(course);
      if (year < 1 || year > 4) return;

      if (course.delegable) {
        const bucket = minors.get(year) ?? [];
        bucket.push(course);
        minors.set(year, bucket);
        return;
      }
      majors.set(year, (majors.get(year) ?? 0) + 1);
    });

    return { minors, majors };
  }, [courses]);

  const assignedCounts = useMemo(() => {
    const counts = new Map<number, number>();
    courses.forEach((course) => {
      if (course.teaching_department_id === null) return;
      counts.set(course.teaching_department_id, (counts.get(course.teaching_department_id) ?? 0) + 1);
    });
    return counts;
  }, [courses]);

  // Opens on the first year level that has something to assign, the way the
  // Auto-Assign wizard opens on the first year level with sections.
  const firstPopulatedYear = YEAR_LEVELS.find((year) => (byYear.minors.get(year)?.length ?? 0) > 0) ?? 1;
  const activeYear = yearLevel ?? firstPopulatedYear;
  const yearCourses = byYear.minors.get(activeYear) ?? [];
  const hiddenMajors = byYear.majors.get(activeYear) ?? 0;
  const query = search.trim().toLowerCase();
  const visibleCourses = yearCourses.filter((course) => (
    (courseId === 'all' || String(course.id) === courseId)
    && (!query || `${course.course_code} ${course.course_name} ${programOf(course).code} ${programOf(course).name}`.toLowerCase().includes(query))
  ));
  const selectedCourses = courses.filter((course) => selectedIds.includes(course.id));
  const assignedInDepartment = courses.filter((course) => course.teaching_department_id !== null).length;

  const statusOf = (course: CourseRow): string => {
    if (selectedIds.includes(course.id)) return 'Selected';
    if (course.teaching_department_id !== null) {
      return `Already assigned to ${currentTeacherOf(course)}`;
    }
    if (instructorClassesOf(course) > 0) return 'Has an instructor';
    if (!effectiveTargetDepartment) return 'Select a department or program';
    return 'Available';
  };

  const toggleCourse = (course: CourseRow) => {
    const status = statusOf(course);
    if (status !== 'Available' && status !== 'Selected') return;
    setSelectedIds((current) => (
      current.includes(course.id) ? current.filter((id) => id !== course.id) : [...current, course.id]
    ));
  };

  const selectDepartment = (department: DepartmentOption) => {
    setTarget(String(department.id));
    setTargetProgramId('');
    setSelectedIds([]);
    setCourseId('all');
  };

  const selectYear = (year: number) => {
    setYearLevel(year);
    setCourseId('all');
    setSelectedIds([]);
  };

  /**
   * Only the teaching columns are merged in. The row's year level came from this
   * department's curriculum, while the saved record carries the level stored on the
   * course — replacing the row wholesale would move the course to another year tab.
   */
  const applySaved = (savedIds: number[], department: DepartmentOption, program = selectedProgram) => {
    if (savedIds.length === 0) return;

    const next = courses.map((course) => (savedIds.includes(course.id)
      ? {
        ...course,
        teaching_department_id: department.id,
        teaching_department_code: department.department_code,
        teaching_department_name: department.department_name,
        teaching_program_id: program?.id ?? null,
        teaching_program_code: program?.code ?? null,
        teaching_program_name: program ? programName(program, '') || null : null,
      }
      : course));

    setCourses(next);
    // The scheduler caches each course's teaching college for its eligibility
    // checks, so its copy is stale the moment this one changes.
    invalidateCacheGroups('schedules');
    // The live flag, not the mount-time `cached` snapshot: writing that back would
    // record "no curriculum published" for a department that has one.
    setCachedData<PageData>(cacheKey, { courses: next, departments, programs, currentDepartmentId, hasActiveCurriculum, activeSemester });
    setSelectedIds((current) => current.filter((id) => !savedIds.includes(id)));
  };

  const saveAssignments = async () => {
    if (!effectiveTargetDepartment || selectedCourses.length === 0) return;

    setSaving(true);
    const savedIds: number[] = [];

    try {
      const response = await api.post<{ course_ids?: number[] }>('/course-teaching-assignments/batch', {
        course_ids: selectedCourses.map((course) => course.id),
        teaching_department_id: effectiveTargetDepartment.id,
        teaching_program_id: selectedProgram?.id ?? null,
      });
      savedIds.push(...(response.data.course_ids ?? []));
      toast.success(
        'Assignments saved',
        `${savedIds.length} course${savedIds.length === 1 ? '' : 's'} assigned to ${selectedProgram?.code ?? effectiveTargetDepartment.department_code}.`,
      );
    } catch (saveError) {
      toast.error('Not saved', errorMessage(saveError, 'Failed to save assignments.'));
    } finally {
      // Whatever went through is kept, so a failure part-way does not leave the
      // saved courses looking unassigned.
      applySaved(savedIds, effectiveTargetDepartment);
      setSaving(false);
    }
  };

  /**
   * Clears the override, handing the course back to the derived rule: the
   * college that owns it teaches it. Only the teaching columns change, for the
   * same year-tab reason as `applySaved`.
   */
  const removeAssignment = async (course: CourseRow) => {
    if (instructorClassesOf(course) > 0) {
      toast.error('Not removed', instructorLockMessage(course));
      return;
    }
    const teacher = currentTeacherOf(course);
    const confirmed = await confirm({
      title: 'Remove teaching assignment',
      message: `${course.course_code} will no longer be handled by ${teacher}. It goes back to ${course.department_code ?? 'the department that offers it'}, and can be assigned again afterwards.`,
      eyebrow: 'Course Teaching',
      confirmLabel: 'Remove assignment',
      variant: 'danger',
    });
    if (!confirmed) return;

    setRemovingId(course.id);
    try {
      await api.delete(`/course-teaching-assignments/${course.id}`);
      const next = courses.map((row) => (row.id === course.id
        ? {
          ...row,
          teaching_department_id: null,
          teaching_department_code: null,
          teaching_department_name: null,
          teaching_program_id: null,
          teaching_program_code: null,
          teaching_program_name: null,
        }
        : row));
      setCourses(next);
      invalidateCacheGroups('schedules');
      setCachedData<PageData>(cacheKey, { courses: next, departments, programs, currentDepartmentId, hasActiveCurriculum, activeSemester });
      toast.success('Assignment removed', `${course.course_code} is no longer assigned to ${teacher}.`);
    } catch (removeError) {
      toast.error('Not removed', errorMessage(removeError, 'Failed to remove the assignment.'));
    } finally {
      setRemovingId(null);
    }
  };

  const responsibleLabel = selectedProgram?.code ?? effectiveTargetDepartment?.department_code ?? null;
  const selectedUnits = selectedCourses.reduce((sum, course) => sum + unitsOf(course), 0);
  const selectableVisible = visibleCourses.filter((course) => course.teaching_department_id === null && instructorClassesOf(course) === 0);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((course) => selectedIds.includes(course.id));
  const toggleAllVisible = () => {
    const ids = selectableVisible.map((course) => course.id);
    setSelectedIds((current) => (allVisibleSelected
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]));
  };

  // Rebuilt each render: every cell reads the live selection and target.
  const courseColumns: ColumnDef<CourseRow>[] = [
    {
      id: 'select',
      enableSorting: false,
      size: 40,
      meta: { stopRowClick: true },
      header: () => (
        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={selectableVisible.length === 0 || !effectiveTargetDepartment} aria-label="Select all unassigned courses" className="h-4 w-4 accent-[#4e0a10]" />
      ),
      cell: ({ row }) => {
        const status = statusOf(row.original);
        return (
          <input type="checkbox" checked={status === 'Selected'} disabled={status !== 'Available' && status !== 'Selected'} onChange={() => toggleCourse(row.original)} aria-label={`Select ${row.original.course_code}`} className="h-4 w-4 accent-[#4e0a10] disabled:opacity-40" />
        );
      },
    },
    {
      id: 'course',
      accessorKey: 'course_code',
      header: 'Course',
      cell: ({ row }) => (
        <>
          <p className="font-black text-slate-900">{row.original.course_code}</p>
          <p className="whitespace-nowrap font-medium text-slate-500">{row.original.course_name}</p>
        </>
      ),
    },
    {
      id: 'program',
      accessorFn: (course) => programOf(course).code,
      header: 'Program',
      cell: ({ row }) => {
        const program = programOf(row.original);
        return (
          <>
            <p className="font-bold text-slate-700">{program.code}</p>
            <p className="whitespace-nowrap text-[11px] font-medium text-slate-500">{program.name}</p>
          </>
        );
      },
    },
    { id: 'owner', accessorFn: (course) => ownerOf(course), header: 'Owner', meta: { cellClassName: 'text-slate-600' } },
    {
      id: 'taught_by',
      accessorFn: (course) => currentTeacherOf(course),
      header: 'Taught by',
      cell: ({ row }) => (row.original.teaching_department_id !== null
        ? <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">{currentTeacherOf(row.original)}</span>
        : <span className="font-medium text-slate-400">{currentTeacherOf(row.original)}</span>),
    },
    {
      id: 'units',
      accessorFn: (course) => unitsOf(course),
      header: 'Units',
      meta: { align: 'right', cellClassName: 'font-black tabular-nums text-slate-800' },
    },
    {
      id: 'status',
      accessorFn: (course) => statusOf(course),
      header: 'Status',
      cell: ({ row }) => {
        const status = statusOf(row.original);
        const selected = status === 'Selected';
        const enabled = status === 'Available' || selected;
        const assigned = row.original.teaching_department_id !== null;
        const taught = instructorClassesOf(row.original) > 0;
        return (
          <span
            title={taught ? instructorLockMessage(row.original) : undefined}
            className={`inline-flex flex-col gap-0.5 font-semibold ${selected ? 'text-[#4e0a10]' : assigned ? 'text-slate-600' : enabled ? 'text-emerald-700' : 'text-slate-500'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-[#4e0a10]' : assigned ? 'bg-amber-400' : enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {selected ? 'Selected' : assigned ? 'Assigned' : status}
            </span>
            {taught && (
              <span className="text-[11px] font-medium text-slate-500">
                Instructor in {instructorClassesOf(row.original)} {instructorClassesOf(row.original) === 1 ? 'class' : 'classes'} · locked
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      size: 80,
      meta: { align: 'right', stopRowClick: true },
      cell: ({ row }) => (
        <div className="flex justify-end">
          {row.original.teaching_department_id !== null && (
            <TableActionButton
              label={instructorClassesOf(row.original) > 0 ? instructorLockMessage(row.original) : 'Remove assignment'}
              aria-label={`Remove ${row.original.course_code} assignment`}
              variant="danger"
              onClick={() => void removeAssignment(row.original)}
              disabled={removingId !== null || saving || instructorClassesOf(row.original) > 0}
            >
              {removingId === row.original.id ? <LoadingSpinner className="h-4 w-4" /> : <Trash2 size={15} />}
            </TableActionButton>
          )}
        </div>
      ),
    },
  ];
  const courseTable = useDataTable({ data: visibleCourses, columns: courseColumns, pageSize: false, getRowId: (course) => String(course.id) });

  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4e0a10]/10 text-[#4e0a10]"><BookOpen className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black text-slate-900">Course Teaching</h1>
              <p className="truncate text-xs text-slate-500">
                {ownDepartment
                  ? `Choose which college teaches the minor courses in the ${ownDepartment.department_code} curriculum.`
                  : 'Choose which college teaches each minor course.'}
                {activeSemester && <> &middot; {fullSemesterLabel(activeSemester)}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#4e0a10]/10 px-3 py-1 text-xs font-bold text-[#4e0a10]">{assignedInDepartment} assigned</span>
            <WorkflowGuideButton guideId="course-teaching" />
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            <TriangleAlert className="h-4 w-4" />{error}
          </div>
        )}

        <div className="grid items-start gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside id="course-teaching-target" className="flex max-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-3 lg:max-h-[calc(100vh-7rem)]">
            <div className="shrink-0 border-b border-slate-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Building2 className="h-4 w-4 text-[#4e0a10]" /> Teaching college</h2>
              <p className="mt-0.5 text-xs text-slate-500">Who will teach the courses you select.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
              {loading && departments.length === 0
                ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />)
                : availableDepartments.map((department) => {
                  // A program selection is the active responsible target. Do not
                  // leave an unrelated department (such as CAS) visually checked.
                  const selected = selectedProgram === null && activeTarget === String(department.id);
                  const inTarget = activeTarget === String(department.id);
                  const assigned = assignedCounts.get(department.id) ?? 0;

                  return (
                    <button
                      key={department.id}
                      type="button"
                      onClick={() => selectDepartment(department)}
                      aria-pressed={selected}
                      className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors ${inTarget ? 'border-[#4e0a10]/40 bg-[#4e0a10]/[0.04] ring-1 ring-[#4e0a10]/20' : 'border-transparent hover:bg-slate-50'}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500">
                        {department.logo ? <img src={department.logo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900" title={department.department_name}>{department.department_name}</span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {department.department_code}
                          {department.id === currentDepartmentId ? ' · yours' : ''}
                        </span>
                      </span>
                      {assigned > 0 && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600" title={`${assigned} course${assigned === 1 ? '' : 's'} assigned`}>{assigned}</span>}
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${inTarget ? 'bg-[#4e0a10] text-white' : 'border border-slate-300'}`}>
                        {inTarget && <Check className="h-2.5 w-2.5" />}
                      </span>
                    </button>
                  );
                })}
              {!loading && availableDepartments.length === 0 && (
                <p className="p-6 text-center text-sm font-semibold text-slate-500">No departments available.</p>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-col gap-3">
            <div id="course-teaching-filters" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Year level">
                  {YEAR_LEVELS.map((year) => {
                    const count = byYear.minors.get(year)?.length ?? 0;
                    const selected = activeYear === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => selectYear(year)}
                        aria-pressed={selected}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${selected ? 'bg-white text-[#4e0a10] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        {YEAR_LABELS[year]}
                        <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${selected ? 'bg-[#4e0a10]/10 text-[#4e0a10]' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
                  Teaching college:
                  <strong className="rounded-md bg-[#4e0a10]/10 px-2 py-0.5 text-[#4e0a10]">{responsibleLabel ?? 'None selected'}</strong>
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Course"
                  value={courseId}
                  onChange={(value) => { setCourseId(value); setSelectedIds([]); }}
                  options={[['all', 'All courses'], ...yearCourses.map((course) => [String(course.id), `${course.course_code} - ${course.course_name} (${programOf(course).code})`])]}
                />
                <Select
                  label="Program (optional)"
                  value={targetProgramId}
                  onChange={(value) => { setTargetProgramId(value); setSelectedIds([]); }}
                  options={[['', `Whole ${targetDepartment?.department_code ?? 'department'}`], ...targetPrograms.map((program) => [String(program.id), programLabel(program)])]}
                />
              </div>
            </div>

            <section id="course-teaching-courses" className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-900">{YEAR_LABELS[activeYear]} minor courses</h3>
                  <p className="text-xs text-slate-500">Tick unassigned courses to give them to {responsibleLabel ?? 'the selected college'}.</p>
                </div>
                <label className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search courses" aria-label="Search courses" className="h-9 w-52 rounded-lg border border-slate-200 pl-8 pr-2 text-xs outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25" />
                </label>
              </div>

              <div className="overflow-x-auto">
                <DataTable
                  table={courseTable}
                  variant="embedded"
                  isLoading={loading}
                  tableClassName="min-w-[900px]"
                  ariaLabel={`${YEAR_LABELS[activeYear]} minor courses`}
                  onRowClick={toggleCourse}
                  rowClassName={(course) => {
                    const status = statusOf(course);
                    const enabled = status === 'Available' || status === 'Selected';
                    return `${enabled ? '' : '!cursor-default'} ${status === 'Selected' ? '!bg-[#4e0a10]/[0.04]' : ''}`;
                  }}
                  emptyState={
                    <p className="text-sm font-semibold text-slate-500">
                      {!hasActiveCurriculum
                        // The list is the curriculum's, so no published curriculum is a
                        // different problem from an empty year — and a different fix.
                        ? `${ownDepartment?.department_code ?? 'Your department'} has no active curriculum, so there are no courses to assign yet. Publish one to manage its minor courses here.`
                        : yearCourses.length === 0
                          // The list is one semester's, so name it — otherwise an empty
                          // year reads as a curriculum that is missing courses.
                          ? `No minor courses in ${YEAR_LABELS[activeYear]} of ${ownDepartment?.department_code ?? 'your department'}'s curriculum${activeSemester ? ` for ${fullSemesterLabel(activeSemester)}` : ''}.`
                          : 'No courses match this filter.'}
                    </p>
                  }
                />

              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
                <div className="min-w-0 text-xs text-slate-600">
                  <span className="font-bold text-slate-900">{selectedIds.length} selected</span>
                  <span className="tabular-nums"> &middot; {selectedUnits} unit{selectedUnits === 1 ? '' : 's'}</span>
                  {hiddenMajors > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-slate-500">
                      <Info className="h-3.5 w-3.5" />
                      {hiddenMajors} major{hiddenMajors === 1 ? '' : 's'} hidden: a major stays with the college that offers it
                    </span>
                  )}
                </div>
                <button
                  id="course-teaching-save"
                  type="button"
                  onClick={saveAssignments}
                  disabled={!selectedIds.length || saving || !effectiveTargetDepartment}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : selectedIds.length ? `Assign ${selectedIds.length} to ${responsibleLabel ?? 'college'}` : 'Save Assignments'}
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
