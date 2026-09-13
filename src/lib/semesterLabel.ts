/**
 * Human labels for an academic semester.
 *
 * The `semesters` table stores only `academic_year` and `semester` ('1st' | '2nd' |
 * 'summer') -- there is no `semester_name` column and no accessor for one, so every
 * `semester.semester_name` in the UI renders blank. The label is built here instead.
 */
export interface LabelledSemester {
  academic_year?: string | null;
  semester?: string | null;
}

const SEMESTER_LABELS: Record<string, string> = {
  '1st': '1st Semester',
  '2nd': '2nd Semester',
  summer: 'Summer',
};

/** 'summer' has no ordinal, so it is titled rather than suffixed. */
export const semesterLabel = (semester?: string | null): string => {
  const key = (semester ?? '').trim().toLowerCase();
  if (!key) return 'Unset semester';
  return SEMESTER_LABELS[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
};

export const academicYearLabel = (academicYear?: string | null): string => {
  const year = (academicYear ?? '').trim();
  return year ? `AY ${year}` : '';
};

export const yearLevelLabel = (yearLevel?: number | string | null): string => {
  const year = Number(yearLevel);
  if (!Number.isInteger(year) || year < 1) return '—';
  const suffix = year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th';

  return `${year}${suffix} Year`;
};

/** '1st Semester, AY 2026-2027' -- the year is dropped when unknown. */
export const fullSemesterLabel = (semester?: LabelledSemester | null): string => {
  if (!semester) return 'No active semester';
  const year = academicYearLabel(semester.academic_year);
  const period = semesterLabel(semester.semester);
  return year ? `${period}, ${year}` : period;
};
