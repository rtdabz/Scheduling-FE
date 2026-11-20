import type { NoteRun } from '../../types/curriculum';
import {
  isCodeHeader, isLabHeader, isLecHeader, isPrerequisiteHeader, isSuspiciousCode, isSummerHeading, isTotalHeader, looksLikeCode,
  parseCredit, stripFormBlanks, termOf,
} from './normalize';
import { buildNote, DEFAULT_TEXT_COLOR, FORM_FURNITURE, NOTE_START, type NoteChar } from './notes';
import { metadataFromLines, placementHeading } from './tabular';
import type { Extraction, ExtractedGroup, ExtractedRow, ExtractionFlag, PlacementTerm, ReportedTotals, SourceNote, UnreadRegion } from './types';

export const PDF_EXTRACTOR_VERSION = 'tcc-grid-pdfjs/2';

/** One positioned text run, in top-down page coordinates (points). */
export interface PdfTextItem {
  page: number;
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill colours over `str`; null when they could not be matched, absent when not read at all. */
  colors?: NoteRun[] | null;
}

export interface PdfPageText {
  page: number;
  width: number;
  height: number;
  items: PdfTextItem[];
  /** Painted image bounds, top-down: [x0, y0, x1, y1]. */
  images?: [number, number, number, number][];
}

interface Heading {
  y: number;
  year: number | null;
  /** The term a combined heading names (`First Year - First Semester`), else null. */
  term: PlacementTerm | null;
  summer: boolean;
}

interface TableHeader {
  page: number;
  y: number;
  top: number;
  left: number;
  right: number;
  codeX: number;
  term: PlacementTerm | null;
  year: number | null;
  lec: PdfTextItem | null;
  lab: PdfTextItem | null;
  tu: PdfTextItem | null;
  preq: PdfTextItem | null;
  bottom: number;
}

const LINE_TOLERANCE = 2;

const center = (item: PdfTextItem) => item.x + item.width / 2;

const sameLine = (a: PdfTextItem, b: PdfTextItem, tolerance = LINE_TOLERANCE) => Math.abs(a.y - b.y) <= tolerance;

const lines = (items: PdfTextItem[]): PdfTextItem[][] => {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const result: PdfTextItem[][] = [];
  for (const item of sorted) {
    const line = result[result.length - 1];
    if (line && Math.abs(line[0].y - item.y) <= LINE_TOLERANCE) line.push(item);
    else result.push([item]);
  }
  return result.map((line) => line.sort((a, b) => a.x - b.x));
};

const lineText = (line: PdfTextItem[]) => line.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();

const headingsOf = (items: PdfTextItem[]): Heading[] => lines(items).flatMap((line): Heading[] => {
  const text = lineText(line);
  const placement = placementHeading(text);
  if (placement !== null) return [{ y: line[0].y, year: placement.year, term: placement.term, summer: false }];
  if (isSummerHeading(text)) return [{ y: line[0].y, year: null, term: null, summer: true }];
  // A term heading on its own line (`First Semester`) places the tables under it, within the current year.
  const term = termOf(text);
  return term !== null ? [{ y: line[0].y, year: null, term, summer: false }] : [];
});

interface HeaderBlock {
  /** The lowest header line; course rows start below it. */
  y: number;
  /** The highest header line, when the labels sit on a row above the Lec/Lab/Units row. */
  top: number;
  codeX: number;
  /** Null when the table prints only total units. */
  lec: PdfTextItem | null;
  lab: PdfTextItem | null;
  tu: PdfTextItem;
  preq: PdfTextItem | null;
}

/** How far above the Lec/Lab/Units row the code and title labels of a two-row header may sit. */
const UPPER_HEADER_GAP = 18;

/** How far below a header line codes are looked for when the code column has no label. */
const CODE_SEARCH_DEPTH = 120;

/**
 * Table blocks found by their Lec, Lab, and total-credit headers, so the code column may be labelled `Course Code`,
 * `Subj Code`, `Subjects`, anything else, or nothing. Without a label, the block's code column starts at the
 * leftmost course code printed below the header, between the previous block and this block's Lec column.
 */
