import {
  CheckCircle2,
  Users,
  Sparkles,
  CalendarCheck,
  AlertCircle
} from "lucide-react";
import type { ScheduleItem } from "../types";
import Skeleton from "../../../../components/ui/Skeleton";

interface FacultyPanelProps {
  isPhase2Active: boolean;
  currentStatus: ScheduleItem["status"];
  assignedSlotsCount: number;
  totalSlotsCount: number;
  unassignedSlotsCount: number;
  isLoading?: boolean;
}

export default function FacultyPanel({
  isPhase2Active,
  currentStatus,
  assignedSlotsCount,
  totalSlotsCount,
  unassignedSlotsCount,
  isLoading = false
}: FacultyPanelProps) {
  if (!isPhase2Active || currentStatus === "approved") return null;

  const isComplete = totalSlotsCount > 0 && unassignedSlotsCount === 0;

  return (
    <div className="w-full lg:w-1/4 min-w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full font-sans select-none">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#4e0a10]/10 rounded-lg">
            <Users className="w-4 h-4 text-[#4e0a10]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">Faculty Assignment</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Managed via Timetable Grid
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar & Stats */}
      <div className="p-4 border-b border-slate-100 bg-[#4e0a10]/5 shrink-0">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-[#4e0a10]">Assignment Progress</span>
          <span className="text-xs font-bold text-slate-600">
            {assignedSlotsCount} of {totalSlotsCount} slots
          </span>
        </div>
        <div
          className="flex w-full gap-0.5 h-2 rounded-full overflow-hidden mt-2"
          aria-label={`${assignedSlotsCount} of ${totalSlotsCount} slots assigned`}
        >
          {Array.from({ length: Math.max(1, totalSlotsCount) }).map((_, index) => (
            <span
              key={`assignment-progress-${index}`}
              className={`h-full flex-1 first:rounded-l-full last:rounded-r-full ${index < assignedSlotsCount ? "bg-emerald-600" : "bg-slate-200"
                }`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200/80 rounded-xl">
            <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-emerald-800 uppercase block leading-none">Assigned</span>
              <span className="text-sm font-extrabold text-emerald-900">{assignedSlotsCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200/80 rounded-xl">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-amber-800 uppercase block leading-none">Pending</span>
              <span className="text-sm font-extrabold text-amber-900">{unassignedSlotsCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Guidance Overview & Status Card */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : isComplete ? (
          <div className="flex flex-col items-center justify-center text-center p-5 bg-emerald-50/80 border border-emerald-200 rounded-2xl">
            <div className="p-3 bg-emerald-100 rounded-full mb-3 text-emerald-700">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-emerald-900">All Instructors Assigned</h3>
            <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
              Every course slot in this section has been assigned to an instructor. You are ready to review and submit the schedule!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Assignment Guidelines</span>
              </div>
              <ul className="text-[11px] text-slate-500 space-y-1.5 pl-5 list-disc leading-tight">
                <li>Conflict-free instructors are highlighted automatically.</li>
                <li>Faculty with schedule overlaps will display conflict warnings.</li>
                <li>Click any assigned card on the grid to change or remove the instructor.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
