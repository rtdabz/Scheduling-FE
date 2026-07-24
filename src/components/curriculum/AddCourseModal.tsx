import React, { useState, useEffect } from 'react';
import { X, Plus, Loader2, BookOpen, AlertCircle } from 'lucide-react';

export interface ManualCourseRowRequest {
  rowId: string;
  courseCode: string;
  courseName: string;
  courseCategory: 'major' | 'minor';
  lecUnits: number;
  labUnits: number;
  error?: string;
}

interface AddCourseModalProps {
  isOpen: boolean;
  yearLevel: number;
  semester: number;
  isSubmitting: boolean;
  onClose: () => void;
  onSaveCourses: (
    courses: Array<{
      courseCode: string;
      courseName: string;
      courseCategory: 'major' | 'minor';
      lecUnits: number;
      labUnits: number;
    }>,
    yearLevel: number,
    semester: number
  ) => Promise<void>;
}

const semesterNames: Record<number, string> = {
  1: '1st Semester',
  2: '2nd Semester',
  3: 'Summer Term',
};

const yearNames: Record<number, string> = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
};

export default function AddCourseModal({
  isOpen,
  yearLevel,
  semester,
  isSubmitting,
  onClose,
  onSaveCourses,
}: AddCourseModalProps) {
  const [rows, setRows] = useState<ManualCourseRowRequest[]>([
    { rowId: 'row-1', courseCode: '', courseName: '', courseCategory: 'major', lecUnits: 0, labUnits: 0 },
  ]);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setRows([
        { rowId: `row-${Date.now()}-1`, courseCode: '', courseName: '', courseCategory: 'major', lecUnits: 0, labUnits: 0 },
      ]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      { rowId: `row-${Date.now()}-${prev.length + 1}`, courseCode: '', courseName: '', courseCategory: 'major', lecUnits: 0, labUnits: 0 },
    ]);
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : prev));
  };

  const handleInputChange = (rowId: string, field: 'courseCode' | 'courseName', val: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId === rowId) {
          const updated = { ...r, [field]: val };
          if (updated.courseCode.trim() && updated.courseName.trim()) {
            updated.error = undefined;
          }
          return updated;
        }
        return r;
      })
    );
  };

  const handleCategoryChange = (rowId: string, category: 'major' | 'minor') => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, courseCategory: category } : r))
    );
  };

  const handleUnitChange = (rowId: string, field: 'lecUnits' | 'labUnits', valStr: string) => {
    const parsed = parseInt(valStr, 10);
    const num = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, [field]: num } : r))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate rows
    let hasValidationError = false;
    const validatedRows = rows.map((r) => {
      if (!r.courseCode.trim() || !r.courseName.trim()) {
        hasValidationError = true;
        let errMsg = 'Course Code and Course Name are required';
        if (!r.courseCode.trim() && r.courseName.trim()) errMsg = 'Course Code is required';
        if (r.courseCode.trim() && !r.courseName.trim()) errMsg = 'Course Name is required';
        return { ...r, error: errMsg };
      }
      return { ...r, error: undefined };
    });

    setRows(validatedRows);

    if (hasValidationError) return;

    const payload = validatedRows.map((r) => ({
      courseCode: r.courseCode.trim(),
      courseName: r.courseName.trim(),
      courseCategory: r.courseCategory,
      lecUnits: r.lecUnits ?? 0,
      labUnits: r.labUnits ?? 0,
    }));

    if (payload.length === 0) return;

    await onSaveCourses(payload, yearLevel, semester);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#4e0a10] px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#C9952A]/20 border border-[#C9952A]/30 flex items-center justify-center text-[#C9952A]">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-wide uppercase">ADD COURSE</h2>
                <span className="bg-[#C9952A] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  {yearNames[yearLevel] || `Year ${yearLevel}`}
                </span>
                <span className="bg-white/10 text-gray-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {semesterNames[semester] || `Sem ${semester}`}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">
                Manually enter course details for this semester card
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

        {/* Modal Body / Dynamic Manual Course Input Rows */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div
                key={row.rowId}
                className={`p-3.5 rounded-xl border transition-all ${
                  row.error
                    ? 'border-red-300 bg-red-50/40'
                    : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Row Number Badge */}
                  <div className="w-7 h-7 rounded-lg bg-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center shrink-0 mt-6">
                    {index + 1}
                  </div>

                  {/* Course Code Text Input */}
                  <div className="w-32 shrink-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Course Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={row.courseCode}
                      onChange={(e) => handleInputChange(row.rowId, 'courseCode', e.target.value)}
                      placeholder="e.g. IT 101"
                      className={`w-full px-3 py-2 border rounded-xl text-xs font-bold text-gray-900 uppercase bg-white outline-none transition-colors shadow-sm ${
                        row.error && !row.courseCode.trim()
                          ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-1 focus:ring-[#C9952A] focus:border-[#C9952A]'
                      }`}
                    />
                  </div>

                  {/* Course Name Text Input */}
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Course Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={row.courseName}
                      onChange={(e) => handleInputChange(row.rowId, 'courseName', e.target.value)}
                      placeholder="e.g. Data Structures and Algorithms"
                      className={`w-full px-3.5 py-2 border rounded-xl text-xs bg-white outline-none transition-colors shadow-sm ${
                        row.error && !row.courseName.trim()
                          ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-1 focus:ring-[#C9952A] focus:border-[#C9952A]'
                      }`}
                    />
                  </div>

                  {/* Category Dropdown (Major / Minor) */}
                  <div className="w-28 shrink-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={row.courseCategory}
                      onChange={(e) => handleCategoryChange(row.rowId, e.target.value as 'major' | 'minor')}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] shadow-sm cursor-pointer"
                    >
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                    </select>
                  </div>

                  {/* LEC Units */}
                  <div className="w-20 shrink-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      LEC
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={row.lecUnits === 0 && !row.courseCode && !row.courseName ? '' : row.lecUnits}
                      onChange={(e) => handleUnitChange(row.rowId, 'lecUnits', e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] shadow-sm text-center"
                    />
                  </div>

                  {/* LAB Units */}
                  <div className="w-20 shrink-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      LAB
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={row.labUnits === 0 && !row.courseCode && !row.courseName ? '' : row.labUnits}
                      onChange={(e) => handleUnitChange(row.rowId, 'labUnits', e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] shadow-sm text-center"
                    />
                  </div>

                  {/* Total Units Preview */}
                  <div className="w-14 shrink-0 text-center pt-5">
                    <span className="inline-block px-2 py-1 bg-[#4e0a10]/10 text-[#4e0a10] rounded-lg text-xs font-extrabold">
                      {row.lecUnits + row.labUnits}u
                    </span>
                  </div>

                  {/* Remove Row Button (×) */}
                  <div className="pt-5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.rowId)}
                      disabled={rows.length <= 1}
                      className="w-8 h-8 rounded-xl border border-gray-200 hover:border-red-300 text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Remove row"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {row.error && (
                  <div className="flex items-center gap-1 text-red-600 text-[11px] font-medium mt-1.5 ml-10">
                    <AlertCircle size={12} />
                    <span>{row.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-dashed border-[#C9952A] text-[#b08020] hover:bg-[#C9952A]/10 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Another Course</span>
            </button>

            <div className="flex items-center gap-2">
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
                  <span>Save Courses</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
