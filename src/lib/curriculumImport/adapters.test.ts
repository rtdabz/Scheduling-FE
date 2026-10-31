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
