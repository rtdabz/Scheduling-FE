import { describe, expect, it } from 'vitest';
import { getCurriculumPrintSections, getPrintableProgramTitle } from './curriculumPrintable';
import type { Curriculum, CurriculumTerm } from '../types/curriculum';

const curriculum: Curriculum = {
  id: 1,
  name: 'BSIT Curriculum',
  code: 'CMO-25',
  department_id: 1,
  program_id: 2,
  effective_school_year: '2026-2027',
  status: 'active',
  description: null,
  courses_count: 1,
  created_at: '',
  updated_at: '',
};

describe('curriculum printable layout', () => {
  it('creates all four year sections and preserves empty terms', () => {
    const terms: CurriculumTerm[] = [{
      year_level: 2,
      semester: 3,
      courses: [],
      totals: { lec: 0, lab: 0, tu: 0 },
    }];

    const sections = getCurriculumPrintSections(terms);

    expect(sections).toHaveLength(4);
    expect(sections[1].summer).toBe(terms[0]);
    expect(sections[0].firstSemester.courses).toEqual([]);
  });

  it('builds the formal program title from the saved program data', () => {
    expect(getPrintableProgramTitle(curriculum, {
      id: 2,
      code: 'BSIT',
      name: 'Information Technology',
      department_id: 1,
    })).toBe('BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY (BSIT)');
  });
});
