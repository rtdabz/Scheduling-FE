import { useEffect, useRef } from "react";
import type jsPDF from "jspdf";
import tccLogo from "../../../assets/logo.jpg";
import municipalLogo from "../../../assets/municipal-logo.png";
import type {
  Department,
  Faculty,
  FacultyAdministrativePost,
  ScheduleItem,
  Section,
  Term,
  UserSummary,
} from "./types";
import { INSTRUCTOR_ASSIGNED_STATUSES } from "./constants";
import { useToast } from "../../../context/ToastContext";
import { getStoredUserDepartmentId, getStoredUserRole } from "../../../lib/storedUser";
import { fetchInstitutionSettings, type InstitutionSettings } from "../../../lib/institutionSettings";
import { BASIC_LINE_COUNT, OVERLOAD_LINE_COUNT, classifyLoad } from "./teachingLoadRows";
import { drawSheet } from "./teachingLoadSheet";

interface TeachingLoadProps {
  faculties: Faculty[];
  allSchedules: ScheduleItem[];
  isTeachingLoadOpen: boolean;
  setIsTeachingLoadOpen: (value: boolean) => void;
  sections: Section[];
  activeTerm: Term | null;
  users: UserSummary[];
  departments: Department[];
  selectedSectionId: string;
  selectedFacultyId?: string;
}

const PRINT_DEBOUNCE_MS = 1500;
let lastTeachingLoadPrintAt = 0;

/**
 * Section C of the form asks for "Other Designation/Functions". The post itself
 * is the designation, so it is printed as written on the appointment rather than
 * as the short badge label the scheduler UI uses.
 */
const DESIGNATION_LABELS: Record<FacultyAdministrativePost, string> = {
  dean: "Department Dean",
  secretary: "Department Secretary",
  program_head: "Program Head",
  vpaa: "Vice President for Academic Affairs",
};

/** Standing VPAA, used only when no account with that role reaches the client. */
const FALLBACK_VPAA_NAME = "DR. KHAREN JANE S. UNGAB";

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

const semesterLabel = (semester?: string): string => {
  if (semester === "1st") return "1ST";
  if (semester === "2nd") return "2ND";
  if (semester === "3rd") return "3RD";
  return (semester || "SUMMER").toUpperCase();
};

/** Absolute URL for a bundled asset, so jsPDF can read it through the DOM. */
const assetUrl = (asset: string): string => {
  if (asset.startsWith("data:") || asset.startsWith("http:") || asset.startsWith("https:")) return asset;
  return `${window.location.origin}${asset.startsWith("/") ? "" : "/"}${asset}`;
};

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });


