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

export interface Curriculum {
  id: number;
  name: string;
  code: string;
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

export interface ApiCurriculum {
  id: number;
  name: string;
  code: string;
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
