import { describe, expect, it } from 'vitest';
import { applyMapping, detectFormat, ImportFileError, readCsv, readTable, tableFromConvertedHtml, type TableSource } from './adapters';
import { buildDraft, groupTotals } from './draft';
import { TEMPLATE_HEADERS } from './tabular';

const extractionOf = (reading: ReturnType<typeof readTable>) => {
  if (!reading || reading.kind !== 'extraction') throw new Error(`expected an extraction, got ${reading?.kind ?? 'nothing'}`);
  return reading.extraction;
};

describe('CSV template', () => {
  it('handles a BOM, quoted commas, embedded newlines, and leading zeros as text', async () => {
    const csv = `\uFEFF${TEMPLATE_HEADERS.join(',')}\r\n`
      + '1,First Semester,IT 101,"Introduction, to Computing",2,1,3,none\r\n'
      + '1,2nd,GEC 01,"Readings in\nPhilippine History",3,0,3,\r\n'
      + '1,Summer,IT 102,Programming,2,,2,"IT 101"\r\n'
      + '1,Second Semester,TOTAL CREDITS,,3,0,3,\r\n';
    const extraction = extractionOf(readTable(await readCsv(csv)));

    expect(extraction.rows.map((row) => [row.source.code, row.semester])).toEqual([['IT 101', 1], ['GEC 01', 2], ['IT 102', 3]]);
    expect(extraction.rows[0].source.title).toBe('Introduction, to Computing');
    expect(extraction.rows[1].source.title).toBe('Readings in\nPhilippine History');
    expect(extraction.rows[2].source.lab).toBeNull();
    expect(extraction.rows[2].source.flags).toContain('blank_cell');
    expect(extraction.rows[0].source.provenance).toEqual({ kind: 'csv', record: 2 });
    expect(extraction.groups).toEqual([{ year_level: 1, semester: 2, reported: { lec: 3, lab: 0, tu: 3 } }]);
  });

  it('flags non-numeric credits instead of coercing them', async () => {
    const extraction = extractionOf(readTable(await readCsv(`${TEMPLATE_HEADERS.join(',')}\n1,1,IT 101,Intro,2.0x,1,3,`)));
    expect(extraction.rows[0].source.lec).toBeNull();
    expect(extraction.rows[0].source.flags).toContain('invalid_number');
  });

  it('asks for column mapping when required columns are missing or duplicated', async () => {
    const reading = readTable(await readCsv('Code,Course Title,Lec,Lab,Units,Units\nIT 101,Intro,2,1,3,3'));
    expect(reading?.kind).toBe('mapping');
    if (reading?.kind !== 'mapping') return;
    expect(reading.detection.missing).toEqual(['year_level', 'semester']);
    expect(reading.detection.ambiguous).toEqual(['tu']);

    const mapped = applyMapping(reading.table, reading.detection, { ...reading.detection.mapping, tu: 5 });
    expect(mapped.rows[0]).toMatchObject({ year_level: null, semester: null });
    expect(mapped.rows[0].source.flags).toEqual(expect.arrayContaining(['unmapped_year', 'unmapped_term']));
  });
});

