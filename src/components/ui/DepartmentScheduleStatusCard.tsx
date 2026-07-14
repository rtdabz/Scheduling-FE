import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import Skeleton from './Skeleton';

interface DepartmentScheduleStatusCardProps {
  departmentId: number | null | undefined;
}

const DOT_STAGE_COUNT = 4;

export default function DepartmentScheduleStatusCard({ departmentId }: DepartmentScheduleStatusCardProps) {
  const navigate = useNavigate();
  const {
    draftedCount,
    totalSections,
    draftingProgress,
    yearLevels,
    loading,
    error,
  } = useDepartmentScheduleStatus(departmentId);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border-[0.5px] border-gray-200 p-5 space-y-3 animate-pulse min-h-[200px]">
        <div className="flex justify-between items-start">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-7 w-14 rounded-lg" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex gap-2 pt-1">
          {Array.from({ length: DOT_STAGE_COUNT }).map((_, i) => (
            <Skeleton key={i} className="h-2 w-2 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !departmentId) {
    return (
      <div className="bg-white rounded-xl border-[0.5px] border-gray-200 p-5 flex items-center justify-center min-h-[200px]">
        <p className="text-xs text-gray-400 italic text-center">
          {error ?? 'No department assigned.'}
        </p>
      </div>
    );
  }

  // Which dot stages have sections in them (for the mini stepper)
  const dotStatuses = [
    { label: 'Draft',    hasItems: true },
    { label: 'Submitted', hasItems: false },
    { label: 'Dean',     hasItems: false },
    { label: 'VPAA',     hasItems: false },
  ];

  const pendingYears = yearLevels.filter(yl => !yl.isComplete).map(yl => yl.label);
  const pendingText =
    pendingYears.length === 0
      ? 'All year levels drafted'
      : `Pending: ${pendingYears.join(', ')} draft`;

  return (
    <div className="bg-white rounded-xl border-[0.5px] border-gray-200 p-5 flex flex-col gap-3">

      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-800 leading-tight">Schedule status</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {draftedCount}/{totalSections} sections drafted
          </p>
        </div>
        <span className="text-lg font-black text-[#5A1220] leading-none">
          {draftingProgress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#5A1220] rounded-full transition-all duration-700"
          style={{ width: `${draftingProgress}%` }}
        />
      </div>

      {/* Mini dot stepper */}
      <div className="flex items-center gap-2">
        {dotStatuses.map((dot, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                dot.hasItems ? 'bg-[#5A1220]' : 'bg-gray-200'
              }`}
            />
            {idx < dotStatuses.length - 1 && (
              <div className="flex-1 h-px bg-gray-200 w-4" />
            )}
          </div>
        ))}
      </div>

      {/* Status hint */}
      <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
        <p className="text-xs text-gray-500 leading-snug">{pendingText}</p>
      </div>

      {/* View details button */}
      <button
        onClick={() => navigate('/secretary/schedules')}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#5A1220]/5 hover:bg-[#5A1220]/10 text-[#5A1220] text-sm font-bold border border-[#5A1220]/10 transition-colors"
      >
        View details
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
