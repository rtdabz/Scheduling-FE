import tccLogo from "../../../assets/logo.jpg";
import { fullSemesterLabel, type LabelledSemester } from "../../../lib/semesterLabel";
import { gridOpeningMinutes, slotCount, slotMinutes } from "../../../lib/timeGrid";
import { packLanes } from "../../vpaa/calendar/ganttLayout";
import { registerSystemPdfFonts } from "./fonts/systemPdfFonts";
import type { ScheduleItem } from "./types";

export interface InstructorTimetableScheduleItem {
  id?: string | number;
  day?: string;
  startTime?: string;
  endTime?: string;
  subjectCode?: string | null;
  courseCode?: string | null;
  subjectName?: string | null;
  courseName?: string | null;
  subjectTitle?: string | null;
  courseTitle?: string | null;
  sectionName?: string | null;
  sectionId?: string | number | null;
  mode?: string | null;
  meetingType?: string | null;
  roomName?: string | null;
  status?: string | null;
  facultyName?: string | null;
}

export interface InstructorTimetableMeeting {
  day: string;
  startTime: string;
  endTime: string;
  mode?: string | null;
  meetingType?: string | null;
  roomName?: string | null;
  sectionName?: string | null;
  subjectCode?: string;
  subjectName?: string;
  courseCode?: string;
  courseName?: string;
}

