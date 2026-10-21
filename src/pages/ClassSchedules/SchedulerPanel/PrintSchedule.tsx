import { useEffect } from "react";
import type { ApiDepartmentRecord, ScheduleItem, Section, Semester, UserSummary } from "./types";
import { buildSchedulePdf, getSchedulePdfFilename } from "./schedulePdf";
import { openPdfPreview } from "../../../lib/pdfPreview";
import { useToast } from "../../../context/ToastContext";

interface PrintScheduleProps {
  sections: Section[];
  isPrintModalOpen: boolean;
  setIsPrintModalOpen: (value: boolean) => void;
  allSchedules: ScheduleItem[];
  selectedSectionId: string;
  departments: ApiDepartmentRecord[];
  users: UserSummary[];
  activeSemester: Semester | null;
  printAllSections?: boolean;
}

export default function PrintSchedule({
  sections,
  isPrintModalOpen,
  setIsPrintModalOpen,
  allSchedules,
  selectedSectionId,
  departments,
  users,
  activeSemester,
  printAllSections = false,
}: PrintScheduleProps) {
  const { toast } = useToast();
  useEffect(() => {
    if (isPrintModalOpen) {
      const preview = openPdfPreview();
      const input = {
        sections,
        allSchedules,
        selectedSectionId,
        departments,
        users,
        activeSemester,
        printAllSections,
      };
      void buildSchedulePdf(input).then(async (blob) => {
        await preview.show(blob, getSchedulePdfFilename(input));
      }).catch(() => {
        preview.close();
        toast.error("Print Failed", "Could not generate class schedule PDF.");
      });
      setIsPrintModalOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrintModalOpen, setIsPrintModalOpen]);

  return null;
}
