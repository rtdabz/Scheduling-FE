/**
 * Draws one Individual Faculty Load Sheet onto a jsPDF page.
 *
 * Kept apart from the React component on purpose: nothing here touches the DOM
 * or the store, so the whole form can be rendered and inspected outside a
 * browser. `teachingLoadForm` owns the grid this draws on; every position below
 * is a spreadsheet cell address on that grid rather than a page coordinate.
 */
import type jsPDF from "jspdf";
import {
  BASIC_LINE_COUNT,
  OVERLOAD_LINE_COUNT,
  formatQuantity,
  type ClassifiedLoad,
  type LoadLine,
} from "./teachingLoadRows";
import {
  BLACK,
  baselineAt,
  LAST_ROW,
  MAROON,
  MEDIUM,
  NAVY,
  SIZE,
  THIN,
  box,
  bottom,
  checkbox,
  columnRule,
  drawBlank,
  drawStackedText,
  drawTextLines,
  drawText,
  fill,
  left,
  right,
  rule,
  top,
  type Column,
} from "./teachingLoadForm";

/* ── Letterhead (form rows 1-5) ───────────────────────────────────────────── */

const drawLetterhead = (
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  muniImg: HTMLImageElement | null,
): void => {
  const centre = (left("A") + right("K")) / 2;

  // Both seals are cell-anchored in the workbook -- the college mark over
  // columns A-C, the municipal one over G-I -- so they are placed against those
  // edges rather than against the page margin.
  const placeSeal = (img: HTMLImageElement | null, format: "JPEG" | "PNG", x: number, size: number) => {
    if (!img) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    const width = ratio > 1 ? size * ratio : size;
    const height = ratio > 1 ? size : size / ratio;
    doc.addImage(img, format, x, top(1) + 0.6, width, height);
  };
  placeSeal(logoImg, "JPEG", left("A") + 8, 16.5);
  placeSeal(muniImg, "PNG", right("I") - 22, 17);

  let y = top(1) + 4;
  const line = (
    text: string,
    step: number,
    font: "times" | "helvetica",
    style: "normal" | "bold" | "italic",
    size: number,
    color: readonly [number, number, number],
    underline: "none" | "full" | "afterMember" = "none",
  ) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(text, centre, y, { align: "center" });

    if (underline !== "none") {
      const width = doc.getTextWidth(text);
      const skip = underline === "afterMember" ? doc.getTextWidth("Member: ") : 0;
      doc.setDrawColor(...color);
      doc.setLineWidth(0.12);
      doc.line(centre - width / 2 + skip, y + 0.6, centre + width / 2, y + 0.6);
    }
    y += step;
  };

  line("Republic of the Philippines", 3.2, "times", "normal", 7.5, [85, 85, 85]);
  line("Province of Misamis Oriental", 3.6, "times", "normal", 7.5, [85, 85, 85]);
  line("Municipality of Tagoloan", 5.4, "times", "bold", 8, BLACK);
  line("TAGOLOAN COMMUNITY COLLEGE", 4.2, "times", "bold", 12, MAROON);
  line("Baluarte, Tagoloan, Misamis Oriental", 4, "times", "bold", 7.5, [51, 51, 51]);
  line("tccadmin@tcc.edu.ph", 3.6, "times", "italic", 8.5, [26, 86, 219], "full");
  line("Member: Association of Local Colleges & Universities (ALCU)", 3, "helvetica", "normal", 7, [85, 85, 85]);
  line(
    "Member: Association of Local Colleges & Universities Commission on Accreditation (ALCU-COA)",
    0,
    "helvetica",
    "normal",
    7,
    [85, 85, 85],
    "afterMember",
  );
};

/* ── Load tables (form rows 18-26 and 29-36) ──────────────────────────────── */

/**
 * Columns B and C are merged on every line of both tables, so no rule is drawn
 * between them; every other column boundary carries a thin one.
 */
const INNER_DIVIDERS: Column[] = ["A", "C", "D", "E", "F", "G", "H", "I", "J"];

