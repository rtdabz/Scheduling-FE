/**
 * The queue behind Course Teaching Assignments.
 *
 * The page is the Auto-Assign wizard with a college where the instructor sits:
 * pick the college that will teach, tick the courses, review, save. Everything
 * that decides *whether* a course may be queued lives here so it can be tested
 * without rendering the wizard — and so the page stays a view.
 *
 * None of this is a rule of its own. `delegable` and
 * `effective_teaching_department_id` are the server's answers, already resolved
 * by `SchedulingPolicy`; this module only reads them.
 */

export interface DepartmentOption {
  id: number;
  department_code: string;
  department_name: string;
}

/** One row of `GET /api/course-teaching-assignments`. */
export interface CourseRow {
  id: number;
  course_code: string;
  course_name: string;
  course_category?: string | null;
  units?: number | null;
  department_id: number | null;
  department_code?: string | null;
  department_name?: string | null;
  teaching_department_id: number | null;
  teaching_department_code?: string | null;
  teaching_department_name?: string | null;
  program_id?: number | null;
  program_code?: string | null;
  delegable: boolean;
  effective_teaching_department_id: number | null;
}

/**
 * The pseudo-target that hands a course back to the college that owns it. It is
 * the same "no override" state a cleared select used to mean, and it saves as
 * DELETE rather than PATCH.
 */
export const RELEASE_TARGET = 'owner';

export type TeachingTarget = number | typeof RELEASE_TARGET;

export interface QueuedChange {
  courseId: number;
  courseCode: string;
  courseName: string;
  category: string;
  programCode: string | null;
  units: number;
  ownerLabel: string;
  /** Who teaches it now — what this change replaces. */
  currentLabel: string;
  target: TeachingTarget;
  targetLabel: string;
}

export interface QueueGroup {
  target: TeachingTarget;
  targetLabel: string;
  items: QueuedChange[];
}

export interface CourseFilters {
  courseType: 'delegable' | 'major' | 'all';
  /** `'all'`, `'shared'`, or a department id as a string. */
  owner: string;
  search: string;
}

export interface TeachingTotals {
  courses: number;
  units: number;
}

export const departmentLabel = (department: DepartmentOption): string => (
  `${department.department_code} - ${department.department_name}`
);

export const ownerLabelOf = (course: CourseRow): string => (
  course.department_code
    ? `${course.department_code} - ${course.department_name ?? ''}`.trim()
    : 'Shared / No college'
);

/**
 * Who teaches the course today. An explicit assignment is named outright; with
 * none, the server's derived answer is shown as the owner teaching its own
 * course, and a course no college teaches by default is open to all.
 */
export const currentTeachingLabel = (course: CourseRow, departments: DepartmentOption[]): string => {
  if (course.teaching_department_id !== null) {
    return course.teaching_department_code ?? course.teaching_department_name ?? 'Assigned';
  }

  const effective = departments.find((department) => department.id === course.effective_teaching_department_id);
  if (effective) return `${effective.department_code} (owner)`;

  return 'Open to every college';
};

export const targetLabel = (target: TeachingTarget, departments: DepartmentOption[]): string => {
  if (target === RELEASE_TARGET) return 'Owning college';

  const department = departments.find((item) => item.id === target);
  return department ? departmentLabel(department) : `College #${target}`;
};

export const unitsOf = (course: CourseRow): number => Number(course.units ?? 0) || 0;

export const filterCourses = (courses: CourseRow[], filters: CourseFilters): CourseRow[] => {
  const query = filters.search.trim().toLowerCase();

  return [...courses]
    .filter((course) => {
      if (filters.courseType === 'delegable' && !course.delegable) return false;
      if (filters.courseType === 'major' && course.delegable) return false;
      if (filters.owner !== 'all') {
        const owner = course.department_id === null ? 'shared' : String(course.department_id);
        if (owner !== filters.owner) return false;
      }

      return !query
        || course.course_code.toLowerCase().includes(query)
        || course.course_name.toLowerCase().includes(query);
    })
    .sort((left, right) => left.course_code.localeCompare(right.course_code, undefined, { numeric: true }));
};

/**
 * Why this course cannot be queued for this college, or null when it can. The
 * wizard's Status column is this string, and a row with an issue is not
 * selectable — mirroring how Auto-Assign refuses an ineligible section.
 */
export const issueForCourse = (
  course: CourseRow,
  target: TeachingTarget | null,
  queuedCourseIds: ReadonlySet<number>,
): string | null => {
  if (queuedCourseIds.has(course.id)) return 'Queued';
  // A major belongs to the department and program that offer it, and the save
  // would be refused — so the row says so instead of failing later.
  if (!course.delegable) return 'Major stays with its department';
  if (target === null) return 'Select a teaching college';

  if (target === RELEASE_TARGET) {
    return course.teaching_department_id === null ? 'Already with its owner' : null;
  }

  return course.teaching_department_id === target ? 'Already assigned' : null;
};

export const buildQueuedChange = (
  course: CourseRow,
  target: TeachingTarget,
  departments: DepartmentOption[],
): QueuedChange => ({
  courseId: course.id,
  courseCode: course.course_code,
  courseName: course.course_name,
  category: (course.course_category ?? 'course').toLowerCase(),
  programCode: course.program_code ?? null,
  units: unitsOf(course),
  ownerLabel: ownerLabelOf(course),
  currentLabel: currentTeachingLabel(course, departments),
  target,
  targetLabel: targetLabel(target, departments),
});

/** Queued changes gathered per college, in label order, for the review panes. */
export const groupQueueByTarget = (queue: QueuedChange[]): QueueGroup[] => {
  const groups = new Map<string, QueueGroup>();

  queue.forEach((change) => {
    const key = String(change.target);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(change);
      return;
    }
    groups.set(key, { target: change.target, targetLabel: change.targetLabel, items: [change] });
  });

  return [...groups.values()].sort((left, right) => left.targetLabel.localeCompare(right.targetLabel));
};

export const totalsOf = (items: QueuedChange[]): TeachingTotals => ({
  courses: items.length,
  units: items.reduce((total, item) => total + item.units, 0),
});

/**
 * What each college has been explicitly assigned, which is what this page
 * manages. Courses it teaches under the derived service rule are not counted —
 * nobody assigned those, and they cannot be removed here.
 */
export const assignedTotalsByDepartment = (courses: CourseRow[]): Map<number, TeachingTotals> => {
  const totals = new Map<number, TeachingTotals>();

  courses.forEach((course) => {
    if (course.teaching_department_id === null) return;
    const current = totals.get(course.teaching_department_id) ?? { courses: 0, units: 0 };
    totals.set(course.teaching_department_id, {
      courses: current.courses + 1,
      units: current.units + unitsOf(course),
    });
  });

  return totals;
};
