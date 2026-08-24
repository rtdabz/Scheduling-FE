import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BookOpen, Building2, CheckCircle2, GraduationCap, Save, Search, TriangleAlert } from 'lucide-react';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useToast } from '../../context/ToastContext';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';

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
  program_cluster?: string | null;
  curriculum_program_code?: string | null;
  curriculum_program_name?: string | null;
  curriculum_program_cluster?: string | null;
  delegable: boolean;
}
interface PageData {
  courses: CourseRow[];
  departments: DepartmentOption[];
  programs: { id: number; department_id: number; code: string; name?: string | null; cluster?: string | null }[];
  /** The department whose courses these are — the acting user's own. */
  currentDepartmentId: number | null;
  /** False when the department has published no curriculum, so there is nothing to offer. */
  hasActiveCurriculum: boolean;
}

interface IndexResponse {
  courses?: CourseRow[];
  departments?: DepartmentOption[];
  current_department_id?: number | null;
  has_active_curriculum?: boolean;
  programs?: PageData['programs'];
}

// v7 includes programs from every available receiving department.
const cacheKey = 'page:course-teaching-assignments:v7';

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
  name: course.curriculum_program_name
    ?? course.curriculum_program_cluster
    ?? course.program_name
    ?? course.program_cluster
    ?? 'All programs',
});

/**
 * Who teaches the course today: the recorded college, or the owner teaching its
 * own course when nothing has been recorded.
 */
const currentTeacherOf = (course: CourseRow) =>
  course.teaching_program_code
  ?? course.teaching_department_code
  ?? (course.department_code ? `${course.department_code} (owner)` : 'Not yet assigned');