const drawTableHeader = (doc: jsPDF, firstRow: number): void => {
  const lastRow = firstRow + 1;
  rule(doc, { from: "A", to: "K", row: firstRow, edge: "top" }, MEDIUM);
  rule(doc, { from: "A", to: "K", row: lastRow, edge: "bottom" }, MEDIUM);
  INNER_DIVIDERS.forEach((column) =>
    columnRule(doc, { column, row: firstRow, throughRow: lastRow, edge: "right" }),
  );

  const heading = { size: SIZE.label, style: "bold" as const, align: "center" as const };
  const merged = { row: firstRow, throughRow: lastRow };
  drawText(doc, "Subj Code", { from: "A", ...merged }, heading);
  drawText(doc, "Descriptive Title", { from: "B", to: "C", ...merged }, heading);
  drawText(doc, "Day", { from: "D", ...merged }, heading);
  drawText(doc, "Time", { from: "E", ...merged }, heading);
  drawText(doc, "Section", { from: "F", ...merged }, heading);

  // These five are two-line labels rather than merged cells, which is why the
  // header block carries no horizontal rule between its two rows.
  drawStackedText(doc, ["No. of", "Students"], { from: "G", ...merged }, heading);
  drawStackedText(doc, ["Units", "(lec)"], { from: "H", ...merged }, heading);
  drawStackedText(doc, ["Units", "(lab)"], { from: "I", ...merged }, heading);
  drawStackedText(doc, ["Total", "Units"], { from: "J", ...merged }, heading);
  drawStackedText(doc, ["Total", "Hours"], { from: "K", ...merged }, heading);
};

/**
 * Draws every line of a table, ruled whether or not it carries a subject: the
 * blank lines are part of the form, kept for hand-written additions. Column G
 * ("No. of Students") is ruled and left empty by design -- enrolment is not
 * recorded in the system, so it is filled in by hand.
 *
 * Column E ("Time") is the one cell that can carry more than one line: a class
 * on a split day keeps its own range for each day, and the Day column stays a
 * single run of codes ("MTh") beside them.
 */
const drawTableBody = (doc: jsPDF, firstRow: number, lineCount: number, lines: LoadLine[]): void => {
  for (let offset = 0; offset < lineCount; offset += 1) {
    const row = firstRow + offset;
    const isLast = offset === lineCount - 1;
    rule(doc, { from: "A", to: "K", row, edge: "bottom" }, isLast ? MEDIUM : THIN);
    INNER_DIVIDERS.forEach((column) => columnRule(doc, { column, row, edge: "right" }));

    const line = lines[offset];
    if (!line) continue;

    const cell = { size: SIZE.body, align: "center" as const };
    drawText(doc, line.code, { from: "A", row }, cell);
    drawText(doc, line.title, { from: "B", to: "C", row }, { ...cell, align: "left", padding: 1.4 });
    drawText(doc, line.day, { from: "D", row }, cell);
    drawTextLines(doc, line.times, { from: "E", row }, cell);
    drawText(doc, line.section, { from: "F", row }, cell);
    drawText(doc, formatQuantity(line.lectureUnits), { from: "H", row }, cell);
    drawText(doc, formatQuantity(line.laboratoryUnits), { from: "I", row }, cell);
    drawText(doc, formatQuantity(line.totalUnits), { from: "J", row }, cell);
    drawText(doc, formatQuantity(line.totalHours), { from: "K", row }, cell);
  }
};

/**
 * One of the three totals lines (basic, overload, grand total).
 *
 * The blank form rules a cell in both column J ("Total Units") and column K
 * ("Total Hours") on each of these rows and only ever fills K, which is why the
 * printed copy has always read as units-only against a label that says
 * "UNITS/HRS". Both cells are filled here, so the label matches the figures.
 *
 * No rule is drawn between the two. One label -- "UNITS/HRS" -- names both
 * figures, so they read as the single entry it describes rather than as two
 * cells that each want a heading of their own.
 */
const drawTotalsRow = (
  doc: jsPDF,
  row: number,
  label: string,
  totals: { units: number; hours: number },
  topWeight: number,
): void => {
  rule(doc, { from: "J", to: "K", row, edge: "top" }, topWeight);
  rule(doc, { from: "J", to: "K", row, edge: "bottom" }, THIN);

  drawText(doc, label, { from: "D", to: "I", row }, { size: SIZE.body, style: "bold", align: "right", padding: 1.6 });
  const value = { size: SIZE.label, style: "bold" as const, align: "center" as const };
  drawText(doc, formatQuantity(totals.units), { from: "J", row }, value);
  drawText(doc, formatQuantity(totals.hours), { from: "K", row }, value);
};

