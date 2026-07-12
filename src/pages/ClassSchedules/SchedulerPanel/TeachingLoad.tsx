import React, { useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RowInput } from "jspdf-autotable";
import tccLogo from "../../../assets/logo.jpg";
import municipalLogo from "../../../assets/municipal-logo.png";
import type { ScheduleItem, Subject, Faculty, Section } from "./types";

interface TeachingLoadProps {
  faculties: Faculty[];
  allSchedules: ScheduleItem[];
  subjects: Subject[];
  isTeachingLoadOpen: boolean;
  setIsTeachingLoadOpen: (value: boolean) => void;
  sections: Section[];
  activeTerm: any;
  users: any[];
  departments: any[];
  selectedSectionId: string;
}

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

export default function TeachingLoad({
  faculties,
  allSchedules,
  subjects,
  isTeachingLoadOpen,
  setIsTeachingLoadOpen,
  sections,
  activeTerm,
  users,
  departments,
  selectedSectionId,
}: TeachingLoadProps) {

  useEffect(() => {
    if (isTeachingLoadOpen) {
      handlePrint();
      setIsTeachingLoadOpen(false);
    }
  }, [isTeachingLoadOpen]);

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

  const getFacultyScheduleClassification = (
    scheduleId: string,
    facultySchedules: ScheduleItem[],
    maxUnits: number
  ): "Basic" | "Overload" => {
    const sorted = [...facultySchedules].sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.startSlot - b.startSlot;
    });

    let accumulatedUnits = 0;
    let classification: "Basic" | "Overload" = "Basic";

    for (const s of sorted) {
      const sub = subjects.find((sub) => sub.id === s.subjectId);
      const units = sub ? sub.units : 3;
      if (accumulatedUnits + units <= maxUnits) {
        accumulatedUnits += units;
        if (s.id === scheduleId) {
          classification = "Basic";
          break;
        }
      } else {
        if (s.id === scheduleId) {
          classification = "Overload";
          break;
        }
      }
    }
    return classification;
  };

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
    const userJson = localStorage.getItem("user") || sessionStorage.getItem("user");
    const user = userJson ? JSON.parse(userJson) : null;
    const isVpaa = user?.role?.toLowerCase() === "vpaa";
    const userDeptId = user?.department_id;

    let targetDeptId: number | null = null;
    if (!isVpaa && userDeptId) {
      targetDeptId = Number(userDeptId);
    } else if (selectedSectionId) {
      const activeSection = sections.find((s) => s.id === selectedSectionId);
      if (activeSection?.departmentId) {
        targetDeptId = Number(activeSection.departmentId);
      }
    }

    const targetFaculties = faculties.filter((f) => {
      const matchesDept = !targetDeptId || Number(f.departmentId) === Number(targetDeptId);
      const hasSchedules = allSchedules.some((s) => s.facultyId === f.id);
      return matchesDept && hasSchedules;
    });

    if (targetFaculties.length === 0) {
      alert("No faculty members with assigned schedules found in this department.");
      return;
    }

    const doc = new jsPDF({ orientation: "portrait", format: "a4" });

    targetFaculties.forEach((faculty, idx) => {
      if (idx > 0) {
        doc.addPage();
      }

      const { surname, givenName, mi } = parseFacultyName(faculty.name);
      const facultyDeptId = faculty.departmentId;
      const dept = departments.find((d) => Number(d.id) === Number(facultyDeptId)) || {
        department_name: faculty.departmentName || "COLLEGE OF INFORMATION TECHNOLOGY",
        department_code: faculty.departmentCode || "CIT",
      };
      const deptName = dept.department_name.toUpperCase();

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
      doc.setTextColor(123, 12, 23);
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

      doc.setFillColor(123, 12, 23);
      doc.rect(leftMargin, 37.5, 190, 6, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(deptName, centerMargin, 41.5, { align: "center" });

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(26, 54, 93);
      doc.text("INDIVIDUAL FACULTY LOAD SHEET", centerMargin, 49, { align: "center" });

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);

      const activeSem = activeTerm?.semester || "2nd";
      const activeAY = activeTerm?.academic_year || "2025-2026";
      const semLabel = activeSem === "1st" ? "1ST Semester" : activeSem === "2nd" ? "2ND Semester" : "Summer";

      doc.text(`${semLabel} Academic Year`, centerMargin - 15, 54.5, { align: "right" });
      doc.text(activeAY, centerMargin + 10, 54.5);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.line(centerMargin - 58, 55, centerMargin - 48, 55);
      doc.line(centerMargin + 8, 55, centerMargin + 35, 55);

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

      doc.setFont("Helvetica", "bold");
      doc.text("Employment Status: (Put X)", leftMargin, 67.5);

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

      const empStatus = faculty.employmentType === "part-time" ? "Part-Time" : "Regular";
      drawCheckbox(40, 69.5, "Regular", empStatus === "Regular");
      drawCheckbox(40, 74.5, "Probationary", false);
      drawCheckbox(145, 69.5, "Contractual", false);
      drawCheckbox(145, 74.5, "Part-Time", empStatus === "Part-Time");

      const facultySchedules = allSchedules.filter((s) => s.facultyId === faculty.id);

      const getTableData = (type: "Basic" | "Overload") => {
        const filtered = facultySchedules.filter((s) => {
          const isPt = faculty.employmentType === "part-time";
          if (isPt) {
            return type === "Overload";
          }
          return getFacultyScheduleClassification(s.id, facultySchedules, faculty.maxUnits || 15) === type;
        });

        const rows = filtered.map((s) => {
          const sub = subjects.find((sub) => sub.id === s.subjectId);
          const hours = Math.max(1, s.durationSlots) * 0.5;
          const lec = sub ? sub.lectureHours : 3;
          const lab = sub ? sub.labHours : 0;
          const totalU = sub ? sub.units : 3;

          const section = sections.find((sec) => sec.id === s.sectionId);
          const studentsCount = section?.numberOfStudents ?? 0;

          return {
            code: s.subjectCode,
            title: s.subjectName,
            day: s.day.substring(0, 3),
            time: `${s.startTime} - ${s.endTime}`,
            section: s.sectionName,
            students: studentsCount > 0 ? studentsCount.toString() : "0",
            lec: lec.toString(),
            lab: lab.toString(),
            totalUnits: totalU.toString(),
            totalHours: hours.toFixed(1)
          };
        });

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
        const filtered = facultySchedules.filter((s) => {
          const isPt = faculty.employmentType === "part-time";
          if (isPt) {
            return type === "Overload";
          }
          return getFacultyScheduleClassification(s.id, facultySchedules, faculty.maxUnits || 15) === type;
        });

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

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`TOTAL NUMBER OF UNITS / HRS (OVERLOAD)`, rightMargin - 45, currentY + 2.5, { align: "right" });
      doc.text(`${overloadTotals.units}`, rightMargin - 15, currentY + 2.5, { align: "center" });
      doc.line(rightMargin - 22, currentY + 3, rightMargin, currentY + 3);

      currentY += 4.5;
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
      doc.text(`1.   —`, leftMargin + 3, currentY + 6);
      doc.line(leftMargin, currentY + 8, rightMargin, currentY + 8);
      doc.text(`2.   —`, leftMargin + 3, currentY + 12.5);
      doc.line(leftMargin, currentY + 14.5, rightMargin, currentY + 14.5);

      currentY += 15.5;

      // ── 5. Signatures Grid Block ──
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.35);

      const deptIdStr = facultyDeptId?.toString();
      const departmentDean = users.find(
        (u) => u.role?.toLowerCase() === "dean" && u.department_id?.toString() === deptIdStr
      );
      const departmentProgramHead = users.find(
        (u) => u.role?.toLowerCase() === "program_head" && u.department_id?.toString() === deptIdStr
      );

      const signatories = {
        preparedBy: departmentProgramHead?.name || "_____________________",
        preparedTitle: "Program Head/Department Secretary",
        verifiedBy: departmentDean?.name || "_____________________",
        verifiedTitle: "College Dean",
        recommendingName: "DR. KHAREN JANE S. UNGAB",
        recommendingTitle: "Vice President for Academic Affairs",
        approvedName: "ATTY. NADYA B. EMANO-ELIPE",
        approvedTitle: "OIC - College President",
      };

      doc.rect(leftMargin, currentY, 190, 18.5);
      doc.line(centerMargin, currentY, centerMargin, currentY + 18.5);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Prepared :", leftMargin + 2, currentY + 3.5);
      doc.text("Verified by:", centerMargin + 2, currentY + 3.5);

      doc.text(signatories.preparedBy, leftMargin + 47.5, currentY + 9, { align: "center" });
      doc.text(signatories.verifiedBy, centerMargin + 47.5, currentY + 9, { align: "center" });

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(signatories.preparedTitle, leftMargin + 47.5, currentY + 12.5, { align: "center" });
      doc.text(signatories.verifiedTitle, centerMargin + 47.5, currentY + 12.5, { align: "center" });

      doc.text("Date Signed: _____________________", leftMargin + 2, currentY + 16);
      doc.text("Date Signed: _____________________", centerMargin + 2, currentY + 16);

      currentY += 21;

      doc.rect(leftMargin, currentY, 190, 18.5);
      doc.line(centerMargin, currentY, centerMargin, currentY + 18.5);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Recommending Approval:", leftMargin + 2, currentY + 3.5);
      doc.text("Approved:", centerMargin + 2, currentY + 3.5);

      doc.text(signatories.recommendingName, leftMargin + 47.5, currentY + 9, { align: "center" });
      doc.text(signatories.approvedName, centerMargin + 47.5, currentY + 9, { align: "center" });

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(signatories.recommendingTitle, leftMargin + 47.5, currentY + 12.5, { align: "center" });
      doc.text(signatories.approvedTitle, centerMargin + 47.5, currentY + 12.5, { align: "center" });

      doc.text("Date Signed: _____________________", leftMargin + 2, currentY + 16);
      doc.text("Date Signed: _____________________", centerMargin + 2, currentY + 16);

      currentY += 21;

      doc.rect(leftMargin, currentY, 95, 14.5);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Received :", leftMargin + 2, currentY + 3.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text("Instructors Name (Signature over Printed Name)", leftMargin + 47.5, currentY + 9, { align: "center" });
      doc.text("Date Signed: _____________________", leftMargin + 2, currentY + 12.5);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("Reminder:", leftMargin, 281.5);
      doc.setFont("Helvetica", "italic");
      doc.text("Submit corrected teaching load when there is/are changes.", leftMargin + 14, 281.5);

      doc.setFillColor(123, 12, 23);
      doc.rect(leftMargin, 283.5, 190, 1, "F");

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(85, 85, 85);
      doc.text("Document No.\nTCC-VPAA-001", leftMargin, 289);
      doc.text("Revision No.\n001", leftMargin + 22, 289);
    });

    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

  return null;
}