describe('side-by-side grid layout (TCC workbook/document style)', () => {
  const grid: string[][] = [
    ['CMO 25, s 2015 NEW CURRICULUM EFFECTIVE SCHOOL YEAR 2020 - 2021'],
    ['BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY (BSIT)'],
    ['F I R S T   Y E A R'],
    ['Course Code', 'First Semester', 'Lec', 'Lab', 'TU', 'Preq', 'Course Code', 'Second Semester', 'Lec', 'Lab', 'TU', 'Preq'],
    ['IT 101', 'Introduction To Computing', '2', '1', '3', 'none', 'IT 104', 'IT Fundamentals', '3', '0', '3', 'IT 101'],
    ['', 'TOTAL CREDITS', '2', '1', '3', '', 'IT 105', 'Computer Programming 2', '2', '1', '3', 'IT 102'],
    ['', '', '', '', '', '', '', 'TOTAL CREDITS', '5', '1', '6', ''],
    ['S U M M E R'],
    ['Course Code', 'Summer', 'Lec', 'Lab', 'TU', 'Preq'],
    ['IT 117', 'Modeling', '2', '1', '3', 'IT108/109'],
  ];
  const table: TableSource = { format: 'xlsx', label: 'Sheet1', rows: grid, provenance: (row) => ({ kind: 'xlsx', sheet: 'Sheet1', row: row + 1 }), warnings: [] };

  it('assigns terms from each block label and keeps Summer distinct', () => {
    const extraction = extractionOf(readTable(table));
    expect(extraction.rows.map((row) => [row.source.code, row.year_level, row.semester])).toEqual([
      ['IT 101', 1, 1], ['IT 104', 1, 2], ['IT 105', 1, 2], ['IT 117', 1, 3],
    ]);
    expect(extraction.metadata).toMatchObject({ cmo_number: '25', cmo_series: 2015, effective_school_year: '2020-2021', program_code: 'BSIT' });
    expect(extraction.groups).toEqual([
      { year_level: 1, semester: 1, reported: { lec: 2, lab: 1, tu: 3 } },
      { year_level: 1, semester: 2, reported: { lec: 5, lab: 1, tu: 6 } },
      { year_level: 1, semester: 3, reported: null },
    ]);

    const totals = groupTotals(buildDraft(extraction, { filename: 'a.xlsx', size_bytes: 1, sha256: 'a'.repeat(64) }));
    expect(totals.find((group) => group.semester === 3)).toMatchObject({ reported: null, calculated: { lec: 2, lab: 1, tu: 3 } });
  });
});

describe('curricula whose code column is labelled differently, or not at all', () => {
  const sheet = (rows: string[][]): TableSource => ({ format: 'xlsx', label: 'Sheet1', rows, provenance: (row) => ({ kind: 'xlsx', sheet: 'Sheet1', row: row + 1 }), warnings: [] });
  const placed = (reading: ReturnType<typeof readTable>) => extractionOf(reading).rows.map((row) => [row.source.code, row.source.title, row.year_level, row.semester, row.source.lec, row.source.lab, row.source.tu]);

  it.each([['Subj Code'], ['Subj. Code'], ['SubjCode'], ['Subj.Code'], ['SUBJCODE'], ['subj.code'], ['Subjects'], ['Subject Code'], ['Course No.'], ['Code']])('reads a grid whose code column is headed "%s"', (label) => {
    const reading = readTable(sheet([
      ['BACHELOR OF ELEMENTARY EDUCATION (BEEd)'],
      ['FIRST YEAR'],
      [label, 'First Semester', 'Lec', 'Lab', 'Units', 'Pre-requisite', label, 'Second Semester', 'Lec', 'Lab', 'Units', 'Pre-requisite'],
      ['EDUC 101', 'The Child and Adolescent Learner', '3', '0', '3', '', 'EDUC 102', 'Facilitating Learner-Centered Teaching', '3', '0', '3', 'EDUC 101'],
    ]));
    expect(placed(reading)).toEqual([
      ['EDUC 101', 'The Child and Adolescent Learner', 1, 1, 3, 0, 3],
      ['EDUC 102', 'Facilitating Learner-Centered Teaching', 1, 2, 3, 0, 3],
    ]);
    expect(extractionOf(reading).rows[1].source.prerequisites).toBe('EDUC 101');
  });

  it('reads a grid with no code header, taking codes from the column before the title', () => {
    const reading = readTable(sheet([
      ['BACHELOR OF SCIENCE IN BUSINESS ADMINISTRATION (BSBA)'],
      ['FIRST YEAR'],
      ['', 'First Semester', 'Lec', 'Lab', 'TU', '', 'Second Semester', 'Lec', 'Lab', 'TU'],
      ['BA 101', 'Basic Microeconomics', '3', '0', '3', 'BA 104', 'Human Resource Management', '3', '0', '3'],
      ['GEC 01', 'Understanding the Self', '3', '0', '3', '', 'TOTAL CREDITS', '3', '0', '3'],
      ['', 'TOTAL CREDITS', '6', '0', '6'],
    ]));
    expect(placed(reading)).toEqual([
      ['BA 101', 'Basic Microeconomics', 1, 1, 3, 0, 3],
      ['BA 104', 'Human Resource Management', 1, 2, 3, 0, 3],
      ['GEC 01', 'Understanding the Self', 1, 1, 3, 0, 3],
    ]);
    expect(extractionOf(reading).groups).toEqual([
      { year_level: 1, semester: 2, reported: { lec: 3, lab: 0, tu: 3 } },
      { year_level: 1, semester: 1, reported: { lec: 6, lab: 0, tu: 6 } },
    ]);
  });

  it('takes the term from a combined heading when the table has no semester label', () => {
    const reading = readTable(sheet([
      ['First Year - Second Semester'],
      ['Subject', 'Descriptive Title', 'Lec Units', 'Lab Units', 'Total Units'],
      ['CRIM 102', 'Fundamentals of Criminal Investigation', '3', '0', '3'],
    ]));
    expect(placed(reading)).toEqual([['CRIM 102', 'Fundamentals of Criminal Investigation', 1, 2, 3, 0, 3]]);
  });

  it.each([['Subj Code'], ['Subj.Code'], ['SubjCode']])('reads a flat template whose code column is headed "%s" without asking for mapping', async (label) => {
    const reading = readTable(await readCsv(`Year Level,Term,${label},Descriptive Title,Lec,Lab,Units\n1,First Semester,EDUC 101,The Child and Adolescent Learner,3,0,3`));
    expect(placed(reading)).toEqual([['EDUC 101', 'The Child and Adolescent Learner', 1, 1, 3, 0, 3]]);
  });

  it('does not take a line that only mentions Lec/Lab/Units, with no codes under it, for a table', () => {
    expect(readTable(sheet([['', 'Note', 'Lec', 'Lab', 'Units'], ['', 'Units are per week', '', '', '']]))).toBeNull();
  });
});

