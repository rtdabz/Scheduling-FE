/**
 * Geometry and text helpers for TCC-VPAA-001, "INDIVIDUAL FACULTY LOAD SHEET".
 *
 * Every measurement here is read straight out of the controlled form
 * (001-Teaching-Load-Updated-Form.xlsx, sheet BLANK, print area A1:K60) so the
 * printed PDF is that same grid rather than an approximation of it: 11 columns
 * A..K, 58 rows, the whole sheet inside one medium-ruled box.
 *
 * Excel states column widths in character units and row heights in points. Both
 * are converted once, here, and every draw call addresses cells by their real
 * spreadsheet address. Never hand-tune an individual coordinate downstream --
 * correct the table below instead, or the mirror drifts out of alignment one
 * cell at a time.
 */
import type jsPDF from "jspdf";

/** Widths of columns A..K, in Excel character units. */
const COLUMN_CHARS = [
  13, 10.77734375, 24.21875, 7.77734375, 10.77734375, 8.77734375,
  10.5546875, 7.21875, 7.44140625, 5.44140625, 6.88671875,
] as const;

/** Heights of rows 1..58, in points. Comments name what each row carries. */
const ROW_POINTS = [
  14.25, 14.25, 10.2, 10.2, 51.6, //  1-5   letterhead
  20.4, //  6     COLLEGE OF ...
  14.25, //  7     INDIVIDUAL FACULTY LOAD SHEET
  20.4, //  8     semester / academic year
  17.4, 6.45, //  9-10  spacer
  14.25, // 11    surname / given name / MI
  14.25, 14.25, 3, 14.25, // 12-15 employment status
  19.5, // 16    TEACHING LOAD
  14.25, // 17    A. Basic Load/Built-In
  14.25, 19.8, // 18-19 table A header
  18.6, 18.6, 18.6, 18.6, 18.6, 18.6, 18.6, // 20-26 table A body
  16.2, // 27    total (basic)
  14.25, // 28    B. Overload/Part Time Load
  14.25, 21, // 29-30 table B header
  18.6, 18.6, 18.6, 18.6, 18.6, 18.6, // 31-36 table B body
  14.25, // 37    total (overload)
  14.25, // 38    grand total
  14.25, // 39    C. Other Designation/Functions
  19.8, 19.2, // 40-41 designation lines 1 and 2
  10.8, 3.75, // 42-43 spacer
  21.6, // 44    Prepared / Verified by
  14.25, // 45    signature lines
  17.4, // 46    signatory titles
  14.25, 14.25, // 47-48 date signed
  22.5, // 49    Recommending Approval / Approved
  33, // 50    signatory names
  15.6, // 51    signatory titles
  18.6, // 52    date signed
  27, // 53    Received
  13.2, // 54    instructor signature line
  14.4, // 55    instructor name caption
  11.4, // 56    Reminder
  13.2, // 57    reminder text
  5.4, // 58    footer bar
] as const;

/** Legal portrait is 216mm wide; the form is 190mm of it, centred. */
export const FORM_WIDTH_MM = 190;
const FORM_LEFT_MM = (216 - FORM_WIDTH_MM) / 2;
const FORM_TOP_MM = 6;
const POINTS_TO_MM = 25.4 / 72;

/** Left edge of columns A..K; index 11 is the right edge of K. */
const COLUMN_X: number[] = (() => {
  const totalChars = COLUMN_CHARS.reduce((sum, chars) => sum + chars, 0);
  const scale = FORM_WIDTH_MM / totalChars;
  const edges = [FORM_LEFT_MM];
  COLUMN_CHARS.forEach((chars, index) => edges.push(edges[index] + chars * scale));
  return edges;
})();

/** Top edge of rows 1..58, indexed by row number; index 59 is the bottom edge. */
const ROW_Y: number[] = (() => {
  const edges = [0, FORM_TOP_MM];
  ROW_POINTS.forEach((points, index) => edges.push(edges[index + 1] + points * POINTS_TO_MM));
  return edges;
})();

export type Column = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

/** Last row of the form box, and so the last row of its outer border. */
export const LAST_ROW = ROW_POINTS.length;

export const left = (column: Column): number => COLUMN_X[column.charCodeAt(0) - 65];
export const right = (column: Column): number => COLUMN_X[column.charCodeAt(0) - 64];
export const top = (row: number): number => ROW_Y[row];
export const bottom = (row: number): number => ROW_Y[row + 1];
export const middle = (row: number, throughRow = row): number => (top(row) + bottom(throughRow)) / 2;

/** Excel's border weights, as PDF line widths. */
export const MEDIUM = 0.45;
export const THIN = 0.15;

/** Fills and font colours lifted from the workbook's style table. */
export const MAROON: [number, number, number] = [128, 0, 0]; // Excel FF800000
export const NAVY: [number, number, number] = [0, 0, 102]; // Excel FF000066
export const BLACK: [number, number, number] = [0, 0, 0];