export interface InstructorTimetablePdfInput {
  title?: string;
  facultyName?: string;
  departmentCode?: string;
  departmentName?: string;
  departmentLogo?: string | null;
  schedules: Array<InstructorTimetableMeeting | InstructorTimetableScheduleItem | ScheduleItem | any>;
  activeSemester?: LabelledSemester | null;
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

function createCircularImage(img: HTMLImageElement): string {
  try {
    const canvas = document.createElement("canvas");
    const size = Math.max(img.naturalWidth || 120, img.naturalHeight || 120);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const ar = w / h;
    const drawW = ar >= 1 ? size : size * ar;
    const drawH = ar >= 1 ? size / ar : size;
    ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
    ctx.restore();

    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

type Rgb = [number, number, number];

const MAROON: Rgb = [78, 10, 16];
const MAROON_SOFT: Rgb = [102, 26, 34];
const MAROON_LINE: Rgb = [128, 52, 60];
const ALERT: Rgb = [153, 27, 27];
const GOLD: Rgb = [201, 149, 42];
const GOLD_LIGHT: Rgb = [245, 200, 66];
const CREAM: Rgb = [236, 220, 204];
const INK: Rgb = [15, 23, 42];
const BODY: Rgb = [51, 65, 85];
const MUTED: Rgb = [100, 116, 139];
const FAINT: Rgb = [148, 163, 184];
const HAIRLINE: Rgb = [226, 232, 240];
const GRID_MAJOR: Rgb = [203, 213, 225];
const GRID_MINOR: Rgb = [226, 232, 240];
const FRAME: Rgb = [176, 188, 202];
const LABEL_SURFACE: Rgb = [250, 247, 243];
const EMPTY_SURFACE: Rgb = [250, 250, 252];
const AXIS_SURFACE: Rgb = [248, 249, 251];
const WHITE: Rgb = [255, 255, 255];

/** Blend a colour toward white; `amount` is how much of the original colour remains. */
const tintOf = (c: Rgb, amount: number): Rgb =>
  c.map((v) => Math.round(v * amount + 255 * (1 - amount))) as Rgb;

type CardKind = "lecture" | "laboratory" | "online" | "field" | "conflict";

const CARD_STYLES: Record<CardKind, { label: string; accent: Rgb; tint: Rgb }> = {
  lecture: { label: "Lecture", accent: [30, 64, 175], tint: [241, 246, 255] },
  laboratory: { label: "Laboratory", accent: [109, 40, 217], tint: [246, 243, 255] },
  online: { label: "Online", accent: [4, 120, 87], tint: [238, 252, 245] },
  field: { label: "Field", accent: [180, 83, 9], tint: [255, 250, 235] },
  conflict: { label: "Conflict (overlapping)", accent: [220, 38, 38], tint: [254, 242, 242] },
};

const cardKindOf = (sch: InstructorTimetableMeeting | InstructorTimetableScheduleItem | ScheduleItem | any, isConflict: boolean): CardKind => {
  if (isConflict) return "conflict";
  if (sch.mode === "online") return "online";
  if (sch.mode === "field") return "field";
  return sch.meetingType === "laboratory" ? "laboratory" : "lecture";
};

const formatHours = (minutes: number): string => {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
};

// A4 landscape page composition (mm). Everything is laid out inside a 10 mm print-safe margin.
const PAGE_X = 10;
const PAGE_W = 277;
const HEADER_Y = 10;
const HEADER_H = 24;
const GRID_Y = HEADER_Y + HEADER_H + 0.8 + 4;
const AXIS_H = 7.5;
const ROWS_BOTTOM_LIMIT = 188.5;
const LEGEND_Y = 193;
const FOOTER_RULE_Y = 196.4;
const FOOTER_Y = 200.2;
const LABEL_W = 26;
const COLUMN_MINUTES = 90;

// Row sizing: a busy lane is weighted against an empty day so the grid fills the page.
const LANE_WEIGHT = 2.4;
const MAX_LANE_H = 28;
const MIN_EMPTY_H = 7;
const MAX_EMPTY_H = 20;

const WATERMARK_OPACITY = 0.06;
const WATERMARK_MAX = 62;

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
  const { hasSans, hasDisplay } = registerSystemPdfFonts(doc);

  const fill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (
    style: "bold" | "normal" | "italic",
    size: number,
    family: "sans" | "display" = "sans"
  ) => {
    const targetFamily = family === "display" && hasDisplay
      ? "PlayfairDisplay"
      : hasSans
      ? "DMSans"
      : "Helvetica";
    try {
      doc.setFont(targetFamily, style);
    } catch {
      doc.setFont("Helvetica", style);
    }
    doc.setFontSize(size);
  };
  const fit = (text: string, width: number): string => {
    if (!text) return "";
    if (doc.getTextWidth(text) <= width) return text;
    const lines = doc.splitTextToSize(text, Math.max(1, width - doc.getTextWidth("..."))) as string[];
    return `${(lines[0] ?? "").trimEnd()}...`;
  };
  const wrap = (text: string, width: number, maxLines: number): string[] => {
    if (!text || maxLines <= 0) return [];
    const lines = doc.splitTextToSize(text, Math.max(1, width)) as string[];
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(lines.slice(maxLines - 1).join(" "), width);
    return kept;
  };

  // --- Schedule data (unchanged calculations) -------------------------------------------
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

  const deptLabel = departmentCode && departmentName
    ? `${departmentCode} - ${departmentName}`
    : departmentName || departmentCode || "College of Information Technology";
  const semesterText = activeSemester ? fullSemesterLabel(activeSemester) : "";
  const rawTitle = (title || (facultyName ? `INSTRUCTOR: ${facultyName}` : "CLASS TIMETABLE")).trim();
  const colon = rawTitle.indexOf(":");
  const eyebrow = colon > 0 ? `${rawTitle.slice(0, colon).trim().toUpperCase()} TIMETABLE` : "WEEKLY TIMETABLE";
  const heading = (colon > 0 ? rawTitle.slice(colon + 1) : rawTitle).trim().toUpperCase();

  const printDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  doc.setProperties({
    title: facultyName ? `Instructor Timetable - ${facultyName}` : "Instructor Timetable",
    subject: [deptLabel, semesterText].filter(Boolean).join(", "),
    creator: "WICARS Academic Scheduling System",
  });

  // --- Header ---------------------------------------------------------------------------
  fill(MAROON);
  doc.roundedRect(PAGE_X, HEADER_Y, PAGE_W, HEADER_H, 1.6, 1.6, "F");
  doc.rect(PAGE_X, HEADER_Y + HEADER_H / 2, PAGE_W, HEADER_H / 2, "F");
  fill(GOLD);
  doc.rect(PAGE_X, HEADER_Y + HEADER_H, PAGE_W, 0.8, "F");

  const logoD = 16;
  const logoCx = PAGE_X + 5 + logoD / 2;
  const logoCy = HEADER_Y + HEADER_H / 2;
  const effectiveDeptLogoImg = deptLogoImg || tccLogoImg;
  let textX = PAGE_X + 6;
  if (effectiveDeptLogoImg) {
    fill(WHITE);
    doc.circle(logoCx, logoCy, logoD / 2, "F");
    stroke(GOLD_LIGHT);
    doc.setLineWidth(0.4);
    doc.circle(logoCx, logoCy, logoD / 2, "D");

    const circularDataUrl = createCircularImage(effectiveDeptLogoImg);
    const circularImg = circularDataUrl ? await loadImgSafe(circularDataUrl) : null;
    const targetImg = circularImg || effectiveDeptLogoImg;
    const format = circularImg
      ? "PNG"
      : departmentLogo && departmentLogo.match(/image\/jpe?g|\.jpe?g(?:$|\?)/i) ? "JPEG" : "PNG";
    const max = logoD - 1.4;
    const ar = (targetImg.naturalWidth || 1) / (targetImg.naturalHeight || 1);
    const w = ar >= 1 ? max : max * ar;
    const h = ar >= 1 ? max / ar : max;
    doc.addImage(targetImg, format, logoCx - w / 2, logoCy - h / 2, w, h);
    textX = PAGE_X + 5 + logoD + 5;
  }

  // Metrics: one segmented panel instead of three loose tiles.
  const metrics: Array<{ label: string; value: string; alert?: boolean }> = [
    { label: "CLASSES", value: String(items.length) },
    { label: "HOURS / WEEK", value: formatHours(weeklyMinutes) },
    { label: "CONFLICTS", value: String(conflictCount), alert: conflictCount > 0 },
  ];
  const cellW = 23;
  const panelH = 15;
  const panelW = cellW * metrics.length;
  const panelX = PAGE_X + PAGE_W - 5 - panelW;
  const panelY = HEADER_Y + (HEADER_H - panelH) / 2;
  fill(MAROON_SOFT);
  doc.roundedRect(panelX, panelY, panelW, panelH, 1.6, 1.6, "F");
  metrics.forEach((metric, i) => {
    const x = panelX + i * cellW;
    if (metric.alert) {
      fill(ALERT);
      doc.roundedRect(x + 0.8, panelY + 0.8, cellW - 1.6, panelH - 1.6, 1.2, 1.2, "F");
    }
    if (i > 0 && !metric.alert && !metrics[i - 1].alert) {
      stroke(MAROON_LINE);
      doc.setLineWidth(0.2);
      doc.line(x, panelY + 3, x, panelY + panelH - 3);
    }
    font("bold", 13);
    ink(metric.alert ? WHITE : GOLD_LIGHT);
    doc.text(metric.value, x + cellW / 2, panelY + 7.6, { align: "center" });
    font("bold", 5.6);
    ink(CREAM);
    doc.text(metric.label, x + cellW / 2, panelY + 11.8, { align: "center", charSpace: 0.25 });
  });

  const textW = panelX - textX - 6;
  font("bold", 6.5);
  ink(GOLD_LIGHT);
  doc.text(eyebrow, textX, HEADER_Y + 7, { charSpace: 0.7 });

  let nameSize = 16;
  font("bold", nameSize, "display");
  while (doc.getTextWidth(heading) > textW && nameSize > 10) {
    nameSize -= 0.5;
    doc.setFontSize(nameSize);
  }
  ink(WHITE);
  doc.text(fit(heading, textW), textX, HEADER_Y + 14.6);

  font("normal", 7.5);
  ink(CREAM);
  doc.text(fit([deptLabel, semesterText].filter(Boolean).join("   |   "), textW), textX, HEADER_Y + 20);

  // --- Grid geometry --------------------------------------------------------------------
  const timelineX = PAGE_X + LABEL_W;
  const timelineW = PAGE_W - LABEL_W;
  const rowsTopY = GRID_Y + AXIS_H;

  // Visible window: the institution's configured grid in 90-minute columns anchored on the
  // opening time, widened by whole columns to any meeting outside it so nothing is clipped.
  const minorStep = slotMinutes();
  const opening = gridOpeningMinutes();
  const closing = opening + slotCount() * minorStep;
  const earliest = Math.min(opening, ...items.map((item) => item.start));
  const latest = Math.max(closing, ...items.map((item) => item.end));
  const windowStart = opening - Math.ceil((opening - earliest) / COLUMN_MINUTES) * COLUMN_MINUTES;
  const windowEnd = windowStart + Math.max(1, Math.ceil((latest - windowStart) / COLUMN_MINUTES)) * COLUMN_MINUTES;
  const minuteX = (minutes: number) => timelineX + ((minutes - windowStart) / (windowEnd - windowStart)) * timelineW;

  const available = ROWS_BOTTOM_LIMIT - rowsTopY;
  const emptyDays = days.filter((day) => day.blocks.length === 0).length;
  const busyLanes = days.reduce((sum, day) => sum + (day.blocks.length ? day.laneCount : 0), 0);
  const unit = available / (busyLanes * LANE_WEIGHT + emptyDays);
  let emptyH = Math.min(MAX_EMPTY_H, Math.max(MIN_EMPTY_H, unit));
  const laneH = busyLanes ? Math.min(MAX_LANE_H, (available - emptyDays * emptyH) / busyLanes) : 0;
  if (busyLanes && emptyDays) {
    emptyH = Math.min(MAX_EMPTY_H, Math.max(MIN_EMPTY_H, (available - busyLanes * laneH) / emptyDays));
  }
  let nextY = rowsTopY;
  days.forEach((day) => {
    day.y = nextY;
    day.height = day.blocks.length ? day.laneCount * laneH : emptyH;
    nextY += day.height;
  });
  const rowsBottomY = nextY;

  // Surfaces
  fill(LABEL_SURFACE);
  doc.rect(PAGE_X, rowsTopY, LABEL_W, rowsBottomY - rowsTopY, "F");
  days.forEach((day) => {
    if (day.blocks.length) return;
    fill(EMPTY_SURFACE);
    doc.rect(timelineX, day.y, timelineW, day.height, "F");
  });

  // Watermark: small, faint, behind every line and card.
  if (tccLogoImg) {
    const wmSize = Math.min(WATERMARK_MAX, (rowsBottomY - rowsTopY) * 0.6);
    const wmX = timelineX + (timelineW - wmSize) / 2;
    const wmY = rowsTopY + (rowsBottomY - rowsTopY - wmSize) / 2;
    const transparentWmUrl = createTransparentWatermarkDataUrl(tccLogoImg, WATERMARK_OPACITY);
    const transparentWmImg = transparentWmUrl ? await loadImgSafe(transparentWmUrl) : null;
    if (transparentWmImg) {
      doc.addImage(transparentWmImg, "PNG", wmX, wmY, wmSize, wmSize);
    } else {
      const pdf = doc as unknown as {
        GState?: new (options: { opacity: number }) => unknown;
        setGState?: (state: unknown) => void;
      };
      if (pdf.GState && pdf.setGState) {
        pdf.setGState(new pdf.GState({ opacity: WATERMARK_OPACITY }));
        doc.addImage(tccLogoImg, "JPEG", wmX, wmY, wmSize, wmSize);
        pdf.setGState(new pdf.GState({ opacity: 1 }));
      }
    }
  }

  // Time axis: one column per 90-minute block, labelled with its range.
  fill(AXIS_SURFACE);
  doc.rect(timelineX, GRID_Y, timelineW, AXIS_H, "F");
  fill(MAROON);
  doc.rect(PAGE_X, GRID_Y, LABEL_W, AXIS_H, "F");
  font("bold", 6.5);
  ink(GOLD_LIGHT);
  doc.text("DAY", PAGE_X + LABEL_W / 2, GRID_Y + 4.8, { align: "center", charSpace: 0.6 });
  font("bold", 7);
  ink(INK);
  for (let minutes = windowStart; minutes < windowEnd; minutes += COLUMN_MINUTES) {
    const center = (minuteX(minutes) + minuteX(minutes + COLUMN_MINUTES)) / 2;
    doc.text(formatBlockRange(minutes, minutes + COLUMN_MINUTES), center, GRID_Y + 4.8, { align: "center" });
  }

  // Gridlines: solid on each 90-minute boundary, dotted on each scheduling subdivision.
  for (let minutes = windowStart; minutes <= windowEnd; minutes += minorStep) {
    const isMajor = (minutes - windowStart) % COLUMN_MINUTES === 0;
    const x = minuteX(minutes);
    if (isMajor) {
      stroke(GRID_MAJOR);
      doc.setLineWidth(0.25);
      doc.line(x, GRID_Y, x, rowsBottomY);
    } else {
      stroke(GRID_MINOR);
      doc.setLineWidth(0.18);
      doc.setLineDashPattern([0.6, 0.9], 0);
      doc.line(x, rowsTopY, x, rowsBottomY);
      doc.setLineDashPattern([], 0);
    }
  }
  fill(GOLD);
  doc.rect(PAGE_X, rowsTopY - 0.5, PAGE_W, 0.5, "F");

  // Day rows
  days.forEach((day, index) => {
    if (index < days.length - 1) {
      stroke(GRID_MAJOR);
      doc.setLineWidth(0.25);
      doc.line(PAGE_X, day.y + day.height, PAGE_X + PAGE_W, day.y + day.height);
    }
    const centerY = day.y + day.height / 2;
    const count = day.blocks.length;
    if (count === 0) {
      font("bold", 7);
      ink(FAINT);
      doc.text(day.name, PAGE_X + LABEL_W / 2, centerY + 1.1, { align: "center", charSpace: 0.3 });
      font("italic", 7);
      const emptyLabelW = doc.getTextWidth("No classes") + 8;
      fill(EMPTY_SURFACE);
      doc.rect(timelineX + (timelineW - emptyLabelW) / 2, centerY - 2.2, emptyLabelW, 4.4, "F");
      ink(FAINT);
      doc.text("No classes", timelineX + timelineW / 2, centerY + 1.1, { align: "center" });
      return;
    }
    const showCount = day.height >= 10;
    font("bold", 8);
    ink(MAROON);
    doc.text(day.name, PAGE_X + LABEL_W / 2, showCount ? centerY - 0.4 : centerY + 1.2, { align: "center", charSpace: 0.3 });
    if (showCount) {
      font("normal", 6.5);
      ink(MUTED);
      doc.text(`${count} ${count === 1 ? "class" : "classes"}`, PAGE_X + LABEL_W / 2, centerY + 3.4, { align: "center" });
    }
  });

  stroke(FRAME);
  doc.setLineWidth(0.35);
  doc.line(timelineX, GRID_Y, timelineX, rowsBottomY);
  doc.roundedRect(PAGE_X, GRID_Y, PAGE_W, rowsBottomY - GRID_Y, 1.4, 1.4, "S");

  // --- Schedule cards -------------------------------------------------------------------
  days.forEach((day) => {
    day.blocks.forEach(({ sch, start, end, lane, isConflict }) => {
      const style = CARD_STYLES[cardKindOf(sch, isConflict)];
      const x = minuteX(start) + 0.4;
      const w = Math.max(2.5, minuteX(end) - minuteX(start) - 0.8);
      const y = day.y + lane * laneH + 0.7;
      const h = laneH - 1.4;

      fill(style.tint);
      stroke(isConflict ? style.accent : tintOf(style.accent, 0.45));
      doc.setLineWidth(isConflict ? 0.45 : 0.25);
      doc.roundedRect(x, y, w, h, 1.2, 1.2, "FD");
      fill(style.accent);
      doc.rect(x + 0.3, y + 0.9, 0.9, Math.max(0.5, h - 1.8), "F");

      const code = (
        sch.courseCode ||
        sch.subjectCode ||
        sch.course?.course_code ||
        sch.subject?.course_code ||
        sch.subject?.subject_code ||
        sch.course_code ||
        sch.subject_code ||
        "CLASS"
      ).toString().trim();
      const section = (sch.sectionName || sch.section?.section_name || "").toString().trim();
      const courseTitle = (
        sch.courseName ||
        sch.subjectName ||
        sch.courseTitle ||
        sch.subjectTitle ||
        sch.course?.course_name ||
        sch.subject?.course_name ||
        sch.subject?.subject_name ||
        sch.course_name ||
        sch.subject_name ||
        ""
      ).toString().trim();
      const roomOrMode = sch.mode === "online" ? "Online" : sch.mode === "field" ? "Field" : (sch.roomName || "Room TBA");
      const timeRange = formatBlockRange(start, end);

      // Narrow cards (short meetings): stacked code and section only.
      if (w < 14) {
        const innerW = w - 2.2;
        const left = x + 1.7;
        font("bold", 6);
        const codeLines = wrap(code, innerW, Math.max(1, Math.floor((h - 2) / 2.6)));
        font("bold", 5.2);
        const sectionLines = h >= codeLines.length * 2.6 + 5 ? wrap(section, innerW, 2) : [];
        const blockH = codeLines.length * 2.6 + sectionLines.length * 2.3;
        let lineY = y + (h - blockH) / 2 + 2;
        font("bold", 6);
        ink(style.accent);
        codeLines.forEach((line) => { doc.text(line, left, lineY); lineY += 2.6; });
        font("bold", 5.2);
        ink(BODY);
        sectionLines.forEach((line) => { doc.text(line, left, lineY - 0.2); lineY += 2.3; });
        return;
      }

      const padL = 2.7;
      const padR = 1.6;
      const left = x + padL;
      const innerW = w - padL - padR;
      const meta = [roomOrMode, timeRange].filter(Boolean).join("  |  ");

      // Compact cards (dense timetables): code + section, then one meta line.
      if (h < 13) {
        const showMeta = h >= 9;
        const blockH = showMeta ? 5.6 : 2.8;
        const codeY = y + (h - blockH) / 2 + 2.6;
        font("bold", 7.2);
        ink(style.accent);
        const codeText = fit(code, innerW);
        doc.text(codeText, left, codeY);
        const sectionX = left + doc.getTextWidth(codeText) + 1.6;
        font("bold", 5.8);
        if (section && sectionX + doc.getTextWidth(section) <= left + innerW) {
          ink(BODY);
          doc.text(section, sectionX, codeY);
        }
        if (showMeta) {
          font("normal", 5.8);
          ink(MUTED);
          doc.text(fit(meta, innerW), left, codeY + 3);
        }
        return;
      }

      // Standard cards: header row, wrapped title, meta row anchored to the bottom.
      // The section is always the same pill: beside the code when it fits, otherwise below it.
      const codeY = y + 4.4;
      font("bold", 5.8);
      const sectionText = fit(section, innerW - 3);
      const pillW = sectionText ? doc.getTextWidth(sectionText) + 3 : 0;
      font("bold", 8.5);
      const codeW = doc.getTextWidth(code);
      const pillBeside = Boolean(sectionText) && codeW + 2 + pillW <= innerW;
      let titleTop = codeY + 1.4;

      const drawPill = (pillX: number, pillY: number) => {
        fill(tintOf(style.accent, 0.14));
        doc.roundedRect(pillX, pillY, pillW, 3.7, 1.2, 1.2, "F");
        font("bold", 5.8);
        ink(style.accent);
        doc.text(sectionText, pillX + pillW / 2, pillY + 2.55, { align: "center" });
      };
      if (pillBeside) drawPill(x + w - padR - pillW, y + 1.5);
      font("bold", 8.5);
      ink(style.accent);
      doc.text(fit(code, innerW), left, codeY);
      if (!pillBeside && sectionText) {
        drawPill(left, codeY + 1.1);
        titleTop += 3.9;
      }

      font("bold", 6.5);
      const metaSplit = doc.getTextWidth(roomOrMode) + 2;
      font("normal", 6.5);
      const metaInline = metaSplit + doc.getTextWidth(timeRange) <= innerW;
      const metaLines = metaInline ? 1 : h >= 19 ? 2 : 1;
      const metaBaseY = y + h - 1.9;
      const metaTop = metaBaseY - (metaLines - 1) * 2.9 - 2.5;

      const titleLineH = 2.95;
      const maxTitleLines = Math.floor((metaTop - 0.3 - titleTop) / titleLineH);
      font("normal", 6.8);
      ink(BODY);
      wrap(courseTitle, innerW, Math.min(4, maxTitleLines)).forEach((line, i) => {
        doc.text(line, left, titleTop + 2.5 + i * titleLineH);
      });

      stroke(tintOf(style.accent, 0.18));
      doc.setLineWidth(0.18);
      doc.line(left, metaTop, x + w - padR, metaTop);
      if (metaInline) {
        font("bold", 6.5);
        ink(INK);
        doc.text(roomOrMode, left, metaBaseY);
        font("normal", 6.5);
        ink(MUTED);
        doc.text(timeRange, x + w - padR, metaBaseY, { align: "right" });
      } else if (metaLines === 2) {
        font("bold", 6.5);
        ink(INK);
        doc.text(fit(roomOrMode, innerW), left, metaBaseY - 2.9);
        font("normal", 6.5);
        ink(MUTED);
        doc.text(fit(timeRange, innerW), left, metaBaseY);
      } else {
        font("normal", 6.5);
        ink(MUTED);
        doc.text(fit(meta, innerW), left, metaBaseY);
      }
    });
  });

  // --- Legend and footer ----------------------------------------------------------------
  let legendX = PAGE_X;
  font("bold", 6.3);
  ink(MUTED);
  doc.text("LEGEND", legendX, LEGEND_Y, { charSpace: 0.5 });
  legendX += doc.getTextWidth("LEGEND") + 6;
  (Object.keys(CARD_STYLES) as CardKind[]).forEach((kind) => {
    const style = CARD_STYLES[kind];
    fill(style.tint);
    stroke(kind === "conflict" ? style.accent : tintOf(style.accent, 0.45));
    doc.setLineWidth(0.25);
    doc.roundedRect(legendX, LEGEND_Y - 2.4, 5, 3, 0.6, 0.6, "FD");
    fill(style.accent);
    doc.rect(legendX + 0.3, LEGEND_Y - 2.05, 0.7, 2.3, "F");
    font("normal", 6.8);
    ink(BODY);
    doc.text(style.label, legendX + 6.6, LEGEND_Y);
    legendX += 6.6 + doc.getTextWidth(style.label) + 5;
  });
  font("italic", 6.5);
  ink(MUTED);
  doc.text("Overlapping classes are placed in separate lanes so none is hidden.", PAGE_X + PAGE_W, LEGEND_Y, { align: "right" });

  stroke(HAIRLINE);
  doc.setLineWidth(0.25);
  doc.line(PAGE_X, FOOTER_RULE_Y, PAGE_X + PAGE_W, FOOTER_RULE_Y);
  font("normal", 6.3);
  ink(FAINT);
  const footerRight = `Generated ${printDate}   |   WICARS Academic Scheduling System   |   Page 1 of 1`;
  doc.text(footerRight, PAGE_X + PAGE_W, FOOTER_Y, { align: "right" });
  const footerLeft = ["Instructor Timetable", facultyName, deptLabel, semesterText].filter(Boolean).join("   |   ");
  doc.text(fit(footerLeft, PAGE_W - doc.getTextWidth(footerRight) - 8), PAGE_X, FOOTER_Y);

  return doc.output("blob");
}
