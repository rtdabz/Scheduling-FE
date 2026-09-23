import tccLogo from "../../../assets/logo.jpg";
import type { ScheduleItem, Semester } from "./types";
import { fullSemesterLabel } from "../../../lib/semesterLabel";
import { packLanes } from "../../vpaa/calendar/ganttLayout";

export interface InstructorTimetablePdfInput {
  title?: string;
  facultyName?: string;
  departmentCode?: string;
  departmentName?: string;
  departmentLogo?: string | null;
  schedules: ScheduleItem[];
  activeSemester?: Semester | null;
}

const DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

function normalizeDay(dayStr: string): number | undefined {
  if (!dayStr) return undefined;
  const d = dayStr.trim().toLowerCase();
  if (d.startsWith("mon")) return 0;
  if (d.startsWith("tue")) return 1;
  if (d.startsWith("wed")) return 2;
  if (d.startsWith("thu")) return 3;
  if (d.startsWith("fri")) return 4;
  if (d.startsWith("sat")) return 5;
  if (d.startsWith("sun")) return 6;
  return undefined;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const s = timeStr.trim();
  const match12 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const period = match12[3].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const match24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }
  return 0;
}

function formatMins12hShort(mins: number): string {
  const rawHrs = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = rawHrs >= 12 ? "PM" : "AM";
  const hrs = rawHrs % 12 === 0 ? 12 : rawHrs % 12;
  return m === 0 ? `${hrs} ${suffix}` : `${hrs}:${m.toString().padStart(2, "0")} ${suffix}`;
}

// Axis label for a block, e.g. "7-8:30 AM" or "11:30 AM-1 PM" when it crosses noon.
function formatBlockRange(start: number, end: number): string {
  const clock = (mins: number) => {
    const hrs = Math.floor(mins / 60) % 12 || 12;
    const m = mins % 60;
    return m === 0 ? `${hrs}` : `${hrs}:${m.toString().padStart(2, "0")}`;
  };
  const suffix = (mins: number) => (Math.floor(mins / 60) % 24 >= 12 ? "PM" : "AM");
  return suffix(start) === suffix(end)
    ? `${clock(start)}-${clock(end)} ${suffix(end)}`
    : `${clock(start)} ${suffix(start)}-${clock(end)} ${suffix(end)}`;
}

function formatTime12hShort(timeStr: string): string {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === 0) return "";
  return formatMins12hShort(mins);
}

const absoluteAssetUrl = (asset: string): string =>
  asset.startsWith("data:") || asset.startsWith("http:") || asset.startsWith("https:")
    ? asset
    : `${window.location.origin}${asset.startsWith("/") ? "" : "/"}${asset}`;

const loadImgSafe = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    if ((url.startsWith("http:") || url.startsWith("https:")) && !url.startsWith(window.location.origin)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      const retry = new Image();
      retry.onload = () => resolve(retry);
      retry.onerror = () => resolve(null);
      retry.src = url;
    };
    img.src = url;
  });

