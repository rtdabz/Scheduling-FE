import React from 'react';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import type { Curriculum } from '../../types/curriculum';

interface CurriculumHeaderProps {
  curriculum: Curriculum & { department?: { id: number; department_code: string; department_name: string } };
  overallStats: {
    totalCourses: number;
    totalLec: number;
    totalLab: number;
    totalUnits: number;
  };
  isActivating: boolean;
  canActivate?: boolean;
  onBack: () => void;
  onActivate: () => void;
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-amber-50 text-amber-800 border-amber-200',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

export default function CurriculumHeader({
  curriculum,
  overallStats,
  isActivating,
  canActivate = true,
  onBack,
  onActivate,
}: CurriculumHeaderProps) {
  return (
    <div className="mb-6 space-y-4">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#4e0a10] transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} />
        Back to Curricula
      </button>

      {/* Main Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              <span className="bg-[#C9952A]/10 text-[#C9952A] px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
                {curriculum.code}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                  statusColors[curriculum.status] || statusColors.draft
                }`}
              >
                {curriculum.status}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#1A1410] font-display">{curriculum.name}</h1>
          </div>

          {curriculum.status === 'draft' && canActivate && (
            <button
              onClick={onActivate}
              disabled={isActivating}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
            >
              {isActivating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Activate Curriculum
            </button>
          )}
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50/80 rounded-xl px-3.5 py-2.5 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Department</p>
            <p className="text-xs font-bold text-gray-800">{curriculum.department?.department_code || 'N/A'}</p>
          </div>
          <div className="bg-gray-50/80 rounded-xl px-3.5 py-2.5 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Version</p>
            <p className="text-xs font-bold text-gray-800">{curriculum.curriculum_version || 'N/A'}</p>
          </div>
          <div className="bg-gray-50/80 rounded-xl px-3.5 py-2.5 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Academic Year</p>
            <p className="text-xs font-bold text-gray-800">{curriculum.academic_year || 'N/A'}</p>
          </div>
          <div className="bg-gray-50/80 rounded-xl px-3.5 py-2.5 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Effective Year</p>
            <p className="text-xs font-bold text-gray-800">{curriculum.effective_school_year}</p>
          </div>
        </div>

        {/* Total Stats Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#4e0a10]/5 rounded-xl px-3.5 py-2.5 border border-[#4e0a10]/10">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#4e0a10]/70 mb-0.5">Total Courses</p>
            <p className="text-lg font-black text-[#4e0a10] leading-tight">{overallStats.totalCourses}</p>
          </div>
          <div className="bg-[#C9952A]/5 rounded-xl px-3.5 py-2.5 border border-[#C9952A]/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#C9952A]/80 mb-0.5">Lecture Units</p>
            <p className="text-lg font-black text-[#C9952A] leading-tight">{overallStats.totalLec}</p>
          </div>
          <div className="bg-purple-50/70 rounded-xl px-3.5 py-2.5 border border-purple-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mb-0.5">Lab Units</p>
            <p className="text-lg font-black text-purple-700 leading-tight">{overallStats.totalLab}</p>
          </div>
          <div className="bg-emerald-50/70 rounded-xl px-3.5 py-2.5 border border-emerald-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Total Units</p>
            <p className="text-lg font-black text-emerald-700 leading-tight">{overallStats.totalUnits}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
