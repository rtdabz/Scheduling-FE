import { useEffect } from "react";
import type { ApiDepartmentRecord, ScheduleItem, Section, Semester, UserSummary } from "./types";
import { buildSchedulePdf } from "./schedulePdf";

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
  useEffect(() => {
    if (isPrintModalOpen) {
      void buildSchedulePdf({
        sections,
        allSchedules,
        selectedSectionId,
        departments,
        users,
        activeSemester,
        printAllSections,
      }).then((blob) => {
        window.open(URL.createObjectURL(blob), "_blank");
      });
      setIsPrintModalOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrintModalOpen, setIsPrintModalOpen]);

  return null;
}
