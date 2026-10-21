import { describe, expect, it } from "vitest";

import { buildPrintSemesterTitle } from "./printScheduleFormat";
import { getSchedulePdfFilename, type SchedulePdfInput } from "./schedulePdf";
import type { Section } from "./types";

const section = (id: string, departmentId: number, semesterId = 7): Section => ({
  id, departmentId, semesterId, name: `Section ${id}`, yearLevel: 1, semester: '1st', status: 'active',
});

describe('schedule download filenames', () => {
  const input: SchedulePdfInput = {
    sections: [section('1', 1), section('2', 2), section('3', 3, 6)],
    allSchedules: [], selectedSectionId: '1', users: [],
    departments: [
      { id: 1, department_code: 'CIT', department_name: 'Information Technology' },
      { id: 2, department_code: 'CBA', department_name: 'Business' },
    ],
    activeSemester: { id: 7, academic_year: '2026-2027', semester: '1st', is_active: true },
  };

  it('names the department that is actually printed rather than the selected section', () => {
    expect(getSchedulePdfFilename(input)).toBe('class-schedule-CIT-2026-2027-1st.pdf');
  });

  it('names multi-department exports and excludes other semesters from scope', () => {
    expect(getSchedulePdfFilename({ ...input, printAllSections: true })).toBe('class-schedule-all-departments-2026-2027-1st.pdf');
    expect(getSchedulePdfFilename({ ...input, sections: [section('1', 1), section('3', 3, 6)], printAllSections: true }))
      .toBe('class-schedule-CIT-2026-2027-1st.pdf');
  });

  it('supports missing semester metadata without undefined filename fragments', () => {
    expect(getSchedulePdfFilename({ ...input, activeSemester: null })).toBe('class-schedule-CIT.pdf');
  });
});

describe("buildPrintSemesterTitle", () => {
  it("uses the scheduler active semester in the print heading", () => {
    expect(buildPrintSemesterTitle({
      id: 7,
      academic_year: "2026-2027",
      semester: "1st",
      is_active: true,
    })).toBe("CLASS SCHEDULE AY 2026-2027    1st Semester");
  });

  it("supports the summer semester label", () => {
    expect(buildPrintSemesterTitle({
      id: 8,
      academic_year: "2026-2027",
      semester: "summer",
      is_active: true,
    })).toBe("CLASS SCHEDULE AY 2026-2027    Summer");
  });
});
