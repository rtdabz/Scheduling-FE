export interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

export interface Curriculum {
  id: number;
  name: string;
  code: string;
  department_id: number | null;
  program_id: number | null;
  curriculum_version: string | null;
  academic_year: string | null;
  effective_school_year: string;
  status: 'draft' | 'active' | 'archived';
  description: string | null;
  courses_count: number;
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
  curriculum_version: string | null;
  academic_year: string | null;
  effective_school_year: string;
  status: 'draft' | 'active' | 'archived';
  description: string | null;
  courses_count: number;
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
  curriculum_version: c.curriculum_version,
  academic_year: c.academic_year,
  effective_school_year: c.effective_school_year,
  status: c.status,
  description: c.description,
  courses_count: c.courses_count ?? 0,
  department: c.department,
  created_at: c.created_at,
  updated_at: c.updated_at,
});