/** A caption on one row with the value written on the ruled cell beside it. */
const drawDateSigned = (doc: jsPDF, row: number, caption: Column, from: Column, to: Column): void => {
  drawText(doc, "Date Signed:", { from: caption, row }, { size: SIZE.small });
  rule(doc, { from, to, row, edge: "bottom" });
};

/** A signatory: name on a ruled line, post underneath. */
const drawSignatory = (
  doc: jsPDF,
  options: { name: string; title: string; row: number; from: Column; to: Column },
): void => {
  const { name, title, row, from, to } = options;
  rule(doc, { from, to, row, edge: "bottom" });
  drawText(doc, name, { from, to, row }, { size: SIZE.label, style: "bold", align: "center" });
  drawText(doc, title, { from, to, row: row + 1 }, { size: SIZE.label, align: "center" });
};

export interface SheetContext {
  logoImg: HTMLImageElement | null;
  muniImg: HTMLImageElement | null;
  collegeName: string;
  semester: string;
  academicYear: string;
  surname: string;
  givenName: string;
  middleInitial: string;
  isPartTime: boolean;
  designation: string;
  instructorName: string;
  preparedBy: string;
  verifiedBy: string;
  vpaaName: string;
  presidentName: string;
  presidentTitle: string;
  load: ClassifiedLoad;
  basicLines: LoadLine[];
  overloadLines: LoadLine[];
  sheetNumber: number;
  sheetCount: number;
}

