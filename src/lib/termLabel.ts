/**
 * Human labels for an academic term.
 *
 * The `terms` table stores only `academic_year` and `semester` ('1st' | '2nd' |
 * 'summer') -- there is no `term_name` column and no accessor for one, so every
 * `term.term_name` in the UI renders blank. The label is built here instead.
 */
export interface LabelledTerm {
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

/** '1st Semester, AY 2026-2027' -- the year is dropped when unknown. */
export const termLabel = (term?: LabelledTerm | null): string => {
  if (!term) return 'No active term';
  const year = academicYearLabel(term.academic_year);
  const semester = semesterLabel(term.semester);
  return year ? `${semester}, ${year}` : semester;
};