const headerBlocks = (items: PdfTextItem[]): HeaderBlock[] => {
  const lecs = items.filter((item) => isLecHeader(item.str)).sort((a, b) => a.y - b.y || a.x - b.x);
  const blocks: HeaderBlock[] = [];
  let lineY = Number.NEGATIVE_INFINITY;
  let leftBound = 0;
  for (const lec of lecs) {
    if (Math.abs(lec.y - lineY) > LINE_TOLERANCE) {
      lineY = lec.y;
      leftBound = 0;
    }
    const after = items.filter((item) => sameLine(item, lec) && item.x > lec.x).sort((a, b) => a.x - b.x);
    const nextLec = after.find((item) => isLecHeader(item.str));
    const inBlock = after.filter((item) => !nextLec || item.x < nextLec.x);
    const lab = inBlock.find((item) => isLabHeader(item.str));
    const tu = lab ? inBlock.find((item) => item.x > lab.x && isTotalHeader(item.str)) : undefined;
    if (!lab || !tu) continue;
    const preq = inBlock.find((item) => item.x > tu.x && isPrerequisiteHeader(item.str)) ?? null;

    // The code label sits on the Lec row, or on the row above it in a two-row header.
    const label = items
      .filter((item) => item.y <= lec.y + LINE_TOLERANCE && lec.y - item.y <= UPPER_HEADER_GAP && item.x >= leftBound && item.x < lec.x && isCodeHeader(item.str))
      .sort((a, b) => a.x - b.x)[0];
    const codeX = label?.x ?? codeColumnBelow(items, lec.y, leftBound, lec.x);
    const end = preq ?? tu;
    leftBound = end.x + end.width + 1;
    if (codeX === null) continue;
    blocks.push({ y: lec.y, top: Math.min(lec.y, label?.y ?? lec.y), codeX, lec, lab, tu, preq });
  }

  // Tables printing only total units: a code label and a Units/Credits label on one line, with no Lec between.
  const codeLabels = items.filter((item) => isCodeHeader(item.str)).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const label of codeLabels) {
    if (blocks.some((block) => Math.abs(block.top - label.y) <= UPPER_HEADER_GAP && block.codeX <= label.x + 1 && label.x < block.tu.x)) continue;
    const onLine = items.filter((item) => sameLine(item, label) && item.x > label.x).sort((a, b) => a.x - b.x);
    const nextLabel = onLine.find((item) => isCodeHeader(item.str));
    const inBlock = onLine.filter((item) => !nextLabel || item.x < nextLabel.x);
    const tu = inBlock.find((item) => isTotalHeader(item.str));
    if (!tu || inBlock.some((item) => item.x < tu.x && isLecHeader(item.str))) continue;
    const preq = inBlock.find((item) => item.x > tu.x && isPrerequisiteHeader(item.str)) ?? null;
    blocks.push({ y: label.y, top: label.y, codeX: label.x, lec: null, lab: null, tu, preq });
  }
  return blocks;
};

/** The left edge of an unlabelled code column: the leftmost course code printed just below the header. */
const codeColumnBelow = (items: PdfTextItem[], headerY: number, left: number, right: number): number | null => {
  const codes = items.filter((item) => item.y > headerY + LINE_TOLERANCE && item.y < headerY + CODE_SEARCH_DEPTH
    && item.x >= left && item.x < right && looksLikeCode(stripFormBlanks(item.str)));
  return codes.length > 0 ? Math.min(...codes.map((item) => item.x)) : null;
};

const tableHeaders = (page: PdfPageText, items: PdfTextItem[], headings: Heading[], warnings: string[]): TableHeader[] => {
  const blocks = headerBlocks(items);
  const headers: TableHeader[] = blocks.map((block) => {
    const next = blocks.filter((other) => other !== block && Math.abs(other.y - block.y) <= LINE_TOLERANCE && other.codeX > block.codeX).sort((a, b) => a.codeX - b.codeX)[0];
    const left = block.codeX - 8;
    const right = next ? next.codeX - 8 : page.width;
    const numbersStart = (block.lec ?? block.tu).x;
    const label = items.find((item) => item.y >= block.top - LINE_TOLERANCE && item.y <= block.y + LINE_TOLERANCE && item.x > block.codeX && item.x < numbersStart && termOf(item.str) !== null);
    const above = headings.filter((heading) => heading.y < block.top).sort((a, b) => b.y - a.y);
    const year = above.find((heading) => heading.year !== null)?.year ?? null;
    let term = label ? termOf(label.str) : null;
    if (term === null && above[0]?.term) term = above[0].term;
    if (term === null && above[0]?.summer) term = 3;
    if (term === null) warnings.push(`Page ${page.page}: a table near y=${Math.round(block.y)} has no recognizable term label; map its term manually.`);
    if (year === null) warnings.push(`Page ${page.page}: a table near y=${Math.round(block.y)} has no enclosing year heading; map its year manually.`);
    return {
      page: page.page,
      y: block.y,
      top: block.top,
      left,
      right,
      codeX: block.codeX,
      term,
      year,
      lec: block.lec,
      lab: block.lab,
      tu: block.tu,
      preq: block.preq,
      bottom: page.height,
    };
  });

  for (const header of headers) {
    const below = headers.filter((other) => other.y > header.y + LINE_TOLERANCE && other.left < header.right && other.right > header.left).map((other) => other.y);
    const nextHeading = headings.filter((heading) => heading.y > header.y).map((heading) => heading.y);
    header.bottom = Math.min(page.height, ...below, ...nextHeading);
  }
  return headers;
};