function createTransparentWatermarkDataUrl(img: HTMLImageElement, targetOpacity = 0.18): string {
  try {
    const canvas = document.createElement("canvas");
    const w = img.naturalWidth || img.width || 300;
    const h = img.naturalHeight || img.height || 300;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (r > 200 && g > 200 && b > 200) {
        data[i + 3] = 0;
      } else {
        data[i + 3] = Math.round(a * targetOpacity);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

type Rgb = [number, number, number];

const MAROON: Rgb = [78, 10, 16];
const MAROON_SOFT: Rgb = [104, 24, 32];
const GOLD: Rgb = [201, 149, 42];
const GOLD_LIGHT: Rgb = [245, 200, 66];
const CREAM: Rgb = [236, 220, 204];
const INK: Rgb = [15, 23, 42];
const BODY: Rgb = [51, 65, 85];
const MUTED: Rgb = [100, 116, 139];
const FAINT: Rgb = [148, 163, 184];
const HAIRLINE: Rgb = [226, 232, 240];
const FRAME: Rgb = [203, 213, 225];
const WHITE: Rgb = [255, 255, 255];

// Class card text sizes (pt). The sheet is handed out on paper, so nothing
// on a card goes below 7.5 pt.
const CARD_CODE_PT = 10.5;
const CARD_PILL_PT = 7.5;
const CARD_BODY_PT = 8.5;
const CARD_FOOTER_PT = 8;
/** Baseline-to-baseline step (mm) for the card's body and footer lines. */
const CARD_LINE_H = 3.4;

type CardKind = "lecture" | "laboratory" | "online" | "field" | "conflict";

/** Accent (strip, border, code) and tint per card kind; also drives the legend. */
const CARD_STYLES: Record<CardKind, { label: string; accent: Rgb; tint: Rgb }> = {
  lecture: { label: "Lecture", accent: [30, 64, 175], tint: [239, 246, 255] },
  laboratory: { label: "Laboratory", accent: [109, 40, 217], tint: [245, 243, 255] },
  online: { label: "Online", accent: [4, 120, 87], tint: [236, 253, 245] },
  field: { label: "Field", accent: [180, 83, 9], tint: [255, 251, 235] },
  conflict: { label: "Conflict (overlapping)", accent: [220, 38, 38], tint: [254, 242, 242] },
};

const cardKindOf = (sch: ScheduleItem, isConflict: boolean): CardKind => {
  if (isConflict) return "conflict";
  if (sch.mode === "online") return "online";
  if (sch.mode === "field") return "field";
  return sch.meetingType === "laboratory" ? "laboratory" : "lecture";
};

const formatHours = (minutes: number): string => {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
};

export async function buildInstructorTimetablePdf({
  title = "",
  facultyName = "",
  departmentCode = "",
  departmentName = "",
  departmentLogo = null,
  schedules,
  activeSemester = null,
}: InstructorTimetablePdfInput): Promise<Blob> {
  const [{ default: JsPDF }, tccLogoImg, deptLogoImg] = await Promise.all([
    import("jspdf"),
    loadImgSafe(absoluteAssetUrl(tccLogo)),
    departmentLogo ? loadImgSafe(departmentLogo) : Promise.resolve(null),
  ]);

  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const fill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style: "bold" | "normal" | "italic", size: number) => {
    doc.setFont("Helvetica", style);
    doc.setFontSize(size);
  };
  /** The part of `text` that fits `width` on one line, so nothing spills out of its box. */
  const fit = (text: string, width: number): string =>
    (doc.splitTextToSize(text, Math.max(1, width)) as string[])[0] ?? "";

  const pageX = 10;
  const pageW = 277;

  // Classes on the week, packed into lanes with the VPAA calendar Gantt's own
  // packing so overlapping classes sit in separate lanes instead of covering each other.
  const items = schedules.flatMap((sch, index) => {
    const dayIdx = normalizeDay(sch.day);
    const start = parseTimeToMinutes(sch.startTime);
    const end = parseTimeToMinutes(sch.endTime);
    return dayIdx === undefined || start <= 0 || end <= start
      ? []
      : [{ schedule: { id: index }, sch, dayIdx, start, end }];
  });
  const days = DAY_NAMES.map((name, dayIdx) => {
    const { blocks, laneCount } = packLanes(items.filter((item) => item.dayIdx === dayIdx));
    const withConflicts = blocks.map((block) => ({
      ...block,
      isConflict: blocks.some((other) => other !== block && other.start < block.end && block.start < other.end),
    }));
    return { name, blocks: withConflicts, laneCount, y: 0, height: 0 };
  });
  const conflictCount = days.reduce((sum, day) => sum + day.blocks.filter((block) => block.isConflict).length, 0);
  const weeklyMinutes = items.reduce((sum, item) => sum + (item.end - item.start), 0);

  // 1. Header band: logo, name block, summary chips, department logo.
  const headerY = 8;
  const headerH = 26;
  fill(MAROON);
  doc.rect(pageX, headerY, pageW, headerH, "F");
  fill(GOLD);
  doc.rect(pageX, headerY + headerH, pageW, 0.9, "F");

  const logoTile = 20;
  const drawLogoTile = (img: HTMLImageElement, x: number, format: string) => {
    const tileY = headerY + (headerH - logoTile) / 2;
    fill(WHITE);
    doc.roundedRect(x, tileY, logoTile, logoTile, 2, 2, "F");
    const max = logoTile - 3;
    const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    const w = ar >= 1 ? max : max * ar;
    const h = ar >= 1 ? max / ar : max;
    doc.addImage(img, format, x + (logoTile - w) / 2, tileY + (logoTile - h) / 2, w, h);
  };

  let textX = pageX + 5;
  if (tccLogoImg) {
    drawLogoTile(tccLogoImg, pageX + 3, "JPEG");
    textX = pageX + 3 + logoTile + 5;
  }

  let rightEdge = pageX + pageW - 3;
  if (deptLogoImg) {
    rightEdge -= logoTile;
    drawLogoTile(deptLogoImg, rightEdge, departmentLogo?.match(/image\/jpe?g|\.jpe?g(?:$|\?)/i) ? "JPEG" : "PNG");
    rightEdge -= 4;
  }

  // Summary chips, laid out right to left.
  const chips: Array<{ label: string; value: string; alert?: boolean }> = [
    { label: "CONFLICTS", value: String(conflictCount), alert: conflictCount > 0 },
    { label: "HOURS / WEEK", value: formatHours(weeklyMinutes) },
    { label: "CLASSES", value: String(items.length) },
  ];
  const chipW = 25;
  const chipH = 16;
  const chipY = headerY + (headerH - chipH) / 2;
  chips.forEach((chip) => {
    const x = rightEdge - chipW;
    fill(chip.alert ? [153, 27, 27] : MAROON_SOFT);
    doc.roundedRect(x, chipY, chipW, chipH, 1.8, 1.8, "F");
    font("bold", 13);
    ink(chip.alert ? WHITE : GOLD_LIGHT);
    doc.text(chip.value, x + chipW / 2, chipY + 8, { align: "center" });
    font("bold", 5.6);
    ink(CREAM);
    doc.text(chip.label, x + chipW / 2, chipY + 12.6, { align: "center" });
    rightEdge = x - 2.5;
  });

  // Name block: "INSTRUCTOR: KAY WAGA" becomes an eyebrow and a heading.
  const rawTitle = (title || (facultyName ? `INSTRUCTOR: ${facultyName}` : "CLASS TIMETABLE")).trim();
  const colon = rawTitle.indexOf(":");
  const eyebrow = colon > 0 ? `${rawTitle.slice(0, colon).trim().toUpperCase()} TIMETABLE` : "WEEKLY TIMETABLE";
  const heading = (colon > 0 ? rawTitle.slice(colon + 1) : rawTitle).trim().toUpperCase();
  const textW = rightEdge - textX - 4;

  font("bold", 7);
  ink(GOLD_LIGHT);
  doc.text(eyebrow, textX, headerY + 7.5, { charSpace: 0.6 });

  let nameSize = 17;
  font("bold", nameSize);
  while (doc.getTextWidth(heading) > textW && nameSize > 10) {
    nameSize -= 0.5;
    doc.setFontSize(nameSize);
  }
  ink(WHITE);
  doc.text(fit(heading, textW), textX, headerY + 15.5);

  const deptLabel = departmentCode && departmentName
    ? `${departmentCode} - ${departmentName}`
    : departmentName || departmentCode || "College of Information Technology";
  const subTitle = [deptLabel, activeSemester ? fullSemesterLabel(activeSemester) : ""].filter(Boolean).join("  |  ");
  font("normal", 8);
  ink(CREAM);
  doc.text(fit(subTitle, textW), textX, headerY + 21.5);

  // 2. Chart geometry
  const chartY = headerY + headerH + 4;
  const labelW = 28;
  const timelineX = pageX + labelW;
  const timelineW = pageW - labelW;
  const axisH = 9;
  const rowsTopY = chartY + axisH;
  const rowsBottomLimit = 194;
  const emptyRowH = 8;

  // 7:00 AM - 8:30 PM in 90-minute blocks, widened (on the same grid) only when a class falls outside it.
  const BLOCK = 90;
  const earliest = Math.min(420, ...items.map((item) => item.start));
  const latest = Math.max(1230, ...items.map((item) => item.end));
  const windowStart = 420 - Math.ceil((420 - earliest) / BLOCK) * BLOCK;
  const windowEnd = windowStart + Math.ceil((latest - windowStart) / BLOCK) * BLOCK;
  const minuteX = (minutes: number) => timelineX + ((minutes - windowStart) / (windowEnd - windowStart)) * timelineW;

  // Days without classes collapse to a thin row; busy days share the rest.
  const emptyDays = days.filter((day) => day.blocks.length === 0).length;
  const busyLanes = days.reduce((sum, day) => sum + (day.blocks.length ? day.laneCount : 0), 0);
  const laneH = busyLanes ? Math.min(22, (rowsBottomLimit - rowsTopY - emptyDays * emptyRowH) / busyLanes) : 0;
  let nextY = rowsTopY;
  days.forEach((day) => {
    day.y = nextY;
    day.height = day.blocks.length ? day.laneCount * laneH : emptyRowH;
    nextY += day.height;
  });
  const rowsBottomY = nextY;

  // Day label column and alternate row shading
  fill([250, 247, 244]);
  doc.rect(pageX, rowsTopY, labelW, rowsBottomY - rowsTopY, "F");
  days.forEach((day, idx) => {
    if (idx % 2 === 1) {
      fill([250, 251, 253]);
      doc.rect(timelineX, day.y, timelineW, day.height, "F");
    }
  });

  // Faint watermark behind the timeline
  if (tccLogoImg) {
    const wmSize = Math.min(90, rowsBottomY - rowsTopY - 6);
    const wmX = timelineX + (timelineW - wmSize) / 2;
    const wmY = rowsTopY + (rowsBottomY - rowsTopY - wmSize) / 2;
    const pdf = doc as unknown as {
      GState?: new (options: { opacity: number }) => unknown;
      setGState?: (state: unknown) => void;
    };
    if (pdf.GState && pdf.setGState) {
      pdf.setGState(new pdf.GState({ opacity: 0.06 }));
      doc.addImage(tccLogoImg, "JPEG", wmX, wmY, wmSize, wmSize);
      pdf.setGState(new pdf.GState({ opacity: 1 }));
    } else {
      const transparentWmUrl = createTransparentWatermarkDataUrl(tccLogoImg, 0.06);
      const transparentWmImg = transparentWmUrl ? await loadImgSafe(transparentWmUrl) : null;
      if (transparentWmImg) doc.addImage(transparentWmImg, "PNG", wmX, wmY, wmSize, wmSize);
    }
  }

  // Time axis
  fill([248, 250, 252]);
  doc.rect(pageX, chartY, pageW, axisH, "F");
  fill(MAROON);
  doc.rect(pageX, chartY, labelW, axisH, "F");
  font("bold", 9);
  ink(GOLD_LIGHT);
  doc.text("DAY", pageX + labelW / 2, chartY + 5.6, { align: "center" });
  font("bold", 8.5);
  ink(INK);
  for (let minutes = windowStart; minutes < windowEnd; minutes += BLOCK) {
    const center = (minuteX(minutes) + minuteX(minutes + BLOCK)) / 2;
    doc.text(formatBlockRange(minutes, minutes + BLOCK), center, chartY + 5.6, { align: "center" });
  }
  fill(GOLD);
  doc.rect(pageX, chartY + axisH - 0.6, pageW, 0.6, "F");

  // Gridlines: solid on block boundaries, dashed every 30 minutes inside a block
  for (let minutes = windowStart; minutes <= windowEnd; minutes += 30) {
    const isBoundary = (minutes - windowStart) % BLOCK === 0;
    stroke(isBoundary ? HAIRLINE : [237, 241, 246]);
    doc.setLineWidth(isBoundary ? 0.25 : 0.15);
    if (!isBoundary) doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(minuteX(minutes), isBoundary ? chartY : rowsTopY, minuteX(minutes), rowsBottomY);
    doc.setLineDashPattern([], 0);
  }

  // Day rows
  days.forEach((day) => {
    stroke(HAIRLINE);
    doc.setLineWidth(0.25);
    doc.line(pageX, day.y + day.height, pageX + pageW, day.y + day.height);

    const centerY = day.y + day.height / 2;
    const count = day.blocks.length;
    if (count === 0) {
      font("bold", 9.5);
      ink(MUTED);
      doc.text(day.name.slice(0, 3), pageX + labelW / 2, centerY + 1.2, { align: "center" });
      font("italic", 8.5);
      ink(FAINT);
      doc.text("No classes", timelineX + 2, centerY + 1.1);
      return;
    }
    font("bold", 11);
    ink(MAROON);
    doc.text(day.name, pageX + labelW / 2, centerY - 0.4, { align: "center" });
    font("normal", 8.5);
    ink(MUTED);
    doc.text(`${count} ${count === 1 ? "class" : "classes"}`, pageX + labelW / 2, centerY + 4, { align: "center" });
  });

  stroke(FRAME);
  doc.setLineWidth(0.3);
  doc.line(timelineX, chartY, timelineX, rowsBottomY);
  doc.roundedRect(pageX, chartY, pageW, rowsBottomY - chartY, 1.2, 1.2, "S");

  // 4. Class cards
  days.forEach((day) => {
    day.blocks.forEach(({ sch, start, end, lane, isConflict }) => {
      const style = CARD_STYLES[cardKindOf(sch, isConflict)];
      const x = minuteX(start) + 0.5;
      const w = Math.max(3, minuteX(end) - minuteX(start) - 1);
      const y = day.y + lane * laneH + 0.8;
      const h = laneH - 1.6;

      fill(style.tint);
      stroke(style.accent);
      doc.setLineWidth(isConflict ? 0.45 : 0.25);
      doc.roundedRect(x, y, w, h, 1.4, 1.4, "FD");
      fill(style.accent);
      doc.rect(x + 0.35, y + 1.2, 1.1, Math.max(0.5, h - 2.4), "F");

      const padL = 3;
      const innerW = w - padL - 1.5;
      const code = sch.subjectCode || sch.courseCode || "SUBJECT";
      const section = sch.sectionName || "";
      const courseTitle = sch.courseName || sch.subjectName || "";
      const roomOrMode = sch.mode === "online" ? "Online" : sch.mode === "field" ? "Field" : (sch.roomName || "Room TBA");
      const timeRange = [formatTime12hShort(sch.startTime), formatTime12hShort(sch.endTime)].filter(Boolean).join(" - ");

      // Sizes are chosen for a printed page read at arm's length, older readers included.
      // Section pill beside the code when the card is wide enough, else its own line.
      font("bold", CARD_PILL_PT);
      const pillW = section ? doc.getTextWidth(section) + 3.4 : 0;
      font("bold", CARD_CODE_PT);
      const pillBeside = Boolean(section) && innerW >= doc.getTextWidth(code) + pillW + 2;

      let lineY = y + 4.6;
      ink(style.accent);
      doc.text(fit(code, pillBeside ? innerW - pillW - 2 : innerW), x + padL, lineY);
      if (pillBeside) {
        const pillX = x + w - 1.5 - pillW;
        fill(style.accent);
        doc.roundedRect(pillX, y + 1.3, pillW, 4.2, 2, 2, "F");
        font("bold", CARD_PILL_PT);
        ink(WHITE);
        doc.text(section, pillX + pillW / 2, y + 4.3, { align: "center" });
      }

      // Room and time get a line each when the card is tall enough, else they share one.
      const footerLines = h >= 18 && roomOrMode && timeRange
        ? [roomOrMode, timeRange]
        : [[roomOrMode, timeRange].filter(Boolean).join("  |  ")];
      const hasFooter = h >= 13;
      const footerY = y + h - 1.8;
      const footerTop = footerY - (footerLines.length - 1) * CARD_LINE_H;
      const textLimit = hasFooter ? footerTop - 4 : y + h - 0.8;
      const bodyLines: Array<{ text: string; bold: boolean; color: Rgb }> = [
        ...(section && !pillBeside ? [{ text: section, bold: true, color: style.accent }] : []),
        ...(courseTitle ? [{ text: courseTitle, bold: false, color: BODY }] : []),
      ];
      for (const line of bodyLines) {
        font(line.bold ? "bold" : "normal", CARD_BODY_PT);
        ink(line.color);
        // Long titles wrap onto the next line while there is room, instead of being cut off.
        for (const wrapped of doc.splitTextToSize(line.text, Math.max(1, innerW)) as string[]) {
          const nextLineY = lineY + CARD_LINE_H + 0.2;
          if (nextLineY > textLimit) break;
          lineY = nextLineY;
          doc.text(wrapped, x + padL, lineY);
        }
      }

      if (hasFooter) {
        stroke(HAIRLINE);
        doc.setLineWidth(0.2);
        doc.line(x + padL, footerTop - 3.4, x + w - 1.5, footerTop - 3.4);
        font("normal", CARD_FOOTER_PT);
        ink(MUTED);
        footerLines.forEach((text, index) => {
          doc.text(fit(text, innerW), x + padL, footerTop + index * CARD_LINE_H);
        });
      }
    });
  });

  // 5. Footer: legend, then print details
  const legendY = 200;
  let legendX = pageX;
  font("bold", 8);
  ink(MUTED);
  doc.text("LEGEND", legendX, legendY + 0.3);
  legendX += doc.getTextWidth("LEGEND") + 4;
  (Object.keys(CARD_STYLES) as CardKind[]).forEach((kind) => {
    const style = CARD_STYLES[kind];
    fill(style.tint);
    stroke(style.accent);
    doc.setLineWidth(0.25);
    doc.roundedRect(legendX, legendY - 2.3, 6, 3.2, 0.6, 0.6, "FD");
    fill(style.accent);
    doc.rect(legendX + 0.3, legendY - 2, 0.9, 2.6, "F");
    font("normal", 8.5);
    ink(BODY);
    doc.text(style.label, legendX + 7.5, legendY + 0.3);
    legendX += 7.5 + doc.getTextWidth(style.label) + 6;
  });
  font("italic", 7.5);
  ink(MUTED);
  doc.text("Overlapping classes are placed in separate lanes so none is hidden.", pageX + pageW, legendY + 0.3, { align: "right" });

  const printTimestamp = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  font("normal", 7.5);
  ink(FAINT);
  doc.text(`Generated on ${printTimestamp}  |  WICARS Academic Scheduling System`, pageX, 205);
  doc.text("Page 1 of 1", pageX + pageW, 205, { align: "right" });

  return doc.output("blob");
}