describe('other curriculum templates', () => {
  const sheet = (rows: string[][]): TableSource => ({ format: 'xlsx', label: 'Sheet1', rows, provenance: (row) => ({ kind: 'xlsx', sheet: 'Sheet1', row: row + 1 }), warnings: [] });
  const placed = (reading: ReturnType<typeof readTable>) => extractionOf(reading).rows.map((row) => [row.source.code, row.year_level, row.semester, row.source.lec, row.source.lab, row.source.tu]);

  it('reads one table per term under separate year and term headings', () => {
    const reading = readTable(sheet([
      ['BACHELOR OF SCIENCE IN CRIMINOLOGY (BSCrim)'],
      ['FIRST YEAR'],
      ['First Semester'],
      ['Course Code', 'Descriptive Title', 'Lec', 'Lab', 'Units', 'Pre-requisite'],
      ['CRIM 101', 'Introduction to Criminology', '3', '0', '3', 'None'],
      ['', 'Total', '3', '0', '3', ''],
      ['Second Semester'],
      ['Course Code', 'Descriptive Title', 'Lec', 'Lab', 'Units', 'Pre-requisite'],
      ['CRIM 102', 'Theories of Crime Causation', '3', '0', '3', 'CRIM 101'],
      ['Year 2'],
      ['1st Sem.'],
      ['Course Code', 'Descriptive Title', 'Lec', 'Lab', 'Units', 'Pre-requisite'],
      ['CRIM 201', 'Forensic Photography', '2', '1', '3', ''],
    ]));
    expect(placed(reading)).toEqual([['CRIM 101', 1, 1, 3, 0, 3], ['CRIM 102', 1, 2, 3, 0, 3], ['CRIM 201', 2, 1, 2, 1, 3]]);
    expect(extractionOf(reading).groups[0]).toEqual({ year_level: 1, semester: 1, reported: { lec: 3, lab: 0, tu: 3 } });
  });

  it('reads a two-row header with Units over Lec | Lab | Total', () => {
    const reading = readTable(sheet([
      ['Second Semester - Second Year'],
      ['Subject Code', 'Descriptive Title', 'Units', '', '', 'Pre-requisite'],
      ['', '', 'Lec', 'Lab', 'Total', ''],
      ['EDUC 202', 'Assessment in Learning 1', '2', '1', '3', 'EDUC 101'],
    ]));
    expect(placed(reading)).toEqual([['EDUC 202', 2, 2, 2, 1, 3]]);
    expect(extractionOf(reading).rows[0].source).toMatchObject({ title: 'Assessment in Learning 1', prerequisites: 'EDUC 101' });
  });

  it('reads the unit columns when a table prints contact hours too', () => {
    const reading = readTable(sheet([
      ['THIRD YEAR'],
      ['Course Code', 'First Semester', 'Lec Hrs', 'Lab Hrs', 'Lec Units', 'Lab Units', 'Total Units'],
      ['NCM 101', 'Health Assessment', '2', '3', '2', '1', '3'],
    ]));
    expect(placed(reading)).toEqual([['NCM 101', 3, 1, 2, 1, 3]]);
  });

  it('reads a table that prints only total units, flagging the split for review and starting it as lecture', () => {
    const reading = readTable(sheet([
      ['FOURTH YEAR, FIRST SEMESTER'],
      ['Subject Code', 'Description', 'Units'],
      ['BA 401', 'Strategic Management', '3'],
      ['', 'Total Units', '3'],
    ]));
    const extraction = extractionOf(reading);
    expect(placed(reading)).toEqual([['BA 401', 4, 1, null, null, 3]]);
    expect(extraction.rows[0].source.flags).toContain('units_only');
    const draft = buildDraft(extraction, { filename: 'ba.xlsx', size_bytes: 1, sha256: 'a'.repeat(64) });
    expect(draft.rows[0]).toMatchObject({ lecture_units: 3, lab_units: 0, total_units: 3 });
  });

  it('reads a flat template with only a Units column without asking for column mapping', async () => {
    const reading = readTable(await readCsv('Year,Semester,Subj Code,Subject Description,No. of Units\n1,1st Sem,GEC 01,Understanding the Self,3'));
    expect(placed(reading)).toEqual([['GEC 01', 1, 1, null, null, 3]]);
    expect(extractionOf(reading).rows[0].source.flags).toContain('units_only');
  });
});

