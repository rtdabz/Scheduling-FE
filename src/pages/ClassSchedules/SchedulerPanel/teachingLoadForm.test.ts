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
const SPLIT_TIMES = ["7:00 AM\u201310:00 AM", "7:00 AM\u20139:00 AM"];

/** Draws into column E and reports where each line landed and at what size. */
const drawIntoTimeCell = (times: string[]) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "legal" });
  const placed: Array<{ text: string; x: number; y: number }> = [];
  vi.spyOn(doc, "text").mockImplementation(((text: string, x: number, y: number) => {
    placed.push({ text, x, y });
    return doc;
  }) as typeof doc.text);

  drawTextLines(doc, times, { from: "E", row: BODY_ROW }, { size: SIZE.body, align: "center" });

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

    expect((placed[0].y + placed[1].y) / 2).toBeCloseTo(centre + 0.5, 0);
  });

  it("shrinks until the longest range fits the column", () => {
    const { placed, size, widthOf } = drawIntoTimeCell(SPLIT_TIMES);
    const cellWidth = right("E") - left("E");

    placed.forEach(({ text }) => expect(widthOf(text)).toBeLessThanOrEqual(cellWidth));
    // Legible in print: the stack is smaller than the body size but not the 4pt
    // floor the shrink loop stops at.
    expect(size).toBeLessThan(SIZE.body);
    expect(size).toBeGreaterThan(5);
  });

  it("draws a lone range as an ordinary centred cell", () => {
    const { placed, size } = drawIntoTimeCell([SPLIT_TIMES[0]]);

    expect(placed).toHaveLength(1);
    expect(placed[0].x).toBeCloseTo((left("E") + right("E")) / 2, 1);
    expect(size).toBeLessThan(SIZE.body);
  });
});
