import { describe, expect, it, vi } from "vitest";
import jsPDF from "jspdf";
import { SIZE, bottom, drawTextLines, left, right, top } from "./teachingLoadForm";

/**
 * The Time column carries one line per meeting time, so its cell has to hold a
 * stack rather than a single string. These check the stack stays inside the
 * ruled cell -- the whole point of drawing it as lines instead of one run-on
 * string that had to shrink to nothing to fit.
 */

/** The body rows of table A; row 20 is its first. */
const BODY_ROW = 20;
const SPLIT_TIMES = ["7:00 AM \u2013 10:00 AM", "7:00 AM \u2013 9:00 AM"];

/** Draws into column E and reports where each line landed and at what size. */
const drawIntoTimeCell = (times: string[]) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "legal" });
  const placed: Array<{ text: string; x: number; y: number }> = [];
  vi.spyOn(doc, "text").mockImplementation(((text: string, x: number, y: number) => {
    placed.push({ text, x, y });
    return doc;
  }) as typeof doc.text);

  drawTextLines(doc, times, { from: "E", row: BODY_ROW }, {
    size: SIZE.body,
    align: "center",
    fixedSize: true,
  });

  // The fitted size is still set on the document, so widths measured here are
  // the widths that were drawn.
  return { placed, size: doc.getFontSize(), widthOf: (text: string) => doc.getTextWidth(text) };
};

describe("drawTextLines", () => {
  it("stacks every range inside the cell's rules", () => {
    const { placed } = drawIntoTimeCell(SPLIT_TIMES);

    expect(placed.map((line) => line.text)).toEqual(SPLIT_TIMES);
    placed.forEach(({ y }) => {
      expect(y).toBeGreaterThan(top(BODY_ROW));
      expect(y).toBeLessThan(bottom(BODY_ROW));
    });
    // In the order given, top to bottom.
    expect(placed[0].y).toBeLessThan(placed[1].y);
  });

  it("centres the stack on the row", () => {
    const { placed } = drawIntoTimeCell(SPLIT_TIMES);
    const centre = (top(BODY_ROW) + bottom(BODY_ROW)) / 2;

    expect((placed[0].y + placed[1].y) / 2).toBeCloseTo(centre + 0.6, 0);
  });

  it("shrinks until the longest range fits the column", () => {
    const { placed, size, widthOf } = drawIntoTimeCell(SPLIT_TIMES);
    const cellWidth = right("E") - left("E");

    placed.forEach(({ text }) => expect(widthOf(text)).toBeLessThanOrEqual(cellWidth));
    // The widened Time column and available cell height keep the stack at the
    // regular body size instead of shrinking it to fit.
    expect(size).toBe(SIZE.body);
  });

  it("draws a lone range as an ordinary centred cell", () => {
    const { placed, size } = drawIntoTimeCell([SPLIT_TIMES[0]]);

    expect(placed).toHaveLength(1);
    expect(placed[0].x).toBeCloseTo((left("E") + right("E")) / 2, 1);
    expect(size).toBe(SIZE.body);
  });

  it("draws a full-width rule between stacked times when requested", () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "legal" });
    const separators: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    vi.spyOn(doc, "line").mockImplementation(((x1: number, y1: number, x2: number, y2: number) => {
      separators.push({ x1, y1, x2, y2 });
      return doc;
    }) as typeof doc.line);

    drawTextLines(doc, SPLIT_TIMES, { from: "E", row: BODY_ROW }, {
      size: SIZE.body,
      align: "center",
      separator: "cellRule",
    });

    expect(separators).toHaveLength(1);
    expect(separators[0].x1).toBeCloseTo(left("E"), 1);
    expect(separators[0].x2).toBeCloseTo(right("E"), 1);
    expect(separators[0].y1).toBe(separators[0].y2);
  });
});
