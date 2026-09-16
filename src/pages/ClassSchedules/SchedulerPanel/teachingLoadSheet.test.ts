import { afterEach, describe, expect, it, vi } from "vitest";
import jsPDF from "jspdf";
import { FORM_PAGE_SIZE, LAST_ROW, bottom, formPageSize, formRow, left, right, setOverloadLineCount, top } from "./teachingLoadForm";
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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: FORM_PAGE_SIZE });
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
    designations: [],
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

/** Every string drawn, with the text colour it was drawn in, and every filled rect's colour. */
const recordColours = (doc: jsPDF) => {
  const fills: string[] = [];
  const texts: Array<{ text: string; color: string }> = [];
  let fillColour = "";
  let textColour = "0,0,0";
  vi.spyOn(doc, "setFillColor").mockImplementation(((...rgb: number[]) => { fillColour = rgb.join(","); return doc; }) as typeof doc.setFillColor);
  vi.spyOn(doc, "setTextColor").mockImplementation(((...rgb: number[]) => { textColour = rgb.join(","); return doc; }) as typeof doc.setTextColor);
  vi.spyOn(doc, "rect").mockImplementation(((_x: number, _y: number, _w: number, _h: number, style?: string) => { if (style === "F") fills.push(fillColour); return doc; }) as typeof doc.rect);
  vi.spyOn(doc, "text").mockImplementation(((text: string) => { texts.push({ text: String(text), color: textColour }); return doc; }) as typeof doc.text);
  return { fills, texts };
};

const PROBONO_TEXT = "107,114,128";
const OVERLOAD_TEXT = "248,113,113";
const CONFLICT_TEXT = "220,38,38";
const PALE_FILLS = ["254,226,226", "255,237,213"];

describe("drawSheet pro bono text", () => {
  const renderWith = (probonoUnits: number, overriddenIndex: number | null = null, overloadUnits = 3) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: FORM_PAGE_SIZE });
    const { fills, texts } = recordColours(doc);

    // Basic Load 3: the first subject is basic, the second overload, the third pro bono.
    const schedules = [0, 1, 2].map((index) =>
      meeting({ id: String(index), courseId: `c${index}`, courseCode: `IT 10${index}`, dayIndex: index, day: ["monday", "tuesday", "wednesday"][index], facultyConflictOverride: index === overriddenIndex }),
    );
    const faculty = { id: "f1", name: "A B Cruz", employmentType: "full-time", requiredUnits: 3, overloadUnits, probonoUnits } as Faculty;
    const load = classifyLoad(faculty, schedules);

    drawSheet(doc, {
      logoImg: null, muniImg: null, collegeName: "IT", semester: "1ST", academicYear: "2026-2027",
      surname: "Cruz", givenName: "A", middleInitial: "B", isPartTime: false, designations: [],
      instructorName: "A B CRUZ", preparedBy: "", verifiedBy: "", vpaaName: "", presidentName: "", presidentTitle: "",
      load, basicLines: load.basic, overloadLines: load.overload, sheetNumber: 1, sheetCount: 1,
    });
    return { fills, texts };
  };

  it("prints overload in light red and pro bono in grey, without shading the rows, and says why", () => {
    const { fills, texts } = renderWith(3);
    // Line 1 of the Overload table (IT 101) is paid overload, line 2 (IT 102) pro bono.
    expect(texts.find((entry) => entry.text === "IT 102")?.color).toBe(PROBONO_TEXT);
    expect(texts.find((entry) => entry.text === "IT 101")?.color).toBe(OVERLOAD_TEXT);
    // The basic subject keeps plain black text.
    expect(texts.find((entry) => entry.text === "IT 100")?.color).toBe("0,0,0");
    expect(fills.filter((colour) => PALE_FILLS.includes(colour))).toHaveLength(0);
    expect(texts.map((entry) => entry.text)).toContain("Grey text is Pro Bono");
    expect(texts.map((entry) => entry.text)).toContain("Light red text is Overload");
  });

  it("colours nothing when no subject reached pro bono", () => {
    // A 6-unit overload allowance holds both subjects past Basic Load.
    const { texts } = renderWith(0, null, 6);
    expect(texts.filter((entry) => entry.text.startsWith("IT 10") && entry.color === PROBONO_TEXT)).toHaveLength(0);
    expect(texts.filter((entry) => entry.text.startsWith("IT 10") && entry.color === OVERLOAD_TEXT)).toHaveLength(2);
    expect(texts.map((entry) => entry.text)).not.toContain("Grey text is Pro Bono");
  });
});

