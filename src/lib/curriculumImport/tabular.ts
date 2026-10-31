import { isSuspiciousCode, isSummerHeading, parseCredit, parseTerm, parseYearLevel, stripFormBlanks, termOf, yearHeading } from './normalize';
import type { Extraction, ExtractedGroup, ExtractedRow, ExtractionFlag, ImportFormat, PlacementTerm, Provenance, ReportedTotals } from './types';

export const TABULAR_EXTRACTOR_VERSION = 'tabular/1';

export type TemplateField = 'year_level' | 'semester' | 'code' | 'title' | 'lec' | 'lab' | 'tu' | 'prerequisites';

export const TEMPLATE_FIELDS: Array<{ field: TemplateField; label: string; required: boolean }> = [
  { field: 'year_level', label: 'Year level', required: true },
  { field: 'semester', label: 'Term', required: true },
  { field: 'code', label: 'Course code', required: true },
  { field: 'title', label: 'Course title', required: true },
  { field: 'lec', label: 'Lecture units', required: true },
  { field: 'lab', label: 'Laboratory units', required: true },
  { field: 'tu', label: 'Total units', required: true },
  { field: 'prerequisites', label: 'Prerequisites', required: false },
];

export const TEMPLATE_HEADERS = ['Year Level', 'Term', 'Course Code', 'Course Title', 'Lec Units', 'Lab Units', 'Total Units', 'Prerequisites'];

const SYNONYMS: Record<TemplateField, string[]> = {
  year_level: ['yearlevel', 'year', 'yr', 'yearlvl', 'level'],
  semester: ['term', 'semester', 'sem', 'period'],
  code: ['coursecode', 'code', 'subjectcode', 'subject'],
  title: ['coursetitle', 'title', 'descriptivetitle', 'coursename', 'description', 'subjecttitle', 'name'],
  lec: ['lec', 'lecture', 'lectureunits', 'lecunits', 'leccredits'],
  lab: ['lab', 'laboratory', 'labunits', 'laboratoryunits', 'labcredits'],
  tu: ['tu', 'totalunits', 'units', 'credits', 'totalcredits', 'total', 'creditunits'],
  prerequisites: ['preq', 'prereq', 'prerequisite', 'prerequisites', 'prerequisites', 'requisite'],
};

const headerKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

export type ColumnMapping = Partial<Record<TemplateField, number>>;

export interface HeaderDetection {
  headerRow: number;
  headers: string[];
  mapping: ColumnMapping;
  ambiguous: TemplateField[];
  missing: TemplateField[];
}

/** Finds a template header row and maps its columns; duplicated or missing required columns need explicit mapping. */
export const detectTemplateHeader = (rows: string[][]): HeaderDetection | null => {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const headers = rows[index];
    const mapping: ColumnMapping = {};
    const ambiguous = new Set<TemplateField>();
    headers.forEach((cell, column) => {
      const key = headerKey(cell);
      if (!key) return;
      for (const { field } of TEMPLATE_FIELDS) {
        if (!SYNONYMS[field].includes(key)) continue;
        if (mapping[field] !== undefined) ambiguous.add(field);
        else mapping[field] = column;
      }
    });
    if (Object.keys(mapping).length >= 4 && mapping.code !== undefined) {
      const missing = TEMPLATE_FIELDS.filter(({ field, required }) => required && mapping[field] === undefined).map(({ field }) => field);
      return { headerRow: index, headers, mapping, ambiguous: [...ambiguous], missing };
    }
  }
  return null;
};

export type ProvenanceFor = (rowIndex: number) => Provenance;

const isTotalRow = (code: string, title: string) => /^total\b/i.test(stripFormBlanks(code)) || /^total\s+(credits?|units?)$/i.test(title.trim());

const creditCells = (values: Array<string | undefined>): { values: ReportedTotals; flags: ExtractionFlag[] } => {
  const flags = new Set<ExtractionFlag>();
  const [lec, lab, tu] = values.map((value) => {
    const parsed = parseCredit(value ?? '');
    if (parsed === null) flags.add('blank_cell');
    else if (Number.isNaN(parsed)) flags.add('invalid_number');
    return parsed === null || Number.isNaN(parsed) ? null : parsed;
  });
  if (lec !== null && lab !== null && tu !== null && lec + lab !== tu) flags.add('credit_sum_mismatch');
  return { values: { lec, lab, tu }, flags: [...flags] };
};

