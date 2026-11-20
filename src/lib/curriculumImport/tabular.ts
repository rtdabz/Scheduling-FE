import {
  isCodeHeader, isLabHeader, isLecHeader, isPrerequisiteHeader, isSuspiciousCode, isSummerHeading, isTotalHeader, looksLikeCode,
  parseCredit, parseTerm, parseYearLevel, stripFormBlanks, termOf, yearHeading,
} from './normalize';
import { NOTE_START, plainNote } from './notes';
import type { Extraction, ExtractedGroup, ExtractedRow, ExtractionFlag, ImportFormat, PlacementTerm, Provenance, ReportedTotals, SourceNote } from './types';

export const TABULAR_EXTRACTOR_VERSION = 'tabular/2';

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
  code: ['coursecode', 'code', 'subjectcode', 'subject', 'subjects', 'subjcode', 'subj', 'courseno', 'coursenumber', 'subjectno', 'subjno', 'codeno'],
  title: ['coursetitle', 'title', 'descriptivetitle', 'coursename', 'description', 'subjecttitle', 'name', 'coursedescription', 'subjectdescription', 'subjectname', 'descriptivetitleofthecourse'],
  lec: ['lec', 'lect', 'lecture', 'lectureunits', 'lecunits', 'leccredits', 'lecunit'],
  lab: ['lab', 'laboratory', 'labunits', 'laboratoryunits', 'labcredits', 'labunit'],
  tu: ['tu', 'totalunits', 'units', 'unit', 'credits', 'credit', 'totalcredits', 'total', 'creditunits', 'noofunits', 'numberofunits'],
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
  for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
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
      // A table printing only total units has no Lec/Lab columns to map; its split is confirmed in review.
      const unitsOnly = mapping.tu !== undefined && mapping.lec === undefined && mapping.lab === undefined;
      const missing = TEMPLATE_FIELDS
        .filter(({ field, required }) => required && mapping[field] === undefined && !(unitsOnly && (field === 'lec' || field === 'lab')))
        .map(({ field }) => field);
      return { headerRow: index, headers, mapping, ambiguous: [...ambiguous], missing };
    }
  }
  return null;
};

export type ProvenanceFor = (rowIndex: number) => Provenance;

/**
 * Collects note rows: a row opening with a note marker starts a note, and single-cell text rows right after it
 * continue it, line by line. CSV carries no colour; the XLSX and DOCX readers drop it, so those notes say so.
 */
const noteCollector = (format: ImportFormat, provenance: ProvenanceFor) => {
  const support = format === 'csv' ? 'none' : 'unknown';
  const notes: SourceNote[] = [];
  let open: { lines: string[]; index: number; scope: SourceNote['scope'] } | null = null;
  const flush = () => {
    if (open) notes.push(plainNote(`n${notes.length + 1}`, open.lines, provenance(open.index), open.scope, support));
    open = null;
  };
  return {
    /** True when the row was taken as (part of) a note. */
    take: (row: string[], index: number, scope: SourceNote['scope']): boolean => {
      const cells = row.map((cell) => cell.trim()).filter(Boolean);
      const text = cells.join(' ');
      if (cells.length > 0 && NOTE_START.test(stripFormBlanks(text))) {
        flush();
        open = { lines: [row.filter((cell) => cell.trim() !== '').join(' ')], index, scope };
        return true;
      }
      if (open && cells.length === 1 && placementHeading(text) === null && !isSummerHeading(text) && !isCodeHeader(text)) {
        open.lines.push(cells[0]);
        return true;
      }
      flush();
      return false;
    },
    finish: (): SourceNote[] => {
      flush();
      return notes;
    },
  };
};