describe("drawSheet instructor conflict text", () => {
  it("prints conflict overrides in red while keeping pro bono grey, with no conflict label", () => {
    // All three bands have an override; pro bono must retain its grey text.
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: FORM_PAGE_SIZE });
    const { fills, texts } = recordColours(doc);

    const schedules = [0, 1, 2].map((index) =>
      meeting({ id: String(index), courseId: `c${index}`, courseCode: `IT 10${index}`, dayIndex: index, day: ["monday", "tuesday", "wednesday"][index], facultyConflictOverride: true }),
    );
    const faculty = { id: "f1", name: "A B Cruz", employmentType: "full-time", requiredUnits: 3, overloadUnits: 3, probonoUnits: 3 } as Faculty;
    const load = classifyLoad(faculty, schedules);
    drawSheet(doc, {
      logoImg: null, muniImg: null, collegeName: "IT", semester: "1ST", academicYear: "2026-2027",
      surname: "Cruz", givenName: "A", middleInitial: "B", isPartTime: false, designations: [],
      instructorName: "A B CRUZ", preparedBy: "", verifiedBy: "", vpaaName: "", presidentName: "", presidentTitle: "",
      load, basicLines: load.basic, overloadLines: load.overload, sheetNumber: 1, sheetCount: 1,
    });

    expect(texts.find((entry) => entry.text === "IT 100")?.color).toBe(CONFLICT_TEXT);
    expect(texts.find((entry) => entry.text === "IT 101")?.color).toBe(CONFLICT_TEXT);
    expect(texts.find((entry) => entry.text === "IT 102")?.color).toBe(PROBONO_TEXT);
    expect(fills.filter((colour) => PALE_FILLS.includes(colour))).toHaveLength(0);
    expect(texts.some((entry) => /override|conflict/i.test(entry.text))).toBe(false);
    expect(texts.map((entry) => entry.text)).toContain("Grey text is Pro Bono");
  });
});

describe("drawSheet with more overload subjects than the form's six lines", () => {
  afterEach(() => setOverloadLineCount(0));

  it("adds a line per extra subject to the same table and grows the page to fit", () => {
    const format = formPageSize(8);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format });
    const texts: Array<{ text: string; y: number }> = [];
    const rects: Array<{ y: number; h: number }> = [];
    vi.spyOn(doc, "text").mockImplementation(((text: string, _x: number, y: number) => {
      texts.push({ text: String(text), y });
      return doc;
    }) as typeof doc.text);
    vi.spyOn(doc, "rect").mockImplementation(((_x: number, y: number, _w: number, h: number) => {
      rects.push({ y, h });
      return doc;
    }) as typeof doc.rect);

    // Basic Load 3 holds the first subject; the other eight are overload.
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const schedules = Array.from({ length: 9 }, (_, index) =>
      meeting({
        id: String(index),
        courseId: `c${index}`,
        courseCode: `IT ${200 + index}`,
        day: days[index % days.length],
        dayIndex: index % days.length,
        startTime: index < 6 ? "07:00" : "13:00",
        endTime: index < 6 ? "10:00" : "16:00",
      }),
    );
    const faculty = { id: "f1", name: "A B Cruz", employmentType: "full-time", requiredUnits: 3, overloadUnits: 30, probonoUnits: 0 } as Faculty;
    const load = classifyLoad(faculty, schedules);
    expect(load.overload).toHaveLength(8);

    drawSheet(doc, {
      logoImg: null, muniImg: null, collegeName: "IT", semester: "1ST", academicYear: "2026-2027",
      surname: "Cruz", givenName: "A", middleInitial: "B", isPartTime: false, designations: [],
      instructorName: "A B CRUZ", preparedBy: "", verifiedBy: "", vpaaName: "", presidentName: "", presidentTitle: "",
      load, basicLines: load.basic, overloadLines: load.overload, sheetNumber: 1, sheetCount: 1,
    });

    // Every overload subject is printed, the last on the eighth line of table B.
    load.overload.forEach((line) => expect(texts.some((entry) => entry.text === line.code)).toBe(true));
    const lastCode = texts.find((entry) => entry.text === load.overload[7].code)!;
    expect(lastCode.y).toBeGreaterThan(top(38));
    expect(lastCode.y).toBeLessThan(bottom(38));

    // The totals follow the added lines instead of overlapping them.
    expect(formRow(37)).toBe(39);
    const overloadTotal = texts.find((entry) => entry.text.startsWith("TOTAL NUMBER OF UNITS / HRS (OVERLOAD)"))!;
    expect(overloadTotal.y).toBeGreaterThan(top(formRow(37)));

    // One sheet, taller by two lines, with the control footer still on the page.
    expect(format[1]).toBeGreaterThan(FORM_PAGE_SIZE[1]);
    const footerBottom = Math.max(...rects.map((rect) => rect.y + rect.h));
    expect(footerBottom).toBeLessThan(format[1] - 3);
  });

  it("keeps the form's own layout for six lines or fewer", () => {
    expect(formPageSize(6)).toEqual(FORM_PAGE_SIZE);
    setOverloadLineCount(4);
    expect(formRow(37)).toBe(37);
  });
});

describe("drawSheet designations", () => {
  it("prints the first designation on line 1 of section C and the rest on line 2", () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: FORM_PAGE_SIZE });
    const texts: string[] = [];
    vi.spyOn(doc, "text").mockImplementation(((text: string) => { texts.push(String(text)); return doc; }) as typeof doc.text);
    const faculty = { id: "f1", name: "A B Cruz", employmentType: "full-time", requiredUnits: 21 } as Faculty;
    const load = classifyLoad(faculty, [meeting({ id: "1" })]);

    drawSheet(doc, {
      logoImg: null, muniImg: null, collegeName: "IT", semester: "1ST", academicYear: "2026-2027",
      surname: "Cruz", givenName: "A", middleInitial: "B", isPartTime: false,
      designations: ["Director · Networking Dev't", "Program Chairperson", "Coach"],
      instructorName: "A B CRUZ", preparedBy: "", verifiedBy: "", vpaaName: "", presidentName: "", presidentTitle: "",
      load, basicLines: load.basic, overloadLines: load.overload, sheetNumber: 1, sheetCount: 1,
    });

    expect(texts).toContain("Director · Networking Dev't");
    expect(texts).toContain("Program Chairperson; Coach");
  });
});
