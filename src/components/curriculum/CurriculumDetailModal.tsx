import React, { useState, useEffect } from 'react';
import { X, Loader2, BookOpen } from 'lucide-react';
import { curriculumService } from '../../services/curriculum/curriculumService';
import type { CurriculumDetail, CurriculumTerm } from '../../types/curriculum';

interface CurriculumDetailModalProps {
  isOpen: boolean;
  curriculumId: number | null;
  onClose: () => void;
}

const semesterLabels: Record<number, string> = {
  1: '1st Semester',
  2: '2nd Semester',
  3: 'Summer',
};

const yearLabels: Record<number, string> = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
};

export default function CurriculumDetailModal({ isOpen, curriculumId, onClose }: CurriculumDetailModalProps) {
  const [detail, setDetail] = useState<CurriculumDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && curriculumId) {
      setIsLoading(true);
      curriculumService.getCurriculumFull(curriculumId)
        .then(res => setDetail(res))
        .catch(() => setDetail(null))
        .finally(() => setIsLoading(false));
    } else {
      setDetail(null);
    }
  }, [isOpen, curriculumId]);

  if (!isOpen) return null;

  const curriculum = detail?.curriculum;
  const terms = detail?.terms || [];

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    archived: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-bold text-[#1A1410] font-display">Curriculum Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[#C9952A]" />
            </div>
          ) : !curriculum ? (
            <div className="text-center py-12 text-gray-400">
              <p className="font-semibold">Failed to load curriculum details.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-[#1A1410] font-display">{curriculum.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusColors[curriculum.status] || statusColors.draft}`}>
                    {curriculum.status}
                  </span>
                </div>
                <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
                  {curriculum.code}
                </span>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Department</p>
                  <p className="text-sm font-semibold text-gray-800">{curriculum.department?.department_code || 'N/A'}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Version</p>
                  <p className="text-sm font-semibold text-gray-800">{curriculum.curriculum_version || 'N/A'}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Academic Year</p>
                  <p className="text-sm font-semibold text-gray-800">{curriculum.academic_year || 'N/A'}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Effective Year</p>
                  <p className="text-sm font-semibold text-gray-800">{curriculum.effective_school_year}</p>
                </div>
              </div>

              {curriculum.description && (
                <div className="mb-6 bg-white rounded-xl p-4 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-700">{curriculum.description}</p>
                </div>
              )}

              {/* Courses by Year/Semester */}
              <div className="mb-2">
                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <BookOpen size={16} className="text-[#C9952A]" />
                  Course Structure ({curriculum.courses_count} courses)
                </h4>
              </div>

              {terms.length === 0 ? (
                <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-100">
                  <p className="font-semibold">No courses attached to this curriculum.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {terms.map((term: CurriculumTerm) => (
                    <div key={`${term.year_level}-${term.semester}`} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50/75 border-b border-gray-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-700">
                          {yearLabels[term.year_level] || `Year ${term.year_level}`} - {semesterLabels[term.semester] || `Sem ${term.semester}`}
                        </span>
                        <span className="text-[10px] font-bold text-gray-500">
                          {term.totals?.tu || 0} units total
                        </span>
                      </div>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-gray-50">
                            <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Code</th>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Course</th>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Lec</th>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Lab</th>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Units</th>
                          </tr>
                        </thead>
                        <tbody>
                          {term.courses.map((course) => (
                            <tr key={course.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <td className="px-4 py-2">
                                <span className="bg-[#C9952A]/10 text-[#C9952A] px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase">
                                  {course.code}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-xs font-medium text-gray-700">{course.title}</td>
                              <td className="px-4 py-2 text-xs text-gray-600 text-right">{course.lec_units}</td>
                              <td className="px-4 py-2 text-xs text-gray-600 text-right">{course.lab_units}</td>
                              <td className="px-4 py-2 text-xs font-bold text-gray-800 text-right">{course.total_units}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
