import { useEffect } from "react";
import type jsPDF from "jspdf";
import type autoTable from "jspdf-autotable";
import type { RowInput } from "jspdf-autotable";
import tccLogo from "../../../assets/logo.jpg";
import municipalLogo from "../../../assets/municipal-logo.png";
import type { ApiDepartmentRecord, ScheduleItem, Section, UserSummary } from "./types";
import { fetchInstitutionSettings, type InstitutionSettings } from "../../../lib/institutionSettings";

interface PrintScheduleProps {
  sections: Section[];
  isPrintModalOpen: boolean;
  setIsPrintModalOpen: (value: boolean) => void;
  allSchedules: ScheduleItem[];
  selectedSectionId: string;
  departments: ApiDepartmentRecord[];
  users: UserSummary[];
}

interface AutoTableDocument extends jsPDF {
  lastAutoTable: {
    finalY: number;
  };
}

interface JsPdfDocumentWithPageInfo extends jsPDF {
  internal: jsPDF["internal"] & {
    getNumberOfPages: () => number;
  };
}

const ACADEMIC_YEAR = "2025-2026";
const TERM = "2nd";
const PAGE_TOP_Y = 15;
const PAGE_FOOTER_Y = 192;
const CONTENT_BOTTOM_Y = 185;
const MIN_SECTION_START_SPACE = 28;

const SIGNATORIES = {
  preparedBy: { name: "", role: "Program Head" },
  reviewedBy: { name: "", role: "Dean" },
  recommendedBy: { name: "KHAREN JANE S. UNGAB, DM", role: "Vice-President for Academic Affairs" },
};

/** The approving signatory is whatever the VPAA saved in Settings. */
const buildSignatories = (settings: InstitutionSettings, preparedByName: string, reviewedByName: string) => [
  { label: "Prepared by:", ...SIGNATORIES.preparedBy, name: preparedByName },
  { label: "Reviewed by:", ...SIGNATORIES.reviewedBy, name: reviewedByName },
  { label: "Recommended by:", ...SIGNATORIES.recommendedBy },
  { label: "Approved by:", name: settings.president_name, role: settings.president_title },
];