interface NumericColumns {
  /** Null when the table prints only total units. */
  lec: number | null;
  lab: number | null;
  tu: number;
  numericLeft: number;
  numericRight: number;
}

const numericColumns = (header: TableHeader): NumericColumns | null => {
  if (!header.tu) return null;
  const right = header.tu.x + header.tu.width + 3;
  if (!header.lec || !header.lab) return { lec: null, lab: null, tu: center(header.tu), numericLeft: header.tu.x - 6, numericRight: right };
  return {
    lec: center(header.lec),
    lab: center(header.lab),
    tu: center(header.tu),
    numericLeft: header.lec.x - 6,
    numericRight: right,
  };
};

interface Cells {
  values: ReportedTotals;
  flags: ExtractionFlag[];
}

/** Assigns numeric runs to the nearest column centre. Merged or repeated runs are kept as uncertainty, never split or repaired. */
const readNumbers = (items: PdfTextItem[], columns: NumericColumns): Cells => {
  const values: ReportedTotals = { lec: null, lab: null, tu: null };
  const flags = new Set<ExtractionFlag>();
  const seen = new Set<keyof ReportedTotals>();
  const keys = (['lec', 'lab', 'tu'] as const).filter((key) => columns[key] !== null);
  if (keys.length === 1) flags.add('units_only');
  const distance = (item: PdfTextItem, key: keyof ReportedTotals) => Math.abs(center(item) - (columns[key] ?? Number.POSITIVE_INFINITY));
  for (const item of items) {
    const text = item.str.trim();
    const field = keys.reduce((best, key) => (distance(item, key) < distance(item, best) ? key : best), keys[0]);
    const value = parseCredit(text);
    if (value === null) continue;
    if (Number.isNaN(value) || seen.has(field)) {
      flags.add('ambiguous_units');
      values[field] = null;
      continue;
    }
    seen.add(field);
    values[field] = value;
  }
  for (const key of keys) {
    if (!seen.has(key)) flags.add('blank_cell');
  }
  if (values.lec !== null && values.lab !== null && values.tu !== null && values.lec + values.lab !== values.tu) flags.add('credit_sum_mismatch');
  return { values, flags: [...flags] };
};

const bboxOf = (items: PdfTextItem[]): [number, number, number, number] => [
  Math.min(...items.map((item) => item.x)),
  Math.min(...items.map((item) => item.y - item.height)),
  Math.max(...items.map((item) => item.x + item.width)),
  Math.max(...items.map((item) => item.y)),
];

const joinText = (items: PdfTextItem[]) => items
  .sort((a, b) => a.y - b.y || a.x - b.x)
  .map((item) => item.str.trim())
  .filter(Boolean)
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();