export default function CourseTeachingAssignments() {
  const { toast } = useToast();
  const cached = getCachedData<PageData>(cacheKey);
  const [courses, setCourses] = useState<CourseRow[]>(cached?.courses ?? []);
  const [departments, setDepartments] = useState<DepartmentOption[]>(cached?.departments ?? []);
  const [programs, setPrograms] = useState<PageData['programs']>(cached?.programs ?? []);
  const [currentDepartmentId, setCurrentDepartmentId] = useState<number | null>(cached?.currentDepartmentId ?? null);
  const [hasActiveCurriculum, setHasActiveCurriculum] = useState(cached?.hasActiveCurriculum ?? true);
  const [target, setTarget] = useState<string | null>(null);
  const [targetProgramId, setTargetProgramId] = useState('');
  const [yearLevel, setYearLevel] = useState<number | null>(null);
  const [courseId, setCourseId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const courseTeachingGuideSteps = useMemo(() => [
    { element: '#course-teaching-target', title: '1. Choose the responsible department', description: 'Select the department or program that will teach the minor courses from your curriculum.', side: 'right' as const },
    { element: '#course-teaching-filters', title: '2. Select the year level and program', description: 'Work one year level at a time. Optionally restrict the assignment to a specific receiving program.', side: 'bottom' as const },
    { element: '#course-teaching-courses', title: '3. Select available minor courses', description: 'Choose only the courses to delegate. Major courses remain with their offering department.', side: 'top' as const },
    { element: '#course-teaching-save', title: '4. Save the teaching assignment', description: 'Save the selected courses before building their schedule or assigning instructors.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'course-teaching', isReady: !loading, steps: courseTeachingGuideSteps });

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
      };
    }, true).then((data) => {
      if (!active) return;
      setCourses(data.courses);
      setDepartments(data.departments);
      setPrograms(data.programs);
      setCurrentDepartmentId(data.currentDepartmentId);
      setHasActiveCurriculum(data.hasActiveCurriculum);
      setError(null);
    }).catch((loadError) => {
      if (active) setError(errorMessage(loadError, 'Unable to load course teaching assignments.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const ownDepartment = departments.find((department) => department.id === currentDepartmentId) ?? null;
  const availableDepartments = useMemo(
    () => departments.filter((department) => Number(department.id) !== Number(currentDepartmentId)),
    [currentDepartmentId, departments],
  );
  // Cross-department teaching must always be an explicit hand-off to another
  // college. Never default to, or retain, the acting department as a target.
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
        teaching_program_name: program?.name ?? program?.cluster ?? null,
      }
      : course));

    setCourses(next);
    // The live flag, not the mount-time `cached` snapshot: writing that back would
    // record "no curriculum published" for a department that has one.
    setCachedData<PageData>(cacheKey, { courses: next, departments, programs, currentDepartmentId, hasActiveCurriculum });
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

  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4e0a10]/10 text-[#4e0a10]"><BookOpen className="h-5 w-5" /></span>
            <div>
              <p className="text-xs text-slate-500">
                {ownDepartment
                  ? `${ownDepartment.department_name} curriculum, by year level. Select the minor courses and choose who teaches them.`
                  : 'Select the minor courses and choose who teaches them.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WorkflowGuideButton guideId="course-teaching" />
            {ownDepartment && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{ownDepartment.department_code}</span>
            )}
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{assignedInDepartment} assigned</span>
          </div>
        </header>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            <TriangleAlert className="h-4 w-4" />{error}
          </div>
        )}

        <div className="grid items-start gap-3 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside id="course-teaching-target" className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-4">
              <Building2 className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-base font-black text-slate-900">Responsible Department</h2>
                <p className="mt-0.5 text-xs text-slate-500">Choose who will handle the selected minor courses.</p>
              </div>
            </div>
            <div className="space-y-2 p-3">
              {loading && departments.length === 0
                ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-100" />)
                : availableDepartments.map((department) => {
                  // A program selection is the active responsible target. Do not
                  // leave an unrelated department (such as CAS) visually checked.
                  const selected = selectedProgram === null && activeTarget === String(department.id);
                  const assigned = assignedCounts.get(department.id) ?? 0;

                  return (
                    <button
                      key={department.id}
                      type="button"
                      onClick={() => selectDepartment(department)}
                      aria-pressed={selected}
                      className={`w-full rounded-lg border border-l-4 p-3 text-left transition-all duration-200 ${selected ? 'border-blue-500 bg-blue-50/70' : 'border-slate-200 border-l-transparent hover:border-l-[#C9952A] hover:bg-[#5A1220]/5'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500">
                          {department.logo ? <img src={department.logo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-900">{department.department_name}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {department.department_code}
                            {department.id === currentDepartmentId ? ' · your department' : ''}
                            {assigned > 0 ? ` · ${assigned} course${assigned === 1 ? '' : 's'}` : ''}
                          </span>
                        </span>
                        {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" />}
                      </div>
                    </button>
                  );
                })}
              {!loading && availableDepartments.length === 0 && (
                <p className="p-6 text-center text-sm font-semibold text-slate-500">No departments available.</p>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-col">
            <div id="course-teaching-filters" className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
              <span className="flex items-center gap-1.5 px-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <GraduationCap className="h-4 w-4" />Year Level
              </span>
              {YEAR_LEVELS.map((year) => {
                const count = byYear.minors.get(year)?.length ?? 0;
                const selected = activeYear === year;

                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => selectYear(year)}
                    aria-pressed={selected}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold ${selected ? 'border-[#4e0a10] bg-[#4e0a10] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}
                  >
                    <span>{YEAR_LABELS[year]}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
                  </button>
                );
              })}
              <span className="ml-auto flex items-center rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
                <Building2 className="mr-2 h-4 w-4 shrink-0" />
                <span>Responsible: <strong>{selectedProgram?.code ?? effectiveTargetDepartment?.department_name ?? 'Choose a department or program'}</strong></span>
              </span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select
                label="Select Course"
                value={courseId}
                onChange={(value) => { setCourseId(value); setSelectedIds([]); }}
                options={[['all', 'All Courses'], ...yearCourses.map((course) => [String(course.id), `${course.course_code} - ${course.course_name} (${programOf(course).code})`])]}
              />
              <Select
                label="Responsible Program (optional)"
                value={targetProgramId}
                onChange={(value) => { setTargetProgramId(value); setSelectedIds([]); }}
                options={[[ '', 'Department-wide / no program'], ...targetPrograms.map((program) => [String(program.id), `${program.code} - ${program.name || program.cluster || 'Unnamed program'}`])]}
              />
            </div>

            <div id="course-teaching-courses" className="mt-3 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900">{YEAR_LABELS[activeYear]} Minor Courses</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Select courses to be handled by {selectedProgram?.code ?? effectiveTargetDepartment?.department_name ?? 'the selected department'}.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="relative">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="w-40 rounded-md border border-slate-200 py-1.5 pl-8 pr-2 text-xs" />
                  </label>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{selectedIds.length} selected</span>
                </div>
              </div>
              <div className="overflow-auto">
                <div className="grid min-w-[980px] grid-cols-[40px_minmax(200px,1.2fr)_minmax(160px,0.9fr)_minmax(100px,0.6fr)_minmax(160px,1fr)_70px_minmax(150px,0.9fr)] bg-[#4e0a10] px-4 py-3 text-[10px] font-black uppercase text-white">
                  <span />
                  <span>Course</span>
                  <span>Program / Major</span>
                  <span>Owner</span>
                  <span>Current Teaching Department</span>
                  <span>Units</span>
                  <span>Availability</span>
                </div>
                {visibleCourses.map((course) => {
                  const status = statusOf(course);
                  const enabled = status === 'Available' || status === 'Selected';

                  return (
                    <div key={course.id} className="grid min-w-[980px] grid-cols-[40px_minmax(200px,1.2fr)_minmax(160px,0.9fr)_minmax(100px,0.6fr)_minmax(160px,1fr)_70px_minmax(150px,0.9fr)] items-center border-t border-slate-100 px-4 py-3 text-xs">
                      <input type="checkbox" checked={selectedIds.includes(course.id)} disabled={!enabled} onChange={() => toggleCourse(course)} aria-label={`Select ${course.course_code}`} />
                      <div className="min-w-0">
                        <p className="font-black text-slate-900">{course.course_code}</p>
                        <p className="truncate text-slate-500">{course.course_name}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-700">{programOf(course).code}</p>
                        <p className="truncate text-[10px] text-slate-500">{programOf(course).name}</p>
                      </div>
                      <span className="font-semibold text-slate-600">{ownerOf(course)}</span>
                      <span className="font-semibold text-slate-600">{currentTeacherOf(course)}</span>
                      <span className="font-black">{unitsOf(course)}</span>
                      <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-[10px] font-bold ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{status}</span>
                    </div>
                  );
                })}
                {!loading && visibleCourses.length === 0 && (
                  <p className="p-10 text-center text-sm font-semibold text-slate-500">
                    {!hasActiveCurriculum
                      // The list is the curriculum's, so no published curriculum is a
                      // different problem from an empty year — and a different fix.
                      ? `${ownDepartment?.department_code ?? 'Your department'} has no active curriculum, so there are no courses to assign yet. Publish one to manage its minor courses here.`
                      : yearCourses.length === 0
                        ? `No minor courses in ${YEAR_LABELS[activeYear]} of ${ownDepartment?.department_code ?? 'your department'}'s curriculum.`
                        : 'No courses match this filter.'}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-600">
                {selectedCourses.reduce((sum, course) => sum + unitsOf(course), 0)} units selected
                {hiddenMajors > 0 && (
                  <span className="ml-2 font-semibold text-slate-500">
                    · {hiddenMajors} major{hiddenMajors === 1 ? '' : 's'} not listed — a major stays with the department that offers it
                  </span>
                )}
              </div>
              <button
                id="course-teaching-save"
                type="button"
                onClick={saveAssignments}
                disabled={!selectedIds.length || saving || !effectiveTargetDepartment}
                className="inline-flex items-center gap-2 rounded-md bg-[#4e0a10] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100 disabled:hover:bg-slate-300"
              >
                {saving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </main>
        </div>
        {/* <section>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-base font-black text-slate-900">Incoming Cross-Department Courses</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Courses from another department's curriculum that your department teaches. They are not in the list above — that list is your own curriculum.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{incoming.length}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-[minmax(200px,1.3fr)_minmax(170px,1fr)_100px_80px_minmax(180px,1fr)] bg-[#4e0a10] px-4 py-3 text-[10px] font-black uppercase text-white">
              <span>Course</span><span>Source Department</span><span>Year Level</span><span>Units</span><span>Assignment Status</span>
            </div>
            {incoming.map((course) => (
              <div key={course.id} className="grid min-w-[760px] grid-cols-[minmax(200px,1.3fr)_minmax(170px,1fr)_100px_80px_minmax(180px,1fr)] items-center border-t border-slate-100 px-4 py-3 text-xs">
                <div><p className="font-black text-slate-900">{course.course_code}</p><p className="text-slate-500">{course.course_name}</p></div>
                <span className="font-semibold text-slate-600">{course.source_department_code ?? course.source_department_name ?? 'Shared'}</span>
                <span className="font-semibold text-slate-600">{course.year_level ? `${course.year_level}${course.year_level === 1 ? 'st' : course.year_level === 2 ? 'nd' : course.year_level === 3 ? 'rd' : 'th'} Year` : '—'}</span>
                <span className="font-black">{course.units ?? 0}</span>
                <span className="inline-flex w-fit rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">{course.assignment_status}</span>
              </div>
            ))}
            {incoming.length === 0 && <p className="p-8 text-center text-sm font-semibold text-slate-500">No incoming cross-department courses.</p>}
          </div>
        </section>
        </section> */}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <label className="text-xs font-black text-slate-700">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
import LoadingSpinner from "../../components/ui/LoadingSpinner";
