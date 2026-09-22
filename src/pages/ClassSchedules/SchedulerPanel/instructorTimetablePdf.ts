import type jsPDF from "jspdf";
import tccLogo from "../../../assets/logo.jpg";
import type { ScheduleItem, Semester } from "./types";

export interface InstructorTimetablePdfInput {
  title?: string;
  facultyName?: string;
  departmentCode?: string;
  departmentName?: string;
  departmentLogo?: string | null;
  schedules: ScheduleItem[];
  activeSemester?: Semester | null;
}

const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

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

  const pageWidth = 297;
  const headerX = 10;
  const headerY = 8;
  const headerW = 277;
  const headerH = 18;

  // 1. Top Maroon Header Bar (#4e0a10)
  doc.setFillColor(78, 10, 16);
  doc.rect(headerX, headerY, headerW, headerH, "F");

  // Header Title Text
  const headerTitle = title
    ? title.toUpperCase()
    : facultyName
    ? `INSTRUCTOR: ${facultyName.toUpperCase()}`
    : "CLASS TIMETABLE SCHEDULE";

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(245, 200, 66); // Amber Gold #F5C842
  doc.text(headerTitle, pageWidth / 2, headerY + 6.8, { align: "center" });

  const titleWidth = doc.getTextWidth(headerTitle);

  // TCC Logo on the left side (flanking title text)
  if (tccLogoImg) {
    const maxSize = 13;
    const ar = (tccLogoImg.naturalWidth || 1) / (tccLogoImg.naturalHeight || 1);
    const logoW = ar >= 1 ? maxSize : maxSize * ar;
    const logoH = ar >= 1 ? maxSize / ar : maxSize;
    const desiredX = (pageWidth - titleWidth) / 2 - logoW - 6;
    const logoX = Math.max(headerX + 4, desiredX);
    const logoY = headerY + (headerH - logoH) / 2;
    doc.addImage(tccLogoImg, "JPEG", logoX, logoY, logoW, logoH);
  }

  // Department Logo on the right side (closer to instructor name)
  if (deptLogoImg) {
    const maxSize = 13;
    const ar = (deptLogoImg.naturalWidth || 1) / (deptLogoImg.naturalHeight || 1);
    const logoW = ar >= 1 ? maxSize : maxSize * ar;
    const logoH = ar >= 1 ? maxSize / ar : maxSize;
    const desiredX = (pageWidth + titleWidth) / 2 + 6;
    const logoX = Math.min(headerX + headerW - logoW - 4, desiredX);
    const logoY = headerY + (headerH - logoH) / 2;
    doc.addImage(
      deptLogoImg,
      departmentLogo?.match(/image\/jpe?g|\.jpe?g(?:$|\?)/i) ? "JPEG" : "PNG",
      logoX,
      logoY,
      logoW,
      logoH,
    );
  }

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);

  const deptLabel = departmentCode
    ? `${departmentCode} - ${departmentName.toUpperCase()}`
    : departmentName.toUpperCase();
  const semText = activeSemester ? ` | ${activeSemester.name.toUpperCase()}` : "";
  const subTitle = (deptLabel || "COLLEGE OF INFORMATION TECHNOLOGY") + semText;

  doc.text(subTitle, pageWidth / 2, headerY + 13.5, { align: "center" });

  // 2. Timetable Grid Layout Setup
  const gridTopY = 30;
  const gridLeftX = 10;
  const gridWidth = 277;
  const colTimeWidth = 26;
  const dayColWidth = (gridWidth - colTimeWidth) / 7;
  const headerRowHeight = 11;
  const totalSlots = 27; // 7:00 AM to 8:30 PM (27 slots of 30 mins)
  const slotHeight = 5.5;
  const slotsStartY = gridTopY + headerRowHeight;

  // Render Transparent TCC Watermark Background inside the timetable grid
  if (tccLogoImg) {
    const wmSize = 100;
    const wmX = gridLeftX + (gridWidth - wmSize) / 2;
    const wmY = slotsStartY + (totalSlots * slotHeight - wmSize) / 2;
    let drawn = false;
    try {
      // Try jsPDF native GState opacity if available
      // @ts-ignore
      if (typeof doc.GState === "function") {
        // @ts-ignore
        doc.setGState(new doc.GState({ opacity: 0.18 }));
        doc.addImage(tccLogoImg, "JPEG", wmX, wmY, wmSize, wmSize);
        // @ts-ignore
        doc.setGState(new doc.GState({ opacity: 1.0 }));
        drawn = true;
      }
    } catch {
      drawn = false;
    }

    if (!drawn) {
      const transparentWmUrl = createTransparentWatermarkDataUrl(tccLogoImg, 0.18);
      if (transparentWmUrl) {
        const transparentWmImg = await loadImgSafe(transparentWmUrl);
        if (transparentWmImg) {
          doc.addImage(transparentWmImg, "PNG", wmX, wmY, wmSize, wmSize);
        }
      }
    }
  }

  // 3. Maroon Grid Header Row (#4e0a10)
  doc.setFillColor(78, 10, 16);
  doc.rect(gridLeftX, gridTopY, gridWidth, headerRowHeight, "F");

  doc.setDrawColor(60, 8, 12);
  doc.setLineWidth(0.3);
  doc.rect(gridLeftX, gridTopY, gridWidth, headerRowHeight, "S");

  // TIME column header
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(245, 200, 66); // Gold #F5C842
  doc.text("TIME", gridLeftX + colTimeWidth / 2, gridTopY + 7, { align: "center" });
  doc.line(gridLeftX + colTimeWidth, gridTopY, gridLeftX + colTimeWidth, gridTopY + headerRowHeight);

  // Day Headers (MON, TUE, WED, THU, FRI, SAT, SUN) with class count pill badges
  DAY_CODES.forEach((dayCode, idx) => {
    const dayX = gridLeftX + colTimeWidth + idx * dayColWidth;
    const dayCenterX = dayX + dayColWidth / 2;

    // Day Code Text
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(dayCode, dayCenterX, gridTopY + 4.5, { align: "center" });

    // Class Count Badge
    const daySchedules = schedules.filter((s) => normalizeDay(s.day) === idx);
    const count = daySchedules.length;
    const countText = `${count} ${count === 1 ? "CLASS" : "CLASSES"}`;

    const badgeW = 16;
    const badgeH = 3.8;
    const badgeX = dayCenterX - badgeW / 2;
    const badgeY = gridTopY + 5.8;

    doc.setFillColor(60, 10, 16);
    doc.setDrawColor(201, 149, 42); // Gold border
    doc.setLineWidth(0.25);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(245, 200, 66); // Gold text
    doc.text(countText, dayCenterX, badgeY + 2.7, { align: "center" });

    if (idx < 6) {
      doc.setDrawColor(100, 20, 28);
      doc.line(dayX + dayColWidth, gridTopY, dayX + dayColWidth, gridTopY + headerRowHeight);
    }
  });

  // 4. Time Rows & Grid Dividers with Bold Time Block Boundaries
  for (let slotIndex = 0; slotIndex <= totalSlots; slotIndex++) {
    const slotY = slotsStartY + slotIndex * slotHeight;
    const isMajorBlock = slotIndex % 3 === 0;

    if (isMajorBlock) {
      // Bold divider line to mark where 1.5-hour time slots start and end
      doc.setDrawColor(100, 116, 139); // Dark slate #64748B
      doc.setLineWidth(0.45);
      doc.line(gridLeftX, slotY, gridLeftX + gridWidth, slotY);
    } else {
      // Light dashed-feeling 30-min slot line
      doc.setDrawColor(226, 232, 240); // Light slate #E2E8F0
      doc.setLineWidth(0.15);
      doc.line(gridLeftX, slotY, gridLeftX + gridWidth, slotY);
    }
  }

  // Draw 1.5-hour interval time labels on the left column ("7 AM to 8:30 AM", "8:30 AM to 10 AM", etc.)
  const intervalBlocks = 9; // 9 blocks of 1.5 hrs
  for (let b = 0; b < intervalBlocks; b++) {
    const blockStartMins = 420 + b * 90;
    const blockEndMins = blockStartMins + 90;
    const blockStartY = slotsStartY + b * 3 * slotHeight;
    const blockH = 3 * slotHeight;

    const startLabel = formatMins12hShort(blockStartMins);
    const endLabel = `to ${formatMins12hShort(blockEndMins)}`;

    const textCenterY = blockStartY + blockH / 2;

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(startLabel, gridLeftX + colTimeWidth / 2, textCenterY - 0.8, { align: "center" });

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(endLabel, gridLeftX + colTimeWidth / 2, textCenterY + 2.6, { align: "center" });
  }

  // Draw Main Vertical Grid Lines
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(gridLeftX, gridTopY, gridLeftX, slotsStartY + totalSlots * slotHeight);
  doc.line(gridLeftX + colTimeWidth, gridTopY, gridLeftX + colTimeWidth, slotsStartY + totalSlots * slotHeight);
  DAY_CODES.forEach((_, idx) => {
    const dayX = gridLeftX + colTimeWidth + (idx + 1) * dayColWidth;
    doc.line(dayX, gridTopY, dayX, slotsStartY + totalSlots * slotHeight);
  });
  doc.line(gridLeftX, slotsStartY + totalSlots * slotHeight, gridLeftX + gridWidth, slotsStartY + totalSlots * slotHeight);

  // 5. Render Schedule Class Cards with Overlap Handling
  DAY_CODES.forEach((_, dayIdx) => {
    const daySchedules = schedules.filter((s) => normalizeDay(s.day) === dayIdx);
    if (daySchedules.length === 0) return;

    // Sort by start time
    daySchedules.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

    daySchedules.forEach((sch, sIndex) => {
      const startMins = parseTimeToMinutes(sch.startTime);
      const endMins = parseTimeToMinutes(sch.endTime);
      if (startMins === 0 || endMins === 0 || endMins <= startMins) return;

      const startSlot = Math.max(0, Math.floor((startMins - 420) / 30));
      const endSlot = Math.min(totalSlots, Math.ceil((endMins - 420) / 30));
      const durationSlots = endSlot - startSlot;
      if (durationSlots <= 0) return;

      // Detect overlapping classes on the same day
      const overlapping = daySchedules.filter((other, oIndex) => {
        if (oIndex === sIndex) return false;
        const oStart = parseTimeToMinutes(other.startTime);
        const oEnd = parseTimeToMinutes(other.endTime);
        return Math.max(startMins, oStart) < Math.min(endMins, oEnd);
      });

      let blockX = gridLeftX + colTimeWidth + dayIdx * dayColWidth + 1;
      let blockW = dayColWidth - 2;

      if (overlapping.length > 0) {
        const overlapPos = sIndex % (overlapping.length + 1);
        const subW = (dayColWidth - 2) / (overlapping.length + 1);
        blockW = subW - 0.5;
        blockX = gridLeftX + colTimeWidth + dayIdx * dayColWidth + 1 + overlapPos * subW;
      }

      const blockY = slotsStartY + startSlot * slotHeight + 0.8;
      const blockH = durationSlots * slotHeight - 1.6;

      // Rounded Soft Blue Card (#EFF6FF background, #3B82F6 border)
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.4);
      doc.roundedRect(blockX, blockY, blockW, blockH, 1.8, 1.8, "FD");

      // Top Row: Subject Code & Section Badge
      const code = sch.subjectCode || sch.courseCode || "SUBJECT";
      const sectionName = sch.sectionName || "";

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 58, 138);
      doc.text(code, blockX + 2.5, blockY + 4.5);

      if (sectionName && blockW > 22) {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        const textWidth = doc.getTextWidth(sectionName);
        const sectionBadgeW = Math.min(textWidth + 3.5, blockW / 2);
        const sectionBadgeH = 3.6;
        const sectionBadgeX = blockX + blockW - sectionBadgeW - 2;
        const sectionBadgeY = blockY + 1.8;

        doc.setFillColor(219, 234, 254);
        doc.setDrawColor(147, 197, 253);
        doc.setLineWidth(0.25);
        doc.roundedRect(sectionBadgeX, sectionBadgeY, sectionBadgeW, sectionBadgeH, 1, 1, "FD");

        doc.setTextColor(30, 64, 175);
        doc.text(sectionName, sectionBadgeX + sectionBadgeW / 2, sectionBadgeY + 2.6, { align: "center" });
      }

      // Middle Row: Subject / Course Title with text wrapping
      const courseTitle = sch.subjectTitle || sch.courseTitle || "";
      if (blockH > 7 && courseTitle) {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 58, 138);
        const maxTextW = blockW - 4;
        const titleLines: string[] = doc.splitTextToSize(courseTitle, maxTextW);
        const maxLines = blockH >= 15 ? 2 : 1;
        titleLines.slice(0, maxLines).forEach((line, lineIdx) => {
          doc.text(line, blockX + 2.5, blockY + 8.5 + lineIdx * 3.2);
        });
      }

      // Bottom Row: Room Location & Start Time (if space permits)
      if (blockH >= 11) {
        doc.setDrawColor(219, 234, 254);
        doc.setLineWidth(0.25);
        doc.line(blockX + 2, blockY + blockH - 4.8, blockX + blockW - 2, blockY + blockH - 4.8);

        const roomOrMode = sch.mode === "online" ? "Online" : sch.mode === "field" ? "Field" : (sch.roomName || "");
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(30, 58, 138);
        if (roomOrMode) {
          const maxRoomW = blockW - (sch.startTime ? 14 : 4);
          const roomLines: string[] = doc.splitTextToSize(roomOrMode, maxRoomW);
          if (roomLines.length > 0) {
            doc.text(roomLines[0], blockX + 2.5, blockY + blockH - 1.5);
          }
        }

        const startTimeStr = formatTime12hShort(sch.startTime);
        if (startTimeStr && blockW > 24) {
          doc.text(startTimeStr, blockX + blockW - 2.5, blockY + blockH - 1.5, { align: "right" });
        }
      }
    });
  });

  // 6. Footer Document Info
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const printTimestamp = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  doc.text(`Generated on ${printTimestamp} | WICARS Academic Scheduling System`, gridLeftX, 203);

  return doc.output("blob");
}
