import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, CheckCircle2, Lock, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useToast } from '../../context/ToastContext';
import Skeleton from './Skeleton';
import api from '../../lib/api';

interface DepartmentScheduleStatusProps {
  departmentId: number;
}

const STAGE_LABELS = ['Draft', 'Done', 'Submitted', 'Dean approved', 'VPAA approved'];

export default function DepartmentScheduleStatus({ departmentId }: DepartmentScheduleStatusProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    stageCounts,
    yearLevels,
    draftedCount,
    totalSections,
    draftingProgress,
    canSubmit,
    loading,
    error,
    refetch,
  } = useDepartmentScheduleStatus(departmentId);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const stageCountValues = [
    stageCounts.draft,
    stageCounts.completed,
    stageCounts.submitted,
    stageCounts.approved_by_dean,
    stageCounts.approved,
  ];

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post(`/departments/${departmentId}/submit-schedules`);
      toast.success('Submitted', 'All department schedules sent to dean for approval.');
      refetch();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      const msg = apiErr?.response?.data?.message || 'Failed to submit schedules.';
      toast.error('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-6 w-36 rounded-full" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex justify-between gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-1 space-y-2 flex flex-col items-center">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-8" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-4 border-t border-gray-100">
          <Skeleton className="h-3 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
        <div className="flex justify-end border-t border-gray-100 pt-4">
          <Skeleton className="h-11 w-52 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-3 text-red-600">
        <AlertTriangle size={18} />
        <span className="text-sm font-semibold">{error}</span>
      </div>
    );
  }

  const pendingYearLabels = yearLevels
    .filter(yl => !yl.isComplete)
    .map(yl => yl.label);

  const hintText = canSubmit
    ? 'All year levels drafted. Ready to submit for dean approval.'
    : `Finish drafting ${pendingYearLabels.join(', ')} before submitting.`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <LayoutGrid className="w-5 h-5 text-[#4e0a10]" />
          <div>
            <h2 className="text-lg font-bold text-gray-800 leading-none">Department schedule status</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {draftedCount}/{totalSections} sections drafted across {yearLevels.length} year levels
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-[#4e0a10] bg-[#4e0a10]/5 px-3 py-1 rounded-full uppercase tracking-wider border border-[#4e0a10]/10">
          Department Level
        </span>
      </div>

      {/* Drafting Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-gray-500 font-semibold mb-1.5">
          <span>Drafting progress</span>
          <span>{draftingProgress}%</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#4e0a10] rounded-full transition-all duration-700"
            style={{ width: `${draftingProgress}%` }}
          />
        </div>
      </div>

      {/* 4-Stage Count Cards */}
      <div className="relative flex flex-col sm:flex-row gap-4 sm:gap-3 mb-8">
        {/* Visual connector — desktop only */}
        <div className="hidden sm:block absolute left-[14%] right-[14%] top-6 h-0.5 bg-gray-100 z-0 rounded-full" />

        {STAGE_LABELS.map((label, idx) => {
          const count = stageCountValues[idx];
          const isActive = count > 0;
          const isFirst = idx === 0;
          return (
            <div
              key={label}
              className={`relative z-10 flex-1 flex flex-col items-center gap-1.5 p-4 rounded-2xl border transition-all duration-200 ${
                isFirst && isActive
                  ? 'bg-white border-[#4e0a10]/20 shadow-sm'
                  : isActive
                  ? 'bg-gray-50 border-gray-200'
                  : 'bg-gray-50/50 border-gray-100'
              }`}
            >
              {/* Stage icon node */}
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                  isFirst && isActive
                    ? 'bg-[#4e0a10] text-white shadow-md shadow-[#4e0a10]/20'
                    : isActive
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-gray-100 text-gray-300'
                }`}
              >
                {!isFirst && (
                  <Lock
                    size={16}
                    className={isActive ? 'text-amber-400' : 'text-gray-300'}
                  />
                )}
                {isFirst && <span>{idx + 1}</span>}
              </div>

              <span className={`text-xs font-semibold text-center leading-tight ${isActive ? 'text-gray-700' : 'text-gray-400'}`}>
                {label}
              </span>
              <span className={`text-3xl font-black leading-none ${isActive ? (isFirst ? 'text-[#4e0a10]' : 'text-gray-500') : 'text-gray-200'}`}>
                {count}
              </span>
              <span className="text-[10px] text-gray-400 font-medium">sections</span>
            </div>
          );
        })}
      </div>

      {/* Year Level Completion Checklist */}
      <div className="mb-6">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Year Level Completion
        </p>
        <div className="space-y-2">
          {yearLevels.map(yl => (
            <div
              key={yl.year_level}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                yl.isComplete
                  ? 'bg-emerald-50 border-emerald-100'
                  : 'bg-gray-50 border-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                {yl.isComplete ? (
                  <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-300 flex-shrink-0" />
                )}
                <span className={`text-sm font-bold ${yl.isComplete ? 'text-gray-800' : 'text-gray-600'}`}>
                  {yl.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 font-medium">
                  {yl.drafted}/{yl.total} drafted
                </span>
                {!yl.isComplete && (
                  <button
                    onClick={() => navigate('/secretary/schedules')}
                    className="text-[10px] font-bold text-[#4e0a10] bg-[#4e0a10]/5 hover:bg-[#4e0a10]/10 border border-[#4e0a10]/10 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    Continue drafting
                  </button>
                )}
              </div>
            </div>
          ))}

          {yearLevels.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">
              No active sections found for this department.
            </p>
          )}
        </div>
      </div>

      {/* Footer — hint + submit button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-gray-100 pt-6">
        <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
          {hintText}
        </p>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className={`inline-flex items-center justify-center gap-2 px-6 h-11 rounded-xl text-sm font-semibold transition-all ${
            canSubmit && !isSubmitting
              ? 'bg-[#4e0a10] hover:bg-[#3d080c] text-white shadow-md shadow-[#4e0a10]/15 hover:shadow-lg active:scale-[0.98]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Submit for dean approval
            </>
          ) : (
            <>
              Submit for dean approval
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
