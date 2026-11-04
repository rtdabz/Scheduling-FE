import type { NoteRun } from '../../types/curriculum';
import { isSuspiciousCode, isSummerHeading, parseCredit, stripFormBlanks, termOf, yearHeading } from './normalize';
import { buildNote, DEFAULT_TEXT_COLOR, FORM_FURNITURE, NOTE_START, type NoteChar } from './notes';
import { metadataFromLines } from './tabular';
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
  summer: boolean;
}

interface TableHeader {
  page: number;
  y: number;
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
  const year = yearHeading(text);
  if (year !== null) return [{ y: line[0].y, year, summer: false }];
  return isSummerHeading(text) ? [{ y: line[0].y, year: null, summer: true }] : [];
});

const findOnLine = (items: PdfTextItem[], anchor: PdfTextItem, left: number, right: number, pattern: RegExp) =>
  items.find((item) => sameLine(item, anchor) && item.x >= left && item.x < right && pattern.test(item.str.trim())) ?? null;

const tableHeaders = (page: PdfPageText, items: PdfTextItem[], headings: Heading[], warnings: string[]): TableHeader[] => {
  const anchors = items.filter((item) => /^course\s*code$/i.test(item.str.trim())).sort((a, b) => a.y - b.y || a.x - b.x);
  const headers: TableHeader[] = anchors.map((anchor) => {
    const next = anchors.filter((other) => other !== anchor && sameLine(other, anchor) && other.x > anchor.x).sort((a, b) => a.x - b.x)[0];
    const left = anchor.x - 8;
    const right = next ? next.x - 8 : page.width;
    const label = items.find((item) => sameLine(item, anchor) && item.x > anchor.x && item.x < right && termOf(item.str) !== null);
    const above = headings.filter((heading) => heading.y < anchor.y).sort((a, b) => b.y - a.y);
    const year = above.find((heading) => heading.year !== null)?.year ?? null;
    let term = label ? termOf(label.str) : null;
    if (term === null && above[0]?.summer) term = 3;
    if (term === null) warnings.push(`Page ${page.page}: a table near y=${Math.round(anchor.y)} has no recognizable term label; map its term manually.`);
    if (year === null) warnings.push(`Page ${page.page}: a table near y=${Math.round(anchor.y)} has no enclosing year heading; map its year manually.`);
    return {
      page: page.page,
      y: anchor.y,
      left,
      right,
      codeX: anchor.x,
      term,
      year,
      lec: findOnLine(items, anchor, left, right, /^lec(ture)?$/i),
      lab: findOnLine(items, anchor, left, right, /^lab(oratory)?$/i),
      tu: findOnLine(items, anchor, left, right, /^(tu|units?)$/i),
      preq: findOnLine(items, anchor, left, right, /^pre-?req/i),
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
  lec: number;
  lab: number;
  tu: number;
  numericLeft: number;
  numericRight: number;
}

const numericColumns = (header: TableHeader): NumericColumns | null => {
  if (!header.lec || !header.lab || !header.tu) return null;
  return {
    lec: center(header.lec),
    lab: center(header.lab),
    tu: center(header.tu),
    numericLeft: header.lec.x - 6,
    numericRight: header.tu.x + header.tu.width + 3,
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
  for (const item of items) {
    const text = item.str.trim();
    const field = (['lec', 'lab', 'tu'] as const).reduce((best, key) => (Math.abs(center(item) - columns[key]) < Math.abs(center(item) - columns[best]) ? key : best), 'lec' as keyof ReportedTotals);
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
  for (const key of ['lec', 'lab', 'tu'] as const) {
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
  items.filter((item) => Math.abs(item.y - header.y) <= LINE_TOLERANCE && item.x >= header.left && item.x < header.right).forEach((item) => consumed.add(item));
  const columns = numericColumns(header);
  if (!columns) {
    warnings.push(`Page ${header.page}: a table near y=${Math.round(header.y)} has no Lec/Lab/TU headers; it was not read.`);
    return;
  }

  const region = items.filter((item) => item.y > header.y + LINE_TOLERANCE && item.y < header.bottom - LINE_TOLERANCE && item.x >= header.left && item.x < header.right);
  const total = region.filter((item) => /^total\s+credits?$/i.test(item.str.trim())).sort((a, b) => a.y - b.y)[0];
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
  const bodyTop = Math.min(...headers.map((header) => header.y));
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
    const firstTableY = Math.min(...headings.map((heading) => heading.y), ...headers.map((header) => header.y));
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
