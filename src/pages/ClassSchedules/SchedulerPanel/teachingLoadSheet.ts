import type jsPDF from "jspdf";
import {
  BASIC_LINE_COUNT,
  OVERLOAD_LINE_COUNT,
  formatQuantity,
  type ClassifiedLoad,
  type LoadLine,
} from "./teachingLoadRows";
import type { HeldDesignation } from "./types";
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
  formRow,
  left,
  right,
  rule,
  setOverloadLineCount,
  top,
  type Column,
} from "./teachingLoadForm";

const drawLetterhead = (
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  muniImg: HTMLImageElement | null,
): void => {
  const centre = (left("A") + right("K")) / 2;

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

const INNER_DIVIDERS: Column[] = ["A", "C", "D", "E", "F", "G", "H", "I", "J"];

const PROBONO_TEXT = [107, 114, 128] as const;
const CONFLICT_TEXT = [220, 38, 38] as const;
const DELOAD_TEXT = [220, 38, 38] as const;

const lineTextColor = (line: LoadLine): readonly [number, number, number] | undefined =>
  line.band === "probono" ? PROBONO_TEXT : undefined;

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

  drawStackedText(doc, ["No. of", "Students"], { from: "G", ...merged }, heading);
  drawStackedText(doc, ["Units", "(lec)"], { from: "H", ...merged }, heading);
  drawStackedText(doc, ["Units", "(lab)"], { from: "I", ...merged }, heading);
  drawStackedText(doc, ["Total", "Units"], { from: "J", ...merged }, heading);
  drawStackedText(doc, ["Total", "Hours"], { from: "K", ...merged }, heading);
};

const drawTableBody = (doc: jsPDF, firstRow: number, lineCount: number, lines: LoadLine[]): void => {
  for (let offset = 0; offset < lineCount; offset += 1) {
    const row = firstRow + offset;
    const isLast = offset === lineCount - 1;
    const line = lines[offset];

    rule(doc, { from: "A", to: "K", row, edge: "bottom" }, isLast ? MEDIUM : THIN);
    INNER_DIVIDERS.forEach((column) => columnRule(doc, { column, row, edge: "right" }));

    if (!line) continue;

    const cell = { size: SIZE.body, align: "center" as const, color: lineTextColor(line) };
    drawText(doc, line.code, { from: "A", row }, cell);
    drawText(doc, line.title, { from: "B", to: "C", row }, { ...cell, align: "left", padding: 1.4 });
    drawText(doc, line.day, { from: "D", row }, cell);
    drawTextLines(doc, line.times, { from: "E", row }, {
      ...cell,
      padding: 0.25,
      separator: "cellRule",
      fixedSize: true,
      lineColors: line.times.map((time) => (line.conflictTimes?.includes(time) ? CONFLICT_TEXT : cell.color)),
    });
    drawText(doc, line.section, { from: "F", row }, cell);
    drawText(doc, formatQuantity(line.lectureUnits), { from: "H", row }, cell);
    drawText(doc, formatQuantity(line.laboratoryUnits), { from: "I", row }, cell);
    drawText(doc, formatQuantity(line.totalUnits), { from: "J", row }, cell);
    drawText(doc, formatQuantity(line.totalHours), { from: "K", row }, cell);
  }
};

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

