import { buttonClass } from '../../components/ui/buttonStyles';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { BookOpen, Building2, Check, ChevronRight, Info, Lock, Save, TriangleAlert, X } from 'lucide-react';
import api from '../../lib/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
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
import './CourseTeachingAssignments.css';
import SearchInput from '../../components/ui/SearchInput';

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
  program_id?: number | null;
  program_code?: string | null;
  program_name?: string | null;
  program_major?: string | null;
  curriculum_program_id?: number | null;
  curriculum_program_code?: string | null;
  curriculum_program_name?: string | null;
  curriculum_program_major?: string | null;
  delegable: boolean;
  is_major?: boolean;
  instructor_assigned_classes?: number;
  section_assignments?: SectionAssignment[];
}
interface SectionAssignment {
  section_id: number;
  section_name: string;
  instructor_name: string | null;
  status: 'Assigned' | 'Partially assigned' | 'Awaiting instructor' | string;
}
/** Section chip styling per status: a coloured dot carries the state, the chip stays quiet. */
const SECTION_STATUS_STYLES: Record<string, { dot: string; chip: string }> = {
  Assigned: { dot: 'bg-emerald-500', chip: 'border-slate-200 bg-white text-slate-700' },
  'Partially assigned': { dot: 'bg-amber-500', chip: 'border-amber-200 bg-amber-50 text-amber-900' },
  'Awaiting instructor': { dot: 'bg-slate-300', chip: 'border-dashed border-slate-300 bg-slate-50 text-slate-500' },
};
const sectionStyleOf = (status: string) => SECTION_STATUS_STYLES[status] ?? SECTION_STATUS_STYLES['Awaiting instructor'];
/**
 * Mirrors the backend rule (CourseTeachingAssignmentController::targetRestrictions):
 * Program Heads and the department office never give their department's courses to
 * their own program, and a single-program department is not a target at all. The
 * backend enforces it on every write; this only keeps invalid targets out of reach.
 */
interface AssignmentRestrictions {
  department_id: number;
  own_program_ids: number[];
  own_department_excluded: boolean;
  requires_program: boolean;
}
interface PageData {
  courses: CourseRow[];
  departments: DepartmentOption[];
  programs: { id: number; department_id: number; code: string; name?: string | null; major?: string | null }[];
  currentDepartmentId: number | null;
  hasActiveCurriculum: boolean;
  activeSemester: ActiveSemester | null;
  restrictions: AssignmentRestrictions | null;
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
  assignment_restrictions?: AssignmentRestrictions | null;
}

const cacheKey = 'page:course-teaching-assignments:v13';

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

const instructorClassesOf = (course: CourseRow) => Number(course.instructor_assigned_classes ?? 0) || 0;
const instructorLockMessage = (course: CourseRow) => {
  const classes = instructorClassesOf(course);
  return `${course.course_code} already has an instructor in ${classes} ${classes === 1 ? 'class' : 'classes'} this semester. Remove those instructor assignments before changing who teaches it.`;
};

const currentTeacherOf = (course: CourseRow) =>
  course.teaching_program_code
  ?? course.teaching_department_code
  ?? (course.department_code ? `${course.department_code} (origin department)` : 'Not yet assigned');

