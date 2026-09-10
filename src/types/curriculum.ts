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
  cluster?: string | null;
  department_id: number;
}

/**
 * Where a curriculum sits relative to its department's others.
 *
 * Derived by the API from the effective school year, never stored: a department
 * mid-transition runs the new curriculum for its incoming cohort and the old one
 * for the upper years, and nobody should have to maintain that flag by hand.
 * `only` means there is nothing to compare against, so no badge is shown.
 */
/**
 * A curriculum is in service or it is not. There is no separate "draft": an
 * unpublished curriculum and a withdrawn one are the same state and offer the
 * same next step, which is to activate it.
 */
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
  /** Cohorts pointed at this curriculum. Informational: an assignment on its
   *  own is undone with a dropdown and does not block retirement. */
  active_sections_count?: number;
  /** The subset of those with a schedule already plotted from it. Blocks
   *  deactivating and archiving while non-zero. */
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
  /** Program (major) that owns this course; only instructors of it may teach it. */
  program_id?: number | null;
}

export interface CurriculumTerm {
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
  terms: CurriculumTerm[];
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

/**
 * Re-ranks a list of curricula into new/old within each department+program group.
 *
 * The API sends the same labels, but they describe a curriculum's *siblings*, so
 * activating one row can relabel others the response says nothing about. Rather
 * than refetch the whole table to learn that — which throws the list back into a
 * loading skeleton for a one-row change — the ranking is recomputed here from
 * state already in hand. Mirrors Curriculum::annotateLifecycle() on the backend.
 *
 * Must be given the unfiltered list: a status filter would hide the very
 * siblings the ranking is relative to.
 */
export const annotateCurriculumLifecycle = (list: Curriculum[]): Curriculum[] => {
  const ranks = new Map<number, CurriculumLifecycle>();
  const groups = new Map<string, Curriculum[]>();

  for (const curriculum of list) {
    if (curriculum.status !== 'active') continue;
    const key = `${curriculum.department_id ?? 'none'}:${curriculum.program_id ?? 'all'}`;
    groups.set(key, [...(groups.get(key) ?? []), curriculum]);
  }

  for (const group of groups.values()) {
    // Newest effective school year first; the id breaks ties, matching the
    // backend's ordering so a refetch never contradicts what is on screen.
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

/**
 * The old/new badge, or null when there is nothing worth badging.
 *
 * Only an old-vs-new distinction earns a badge here — the status pill already
 * carries draft and archived, and repeating them would be noise.
 */
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
