import React from 'react';
import { BookOpen, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type { CurriculumCourse } from '../../types/curriculum';

interface CourseTableProps {
  courses: CurriculumCourse[];
  totals: {
    lec: number;
    lab: number;
    tu: number;
  };
  highlightedCourseId: number | null;
  removingCourseId: number | null;
  isRemoving: boolean;
  canEdit?: boolean;
  onInitiateEdit?: (course: CurriculumCourse) => void;
  onInitiateRemove: (courseId: number) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (courseId: number, courseCode: string) => void;
}

export default function CourseTable({
  courses,
  totals,
  highlightedCourseId,
  removingCourseId,
  isRemoving,
  canEdit = true,
  onInitiateEdit,
  onInitiateRemove,
  onCancelRemove,
  onConfirmRemove,
}: CourseTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50/40 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            <th className="px-5 py-2.5 w-32">Course Code</th>
            <th className="px-5 py-2.5">Course Title</th>
            <th className="px-5 py-2.5 text-right w-24">Lec Units</th>
            <th className="px-5 py-2.5 text-right w-24">Lab Units</th>
            <th className="px-5 py-2.5 text-right w-24">Total Units</th>
            {canEdit && <th className="px-5 py-2.5 text-right w-28">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {courses.length === 0 ? (
            <tr>
              <td colSpan={canEdit ? 6 : 5} className="px-5 py-8 text-center bg-gray-50/20">
                <div className="max-w-sm mx-auto">
                  <BookOpen size={28} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-xs font-bold text-gray-600 mb-0.5">No courses added yet</p>
                  <p className="text-[11px] text-gray-400">
                    This semester is empty. {canEdit ? 'Use the Add Course button above to attach courses.' : ''}
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            courses.map((course) => (
              <tr
                key={course.id}
                className={`transition-colors ${
                  highlightedCourseId === course.id ? 'bg-[#C9952A]/10 animate-pulse' : 'hover:bg-gray-50/50'
                }`}
              >
                <td className="px-5 py-3">
                  <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
                    {course.code}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs font-bold text-gray-800">{course.title}</td>
                <td className="px-5 py-3 text-xs text-gray-600 text-right font-medium">{course.lec_units}</td>
                <td className="px-5 py-3 text-xs text-gray-600 text-right font-medium">{course.lab_units}</td>
                <td className="px-5 py-3 text-xs font-bold text-[#4e0a10] text-right">{course.total_units}</td>
                {canEdit && (
                  <td className="px-5 py-3 text-right">
                    {removingCourseId === course.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onConfirmRemove(course.id, course.code)}
                          disabled={isRemoving}
                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isRemoving ? <Loader2 size={10} className="animate-spin" /> : <AlertTriangle size={10} />}
                          Confirm
                        </button>
                        <button
                          onClick={onCancelRemove}
                          className="px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        {onInitiateEdit && (
                          <button
                            onClick={() => onInitiateEdit(course)}
                            className="p-1.5 text-gray-400 hover:text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                            title="Edit course details"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => onInitiateRemove(course.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove course"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50/70 border-t border-gray-200">
            <td colSpan={2} className="px-5 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wider">
              Total Credits
            </td>
            <td className="px-5 py-2.5 text-xs font-bold text-gray-700 text-right">{totals.lec}</td>
            <td className="px-5 py-2.5 text-xs font-bold text-gray-700 text-right">{totals.lab}</td>
            <td className="px-5 py-2.5 text-xs font-black text-[#4e0a10] text-right">{totals.tu}</td>
            {canEdit && <td></td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