const readTable = (header: TableHeader, items: PdfTextItem[], rows: ExtractedRow[], groups: ExtractedGroup[], consumed: Set<PdfTextItem>, warnings: string[]) => {
  items.filter((item) => item.y >= header.top - LINE_TOLERANCE && item.y <= header.y + LINE_TOLERANCE && item.x >= header.left && item.x < header.right).forEach((item) => consumed.add(item));
  const columns = numericColumns(header);
  if (!columns) {
    warnings.push(`Page ${header.page}: a table near y=${Math.round(header.y)} has no Lec/Lab/TU headers; it was not read.`);
    return;
  }

  const region = items.filter((item) => item.y > header.y + LINE_TOLERANCE && item.y < header.bottom - LINE_TOLERANCE && item.x >= header.left && item.x < header.right);
  const total = region.filter((item) => /^total(\s+(credits?|units?))?\s*:?$/i.test(item.str.trim())).sort((a, b) => a.y - b.y)[0];
  const rowLimit = total ? total.y - LINE_TOLERANCE : header.bottom;
  const anchors = region
    .filter((item) => item.y < rowLimit && item.x < header.codeX + 12 && stripFormBlanks(item.str) !== '' && !/^note\b/i.test(stripFormBlanks(item.str)))
    .sort((a, b) => a.y - b.y);

  const tolerance = (anchor: PdfTextItem) => Math.max(4, anchor.height * 0.75);
  const owner = (item: PdfTextItem): PdfTextItem | null => {
    let best: PdfTextItem | null = null;
    for (const anchor of anchors) {
      const distance = Math.abs(anchor.y - item.y);
      if (distance <= tolerance(anchor) && (!best || distance < Math.abs(best.y - item.y))) best = anchor;
    }
    return best;
  };

  const members = new Map<PdfTextItem, PdfTextItem[]>(anchors.map((anchor) => [anchor, []]));
  for (const item of region) {
    if (anchors.includes(item) || item.y >= rowLimit + tolerance(item) || (total && sameLine(item, total))) continue;
    const anchor = owner(item);
    if (anchor) members.get(anchor)!.push(item);
  }

  const titleRight = columns.numericLeft;
  for (const anchor of anchors) {
    const cells = members.get(anchor)!;
    const titleItems = cells.filter((item) => item.x < titleRight && item.x >= header.codeX + 12);
    const numberItems = cells.filter((item) => item.x >= titleRight && item.x < columns.numericRight);
    const prerequisiteItems = cells.filter((item) => item.x >= columns.numericRight);
    const numbers = readNumbers(numberItems, columns);
    const code = stripFormBlanks(anchor.str);
    const flags = new Set(numbers.flags);
    if (isSuspiciousCode(code)) flags.add('suspicious_code');
    if (header.term === null) flags.add('unmapped_term');
    if (header.year === null) flags.add('unmapped_year');
    const all = [anchor, ...cells];
    all.forEach((item) => consumed.add(item));
    rows.push({
      year_level: header.year,
      semester: header.term,
      source: {
        code,
        title: joinText(titleItems),
        lec: numbers.values.lec,
        lab: numbers.values.lab,
        tu: numbers.values.tu,
        prerequisites: prerequisiteItems.length ? joinText(prerequisiteItems) : null,
        raw: all.sort((a, b) => a.x - b.x).map((item) => item.str),
        provenance: { kind: 'pdf', page: header.page, bbox: bboxOf(all) },
        flags: [...flags],
      },
    });
  }

  if (header.year !== null && header.term !== null) {
    let reported: ReportedTotals | null = null;
    if (total) {
      region.filter((item) => sameLine(item, total)).forEach((item) => consumed.add(item));
      const totalNumbers = readNumbers(region.filter((item) => sameLine(item, total) && item.x >= titleRight && item.x < columns.numericRight), columns);
      reported = totalNumbers.values;
      if (totalNumbers.flags.includes('ambiguous_units')) warnings.push(`Year ${header.year}, term ${header.term}: the printed total could not be read unambiguously.`);
    }
    groups.push({ year_level: header.year, semester: header.term, reported });
  }
};

const isColored = (item: PdfTextItem) => (item.colors ?? []).some((run) => run.color !== null && run.color !== DEFAULT_TEXT_COLOR);

/** Characters of a line with their colours; items on one line are joined by a space, as laid out. */
const lineChars = (line: PdfTextItem[]): NoteChar[] => line.flatMap((item, index) => {
  const colors = item.colors ? item.colors.flatMap((run) => Array<string | null>(run.length).fill(run.color)) : [];
  const chars = [...item.str].map((ch, offset) => ({ ch, color: colors[offset] ?? null }));
  return index === 0 ? chars : [{ ch: ' ', color: chars[0]?.color ?? null }, ...chars];
});

/**
 * Text left after courses, headers, totals, headings and the letterhead. A line opening with a note marker,
 * or printed in a colour, starts a note; lines just below it continue it. Form furniture is skipped, and
 * anything else is reported as unread so a reviewer sees it instead of it disappearing.
 */
