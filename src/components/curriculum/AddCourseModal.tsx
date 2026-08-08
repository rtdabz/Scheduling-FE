import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Loader2, BookOpen, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatCourseName } from '../../lib/formatters';

export interface ManualCourseRowRequest {
  rowId: string;
  courseCode: string;
  courseName: string;
  courseCategory: 'major' | 'minor';
  lecUnits: string;
  labUnits: string;
  error?: string;
  saveStatus?: 'idle' | 'saving' | 'success' | 'error';
}

interface AddCourseModalProps {
  isOpen: boolean;
  yearLevel: number;
  semester: number;
  onClose: () => void;
  onSaveCourses: (
    courses: Array<{
      rowId: string;
      courseCode: string;
      courseName: string;
      courseCategory: 'major' | 'minor';
      lecUnits: number;
      labUnits: number;
    }>,
    yearLevel: number,
    semester: number,
    onProgress: (rowId: string, status: 'saving' | 'success' | 'error', errorMsg?: string) => void
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
  onClose,
  onSaveCourses,
}: AddCourseModalProps) {
  const [rows, setRows] = useState<ManualCourseRowRequest[]>([
    { rowId: 'row-1', courseCode: '', courseName: '', courseCategory: 'major', lecUnits: '', labUnits: '', saveStatus: 'idle' },
  ]);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setRows([
        { rowId: `row-${Date.now()}-1`, courseCode: '', courseName: '', courseCategory: 'major', lecUnits: '', labUnits: '', saveStatus: 'idle' },
      ]);
    }
  }, [isOpen]);

  // Automatically close modal after a short delay once all courses are successfully saved
  useEffect(() => {
    if (isOpen && rows.length > 0 && rows.every((r) => r.saveStatus === 'success')) {
      const timer = setTimeout(() => {
        onClose();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [rows, isOpen, onClose]);

  if (!isOpen) return null;

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      { rowId: `row-${Date.now()}-${prev.length + 1}`, courseCode: '', courseName: '', courseCategory: 'major', lecUnits: '', labUnits: '', saveStatus: 'idle' },
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

  const handleInputBlur = (rowId: string, field: 'courseCode' | 'courseName') => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId === rowId) {
          let updatedVal = r[field];
          if (field === 'courseName') {
            updatedVal = formatCourseName(updatedVal);
          } else if (field === 'courseCode') {
            updatedVal = updatedVal.replace(/\s+/g, ' ').trim().toUpperCase();
          }
          return { ...r, [field]: updatedVal };
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
    const digits = valStr.replace(/\D/g, '').slice(0, 2);
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, [field]: digits, error: undefined } : r))
    );
  };

  const handleRetryRow = async (row: ManualCourseRowRequest) => {
    if (!row.courseCode.trim() || !row.courseName.trim() || !row.lecUnits.trim() || !row.labUnits.trim()) {
      let errMsg = 'Course Code and Course Name are required';
      if (!row.courseCode.trim() && row.courseName.trim()) errMsg = 'Course Code is required';
      if (row.courseCode.trim() && !row.courseName.trim()) errMsg = 'Course Name is required';
      if (row.courseCode.trim() && row.courseName.trim() && !row.lecUnits.trim() && !row.labUnits.trim()) errMsg = 'LEC Units and LAB Units are required';
      if (row.courseCode.trim() && row.courseName.trim() && !row.lecUnits.trim() && row.labUnits.trim()) errMsg = 'LEC Units is required';
      if (row.courseCode.trim() && row.courseName.trim() && row.lecUnits.trim() && !row.labUnits.trim()) errMsg = 'LAB Units is required';
      setRows((prev) => prev.map((r) => r.rowId === row.rowId ? { ...r, error: errMsg } : r));
      return;
    }

    setRows((prev) =>
      prev.map((r) => (r.rowId === row.rowId ? { ...r, error: undefined, saveStatus: 'saving' } : r))
    );

    try {
      const payload = {
        rowId: row.rowId,
        courseCode: row.courseCode.replace(/\s+/g, ' ').trim().toUpperCase(),
        courseName: formatCourseName(row.courseName),
        courseCategory: row.courseCategory,
        lecUnits: Number(row.lecUnits),
        labUnits: Number(row.labUnits),
      };

      await onSaveCourses(
        [payload],
        yearLevel,
        semester,
        (rowId, status, errorMsg) => {
          setRows((prev) =>
            prev.map((r) => {
              if (r.rowId === rowId) {
                return { ...r, saveStatus: status, error: errorMsg };
              }
              return r;
            })
          );
        }
      );
    } catch {
      // Status is updated via the progress callback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If all courses are already successfully saved, close the modal
    const allSuccessful = rows.length > 0 && rows.every(r => r.saveStatus === 'success');
    if (allSuccessful) {
      onClose();
      return;
    }

    // Validate rows
    let hasValidationError = false;
    const validatedRows = rows.map((r) => {
      if (r.saveStatus === 'success') {
        return r;
      }
      if (!r.courseCode.trim() || !r.courseName.trim() || !r.lecUnits.trim() || !r.labUnits.trim()) {
        hasValidationError = true;
        let errMsg = 'Course Code and Course Name are required';
        if (!r.courseCode.trim() && r.courseName.trim()) errMsg = 'Course Code is required';
        if (r.courseCode.trim() && !r.courseName.trim()) errMsg = 'Course Name is required';
        if (r.courseCode.trim() && r.courseName.trim() && !r.lecUnits.trim() && !r.labUnits.trim()) errMsg = 'LEC Units and LAB Units are required';
        if (r.courseCode.trim() && r.courseName.trim() && !r.lecUnits.trim() && r.labUnits.trim()) errMsg = 'LEC Units is required';
        if (r.courseCode.trim() && r.courseName.trim() && r.lecUnits.trim() && !r.labUnits.trim()) errMsg = 'LAB Units is required';
        return { ...r, error: errMsg };
      }
      return { ...r, error: undefined };
    });

    setRows(validatedRows);

    if (hasValidationError) return;

    const rowsToSave = validatedRows.filter((r) => r.saveStatus !== 'success');
    if (rowsToSave.length === 0) return;

    const payload = rowsToSave.map((r) => ({
      rowId: r.rowId,
      courseCode: r.courseCode.replace(/\s+/g, ' ').trim().toUpperCase(),
      courseName: formatCourseName(r.courseName),
      courseCategory: r.courseCategory,
      lecUnits: Number(r.lecUnits),
      labUnits: Number(r.labUnits),
    }));

    setRows((prev) =>
      prev.map((r) =>
        r.saveStatus !== 'success' ? { ...r, saveStatus: 'saving', error: undefined } : r
      )
    );

    try {
      await onSaveCourses(
        payload,
        yearLevel,
        semester,
        (rowId, status, errorMsg) => {
          setRows((prev) =>
            prev.map((r) => {
              if (r.rowId === rowId) {
                return { ...r, saveStatus: status, error: errorMsg };
              }
              return r;
            })
          );
        }
      );
    } catch {
      // Status is updated via the progress callback
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
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
            {rows.map((row, index) => {
              const isLocked = row.saveStatus === 'success' || row.saveStatus === 'saving';
              return (
                <div
                  key={row.rowId}
                  className={`p-3.5 rounded-xl border transition-all ${
                    row.saveStatus === 'success'
                      ? 'border-emerald-200 bg-emerald-50/10'
                      : row.saveStatus === 'error'
                      ? 'border-red-200 bg-red-50/30'
                      : row.error
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
                        disabled={isLocked}
                        onChange={(e) => handleInputChange(row.rowId, 'courseCode', e.target.value)}
                        onBlur={() => handleInputBlur(row.rowId, 'courseCode')}
                        placeholder="e.g. IT 101"
                        className={`w-full px-3 py-2 border rounded-xl text-xs font-bold text-gray-900 uppercase bg-white outline-none transition-colors shadow-sm disabled:bg-gray-100/50 disabled:text-gray-500 ${
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
                        disabled={isLocked}
                        onChange={(e) => handleInputChange(row.rowId, 'courseName', e.target.value)}
                        onBlur={() => handleInputBlur(row.rowId, 'courseName')}
                        placeholder="e.g. Data Structures and Algorithms"
                        className={`w-full px-3.5 py-2 border rounded-xl text-xs bg-white outline-none transition-colors shadow-sm disabled:bg-gray-100/50 disabled:text-gray-500 ${
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
                        disabled={isLocked}
                        onChange={(e) => handleCategoryChange(row.rowId, e.target.value as 'major' | 'minor')}
                        className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] shadow-sm cursor-pointer disabled:bg-gray-100/50 disabled:text-gray-500"
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
                        max="99"
                        step="1"
                        disabled={isLocked}
                        value={row.lecUnits}
                        onChange={(e) => handleUnitChange(row.rowId, 'lecUnits', e.target.value)}
                        placeholder="01"
                        className={`w-full px-2 py-2 border rounded-xl text-xs font-bold text-gray-800 bg-white outline-none shadow-sm text-center disabled:bg-gray-100/50 disabled:text-gray-500 ${
                          row.error && !row.lecUnits.trim()
                            ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                            : 'border-gray-300 focus:ring-1 focus:ring-[#C9952A]'
                        }`}
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
                        max="99"
                        step="1"
                        disabled={isLocked}
                        value={row.labUnits}
                        onChange={(e) => handleUnitChange(row.rowId, 'labUnits', e.target.value)}
                        placeholder="01"
                        className={`w-full px-2 py-2 border rounded-xl text-xs font-bold text-gray-800 bg-white outline-none shadow-sm text-center disabled:bg-gray-100/50 disabled:text-gray-500 ${
                          row.error && !row.labUnits.trim()
                            ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                            : 'border-gray-300 focus:ring-1 focus:ring-[#C9952A]'
                        }`}
                      />
                    </div>

                    {/* Total Units Preview */}
                    <div className="w-14 shrink-0 text-center pt-5">
                      <span className="inline-block px-2 py-1 bg-[#4e0a10]/10 text-[#4e0a10] rounded-lg text-xs font-extrabold">
                        {(Number(row.lecUnits) || 0) + (Number(row.labUnits) || 0)}u
                      </span>
                    </div>

                    {/* Action Indicator / Remove Row Button */}
                    <div className="pt-5 shrink-0 w-8 h-8 flex items-center justify-center">
                      {row.saveStatus === 'saving' ? (
                        <Loader2 size={16} className="animate-spin text-[#C9952A]" />
                      ) : row.saveStatus === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : row.saveStatus === 'error' ? (
                        <button
                          type="button"
                          onClick={() => handleRetryRow(row)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 rounded-lg text-[9px] font-bold uppercase transition-colors cursor-pointer"
                          title="Retry saving this course"
                        >
                          <RefreshCw size={8} />
                          <span>Retry</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.rowId)}
                          disabled={rows.length <= 1}
                          className="w-8 h-8 rounded-xl border border-gray-200 hover:border-red-300 text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove row"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {row.error && (
                    <div className={`flex items-center gap-1 text-[11px] font-medium mt-1.5 ml-10 ${row.saveStatus === 'error' ? 'text-red-500 font-bold' : 'text-red-600'}`}>
                      <AlertCircle size={12} />
                      <span>{row.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Modal Footer Controls */}
          {(() => {
            const isSaving = rows.some((r) => r.saveStatus === 'saving');
            const allSuccessful = rows.length > 0 && rows.every((r) => r.saveStatus === 'success');
            return (
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={handleAddRow}
                  disabled={allSuccessful || isSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-dashed border-[#C9952A] text-[#b08020] hover:bg-[#C9952A]/10 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                  <span>Add Another Course</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSaving}
                    className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || allSuccessful}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-[#4e0a10] hover:bg-[#C9952A] text-white text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {isSaving ? (
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
            );
          })()}
        </form>
      </div>
    </div>,
    document.body
  );
}
