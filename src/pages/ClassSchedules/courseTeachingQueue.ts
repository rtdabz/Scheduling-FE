export interface DepartmentOption {
  id: number;
  department_code: string;
  department_name: string;
}

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

export const issueForCourse = (
  course: CourseRow,
  target: TeachingTarget | null,
  queuedCourseIds: ReadonlySet<number>,
): string | null => {
  if (queuedCourseIds.has(course.id)) return 'Queued';
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