export const drawSheet = (doc: jsPDF, ctx: SheetContext): void => {
  const centre = (left("A") + right("K")) / 2;

  // The whole sheet is one medium-ruled box; every rule below sits inside it.
  box(doc, { from: "A", to: "K", row: 1, throughRow: LAST_ROW }, MEDIUM);

  drawLetterhead(doc, ctx.logoImg, ctx.muniImg);
  rule(doc, { from: "A", to: "K", row: 5, edge: "bottom" }, MEDIUM);

  // Row 6 -- the college banner: white on the form's maroon.
  fill(doc, { from: "A", to: "K", row: 6 }, MAROON);
  rule(doc, { from: "A", to: "K", row: 6, edge: "bottom" }, MEDIUM);
  drawText(doc, `COLLEGE OF ${ctx.collegeName}`, { from: "A", to: "K", row: 6 }, {
    size: SIZE.banner,
    style: "bold",
    font: "times",
    align: "center",
    color: [255, 255, 255],
  });

  drawText(doc, "INDIVIDUAL FACULTY LOAD SHEET", { from: "A", to: "K", row: 7 }, {
    size: SIZE.title - 0.5,
    style: "bold",
    align: "center",
    color: NAVY,
  });

  // Row 8 -- "____ Semester Academic Year ____", built to the same proportions
  // as the blanks on the printed form.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.label);
  const semesterCaption = "Semester Academic Year";
  const captionWidth = doc.getTextWidth(semesterCaption);
  const semesterRule = 22;
  const yearRule = 30;
  let cursor = centre - (semesterRule + 2.5 + captionWidth + 2.5 + yearRule) / 2;
  const stamp = (x: number, width: number, value: string) => {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(THIN);
    doc.line(x, bottom(8) - 1, x + width, bottom(8) - 1);
    if (!value) return;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(SIZE.label);
    doc.setTextColor(...BLACK);
    doc.text(value, x + width / 2, bottom(8) - 1.9, { align: "center" });
  };
  stamp(cursor, semesterRule, ctx.semester);
  cursor += semesterRule + 2.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.label);
  doc.setTextColor(...BLACK);
  doc.text(semesterCaption, cursor, bottom(8) - 1.9);
  cursor += captionWidth + 2.5;
  stamp(cursor, yearRule, ctx.academicYear);

  // Row 11 -- name blanks, sized in the same 29 : 34 : 8 proportion the form
  // gives its three underscore runs.
  const nameFields = [
    { label: "Surname:", value: ctx.surname, weight: 29 },
    { label: "Given Name:", value: ctx.givenName, weight: 34 },
    { label: "MI:", value: ctx.middleInitial, weight: 8 },
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.label);
  const labelWidths = nameFields.map((field) => doc.getTextWidth(field.label) + 1.4);
  const ruleSpace =
    right("K") - 1.6 - (left("A") + 1.6) - labelWidths.reduce((sum, width) => sum + width, 0);
  const weightTotal = nameFields.reduce((sum, field) => sum + field.weight, 0);
  let nameX = left("A") + 1.6;
  nameFields.forEach((field, index) => {
    nameX = drawBlank(doc, {
      label: field.label,
      value: field.value,
      row: 11,
      x: nameX,
      labelWidth: labelWidths[index],
      ruleWidth: (ruleSpace * field.weight) / weightTotal,
    });
  });

  // Rows 12-15 -- employment status. The form offers four boxes; the system
  // records only full-time and part-time, so the other two print empty for
  // whoever fills the sheet in by hand.
  drawText(doc, "Employment Status: (Put X)", { from: "A", to: "C", row: 12 }, { size: SIZE.body, style: "bold" });
  const status = { size: SIZE.body, style: "bold" as const, padding: 1.6 };
  checkbox(doc, { column: "B", row: 13 }, !ctx.isPartTime);
  drawText(doc, "Regular", { from: "C", row: 13 }, status);
  checkbox(doc, { column: "H", row: 13 }, false);
  drawText(doc, "Contractual", { from: "I", to: "K", row: 13 }, status);
  checkbox(doc, { column: "B", row: 15 }, false);
  drawText(doc, "Probationary", { from: "C", row: 15 }, status);
  checkbox(doc, { column: "H", row: 15 }, ctx.isPartTime);
  drawText(doc, "Part-Time", { from: "I", to: "K", row: 15 }, status);

  drawText(doc, "TEACHING LOAD", { from: "A", to: "K", row: 16 }, {
    size: SIZE.title,
    style: "bold",
    align: "center",
    color: NAVY,
  });

  // Rows 17-27 -- A. Basic Load.
  drawText(doc, "A. Basic Load/Built-In", { from: "A", to: "C", row: 17 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawTableHeader(doc, 18);
  drawTableBody(doc, 20, BASIC_LINE_COUNT, ctx.basicLines);
  drawTotalsRow(doc, 27, "TOTAL NUMBER OF UNITS/HRS (BASIC) :", ctx.load.basicTotals, MEDIUM);

  // Rows 28-38 -- B. Overload / Part Time Load.
  drawText(doc, "B. Overload/Part Time Load", { from: "A", to: "C", row: 28 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawTableHeader(doc, 29);
  drawTableBody(doc, 31, OVERLOAD_LINE_COUNT, ctx.overloadLines);
  drawTotalsRow(doc, 37, "TOTAL NUMBER OF UNITS / HRS (OVERLOAD)", ctx.load.overloadTotals, MEDIUM);
  drawTotalsRow(doc, 38, "GRAND TOTAL NUMBER OF UNITS/HRS", ctx.load.grandTotals, THIN);

  // Rows 39-41 -- C. Other Designation/Functions. Line 1 carries the post the
  // instructor's account holds; line 2 stays ruled and empty for anything not
  // recorded in the system.
  drawText(doc, "C. Other Designation/Functions", { from: "A", to: "D", row: 39 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  rule(doc, { from: "A", to: "K", row: 40, edge: "top" }, MEDIUM);
  rule(doc, { from: "A", to: "K", row: 40, edge: "bottom" }, THIN);
  rule(doc, { from: "A", to: "K", row: 41, edge: "bottom" }, MEDIUM);
  drawText(doc, "1", { from: "A", row: 40 }, { size: SIZE.label, padding: 1.8 });
  drawText(doc, "2", { from: "A", row: 41 }, { size: SIZE.label, padding: 1.8 });
  drawText(doc, ctx.designation, { from: "B", to: "K", row: 40 }, { size: SIZE.label, padding: 1.6 });

  // Rows 44-52 -- the signature block. The form runs it as two open columns
  // with no divider between them, only the rules each signatory signs on.
  drawText(doc, "Prepared :", { from: "A", to: "C", row: 44 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawText(doc, "Verified by:", { from: "G", to: "K", row: 44 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawSignatory(doc, {
    name: ctx.preparedBy,
    title: "Program Head/Department Secretary",
    row: 45,
    from: "A",
    to: "C",
  });
  drawSignatory(doc, { name: ctx.verifiedBy, title: "College Dean", row: 45, from: "G", to: "K" });
  drawDateSigned(doc, 47, "A", "B", "C");
  drawDateSigned(doc, 47, "G", "H", "J");

  drawText(doc, "Recommending Approval:", { from: "A", to: "D", row: 49 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawText(doc, "Approved:", { from: "G", to: "H", row: 49 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawSignatory(doc, {
    name: ctx.vpaaName,
    title: "Vice President for Academic Affairs",
    row: 50,
    from: "A",
    to: "C",
  });
  drawSignatory(doc, {
    name: ctx.presidentName,
    title: ctx.presidentTitle,
    row: 50,
    from: "G",
    to: "J",
  });
  drawDateSigned(doc, 52, "A", "B", "C");
  drawDateSigned(doc, 52, "G", "H", "J");

  // Rows 53-55 -- the instructor's own acknowledgement. The form asks for a
  // signature over the printed name, so the name is printed and the rule above
  // it is what gets signed.
  drawText(doc, "Received:", { from: "A", to: "C", row: 53 }, { size: SIZE.small, style: "bold", padding: 1.6 });
  rule(doc, { from: "A", to: "C", row: 54, edge: "bottom" });
  drawText(doc, ctx.instructorName, { from: "A", to: "C", row: 54 }, { size: SIZE.label, style: "bold", align: "center" });
  drawText(doc, "Instructor's Name (Signature over Printed Name)", { from: "A", to: "C", row: 55 }, {
    size: SIZE.caption,
    style: "italic",
    padding: 1.6,
  });

  // Rows 56-58 -- the reminder and the closing bar.
  rule(doc, { from: "A", to: "K", row: 56, edge: "top" }, MEDIUM);
  drawText(doc, "Reminder:", { from: "A", to: "C", row: 56 }, { size: SIZE.body, style: "bold", padding: 1.6 });
  drawText(doc, "Submit corrected teaching load when there is/ are changes.", { from: "A", to: "G", row: 57 }, {
    size: SIZE.small,
    style: "italic",
    padding: 1.6,
  });
  fill(doc, { from: "A", to: "K", row: 58 }, MAROON);
  rule(doc, { from: "A", to: "K", row: 58, edge: "top" }, MEDIUM);
  rule(doc, { from: "A", to: "K", row: 58, edge: "bottom" }, MEDIUM);

  // Control footer, outside the form box: the document and revision numbers in
  // their own ruled box rather than loose text under the closing bar.
  //
  // It runs as one row of label-and-value cells instead of stacking each value
  // under its label. Only 8.4mm of page is left below the form, and a two-row
  // box deep enough to read would put its bottom rule on the sheet's edge,
  // inside the margin most printers refuse to reach.
  const CONTROL_ROW_HEIGHT = 3.6;
  const controlCells = [
    { text: "Document No.", width: 17 },
    { text: "TCC-VPAA-001", width: 18 },
    { text: "Revision No.", width: 15.5 },
    { text: "001", width: 9 },
  ];
  const controlTop = bottom(LAST_ROW) + 1.4;
  const controlWidth = controlCells.reduce((sum, cell) => sum + cell.width, 0);
  const controlBaseline = baselineAt(controlTop + CONTROL_ROW_HEIGHT / 2, SIZE.control);

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(THIN);
  doc.rect(left("A"), controlTop, controlWidth, CONTROL_ROW_HEIGHT);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(SIZE.control);
  doc.setTextColor(85, 85, 85);
  let controlX = left("A");
  controlCells.forEach((cell, index) => {
    if (index > 0) doc.line(controlX, controlTop, controlX, controlTop + CONTROL_ROW_HEIGHT);
    doc.text(cell.text, controlX + cell.width / 2, controlBaseline, { align: "center" });
    controlX += cell.width;
  });

  // Kept outside the box, on its baseline, so a two-sheet load still reads as
  // one footer line.
  if (ctx.sheetCount > 1) {
    doc.text(`Sheet ${ctx.sheetNumber} of ${ctx.sheetCount}`, right("K"), controlBaseline, { align: "right" });
  }
};
