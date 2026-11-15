import { courseInCurriculum, placeCourse } from "./courseSlotPlan";
import type { Section, Subject } from "./types";

/** "1", "first", "1st Semester" → "1st"; "2"/"second" → "2nd"; anything with "summer" → "summer". */
export const normalizeSemester = (sem?: string | null): string => {
  if (!sem) return "";
  const s = String(sem).toLowerCase().trim();
  if (s === "1" || s === "1st" || s.includes("first") || s.includes("1st")) return "1st";
  if (s === "2" || s === "2nd" || s.includes("second") || s.includes("2nd")) return "2nd";
  if (s.includes("summer")) return "summer";
  return s;
};

/**
 * The courses a section must have placed: its own curriculum's courses for its year level and
 * semester, in its program and department (minors from any), never delegated-only courses.
 * Each section reads its own curriculum, so two sections of one year level may differ.
 */
export const coursesForSection = <T extends Subject>(section: Section, subjects: readonly T[]): T[] => {
  const sectionSemester = normalizeSemester(section.semester);
  return subjects.map((subject) => placeCourse(subject, section.curriculumId)).filter((s) => {
    if (s.delegatedOnly) return false;
    if (!courseInCurriculum(s, section.curriculumId)) return false;
    const isMinor = s.category === "minor";
    const matchesDept =
      isMinor ||
      s.departmentId === null ||
      Number(s.departmentId) === Number(section.departmentId);
    const matchesProgram =
      isMinor ||
      s.programId == null ||
      section.programId == null ||
      Number(s.programId) === Number(section.programId);
    const matchesYear = Number(s.yearLevel) === Number(section.yearLevel);
    const matchesSem =
      !sectionSemester ||
      !s.semester ||
      normalizeSemester(s.semester) === sectionSemester;
    return matchesDept && matchesProgram && matchesYear && matchesSem;
  });
};
