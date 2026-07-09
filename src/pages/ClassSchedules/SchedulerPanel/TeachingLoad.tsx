import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RowInput } from "jspdf-autotable";
import { FileText, X, Printer } from "lucide-react";
import tccLogo from "../../../assets/logo.jpg";
import municipalLogo from "../../../assets/municipal-logo.png";
import type { ScheduleItem, Subject, Faculty } from "./types";

interface TeachingLoadProps {
  faculties: Faculty[];
  allSchedules: ScheduleItem[];
  subjects: Subject[];
  isTeachingLoadOpen: boolean;
  setIsTeachingLoadOpen: (value: boolean) => void;
}

const DEPARTMENTS = [
  { code: "CAS", name: "COLLEGE OF ARTS AND SCIENCES" },
  { code: "CIT", name: "COLLEGE OF INFORMATION TECHNOLOGY" },
  { code: "CED", name: "COLLEGE OF EDUCATION" },
  { code: "CBA", name: "COLLEGE OF BUSINESS ADMINISTRATION" },
  { code: "CHM", name: "COLLEGE OF HOSPITALITY MANAGEMENT" },
  { code: "CLIS", name: "COLLEGE OF LIBRARY AND INFORMATION SCIENCE" },
  { code: "CCJPS", name: "COLLEGE OF CRIMINAL JUSTICE AND PUBLIC SAFETY" }
];

