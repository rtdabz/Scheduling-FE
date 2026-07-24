import React from 'react';
import { Eye, Pencil, Copy, CheckCircle2, Archive, BookOpen } from 'lucide-react';
import type { Curriculum } from '../../types/curriculum';

interface CurriculumCardProps {
  curriculum: Curriculum;
  canEdit?: boolean;
  onView: (id: number) => void;
  onEdit: (curriculum: Curriculum) => void;
  onDuplicate: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onArchive: (id: number) => void;
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

const statusDots: Record<string, string> = {
  active: 'bg-emerald-500',
  draft: 'bg-gray-400',
  archived: 'bg-red-400',
};

export default function CurriculumCard({
  curriculum,
  canEdit = true,
  onView,
  onEdit,
  onDuplicate,
  onStatusChange,
  onArchive,
}: CurriculumCardProps) {
  const handleStatusToggle = () => {
    const newStatus = curriculum.status === 'active' ? 'draft' : 'active';
    onStatusChange(curriculum.id, newStatus);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[280px]">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[#1A1410] font-display truncate">{curriculum.name}</h3>
            <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border border-[#C9952A]/20 inline-block mt-1">
              {curriculum.code}
            </span>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${statusColors[curriculum.status] || statusColors.draft}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusDots[curriculum.status] || statusDots.draft}`}></span>
            {curriculum.status}
          </span>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Department</p>
            <p className="text-xs font-semibold text-gray-700 truncate">{curriculum.department?.department_code || 'N/A'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Version</p>
            <p className="text-xs font-semibold text-gray-700">{curriculum.curriculum_version || 'N/A'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Academic Year</p>
            <p className="text-xs font-semibold text-gray-700">{curriculum.academic_year || 'N/A'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Effective Year</p>
            <p className="text-xs font-semibold text-gray-700">{curriculum.effective_school_year}</p>
          </div>
        </div>

        {/* Courses Count */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl mb-3">
          <BookOpen size={14} className="text-[#C9952A]" />
          <span className="text-xs font-bold text-gray-700">{curriculum.courses_count} Courses</span>
        </div>

        {/* Description */}
        {curriculum.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{curriculum.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 flex-wrap">
        <button
          onClick={() => onView(curriculum.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
        >
          <Eye size={14} />
          View
        </button>

        {canEdit && (
          <>
            <button
              onClick={() => onEdit(curriculum)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              onClick={() => onDuplicate(curriculum.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
            >
              <Copy size={14} />
              Duplicate
            </button>
            {curriculum.status !== 'archived' && (
              <>
                <button
                  onClick={handleStatusToggle}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    curriculum.status === 'active'
                      ? 'text-gray-600 hover:bg-gray-100'
                      : 'text-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 size={14} />
                  {curriculum.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => onArchive(curriculum.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Archive size={14} />
                  Archive
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