/* ── Fonts ────────────────────────────────────────────────────────────────── */

/**
 * The form is set in Arial Narrow, with Bookman Old Style on the college banner
 * and Calibri on a few signatory cells. jsPDF ships none of them, so each maps
 * to a built-in face and -- for the narrow faces -- a smaller point size, which
 * keeps line lengths close to the original instead of overrunning the cells.
 */
export const SIZE = {
  /** Arial Narrow 14 -- TEACHING LOAD. */
  title: 11,
  /** Arial Narrow 12 -- section headings, field labels, table headers. */
  label: 9,
  /** Arial Narrow 11 -- table body, employment status. */
  body: 8.5,
  /** Arial Narrow 10 -- "Date Signed:", "Received:". */
  small: 8,
  /** Arial Narrow 9 italic -- the instructor-name caption. */
  caption: 7,
  /** Bookman Old Style 12 -- the college banner. */
  banner: 10.5,
  /** The document-control footer, below the form box. */
  control: 6.5,
} as const;

type FontStyle = "normal" | "bold" | "italic" | "bolditalic";

interface TextStyle {
  size?: number;
  style?: FontStyle;
  /** Bookman Old Style is closest to Times among the built-in faces. */
  font?: "helvetica" | "times";
  align?: "left" | "center" | "right";
  color?: readonly [number, number, number];
  /** Cell padding, in mm. Defaults to a hair over Excel's own. */
  padding?: number;
}

/** Leading between stacked lines in one cell, as a multiple of the font size. */
const LINE_HEIGHT = 1.08;

/**
 * Vertical centring: jsPDF places text on its baseline, which sits roughly
 * 0.36em below the visual centre of a line of capitals and ascenders.
 */
export const baselineAt = (centreY: number, size: number): number =>
  centreY + size * POINTS_TO_MM * 0.36;

const baselineOf = (row: number, throughRow: number, size: number): number =>
  baselineAt(middle(row, throughRow), size);

const applyStyle = (doc: jsPDF, style: TextStyle): number => {
  const size = style.size ?? SIZE.body;
  doc.setFont(style.font ?? "helvetica", style.style ?? "normal");
  doc.setFontSize(size);
  doc.setTextColor(...(style.color ?? BLACK));
  return size;
};

/**
 * Draws text inside the cell range, shrinking it if it would otherwise spill
 * past the range. Shrinking matters because the fields are filled from live
 * data: a long course title or a four-word designation must stay inside its
 * ruled box rather than run over the neighbouring column.
 */
export const drawText = (
  doc: jsPDF,
  value: string,
  span: { from: Column; to?: Column; row: number; throughRow?: number },
  style: TextStyle = {},
): void => {
  const text = value.trim();
  if (!text) return;

  const size = applyStyle(doc, style);
  const padding = style.padding ?? 0.8;
  const x1 = left(span.from) + padding;
  const x2 = right(span.to ?? span.from) - padding;
  const available = x2 - x1;

  // Step down rather than scale, so the result still looks like a typed form.
  let fitted = size;
  while (fitted > 4 && doc.getTextWidth(text) > available) {
    fitted -= 0.25;
    doc.setFontSize(fitted);
  }

  const y = baselineOf(span.row, span.throughRow ?? span.row, fitted);
  const align = style.align ?? "left";
  const x = align === "center" ? (x1 + x2) / 2 : align === "right" ? x2 : x1;
  doc.text(text, x, y, { align });
};

/**
 * Several lines stacked in one cell, centred on it as a block and shrunk
 * together until the longest fits the cell's width and all of them fit its
 * height. The "Time" column needs this: a class on a split day can meet at a
 * different time on each of them, and each range is a line of the one cell.
 */
export const drawTextLines = (
  doc: jsPDF,
  values: string[],
  span: { from: Column; to?: Column; row: number; throughRow?: number },
  style: TextStyle = {},
): void => {
  const lines = values.map((value) => value.trim()).filter(Boolean);
  if (lines.length <= 1) {
    drawText(doc, lines[0] ?? "", span, style);
    return;
  }

  const size = applyStyle(doc, style);
  const padding = style.padding ?? 0.8;
  const x1 = left(span.from) + padding;
  const x2 = right(span.to ?? span.from) - padding;
  const available = x2 - x1;
  const throughRow = span.throughRow ?? span.row;
  // Leave the cell's own rules clear above the first line and below the last.
  const headroom = bottom(throughRow) - top(span.row) - 1.2;

  // Step down rather than scale, as drawText does, and hold every line at the
  // one size: a stack set in two sizes reads as two separate entries.
  let fitted = size;
  const overflows = () =>
    lines.some((line) => doc.getTextWidth(line) > available) ||
    lines.length * fitted * POINTS_TO_MM * LINE_HEIGHT > headroom;
  while (fitted > 4 && overflows()) {
    fitted -= 0.25;
    doc.setFontSize(fitted);
  }

  const lineHeight = fitted * POINTS_TO_MM * LINE_HEIGHT;
  const align = style.align ?? "left";
  const x = align === "center" ? (x1 + x2) / 2 : align === "right" ? x2 : x1;
  const firstBaseline =
    baselineOf(span.row, throughRow, fitted) - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => doc.text(line, x, firstBaseline + index * lineHeight, { align }));
};

