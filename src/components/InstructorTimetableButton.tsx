import React, { useState } from "react";
import { Calendar } from "lucide-react";
import InstructorTimetableModal from "./InstructorTimetableModal";

interface InstructorTimetableButtonProps {
  facultyId: number;
  facultyName: string;
  departmentName?: string;
  variant?: "primary" | "secondary" | "outline" | "link";
  className?: string;
}

export default function InstructorTimetableButton({
  facultyId,
  facultyName,
  departmentName,
  variant = "outline",
  className = "",
}: InstructorTimetableButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getButtonClass = () => {
    switch (variant) {
      case "primary":
        return "bg-[#4e0a10] hover:bg-[#C9952A] text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm";
      case "secondary":
        return "bg-amber-50 text-[#C9952A] hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all";
      case "link":
        return "text-xs font-bold text-[#4e0a10] hover:text-[#C9952A] hover:underline cursor-pointer";
      case "outline":
      default:
        return "px-2.5 py-1.5 border border-gray-200 hover:border-[#C9952A] bg-white hover:bg-amber-50/50 text-gray-700 hover:text-[#4e0a10] rounded-xl text-xs font-bold transition-all shadow-xs";
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center justify-center gap-1.5 cursor-pointer font-sans ${getButtonClass()} ${className}`}
        title="View Schedule"
      >
        <Calendar size={13} className="text-[#C9952A]" />
        <span>View Schedule</span>
      </button>

      <InstructorTimetableModal
        facultyId={facultyId}
        facultyName={facultyName}
        departmentName={departmentName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
