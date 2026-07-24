import React, { useState, useEffect } from 'react';
import { X, Pencil, Loader2, BookOpen, AlertCircle } from 'lucide-react';
import type { CurriculumCourse } from '../../types/curriculum';
import { formatCourseName } from '../../lib/formatters';

export interface EditCourseFormData {
  courseId: number;
  courseCode: string;
  courseName: string;
  courseCategory: 'major' | 'minor';
  lecUnits: number;
  labUnits: number;
}

interface EditCourseModalProps {
  isOpen: boolean;
  course: CurriculumCourse | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSave: (data: EditCourseFormData) => Promise<void>;
}

export default function EditCourseModal({
  isOpen,
  course,
  isSubmitting,
  onClose,
  onSave,
}: EditCourseModalProps) {
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseCategory, setCourseCategory] = useState<'major' | 'minor'>('major');
  const [lecUnits, setLecUnits] = useState(0);
  const [labUnits, setLabUnits] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (course && isOpen) {
      setCourseCode(course.code || '');
      setCourseName(course.title || '');
      setCourseCategory(course.category === 'minor' ? 'minor' : 'major');
      setLecUnits(course.lec_units ?? 0);
      setLabUnits(course.lab_units ?? 0);
      setError(null);
    }
  }, [course, isOpen]);

  if (!isOpen || !course) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = courseCode.replace(/\s+/g, ' ').trim().toUpperCase();
    const formattedName = formatCourseName(courseName);

    if (!trimmedCode || !formattedName) {
      if (!trimmedCode && !formattedName) setError('Course Code and Course Name are required');
      else if (!trimmedCode) setError('Course Code is required');
      else setError('Course Name is required');
      return;
    }

    setError(null);

    await onSave({
      courseId: course.id,
      courseCode: trimmedCode,
      courseName: formattedName,
      courseCategory,
      lecUnits,
      labUnits,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-[#4e0a10] px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#C9952A]/20 border border-[#C9952A]/30 flex items-center justify-center text-[#C9952A]">
              <Pencil size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-wide uppercase">EDIT COURSE</h2>
              <p className="text-xs text-gray-300 mt-0.5">
                Update course code, title, category, and unit specifications
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-xs font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Course Code */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
              Course Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              onBlur={() => setCourseCode(courseCode.replace(/\s+/g, ' ').trim().toUpperCase())}
              placeholder="e.g. IT 101"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-900 uppercase bg-white outline-none focus:ring-1 focus:ring-[#C9952A] focus:border-[#C9952A] shadow-sm"
            />
          </div>

          {/* Course Title */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
              Course Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              onBlur={() => setCourseName(formatCourseName(courseName))}
              placeholder="e.g. Data Structures and Algorithms"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-medium text-gray-900 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] focus:border-[#C9952A] shadow-sm"
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={courseCategory}
              onChange={(e) => setCourseCategory(e.target.value as 'major' | 'minor')}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] shadow-sm cursor-pointer"
            >
              <option value="major">Major Course</option>
              <option value="minor">Minor Course</option>
            </select>
          </div>

          {/* Units Inputs */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                LEC Units
              </label>
              <input
                type="number"
                min="0"
                value={lecUnits}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setLecUnits(isNaN(val) || val < 0 ? 0 : val);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] shadow-sm text-center"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                LAB Units
              </label>
              <input
                type="number"
                min="0"
                value={labUnits}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setLabUnits(isNaN(val) || val < 0 ? 0 : val);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] shadow-sm text-center"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1 text-center">
                Total Units
              </label>
              <div className="h-[34px] flex items-center justify-center bg-[#4e0a10]/10 text-[#4e0a10] font-black text-xs rounded-xl">
                {lecUnits + labUnits}u
              </div>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-[#4e0a10] hover:bg-[#C9952A] text-white text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
