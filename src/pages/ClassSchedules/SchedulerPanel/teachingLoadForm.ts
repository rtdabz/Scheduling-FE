import type jsPDF from "jspdf";

const COLUMN_CHARS = [
  13, 10.77734375, 14.5, 7.77734375, 20.5, 8.77734375,
  10.5546875, 7.21875, 7.44140625, 5.44140625, 6.88671875,
] as const;

const ROW_POINTS = [
  14.25, 14.25, 10.2, 10.2, 51.6,
  20.4,
  14.25,
  20.4,
  17.4, 6.45,
  14.25,
  14.25, 14.25, 3, 14.25,
  19.5,
  14.25,
  14.25, 19.8,
  24.5, 24.5, 24.5, 24.5, 24.5, 24.5, 24.5,
  16.2,
  14.25,
  14.25, 21,
  24.5, 24.5, 24.5, 24.5, 24.5, 24.5,
  14.25,
  14.25,
  24.25,
  19.8, 19.2,
  4.8, 3.75,
  17.6,
  14.25,
  17.4,
  14.25, 14.25,
  22.5,
  33,
  15.6,
  18.6,
  27,
  13.2,
  14.4,
  11.4,
  13.2,
  5.4,
] as const;

export const FORM_WIDTH_MM = 190;
const FORM_LEFT_MM = (216 - FORM_WIDTH_MM) / 2;
const FORM_TOP_MM = 6;
const POINTS_TO_MM = 25.4 / 72;

const COLUMN_X: number[] = (() => {
  const totalChars = COLUMN_CHARS.reduce((sum, chars) => sum + chars, 0);
  const scale = FORM_WIDTH_MM / totalChars;
  const edges = [FORM_LEFT_MM];
  COLUMN_CHARS.forEach((chars, index) => edges.push(edges[index] + chars * scale));
  return edges;
})();

export const OVERLOAD_BODY_FIRST_ROW = 31;
export const OVERLOAD_BODY_ROWS = 6;
const LAST_OVERLOAD_BODY_ROW = OVERLOAD_BODY_FIRST_ROW + OVERLOAD_BODY_ROWS - 1;
const OVERLOAD_ROW_POINTS = ROW_POINTS[LAST_OVERLOAD_BODY_ROW - 1];

const buildRowY = (extraOverloadRows: number): number[] => {
  const points = [
    ...ROW_POINTS.slice(0, LAST_OVERLOAD_BODY_ROW),
    ...Array<number>(extraOverloadRows).fill(OVERLOAD_ROW_POINTS),
    ...ROW_POINTS.slice(LAST_OVERLOAD_BODY_ROW),
  ];
  const edges = [0, FORM_TOP_MM];
  points.forEach((rowPoints, index) => edges.push(edges[index + 1] + rowPoints * POINTS_TO_MM));
  return edges;
};

export const extraOverloadRowsFor = (overloadLineCount: number): number =>
  Math.max(0, overloadLineCount - OVERLOAD_BODY_ROWS);

let extraOverloadRows = 0;
let ROW_Y: number[] = buildRowY(0);

export const setOverloadLineCount = (overloadLineCount: number): void => {
  const extra = extraOverloadRowsFor(overloadLineCount);
  if (extra === extraOverloadRows) return;
  extraOverloadRows = extra;
  ROW_Y = buildRowY(extra);
};

export const formRow = (row: number): number =>
  row > LAST_OVERLOAD_BODY_ROW ? row + extraOverloadRows : row;

export type Column = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

export const LAST_ROW = ROW_POINTS.length;

export const FORM_PAGE_SIZE: [number, number] = [216, 390];

export const formPageSize = (overloadLineCount: number): [number, number] => [
  FORM_PAGE_SIZE[0],
  FORM_PAGE_SIZE[1] + extraOverloadRowsFor(overloadLineCount) * OVERLOAD_ROW_POINTS * POINTS_TO_MM,
];

export const left = (column: Column): number => COLUMN_X[column.charCodeAt(0) - 65];
export const right = (column: Column): number => COLUMN_X[column.charCodeAt(0) - 64];
export const top = (row: number): number => ROW_Y[row];
export const bottom = (row: number): number => ROW_Y[row + 1];
export const middle = (row: number, throughRow = row): number => (top(row) + bottom(throughRow)) / 2;

export const MEDIUM = 0.45;
export const THIN = 0.15;

