export interface Department {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

export interface Program {
  id: number;
  code: string;
  name: string | null;
  major?: string | null;
  department_id: number;
}

export type CurriculumStatus = 'active' | 'deactivated' | 'archived';

export type CurriculumLifecycle =
  | 'new'
  | 'old'
  | 'only'
  | 'deactivated'
  | 'archived';

/** A colour span over a note's text, in Unicode code points. `color` is #RRGGBB, or null when the source gives none or it is unknown. */
export interface NoteRun {
  length: number;
  color: string | null;
}

/** Where a note belongs. Saved curricula name a course; import drafts name the draft row. */
export type CurriculumNoteScope =
  | { level: 'curriculum' }
  | { level: 'year'; year_level: number }
  | { level: 'term'; year_level: number; semester: number }
  | { level: 'course'; course_id?: number; row_id?: string };

/** A note printed on the curriculum document, kept as content: text exactly as printed, with its colours. */
export interface CurriculumNote {
  id: string;
  text: string;
  source_text: string | null;
  runs: NoteRun[];
  scope: CurriculumNoteScope;
  provenance?: Record<string, unknown> | null;
  flags?: string[];
}

export interface Curriculum {
  id: number;
  name: string;
  code: string;
  cmo_number?: string | null;
  cmo_series?: number | null;
  department_id: number | null;
  program_id: number | null;
  effective_school_year: string;
  status: CurriculumStatus;
  description: string | null;
  /** Null for curricula that never recorded notes. */
  notes?: CurriculumNote[] | null;
  courses_count: number;
  active_sections_count?: number;
  scheduled_sections_count?: number;
  lifecycle?: CurriculumLifecycle | null;
  lifecycle_label?: string | null;
  department?: Department | null;
  /** Department hours per unit, sent with the full curriculum for the Edit Hours per Unit dialog. */
  hours_defaults?: CurriculumHoursDefaults;
  created_at: string;
  updated_at: string;
}

export interface CurriculumHoursDefaults {
  lecture_minutes_per_unit: number;
  laboratory_minutes_per_unit: number;
  slot_minutes: number;
  max_minutes_per_unit: number;
}

/** Where a placement's hours per unit came from. Legacy placements use 1 unit = 1 hour. */
export type CourseHoursSource = 'legacy' | 'import' | 'department' | 'custom';

/** A course's weekly hours as placed in this curriculum; scheduling uses these minutes. */
export interface CurriculumCourseHours {
  lecture_units: number;
  lab_units: number;
  lecture_minutes_per_unit: number;
  laboratory_minutes_per_unit: number;
  lecture_minutes: number;
  laboratory_minutes: number;
  total_minutes: number;
  source: CourseHoursSource;
}

export interface ApiCurriculum {
  id: number;
  name: string;
  code: string;
  cmo_number?: string | null;
  cmo_series?: number | null;
  department_id: number | null;
  program_id: number | null;
  effective_school_year: string;
  status: CurriculumStatus;
  description: string | null;
  courses_count: number;
  active_sections_count?: number;
  scheduled_sections_count?: number;
  lifecycle?: CurriculumLifecycle | null;
  lifecycle_label?: string | null;
  department?: Department | null;
  created_at: string;
  updated_at: string;
}

export interface CurriculumCourse {
  id: number;
  code: string;
  title: string;
  category?: 'major' | 'minor';
  lec_units: number;
  lab_units: number;
  total_units: number;
  program_id?: number | null;
  department_id?: number | null;
  prerequisites_text?: string | null;
  /** Hours per unit and the weekly hours they give; absent on rows added before the next reload. */
  hours?: CurriculumCourseHours;
  /** Present only for imported placements; null rows keep the legacy credit-derived durations. */
  placement?: {
    lecture_units: number | null;
    lab_units: number | null;
    lecture_minutes: number | null;
    laboratory_minutes: number | null;
    conversion_snapshot: Record<string, unknown> | null;
  } | null;
}

export interface CurriculumSemester {
  year_level: number;
  semester: number;
  courses: CurriculumCourse[];
  totals: {
    lec: number;
    lab: number;
    tu: number;
  };
}

export interface CurriculumDetail {
  curriculum: Curriculum & { department?: Department };
  semesters: CurriculumSemester[];
}

export const mapApiCurriculum = (c: ApiCurriculum): Curriculum => ({
  id: c.id,
  name: c.name,
  code: c.code,
  cmo_number: c.cmo_number ?? null,
  cmo_series: c.cmo_series ?? null,
  department_id: c.department_id,
  program_id: c.program_id,
  effective_school_year: c.effective_school_year,
  status: c.status,
  description: c.description,
  courses_count: c.courses_count ?? 0,
  active_sections_count: c.active_sections_count ?? 0,
  scheduled_sections_count: c.scheduled_sections_count ?? 0,
  lifecycle: c.lifecycle ?? null,
  lifecycle_label: c.lifecycle_label ?? null,
  department: c.department,
  created_at: c.created_at,
  updated_at: c.updated_at,
});

export const annotateCurriculumLifecycle = (list: Curriculum[]): Curriculum[] => {
  const ranks = new Map<number, CurriculumLifecycle>();
  const groups = new Map<string, Curriculum[]>();

  for (const curriculum of list) {
    if (curriculum.status !== 'active') continue;
    const key = `${curriculum.department_id ?? 'none'}:${curriculum.program_id ?? 'all'}`;
    groups.set(key, [...(groups.get(key) ?? []), curriculum]);
  }

  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => {
      const byYear = b.effective_school_year.localeCompare(a.effective_school_year);
      return byYear !== 0 ? byYear : b.id - a.id;
    });

    ordered.forEach((curriculum, index) => {
      ranks.set(
        curriculum.id,
        ordered.length <= 1 ? 'only' : index === 0 ? 'new' : 'old',
      );
    });
  }

  return list.map((curriculum) => {
    const lifecycle: CurriculumLifecycle =
      curriculum.status === 'active'
        ? (ranks.get(curriculum.id) ?? 'only')
        : curriculum.status;

    return { ...curriculum, lifecycle, lifecycle_label: curriculumLifecycleLabel(lifecycle) };
  });
};

const curriculumLifecycleLabel = (lifecycle: CurriculumLifecycle): string => {
  switch (lifecycle) {
    case 'new':
      return 'New Curriculum';
    case 'old':
      return 'Old Curriculum';
    case 'deactivated':
      return 'Deactivated';
    case 'archived':
      return 'Archived';
    default:
      return 'Active';
  }
};

export const curriculumLifecycleBadge = (
  curriculum: Pick<Curriculum, 'lifecycle' | 'lifecycle_label'>,
): { label: string; className: string } | null => {
  if (curriculum.lifecycle === 'new') {
    return {
      label: curriculum.lifecycle_label || 'New Curriculum',
      className: 'bg-sky-100 text-sky-800 border-sky-200',
    };
  }

  if (curriculum.lifecycle === 'old') {
    return {
      label: curriculum.lifecycle_label || 'Old Curriculum',
      className: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }

  return null;
};