/** Two stacked lines in one cell -- the form's "Units / (lec)" style headers. */
export const drawStackedText = (
  doc: jsPDF,
  lines: [string, string],
  span: { from: Column; to?: Column; row: number; throughRow?: number },
  style: TextStyle = {},
): void => {
  const size = applyStyle(doc, style);
  const centre = middle(span.row, span.throughRow ?? span.row);
  const lineHeight = size * POINTS_TO_MM * LINE_HEIGHT;
  const x = (left(span.from) + right(span.to ?? span.from)) / 2;
  doc.text(lines[0], x, centre - lineHeight * 0.12, { align: "center" });
  doc.text(lines[1], x, centre + lineHeight * 0.92, { align: "center" });
};

/* ── Rules and fills ──────────────────────────────────────────────────────── */

const stroke = (doc: jsPDF, weight: number): void => {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(weight);
};

/** Horizontal rule along the top or bottom edge of a cell range. */
export const rule = (
  doc: jsPDF,
  span: { from: Column; to?: Column; row: number; edge: "top" | "bottom" },
  weight: number = THIN,
): void => {
  stroke(doc, weight);
  const y = span.edge === "top" ? top(span.row) : bottom(span.row);
  doc.line(left(span.from), y, right(span.to ?? span.from), y);
};

/** Vertical rule along the left or right edge of a column, over a row range. */
export const columnRule = (
  doc: jsPDF,
  span: { column: Column; row: number; throughRow?: number; edge: "left" | "right" },
  weight: number = THIN,
): void => {
  stroke(doc, weight);
  const x = span.edge === "left" ? left(span.column) : right(span.column);
  doc.line(x, top(span.row), x, bottom(span.throughRow ?? span.row));
};

export const box = (
  doc: jsPDF,
  span: { from: Column; to: Column; row: number; throughRow?: number },
  weight: number = THIN,
): void => {
  stroke(doc, weight);
  const x = left(span.from);
  const y = top(span.row);
  doc.rect(x, y, right(span.to) - x, bottom(span.throughRow ?? span.row) - y);
};

export const fill = (
  doc: jsPDF,
  span: { from: Column; to: Column; row: number; throughRow?: number },
  color: readonly [number, number, number],
): void => {
  doc.setFillColor(...color);
  const x = left(span.from);
  const y = top(span.row);
  doc.rect(x, y, right(span.to) - x, bottom(span.throughRow ?? span.row) - y, "F");
};

/** A small tick box, vertically centred in its row and right-aligned in its column. */
export const checkbox = (
  doc: jsPDF,
  span: { column: Column; row: number },
  ticked: boolean,
): void => {
  const size = 3.1;
  const x = right(span.column) - size - 0.6;
  const y = middle(span.row) - size / 2;
  stroke(doc, THIN);
  doc.rect(x, y, size, size);
  if (!ticked) return;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text("X", x + size / 2, y + size - 0.55, { align: "center" });
};

/**
 * A labelled fill-in blank: bold caption, then a rule the value is written on.
 * Returns the x it ended at, so a caller can chain several across one row --
 * which is how the form's "Surname: ___ Given Name: ___ MI: ___" line is built.
 */
export const drawBlank = (
  doc: jsPDF,
  options: { label: string; value: string; row: number; x: number; labelWidth: number; ruleWidth: number },
): number => {
  const { label, value, row, x, labelWidth, ruleWidth } = options;
  const baseline = baselineOf(row, row, SIZE.label);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.label);
  doc.setTextColor(...BLACK);
  doc.text(label, x, baseline);

  const ruleStart = x + labelWidth;
  const ruleEnd = ruleStart + ruleWidth;
  stroke(doc, THIN);
  doc.line(ruleStart, bottom(row) - 0.9, ruleEnd, bottom(row) - 0.9);

  if (value.trim()) {
    doc.setFont("helvetica", "normal");
    let size = SIZE.label;
    doc.setFontSize(size);
    while (size > 5 && doc.getTextWidth(value) > ruleWidth - 2) {
      size -= 0.25;
      doc.setFontSize(size);
    }
    doc.text(value, (ruleStart + ruleEnd) / 2, bottom(row) - 1.7, { align: "center" });
  }

  return ruleEnd;
};