const isTotalRow = (code: string, title: string) => /^total\b/i.test(stripFormBlanks(code)) || /^total(\s+(credits?|units?))?\s*:?$/i.test(title.trim());

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
  const notes = noteCollector(format, provenance);

  rows.slice(detection.headerRow + 1).forEach((row, offset) => {
    const index = detection.headerRow + 1 + offset;
    if (row.every((value) => value.trim() === '')) return;
    if (notes.take(row, index, { level: 'curriculum' })) return;
    const year = parseYearLevel(cell(row, 'year_level'));
    const term = parseTerm(cell(row, 'semester'));
    const code = cell(row, 'code');
    const title = cell(row, 'title');
    const credits = mapping.lec === undefined && mapping.lab === undefined ? unitsOnlyCells(cell(row, 'tu')) : creditCells([cell(row, 'lec'), cell(row, 'lab'), cell(row, 'tu')]);

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

  const found = notes.finish();
  return {
    format,
    extractor_version: TABULAR_EXTRACTOR_VERSION,
    metadata: { name: null, program_text: null, program_code: null, cmo_number: null, cmo_series: null, effective_school_year: null, notes: found.map((note) => note.text) },
    groups: [...groups.values()],
    rows: extracted,
    notes: found,
    warnings,
  };
};

interface GridBlock {
  codeColumn: number;
  titleColumn: number;
  /** -1 when the table prints only total units. */
  lec: number;
  lab: number;
  tu: number;
  preq: number | null;
  term: PlacementTerm | null;
  year: number | null;
  open: boolean;
}

export type GridColumns = Pick<GridBlock, 'codeColumn' | 'titleColumn' | 'lec' | 'lab' | 'tu' | 'preq'> & {
  labelColumn: number;
  explicitCode: boolean;
  /** The header cells the block was read from: one row, or a two-row header merged into one. */
  header: string[];
};

const TITLE_HEADER = /^(descriptive\s*title|course\s*(title|description|name)|subject\s*(title|description|name)|title|description|descriptive\s*title\s*of\s*(the\s*)?(course|subject))$/i;

const within = (row: string[], from: number, to: number, test: (text: string) => boolean) => {
  for (let column = Math.max(0, from); column < to; column += 1) if (test(row[column]?.trim() ?? '')) return column;
  return -1;
};

const PER_UNIT = /unit|credit/i;

/** Code and title columns of a block that spans `[start, end)`; a code column without a label sits before the title. */
const codeAndTitle = (row: string[], start: number, end: number) => {
  const explicit = within(row, start, end, isCodeHeader);
  const labelColumn = within(row, start, end, (text) => termOf(text) !== null);
  const titled = within(row, start, end, (text) => TITLE_HEADER.test(text));
  let codeColumn = explicit;
  if (codeColumn < 0) {
    const titleAt = labelColumn >= 0 ? labelColumn : titled;
    codeColumn = titleAt > start ? titleAt - 1 : start;
  }
  let titleColumn = labelColumn > codeColumn ? labelColumn : titled > codeColumn ? titled : codeColumn + 1;
  if (titleColumn >= end) titleColumn = codeColumn;
  return { codeColumn, titleColumn, labelColumn, explicitCode: explicit >= 0, titled };
};

/**
 * Table blocks in a header row. A block is found by its Lec, Lab, and total-credit headers, so the label over the
 * code column may be `Course Code`, `Subj Code`, `Subjects`, any other wording, or missing. When a table prints
 * both hours and units, the unit columns are read. A table printing only total units is found by its code (or
 * title) header and its Units column. Side-by-side semesters give one block each.
 */
export const gridColumnsOf = (row: string[]): GridColumns[] => {
  const blocks: GridColumns[] = [];
  let start = 0;
  for (let lecColumn = 0; lecColumn < row.length; lecColumn += 1) {
    if (!isLecHeader(row[lecColumn] ?? '')) continue;
    let lec = lecColumn;
    let lab = within(row, lec + 1, lec + 4, isLabHeader);
    if (lab < 0) continue;
    const tu = within(row, lab + 1, lab + 6, isTotalHeader);
    if (tu < 0) continue;
    // `Lec Hrs | Lab Hrs | Lec Units | Lab Units | Total`: the units, not the contact hours, are the credits.
    const unitLec = within(row, lab + 1, tu, (text) => isLecHeader(text) && PER_UNIT.test(text));
    const unitLab = unitLec < 0 ? -1 : within(row, unitLec + 1, tu, (text) => isLabHeader(text) && PER_UNIT.test(text));
    if (unitLec >= 0 && unitLab >= 0 && !PER_UNIT.test(row[lec])) {
      lec = unitLec;
      lab = unitLab;
    }
    const nextLec = within(row, tu + 1, row.length, isLecHeader);
    const preqColumn = within(row, tu + 1, Math.min(nextLec < 0 ? row.length : nextLec, tu + 3), isPrerequisiteHeader);
    const placed = codeAndTitle(row, start, lecColumn);
    if (placed.codeColumn < lecColumn) {
      blocks.push({ ...placed, lec, lab, tu, preq: preqColumn >= 0 ? preqColumn : null, header: row });
    }
    start = (preqColumn >= 0 ? preqColumn : tu) + 1;
    lecColumn = start - 1;
  }
  if (blocks.length > 0) return blocks;

  // Units only: each code header (or, without one, each title header) opens a block that reaches the next.
  const codeHeaders = row.map((cell, column) => (isCodeHeader(cell.trim()) ? column : -1)).filter((column) => column >= 0);
  const openers = codeHeaders.length > 0
    ? codeHeaders
    : row.map((cell, column) => (TITLE_HEADER.test(cell.trim()) ? column - 1 : -1)).filter((column) => column >= 0);
  openers.forEach((opener, position) => {
    const end = openers[position + 1] ?? row.length;
    const tu = within(row, opener + 1, end, isTotalHeader);
    if (tu < 0) return;
    const placed = codeAndTitle(row, opener, tu);
    const preqColumn = within(row, tu + 1, Math.min(end, tu + 3), isPrerequisiteHeader);
    blocks.push({ ...placed, lec: -1, lab: -1, tu, preq: preqColumn >= 0 ? preqColumn : null, header: row });
  });
  return blocks;
};

/** A row of column labels (`Course Code | Descriptive Title | Units`) rather than a course. */
export const isLabelRow = (row: string[]): boolean => {
  const cells = row.map((cell) => cell.trim()).filter(Boolean);
  return cells.some((cell) => isCodeHeader(cell) || TITLE_HEADER.test(cell)) && !cells.some((cell) => looksLikeCode(stripFormBlanks(cell)) || /^\d+(\.\d+)?$/.test(cell));
};

/**
 * The table blocks headed by row `index`. A two-row header (`Units` over `Lec | Lab | Total`, with the code and
 * title labels on the upper row) is merged into one. A block without a code label only counts when the rows right
 * below it hold course codes in its code column, so a line that merely mentions Lec/Lab/Units is not a table.
 */
export const gridHeaderAt = (rows: string[][], index: number): GridColumns[] => {
  const row = rows[index] ?? [];
  const above = index > 0 ? rows[index - 1] : undefined;
  const merged = above && isLabelRow(above)
    ? Array.from({ length: Math.max(row.length, above.length) }, (_, column) => ((row[column] ?? '').trim() !== '' ? row[column] : above[column] ?? ''))
    : row;
  return gridColumnsOf(merged).filter((block) => block.explicitCode
    || rows.slice(index + 1, index + 6).some((next) => looksLikeCode(stripFormBlanks(next[block.codeColumn] ?? ''))));
};

/**
 * A year heading, alone (`FIRST YEAR`) or with its term in either order (`First Year - First Semester`,
 * `1st Year, 2nd Sem`, `Second Semester - Third Year`). Only a whole-line heading counts.
 */
export const placementHeading = (text: string): { year: number; term: PlacementTerm | null } | null => {
  const alone = yearHeading(text);
  if (alone !== null) return { year: alone, term: null };
  const trimmed = text.trim().replace(/\s*\(.*\)\s*$/, '');
  const yearFirst = trimmed.match(/^(.+?\byear(?:\s*level)?|year\s*(?:level\s*)?(?:[1-4]|i{1,3}|iv))\b(.+)$/i);
  if (yearFirst) {
    const year = yearHeading(yearFirst[1]);
    const rest = yearFirst[2].replace(/^[\s\-,:/|–—]+/, '').trim();
    const term = termOf(rest);
    if (year !== null && term !== null) return { year, term };
  }
  const termFirst = trimmed.match(/^(.+?\b(?:semester|sem|term|trimester|summer|midyear)\.?)\s*[-,:/|–—]?\s*(.+)$/i);
  if (termFirst) {
    const term = termOf(termFirst[1]);
    const year = yearHeading(termFirst[2]);
    if (year !== null && term !== null) return { year, term };
  }
  return null;
};

/**
 * A section heading line: a year (with or without its term), or a term alone (`First Semester`, `Summer`) under
 * the current year. `year` is undefined when the heading leaves the year unchanged.
 */
export const sectionHeading = (row: string[]): { year?: number; term: PlacementTerm | null } | null => {
  const cells = row.map((cell) => cell.trim()).filter(Boolean);
  if (cells.length === 0) return null;
  const joined = cells.join(' ');
  const placement = placementHeading(joined);
  if (placement !== null) return placement;
  if (isSummerHeading(joined)) return { term: 3 };
  const term = cells.length === 1 ? termOf(joined) : null;
  return term !== null ? { term } : null;
};

const unitsOnlyCells = (value: string | undefined): { values: ReportedTotals; flags: ExtractionFlag[] } => {
  const parsed = parseCredit(value ?? '');
  const flags: ExtractionFlag[] = ['units_only'];
  if (parsed === null) flags.push('blank_cell');
  else if (Number.isNaN(parsed)) flags.push('invalid_number');
  return { values: { lec: null, lab: null, tu: parsed === null || Number.isNaN(parsed) ? null : parsed }, flags };
};

/**
 * Curriculum grids in any of the layouts departments use: year and term headings (separate or combined), then
 * header rows with one block per semester side by side, or one table per term. Terms come from each block's own
 * label or the heading above it, never from column order.
 */
export const rowsFromGrid = (rows: string[][], format: ImportFormat, provenance: ProvenanceFor): Extraction | null => {
  let year: number | null = null;
  let headingTerm: PlacementTerm | null = null;
  let blocks: GridBlock[] = [];
  const extracted: ExtractedRow[] = [];
  const groups: ExtractedGroup[] = [];
  const warnings: string[] = [];
  const notes = noteCollector(format, provenance);
  let sawHeader = false;

  rows.forEach((row, index) => {
    const heading = sectionHeading(row);
    if (heading !== null) {
      if (heading.year !== undefined) year = heading.year;
      headingTerm = heading.term;
      blocks = [];
      return;
    }

    const found = gridHeaderAt(rows, index);
    if (found.length > 0) {
      sawHeader = true;
      blocks = found.map((columns) => {
        let term = columns.labelColumn >= 0 ? termOf(columns.header[columns.labelColumn]) : null;
        if (term === null && headingTerm !== null) term = headingTerm;
        if (term === null) warnings.push(`Row ${index + 1}: a table block has no recognizable term label; map its term manually.`);
        if (year === null) warnings.push(`Row ${index + 1}: a table block has no enclosing year heading; map its year manually.`);
        return { codeColumn: columns.codeColumn, titleColumn: columns.titleColumn, lec: columns.lec, lab: columns.lab, tu: columns.tu, preq: columns.preq, term, year, open: true };
      });
      return;
    }
    // The upper row of a two-row header is labels, not a course.
    if (isLabelRow(row)) return;

    // A note between a year's tables belongs to that year until reviewed.
    if (notes.take(row, index, year === null ? { level: 'curriculum' } : { level: 'year', year_level: year })) return;

    for (const block of blocks) {
      if (!block.open) continue;
      const code = stripFormBlanks(row[block.codeColumn] ?? '');
      const title = (row[block.titleColumn] ?? '').trim();
      const credits = block.lec < 0 ? unitsOnlyCells(row[block.tu]) : creditCells([row[block.lec], row[block.lab], row[block.tu]]);
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

  const found = notes.finish();
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
    metadata: { name: null, program_text: null, program_code: null, cmo_number: null, cmo_series: null, effective_school_year: null, notes: found.map((note) => note.text) },
    groups,
    rows: extracted,
    notes: found,
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
