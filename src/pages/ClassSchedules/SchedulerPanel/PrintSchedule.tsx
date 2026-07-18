import { useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RowInput } from "jspdf-autotable";
import tccLogo from "../../../assets/logo.jpg";
import municipalLogo from "../../../assets/municipal-logo.png";
import type { ScheduleItem, Section } from "./types";

interface PrintScheduleProps {
  sections: Section[];
  isPrintModalOpen: boolean;
  setIsPrintModalOpen: (value: boolean) => void;
  allSchedules: ScheduleItem[];
  selectedSectionId: string;
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
const COLLEGE_OF = "INFORMATION TECHNOLOGY";

const SIGNATORIES = {
  preparedBy: { name: "(NAME)", role: "Program Head" },
  reviewedBy: { name: "(NAME)", role: "Dean" },
  recommendedBy: { name: "KHAREN JANE S. UNGAB, DM", role: "Vice-President for Academic Affairs" },
  approvedBy: { name: "ATTY. NADYA B. EMANO-ELIPE", role: "OIC-College President" },
};

export default function PrintSchedule({
  sections,
  isPrintModalOpen,
  setIsPrintModalOpen,
  allSchedules,
  selectedSectionId,
}: PrintScheduleProps) {

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

  const signatories = [
    { label: "Prepared by:", ...SIGNATORIES.preparedBy },
    { label: "Reviewed by:", ...SIGNATORIES.reviewedBy },
    { label: "Recommended by:", ...SIGNATORIES.recommendedBy },
    { label: "Approved by:", ...SIGNATORIES.approvedBy },
  ];

  const handlePrint = () => {
    const loadImgSafe = (url: string): Promise<HTMLImageElement | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };

    Promise.all([loadImgSafe(logoUrl), loadImgSafe(municipalLogoUrl)])
      .then(([logoImg, muniImg]) => {
        generatePdf(logoImg, muniImg);
      });
  };

  const generatePdf = (logoImg: HTMLImageElement | null, muniImg: HTMLImageElement | null) => {
    const doc = new jsPDF({ orientation: "landscape", format: "a4" });

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

    // Dept Logo Placeholder Circle
    doc.setDrawColor(204, 204, 204);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 2], 0);
    doc.ellipse(261, 24, 11, 11, "S");
    doc.setLineDashPattern([], 0);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(187, 187, 187);
    doc.text("Dept\nLogo", 261, 22.5, { align: "center" });

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
    doc.text(`COLLEGE OF ${COLLEGE_OF}`, 148.5, currentY + 5, { align: "center" });
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
    const activeSection = sections.find((s) => s.id === selectedSectionId);
    const targetSections = activeSection
      ? sections.filter((s) => s.departmentId === activeSection.departmentId)
      : sections;

    targetSections.forEach((section) => {
      // Prevent orphaned header bar at page bottom
      if (currentY > 145) {
        doc.addPage();
        currentY = 15;
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
      const filledRows = [...sectionSchedules];

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

      const body = filledRows.map((item) => [
        item.subjectCode,
        item.subjectName,
        item.lectureUnits.toString(),
        item.laboratoryUnits.toString(),
        item.totalUnits.toString(),
        item.day,
        `${item.startTime} – ${item.endTime}`,
        item.roomName
      ]);

      const rowHeight = 5.5;
      const headerHeight = 11;
      const remainingHeight = 185 - currentY;
      const realRowsHeight = headerHeight + (filledRows.length * rowHeight);
      const spaceAfterRealRows = remainingHeight - realRowsHeight;
      const maxEmptyRows = Math.max(0, Math.floor(spaceAfterRealRows / rowHeight));
      const targetTotalRows = 8;
      const desiredEmptyRows = Math.max(0, targetTotalRows - filledRows.length);
      const emptyRowsToAdd = Math.min(desiredEmptyRows, maxEmptyRows);

      for (let i = 0; i < emptyRowsToAdd; i++) {
        body.push(["", "", "", "", "", "", "", ""]);
      }

      autoTable(doc, {
        startY: currentY,
        margin: { left: 15, right: 15, top: 15, bottom: 25 },
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
          0: { cellWidth: 267 * 0.12 },
          1: { cellWidth: 267 * 0.32 },
          2: { cellWidth: 267 * 0.05, halign: 'center' },
          3: { cellWidth: 267 * 0.05, halign: 'center' },
          4: { cellWidth: 267 * 0.05, halign: 'center' },
          5: { cellWidth: 267 * 0.07, halign: 'center' },
          6: { cellWidth: 267 * 0.20, halign: 'center' },
          7: { cellWidth: 267 * 0.14, halign: 'center' }
        }
      });

      currentY = (doc as AutoTableDocument).lastAutoTable.finalY + 4;
    });

    // ── 4. Signature Block ──
    const sigHeight = 22;
    if (currentY + sigHeight > 185) {
      doc.addPage();
      currentY = 15;
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
      
      const footerY = 192;
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
