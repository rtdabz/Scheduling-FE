import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/tcc_bsit_pdf_text.json';
import { extractCurriculumLayout, type PdfPageText, type PdfTextItem } from './pdfLayout';
import { buildDraft, groupTotals, localProblems } from './draft';

// Text items produced by PDF.js from TCC_BSIT_active_curriculum-1.pdf (SHA-256 in the fixture).
const pages = fixture.pages as PdfPageText[];
const extraction = extractCurriculumLayout(pages);
const find = (code: string) => extraction.rows.find((row) => row.source.code === code)!;

describe('TCC curriculum PDF layout', () => {
  it('reads the header metadata without inventing values', () => {
    expect(extraction.metadata).toMatchObject({
      cmo_number: '25',
      cmo_series: 2015,
      effective_school_year: '2020-2021',
      program_code: 'BSIT',
      program_text: 'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY (BSIT)',
    });
    expect(extraction.metadata.notes).toEqual([
      'Note: Math prep(Pre-Calculus for NON-STEM(Algebra & Trigo) for GAS, HUMSS, ABM to be taken only',
    ]);
    expect(extraction.warnings).toEqual([]);
  });

  it('keeps the red First Year note exactly, with its #C00000 colour, raw form blanks and position', () => {
    const text = 'Note: Math prep(Pre-Calculus for NON-STEM(Algebra & Trigo) for GAS, HUMSS, ABM to be taken only';
    expect(extraction.notes).toEqual([{
      id: 'n1',
      source_text: `_______${text}`,
      text,
      runs: [{ length: [...text].length, color: '#C00000' }],
      scope: { level: 'year', year_level: 1 },
      provenance: { kind: 'pdf', page: 1, bbox: expect.any(Array) },
      flags: [],
    }]);
    // The letterhead colours, the course rows and the evaluation form are not notes, and nothing is left unread.
    expect(extraction.unread).toEqual([]);
  });

  it('accounts for all 59 course rows across ten populated groups, with no Year 1 or Year 4 Summer', () => {
    expect(extraction.rows).toHaveLength(59);
    const counts = new Map<string, number>();
    for (const row of extraction.rows) counts.set(`${row.year_level}-${row.semester}`, (counts.get(`${row.year_level}-${row.semester}`) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({
      '1-1': 6, '1-2': 6, '2-1': 7, '2-2': 9, '2-3': 3,
      '3-1': 9, '3-2': 10, '3-3': 3, '4-1': 5, '4-2': 1,
    });
    expect(extraction.groups.map((group) => `${group.year_level}-${group.semester}`)).not.toContain('1-3');
    expect(extraction.groups.map((group) => `${group.year_level}-${group.semester}`)).not.toContain('4-3');
  });

  it('excludes form furniture, total rows, and notes from course rows', () => {
    const codes = extraction.rows.map((row) => row.source.code.toUpperCase());
    expect(codes.some((code) => /TOTAL|NOTE|ID NUMBER|NAME|EVALUAT|SIGNATURE/.test(code))).toBe(false);
  });

  it('keeps the Second Year Summer prerequisite column that extends past the page midpoint', () => {
    expect(find('IT 117').source.prerequisites).toBe('IT108/109/110/112');
    expect(find('IT 118').source.prerequisites).toBe('IT115');
    expect(find('IT Elec 1').source.prerequisites).toBe('IT109/110/116');
    expect(find('IT 117').semester).toBe(3);
  });

  it('reads GEC 1 and IT 108 credits cleanly in PDF.js, unlike the merged pdfplumber fragments', () => {
    expect(find('GEC 1').source).toMatchObject({ lec: 3, lab: 0, tu: 3 });
    expect(find('IT 108').source).toMatchObject({ lec: 2, lab: 1, tu: 3 });
    expect(find('GEC 1').source.flags).not.toContain('ambiguous_units');
  });

  it('retains look-alike codes exactly and flags them for review', () => {
    for (const code of ['I1 125', 'PATH FITt 2', 'PATH FiIT3']) {
      expect(find(code).source.flags).toContain('suspicious_code');
    }
    expect(find('GEE11').source.code).toBe('GEE11');
    expect(find('ROTC/CWTS 102').source.prerequisites).toBe('R101');
  });

  it('joins the wrapped practicum condition and keeps its 486 hours only in the source title', () => {
    expect(find('Prac 101').source).toMatchObject({
      title: 'Practicum (486 hours)',
      lec: 6,
      lab: 0,
      tu: 6,
      prerequisites: '100% Completed Core Courses',
    });
    expect(find('Prac 101').year_level).toBe(4);
    expect(find('Prac 101').semester).toBe(2);
  });

  it('detects 176 row-derived credits versus 173 from printed term totals, and the Third Year Second Semester 27 versus 30', () => {
    const draft = buildDraft(extraction, { filename: 'tcc.pdf', size_bytes: 1, sha256: 'a'.repeat(64) });
    const totals = groupTotals(draft);
    const calculated = totals.reduce((sum, group) => ({ lec: sum.lec + group.calculated.lec, lab: sum.lab + group.calculated.lab, tu: sum.tu + group.calculated.tu }), { lec: 0, lab: 0, tu: 0 });
    const printed = totals.reduce((sum, group) => sum + (group.reported?.tu ?? 0), 0);
    expect(calculated).toEqual({ lec: 147, lab: 29, tu: 176 });
    expect(printed).toBe(173);

    const thirdSecond = totals.find((group) => group.year_level === 3 && group.semester === 2)!;
    expect(thirdSecond.reported).toEqual({ lec: 23, lab: 4, tu: 27 });
    expect(thirdSecond.calculated).toEqual({ lec: 26, lab: 4, tu: 30 });
    const mismatched = totals.filter((group) => JSON.stringify(group.reported) !== JSON.stringify(group.calculated));
    expect(mismatched.map((group) => group.label)).toEqual(['Year 3 · Second Semester']);
  });

  it('builds a draft that suggests, but never applies, code corrections and keeps prerequisites verbatim', () => {
    const draft = buildDraft(extraction, { filename: 'tcc.pdf', size_bytes: 1, sha256: 'a'.repeat(64) });
    const byCode = (code: string) => draft.rows.find((row) => row.source.code === code)!;
    expect(byCode('I1 125')).toMatchObject({ code: 'I1 125', code_suggestion: 'IT 125' });
    expect(byCode('PATH FITt 2')).toMatchObject({ code: 'PATH FITt 2', code_suggestion: 'PATH FIT 2' });
    expect(draft.rows.every((row) => row.prerequisites === row.source.prerequisites)).toBe(true);
    expect(byCode('IT 113').prerequisites).toBe('IT108/109/110');
    expect(byCode('Prac 101').prerequisites).toBe('100% Completed Core Courses');
    expect(byCode('Prac 101').scheduling_basis).toBeNull();
    expect(draft.rows.every((row) => row.category === null)).toBe(true);
    expect(localProblems(draft)).toEqual([]);
  });

  it('flags merged or repeated numeric runs instead of splitting them', () => {
    const item = (str: string, x: number, y: number, width = 4): PdfTextItem => ({ page: 1, str, x, y, width, height: 8 });
    const result = extractCurriculumLayout([{
      page: 1, width: 612, height: 400, items: [
        item('F I R S T  Y E A R', 220, 40, 150),
        item('Course Code', 28.8, 60, 37), item('First Semester', 120, 60, 36),
        item('Lec', 207.6, 60, 9), item('Lab', 221.9, 60, 9.3), item('TU', 237.6, 60, 7), item('Preq', 268.6, 60, 9.4),
        item('_____GEC 1', 23.4, 72, 34), item('Understanding the Self', 72.8, 72, 73), item('3', 210.2, 72), item('3 03', 222, 72, 12), item('none', 268.2, 72, 10),
      ],
    }]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].source.flags).toContain('ambiguous_units');
    expect(result.rows[0].source.lab).toBeNull();
  });

  it('asks for mapping when a table has no enclosing year heading', () => {
    const result = extractCurriculumLayout([{
      page: 1, width: 612, height: 400, items: [
        { page: 1, str: 'Course Code', x: 28.8, y: 60, width: 37, height: 7 },
        { page: 1, str: 'First Semester', x: 120, y: 60, width: 36, height: 7 },
        { page: 1, str: 'Lec', x: 207.6, y: 60, width: 9, height: 7 },
        { page: 1, str: 'Lab', x: 221.9, y: 60, width: 9, height: 7 },
        { page: 1, str: 'TU', x: 237.6, y: 60, width: 7, height: 7 },
        { page: 1, str: 'IT 101', x: 23.4, y: 72, width: 30, height: 7 },
        { page: 1, str: '2', x: 210.2, y: 72, width: 4, height: 8 },
        { page: 1, str: '1', x: 224.8, y: 72, width: 4, height: 8 },
        { page: 1, str: '3', x: 239.3, y: 72, width: 4, height: 8 },
      ],
    }]);
    expect(result.rows[0].year_level).toBeNull();
    expect(result.rows[0].source.flags).toContain('unmapped_year');
    expect(result.warnings.some((warning) => warning.includes('year'))).toBe(true);
  });

  describe('notes beyond the sample', () => {
    const item = (str: string, x: number, y: number, colors?: PdfTextItem['colors'], width = 60): PdfTextItem => ({ page: 1, str, x, y, width, height: 8, colors });
    const black = (str: string) => [{ length: [...str].length, color: '#000000' }];
    const table = [
      item('F I R S T  Y E A R', 220, 40, black('F I R S T  Y E A R'), 150),
      item('Course Code', 28.8, 60, black('Course Code'), 37), item('First Semester', 120, 60, black('First Semester'), 36),
      item('Lec', 207.6, 60, black('Lec'), 9), item('Lab', 221.9, 60, black('Lab'), 9.3), item('TU', 237.6, 60, black('TU'), 7),
      item('IT 101', 23.4, 72, black('IT 101'), 30), item('Intro', 72.8, 72, black('Intro'), 40),
      item('2', 210.2, 72, black('2'), 4), item('1', 224.8, 72, black('1'), 4), item('3', 239.3, 72, black('3'), 4),
      item('TOTAL CREDITS', 118, 82, black('TOTAL CREDITS'), 50), item('2', 210.2, 82, black('2'), 4), item('1', 224.8, 82, black('1'), 4), item('3', 239.3, 82, black('3'), 4),
    ];
    const run = (items: PdfTextItem[], images?: [number, number, number, number][]) => extractCurriculumLayout([{ page: 1, width: 612, height: 400, items: [...table, ...items], images }]);

    it('joins a multiline note with line breaks and keeps mixed colours on the right characters', () => {
      const result = run([
        item('Note: Practicum ', 23, 95, [{ length: 6, color: '#000000' }, { length: 10, color: '#C00000' }]),
        item('requires 486 hours', 23, 104, [{ length: 18, color: '#C00000' }]),
        item('and an endorsement.', 23, 113, black('and an endorsement.')),
        item('Evaluation Details', 230, 300, black('Evaluation Details')),
        item('Evaluators', 135, 318, black('Evaluators')), item('Signature', 401, 318, black('Signature')),
      ]);
      expect(result.notes).toHaveLength(1);
      const [note] = result.notes!;
      // Text is kept as laid out, including the space that ends the first line.
      expect(note.text).toBe('Note: Practicum \nrequires 486 hours\nand an endorsement.');
      expect(note.runs).toEqual([{ length: 6, color: '#000000' }, { length: 29, color: '#C00000' }, { length: 20, color: '#000000' }]);
      expect(note.scope).toEqual({ level: 'year', year_level: 1 });
      expect(note.flags).toEqual([]);
      // The evaluation form is furniture, not a note and not unread text.
      expect(result.unread).toEqual([]);
    });

    it('keeps separate notes, including coloured text outside any table, in source order', () => {
      const result = run([
        item('* Electives follow the approved list.', 23, 95, black('* Electives follow the approved list.')),
        item('Approved by the Board, 2020.', 300, 380, [{ length: 28, color: '#1F4E79' }]),
      ]);
      expect(result.notes!.map((note) => [note.text, note.runs[0].color, note.scope.level])).toEqual([
        ['* Electives follow the approved list.', '#000000', 'year'],
        ['Approved by the Board, 2020.', '#1F4E79', 'year'],
      ]);
    });

    it('flags unknown colours and reports unread text and body images instead of dropping them', () => {
      const result = run(
        [item('Note: colour lost', 23, 95, null), item('Prepared for the registrar only', 23, 200, black('Prepared for the registrar only'))],
        [[100, 10, 180, 30], [40, 150, 300, 220]],
      );
      expect(result.notes![0].flags).toEqual(['color_unknown']);
      expect(result.notes![0].runs).toEqual([{ length: 17, color: null }]);
      expect(result.unread).toEqual([
        { reason: 'unrecognized_text', page: 1, bbox: expect.any(Array), text: 'Prepared for the registrar only' },
        // The letterhead image above the tables is ignored; the one in the course area is reported.
        { reason: 'image', page: 1, bbox: [40, 150, 300, 220] },
      ]);
    });
  });

  it('reports a text-less PDF as needing OCR rather than an empty success', () => {
    const result = extractCurriculumLayout([{ page: 1, width: 612, height: 792, items: [] }]);
    expect(result.rows).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/OCR/);
  });
});