describe('DOCX semantic tables', () => {
  it('reads cell text from an inert document and ignores links, scripts, and images', () => {
    const html = '<h1>F I R S T Y E A R</h1>'
      + '<table><tr><td>Course Code</td><td>First Semester</td><td>Lec</td><td>Lab</td><td>TU</td><td>Preq</td></tr>'
      + '<tr><td><a href="javascript:alert(1)">IT 101</a></td><td>Intro<img src="x" onerror="window.__pwned=1"><script>window.__pwned=1</script></td><td>2</td><td>1</td><td>3</td><td>none</td></tr>'
      + '<tr><td colspan="2">TOTAL CREDITS</td><td>2</td><td>1</td><td>3</td><td></td></tr></table>';
    const table = tableFromConvertedHtml(html);
    const extraction = extractionOf(readTable(table));

    expect(extraction.rows).toHaveLength(1);
    expect(extraction.rows[0].source).toMatchObject({ code: 'IT 101', title: 'Intro', lec: 2, lab: 1, tu: 3 });
    expect(extraction.rows[0].source.provenance).toEqual({ kind: 'docx', table: 1, row: 2 });
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(table.warnings.some((warning) => warning.includes('merged cells'))).toBe(true);
  });

  it('reports a document without tables', () => {
    expect(tableFromConvertedHtml('<p>No tables here</p>').warnings.join(' ')).toMatch(/no tables/);
  });
});