/** Standard template rows. Strings are kept as read; numbers are validated, never coerced. */
export const rowsFromTemplate = (
  rows: string[][],
  detection: Pick<HeaderDetection, 'headerRow' | 'mapping'>,
  format: ImportFormat,
  provenance: ProvenanceFor,
): Extraction => {
  const { mapping } = detection;
  const cell = (row: string[], field: TemplateField) => (mapping[field] === undefined ? '' : (row[mapping[field]!] ?? '').trim());
  const extracted: ExtractedRow[] = [];
  const groups = new Map<string, ExtractedGroup>();
  const warnings: string[] = [];

  rows.slice(detection.headerRow + 1).forEach((row, offset) => {
    const index = detection.headerRow + 1 + offset;
    if (row.every((value) => value.trim() === '')) return;
    const year = parseYearLevel(cell(row, 'year_level'));
    const term = parseTerm(cell(row, 'semester'));
    const code = cell(row, 'code');
    const title = cell(row, 'title');
    const credits = creditCells([cell(row, 'lec'), cell(row, 'lab'), cell(row, 'tu')]);

    if (isTotalRow(code, title)) {
      if (year !== null && term !== null) groups.set(`${year}-${term}`, { year_level: year, semester: term, reported: credits.values });
      else warnings.push(`Row ${index + 1}: a total row has no recognizable year and term; it was not used as a cross-check.`);
      return;
    }

    const flags = new Set<ExtractionFlag>(credits.flags);
    if (year === null) flags.add('unmapped_year');
    if (term === null) flags.add('unmapped_term');
    if (isSuspiciousCode(code)) flags.add('suspicious_code');
    if (row.length < Math.max(...Object.values(mapping).map((value) => value ?? 0)) + 1) flags.add('malformed_row');
    const prerequisites = cell(row, 'prerequisites');
    extracted.push({
      year_level: year,
      semester: term,
      source: {
        code,
        title,
        lec: credits.values.lec,
        lab: credits.values.lab,
        tu: credits.values.tu,
        prerequisites: prerequisites === '' ? null : prerequisites,
        raw: row,
        provenance: provenance(index),
        flags: [...flags],
      },
    });
  });

  return {
    format,
    extractor_version: TABULAR_EXTRACTOR_VERSION,
    metadata: { name: null, program_text: null, program_code: null, cmo_number: null, cmo_series: null, effective_school_year: null, notes: [] },
    groups: [...groups.values()],
    rows: extracted,
    warnings,
  };
};

interface GridBlock {
  codeColumn: number;
  titleColumn: number;
  lec: number;
  lab: number;
  tu: number;
  preq: number | null;
  term: PlacementTerm | null;
  year: number | null;
  open: boolean;
}

/**
 * Side-by-side curriculum grid (the TCC workbook/document layout): year headings, then header rows with one
 * `Course Code` cell per semester block. Terms come from each block's own label, never from column order.
 */
