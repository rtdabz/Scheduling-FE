import JsPdf from 'jspdf';
import { describe, expect, it } from 'vitest';
import { createCurriculumPdfDocument, getCurriculumPrintSections, getPrintableProgramTitle, getCurriculumPdfFilename } from './curriculumPrintable';
import fixture from './curriculumImport/__fixtures__/tcc_bsit_pdf_text.json';
import { extractCurriculumLayout } from './curriculumImport/pdfLayout';
import type { Curriculum, CurriculumSemester } from '../types/curriculum';

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
  it('names the PDF using the curriculum code and effective school year', () => {
    expect(getCurriculumPdfFilename(curriculum)).toBe('curriculum-CMO-25-2026-2027.pdf');
  });
  it('creates all four year sections and preserves empty semesters', () => {
    const semesters: CurriculumSemester[] = [{
      year_level: 2,
      semester: 3,
      courses: [],
      totals: { lec: 0, lab: 0, tu: 0 },
    }];

    const sections = getCurriculumPrintSections(semesters);

    expect(sections).toHaveLength(4);
    expect(sections[1].summer).toBe(semesters[0]);
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

describe('source notes in the printed curriculum', () => {
  // The 59 TCC courses as a saved curriculum would return them.
  const extraction = extractCurriculumLayout(fixture.pages as never);
  const semesters: CurriculumSemester[] = [];
  extraction.rows.forEach((row, index) => {
    let semester = semesters.find((candidate) => candidate.year_level === row.year_level && candidate.semester === row.semester);
    if (!semester) semesters.push(semester = { year_level: row.year_level!, semester: row.semester!, courses: [], totals: { lec: 0, lab: 0, tu: 0 } });
    semester.courses.push({ id: index + 1, code: row.source.code, title: row.source.title, lec_units: row.source.lec ?? 0, lab_units: row.source.lab ?? 0, total_units: row.source.tu ?? 0 });
  });
  const text = 'Note: Math prep(Pre-Calculus for NON-STEM(Algebra & Trigo) for GAS, HUMSS, ABM to be taken only';
  const pdfString = (value: string) => value.replace(/[()\\]/g, (ch) => `\\${ch}`);
  const render = (notes: Curriculum['notes']) => {
    const doc = createCurriculumPdfDocument(JsPdf, { curriculum: { ...curriculum, notes }, semesters }, null, null, null);
    return { doc, output: doc.output() };
  };

  it('prints the red First Year note beneath First Year in #C00000, keeping every course', () => {
    const { doc, output } = render([{ id: 'n1', text, source_text: `_______${text}`, runs: [{ length: [...text].length, color: '#C00000' }], scope: { level: 'year', year_level: 1 } }]);
    const at = output.indexOf(`(_______${pdfString(text)}) Tj`);
    expect(at).toBeGreaterThan(output.indexOf('(F   I   R   S   T       Y   E   A   R)'));
    expect(at).toBeLessThan(output.indexOf('(S   E   C   O   N   D       Y   E   A   R)'));
    // 192/255 red, no green or blue, set just before the note's text.
    expect(output.slice(output.lastIndexOf(' rg', at) - 20, at)).toMatch(/0\.75\d* 0\.? 0\.? rg/);
    expect(extraction.rows.every((row) => output.includes(pdfString(row.source.code)))).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('wraps long multiline mixed-colour notes onto extra pages instead of clipping them', () => {
    const long = Array.from({ length: 60 }, (_, index) => `Line ${index + 1}: electives follow the list approved by the curriculum committee for this program.`).join('\n');
    const { doc, output } = render([{ id: 'n2', text: long, source_text: long, runs: [{ length: 5, color: '#1F4E79' }, { length: [...long].length - 5, color: null }], scope: { level: 'curriculum' } }]);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(output).toContain('(Line ) Tj');
    expect(output).toContain('(Line 60: electives follow the list approved by the curriculum committee for this program.) Tj');
    expect(output).toMatch(/0\.12\d* 0\.30\d* 0\.47\d* rg/);
  });
});