export default function CourseTeachingAssignments() {
  const { toast, confirm } = useToast();
  const cached = getCachedData<PageData>(cacheKey);
  const [courses, setCourses] = useState<CourseRow[]>(cached?.courses ?? []);
  const [departments, setDepartments] = useState<DepartmentOption[]>(cached?.departments ?? []);
  const [programs, setPrograms] = useState<PageData['programs']>(cached?.programs ?? []);
  const [currentDepartmentId, setCurrentDepartmentId] = useState<number | null>(cached?.currentDepartmentId ?? null);
  const [hasActiveCurriculum, setHasActiveCurriculum] = useState(cached?.hasActiveCurriculum ?? true);
  const [activeSemester, setActiveSemester] = useState<ActiveSemester | null>(cached?.activeSemester ?? null);
  const [restrictions, setRestrictions] = useState<AssignmentRestrictions | null>(cached?.restrictions ?? null);
  const [target, setTarget] = useState<string | null>(null);
  const [targetProgramId, setTargetProgramId] = useState('');
  const [yearLevel, setYearLevel] = useState<number | null>(null);
  const [courseId, setCourseId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

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
        restrictions: response.data.assignment_restrictions ?? null,
      };
    }, true).then((data) => {
      if (!active) return;
      setCourses(data.courses);
      setDepartments(data.departments);
      setPrograms(data.programs);
      setCurrentDepartmentId(data.currentDepartmentId);
      setHasActiveCurriculum(data.hasActiveCurriculum);
      setActiveSemester(data.activeSemester);
      setRestrictions(data.restrictions);
      setError(null);
    }).catch((loadError) => {
      if (active) setError(errorMessage(loadError, 'Unable to load course teaching assignments.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [liveRevision]);

  const ownDepartment = departments.find((department) => department.id === currentDepartmentId) ?? null;
  const availableDepartments = useMemo(
    () => (restrictions?.own_department_excluded
      ? departments.filter((department) => department.id !== restrictions.department_id)
      : departments),
    [departments, restrictions],
  );
  const activeTarget = target && availableDepartments.some((department) => String(department.id) === target)
    ? target
    : String(availableDepartments[0]?.id ?? '');
  const targetDepartment = availableDepartments.find((department) => String(department.id) === activeTarget) ?? null;
  // Targeting one's own department: own programs are never offered, and "Any Program"
  // is not allowed because it would include them.
  const ownTargetRestricted = Boolean(restrictions?.requires_program && targetDepartment?.id === restrictions.department_id);
  const targetPrograms = useMemo(
    () => programs.filter((program) => Number(program.department_id) === Number(targetDepartment?.id)
      && !(restrictions?.own_program_ids ?? []).includes(program.id)),
    [programs, targetDepartment?.id, restrictions],
  );
  // With only one eligible program there is nothing to choose, so it is selected automatically.
  const onlyProgram = targetPrograms.length === 1 ? targetPrograms[0] : null;
  const selectedProgram = targetPrograms.find((program) => String(program.id) === targetProgramId) ?? onlyProgram;
  const effectiveTargetDepartment = selectedProgram
    ? departments.find((department) => department.id === selectedProgram.department_id) ?? targetDepartment
    : targetDepartment;

  const byYear = useMemo(() => {
    const years = new Map<number, CourseRow[]>();

    courses.forEach((course) => {
      const year = yearOf(course);
      if (year < 1 || year > 4) return;
      const bucket = years.get(year) ?? [];
      bucket.push(course);
      years.set(year, bucket);
    });

    return years;
  }, [courses]);

  const assignedCounts = useMemo(() => {
    const counts = new Map<number, number>();
    courses.forEach((course) => {
      if (course.teaching_department_id === null) return;
      counts.set(course.teaching_department_id, (counts.get(course.teaching_department_id) ?? 0) + 1);
    });
    return counts;
  }, [courses]);

  const firstPopulatedYear = YEAR_LEVELS.find((year) => (byYear.get(year)?.length ?? 0) > 0) ?? 1;
  const activeYear = yearLevel ?? firstPopulatedYear;
  const yearCourses = byYear.get(activeYear) ?? [];
  const query = search.trim().toLowerCase();
  const visibleCourses = yearCourses.filter((course) => (
    (courseId === 'all' || String(course.id) === courseId)
    && (!query || `${course.course_code} ${course.course_name} ${programOf(course).code} ${programOf(course).name}`.toLowerCase().includes(query))
  ));
  const selectedCourses = courses.filter((course) => selectedIds.includes(course.id));
  const assignedInDepartment = courses.filter((course) => course.teaching_department_id !== null).length;

  // Assigned courses grouped by the college that teaches them, for the summary dialog.
  const assignedSummary = useMemo(() => {
    const groups = new Map<number, { department: DepartmentOption | null; code: string; name: string; courses: CourseRow[] }>();
    courses.forEach((course) => {
      if (course.teaching_department_id === null) return;
      const department = departments.find((item) => item.id === course.teaching_department_id) ?? null;
      const group = groups.get(course.teaching_department_id) ?? {
        department,
        code: course.teaching_department_code ?? department?.department_code ?? '—',
        name: course.teaching_department_name ?? department?.department_name ?? 'Unknown college',
        courses: [],
      };
      group.courses.push(course);
      groups.set(course.teaching_department_id, group);
    });
    return [...groups.values()]
      .map((group) => ({
        ...group,
        courses: [...group.courses].sort((a, b) => yearOf(a) - yearOf(b) || a.course_code.localeCompare(b.course_code)),
        units: group.courses.reduce((sum, course) => sum + unitsOf(course), 0),
      }))
      .sort((a, b) => b.courses.length - a.courses.length || a.code.localeCompare(b.code));
  }, [courses, departments]);
  const assignedUnits = assignedSummary.reduce((sum, group) => sum + group.units, 0);

  const statusOf = (course: CourseRow): string => {
    if (selectedIds.includes(course.id)) return 'Selected';
    if (course.teaching_department_id !== null) {
      return `Already assigned to ${currentTeacherOf(course)}`;
    }
    if (instructorClassesOf(course) > 0) return 'Has an instructor';
    if (!effectiveTargetDepartment) return 'Select a department or program';
    if (ownTargetRestricted && !selectedProgram
      && (course.department_id == null || course.department_id === restrictions?.department_id)) return 'Select another program';
    if (course.is_major && course.department_id != null && Number(effectiveTargetDepartment.id) === Number(course.department_id)) {
      if (!selectedProgram) return 'Select a program for majors';
      if (selectedProgram.id === (course.curriculum_program_id ?? course.program_id)) return 'Already its program';
    }
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
    invalidateCacheGroups('schedules');
    setCachedData<PageData>(cacheKey, { courses: next, departments, programs, currentDepartmentId, hasActiveCurriculum, activeSemester, restrictions });
    setSelectedIds((current) => current.filter((id) => !savedIds.includes(id)));
  };

  const saveAssignments = async () => {
    if (!effectiveTargetDepartment || selectedCourses.length === 0 || (ownTargetRestricted && !selectedProgram)) return;

    const target = selectedProgram?.code ?? effectiveTargetDepartment.department_name ?? effectiveTargetDepartment.department_code;
    const codes = selectedCourses.map((course) => course.course_code);
    const listed = codes.length > 5 ? `${codes.slice(0, 5).join(', ')} and ${codes.length - 5} more` : codes.join(', ');
    const confirmed = await confirm({
      title: 'Confirm teaching assignment',
      message: `Are you sure you want ${codes.length === 1 ? 'this course' : `these ${codes.length} courses`} (${listed}) to be taught by ${target}? Its instructors will handle ${codes.length === 1 ? 'it' : 'them'} until the assignment is removed.`,
      eyebrow: 'Course Teaching',
      confirmLabel: 'Assign',
      variant: 'warning',
    });
    if (!confirmed) return;

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
      applySaved(savedIds, effectiveTargetDepartment);
      setSaving(false);
    }
  };

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
      setCachedData<PageData>(cacheKey, { courses: next, departments, programs, currentDepartmentId, hasActiveCurriculum, activeSemester, restrictions });
      toast.success('Assignment removed', `${course.course_code} is no longer assigned to ${teacher}.`);
    } catch (removeError) {
      toast.error('Not removed', errorMessage(removeError, 'Failed to remove the assignment.'));
    } finally {
      setRemovingId(null);
    }
  };

  const removableAssigned = courses.filter((course) => course.teaching_department_id !== null && instructorClassesOf(course) === 0);
  const lockedAssigned = courses.filter((course) => course.teaching_department_id !== null && instructorClassesOf(course) > 0);

  const removeAllAssignments = async () => {
    if (removableAssigned.length === 0) return;
    const count = removableAssigned.length;
    const lockedNote = lockedAssigned.length
      ? ` ${lockedAssigned.length} course${lockedAssigned.length === 1 ? '' : 's'} with an instructor already assigned will be kept.`
      : '';
    const confirmed = await confirm({
      title: 'Remove all teaching assignments',
      message: `${count === 1 ? 'This course' : `All ${count} courses`} will go back to the department that offers ${count === 1 ? 'it' : 'them'}, and can be assigned again afterwards.${lockedNote}`,
      eyebrow: 'Course Teaching',
      confirmLabel: 'Remove all',
      variant: 'danger',
    });
    if (!confirmed) return;

    setRemovingAll(true);
    try {
      const response = await api.post<{ course_ids?: number[]; locked_course_ids?: number[] }>('/course-teaching-assignments/batch-remove', {
        course_ids: removableAssigned.map((course) => course.id),
      });
      const removedIds = response.data.course_ids ?? [];
      const next = courses.map((row) => (removedIds.includes(row.id)
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
      setCachedData<PageData>(cacheKey, { courses: next, departments, programs, currentDepartmentId, hasActiveCurriculum, activeSemester, restrictions });
      const skipped = response.data.locked_course_ids?.length ?? 0;
      toast.success(
        'Assignments removed',
        `${removedIds.length} course${removedIds.length === 1 ? '' : 's'} returned to ${removedIds.length === 1 ? 'its' : 'their'} origin department.${skipped ? ` ${skipped} kept because an instructor is already assigned.` : ''}`,
      );
    } catch (removeError) {
      toast.error('Not removed', errorMessage(removeError, 'Failed to remove the assignments.'));
    } finally {
      setRemovingAll(false);
    }
  };

  const responsibleLabel = selectedProgram?.code ?? effectiveTargetDepartment?.department_code ?? null;
  const selectedUnits = selectedCourses.reduce((sum, course) => sum + unitsOf(course), 0);
  const selectableVisible = visibleCourses.filter((course) => ['Available', 'Selected'].includes(statusOf(course)));
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((course) => selectedIds.includes(course.id));
  const toggleAllVisible = () => {
    const ids = selectableVisible.map((course) => course.id);
    setSelectedIds((current) => (allVisibleSelected
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]));
  };

  const courseColumns: ColumnDef<CourseRow>[] = [
    {
      id: 'select',
      enableSorting: false,
      size: 40,
      meta: { stopRowClick: true, align: 'center' },
      header: () => (
        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={selectableVisible.length === 0 || !effectiveTargetDepartment} aria-label="Select all unassigned courses" className="h-4 w-4 cursor-pointer accent-[#C9952A] disabled:cursor-not-allowed disabled:opacity-40" />
      ),
      cell: ({ row }) => {
        const status = statusOf(row.original);
        return (
          <input type="checkbox" checked={status === 'Selected'} disabled={status !== 'Available' && status !== 'Selected'} onChange={() => toggleCourse(row.original)} aria-label={`Select ${row.original.course_code}`} className="h-4 w-4 cursor-pointer accent-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-30" />
        );
      },
    },
    {
      id: 'course',
      accessorKey: 'course_code',
      header: 'Course',
      meta: { headerClassName: 'course-teaching-col-course' },
      cell: ({ row }) => (
        <div className="min-w-0 leading-5">
          <p className="truncate text-[13px] font-bold text-slate-900">{row.original.course_code}</p>
          <p className="line-clamp-2 text-xs font-medium text-slate-500" title={row.original.course_name}>{row.original.course_name}</p>
        </div>
      ),
    },
    {
      id: 'program',
      accessorFn: (course) => programOf(course).code,
      header: 'Program',
      meta: { headerClassName: 'course-teaching-col-program' },
      cell: ({ row }) => {
        const program = programOf(row.original);
        return (
          <div className="min-w-0 leading-5">
            <p className="truncate text-xs font-bold text-slate-700">{program.code}</p>
            <p className="line-clamp-2 text-xs font-medium text-slate-500" title={program.name}>{program.name}</p>
          </div>
        );
      },
    },
    {
      id: 'owner',
      accessorFn: (course) => ownerOf(course),
      header: 'Origin',
      meta: { headerClassName: 'course-teaching-col-owner', cellClassName: 'text-xs font-semibold text-slate-600' },
    },
    {
      id: 'taught_by',
      accessorFn: (course) => currentTeacherOf(course),
      header: 'Taught by',
      meta: { headerClassName: 'course-teaching-col-teacher' },
      cell: ({ row }) => (row.original.teaching_department_id !== null
        ? <span className="inline-flex max-w-full truncate rounded-md border border-[#4e0a10]/15 bg-[#4e0a10]/[0.06] px-2 py-0.5 text-xs font-bold leading-5 text-[#4e0a10]" title={row.original.teaching_program_name ?? row.original.teaching_department_name ?? undefined}>{currentTeacherOf(row.original)}</span>
        : <span className="text-xs font-medium leading-5 text-slate-400">{currentTeacherOf(row.original)}</span>),
    },
    {
      id: 'units',
      accessorFn: (course) => unitsOf(course),
      header: 'Units',
      size: 68,
      meta: { align: 'center', cellClassName: 'text-[13px] font-bold tabular-nums text-slate-800' },
    },
    {
      id: 'status',
      accessorFn: (course) => statusOf(course),
      header: 'Status',
      meta: { headerClassName: 'course-teaching-col-status' },
      cell: ({ row }) => {
        const status = statusOf(row.original);
        const assigned = row.original.teaching_department_id !== null;
        const classes = instructorClassesOf(row.original);
        const lockNote = classes > 0 ? `Instructor in ${classes} ${classes === 1 ? 'class' : 'classes'}` : null;
        if (status === 'Selected') return <StatusPill tone="selected" label="Selected" />;
        if (assigned) return <StatusPill tone="assigned" label="Assigned" note={lockNote ? `${lockNote} · locked` : null} title={lockNote ? instructorLockMessage(row.original) : undefined} locked={Boolean(lockNote)} />;
        if (lockNote) return <StatusPill tone="locked" label="Locked" note={lockNote} title={instructorLockMessage(row.original)} locked />;
        return <StatusPill tone="unassigned" label="Unassigned" note={status === 'Available' ? null : status} muted={status !== 'Available'} />;
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      size: 52,
      meta: { align: 'right', stopRowClick: true },
      cell: ({ row }) => (
        <div className="flex justify-end">
          {row.original.teaching_department_id !== null && (
            <TableActionButton
              label={instructorClassesOf(row.original) > 0 ? instructorLockMessage(row.original) : 'Remove assignment'}
              aria-label={`Remove ${row.original.course_code} assignment`}
              variant="remove"
              onClick={() => void removeAssignment(row.original)}
              disabled={removingId !== null || removingAll || saving || instructorClassesOf(row.original) > 0}
            >
              {removingId === row.original.id ? <LoadingSpinner className="h-4 w-4" /> : <X size={15} />}
            </TableActionButton>
          )}
        </div>
      ),
    },
  ];
  const courseTable = useDataTable({ data: visibleCourses, columns: courseColumns, pageSize: false, getRowId: (course) => String(course.id) });

  useWorkflowGuide({
    id: 'course-teaching', isReady: !loading, mission: 'Assign Course Teaching',
    variant: summaryOpen ? 'summary' : error ? 'unavailable' : !hasActiveCurriculum ? 'no-curriculum' : visibleCourses.length ? 'courses' : 'empty',
    steps: () => {
      if (summaryOpen) return [{ id: 'summary', element: '.course-teaching-summary', title: 'Review saved assignments', description: 'This summary shows saved teaching assignments by college or program. It does not include unsaved checkbox selections.' }];
      if (error) return [{ id: 'unavailable', element: '#course-teaching-page', title: 'Assignments could not be refreshed', description: 'Course and department information may be missing or outdated. Reload the page to retry before assigning courses.' }];
      if (!hasActiveCurriculum || availableDepartments.length === 0) return [{ id: 'prerequisites', element: '#course-teaching-courses', title: 'Course assignment setup is required', description: !hasActiveCurriculum ? 'Your department needs an active curriculum before its courses can be assigned. Publish a curriculum, then return to this page.' : 'No teaching colleges are available. Complete department setup, then reload this page.' }];
      return [
        { id: 'target', element: '#course-teaching-target', title: 'Check the teaching college', description: 'The selected college will teach the courses you choose. Changing the college clears unsaved course selections; keep the current choice while reviewing help if you have work in progress.' },
        { id: 'year', element: '#course-teaching-year', title: 'Work on one year level', description: 'These year buttons show how many curriculum courses belong to each year. Changing the year clears unsaved selections.' },
        { id: 'course-filter', element: '#course-teaching-course-filter', title: 'Filter by course', description: 'Choose one course or All courses. Changing this filter clears unsaved selections; the search field can narrow the visible rows further.' },
        { id: 'program', element: '#course-teaching-program', title: 'Check the teaching program', description: 'Teaching Program is optional for a college assignment. A major taught within its own college needs a specific receiving program. Changing this choice clears unsaved selections.' },
        { id: 'courses', element: '#course-teaching-courses', title: visibleCourses.length ? 'Review selectable courses' : 'No courses match', description: visibleCourses.length ? 'Checkboxes select eligible courses without saving. Assigned or instructor-locked courses cannot be selected. Check the selected count before saving; search may hide selected rows.' : 'Try another year, course or search. Assigned and instructor-locked courses cannot be assigned again through the checkboxes.' },
        { id: 'save', element: '#course-teaching-save', title: 'Save only when ready', description: 'Save assigns the selected courses to the chosen college or program. It stays disabled without an eligible selection. Finishing help does not save, remove or reassign courses; your current selections remain available.' },
      ];
    },
  });

  return (
    <div id="course-teaching-page" className="w-full">
      <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4e0a10]/10 text-[#4e0a10]"><BookOpen className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black text-slate-900">Course Teaching</h1>
              <p className="truncate text-xs text-slate-500">
                {ownDepartment
                  ? `Choose which college or program teaches the courses in the ${ownDepartment.department_code} curriculum.`
                  : 'Choose which college teaches each minor course.'}
                {activeSemester && <> &middot; {fullSemesterLabel(activeSemester)}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              aria-haspopup="dialog"
              title="View a summary of assigned courses"
              className={buttonClass({ variant: 'accentSoft', size: 'md', className: 'relative' })}
            >
              {assignedInDepartment > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-white bg-amber-400" />
                </span>
              )}
              <span className="rounded-full bg-[#4e0a10] px-1.5 text-[10px] tabular-nums text-white">{assignedInDepartment}</span>
              Assigned
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <WorkflowGuideButton guideId="course-teaching" />
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            <TriangleAlert className="h-4 w-4" />{error}
          </div>
        )}

        <div className="grid gap-3 lg:h-[calc(100dvh-13rem)] lg:min-h-[520px] lg:grid-cols-[288px_minmax(0,1fr)]">
          <aside id="course-teaching-target" className="flex max-h-72 min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:max-h-none">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Building2 className="h-4 w-4 text-[#4e0a10]" /> Teaching college</h2>
                <p className="mt-0.5 text-xs text-slate-500">Who will teach the courses you select.</p>
              </div>
              {availableDepartments.length > 0 && (
                <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{availableDepartments.length}</span>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
              {loading && departments.length === 0
                ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-[60px] animate-pulse rounded-lg bg-slate-100" />)
                : availableDepartments.map((department) => {
                  const selected = activeTarget === String(department.id);
                  const inTarget = activeTarget === String(department.id);
                  const assigned = assignedCounts.get(department.id) ?? 0;

                  return (
                    <button
                      key={department.id}
                      type="button"
                      onClick={() => selectDepartment(department)}
                      aria-pressed={selected}
                      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]/50 ${inTarget ? 'border-[#4e0a10]/25 bg-[#4e0a10]/[0.045]' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] transition-colors ${inTarget ? 'bg-[#4e0a10]' : 'bg-transparent'}`} />
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white text-slate-400 ${inTarget ? 'border-[#4e0a10]/20' : 'border-slate-200'}`}>
                        {department.logo ? <img src={department.logo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[13px] font-semibold leading-[18px] ${inTarget ? 'text-[#4e0a10]' : 'text-slate-900'}`}>{department.department_name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-4">
                          <span className="font-bold tracking-wide text-slate-500">{department.department_code}</span>
                          {department.id === currentDepartmentId && (
                            <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">Yours</span>
                          )}
                          {assigned > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-bold tabular-nums text-amber-800" title={`${assigned} course${assigned === 1 ? '' : 's'} assigned`}>
                              {assigned} assigned
                            </span>
                          )}
                        </span>
                      </span>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${inTarget ? 'bg-[#4e0a10] text-white' : 'border border-slate-300 bg-white group-hover:border-slate-400'}`}>
                        {inTarget && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              {!loading && availableDepartments.length === 0 && (
                <p className="p-6 text-center text-sm font-semibold text-slate-500">No departments available.</p>
              )}
              {restrictions?.own_department_excluded && ownDepartment && (
                <p className="flex items-start gap-1.5 px-2 py-2 text-[11px] leading-4 text-slate-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {ownDepartment.department_code} is not listed: its courses are managed within the department.
                </p>
              )}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col gap-3">
            <div id="course-teaching-filters" className="flex shrink-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div id="course-teaching-year" className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Year level">
                  {YEAR_LEVELS.map((year) => {
                    const count = byYear.get(year)?.length ?? 0;
                    const selected = activeYear === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => selectYear(year)}
                        aria-pressed={selected}
                        className={`selection-indicator inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-bold transition-colors ${selected ? 'shadow-sm' : `border-transparent bg-transparent hover:bg-white hover:text-slate-900 ${count === 0 ? 'text-slate-400' : 'text-slate-600'}`}`}
                      >
                        {YEAR_LABELS[year]}
                        <span className="selection-indicator-count min-w-[1.375rem] rounded-full px-1.5 py-0.5 text-center text-[10px] leading-none tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  id="course-teaching-remove-all"
                  type="button"
                  onClick={() => void removeAllAssignments()}
                  disabled={removableAssigned.length === 0 || removingAll || removingId !== null || saving}
                  title={lockedAssigned.length > 0
                    ? `${lockedAssigned.length} course${lockedAssigned.length === 1 ? ' has' : 's have'} an instructor and will be kept.`
                    : 'Return every assigned course to its origin department.'}
                  className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-slate-500"
                >
                  {removingAll ? <LoadingSpinner className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {removingAll ? 'Removing...' : `Remove all (${removableAssigned.length})`}
                </button>
              </div>
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <Select
                  id="course-teaching-course-filter"
                  label="Course"
                  value={courseId}
                  onChange={(value) => { setCourseId(value); setSelectedIds([]); }}
                  options={[['all', 'All courses'], ...yearCourses.map((course) => [String(course.id), `${course.course_code} - ${course.course_name} (${programOf(course).code})`])]}
                />
                <Select
                  id="course-teaching-program"
                  label="Teaching Program (Optional)"
                  description="Select a program, or allow the college to choose an instructor."
                  value={selectedProgram ? String(selectedProgram.id) : ''}
                  onChange={(value) => { setTargetProgramId(value); setSelectedIds([]); }}
                  disabled={onlyProgram !== null}
                  options={onlyProgram
                    ? [[String(onlyProgram.id), programLabel(onlyProgram)]]
                    : [['', ownTargetRestricted ? 'Select a program' : 'Any Program'], ...targetPrograms.map((program) => [String(program.id), programLabel(program)])]}
                />
              </div>
            </div>

            <section id="course-teaching-courses" className="course-teaching-courses flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
                    {YEAR_LABELS[activeYear]} courses
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{visibleCourses.length}</span>
                  </h3>
                  <p className="text-xs text-slate-500">Tick unassigned courses to give them to {responsibleLabel ?? 'the selected college'}.</p>
                </div>
                <SearchInput
                  compact
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search courses"
                  aria-label="Search courses"
                  containerClassName="relative w-full sm:w-56"
                />
              </div>

              <DataTable
                table={courseTable}
                variant="embedded"
                density="compact"
                className="flex min-h-0 flex-1 flex-col"
                tableClassName="course-teaching-table table-fixed"
                scrollClassName="min-h-0 flex-1 overflow-auto overscroll-contain max-lg:max-h-[65vh] [scrollbar-width:thin]"
                scrollAriaLabel="Course teaching assignments"
                isLoading={loading}
                ariaLabel={`${YEAR_LABELS[activeYear]} courses`}
                onRowClick={toggleCourse}
                rowClassName={(course) => {
                  const status = statusOf(course);
                  const enabled = status === 'Available' || status === 'Selected';
                  return `${enabled ? '' : '!cursor-default'} ${status === 'Selected' ? 'course-teaching-row-selected' : ''}`;
                }}
                emptyState={
                  <p className="text-sm font-semibold text-slate-500">
                    {!hasActiveCurriculum
                      ? `${ownDepartment?.department_code ?? 'Your department'} has no active curriculum, so there are no courses to assign yet. Publish one to manage its minor courses here.`
                      : yearCourses.length === 0
                        ? `No courses in ${YEAR_LABELS[activeYear]} of ${ownDepartment?.department_code ?? 'your department'}'s curriculum${activeSemester ? ` for ${fullSemesterLabel(activeSemester)}` : ''}.`
                        : 'No courses match this filter.'}
                  </p>
                }
              />

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${selectedIds.length ? 'bg-[#4e0a10] text-white' : 'bg-slate-200 text-slate-600'}`}>{selectedIds.length}</span>
                    <span className="font-semibold text-slate-900">selected</span>
                    <span className="tabular-nums text-slate-500">&middot; {selectedUnits} unit{selectedUnits === 1 ? '' : 's'}</span>
                  </span>
                  {yearCourses.some((course) => course.is_major) && (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      Within its own college, a major needs a specific program
                    </span>
                  )}
                </div>
                <button
                  id="course-teaching-save"
                  type="button"
                  onClick={saveAssignments}
                  disabled={!selectedIds.length || saving || !effectiveTargetDepartment}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4e0a10] px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#3a0809] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {saving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : selectedIds.length ? `Assign ${selectedIds.length} to ${responsibleLabel ?? 'college'}` : 'Save Assignments'}
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>

      <Modal
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Assigned courses"
        className="course-teaching-summary sm:!max-h-[85vh]"
        description={`${assignedInDepartment} course${assignedInDepartment === 1 ? '' : 's'} · ${assignedUnits} unit${assignedUnits === 1 ? '' : 's'} across ${assignedSummary.length} college${assignedSummary.length === 1 ? '' : 's'}${activeSemester ? ` · ${fullSemesterLabel(activeSemester)}` : ''}`}
        size="wide"
        bodyClassName="[scrollbar-width:thin] overscroll-contain"
      >
        <AssignedCoursesSummary groups={assignedSummary} />
      </Modal>
    </div>
  );
}

function Select({ id, label, description, value, onChange, options, disabled = false }: { id: string; label: string; description?: string; value: string; onChange: (value: string) => void; options: string[][]; disabled?: boolean }) {
  const descriptionId = useId();
  return (
    <div className="min-w-0">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
        <select id={id} value={value} disabled={disabled} aria-describedby={description ? descriptionId : undefined} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full cursor-pointer rounded-lg disabled:cursor-default disabled:bg-slate-50 border border-slate-200 bg-white px-3 text-[13px] font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/25">
          {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
        </select>
      </label>
      {description && <p id={descriptionId} className="mt-1 truncate text-[11px] leading-4 text-slate-500" title={description}>{description}</p>}
    </div>
  );
}

const STATUS_PILL_TONES = {
  unassigned: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  assigned: { pill: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  locked: { pill: 'border-slate-200 bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  selected: { pill: 'border-[#4e0a10]/20 bg-[#4e0a10]/[0.07] text-[#4e0a10]', dot: 'bg-[#4e0a10]' },
} as const;

/** One status vocabulary for the course table: Unassigned, Assigned, Locked, Selected. */
function StatusPill({ tone, label, note, title, locked = false, muted = false }: {
  tone: keyof typeof STATUS_PILL_TONES;
  label: string;
  note?: string | null;
  title?: string;
  locked?: boolean;
  muted?: boolean;
}) {
  const styles = muted ? STATUS_PILL_TONES.locked : STATUS_PILL_TONES[tone];
  return (
    <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-0.5" title={title}>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4 ${styles.pill}`}>
        {locked && tone === 'locked'
          ? <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          : <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />}
        {label}
      </span>
      {note && (
        <span className="inline-flex max-w-full items-center gap-1 text-[11px] font-medium leading-4 text-slate-500">
          {locked && tone !== 'locked' && <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />}
          <span className="truncate">{note}</span>
        </span>
      )}
    </span>
  );
}

interface SummaryGroup {
  department: DepartmentOption | null;
  code: string;
  name: string;
  courses: CourseRow[];
  units: number;
}

const compareNatural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const tallySections = (courses: CourseRow[]) => courses.reduce((tally, course) => {
  (course.section_assignments ?? []).forEach((section) => {
    tally.total += 1;
    if (section.status === 'Assigned') tally.assigned += 1;
    else if (section.status === 'Partially assigned') tally.partial += 1;
    else tally.awaiting += 1;
  });
  return tally;
}, { total: 0, assigned: 0, partial: 0, awaiting: 0 });

const initialsOf = (name: string) => name
  .replace(/[^A-Za-z\s.-]/g, '')
  .split(/[\s.-]+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || '?';

/** Sections of one course gathered under their instructor; sections still awaiting one come last. */
const sectionsByInstructor = (sections: SectionAssignment[]) => {
  const groups = new Map<string | null, SectionAssignment[]>();
  sections.forEach((section) => {
    const key = section.instructor_name?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), section]);
  });
  return [...groups.entries()]
    .map(([instructor, items]) => ({ instructor, sections: [...items].sort((a, b) => compareNatural(a.section_name, b.section_name)) }))
    .sort((a, b) => (a.instructor === null ? 1 : b.instructor === null ? -1 : compareNatural(a.instructor, b.instructor)));
};

function StaffingMeter({ staffed, total }: { staffed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((staffed / total) * 100);
  return (
    <span className="inline-flex items-center gap-1.5" title={`${staffed} of ${total} section${total === 1 ? '' : 's'} have an instructor`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <span className={`block h-full rounded-full ${percent === 100 ? 'bg-emerald-500' : 'bg-[#C9952A]'}`} style={{ width: `${percent}%` }} />
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-slate-600">{staffed}/{total}</span>
      <span className="sr-only">sections have an instructor</span>
    </span>
  );
}

function SectionChip({ section }: { section: SectionAssignment }) {
  const style = sectionStyleOf(section.status);
  return (
    <li
      className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold ${style.chip}`}
      title={`${section.section_name} · ${section.status}${section.instructor_name ? ` · ${section.instructor_name}` : ''}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
      {section.section_name}
      <span className="sr-only">, {section.status}</span>
    </li>
  );
}

function AssignedCourseRow({ course }: { course: CourseRow }) {
  const sections = course.section_assignments ?? [];
  const tally = tallySections([course]);
  const groups = sectionsByInstructor(sections);
  const units = unitsOf(course);

  return (
    <li className="grid gap-x-5 gap-y-2 px-4 py-3 md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold text-slate-900">{course.course_code}</span>
          {course.teaching_program_code && (
            <span className="rounded bg-[#4e0a10]/[0.07] px-1.5 py-px text-[10px] font-bold text-[#4e0a10]" title="Teaching program">{course.teaching_program_code}</span>
          )}
        </div>
        <p className="truncate text-xs text-slate-600" title={course.course_name}>{course.course_name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
          <span>{YEAR_LABELS[yearOf(course)] ?? 'No year level'}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{units} {units === 1 ? 'unit' : 'units'}</span>
          {tally.total > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <StaffingMeter staffed={tally.assigned + tally.partial} total={tally.total} />
            </>
          )}
        </p>
      </div>

      {sections.length === 0 ? (
        <p className="self-center text-xs italic text-slate-400">No sections scheduled yet</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-1.5" aria-label={`${course.course_code} sections`}>
          {groups.map(({ instructor, sections: items }) => (
            <li key={instructor ?? '__awaiting'} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <span className="flex min-w-0 items-center gap-2 sm:w-52 sm:shrink-0 sm:pt-0.5">
                {instructor ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4e0a10]/10 text-[10px] font-bold text-[#4e0a10]" aria-hidden="true">{initialsOf(instructor)}</span>
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-slate-300" aria-hidden="true" />
                )}
                <span className={`truncate text-xs ${instructor ? 'font-semibold text-slate-800' : 'italic text-slate-500'}`} title={instructor ?? undefined}>
                  {instructor ?? 'Awaiting instructor'}
                </span>
                {items.length > 1 && <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">×{items.length}</span>}
              </span>
              <ul className="flex min-w-0 flex-wrap gap-1">
                {items.map((section) => <SectionChip key={section.section_id} section={section} />)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AssignedCoursesSummary({ groups }: { groups: SummaryGroup[] }) {
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const overall = useMemo(() => tallySections(groups.flatMap((group) => group.courses)), [groups]);

  if (groups.length === 0) {
    return (
      <div className="p-4 sm:p-5">
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          No courses are assigned to another college or program yet.
        </p>
      </div>
    );
  }

  const stats = [
    { label: 'Sections', value: overall.total, dot: null },
    { label: 'Assigned', value: overall.assigned, dot: SECTION_STATUS_STYLES.Assigned.dot },
    ...(overall.partial > 0 ? [{ label: 'Partially assigned', value: overall.partial, dot: SECTION_STATUS_STYLES['Partially assigned'].dot }] : []),
    { label: 'Awaiting instructor', value: overall.awaiting, dot: SECTION_STATUS_STYLES['Awaiting instructor'].dot },
  ];

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-black/5 bg-[#F7F4F0]/95 px-4 py-2.5 backdrop-blur sm:px-5">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-1.5 text-xs">
              {stat.dot && <span className={`h-2 w-2 rounded-full ${stat.dot}`} aria-hidden="true" />}
              <dt className="text-slate-500">{stat.label}</dt>
              <dd className="font-bold tabular-nums text-slate-900">{stat.value}</dd>
            </div>
          ))}
        </dl>
        {groups.length > 1 && (
          <nav className="flex flex-wrap gap-1" aria-label="Jump to college">
            {groups.map((group) => (
              <button
                key={group.code + group.name}
                type="button"
                onClick={() => sectionRefs.current.get(group.code + group.name)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                title={`Jump to ${group.name}`}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                {group.code}
                <span className="tabular-nums text-slate-400">{group.courses.length}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {groups.map((group) => {
          const key = group.code + group.name;
          const tally = tallySections(group.courses);
          return (
            <section
              key={key}
              ref={(element) => { if (element) sectionRefs.current.set(key, element); else sectionRefs.current.delete(key); }}
              aria-label={group.name}
              className="scroll-mt-16 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-400">
                  {group.department?.logo ? <img src={group.department.logo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13px] font-bold text-slate-900">{group.name}</h3>
                  <p className="text-[11px] text-slate-500">
                    <span className="font-bold tracking-wide text-[#4e0a10]">{group.code}</span>
                    {' · '}{group.courses.length} course{group.courses.length === 1 ? '' : 's'}
                    {' · '}{group.units} unit{group.units === 1 ? '' : 's'}
                  </p>
                </div>
                {tally.total > 0 && (
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                    Staffed
                    <StaffingMeter staffed={tally.assigned + tally.partial} total={tally.total} />
                  </span>
                )}
              </header>
              <ul className="divide-y divide-slate-100">
                {group.courses.map((course) => <AssignedCourseRow key={course.id} course={course} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