describe('file intake', () => {
  const bytes = (...values: number[]) => new Uint8Array(values).buffer;

  it('requires a supported extension that agrees with the file signature', () => {
    expect(detectFormat('c.pdf', bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('pdf');
    expect(detectFormat('c.xlsx', bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe('xlsx');
    expect(() => detectFormat('c.pdf', bytes(0x50, 0x4b, 0x03, 0x04))).toThrow(ImportFileError);
    expect(() => detectFormat('c.xlsm', bytes(0x50, 0x4b, 0x03, 0x04))).toThrow(/not supported/);
    expect(() => detectFormat('c.doc', bytes(1))).toThrow(/not supported/);
    expect(() => detectFormat('c.csv', new ArrayBuffer(0))).toThrow(/empty/);
    expect(() => detectFormat('c.csv', new ArrayBuffer(10 * 1024 * 1024 + 1))).toThrow(/10 MiB/);
  });
});

describe('notes in tabular sources', () => {
  it('keeps CSV notes as text with no colour, since CSV has none, and never as a course', async () => {
    const csv = `${TEMPLATE_HEADERS.join(',')}\n1,First Semester,IT 101,Intro,2,1,3,none\n"Note: Math prep for GAS, HUMSS, ABM",,,,,,,\ntaken in the first semester only,,,,,,,\n`;
    const extraction = extractionOf(readTable(await readCsv(csv)));
    expect(extraction.rows.map((row) => row.source.code)).toEqual(['IT 101']);
    expect(extraction.notes).toEqual([{
      id: 'n1',
      source_text: 'Note: Math prep for GAS, HUMSS, ABM\ntaken in the first semester only',
      text: 'Note: Math prep for GAS, HUMSS, ABM\ntaken in the first semester only',
      runs: [{ length: 68, color: null }],
      scope: { level: 'curriculum' },
      provenance: { kind: 'csv', record: 3 },
      flags: [],
    }]);
  });

  it('marks XLSX and DOCX note colours unknown, because their readers drop styling, and reports DOCX images', () => {
    const rows = [
      ['F I R S T   Y E A R'],
      ['Course Code', 'First Semester', 'Lec', 'Lab', 'TU', 'Preq'],
      ['IT 101', 'Intro', '2', '1', '3', 'none'],
      ['', 'TOTAL CREDITS', '2', '1', '3', ''],
      ['_____Note: Math prep for non-STEM entrants'],
    ];
    const xlsx = extractionOf(readTable({ format: 'xlsx', label: 'Sheet1', rows, provenance: (row) => ({ kind: 'xlsx', sheet: 'Sheet1', row: row + 1 }), warnings: [] }));
    expect(xlsx.notes![0]).toMatchObject({ source_text: '_____Note: Math prep for non-STEM entrants', text: 'Note: Math prep for non-STEM entrants', scope: { level: 'year', year_level: 1 }, flags: ['color_unknown'] });

    const html = '<h1>F I R S T Y E A R</h1>'
      + '<table><tr><td>Course Code</td><td>First Semester</td><td>Lec</td><td>Lab</td><td>TU</td><td>Preq</td></tr>'
      + '<tr><td>IT 101</td><td>Intro</td><td>2</td><td>1</td><td>3</td><td>none</td></tr></table>'
      + '<p>Note: see the attached scan.</p><p><img src=""></p>';
    const docx = extractionOf(readTable(tableFromConvertedHtml(html)));
    expect(docx.notes![0]).toMatchObject({ text: 'Note: see the attached scan.', flags: ['color_unknown'] });
    expect(docx.unread).toEqual([{ reason: 'image' }]);
  });

  it('turns legacy string notes into plain notes in the draft without inventing colour or place', () => {
    const draft = buildDraft(
      { format: 'csv', extractor_version: 'old', metadata: { name: null, program_text: null, program_code: null, cmo_number: null, cmo_series: null, effective_school_year: null, notes: ['Note: legacy'] }, groups: [], rows: [], warnings: [] },
      { filename: 'old.csv', size_bytes: 1, sha256: 'a'.repeat(64) },
    );
    expect(draft.notes).toEqual([{ id: 'n1', source_text: 'Note: legacy', text: 'Note: legacy', runs: [{ length: 12, color: null }], scope: { level: 'curriculum' }, provenance: null, flags: [] }]);
    expect(draft.unread).toEqual([]);
  });
});
