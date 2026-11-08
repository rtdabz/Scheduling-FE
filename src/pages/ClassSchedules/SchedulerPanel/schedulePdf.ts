import type jsPDF from "jspdf";
import type { RowInput } from "jspdf-autotable";
import tccLogo from "../../../assets/logo.jpg";
import municipalLogo from "../../../assets/municipal-logo.png";
import type { ApiDepartmentRecord, ScheduleItem, ScheduleSignatories, Section, Semester, UserSummary } from "./types";
import { fetchInstitutionSettings, type InstitutionSettings } from "../../../lib/institutionSettings";
import { formatTime12h } from "../../../lib/timeGrid";
import { programName } from "../../../lib/programLabel";
import {
  buildPrintSemesterTitle,
  getFullDayName,
  groupPrintMeetings,
  type PrintMeetingGroup,
} from "./printScheduleFormat";
import { registerSystemPdfFonts } from "./fonts/systemPdfFonts";
import { buildExportFilename } from "../../../lib/exportFile";

export interface SchedulePdfInput {
  sections: Section[];
  allSchedules: ScheduleItem[];
  selectedSectionId: string;
  departments: ApiDepartmentRecord[];
  users: UserSummary[];
  activeSemester: Semester | null;
  printAllSections?: boolean;
  /**
   * The officials recorded for this exact document (a submission or a history entry). When omitted, each
   * printed row signs with the officials recorded on its own submission, and unsigned drafts with the
   * officials in office now.
   */
  signatories?: ScheduleSignatories | null;
}

export const getSchedulePdfFilename = (input: SchedulePdfInput): string => {
  const activeSection = input.sections.find((section) => section.id === input.selectedSectionId);
  const sections = input.activeSemester
    ? input.sections.filter((section) => Number(section.semesterId) === Number(input.activeSemester?.id))
    : input.sections;
  const departmentIds = !input.printAllSections && activeSection
    ? [activeSection.departmentId]
    : [...new Set(sections.map((section) => section.departmentId))];
  const department = departmentIds.length === 1
    ? input.departments.find((entry) => Number(entry.id) === Number(departmentIds[0]))
    : null;
  return buildExportFilename('pdf', 'class-schedule',
    department?.department_code || department?.department_name || (departmentIds.length > 1 ? 'all-departments' : 'department'),
    input.activeSemester?.academic_year, input.activeSemester?.semester);
};

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

const PAGE_TOP_Y = 15;
const PAGE_FOOTER_Y = 192;
const CONTENT_BOTTOM_Y = 185;
const MIN_SECTION_START_SPACE = 28;
// Approvers sign their own slots, so an edit by them never makes them the schedule's preparer.
const APPROVER_ROLES = new Set(["dean", "vpaa", "admin"]);

const PREPARED_TITLE = "Program Head";
const REVIEWED_TITLE = "Dean";
const RECOMMENDED_TITLE = "Vice-President for Academic Affairs";

type SignatorySlot = { name: string; title: string };

/** Distinct names in print order, joined the way the signature block shows shared slots. */
const joinNames = (names: string[], uppercase = true): string =>
  [...new Set(names.map((name) => (uppercase ? name.trim().toUpperCase() : name.trim())).filter(Boolean))].join(" / ");

const slotFrom = (slots: Array<SignatorySlot | null | undefined>, fallbackTitle: string, uppercase = true): SignatorySlot => {
  const present = slots.filter((slot): slot is SignatorySlot => Boolean(slot));
  return { name: joinNames(present.map((slot) => slot.name), uppercase), title: present.find((slot) => slot.title)?.title ?? fallbackTitle };
};

const absoluteAssetUrl = (asset: string): string =>
  asset.startsWith("data:") || asset.startsWith("http:") || asset.startsWith("https:")
    ? asset
    : `${window.location.origin}${asset.startsWith("/") ? "" : "/"}${asset}`;

const loadImgSafe = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });

