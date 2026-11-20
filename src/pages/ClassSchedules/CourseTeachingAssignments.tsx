import { buttonClass } from '../../components/ui/buttonStyles';
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import axios from 'axios';
import { ArrowDown, ArrowDownLeft, ArrowUp, ArrowUpDown, ArrowUpRight, BookOpen, Building2, Check, ChevronRight, Info, Lock, Save, TriangleAlert, Undo2, X } from 'lucide-react';
import api from '../../lib/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import type { ColumnDef, Table } from '@tanstack/react-table';
import TableActionButton from '../../components/ui/TableActionButton';
import Skeleton from '../../components/ui/Skeleton';
import { useDataTable } from '../../components/ui/useDataTable';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import { publishLiveTopics } from '../../lib/liveUpdates';
import { useToast } from '../../context/ToastContext';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import { programLabel, programName } from '../../lib/programLabel';
import { courseNameLines } from '../../lib/courseNameLines';
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
  /** Summary only: this entry lists returned sections handed to the group's college, not the whole course. */
  sectionLevelOnly?: boolean;
}
interface SectionAssignment {
  section_id: number;
  /** One meeting of the class; the server expands it to the whole class. */
  schedule_id?: number;
  section_name: string;
  instructor_name: string | null;
  status: 'Assigned' | 'Partially assigned' | 'Awaiting instructor' | string;
  /** Returned by its receiving department: detached from the course-level assignment. */
  returned?: boolean;
  returned_from_department_id?: number | null;
  returned_from_department_code?: string | null;
  section_teaching_department_id?: number | null;
  section_teaching_department_code?: string | null;
  section_teaching_department_name?: string | null;
  section_teaching_program_id?: number | null;
  section_teaching_program_code?: string | null;
  /** Returned and free to move: nobody teaches it and it is open for assignment. */
  reassignable?: boolean;
}
/** Section chip styling per status: a coloured dot carries the state, the chip stays quiet. */
const SECTION_STATUS_STYLES: Record<string, { dot: string; chip: string }> = {
  Assigned: { dot: 'bg-emerald-500', chip: 'border-slate-200 bg-white text-slate-700' },
  'Partially assigned': { dot: 'bg-amber-500', chip: 'border-amber-200 bg-amber-50 text-amber-900' },
  'Awaiting instructor': { dot: 'bg-slate-300', chip: 'border-dashed border-slate-300 bg-slate-50 text-slate-500' },
};
const RETURNED_STYLE = { dot: 'bg-sky-500', chip: 'border-dashed border-sky-300 bg-sky-50 text-sky-900' };
// "Reassigned · <staffing>" reuses the staffing colours of a course-level section.
const sectionStyleOf = (status: string) => SECTION_STATUS_STYLES[status]
  ?? (status.startsWith('Returned') ? RETURNED_STYLE : null)
  ?? SECTION_STATUS_STYLES[status.replace(/^Reassigned · /, '')]
  ?? SECTION_STATUS_STYLES['Awaiting instructor'];
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
  const [sectionBusyId, setSectionBusyId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
  }, [liveRevision, reloadToken]);

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

  // Returned sections still awaiting a decision: not yet handed to another college and nobody
  // teaching them. Once assigned they leave this list (their chip shows "Reassigned · …"); if the
  // new college returns one, it is back here.
  const returnedSections = useMemo<ReturnedSectionRow[]>(
    () => courses.flatMap((course) => (course.section_assignments ?? [])
      .filter((section) => section.returned && section.schedule_id != null
        && section.section_teaching_department_id == null && !section.instructor_name)
      .map((section) => ({ course, section })))
      .sort((a, b) => compareNatural(`${a.course.course_code} ${a.section.section_name}`, `${b.course.course_code} ${b.section.section_name}`)),
    [courses],
  );
  // Each returned section picks its own target, independent of the Teaching college panel.
  const assignReturnedSection = async ({ course, section }: ReturnedSectionRow, target: SectionTarget) => {
    if (section.schedule_id == null || sectionBusyId !== null) return;
    setSectionBusyId(section.schedule_id);
    try {
      const response = await api.post<{ message?: string }>('/course-teaching-assignments/sections', {
        schedule_ids: [section.schedule_id],
        teaching_department_id: target.departmentId,
        teaching_program_id: target.programId,
      });
      toast.success('Section assigned', response.data.message ?? `${course.course_code} (${section.section_name}) assigned.`);
      invalidateCacheGroups('schedules');
      publishLiveTopics(['assignments', 'schedules']);
      setReloadToken((token) => token + 1);
    } catch (sectionError) {
      toast.error('Not assigned', errorMessage(sectionError, 'Failed to assign the section.'));
    } finally {
      setSectionBusyId(null);
    }
  };

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

  // Assigned courses grouped by the college that teaches them, for the summary dialog. A returned
  // section handed to another college also appears under that college, as a section-only entry.
  const assignedSummary = useMemo(() => {
    const groups = new Map<number, { department: DepartmentOption | null; code: string; name: string; courses: CourseRow[] }>();
    const groupFor = (departmentId: number, code?: string | null, name?: string | null) => {
      const department = departments.find((item) => item.id === departmentId) ?? null;
      const group = groups.get(departmentId) ?? {
        department,
        code: code ?? department?.department_code ?? '—',
        name: name ?? department?.department_name ?? 'Unknown college',
        courses: [],
      };
      groups.set(departmentId, group);
      return group;
    };
    courses.forEach((course) => {
      if (course.teaching_department_id !== null) {
        groupFor(course.teaching_department_id, course.teaching_department_code, course.teaching_department_name).courses.push(course);
      }
      const handedOn = new Map<number, SectionAssignment[]>();
      (course.section_assignments ?? []).forEach((section) => {
        if (!section.returned || section.section_teaching_department_id == null) return;
        handedOn.set(section.section_teaching_department_id, [...(handedOn.get(section.section_teaching_department_id) ?? []), section]);
      });
      handedOn.forEach((sections, departmentId) => {
        const first = sections[0];
        groupFor(departmentId, first.section_teaching_department_code, first.section_teaching_department_name).courses.push({
          ...course,
          sectionLevelOnly: true,
          teaching_program_code: first.section_teaching_program_code ?? null,
          // Shown as this college's own sections: its staffing, without the "Reassigned" prefix.
          section_assignments: sections.map((section) => ({ ...section, returned: false, status: section.status.replace(/^Reassigned · /, '') })),
        });
      });
    });
    return [...groups.values()]
      .map((group) => ({
        ...group,
        courses: [...group.courses].sort((a, b) => yearOf(a) - yearOf(b) || a.course_code.localeCompare(b.course_code)),
        // A section-only entry is not a whole course, so it adds no course units.
        units: group.courses.reduce((sum, course) => sum + (course.sectionLevelOnly ? 0 : unitsOf(course)), 0),
      }))
      .sort((a, b) => b.courses.length - a.courses.length || a.code.localeCompare(b.code));
  }, [courses, departments]);
  const assignedUnits = assignedSummary.reduce((sum, group) => sum + group.units, 0);
  // Every assignment the summary lists: whole courses plus returned sections handed to another college.
  const assignmentCount = assignedSummary.reduce((sum, group) => sum + group.courses.length, 0);

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

  // Sorting only: the rows are rendered by CourseList, so these columns carry no cell markup.
  const courseColumns: ColumnDef<CourseRow>[] = [
    { id: 'course', accessorKey: 'course_code', header: 'Course' },
    { id: 'program', accessorFn: (course) => programOf(course).code, header: 'Program' },
    { id: 'owner', accessorFn: (course) => ownerOf(course), header: 'Origin' },
    { id: 'taught_by', accessorFn: (course) => currentTeacherOf(course), header: 'Taught by' },
    { id: 'units', accessorFn: (course) => unitsOf(course), header: 'Units' },
    { id: 'status', accessorFn: (course) => statusOf(course), header: 'Status' },
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
              {assignmentCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-white bg-amber-400" />
                </span>
              )}
              <span className="rounded-full bg-[#4e0a10] px-1.5 text-[10px] tabular-nums text-white">{assignmentCount}</span>
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

        {returnedSections.length > 0 && (
          <ReturnedSectionsPanel
            rows={returnedSections}
            departments={availableDepartments}
            programs={programs}
            restrictions={restrictions}
            busyId={sectionBusyId}
            onAssign={(row, target) => void assignReturnedSection(row, target)}
          />
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

              <CourseList
                table={courseTable}
                ariaLabel={`${YEAR_LABELS[activeYear]} courses`}
                isLoading={loading}
                statusOf={statusOf}
                onToggle={toggleCourse}
                onRemove={(course) => void removeAssignment(course)}
                removingId={removingId}
                removeDisabled={removingId !== null || removingAll || saving}
                allSelected={allVisibleSelected}
                onToggleAll={toggleAllVisible}
                selectAllDisabled={selectableVisible.length === 0 || !effectiveTargetDepartment}
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

/** One status vocabulary for the course list: Unassigned, Assigned, Locked, Selected. */
const STATUS_PILL_TONES = {
  unassigned: { pill: 'border-slate-200 bg-white text-slate-700', dot: 'bg-slate-400' },
  assigned: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  locked: { pill: 'border-slate-200 bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  selected: { pill: 'border-[#4e0a10]/20 bg-[#4e0a10]/[0.07] text-[#4e0a10]', dot: 'bg-[#C9952A]' },
} as const;

const ROW_INTERACTIVE = 'a, button, input, select, textarea, label';
const SORT_ICON = { asc: ArrowUp, desc: ArrowDown } as const;

/**
 * The course list: one CSS grid shared by the header and every row, reflowed with container
 * queries (see CourseTeachingAssignments.css) instead of forcing a <table> into a grid. ARIA
 * table roles keep it announced as a table. Sorting still comes from the TanStack table.
 */
function CourseList({
  table, ariaLabel, isLoading, emptyState, statusOf, onToggle, onRemove, removingId, removeDisabled,
  allSelected, onToggleAll, selectAllDisabled,
}: {
  table: Table<CourseRow>;
  ariaLabel: string;
  isLoading: boolean;
  emptyState: ReactNode;
  statusOf: (course: CourseRow) => string;
  onToggle: (course: CourseRow) => void;
  onRemove: (course: CourseRow) => void;
  removingId: number | null;
  removeDisabled: boolean;
  allSelected: boolean;
  onToggleAll: () => void;
  selectAllDisabled: boolean;
}) {
  const rows = table.getRowModel().rows;
  const headerCell = (id: string, area: string, align: 'start' | 'end' = 'start') => {
    const column = table.getColumn(id);
    if (!column) return null;
    const sorted = column.getIsSorted();
    const label = String(column.columnDef.header);
    const Icon = sorted ? SORT_ICON[sorted] : ArrowUpDown;
    return (
      <div role="columnheader" aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'} className={`ct-cell ct-${area} ${align === 'end' ? 'ct-end' : ''}`}>
        <button type="button" onClick={column.getToggleSortingHandler()} aria-label={`Sort by ${label}`} className={`ct-sort ${sorted ? 'ct-sort-active' : ''}`}>
          {label}
          <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
        </button>
      </div>
    );
  };

  return (
    <div role="region" aria-label="Course teaching assignments" tabIndex={0} className="ct-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9952A]/40 max-lg:max-h-[65vh] [scrollbar-width:thin]">
      <div role="table" aria-label={ariaLabel} aria-busy={isLoading || undefined} className="ct-list">
        <div role="rowgroup" className="ct-head-group">
          <div role="row" className="ct-head">
            <div role="columnheader" className="ct-cell ct-check">
              <label className="ct-check-hit">
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} disabled={selectAllDisabled} aria-label="Select all unassigned courses" className="ct-checkbox" />
                <span className="ct-select-all-text" aria-hidden="true">Select all</span>
              </label>
            </div>
            {headerCell('course', 'course')}
            {headerCell('program', 'program')}
            {headerCell('owner', 'origin')}
            {headerCell('taught_by', 'taught')}
            {headerCell('units', 'units', 'end')}
            {headerCell('status', 'status')}
            <div role="columnheader" className="ct-cell ct-action"><span className="sr-only">Actions</span></div>
          </div>
        </div>
        <div role="rowgroup">
          {isLoading ? Array.from({ length: 6 }).map((_, index) => (
            <div key={index} role="row" className="ct-row" aria-hidden="true">
              <div className="ct-cell ct-check"><Skeleton className="h-4 w-4" /></div>
              <div className="ct-cell ct-course space-y-1.5"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-3 w-4/5" /></div>
              <div className="ct-cell ct-program space-y-1.5"><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-3/4" /></div>
              <div className="ct-cell ct-origin"><Skeleton className="h-3 w-10" /></div>
              <div className="ct-cell ct-taught"><Skeleton className="h-5 w-16" /></div>
              <div className="ct-cell ct-units ct-end"><Skeleton className="ml-auto h-3.5 w-5" /></div>
              <div className="ct-cell ct-status"><Skeleton className="h-5 w-20 rounded-full" /></div>
              <div className="ct-cell ct-action" />
            </div>
          )) : rows.length === 0 ? (
            <div role="row" className="ct-empty">
              <div role="cell">{emptyState}</div>
            </div>
          ) : rows.map((row) => (
            <CourseListRow
              key={row.id}
              course={row.original}
              status={statusOf(row.original)}
              onToggle={onToggle}
              onRemove={onRemove}
              removing={removingId === row.original.id}
              removeDisabled={removeDisabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CourseListRow({ course, status, onToggle, onRemove, removing, removeDisabled }: {
  course: CourseRow;
  status: string;
  onToggle: (course: CourseRow) => void;
  onRemove: (course: CourseRow) => void;
  removing: boolean;
  removeDisabled: boolean;
}) {
  const selectable = status === 'Available' || status === 'Selected';
  const selected = status === 'Selected';
  const assigned = course.teaching_department_id !== null;
  const classes = instructorClassesOf(course);
  const locked = classes > 0;
  const lockNote = locked ? `Instructor in ${classes} ${classes === 1 ? 'class' : 'classes'}` : null;
  const program = programOf(course);

  // A click anywhere on a selectable row toggles it, except on its own controls or while selecting text.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectable) return;
    if ((event.target as Element).closest(ROW_INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    onToggle(course);
  };

  return (
    <div
      role="row"
      aria-selected={selectable ? selected : undefined}
      onClick={handleClick}
      className={`ct-row ${selectable ? 'ct-row-selectable' : ''} ${selected ? 'ct-row-selected' : ''}`}
    >
      <div role="cell" className="ct-cell ct-check">
        <label className="ct-check-hit">
          <input type="checkbox" checked={selected} disabled={!selectable} onChange={() => onToggle(course)} aria-label={`Select ${course.course_code}`} className="ct-checkbox" />
        </label>
      </div>

      <div role="cell" className="ct-cell ct-course">
        <p className="truncate text-[13px] font-semibold leading-5 text-slate-900">{course.course_code}</p>
        <p className="text-xs leading-4 text-slate-500" title={course.course_name}>
          {courseNameLines(course.course_name).map((line, index) => <span key={index} className="block">{line}</span>)}
        </p>
      </div>

      <div role="cell" className="ct-cell ct-program">
        <span className="ct-label">Program</span>
        <p className="truncate text-xs font-semibold leading-5 text-slate-700" title={program.name}>{program.code}</p>
      </div>

      <div role="cell" className="ct-cell ct-origin">
        <span className="ct-label">Origin</span>
        <span className="block truncate text-xs font-semibold leading-5 tracking-wide text-slate-600" title={course.department_name ?? undefined}>{ownerOf(course)}</span>
      </div>

      {/* The course-level college, plus a badge per college a returned section was handed to. */}
      <div role="cell" className="ct-cell ct-taught">
        <span className="ct-label">Taught by</span>
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {assigned
            ? <span className="inline-flex min-w-0 max-w-full items-center rounded-md border border-[#4e0a10]/15 bg-[#4e0a10]/[0.05] px-1.5 py-px text-[11px] font-semibold leading-[18px] text-[#4e0a10]" title={course.teaching_program_name ?? course.teaching_department_name ?? undefined}><span className="truncate">{currentTeacherOf(course)}</span></span>
            : <span className="min-w-0 truncate text-xs leading-5 text-slate-400" title={currentTeacherOf(course)}>{currentTeacherOf(course)}</span>}
          <MovedSectionBadges course={course} />
        </span>
      </div>

      <div role="cell" className="ct-cell ct-units ct-end">
        <span className="ct-label">Units</span>
        <span className="text-[13px] font-semibold leading-5 tabular-nums text-slate-900">{unitsOf(course)}</span>
      </div>

      <div role="cell" className="ct-cell ct-status">
        <span className="ct-label">Status</span>
        {selected
          ? <StatusPill tone="selected" label="Selected" />
          : assigned
            ? <StatusPill tone="assigned" label="Assigned" note={lockNote ? `${lockNote} · locked` : null} title={lockNote ? instructorLockMessage(course) : undefined} locked={locked} />
            : locked
              ? <StatusPill tone="locked" label="Locked" note={lockNote} title={instructorLockMessage(course)} locked />
              : <StatusPill tone="unassigned" label="Unassigned" note={status === 'Available' ? null : status} muted={status !== 'Available'} />}
      </div>

      <div role="cell" className="ct-cell ct-action">
        {assigned && (
          <TableActionButton
            label={locked ? instructorLockMessage(course) : 'Remove assignment'}
            aria-label={`Remove ${course.course_code} assignment`}
            variant="remove"
            onClick={() => onRemove(course)}
            disabled={removeDisabled || locked}
          >
            {removing ? <LoadingSpinner className="h-4 w-4" /> : <X size={15} />}
          </TableActionButton>
        )}
      </div>
    </div>
  );
}

/** Compact transfer badge, one style everywhere: moved out, received in, or back home. */
function TransferBadge({ direction, label, title }: { direction: 'out' | 'in' | 'home'; label: string; title?: string }) {
  const Icon = direction === 'out' ? ArrowUpRight : direction === 'in' ? ArrowDownLeft : Undo2;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-px text-[10px] font-bold leading-4 ${direction === 'home' ? 'border-dashed border-sky-300 text-sky-700' : 'border-sky-200 bg-sky-50 text-sky-800'}`}
      title={title}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** " · 1 course · 3 units · 1 returned section" for a summary card. */
const summaryCountLabel = (courses: CourseRow[], units: number) => {
  const whole = courses.filter((course) => !course.sectionLevelOnly).length;
  const sections = courses.filter((course) => course.sectionLevelOnly)
    .reduce((sum, course) => sum + (course.section_assignments?.length ?? 0), 0);
  return [
    whole > 0 ? `${whole} course${whole === 1 ? '' : 's'} · ${units} unit${units === 1 ? '' : 's'}` : null,
    sections > 0 ? `${sections} received section${sections === 1 ? "" : "s"}` : null,
  ].filter(Boolean).map((part) => ` · ${part}`).join('');
};

/** Where a returned section is now: the college/program it was handed to, or back in-house. */
const movedTargetOf = (section: SectionAssignment) =>
  section.section_teaching_program_code ?? section.section_teaching_department_code ?? null;

/** Returned sections of a course, grouped by where they are now (null = back with this department). */
const movedSectionsOf = (course: CourseRow) => {
  const groups = new Map<string | null, SectionAssignment[]>();
  (course.section_assignments ?? []).filter((section) => section.returned).forEach((section) => {
    const target = movedTargetOf(section);
    groups.set(target, [...(groups.get(target) ?? []), section]);
  });
  return [...groups.entries()].map(([target, sections]) => ({
    target,
    sections: [...sections].sort((a, b) => compareNatural(a.section_name, b.section_name)),
  }));
};

/**
 * Taught-by badges for a course's returned sections: one per college a section was handed to
 * ("CAS · 1 section"), and one for sections returned to this department and not handed on.
 */
function MovedSectionBadges({ course }: { course: CourseRow }) {
  const moved = movedSectionsOf(course);
  if (moved.length === 0) return null;
  return (
    <>
      {moved.map(({ target, sections }) => {
        const names = sections.map((section) => section.section_name).join(', ');
        const count = `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}`;
        return target ? (
          <span
            key={target}
            className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-bold leading-5 text-sky-800"
            title={`${names}: moved to ${sections[0].section_teaching_department_name ?? target}`}
          >
            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            {target}
            <span className="font-semibold text-sky-600">· {count}</span>
          </span>
        ) : (
          <span
            key="__home"
            className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-dashed border-sky-300 px-2 py-0.5 text-[11px] font-semibold leading-5 text-sky-700"
            title={`${names}: returned to your department`}
          >
            <Undo2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            Returned · {count}
          </span>
        );
      })}
    </>
  );
}

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
    <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-0.5" title={title ?? note ?? undefined}>
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${styles.pill}`}>
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

// Returned sections left the course-level assignment, so they do not count toward its staffing.
const tallySections = (courses: CourseRow[]) => courses.reduce((tally, course) => {
  (course.section_assignments ?? []).filter((section) => !section.returned).forEach((section) => {
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

interface ReturnedSectionRow {
  course: CourseRow;
  section: SectionAssignment;
}

interface SectionTarget {
  departmentId: number;
  programId: number | null;
}

type ProgramOption = PageData['programs'][number];

interface ReturnedSectionsPanelProps {
  rows: ReturnedSectionRow[];
  /** Colleges the user may hand courses to (same restrictions as course-level assignment). */
  departments: DepartmentOption[];
  programs: ProgramOption[];
  restrictions: AssignmentRestrictions | null;
  busyId: number | null;
  onAssign: (row: ReturnedSectionRow, target: SectionTarget) => void;
}

/**
 * Returned sections awaiting a decision. Each picks its own college (any eligible one, not only
 * the department that returned it) and optional program. Other sections of the course keep
 * following the course-level assignment; an assigned section leaves this list.
 */
function ReturnedSectionsPanel({ rows, departments, programs, restrictions, busyId, onAssign }: ReturnedSectionsPanelProps) {
  return (
    <section aria-labelledby="returned-sections-title" className="rounded-xl border border-sky-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-sky-50/60 px-4 py-2.5">
        <div className="min-w-0">
          <h2 id="returned-sections-title" className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Undo2 className="h-4 w-4 text-sky-700" /> Returned sections
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-sky-800">{rows.length}</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            A receiving department could not staff these. Choose any eligible college or program for each one, or leave it to staff in
            your own Instructor Assignment. Only the section moves; the rest of its course stays where it is.
          </p>
        </div>
      </header>
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {rows.map((row) => (
          <ReturnedSectionItem
            key={`${row.course.id}:${row.section.section_id}`}
            row={row}
            departments={departments}
            programs={programs}
            restrictions={restrictions}
            busyId={busyId}
            onAssign={onAssign}
          />
        ))}
      </ul>
    </section>
  );
}

function ReturnedSectionItem({ row, departments, programs, restrictions, busyId, onAssign }: Omit<ReturnedSectionsPanelProps, 'rows'> & { row: ReturnedSectionRow }) {
  const { course, section } = row;
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const fieldId = useId();

  const department = departments.find((item) => String(item.id) === departmentId) ?? null;
  // Same rule as the course-level picker: never the user's own programs.
  const programOptions = programs.filter((program) => Number(program.department_id) === Number(department?.id)
    && !(restrictions?.own_program_ids ?? []).includes(program.id));
  // Same as the course-level picker: with only one eligible program, it is chosen automatically.
  const onlyProgram = programOptions.length === 1 ? programOptions[0] : null;
  const program = programOptions.find((item) => String(item.id) === programId) ?? onlyProgram;
  const programRequired = Boolean(restrictions?.requires_program && department?.id === restrictions.department_id);
  const busy = busyId === section.schedule_id;
  const lockedReason = section.reassignable ? null : 'This section is not open for instructor assignment right now.';
  const blockedReason = lockedReason
    ?? (department === null ? 'Choose a college first.' : null)
    ?? (programRequired && program === null ? 'Choose a specific program of your department.' : null);
  const targetLabel = program ? programLabel(program) : department?.department_code ?? null;
  const selectClass = 'h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#C9952A] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <div className="min-w-[12rem] flex-1">
        <p className="truncate text-[13px] font-bold text-slate-900">
          {course.course_code} <span className="font-semibold text-slate-500">· {section.section_name}</span>
        </p>
        <p className="truncate text-[11px] text-slate-500" title={section.status}>
          {section.status}
          {section.returned_from_department_code && <> · returned by <span className="font-semibold text-slate-700">{section.returned_from_department_code}</span></>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={`${fieldId}-college`} className="sr-only">College for {course.course_code} {section.section_name}</label>
        <select
          id={`${fieldId}-college`}
          value={departmentId}
          onChange={(event) => { setDepartmentId(event.target.value); setProgramId(''); }}
          disabled={!section.reassignable || busyId !== null}
          className={`${selectClass} max-w-[16rem]`}
        >
          <option value="">Choose college…</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.department_code} · {item.department_name}
              {item.id === section.returned_from_department_id ? ' (returned it)' : ''}
            </option>
          ))}
        </select>
        {department && programOptions.length > 0 && (
          <>
            <label htmlFor={`${fieldId}-program`} className="sr-only">Program for {course.course_code} {section.section_name}</label>
            <select
              id={`${fieldId}-program`}
              value={onlyProgram ? String(onlyProgram.id) : programId}
              onChange={(event) => setProgramId(event.target.value)}
              disabled={!section.reassignable || busyId !== null}
              className={`${selectClass} max-w-[12rem]`}
            >
              {!onlyProgram && <option value="">{programRequired ? 'Select a program' : 'Any program'}</option>}
              {programOptions.map((item) => <option key={item.id} value={item.id}>{programLabel(item)}</option>)}
            </select>
          </>
        )}
        <button
          type="button"
          onClick={() => department && onAssign(row, { departmentId: department.id, programId: program?.id ?? null })}
          disabled={busyId !== null || blockedReason !== null}
          title={blockedReason ?? `Assign this section to ${targetLabel}`}
          className={buttonClass({ variant: 'accentSoft', size: 'sm' })}
        >
          {busy ? <LoadingSpinner className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {targetLabel ? `Assign to ${targetLabel}` : 'Assign'}
        </button>
      </div>
    </li>
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
  // Returned sections no longer belong to this college's list; they get their own "moved" line.
  const groups = sectionsByInstructor(sections.filter((section) => !section.returned));
  const moved = movedSectionsOf(course);
  const units = unitsOf(course);
  // The receiving college got the section from the department that assigned it to them: only the
  // offering department can hand a returned section on, so that is the course's own department.
  // Who returned it earlier comes from the transfer record and is kept as history.
  const receivedFrom = course.department_code ?? null;
  const returnedBy = [...new Set(sections.map((section) => section.returned_from_department_code).filter(Boolean))].join(', ') || null;

  return (
    <li className="grid gap-x-5 gap-y-2 px-4 py-3 md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold text-slate-900">{course.course_code}</span>
          {course.sectionLevelOnly && receivedFrom && (
            <TransferBadge
              direction="in"
              label={`Received from ${receivedFrom}`}
              title={`Assigned here by ${receivedFrom}${returnedBy ? ` after ${returnedBy} returned it` : ''}. It is now available for instructor assignment; the rest of the course is taught elsewhere.`}
            />
          )}
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
          {moved.map(({ target, sections: items }) => (
            <li key={`moved:${target ?? '__home'}`} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <span className="flex min-w-0 items-center gap-2 sm:w-52 sm:shrink-0 sm:pt-0.5">
                {target ? (
                  <TransferBadge direction="out" label={`Moved to ${target}`} title={`Moved out of your department: returned, then assigned to ${items[0].section_teaching_department_name ?? target}.`} />
                ) : (
                  <TransferBadge direction="home" label="Returned to you" title="Returned to your department; assign it to another college or staff it yourself." />
                )}
                {items.length > 1 && <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">×{items.length}</span>}
              </span>
              <ul className="flex min-w-0 flex-wrap gap-1">
                {/* The badge already says it moved; the chip keeps only its current staffing. */}
                {items.map((section) => <SectionChip key={section.section_id} section={{ ...section, status: section.status.replace(/^(Reassigned|Returned) · /, '') }} />)}
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
                    {summaryCountLabel(group.courses, group.units)}
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
                {group.courses.map((course) => <AssignedCourseRow key={`${course.id}${course.sectionLevelOnly ? ":sections" : ""}`} course={course} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