const formatPrintTime = (timeStr: string): string => {
  if (!timeStr) return "";
  const ampmMatch = timeStr.match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hours = ampmMatch[1];
    const minutes = ampmMatch[2] || "00";
    const ampm = ampmMatch[3].toUpperCase();
    return `${hours}:${minutes.padStart(2, "0")} ${ampm}`;
  }
  const time24hMatch = timeStr.match(/^(\d{2}):(\d{2})/);
  if (time24hMatch) {
    let hours = parseInt(time24hMatch[1], 10);
    const minutes = time24hMatch[2];
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${ampm}`;
  }
  return timeStr;
};

const getFullDayName = (day: string): string => {
  if (!day) return "";
  const d = day.trim().toLowerCase();
  if (d === "mon" || d === "monday") return "Monday";
  if (d === "tue" || d === "tuesday") return "Tuesday";
  if (d === "wed" || d === "wednesday") return "Wednesday";
  if (d === "thu" || d === "thursday") return "Thursday";
  if (d === "fri" || d === "friday") return "Friday";
  if (d === "sat" || d === "saturday") return "Saturday";
  if (d === "sun" || d === "sunday") return "Sunday";
  return day;
};

export default function PrintSchedule({
  sections,
  isPrintModalOpen,
  setIsPrintModalOpen,
  allSchedules,
  selectedSectionId,
  departments,
  users,
}: PrintScheduleProps) {

  const activeSection = sections.find((section) => section.id === selectedSectionId);
  const activeDepartment = departments.find((department) => Number(department.id) === Number(activeSection?.departmentId));
  const departmentId = activeSection?.departmentId?.toString();
  const byRole = (role: string) =>
    users.find((user) => user.role?.toLowerCase() === role && user.department_id?.toString() === departmentId);
  const preparer = byRole("program_head") ?? byRole("secretary");
  const departmentLogoUrl = activeDepartment?.logo || null;
  const departmentTitle = (() => {
    const name = activeDepartment?.department_name?.trim() || "INFORMATION TECHNOLOGY";
    return /^college\s+of\s+/i.test(name) ? name.toUpperCase() : `COLLEGE OF ${name.toUpperCase()}`;
  })();

  let logoUrl = tccLogo;
  if (!tccLogo.startsWith("data:") && !tccLogo.startsWith("http:") && !tccLogo.startsWith("https:")) {
    const logoOrigin = window.location.origin;
    logoUrl = `${logoOrigin}${tccLogo.startsWith("/") ? "" : "/"}${tccLogo}`;
  }

  let municipalLogoUrl = municipalLogo;
  if (!municipalLogo.startsWith("data:") && !municipalLogo.startsWith("http:") && !municipalLogo.startsWith("https:")) {
    const logoOrigin = window.location.origin;
    municipalLogoUrl = `${logoOrigin}${municipalLogo.startsWith("/") ? "" : "/"}${municipalLogo}`;
  }

  const handlePrint = async () => {
    const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const loadImgSafe = (url: string): Promise<HTMLImageElement | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };

    // fetchInstitutionSettings never rejects, so a signatory lookup failure
    // still prints -- with the standing names.
    Promise.all([loadImgSafe(logoUrl), loadImgSafe(municipalLogoUrl), departmentLogoUrl ? loadImgSafe(departmentLogoUrl) : Promise.resolve(null), fetchInstitutionSettings()])
      .then(([logoImg, muniImg, departmentImg, settings]) => {
        generatePdf(JsPDF, autoTable, logoImg, muniImg, departmentImg, settings);
      });
  };

  const generatePdf = (PdfDocument: typeof jsPDF, table: typeof autoTable, logoImg: HTMLImageElement | null, muniImg: HTMLImageElement | null, departmentImg: HTMLImageElement | null, settings: InstitutionSettings) => {
    const signatories = buildSignatories(
      settings,
      preparer?.name?.trim().toUpperCase() ?? "",
      byRole("dean")?.name?.trim().toUpperCase() ?? "",
    );
    const doc = new PdfDocument({ orientation: "landscape", format: "a4" });
    // ── 1. Letterhead ──
    let logoWidth = 22;
    let logoHeight = 22;
    if (logoImg) {
      const ar = logoImg.naturalWidth / logoImg.naturalHeight;
      if (ar > 1) {
        logoWidth = 22 * ar;
      } else {
        logoHeight = 22 / ar;
      }
      doc.addImage(logoImg, "JPEG", 25, 13, logoWidth, logoHeight);
    }

    let muniWidth = 32;
    let muniHeight = 32;
    if (muniImg) {
      const ar = muniImg.naturalWidth / muniImg.naturalHeight;
      if (ar > 1) {
        muniWidth = 32 * ar;
      } else {
        muniHeight = 32 / ar;
      }
      const muniY = 24 - muniHeight / 2;
      doc.addImage(muniImg, "PNG", 246 - muniWidth, muniY, muniWidth, muniHeight);
    }

    doc.setFont("Times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(85, 85, 85);
    doc.text("Republic of the Philippines", 148.5, 14, { align: "center" });
    doc.text("Province of Misamis Oriental", 148.5, 17.5, { align: "center" });

    doc.setFont("Times", "bold");
    doc.text("Municipality of Tagoloan", 148.5, 21, { align: "center" });

    doc.setFont("Times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(123, 12, 23); // #7b0c17
    doc.text("TAGOLOAN COMMUNITY COLLEGE", 148.5, 26.5, { align: "center" });

    doc.setFont("Times", "bold"); // Fallback for Imprint MT Shadow
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    doc.text("Baluarte, Tagoloan, Misamis Oriental", 148.5, 31.5, { align: "center" });

    doc.setFont("Times", "italic");
    doc.setFontSize(10);
    doc.setTextColor(26, 86, 219); // #1a56db
    doc.text("tccadmin@tcc.edu.ph", 148.5, 35.5, { align: "center" });

    const linkWidth = doc.getTextWidth("tccadmin@tcc.edu.ph");
    doc.setDrawColor(26, 86, 219);
    doc.setLineWidth(0.2);
    doc.line(148.5 - linkWidth / 2, 36.2, 148.5 + linkWidth / 2, 36.2);

    doc.setFont("Helvetica", "normal"); // Fallback for Arial
    doc.setFontSize(8);
    doc.setTextColor(85, 85, 85);
    doc.text("Member: Association of Local Colleges & Universities (ALCU)", 148.5, 39.5, { align: "center" });

    const fullText = "Member: Association of Local Colleges & Universities Commission on Accreditation";
    doc.text(fullText, 148.5, 43, { align: "center" });

    const totalWidth = doc.getTextWidth(fullText);
    const memberLabelWidth = doc.getTextWidth("Member: ");
    const underlineWidth = totalWidth - memberLabelWidth;
    const underlineStartX = 148.5 - totalWidth / 2 + memberLabelWidth;

    doc.setDrawColor(85, 85, 85);
    doc.setLineWidth(0.2);
    doc.line(underlineStartX, 43.7, underlineStartX + underlineWidth, 43.7);

    if (departmentImg) {
      const maxSize = 24;
      const aspectRatio = departmentImg.naturalWidth / departmentImg.naturalHeight;
      const departmentWidth = aspectRatio >= 1 ? maxSize : maxSize * aspectRatio;
      const departmentHeight = aspectRatio >= 1 ? maxSize / aspectRatio : maxSize;
      doc.addImage(
        departmentImg,
        departmentLogoUrl?.match(/image\/jpe?g|\.jpe?g(?:$|\?)/i) ? "JPEG" : "PNG",
        261 - departmentWidth / 2,
        24 - departmentHeight / 2,
        departmentWidth,
        departmentHeight,
      );
    } else {
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.4);
      doc.setLineDashPattern([2, 2], 0);
      doc.ellipse(261, 24, 11, 11, "S");
      doc.setLineDashPattern([], 0);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(187, 187, 187);
      doc.text("Dept\nLogo", 261, 22.5, { align: "center" });
    }

    // Red line under letterhead
    doc.setDrawColor(123, 12, 23);
    doc.setLineWidth(0.8);
    doc.line(15, 46, 282, 46);

    let currentY = 49;

    // ── 2. Title Block ──
    doc.setFillColor(123, 12, 23);
    doc.rect(15, currentY, 267, 7, "F");

    // Draw borders for Title Block (left, right)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(15, currentY, 15, currentY + 7);    // left border
    doc.line(282, currentY, 282, currentY + 7);  // right border

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setDrawColor(201, 149, 42);
    doc.setLineWidth(0.15);
    doc.text(departmentTitle, 148.5, currentY + 5, { align: "center" });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);

    // AY Bar
    doc.setFillColor(255, 255, 255);
    doc.rect(15, currentY + 7, 267, 6);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`CLASS SCHEDULE AY  ${ACADEMIC_YEAR}    ${TERM} Term`, 148.5, currentY + 11.5, { align: "center" });

    currentY += 13;

    // Determine target sections belonging to the same department as the active section
    const unfilteredSections = activeSection
      ? sections.filter((s) => s.departmentId === activeSection.departmentId)
      : sections;

    const targetSections = [...unfilteredSections].sort((a, b) => {
      const yearA = Number(a.yearLevel) || 0;
      const yearB = Number(b.yearLevel) || 0;
      if (yearA !== yearB) {
        return yearA - yearB;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    targetSections.forEach((section) => {
      // Keep a section title with at least its table header and first rows.
      if (currentY + MIN_SECTION_START_SPACE > CONTENT_BOTTOM_Y) {
        doc.addPage();
        currentY = PAGE_TOP_Y;
      }

      // Draw Section Bar
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.setFillColor(255, 255, 255);
      doc.rect(15, currentY, 267, 6);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(section.name, 148.5, currentY + 4.5, { align: "center" });

      currentY += 6;

      const sectionSchedules = allSchedules.filter((s) => s.sectionId === section.id);
      const schedulesBySubject = new Map<string, ScheduleItem[]>();

      sectionSchedules.forEach((schedule) => {
        const key = schedule.courseId ?? schedule.subjectId ?? "";
        const subjectSchedules = schedulesBySubject.get(key) ?? [];
        subjectSchedules.push(schedule);
        schedulesBySubject.set(key, subjectSchedules);
      });

      const sortedSubjects = Array.from(schedulesBySubject.values()).sort((subjectA, subjectB) => {
        const firstA = subjectA[0];
        const firstB = subjectB[0];
        
        const catA = (firstA?.courseType || firstA?.subjectType || "minor").toLowerCase();
        const catB = (firstB?.courseType || firstB?.subjectType || "minor").toLowerCase();
        
        if (catA !== catB) {
          return catA === "major" ? -1 : 1;
        }
        
        const codeA = firstA?.courseCode || firstA?.subjectCode || "";
        const codeB = firstB?.courseCode || firstB?.subjectCode || "";
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      });

      const filledRows = sortedSubjects.flatMap((subjectSchedules) =>
        subjectSchedules.sort((left, right) => (
          left.dayIndex - right.dayIndex || left.startSlot - right.startSlot
        ))
      );

      const head: RowInput[] = [
        [
          { content: "COURSE CODE", rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
          { content: "COURSE DESCRIPTION", rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
          { content: "UNITS", colSpan: 3, styles: { halign: 'center' as const } },
          { content: "DAY", rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
          { content: "TIME", rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
          { content: "ROOM", rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } }
        ],
        [
          { content: "LEC", styles: { halign: 'center' as const } },
          { content: "LAB", styles: { halign: 'center' as const } },
          { content: "TOTAL", styles: { halign: 'center' as const } }
        ]
      ];

      const body: RowInput[] = filledRows.map((item, index) => {
        const previousItem = filledRows[index - 1];
        const itemKey = item.courseId ?? item.subjectId ?? "";
        const prevKey = previousItem ? (previousItem.courseId ?? previousItem.subjectId ?? "") : "";
        const isAdditionalMeeting = prevKey === itemKey;
        const subjectMeetingCount = schedulesBySubject.get(itemKey)?.length ?? 1;
        const roomLabel = item.roomName || (item.mode === "online" ? "Online" : item.mode === "field" ? "Field" : "");
        const previousRoomLabel = previousItem
          ? previousItem.roomName || (previousItem.mode === "online" ? "Online" : previousItem.mode === "field" ? "Field" : "")
          : "";
        const sameMeetingTime = (left: typeof item, right: typeof item) =>
          left.startTime === right.startTime && left.endTime === right.endTime;
        const isAdditionalRoomMeeting = previousRoomLabel === roomLabel
          && previousItem !== undefined
          && sameMeetingTime(item, previousItem);
        const roomMeetingCount = isAdditionalRoomMeeting
          ? 1
          : filledRows.slice(index).findIndex((candidate, offset) => {
              if (offset === 0) return false;
              const candidateRoom = candidate.roomName || (candidate.mode === "online" ? "Online" : candidate.mode === "field" ? "Field" : "");
              return candidateRoom !== roomLabel
                || !sameMeetingTime(candidate, item);
            });
        const roomRowSpan = roomMeetingCount === -1 ? filledRows.length - index : roomMeetingCount;

        return [
          ...(isAdditionalMeeting ? [] : [
            {
              content: item.subjectCode,
              rowSpan: subjectMeetingCount,
              styles: { halign: "center" as const, valign: "middle" as const }
            },
            {
              content: item.subjectName,
              rowSpan: subjectMeetingCount,
              styles: { halign: "center" as const, valign: "middle" as const }
            },
            {
              content: item.lectureUnits.toString(),
              rowSpan: subjectMeetingCount,
              styles: { halign: "center" as const, valign: "middle" as const }
            },
            {
              content: item.laboratoryUnits.toString(),
              rowSpan: subjectMeetingCount,
              styles: { halign: "center" as const, valign: "middle" as const }
            },
            {
              content: item.totalUnits.toString(),
              rowSpan: subjectMeetingCount,
              styles: { halign: "center" as const, valign: "middle" as const }
            }
          ]),
          getFullDayName(item.day),
          `${formatPrintTime(item.startTime)} – ${formatPrintTime(item.endTime)}`,
          ...(isAdditionalRoomMeeting ? [] : [{
            content: roomLabel,
            rowSpan: roomRowSpan,
            styles: { halign: "center" as const, valign: "middle" as const }
          }])
        ];
      });


      table(doc, {
        startY: currentY,
        margin: { left: 15, right: 15, top: PAGE_TOP_Y, bottom: 25 },
        tableWidth: 267,
        theme: 'grid',
        head: head,
        body: body,
        rowPageBreak: 'avoid',
        showHead: 'firstPage',
        styles: {
          font: "helvetica",
          fontSize: 9,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.4,
          cellPadding: 1.5,
          valign: 'middle',
          overflow: 'ellipsize'
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          lineWidth: 0.4,
          lineColor: [0, 0, 0]
        },
        columnStyles: {
          0: { cellWidth: 267 * 0.11 },
          1: { cellWidth: 267 * 0.295 },
          2: { cellWidth: 267 * 0.045, halign: 'center' },
          3: { cellWidth: 267 * 0.045, halign: 'center' },
          4: { cellWidth: 267 * 0.06, halign: 'center' },
          5: { cellWidth: 267 * 0.11, halign: 'center' },
          6: { cellWidth: 267 * 0.20, halign: 'center' },
          7: { cellWidth: 267 * 0.135, halign: 'center' }
        }
      });

      currentY = (doc as AutoTableDocument).lastAutoTable.finalY + 4;
    });

    // ── 4. Signature Block ──
    const sigHeight = 22;
    if (currentY + sigHeight > CONTENT_BOTTOM_Y) {
      doc.addPage();
      currentY = PAGE_TOP_Y;
    }

    const sigWidth = 267 / 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.rect(15, currentY, 267, 22);

    for (let i = 1; i <= 3; i++) {
      doc.line(15 + i * sigWidth, currentY, 15 + i * sigWidth, currentY + 22);
    }

    signatories.forEach((sig, idx) => {
      const colLeft = 15 + idx * sigWidth;
      const colCenter = colLeft + sigWidth / 2;

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      doc.text(sig.label, colLeft + 4, currentY + 5);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(sig.name, colCenter, currentY + 13, { align: "center" });

      doc.line(colLeft + 6, currentY + 14.5, colLeft + sigWidth - 6, currentY + 14.5);

      doc.setFont("Helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(68, 68, 68);
      doc.text(sig.role, colCenter, currentY + 18.5, { align: "center" });
    });

    // ── 5. Page-Anchored Document Footer ──
    const pageCount = (doc as JsPdfDocumentWithPageInfo).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      const footerY = PAGE_FOOTER_Y;
      doc.setFillColor(123, 12, 23); // #7b0c17
      doc.rect(15, footerY, 267, 1.5, "F");

      const tableStartY = footerY + 3.5;
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.3);
      doc.rect(15, tableStartY, 48, 8);
      doc.line(15, tableStartY + 4, 15 + 48, tableStartY + 4);
      doc.line(15 + 28, tableStartY, 15 + 28, tableStartY + 8);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text("Document No.", 15 + 2, tableStartY + 3);
      doc.text("Revision No.", 15 + 28 + 2, tableStartY + 3);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(51, 51, 51);
      doc.text("TCC-VPAA-011", 15 + 2, tableStartY + 7);
      doc.text("001", 15 + 28 + 2, tableStartY + 7);

      doc.setFont("Helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      doc.text(`Page No.  ${i} of ${pageCount}`, 282, tableStartY + 5, { align: "right" });
    }

    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

  useEffect(() => {
    if (isPrintModalOpen) {
      handlePrint();
      setIsPrintModalOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrintModalOpen, setIsPrintModalOpen]);

  return null;
}