export async function buildSchedulePdf({
  sections,
  allSchedules,
  selectedSectionId,
  departments,
  users,
  activeSemester,
  printAllSections = false,
  signatories: recordedSignatories = null,
}: SchedulePdfInput): Promise<Blob> {
  const activeSection = sections.find((section) => section.id === selectedSectionId);
  const activeDepartment = departments.find((department) => Number(department.id) === Number(activeSection?.departmentId));
  const departmentId = activeSection?.departmentId?.toString();
  const byRole = (role: string) =>
    users.find((user) => user.role?.toLowerCase() === role && user.department_id?.toString() === departmentId);

  const activeSemesterSections = activeSemester
    ? sections.filter((section) => Number(section.semesterId) === Number(activeSemester.id))
    : sections;
  const unfilteredSections = printAllSections
    ? activeSemesterSections
    : activeSection
    ? activeSemesterSections.filter((section) => section.departmentId === activeSection.departmentId)
    : activeSemesterSections;

  const programSortKey = (section: Section) => (section.programCode ?? section.programName ?? "").toUpperCase();
  const targetSections = [...unfilteredSections].sort((a, b) => {
    const programOrder = programSortKey(a).localeCompare(programSortKey(b));
    if (programOrder !== 0) {
      return programOrder;
    }
    const yearA = Number(a.yearLevel) || 0;
    const yearB = Number(b.yearLevel) || 0;
    if (yearA !== yearB) {
      return yearA - yearB;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  const programTitleOf = (section: Section): string | null => {
    if (section.programId == null) return null;
    return programName(
      { name: section.programName, major: section.programMajor },
      section.programCode ?? "",
    ).toUpperCase() || null;
  };
  const printedProgramIds = Array.from(new Set(targetSections.map((section) => section.programId ?? null)));
  const singleProgramId = printedProgramIds.length === 1 ? printedProgramIds[0] : null;
  const singleProgramTitle = singleProgramId !== null && targetSections[0] ? programTitleOf(targetSections[0]) : null;
  // Signatories of a submitted schedule are the officials recorded by the approval workflow, so replacing
  // an official or renaming their account never rewrites a past schedule. Only rows not yet submitted
  // (drafts, or a recalled schedule back in revision) sign with the officials in office now.
  const usersById = new Map(users.map((user) => [Number(user.id), user]));
  const sectionProgramIds = new Map(targetSections.map((section) => [section.id, section.programId ?? null]));
  const printedSchedules = allSchedules.filter((schedule) => sectionProgramIds.has(schedule.sectionId));
  const recordedFor = (schedule: ScheduleItem): ScheduleSignatories | null => recordedSignatories ?? schedule.signatories ?? null;
  const unsignedSchedules = printedSchedules.filter((schedule) => !recordedFor(schedule));
  const signedSets = recordedSignatories
    ? [recordedSignatories]
    : [...new Set(printedSchedules.map(recordedFor).filter((set): set is ScheduleSignatories => Boolean(set)))];
  // Current officials stand in only when something printed has no recorded signatories.
  const needsCurrentOfficials = signedSets.length === 0 || unsignedSchedules.length > 0;
  // "Prepared by" is whoever entered each printed program's schedule (program head or secretary).
  // Rows with no recorded creator fall back to that program's Program Head.
  const currentPreparersOf = (programId: number | null): string[] => {
    const creators = unsignedSchedules
      .filter((schedule) => sectionProgramIds.get(schedule.sectionId) === programId)
      .map((schedule) => schedule.createdById != null ? usersById.get(Number(schedule.createdById)) : undefined)
      .filter((user) => user && !APPROVER_ROLES.has(user.role?.toLowerCase() ?? ""))
      .map((user) => user?.name?.trim() ?? "");
    if (creators.some(Boolean)) return creators;
    const head = programId === null ? undefined
      : users.find((user) => user.role?.toLowerCase() === "program_head" && Number(user.program_id) === Number(programId));
    return [head?.name?.trim() ?? ""];
  };
  const recordedPreparersOf = (programId: number | null): string[] => signedSets.flatMap((set) => {
    const forProgram = set.prepared.filter((entry) => (entry.program_id ?? null) === programId);
    return (forProgram.length ? forProgram : recordedSignatories ? set.prepared : []).map((entry) => entry.name);
  });
  const preparedByName = joinNames(printedProgramIds.flatMap((programId) => {
    const recorded = recordedPreparersOf(programId);
    const hasUnsigned = unsignedSchedules.some((schedule) => sectionProgramIds.get(schedule.sectionId) === programId);
    return recorded.length && !hasUnsigned ? recorded : [...recorded, ...currentPreparersOf(programId)];
  }));
  const preparedByTitle = signedSets.flatMap((set) => set.prepared).find((entry) => entry.title)?.title ?? PREPARED_TITLE;
  const departmentLogoUrl = activeDepartment?.logo || null;
  const departmentTitle = (() => {
    const name = printAllSections ? "ALL DEPARTMENTS" : (activeDepartment?.department_name?.trim() || "INFORMATION TECHNOLOGY");
    return /^college\s+of\s+/i.test(name) ? name.toUpperCase() : `COLLEGE OF ${name.toUpperCase()}`;
  })();

  const [{ default: PdfDocument }, { default: table }, logoImg, muniImg, departmentImg, settings] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadImgSafe(absoluteAssetUrl(tccLogo)),
    loadImgSafe(absoluteAssetUrl(municipalLogo)),
    departmentLogoUrl ? loadImgSafe(departmentLogoUrl) : Promise.resolve(null),
    needsCurrentOfficials ? fetchInstitutionSettings() : Promise.resolve<InstitutionSettings | null>(null),
  ]);

  const currentDean = byRole("dean")?.name?.trim();
  const currentVpaa = users.find((user) => user.role?.toLowerCase() === "vpaa")?.name?.trim();
  const current = (name: string | null | undefined, title: string): SignatorySlot | null =>
    needsCurrentOfficials && name ? { name, title } : null;
  const reviewed = slotFrom([...signedSets.map((set) => set.reviewed), current(currentDean, REVIEWED_TITLE)], REVIEWED_TITLE);
  const recommended = slotFrom([...signedSets.map((set) => set.recommended), current(currentVpaa, RECOMMENDED_TITLE)], RECOMMENDED_TITLE);
  const approved = slotFrom(
    [...signedSets.map((set) => set.approved), settings ? { name: settings.president_name, title: settings.president_title } : null],
    settings?.president_title ?? "",
    // The President is printed exactly as entered in Document Signatories.
    false,
  );
  const signatories = [
    { label: "Prepared by:", name: preparedByName, role: preparedByTitle },
    { label: "Reviewed by:", name: reviewed.name, role: reviewed.title },
    { label: "Recommended by:", name: recommended.name, role: recommended.title },
    { label: "Approved by:", name: approved.name, role: approved.title },
  ];
  const doc = new PdfDocument({ orientation: "landscape", format: "a4" });
  const { hasSans, hasDisplay } = registerSystemPdfFonts(doc);

  const setFont = (style: "normal" | "bold" | "italic", family: "sans" | "display" = "sans") => {
    const target = family === "display" && hasDisplay
      ? "PlayfairDisplay"
      : hasSans
      ? "DMSans"
      : "Helvetica";
    try {
      doc.setFont(target, style);
    } catch {
      doc.setFont("Helvetica", style);
    }
  };

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

  setFont("normal", "sans");
  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  doc.text("Republic of the Philippines", 148.5, 14, { align: "center" });
  doc.text("Province of Misamis Oriental", 148.5, 17.5, { align: "center" });

  setFont("bold", "sans");
  doc.text("Municipality of Tagoloan", 148.5, 21, { align: "center" });

  setFont("bold", "display");
  doc.setFontSize(13);
  doc.setTextColor(123, 12, 23);
  doc.text("TAGOLOAN COMMUNITY COLLEGE", 148.5, 26.5, { align: "center" });

  setFont("bold", "sans");
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);
  doc.text("Baluarte, Tagoloan, Misamis Oriental", 148.5, 31.5, { align: "center" });

  setFont("italic", "sans");
  doc.setFontSize(10);
  doc.setTextColor(26, 86, 219);
  doc.text("tccadmin@tcc.edu.ph", 148.5, 35.5, { align: "center" });

  const linkWidth = doc.getTextWidth("tccadmin@tcc.edu.ph");
  doc.setDrawColor(26, 86, 219);
  doc.setLineWidth(0.2);
  doc.line(148.5 - linkWidth / 2, 36.2, 148.5 + linkWidth / 2, 36.2);

  setFont("normal", "sans");
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

  doc.setDrawColor(123, 12, 23);
  doc.setLineWidth(0.8);
  doc.line(15, 46, 282, 46);

  let currentY = 49;

  doc.setFillColor(123, 12, 23);
  doc.rect(15, currentY, 267, 7, "F");

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(15, currentY, 15, currentY + 7);
  doc.line(282, currentY, 282, currentY + 7);

  setFont("bold", "display");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setDrawColor(201, 149, 42);
  doc.setLineWidth(0.15);
  doc.text(departmentTitle, 148.5, currentY + 5, { align: "center" });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  currentY += 7;

  if (singleProgramTitle) {
    doc.setFillColor(255, 255, 255);
    doc.rect(15, currentY, 267, 6);
    setFont("bold", "sans");
    doc.setFontSize(10);
    doc.setTextColor(123, 12, 23);
    doc.text(singleProgramTitle, 148.5, currentY + 4.5, { align: "center" });
    currentY += 6;
  }

  doc.setFillColor(255, 255, 255);
  doc.rect(15, currentY, 267, 6);
  setFont("bold", "sans");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(buildPrintSemesterTitle(activeSemester), 148.5, currentY + 4.5, { align: "center" });

  currentY += 6;

  let previousProgramId: number | null | undefined;
  targetSections.forEach((section) => {
    const sectionProgramId = section.programId ?? null;
    const startsProgramGroup = printedProgramIds.length > 1 && sectionProgramId !== previousProgramId;
    previousProgramId = sectionProgramId;

    if (currentY + MIN_SECTION_START_SPACE + (startsProgramGroup ? 6 : 0) > CONTENT_BOTTOM_Y) {
      doc.addPage();
      currentY = PAGE_TOP_Y;
    }

    if (startsProgramGroup) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.setFillColor(123, 12, 23);
      doc.rect(15, currentY, 267, 6, "FD");
      setFont("bold", "sans");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(programTitleOf(section) ?? "NO PROGRAM", 148.5, currentY + 4.5, { align: "center" });
      currentY += 6;
    }

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.setFillColor(255, 255, 255);
    doc.rect(15, currentY, 267, 6);
    setFont("bold", "sans");
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

    const groupsBySubject = new Map<string, PrintMeetingGroup[]>();
    for (const [key, subjectSchedules] of schedulesBySubject) {
      groupsBySubject.set(
        key,
        groupPrintMeetings(subjectSchedules, formatTime12h, getFullDayName),
      );
    }

    const filledRows = sortedSubjects.flatMap((subjectSchedules) => {
      const key = subjectSchedules[0]?.courseId ?? subjectSchedules[0]?.subjectId ?? "";

      return (groupsBySubject.get(key) ?? []).map((group) => ({ key, group }));
    });

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

    const body: RowInput[] = filledRows.map(({ key: itemKey, group }, index) => {
      const item = group.first;
      const isAdditionalMeeting = filledRows[index - 1]?.key === itemKey;
      const subjectMeetingCount = groupsBySubject.get(itemKey)?.length ?? 1;

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
        group.dayLabel,
        group.timeLabel,
        {
          content: group.room,
          styles: { halign: "center" as const, valign: "middle" as const }
        }
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
        font: hasSans ? "DMSans" : "helvetica",
        fontSize: 9,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.4,
        cellPadding: 1.5,
        valign: 'middle',
        overflow: 'ellipsize'
      },
      headStyles: {
        font: hasSans ? "DMSans" : "helvetica",
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

    setFont("normal", "sans");
    doc.setFontSize(8);
    doc.setTextColor(85, 85, 85);
    doc.text(sig.label, colLeft + 4, currentY + 5);

    setFont("bold", "sans");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(sig.name, colCenter, currentY + 13, { align: "center" });

    doc.line(colLeft + 6, currentY + 14.5, colLeft + sigWidth - 6, currentY + 14.5);

    setFont("italic", "sans");
    doc.setFontSize(11);
    doc.setTextColor(68, 68, 68);
    doc.text(sig.role, colCenter, currentY + 18.5, { align: "center" });
  });

  const pageCount = (doc as JsPdfDocumentWithPageInfo).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    const footerY = PAGE_FOOTER_Y;
    doc.setFillColor(123, 12, 23);
    doc.rect(15, footerY, 267, 1.5, "F");

    const tableStartY = footerY + 3.5;
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.rect(15, tableStartY, 48, 8);
    doc.line(15, tableStartY + 4, 15 + 48, tableStartY + 4);
    doc.line(15 + 28, tableStartY, 15 + 28, tableStartY + 8);

    setFont("bold", "sans");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text("Document No.", 15 + 2, tableStartY + 3);
    doc.text("Revision No.", 15 + 28 + 2, tableStartY + 3);

    setFont("normal", "sans");
    doc.setFontSize(8);
    doc.setTextColor(51, 51, 51);
    doc.text("TCC-VPAA-011", 15 + 2, tableStartY + 7);
    doc.text("001", 15 + 28 + 2, tableStartY + 7);

    setFont("italic", "sans");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page No.  ${i} of ${pageCount}`, 282, tableStartY + 5, { align: "right" });
  }

  return doc.output("blob");
}