export const MAROON: [number, number, number] = [128, 0, 0];
export const NAVY: [number, number, number] = [0, 0, 102];
export const BLACK: [number, number, number] = [0, 0, 0];

export const SIZE = {
  title: 11,
  label: 9,
  body: 8.5,
  small: 8,
  caption: 7,
  banner: 10.5,
  control: 6.5,
} as const;

type FontStyle = "normal" | "bold" | "italic" | "bolditalic";

interface TextStyle {
  size?: number;
  style?: FontStyle;
  font?: "helvetica" | "times";
  align?: "left" | "center" | "right";
  color?: readonly [number, number, number];
  padding?: number;
  separator?: "none" | "underline" | "cellRule";
  fixedSize?: boolean;
  lineColors?: ReadonlyArray<readonly [number, number, number] | undefined>;
}

const LINE_HEIGHT = 1.08;

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

  let fitted = size;
  while (!style.fixedSize && fitted > 4 && doc.getTextWidth(text) > available) {
    fitted -= 0.25;
    doc.setFontSize(fitted);
  }

  const y = baselineOf(span.row, span.throughRow ?? span.row, fitted);
  const align = style.align ?? "left";
  const x = align === "center" ? (x1 + x2) / 2 : align === "right" ? x2 : x1;
  doc.text(text, x, y, { align });
};

export const drawTextLines = (
  doc: jsPDF,
  values: string[],
  span: { from: Column; to?: Column; row: number; throughRow?: number },
  style: TextStyle = {},
): void => {
  const entries = values
    .map((value, index) => ({ text: value.trim(), color: style.lineColors?.[index] ?? style.color }))
    .filter((entry) => entry.text);
  const lines = entries.map((entry) => entry.text);
  if (lines.length <= 1) {
    drawText(doc, lines[0] ?? "", span, { ...style, color: entries[0]?.color, fixedSize: false });
    return;
  }

  const size = applyStyle(doc, style);
  const padding = style.padding ?? 0.8;
  const x1 = left(span.from) + padding;
  const x2 = right(span.to ?? span.from) - padding;
  const available = x2 - x1;
  const throughRow = span.throughRow ?? span.row;
  const headroom = bottom(throughRow) - top(span.row) - 0.2;

  let fitted = size;
  const overflows = () =>
    lines.some((line) => doc.getTextWidth(line) > available) ||
    lines.length * fitted * POINTS_TO_MM * LINE_HEIGHT > headroom;
  while (!style.fixedSize && fitted > 4 && overflows()) {
    fitted -= 0.25;
    doc.setFontSize(fitted);
  }

  const cellTop = top(span.row);
  const cellBottom = bottom(throughRow);
  const cellHeight = cellBottom - cellTop;
  const lineHeight = style.separator === "cellRule" ? cellHeight / lines.length : fitted * POINTS_TO_MM * LINE_HEIGHT;
  const align = style.align ?? "left";
  const x = align === "center" ? (x1 + x2) / 2 : align === "right" ? x2 : x1;
  const firstBaseline = style.separator === "cellRule"
    ? baselineAt(cellTop + lineHeight / 2, fitted)
    : baselineOf(span.row, throughRow, fitted) - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    const baseline = firstBaseline + index * lineHeight;
    doc.setTextColor(...(entries[index].color ?? BLACK));
    doc.text(line, x, baseline, { align });

    if (style.separator === "cellRule" && index < lines.length - 1) {
      doc.setDrawColor(...(style.color ?? BLACK));
      doc.setLineWidth(MEDIUM);
      const boundary = cellTop + lineHeight * (index + 1);
      doc.line(left(span.from), boundary, right(span.to ?? span.from), boundary);
    } else if (style.separator === "underline" && index < lines.length - 1) {
      const width = doc.getTextWidth(line);
      const start = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
      doc.setDrawColor(...(style.color ?? BLACK));
      doc.setLineWidth(THIN);
      doc.line(start, baseline + 0.45, start + width, baseline + 0.45);
    }
  });
};

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

const stroke = (doc: jsPDF, weight: number): void => {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(weight);
};

export const rule = (
  doc: jsPDF,
  span: { from: Column; to?: Column; row: number; edge: "top" | "bottom" },
  weight: number = THIN,
): void => {
  stroke(doc, weight);
  const y = span.edge === "top" ? top(span.row) : bottom(span.row);
  doc.line(left(span.from), y, right(span.to ?? span.from), y);
};

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