const drawDateSigned = (doc: jsPDF, row: number, caption: Column, from: Column, to: Column): void => {
  drawText(doc, "Date Signed:", { from: caption, row }, { size: SIZE.small });
  rule(doc, { from, to, row, edge: "bottom" });
};

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
  designations: HeldDesignation[];
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
  setOverloadLineCount(ctx.overloadLines.length);
  const centre = (left("A") + right("K")) / 2;

  box(doc, { from: "A", to: "K", row: 1, throughRow: formRow(LAST_ROW) }, MEDIUM);

  drawLetterhead(doc, ctx.logoImg, ctx.muniImg);
  rule(doc, { from: "A", to: "K", row: 5, edge: "bottom" }, MEDIUM);

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

  drawText(doc, "A. Basic Load/Built-In", { from: "A", to: "C", row: 17 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawTableHeader(doc, 18);
  drawTableBody(doc, 20, BASIC_LINE_COUNT, ctx.basicLines);
  drawTotalsRow(doc, 27, "TOTAL NUMBER OF UNITS/HRS (BASIC) :", ctx.load.basicTotals, MEDIUM);

  drawText(doc, "B. Overload/Part Time Load", { from: "A", to: "C", row: 28 }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawTableHeader(doc, 29);
  drawTableBody(doc, 31, Math.max(OVERLOAD_LINE_COUNT, ctx.overloadLines.length), ctx.overloadLines);
  drawTotalsRow(doc, formRow(37), "TOTAL NUMBER OF UNITS / HRS (OVERLOAD)", ctx.load.overloadTotals, MEDIUM);
  drawTotalsRow(doc, formRow(38), "GRAND TOTAL NUMBER OF UNITS/HRS", ctx.load.grandTotals, THIN);

  const sectionHeading = { size: SIZE.label, style: "bold" as const, padding: 1.6 };
  drawText(doc, "C. Other Designation/Functions", { from: "A", to: "D", row: formRow(39) }, sectionHeading);
  drawText(doc, "Deload", { from: "J", row: formRow(39) }, { ...sectionHeading, align: "center", fixedSize: true });
  rule(doc, { from: "A", to: "K", row: formRow(40), edge: "top" }, MEDIUM);
  rule(doc, { from: "A", to: "K", row: formRow(40), edge: "bottom" }, THIN);
  rule(doc, { from: "A", to: "K", row: formRow(41), edge: "bottom" }, MEDIUM);
  const designationLines = [ctx.designations.slice(0, 1), ctx.designations.slice(1)];
  designationLines.forEach((held, index) => {
    const row = formRow(40 + index);
    drawText(doc, String(index + 1), { from: "A", row }, { size: SIZE.label, padding: 1.8 });
    if (held.length === 0) return;
    drawText(doc, held.map((designation) => designation.label).join("; "), { from: "B", to: "I", row }, { size: SIZE.label, padding: 1.6 });
    const deload = held.reduce((sum, designation) => sum + designation.deloadUnits, 0);
    drawText(doc, formatQuantity(deload), { from: "J", row }, { size: SIZE.label, style: "bold", align: "center", color: DELOAD_TEXT });
  });

  drawText(doc, "Prepared :", { from: "A", to: "C", row: formRow(44) }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawText(doc, "Verified by:", { from: "G", to: "K", row: formRow(44) }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawSignatory(doc, {
    name: ctx.preparedBy,
    title: "Program Head/Department Secretary",
    row: formRow(45),
    from: "A",
    to: "C",
  });
  drawSignatory(doc, { name: ctx.verifiedBy, title: "College Dean", row: formRow(45), from: "G", to: "K" });
  drawDateSigned(doc, formRow(47), "A", "B", "C");
  drawDateSigned(doc, formRow(47), "G", "H", "J");

  drawText(doc, "Recommending Approval:", { from: "A", to: "D", row: formRow(49) }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawText(doc, "Approved:", { from: "G", to: "H", row: formRow(49) }, { size: SIZE.label, style: "bold", padding: 1.6 });
  drawSignatory(doc, {
    name: ctx.vpaaName,
    title: "Vice President for Academic Affairs",
    row: formRow(50),
    from: "A",
    to: "C",
  });
  drawSignatory(doc, {
    name: ctx.presidentName,
    title: ctx.presidentTitle,
    row: formRow(50),
    from: "G",
    to: "J",
  });
  drawDateSigned(doc, formRow(52), "A", "B", "C");
  drawDateSigned(doc, formRow(52), "G", "H", "J");

  drawText(doc, "Received:", { from: "A", to: "C", row: formRow(53) }, { size: SIZE.small, style: "bold", padding: 1.6 });
  rule(doc, { from: "A", to: "C", row: formRow(54), edge: "bottom" });
  drawText(doc, ctx.instructorName, { from: "A", to: "C", row: formRow(54) }, { size: SIZE.label, style: "bold", align: "center" });
  drawText(doc, "Instructor's Name (Signature over Printed Name)", { from: "A", to: "C", row: formRow(55) }, {
    size: SIZE.caption,
    style: "italic",
    padding: 1.6,
  });

  rule(doc, { from: "A", to: "K", row: formRow(56), edge: "top" }, MEDIUM);
  drawText(doc, "Reminder:", { from: "A", to: "C", row: formRow(56) }, { size: SIZE.body, style: "bold", padding: 1.6 });
  drawText(doc, "Submit corrected teaching load when there is/ are changes.", { from: "A", to: "G", row: formRow(57) }, {
    size: SIZE.small,
    style: "italic",
    padding: 1.6,
  });
  fill(doc, { from: "A", to: "K", row: formRow(58) }, MAROON);
  rule(doc, { from: "A", to: "K", row: formRow(58), edge: "top" }, MEDIUM);
  rule(doc, { from: "A", to: "K", row: formRow(58), edge: "bottom" }, MEDIUM);

  const CONTROL_ROW_HEIGHT = 3.6;
  const controlCells = [
    { text: "Document No.", width: 17 },
    { text: "TCC-VPAA-001", width: 18 },
    { text: "Revision No.", width: 15.5 },
    { text: "001", width: 9 },
  ];
  const controlTop = bottom(formRow(LAST_ROW)) + 1.4;
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

  if (ctx.sheetCount > 1) {
    doc.text(`Sheet ${ctx.sheetNumber} of ${ctx.sheetCount}`, right("K"), controlBaseline, { align: "right" });
  }
};