const readNotes = (page: PdfPageText, remaining: PdfTextItem[], headers: TableHeader[], headings: Heading[], notes: SourceNote[], unread: UnreadRegion[]) => {
  const groups: PdfTextItem[][][] = [];
  let current: { lines: PdfTextItem[][]; x: number; lastY: number; lastHeight: number } | null = null;
  for (const line of lines(remaining)) {
    const text = stripFormBlanks(lineText(line));
    if (text === '') continue;
    if (line.every((item) => FORM_FURNITURE.test(stripFormBlanks(item.str)) || stripFormBlanks(item.str) === '')) {
      current = null;
      continue;
    }
    const starts = NOTE_START.test(text);
    const continues = current !== null && line[0].y - current.lastY <= Math.max(current.lastHeight * 1.9, 10) && line[0].x >= current.x - 6;
    if (current && continues && !starts) {
      current.lines.push(line);
      current.lastY = line[0].y;
      current.lastHeight = line[0].height;
    } else if (starts || line.some(isColored)) {
      current = { lines: [line], x: line[0].x, lastY: line[0].y, lastHeight: line[0].height };
      groups.push(current.lines);
    } else {
      current = null;
      unread.push({ reason: 'unrecognized_text', page: page.page, bbox: bboxOf(line), text: lineText(line).slice(0, 500) });
    }
  }

  for (const group of groups) {
    const items = group.flat();
    const [x0, y0] = bboxOf(items);
    // Position is evidence, not a rule: a note inside a year's tables belongs to that year until reviewed.
    const table = headers.find((header) => y0 > header.y && y0 < header.bottom && x0 >= header.left && x0 < header.right && header.year !== null);
    const year = table?.year ?? headings.filter((heading) => heading.y < y0 && heading.year !== null).sort((a, b) => b.y - a.y)[0]?.year ?? null;
    notes.push(buildNote(
      `n${notes.length + 1}`,
      group.map(lineChars),
      { kind: 'pdf', page: page.page, bbox: bboxOf(items) },
      year === null ? { level: 'curriculum' } : { level: 'year', year_level: year },
      'read',
    ));
  }

  // Images below the letterhead can hold notes that text extraction cannot see.
  const bodyTop = Math.min(...headers.map((header) => header.top));
  for (const [x0, y0, x1, y1] of page.images ?? []) {
    if (x1 - x0 >= 20 && y1 - y0 >= 6 && y1 > bodyTop) {
      unread.push({ reason: 'image', page: page.page, bbox: [x0, y0, x1, y1].map((value) => Math.round(value * 100) / 100) as [number, number, number, number] });
    }
  }
};

const readMetadata = (items: PdfTextItem[], firstTableY: number) => metadataFromLines(lines(items.filter((item) => item.y < firstTableY)).map(lineText));

/**
 * Layout-specific reader for the TCC curriculum grid: year bands, side-by-side First/Second Semester tables,
 * and Summer tables whose extent comes from their own headers. Context never carries across pages.
 */
export const extractCurriculumLayout = (pages: PdfPageText[]): Extraction => {
  const rows: ExtractedRow[] = [];
  const groups: ExtractedGroup[] = [];
  const notes: SourceNote[] = [];
  const unread: UnreadRegion[] = [];
  const warnings: string[] = [];
  let metadata: ReturnType<typeof readMetadata> | null = null;

  for (const page of pages) {
    const items = page.items.filter((item) => item.str.trim() !== '');
    const headings = headingsOf(items);
    const headers = tableHeaders(page, items, headings, warnings);
    if (headers.length === 0) {
      if (items.length > 0) warnings.push(`Page ${page.page} has no recognizable curriculum table.`);
      continue;
    }
    const firstTableY = Math.min(...headings.map((heading) => heading.y), ...headers.map((header) => header.top));
    metadata ??= readMetadata(items, firstTableY);
    // The letterhead and metadata above the first table, and the heading lines, are not notes.
    const consumed = new Set(items.filter((item) => item.y < firstTableY || headings.some((heading) => Math.abs(item.y - heading.y) <= LINE_TOLERANCE)));
    for (const header of headers) readTable(header, items, rows, groups, consumed, warnings);
    readNotes(page, items.filter((item) => !consumed.has(item)), headers, headings, notes, unread);
  }

  if (pages.every((page) => page.items.every((item) => item.str.trim() === ''))) {
    warnings.push('The PDF has no selectable text. It needs OCR or a structured CSV/XLSX replacement; nothing was imported.');
  }

  return {
    format: 'pdf',
    extractor_version: PDF_EXTRACTOR_VERSION,
    metadata: { ...(metadata ?? metadataFromLines([])), notes: notes.map((note) => note.text) },
    groups,
    rows,
    notes,
    unread,
    warnings,
  };
};
