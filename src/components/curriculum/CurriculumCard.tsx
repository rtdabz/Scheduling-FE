import { Eye, Pencil, Copy, CheckCircle2, Archive, BookOpen, Users } from 'lucide-react';
import type { Curriculum } from '../../types/curriculum';
import { curriculumLifecycleBadge } from '../../types/curriculum';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';

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
  deactivated: 'bg-slate-200 text-slate-700 border-slate-300',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

const statusDots: Record<string, string> = {
  active: 'bg-emerald-500',
  deactivated: 'bg-slate-500',
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
    // A curriculum is either in service or out of it; there is no third state.
    const newStatus = curriculum.status === 'active' ? 'deactivated' : 'active';
    onStatusChange(curriculum.id, newStatus);
  };

  const lifecycleBadge = curriculumLifecycleBadge(curriculum);
  const inUseBy = curriculum.active_sections_count ?? 0;
  // Retiring a curriculum that cohorts still follow would strand them, so the
  // API refuses it. Reflect that here rather than offering a button that 422s.
  const retirable = inUseBy === 0;

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md flex flex-col justify-between min-h-[280px] relative ${GRID_CARD_HOVER}`}>
      {/* Header */}
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[#1A1410] font-display truncate">{curriculum.name}</h3>
            <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border border-[#C9952A]/20 inline-block mt-1">
              {curriculum.code}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${statusColors[curriculum.status] || statusColors.deactivated}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDots[curriculum.status] || statusDots.deactivated}`}></span>
              {curriculum.status}
            </span>
            {lifecycleBadge && (
              <span
                title="Ranked by effective school year against the other curricula this department runs."
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${lifecycleBadge.className}`}
              >
                {lifecycleBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Department</p>
            <p className="text-xs font-semibold text-gray-700 truncate">{curriculum.department?.department_code || 'N/A'}</p>
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
          {inUseBy > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <Users size={14} className="text-[#C9952A]" />
              <span className="text-xs font-bold text-gray-700">
                {inUseBy} Section{inUseBy === 1 ? '' : 's'}
              </span>
            </>
          )}
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
          title="View curriculum details"
          className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100"
        >
          <Eye size={14} />
          View
        </button>

        {canEdit && (
          <>
            <button
              onClick={() => onEdit(curriculum)}
              title="Edit curriculum information"
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              onClick={() => onDuplicate(curriculum.id)}
              title="Create a deactivated copy of this curriculum"
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Copy size={14} />
              Duplicate
            </button>
            <button
              onClick={handleStatusToggle}
              disabled={curriculum.status === 'active' && !retirable}
              title={
                curriculum.status === 'active'
                  ? retirable
                    ? 'Withdraw this curriculum from service'
                    : `${inUseBy} section${inUseBy === 1 ? '' : 's'} still follow this curriculum. Move them to another curriculum first.`
                  : 'Publish this curriculum. Other active curricula in this department stay active — each year level chooses which one it follows.'
              }
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                curriculum.status === 'active'
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
              }`}
            >
              <CheckCircle2 size={14} />
              {curriculum.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
            {/* Archiving is offered only once a curriculum is out of service.
                Deactivate it first — retiring something the department is still
                running should be a deliberate two-step. */}
            {curriculum.status !== 'active' && (
              <button
                onClick={() => onArchive(curriculum.id)}
                disabled={!retirable}
                title={
                  retirable
                    ? 'Archive this curriculum'
                    : `${inUseBy} section${inUseBy === 1 ? '' : 's'} still follow this curriculum. Move them to another curriculum first.`
                }
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive size={14} />
                Archive
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
