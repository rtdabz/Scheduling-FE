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
  Semester,
  UserSummary,
} from "./types";
import { INSTRUCTOR_ASSIGNED_STATUSES } from "./constants";
import { useToast } from "../../../context/ToastContext";
import { getStoredUserDepartmentId, getStoredUserRole } from "../../../lib/storedUser";
import { fetchInstitutionSettings, type InstitutionSettings } from "../../../lib/institutionSettings";
import { BASIC_LINE_COUNT, classifyLoad } from "./teachingLoadRows";
import { drawSheet } from "./teachingLoadSheet";
import { formPageSize } from "./teachingLoadForm";
import { facultyNameParts } from "./teachingLoadName";

interface TeachingLoadProps {
  faculties: Faculty[];
  allSchedules: ScheduleItem[];
  isTeachingLoadOpen: boolean;
  setIsTeachingLoadOpen: (value: boolean) => void;
  sections: Section[];
  activeSemester: Semester | null;
  users: UserSummary[];
  departments: Department[];
  selectedSectionId: string;
  selectedFacultyId?: string;
}

const PRINT_DEBOUNCE_MS = 1500;
let lastTeachingLoadPrintAt = 0;

const DESIGNATION_LABELS: Record<FacultyAdministrativePost, string> = {
  dean: "Department Dean",
  secretary: "Department Secretary",
  program_head: "Program Head",
  vpaa: "Vice President for Academic Affairs",
};

const semesterLabel = (semester?: string): string => {
  if (!semester) return "";
  if (semester === "1st") return "1ST";
  if (semester === "2nd") return "2ND";
  if (semester === "3rd") return "3RD";
  return semester.toUpperCase();
};

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
  activeSemester,
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

    const vpaaAccount = users.find((u) => u.role?.toLowerCase() === "vpaa");

    let doc: jsPDF | null = null;

    for (const faculty of targetFaculties) {
      const { surname, givenName, middleInitial, fullName } = facultyNameParts(faculty);
      const department = departments.find((d) => Number(d.id) === Number(faculty.departmentId));
      const collegeName = (
        department?.department_name ||
        faculty.departmentName ||
        "INFORMATION TECHNOLOGY"
      )
        .toUpperCase()
        .replace(/^COLLEGE\s+OF\s+/, "");

      const deptId = faculty.departmentId?.toString();
      const byRole = (role: string) =>
        users.find((u) => u.role?.toLowerCase() === role && u.department_id?.toString() === deptId);
      const programHeads = users.filter((u) => u.role?.toLowerCase() === "program_head" && u.department_id?.toString() === deptId);
      const ownProgramHead = faculty.programId == null
        ? undefined
        : programHeads.find((u) => Number(u.program_id) === Number(faculty.programId));
      const preparer = ownProgramHead
        ?? (programHeads.length === 1 ? programHeads[0] : undefined)
        ?? byRole("secretary")
        ?? programHeads[0];

      const load = classifyLoad(faculty, assignedSchedules.filter((s) => s.facultyId === faculty.id));

      const sheetCount = Math.max(1, Math.ceil(load.basic.length / BASIC_LINE_COUNT));

      for (let sheet = 0; sheet < sheetCount; sheet += 1) {
        const overloadLines = sheet === 0 ? load.overload : [];
        const format = formPageSize(overloadLines.length);
        if (doc === null) doc = new PdfDocument({ orientation: "portrait", unit: "mm", format });
        else doc.addPage(format, "portrait");

        drawSheet(doc, {
          logoImg,
          muniImg,
          collegeName,
          semester: semesterLabel(activeSemester?.semester),
          academicYear: activeSemester?.academic_year || "",
          surname,
          givenName,
          middleInitial,
          isPartTime: faculty.employmentType === "part-time",
          designations: faculty.designations?.length
            ? faculty.designations
            : faculty.administrativeRole
              ? [{ label: DESIGNATION_LABELS[faculty.administrativeRole], deloadUnits: faculty.deloadUnits ?? 0 }]
              : [],
          instructorName: fullName,
          preparedBy: preparer?.name ?? "",
          verifiedBy: byRole("dean")?.name ?? "",
          vpaaName: vpaaAccount?.name ?? "",
          presidentName: settings.president_name,
          presidentTitle: settings.president_title,
          load,
          basicLines: load.basic.slice(sheet * BASIC_LINE_COUNT, (sheet + 1) * BASIC_LINE_COUNT),
          overloadLines,
          sheetNumber: sheet + 1,
          sheetCount,
        });
      }
    }

    if (doc === null) return;
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