export default function TeachingLoad({
  faculties,
  allSchedules,
  isTeachingLoadOpen,
  setIsTeachingLoadOpen,
  sections,
  activeTerm,
  users,
  departments,
  selectedSectionId,
  selectedFacultyId,
}: TeachingLoadProps) {
  const { toast } = useToast();
  const isPrintingRef = useRef(false);

  const handlePrint = async () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;

    const { default: JsPDF } = await import("jspdf");

    // fetchInstitutionSettings never rejects, so a signatory lookup failure
    // still prints -- with the standing names.
    Promise.all([
      loadImage(assetUrl(tccLogo)),
      loadImage(assetUrl(municipalLogo)),
      fetchInstitutionSettings(),
    ])
      .then(([logoImg, muniImg, settings]) => generatePdf(JsPDF, logoImg, muniImg, settings))
      .finally(() => {
        isPrintingRef.current = false;
      });
  };

  const generatePdf = (
    PdfDocument: typeof jsPDF,
    logoImg: HTMLImageElement | null,
    muniImg: HTMLImageElement | null,
    settings: InstitutionSettings,
  ) => {
    const isVpaa = getStoredUserRole() === "vpaa";
    const userDeptId = getStoredUserDepartmentId();

    // The printed form is an official record of load, so it lists the same
    // assignments the load figures count: approved ones only. A withdrawn row
    // keeps neither its instructor nor a place on this form.
    const assignedSchedules = allSchedules.filter((s) => INSTRUCTOR_ASSIGNED_STATUSES.includes(s.status));

    let targetDeptId: number | null = null;
    if (!isVpaa && userDeptId) {
      targetDeptId = Number(userDeptId);
    } else if (selectedSectionId) {
      const activeSection = sections.find((s) => s.id === selectedSectionId);
      if (activeSection?.departmentId) targetDeptId = Number(activeSection.departmentId);
    }

    const targetFaculties = faculties.filter((f) => {
      const matchesDept = !targetDeptId || Number(f.departmentId) === Number(targetDeptId);
      const matchesFaculty = !selectedFacultyId || f.id === selectedFacultyId;
      const hasSchedules = assignedSchedules.some((s) => s.facultyId === f.id);
      return matchesDept && matchesFaculty && hasSchedules;
    });

    if (targetFaculties.length === 0) {
      toast.warning(
        "No Teaching Load Available",
        "No faculty members with assigned schedules were found in this department.",
      );
      return;
    }

    // The VPAA signs every department's sheet and holds no department of their
    // own, which is why the payload carries the account alongside the
    // department-scoped ones.
    const vpaaAccount = users.find((u) => u.role?.toLowerCase() === "vpaa");

    const doc = new PdfDocument({ orientation: "portrait", unit: "mm", format: "legal" });
    let isFirstSheet = true;

    targetFaculties.forEach((faculty) => {
      const { surname, givenName, mi } = parseFacultyName(faculty.name);
      const department = departments.find((d) => Number(d.id) === Number(faculty.departmentId));
      const collegeName = (
        department?.department_name ||
        faculty.departmentName ||
        "INFORMATION TECHNOLOGY"
      )
        .toUpperCase()
        // The banner already reads "COLLEGE OF", so a department stored as
        // "College of Information Technology" must not print it twice.
        .replace(/^COLLEGE\s+OF\s+/, "");

      const deptId = faculty.departmentId?.toString();
      const byRole = (role: string) =>
        users.find((u) => u.role?.toLowerCase() === role && u.department_id?.toString() === deptId);
      // The form's line covers both posts, so either may sign it.
      const preparer = byRole("program_head") ?? byRole("secretary");

      const load = classifyLoad(faculty, assignedSchedules.filter((s) => s.facultyId === faculty.id));

      // The blank form holds seven basic and six overload lines. Grouping the
      // meetings by subject keeps almost every instructor on one sheet, but a
      // heavy load still spills onto a continuation sheet rather than losing
      // subjects off the bottom of the table.
      const sheetCount = Math.max(
        1,
        Math.ceil(load.basic.length / BASIC_LINE_COUNT),
        Math.ceil(load.overload.length / OVERLOAD_LINE_COUNT),
      );

      for (let sheet = 0; sheet < sheetCount; sheet += 1) {
        if (!isFirstSheet) doc.addPage();
        isFirstSheet = false;

        drawSheet(doc, {
          logoImg,
          muniImg,
          collegeName,
          semester: semesterLabel(activeTerm?.semester),
          academicYear: activeTerm?.academic_year || "",
          surname: surname.toUpperCase(),
          givenName,
          middleInitial: mi,
          isPartTime: faculty.employmentType === "part-time",
          designation: faculty.administrativeRole ? DESIGNATION_LABELS[faculty.administrativeRole] : "",
          instructorName: faculty.name.toUpperCase(),
          preparedBy: preparer?.name ?? "",
          verifiedBy: byRole("dean")?.name ?? "",
          vpaaName: vpaaAccount?.name ?? FALLBACK_VPAA_NAME,
          presidentName: settings.president_name,
          presidentTitle: settings.president_title,
          load,
          basicLines: load.basic.slice(sheet * BASIC_LINE_COUNT, (sheet + 1) * BASIC_LINE_COUNT),
          overloadLines: load.overload.slice(sheet * OVERLOAD_LINE_COUNT, (sheet + 1) * OVERLOAD_LINE_COUNT),
          sheetNumber: sheet + 1,
          sheetCount,
        });
      }
    });

    const blobUrl = URL.createObjectURL(doc.output("blob"));
    window.open(blobUrl, "_blank");
  };

  useEffect(() => {
    if (isTeachingLoadOpen) {
      const now = Date.now();
      if (now - lastTeachingLoadPrintAt < PRINT_DEBOUNCE_MS) {
        setIsTeachingLoadOpen(false);
        return;
      }

      lastTeachingLoadPrintAt = now;
      handlePrint();
      setIsTeachingLoadOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeachingLoadOpen, setIsTeachingLoadOpen]);

  return null;
}
