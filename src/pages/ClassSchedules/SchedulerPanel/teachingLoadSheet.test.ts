import { describe, expect, it, vi } from "vitest";
import jsPDF from "jspdf";
import { LAST_ROW, bottom, left, right, top } from "./teachingLoadForm";
import { classifyLoad } from "./teachingLoadRows";
import { drawSheet } from "./teachingLoadSheet";
import type { Faculty, ScheduleItem } from "./types";

/**
 * Checks the two rulings the sheet is particular about: the totals rows carry no
 * divider between their two figures, and the document-control footer is a box.
 *
 * Nothing here rasterises the PDF -- it records what was asked of jsPDF and
 * measures that, which is enough to catch a rule drawn in the wrong place.
 */

/** The rows carrying "TOTAL ... (BASIC)", "... (OVERLOAD)" and "GRAND TOTAL". */
const TOTALS_ROWS = [27, 37, 38];
/** A body row of table A, for contrast: those keep every divider. */
const BODY_ROW = 20;

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const meeting = (overrides: Partial<ScheduleItem>): ScheduleItem =>
  ({
    id: "1",
    courseId: "c1",
    courseCode: "IT 101",
    courseName: "Introduction to Computing",
    sectionId: "s1",
    sectionName: "BSIT 1A",
    day: "monday",
    dayIndex: 0,
    startTime: "07:00",
    endTime: "10:00",
    startSlot: 0,
    durationSlots: 6,
    lectureUnits: 3,
    laboratoryUnits: 0,
    totalUnits: 3,
    ...overrides,
  }) as ScheduleItem;

/** Draws a whole sheet and reports every line, rect and string it drew. */
const renderSheet = () => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "legal" });
  const lines: Line[] = [];
  const rects: Rect[] = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];

  vi.spyOn(doc, "line").mockImplementation(((x1: number, y1: number, x2: number, y2: number) => {
    lines.push({ x1, y1, x2, y2 });
    return doc;
  }) as typeof doc.line);
  vi.spyOn(doc, "rect").mockImplementation(((x: number, y: number, w: number, h: number) => {
    rects.push({ x, y, w, h });
    return doc;
  }) as typeof doc.rect);
  vi.spyOn(doc, "text").mockImplementation(((text: string, x: number, y: number) => {
    texts.push({ text: String(text), x, y });
    return doc;
  }) as typeof doc.text);

  const schedules = [
    meeting({ id: "1", day: "monday", dayIndex: 0, startTime: "07:00", endTime: "10:00" }),
    meeting({ id: "2", day: "thursday", dayIndex: 3, startTime: "07:00", endTime: "09:00" }),
  ];
  const faculty = { id: "f1", name: "A B Cruz", employmentType: "full-time", maxUnits: 21 } as Faculty;
  const load = classifyLoad(faculty, schedules);

  drawSheet(doc, {
    logoImg: null,
    muniImg: null,
    collegeName: "COMPUTER STUDIES",
    semester: "1ST",
    academicYear: "2025-2026",
    surname: "Cruz",
    givenName: "A",
    middleInitial: "B",
    isPartTime: false,
    designation: "",
    instructorName: "A B CRUZ",
    preparedBy: "",
    verifiedBy: "",
    vpaaName: "",
    presidentName: "",
    presidentTitle: "",
    load,
    basicLines: load.basic,
    overloadLines: load.overload,
    sheetNumber: 1,
    sheetCount: 1,
  });

  return { doc, lines, rects, texts };
};

/** Vertical lines standing on the J|K boundary that cross the given row. */
const dividersOnRow = (lines: Line[], row: number): Line[] =>
  lines.filter(
    (line) =>
      Math.abs(line.x1 - line.x2) < 0.01 &&
      Math.abs(line.x1 - right("J")) < 0.01 &&
      line.y1 < bottom(row) - 0.01 &&
      line.y2 > top(row) + 0.01,
  );

describe("drawSheet totals rows", () => {
  it("draws no divider between the units and the hours", () => {
    const { lines } = renderSheet();

    TOTALS_ROWS.forEach((row) => expect(dividersOnRow(lines, row)).toEqual([]));
  });

  it("still rules the row above and below", () => {
    const { lines } = renderSheet();

    TOTALS_ROWS.forEach((row) => {
      const horizontals = lines.filter(
        (line) =>
          Math.abs(line.y1 - line.y2) < 0.01 &&
          Math.abs(line.x1 - left("J")) < 0.01 &&
          Math.abs(line.x2 - right("K")) < 0.01,
      );
      expect(horizontals.some((line) => Math.abs(line.y1 - top(row)) < 0.01)).toBe(true);
      expect(horizontals.some((line) => Math.abs(line.y1 - bottom(row)) < 0.01)).toBe(true);
    });
  });

  it("leaves the body rows' dividers alone", () => {
    const { lines } = renderSheet();

    expect(dividersOnRow(lines, BODY_ROW)).toHaveLength(1);
  });
});

describe("drawSheet control footer", () => {
  /** The only rect below the form box is the control footer's. */
  const controlBox = (rects: Rect[]) => {
    const found = rects.filter((r) => r.y > bottom(LAST_ROW));
    expect(found).toHaveLength(1);
    return found[0];
  };

  it("boxes the document and revision numbers", () => {
    const { rects } = renderSheet();
    const box = controlBox(rects);

    expect(box.x).toBeCloseTo(left("A"), 2);
    expect(box.w).toBeGreaterThan(50);
    expect(box.h).toBeGreaterThan(3);
  });

  it("divides the box into a cell per label and per value", () => {
    const { lines, rects } = renderSheet();
    const box = controlBox(rects);
    const inside = lines.filter(
      (line) =>
        Math.abs(line.x1 - line.x2) < 0.01 &&
        line.y1 >= box.y - 0.01 &&
        line.y2 <= box.y + box.h + 0.01 &&
        line.x1 > box.x &&
        line.x1 < box.x + box.w,
    );

    // Four cells, so three rules between them.
    expect(inside).toHaveLength(3);
  });

  it("writes each value inside the box, clear of the page edge", () => {
    const { doc, rects, texts } = renderSheet();
    const box = controlBox(rects);
    const pageHeight = doc.internal.pageSize.getHeight();

    ["Document No.", "TCC-VPAA-001", "Revision No.", "001"].forEach((label) => {
      const drawn = texts.find((entry) => entry.text === label);
      expect(drawn, label).toBeDefined();
      expect(drawn!.y).toBeGreaterThan(box.y);
      expect(drawn!.y).toBeLessThan(box.y + box.h);
      expect(drawn!.x).toBeGreaterThan(box.x);
      expect(drawn!.x).toBeLessThan(box.x + box.w);
    });

    // The whole box clears the bottom of the sheet.
    expect(box.y + box.h).toBeLessThan(pageHeight - 3);
  });
});
