import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { Curriculum } from '../../types/curriculum';
import LoadingSpinner from '../ui/LoadingSpinner';

interface CurriculumHeaderProps {
  curriculum: Curriculum;
  isActivating: boolean;
  canActivate?: boolean;
  onBack: () => void;
  onActivate: () => void;
}

export default function CurriculumHeader({
  curriculum,
  isActivating,
  canActivate = true,
  onBack,
  onActivate,
}: CurriculumHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#4e0a10] transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} />
        Back to Curriculum
      </button>

      {curriculum.status === 'deactivated' && canActivate && (
        <button
          onClick={onActivate}
          disabled={isActivating}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 shadow-sm"
        >
          {isActivating ? <LoadingSpinner size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Activate Curriculum
        </button>
      )}
    </div>
  );
}