export default function TeachingLoad({
  faculties,
  allSchedules,
  subjects,
  isTeachingLoadOpen,
  setIsTeachingLoadOpen,
}: TeachingLoadProps) {
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("");
  const [employmentStatus, setEmploymentStatus] = useState<"Regular" | "Probationary" | "Contractual" | "Part-Time">("Regular");
  const [selectedDeptCode, setSelectedDeptCode] = useState<string>("CIT");
  const [designation1, setDesignation1] = useState<string>("");
  const [designation2, setDesignation2] = useState<string>("");
  const [schedulesClassification, setSchedulesClassification] = useState<Record<string, "Basic" | "Overload">>({});

  // Get active schedules for the selected faculty
  const facultySchedules = selectedFacultyId
    ? allSchedules.filter((s) => s.facultyId === selectedFacultyId)
    : [];

  // Update load classification map when selected faculty or their schedules change
  useEffect(() => {
    const newClassifications: Record<string, "Basic" | "Overload"> = {};
    facultySchedules.forEach((s) => {
      // Default regular/probationary to first 5 items as Basic, others as Overload (just a baseline default)
      newClassifications[s.id] = schedulesClassification[s.id] || "Basic";
    });
    setSchedulesClassification(newClassifications);
  }, [selectedFacultyId, allSchedules]);

  if (!isTeachingLoadOpen) return null;

  // Signatories matching image reference
  const SIGNATORIES = {
    preparedLabel: "Prepared :",
    preparedTitle: "Program Head/Department Secretary",
    verifiedLabel: "Verified by:",
    verifiedTitle: "College Dean",
    recommendingLabel: "Recommending Approval:",
    recommendingName: "DR. KHAREN JANE S. UNGAB",
    recommendingTitle: "Vice President for Academic Affairs",
    approvedLabel: "Approved:",
    approvedName: "ATTY. NADYA B. EMANO-ELIPE",
    approvedTitle: "OIC - College President",
  };

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

  const handlePrint = () => {
    if (!selectedFacultyId) return;

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
        setIsTeachingLoadOpen(false);
      });
  };

  const parseFacultyName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    let surname = "";
    let givenName = "";
    let mi = "";

    if (parts.length > 0) {
      surname = parts[parts.length - 1];
      if (parts.length > 1) {
        const secondToLast = parts[parts.length - 2];
        const hasPeriod = secondToLast.endsWith(".");
        const isShort = secondToLast.length <= 2;
        if (hasPeriod || isShort) {
          mi = secondToLast;
          givenName = parts.slice(0, parts.length - 2).join(" ");
        } else {
          givenName = parts.slice(0, parts.length - 1).join(" ");
        }
      }
    }
    return { surname, givenName, mi };
  };

  const generatePdf = (logoImg: HTMLImageElement | null, muniImg: HTMLImageElement | null) => {
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    const faculty = faculties.find((f) => f.id === selectedFacultyId);
    if (!faculty) return;

    const { surname, givenName, mi } = parseFacultyName(faculty.name);
    const dept = DEPARTMENTS.find((d) => d.code === selectedDeptCode) || DEPARTMENTS[1];

    // Page Width: 210mm, Height: 297mm. Margin: 10mm. Printable Width: 190mm.
    const leftMargin = 10;
    const rightMargin = 200;
    const centerMargin = 105;

    // ── 1. Letterhead ──
    let logoWidth = 16;
    let logoHeight = 16;
    if (logoImg) {
      const ar = logoImg.naturalWidth / logoImg.naturalHeight;
      if (ar > 1) logoWidth = 16 * ar;
      else logoHeight = 16 / ar;
      doc.addImage(logoImg, "JPEG", 16, 8, logoWidth, logoHeight);
    }

    let muniWidth = 18;
    let muniHeight = 18;
    if (muniImg) {
      const ar = muniImg.naturalWidth / muniImg.naturalHeight;
      if (ar > 1) muniWidth = 18 * ar;
      else muniHeight = 18 / ar;
      doc.addImage(muniImg, "PNG", rightMargin - muniWidth - 6, 7, muniWidth, muniHeight);
    }

    doc.setFont("Times", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(85, 85, 85);
    doc.text("Republic of the Philippines", centerMargin, 10, { align: "center" });
    doc.text("Province of Misamis Oriental", centerMargin, 13, { align: "center" });

    doc.setFont("Times", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text("Municipality of Tagoloan", centerMargin, 16, { align: "center" });

    doc.setFont("Times", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(123, 12, 23); // #7b0c17
    doc.text("TAGOLOAN COMMUNITY COLLEGE", centerMargin, 20.5, { align: "center" });

    doc.setFont("Times", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 51, 51);
    doc.text("Baluarte, Tagoloan, Misamis Oriental", centerMargin, 24.5, { align: "center" });

    doc.setFont("Times", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(26, 86, 219);
    doc.text("tccadmin@tcc.edu.ph", centerMargin, 28, { align: "center" });

    const linkWidth = doc.getTextWidth("tccadmin@tcc.edu.ph");
    doc.setDrawColor(26, 86, 219);
    doc.setLineWidth(0.15);
    doc.line(centerMargin - linkWidth / 2, 28.5, centerMargin + linkWidth / 2, 28.5);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(85, 85, 85);
    doc.text("Member: Association of Local Colleges & Universities (ALCU)", centerMargin, 31.5, { align: "center" });

    const accreditationText = "Member: Association of Local Colleges & Universities Commission on Accreditation (ALCU-COA)";
    doc.text(accreditationText, centerMargin, 34.5, { align: "center" });

    const accreditationWidth = doc.getTextWidth(accreditationText);
    const memberTextWidth = doc.getTextWidth("Member: ");
    const underlineW = accreditationWidth - memberTextWidth;
    const underlineX = centerMargin - accreditationWidth / 2 + memberTextWidth;
    doc.setDrawColor(85, 85, 85);
    doc.setLineWidth(0.15);
    doc.line(underlineX, 35, underlineX + underlineW, 35);

    // Maroon accent bar matching CIT header
    doc.setFillColor(123, 12, 23);
    doc.rect(leftMargin, 37.5, 190, 6, "F");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(dept.name, centerMargin, 41.5, { align: "center" });

    // Subheader Titles
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(26, 54, 93); // Dark slate blue
    doc.text("INDIVIDUAL FACULTY LOAD SHEET", centerMargin, 49, { align: "center" });

    // AY Lines
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    // Semester and AY text with lines
    doc.text("1ST Semester Academic Year", centerMargin - 15, 54.5, { align: "right" });
    doc.text("2025-2026", centerMargin + 10, 54.5);
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    // Draw line under semester
    doc.line(centerMargin - 58, 55, centerMargin - 48, 55);
    // Draw line under year
    doc.line(centerMargin + 8, 55, centerMargin + 35, 55);

    // Surname, Given Name, M.I. Row
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Surname:", leftMargin, 61);
    doc.setFont("Helvetica", "normal");
    doc.text(surname.toUpperCase(), leftMargin + 15, 61);
    doc.line(leftMargin + 14, 61.5, leftMargin + 65, 61.5);

    doc.setFont("Helvetica", "bold");
    doc.text("Given Name:", leftMargin + 70, 61);
    doc.setFont("Helvetica", "normal");
    doc.text(givenName, leftMargin + 90, 61);
    doc.line(leftMargin + 89, 61.5, leftMargin + 150, 61.5);

    doc.setFont("Helvetica", "bold");
    doc.text("C _ MI:", leftMargin + 155, 61);
    doc.setFont("Helvetica", "normal");
    doc.text(mi, leftMargin + 167, 61);
    doc.line(leftMargin + 166, 61.5, rightMargin, 61.5);

    // Employment Status Row
    doc.setFont("Helvetica", "bold");
    doc.text("Employment Status: (Put X)", leftMargin, 67.5);

    // Checkboxes
    const boxSize = 3.5;
    const drawCheckbox = (x: number, y: number, label: string, isChecked: boolean) => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.rect(x, y, boxSize, boxSize);
      if (isChecked) {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text("X", x + 0.8, y + 2.8);
      }
      doc.setFont("Helvetica", "semibold");
      doc.setFontSize(8.5);
      doc.text(label, x + 6, y + 2.8);
    };

    drawCheckbox(40, 69.5, "Regular", employmentStatus === "Regular");
    drawCheckbox(40, 74.5, "Probationary", employmentStatus === "Probationary");
    drawCheckbox(145, 69.5, "Contractual", employmentStatus === "Contractual");
    drawCheckbox(145, 74.5, "Part-Time", employmentStatus === "Part-Time");

    // Table mapping helpers
    const getTableData = (type: "Basic" | "Overload") => {
      const filtered = facultySchedules.filter((s) => schedulesClassification[s.id] === type);
      const rows = filtered.map((s) => {
        const sub = subjects.find((sub) => sub.id === s.subjectId);
        const hours = Math.max(1, s.durationSlots) * 0.5;
        const lec = sub ? sub.lectureHours : 3;
        const lab = sub ? sub.labHours : 0;
        const totalU = sub ? sub.units : 3;
        return {
          code: s.subjectCode,
          title: s.subjectName,
          day: s.day.substring(0, 3),
          time: `${s.startTime} - ${s.endTime}`,
          section: s.sectionName,
          students: "45", // Mock average students class size
          lec: lec.toString(),
          lab: lab.toString(),
          totalUnits: totalU.toString(),
          totalHours: hours.toFixed(1)
        };
      });

      // Pad to at least 5 rows
      const targetRows = 5;
      while (rows.length < targetRows) {
        rows.push({
          code: "",
          title: "",
          day: "",
          time: "",
          section: "",
          students: "",
          lec: "",
          lab: "",
          totalUnits: "",
          totalHours: ""
        });
      }
      return rows;
    };

    const calculateTotals = (type: "Basic" | "Overload") => {
      const filtered = facultySchedules.filter((s) => schedulesClassification[s.id] === type);
      let totalUnits = 0;
      let totalHours = 0;
      filtered.forEach((s) => {
        const sub = subjects.find((sub) => sub.id === s.subjectId);
        totalUnits += sub ? sub.units : 3;
        totalHours += Math.max(1, s.durationSlots) * 0.5;
      });
      return { units: totalUnits, hours: totalHours };
    };

    const basicTotals = calculateTotals("Basic");
    const overloadTotals = calculateTotals("Overload");
    const grandTotalUnits = basicTotals.units + overloadTotals.units;
    const grandTotalHours = basicTotals.hours + overloadTotals.hours;

    // Head Columns for both tables
    const tableHeader: RowInput[] = [
      [
        { content: "Subj Code", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: "Descriptive Title", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: "Day", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: "Time", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: "Section", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: "No. of\nStudents", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: "Units", colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: "Total\nUnits", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: "Total\nHours", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } }
      ],
      [
        { content: "(lec)", styles: { halign: 'center', fontStyle: 'bold' } },
        { content: "(lab)", styles: { halign: 'center', fontStyle: 'bold' } }
      ]
    ];

    let currentY = 81.5;

    // ── 2. Table A: Basic Load ──
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text("TEACHING LOAD", centerMargin, currentY + 3.5, { align: "center" });
    
    doc.setFontSize(9);
    doc.text("A. Basic Load/Built-In", leftMargin, currentY + 7.5);

    const tableABody = getTableData("Basic").map((r) => [
      r.code, r.title, r.day, r.time, r.section, r.students, r.lec, r.lab, r.totalUnits, r.totalHours
    ]);

    autoTable(doc, {
      startY: currentY + 8.5,
      margin: { left: leftMargin, right: leftMargin },
      tableWidth: 190,
      theme: 'grid',
      head: tableHeader,
      body: tableABody,
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 1,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        lineWidth: 0.25,
        lineColor: [0, 0, 0]
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 50 },
        2: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 28, halign: 'center' },
        4: { cellWidth: 20 },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 11, halign: 'center' },
        7: { cellWidth: 11, halign: 'center' },
        8: { cellWidth: 11, halign: 'center' },
        9: { cellWidth: 11, halign: 'center' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 1;

    // Total Basic
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(`TOTAL NUMBER OF UNITS/HRS (BASIC) :`, rightMargin - 45, currentY + 3, { align: "right" });
    doc.text(`${basicTotals.units}`, rightMargin - 15, currentY + 3, { align: "center" });
    doc.line(rightMargin - 22, currentY + 3.5, rightMargin, currentY + 3.5);

    currentY += 6.5;

    // ── 3. Table B: Overload Load ──
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.text("B. Overload/Part Time Load", leftMargin, currentY);

    const tableBBody = getTableData("Overload").map((r) => [
      r.code, r.title, r.day, r.time, r.section, r.students, r.lec, r.lab, r.totalUnits, r.totalHours
    ]);

    autoTable(doc, {
      startY: currentY + 1.5,
      margin: { left: leftMargin, right: leftMargin },
      tableWidth: 190,
      theme: 'grid',
      head: tableHeader,
      body: tableBBody,
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 1,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        lineWidth: 0.25,
        lineColor: [0, 0, 0]
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 50 },
        2: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 28, halign: 'center' },
        4: { cellWidth: 20 },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 11, halign: 'center' },
        7: { cellWidth: 11, halign: 'center' },
        8: { cellWidth: 11, halign: 'center' },
        9: { cellWidth: 11, halign: 'center' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 1.5;

    // Total Overload
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`TOTAL NUMBER OF UNITS / HRS (OVERLOAD)`, rightMargin - 45, currentY + 2.5, { align: "right" });
    doc.text(`${overloadTotals.units}`, rightMargin - 15, currentY + 2.5, { align: "center" });
    doc.line(rightMargin - 22, currentY + 3, rightMargin, currentY + 3);

    currentY += 4.5;
    // Grand Total
    doc.text(`GRAND TOTAL NUMBER OF UNITS/HRS`, rightMargin - 45, currentY + 2.5, { align: "right" });
    doc.text(`${grandTotalUnits}`, rightMargin - 15, currentY + 2.5, { align: "center" });
    doc.line(rightMargin - 22, currentY + 3, rightMargin, currentY + 3);

    currentY += 6;

    // ── 4. Section C: Designations ──
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.text("C. Other Designation/Functions", leftMargin, currentY);
    doc.line(leftMargin, currentY + 1.5, rightMargin, currentY + 1.5);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`1.   ${designation1 || "—"}`, leftMargin + 3, currentY + 6);
    doc.line(leftMargin, currentY + 8, rightMargin, currentY + 8);
    doc.text(`2.   ${designation2 || "—"}`, leftMargin + 3, currentY + 12.5);
    doc.line(leftMargin, currentY + 14.5, rightMargin, currentY + 14.5);

    currentY += 15.5;

    // ── 5. Signatures Grid Block ──
    // Prepared vs Verified Box
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    
    // Box 1: Prepared vs Verified
    doc.rect(leftMargin, currentY, 190, 16);
    doc.line(centerMargin, currentY, centerMargin, currentY + 16);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(SIGNATORIES.preparedLabel, leftMargin + 2, currentY + 3.5);
    doc.text(SIGNATORIES.verifiedLabel, centerMargin + 2, currentY + 3.5);
    
    doc.setFontSize(8);
    doc.text(SIGNATORIES.preparedTitle, leftMargin + 35, currentY + 8.5, { align: "center" });
    doc.text(SIGNATORIES.verifiedTitle, centerMargin + 47.5, currentY + 8.5, { align: "center" });
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Date Signed: _____________________", leftMargin + 2, currentY + 13.5);
    doc.text("Date Signed: _____________________", centerMargin + 2, currentY + 13.5);

    currentY += 18.5;

    // Recommending Approval vs Approved Box
    doc.rect(leftMargin, currentY, 190, 18.5);
    doc.line(centerMargin, currentY, centerMargin, currentY + 18.5);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(SIGNATORIES.recommendingLabel, leftMargin + 2, currentY + 3.5);
    doc.text(SIGNATORIES.approvedLabel, centerMargin + 2, currentY + 3.5);

    doc.text(SIGNATORIES.recommendingName, leftMargin + 47.5, currentY + 9, { align: "center" });
    doc.text(SIGNATORIES.approvedName, centerMargin + 47.5, currentY + 9, { align: "center" });

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(SIGNATORIES.recommendingTitle, leftMargin + 47.5, currentY + 12.5, { align: "center" });
    doc.text(SIGNATORIES.approvedTitle, centerMargin + 47.5, currentY + 12.5, { align: "center" });

    doc.text("Date Signed: _____________________", leftMargin + 2, currentY + 16);
    doc.text("Date Signed: _____________________", centerMargin + 2, currentY + 16);

    currentY += 21;

    // Received Box
    doc.rect(leftMargin, currentY, 95, 14.5);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Received :", leftMargin + 2, currentY + 3.5);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Instructors Name (Signature over Printed Name)", leftMargin + 47.5, currentY + 9, { align: "center" });
    doc.text("Date Signed: _____________________", leftMargin + 2, currentY + 12.5);

    // Reminder footer
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Reminder:", leftMargin, 281.5);
    doc.setFont("Helvetica", "italic");
    doc.text("Submit corrected teaching load when there is/are changes.", leftMargin + 14, 281.5);
    
    // Bottom Maroon footer line
    doc.setFillColor(123, 12, 23);
    doc.rect(leftMargin, 283.5, 190, 1, "F");

    // Document control metadata
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(85, 85, 85);
    doc.text("Document No.\nTCC-VPAA-001", leftMargin, 289);
    doc.text("Revision No.\n001", leftMargin + 22, 289);

    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-150 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#4e0a10] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#C9952A]" />
            <h3 className="font-display font-bold text-base tracking-wide">Generate Teaching Load</h3>
          </div>
          <button
            onClick={() => setIsTeachingLoadOpen(false)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Faculty Member Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Faculty Member
            </label>
            <select
              value={selectedFacultyId}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-gray-250 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10] cursor-pointer"
            >
              <option value="">-- Select Instructor --</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Details Row: Status & College */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Employment Status
              </label>
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value as any)}
                className="w-full h-10 px-3 bg-white border border-gray-250 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10] cursor-pointer"
              >
                <option value="Regular">Regular</option>
                <option value="Probationary">Probationary</option>
                <option value="Contractual">Contractual</option>
                <option value="Part-Time">Part-Time</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                College/Department
              </label>
              <select
                value={selectedDeptCode}
                onChange={(e) => setSelectedDeptCode(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-gray-250 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10] cursor-pointer"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Designations */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Other Designations / Functions (Section C)
            </label>
            <input
              type="text"
              placeholder="Designation 1 (e.g. CAS Secretary)"
              value={designation1}
              onChange={(e) => setDesignation1(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-gray-250 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10]"
            />
            <input
              type="text"
              placeholder="Designation 2 (e.g. Extension Coordinator)"
              value={designation2}
              onChange={(e) => setDesignation2(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-gray-250 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10]"
            />
          </div>

          {/* Load Classification Section */}
          {selectedFacultyId && facultySchedules.length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Load Classification ({facultySchedules.length} Slots)
              </label>
              <p className="text-[11px] text-gray-500 leading-snug">
                Select whether each class is Basic/Built-In load or Overload/Part-Time load.
              </p>
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {facultySchedules.map((s) => {
                  const sub = subjects.find((sub) => sub.id === s.subjectId);
                  const currentType = schedulesClassification[s.id] || "Basic";
                  return (
                    <div key={s.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-2.5 bg-gray-50/50">
                      <div className="min-w-0 pr-4">
                        <p className="text-xs font-bold text-gray-800 uppercase truncate">
                          {s.subjectCode} — {s.sectionName}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">{sub?.name}</p>
                        <p className="text-[9px] font-semibold text-gray-400 mt-0.5">
                          {s.day} {s.startTime} - {s.endTime} | {sub ? sub.units : 3} Units
                        </p>
                      </div>
                      <select
                        value={currentType}
                        onChange={(e) =>
                          setSchedulesClassification((prev) => ({
                            ...prev,
                            [s.id]: e.target.value as any
                          }))
                        }
                        className="h-8 px-2 bg-white border border-gray-300 rounded-lg text-[11px] font-bold outline-none focus:border-[#4e0a10] cursor-pointer shrink-0"
                      >
                        <option value="Basic">Basic Load</option>
                        <option value="Overload">Overload</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedFacultyId && facultySchedules.length === 0 && (
            <div className="border-t border-gray-100 pt-3 text-center py-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-bold text-gray-500">No schedules assigned to this faculty member yet.</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Assign subjects on the timetable grid first.</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setIsTeachingLoadOpen(false)}
            className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!selectedFacultyId || facultySchedules.length === 0}
            className="px-4 py-2 bg-[#4e0a10] hover:bg-[#C9952A] disabled:bg-gray-300 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            <Printer size={15} />
            Generate PDF
          </button>
        </div>

      </div>
    </div>
  );
}
