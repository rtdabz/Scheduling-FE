import tccLogo from "../../../assets/logo.jpg";
import { fullSemesterLabel, type LabelledSemester } from "../../../lib/semesterLabel";
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

function formatMins12hShort(mins: number): string {
  const rawHrs = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = rawHrs >= 12 ? "PM" : "AM";
  const hrs = rawHrs % 12 === 0 ? 12 : rawHrs % 12;
  return m === 0 ? `${hrs} ${suffix}` : `${hrs}:${m.toString().padStart(2, "0")} ${suffix}`;
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

const CARD_CODE_PT = 10;
const CARD_PILL_PT = 7;
const CARD_BODY_PT = 7.5;
const CARD_FOOTER_PT = 7;
const CARD_LINE_H = 3.6;

type CardKind = "lecture" | "laboratory" | "online" | "field" | "conflict";

const CARD_STYLES: Record<CardKind, { label: string; accent: Rgb; tint: Rgb }> = {
  lecture: { label: "Lecture", accent: [30, 64, 175], tint: [239, 246, 255] },
  laboratory: { label: "Laboratory", accent: [109, 40, 217], tint: [245, 243, 255] },
  online: { label: "Online", accent: [4, 120, 87], tint: [236, 253, 245] },
  field: { label: "Field", accent: [180, 83, 9], tint: [255, 251, 235] },
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
  const fit = (text: string, width: number): string =>
    (doc.splitTextToSize(text, Math.max(1, width)) as string[])[0] ?? "";

  const pageX = 10;
  const pageW = 277;

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

  const headerY = 8;
  const headerH = 26;
  fill(MAROON);
  doc.rect(pageX, headerY, pageW, headerH, "F");
  fill(GOLD);
  doc.rect(pageX, headerY + headerH, pageW, 0.9, "F");

  const logoTile = 20;
  const drawLogoTile = async (img: HTMLImageElement, x: number, format: string) => {
    const radius = logoTile / 2;
    const centerX = x + radius;
    const centerY = headerY + headerH / 2;

    fill(WHITE);
    doc.circle(centerX, centerY, radius, "F");
    stroke(GOLD_LIGHT);
    doc.setLineWidth(0.5);
    doc.circle(centerX, centerY, radius, "D");

    const circularDataUrl = createCircularImage(img);
    const circularImg = circularDataUrl ? await loadImgSafe(circularDataUrl) : null;
    const targetImg = circularImg || img;
    const imgFormat = circularImg ? "PNG" : format;

    const max = logoTile - 1.5;
    const ar = (targetImg.naturalWidth || 1) / (targetImg.naturalHeight || 1);
    const w = ar >= 1 ? max : max * ar;
    const h = ar >= 1 ? max / ar : max;
    doc.addImage(targetImg, imgFormat, centerX - w / 2, centerY - h / 2, w, h);
  };

  const effectiveDeptLogoImg = deptLogoImg || tccLogoImg;
  let textX = pageX + 5;
  if (effectiveDeptLogoImg) {
    const format = (departmentLogo && departmentLogo.match(/image\/jpe?g|\.jpe?g(?:$|\?)/i)) ? "JPEG" : "PNG";
    await drawLogoTile(effectiveDeptLogoImg, pageX + 3, format);
    textX = pageX + 3 + logoTile + 5;
  }

  let rightEdge = pageX + pageW - 3;

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

  const rawTitle = (title || (facultyName ? `INSTRUCTOR: ${facultyName}` : "CLASS TIMETABLE")).trim();
  const colon = rawTitle.indexOf(":");
  const eyebrow = colon > 0 ? `${rawTitle.slice(0, colon).trim().toUpperCase()} TIMETABLE` : "WEEKLY TIMETABLE";
  const heading = (colon > 0 ? rawTitle.slice(colon + 1) : rawTitle).trim().toUpperCase();
  const textW = rightEdge - textX - 4;

  font("bold", 7);
  ink(GOLD_LIGHT);
  doc.text(eyebrow, textX, headerY + 7.5, { charSpace: 0.6 });

  let nameSize = 17;
  font("bold", nameSize, "display");
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

  const chartY = headerY + headerH + 4;
  const labelW = 28;
  const timelineX = pageX + labelW;
  const timelineW = pageW - labelW;
  const axisH = 9;
  const rowsTopY = chartY + axisH;
  const rowsBottomLimit = 194;
  const emptyRowH = 8;

  const BLOCK = 90;
  const earliest = Math.min(420, ...items.map((item) => item.start));
  const latest = Math.max(1230, ...items.map((item) => item.end));
  const windowStart = 420 - Math.ceil((420 - earliest) / BLOCK) * BLOCK;
  const windowEnd = windowStart + Math.ceil((latest - windowStart) / BLOCK) * BLOCK;
  const minuteX = (minutes: number) => timelineX + ((minutes - windowStart) / (windowEnd - windowStart)) * timelineW;

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

  fill([250, 247, 244]);
  doc.rect(pageX, rowsTopY, labelW, rowsBottomY - rowsTopY, "F");
  days.forEach((day, idx) => {
    if (idx % 2 === 1) {
      fill([250, 251, 253]);
      doc.rect(timelineX, day.y, timelineW, day.height, "F");
    }
  });

  if (tccLogoImg) {
    const wmSize = Math.min(105, rowsBottomY - rowsTopY - 4);
    const wmX = timelineX + (timelineW - wmSize) / 2;
    const wmY = rowsTopY + (rowsBottomY - rowsTopY - wmSize) / 2;
    const watermarkOpacity = 0.18;
    const transparentWmUrl = createTransparentWatermarkDataUrl(tccLogoImg, watermarkOpacity);
    const transparentWmImg = transparentWmUrl ? await loadImgSafe(transparentWmUrl) : null;

    if (transparentWmImg) {
      doc.addImage(transparentWmImg, "PNG", wmX, wmY, wmSize, wmSize);
    } else {
      const pdf = doc as unknown as {
        GState?: new (options: { opacity: number }) => unknown;
        setGState?: (state: unknown) => void;
      };
      if (pdf.GState && pdf.setGState) {
        pdf.setGState(new pdf.GState({ opacity: watermarkOpacity }));
        doc.addImage(tccLogoImg, "JPEG", wmX, wmY, wmSize, wmSize);
        pdf.setGState(new pdf.GState({ opacity: 1 }));
      } else {
        doc.addImage(tccLogoImg, "JPEG", wmX, wmY, wmSize, wmSize);
      }
    }
  }

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

  for (let minutes = windowStart; minutes <= windowEnd; minutes += 30) {
    const isBoundary = (minutes - windowStart) % BLOCK === 0;
    stroke(isBoundary ? [175, 190, 205] : [205, 218, 230]);
    doc.setLineWidth(isBoundary ? 0.35 : 0.22);
    if (!isBoundary) doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(minuteX(minutes), isBoundary ? chartY : rowsTopY, minuteX(minutes), rowsBottomY);
    doc.setLineDashPattern([], 0);
  }

  days.forEach((day) => {
    stroke([175, 190, 205]);
    doc.setLineWidth(0.35);
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

  stroke([145, 165, 185]);
  doc.setLineWidth(0.45);
  doc.line(timelineX, chartY, timelineX, rowsBottomY);
  doc.roundedRect(pageX, chartY, pageW, rowsBottomY - chartY, 1.2, 1.2, "S");

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
      const section = sch.sectionName || sch.section?.section_name || "";
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
      const timeRange = [formatTime12hShort(sch.startTime), formatTime12hShort(sch.endTime)].filter(Boolean).join(" - ");

      font("bold", CARD_PILL_PT);
      const pillW = section ? doc.getTextWidth(section) + 3.6 : 0;
      const pillBeside = Boolean(section) && innerW >= pillW + 18;

      if (pillBeside) {
        const pillX = x + w - 1.5 - pillW;
        fill(style.accent);
        doc.roundedRect(pillX, y + 1.3, pillW, 4.2, 2, 2, "F");
        font("bold", CARD_PILL_PT);
        ink(WHITE);
        doc.text(section, pillX + pillW / 2, y + 4.3, { align: "center" });
      }

      const footerLines = h >= 18 && roomOrMode && timeRange
        ? [roomOrMode, timeRange]
        : [[roomOrMode, timeRange].filter(Boolean).join("  |  ")];
      const hasFooter = h >= 13;
      const footerY = y + h - 1.8;
      const footerTop = footerY - (footerLines.length - 1) * CARD_LINE_H;
      const middleBottom = hasFooter ? footerTop - 3.2 : y + h - 1;

      const centerX = x + w / 2;
      const maxTextW = Math.max(1, pillBeside ? innerW - pillW - 2 : innerW);

      const CODE_LINE_H = 4.2;
      const TITLE_LINE_H = 3.1;
      const middleTop = y + (pillBeside ? 1.5 : 0.8);
      const sectionH = !pillBeside && section ? CARD_LINE_H : 0;
      font("bold", CARD_BODY_PT);
      const wrapped = courseTitle ? (doc.splitTextToSize(courseTitle, maxTextW) as string[]) : [];
      const roomForTitle = Math.max(TITLE_LINE_H, middleBottom - middleTop - CODE_LINE_H - sectionH);
      const maxTitleLines = Math.max(1, Math.min(4, Math.floor(roomForTitle / TITLE_LINE_H)));
      const titleLines = wrapped.slice(0, maxTitleLines);
      if (wrapped.length > maxTitleLines) {
        titleLines[maxTitleLines - 1] = `${fit(wrapped.slice(maxTitleLines - 1).join(" "), maxTextW - 3).trimEnd()}...`;
      }
      const textBlockH = sectionH + CODE_LINE_H + titleLines.length * TITLE_LINE_H;
      const middleH = Math.max(textBlockH, middleBottom - middleTop);

      let lineY = middleTop + (middleH - textBlockH) / 2 + 3;

      if (!pillBeside && section) {
        font("bold", CARD_PILL_PT + 0.5);
        ink(style.accent);
        doc.text(section, x + padL, lineY);
        lineY += sectionH;
      }

      font("bold", CARD_CODE_PT);
      ink(style.accent);
      doc.text(fit(code, maxTextW), x + padL, lineY);

      if (titleLines.length > 0) {
        font("bold", CARD_BODY_PT);
        ink(BODY);
        titleLines.forEach((line, i) => {
          lineY += i === 0 ? CODE_LINE_H : TITLE_LINE_H;
          doc.text(line, x + padL, lineY);
        });
      }

      if (hasFooter) {
        stroke([210, 222, 234]);
        doc.setLineWidth(0.2);
        doc.line(x + padL, footerTop - 2.8, x + w - 1.5, footerTop - 2.8);
        font("normal", CARD_FOOTER_PT);
        ink(MUTED);
        footerLines.forEach((text, index) => {
          doc.text(fit(text, innerW), centerX, footerTop + index * CARD_LINE_H, { align: "center" });
        });
      }
    });
  });

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
