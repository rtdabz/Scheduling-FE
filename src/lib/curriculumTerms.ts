import type { CurriculumSemester } from '../types/curriculum';

export type YearLevelStats = Record<number, { courses: number; units: number; lec: number; lab: number }>;

/** Course and credit totals for each year level (1st–4th), as the curriculum year picker shows them. */
export function yearLevelStatsFor(semesters: CurriculumSemester[]): YearLevelStats {
  const stats: YearLevelStats = {
    1: { courses: 0, units: 0, lec: 0, lab: 0 },
    2: { courses: 0, units: 0, lec: 0, lab: 0 },
    3: { courses: 0, units: 0, lec: 0, lab: 0 },
    4: { courses: 0, units: 0, lec: 0, lab: 0 },
  };

  semesters.forEach((term) => {
    const year = stats[term.year_level];
    if (!year) return;
    year.courses += term.courses.length;
    year.units += term.totals.tu;
    year.lec += term.totals.lec;
    year.lab += term.totals.lab;
  });

  return stats;
}

/** First Semester, Second Semester and Summer for one year level, with empty terms filled in. */
export function termsForYear(semesters: CurriculumSemester[], yearLevel: number): CurriculumSemester[] {
  return [1, 2, 3].map((semester) =>
    semesters.find((term) => term.year_level === yearLevel && term.semester === semester) ?? {
      year_level: yearLevel,
      semester,
      courses: [],
      totals: { lec: 0, lab: 0, tu: 0 },
    },
  );
}