export const rowsFromGrid = (rows: string[][], format: ImportFormat, provenance: ProvenanceFor): Extraction | null => {
  let year: number | null = null;
  let summerHeading = false;
  let blocks: GridBlock[] = [];
  const extracted: ExtractedRow[] = [];
  const groups: ExtractedGroup[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  let sawHeader = false;

  rows.forEach((row, index) => {
    const joined = row.filter((cell) => cell.trim() !== '').join(' ');
    const headingYear = yearHeading(joined);
    if (headingYear !== null) {
      year = headingYear;
      summerHeading = false;
      blocks = [];
      return;
    }
    if (isSummerHeading(joined)) {
      summerHeading = true;
      blocks = [];
      return;
    }

    const codeColumns = row.map((cell, column) => (/^course\s*code$/i.test(cell.trim()) ? column : -1)).filter((column) => column >= 0);
    if (codeColumns.length > 0) {
      sawHeader = true;
      blocks = codeColumns.map((codeColumn, position) => {
        const end = codeColumns[position + 1] ?? row.length;
        const find = (pattern: RegExp) => {
          for (let column = codeColumn + 1; column < end; column += 1) if (pattern.test(row[column]?.trim() ?? '')) return column;
          return -1;
        };
        const labelColumn = (() => {
          for (let column = codeColumn + 1; column < end; column += 1) if (termOf(row[column] ?? '') !== null) return column;
          return -1;
        })();
        let term = labelColumn >= 0 ? termOf(row[labelColumn]) : null;
        if (term === null && summerHeading) term = 3;
        if (term === null) warnings.push(`Row ${index + 1}: a table block has no recognizable term label; map its term manually.`);
        if (year === null) warnings.push(`Row ${index + 1}: a table block has no enclosing year heading; map its year manually.`);
        return {
          codeColumn,
          titleColumn: labelColumn >= 0 ? labelColumn : codeColumn + 1,
          lec: find(/^lec(ture)?$/i),
          lab: find(/^lab(oratory)?$/i),
          tu: find(/^(tu|units?)$/i),
          preq: (() => { const column = find(/^pre-?req/i); return column >= 0 ? column : null; })(),
          term,
          year,
          open: true,
        };
      }).filter((block) => block.lec >= 0 && block.lab >= 0 && block.tu >= 0);
      return;
    }

    if (/^note\b/i.test(stripFormBlanks(joined))) {
      notes.push(stripFormBlanks(joined));
      return;
    }

    for (const block of blocks) {
      if (!block.open) continue;
      const code = stripFormBlanks(row[block.codeColumn] ?? '');
      const title = (row[block.titleColumn] ?? '').trim();
      const credits = creditCells([row[block.lec], row[block.lab], row[block.tu]]);
      if (isTotalRow(code, title)) {
        if (block.year !== null && block.term !== null) groups.push({ year_level: block.year, semester: block.term, reported: credits.values });
        block.open = false;
        continue;
      }
      if (code === '') continue;
      const flags = new Set<ExtractionFlag>(credits.flags);
      if (block.year === null) flags.add('unmapped_year');
      if (block.term === null) flags.add('unmapped_term');
      if (isSuspiciousCode(code)) flags.add('suspicious_code');
      const prerequisites = block.preq === null ? '' : (row[block.preq] ?? '').trim();
      extracted.push({
        year_level: block.year,
        semester: block.term,
        source: {
          code,
          title,
          lec: credits.values.lec,
          lab: credits.values.lab,
          tu: credits.values.tu,
          prerequisites: prerequisites === '' ? null : prerequisites,
          raw: row.slice(block.codeColumn, (block.preq ?? block.tu) + 1),
          provenance: provenance(index),
          flags: [...flags],
        },
      });
    }
  });

  if (!sawHeader) return null;

  // Blocks closed without a printed total still form a group, labelled as calculated only.
  const declared = new Set(groups.map((group) => `${group.year_level}-${group.semester}`));
  for (const row of extracted) {
    const key = `${row.year_level}-${row.semester}`;
    if (row.year_level !== null && row.semester !== null && !declared.has(key)) {
      declared.add(key);
      groups.push({ year_level: row.year_level, semester: row.semester, reported: null });
    }
  }

  return {
    format,
    extractor_version: `${TABULAR_EXTRACTOR_VERSION}+grid`,
    metadata: { name: null, program_text: null, program_code: null, cmo_number: null, cmo_series: null, effective_school_year: null, notes },
    groups,
    rows: extracted,
    warnings,
  };
};

/** Header metadata lines above the first table, in the same CMO/effective-year wording as the PDF. */
export const metadataFromLines = (lines: string[]): Extraction['metadata'] => {
  const all = lines.join('\n');
  const cmo = all.match(/CMO\s*(?:No\.?\s*)?(\d+)\s*,?\s*(?:s\.?|series(?:\s+of)?)\s*(\d{4})/i);
  const year = all.match(/EFFECTIVE\s+(?:SCHOOL\s+YEAR|S\.?Y\.?)\s*(\d{4})\s*-\s*(\d{4})/i);
  const program = lines.find((line) => /\b(BACHELOR|ASSOCIATE|MASTER|DIPLOMA|DOCTOR)\b/i.test(line)) ?? null;
  return {
    name: program,
    program_text: program,
    program_code: program?.match(/\(([A-Z]{2,})\)/)?.[1] ?? null,
    cmo_number: cmo?.[1] ?? null,
    cmo_series: cmo ? Number(cmo[2]) : null,
    effective_school_year: year ? `${year[1]}-${year[2]}` : null,
    notes: [],
  };
};
