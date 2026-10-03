import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, } from 'lucide-react';
import type { Curriculum, Program } from '../../types/curriculum';
import { programLabel } from '../../lib/programLabel';
import { getStoredUserDepartmentId, getStoredUserRole } from '../../lib/storedUser';

interface CurriculumFormModalProps {
  isOpen: boolean;
  isEditMode: boolean;
  curriculum: Curriculum | null;
  onClose: () => void;
  onSubmit: (data: Partial<Curriculum>) => Promise<void>;
  programs: Program[];
}

export default function CurriculumFormModal({
  isOpen,
  isEditMode,
  curriculum,
  onClose,
  onSubmit,
  programs,
}: CurriculumFormModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [programId, setProgramId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [effectiveYearError, setEffectiveYearError] = useState('');
  // The curriculum belongs to the department that authors it; the server sets
  // it from the signed-in account, so only that department's programs apply.
  const departmentId = isEditMode && curriculum?.department_id
    ? curriculum.department_id
    : getStoredUserDepartmentId();
  const departmentPrograms = programs.filter((program) => program.department_id === departmentId);
  // A program head's curriculum is always their own program's; the server
  // enforces it, so there is nothing to choose.
  const canChooseProgram = getStoredUserRole() !== 'program_head';

  useEffect(() => {
    if (isOpen) {
      if (isEditMode && curriculum) {
        setName(curriculum.name);
        setCode(curriculum.code);
        const [start = '', end = ''] = curriculum.effective_school_year.split('-');
        setStartYear(start.trim());
        setEndYear(end.trim());
        setProgramId(curriculum.program_id ? String(curriculum.program_id) : '');
      } else {
        setName('');
        setCode('');
        setStartYear('');
        setEndYear('');
        setProgramId('');
      }
      setNameError('');
      setCodeError('');
      setEffectiveYearError('');
    }
  }, [isOpen, isEditMode, curriculum]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!name.trim()) {
      setNameError('Curriculum name is required');
      hasError = true;
    } else {
      setNameError('');
    }

    if (!code.trim()) {
      setCodeError('Curriculum code is required');
      hasError = true;
    } else {
      setCodeError('');
    }

    if (!/^\d{4}$/.test(startYear) || !/^\d{4}$/.test(endYear)) {
      setEffectiveYearError('Enter both years, e.g. 2025 and 2026');
      hasError = true;
    } else if (Number(endYear) !== Number(startYear) + 1) {
      setEffectiveYearError('The second year must follow the first');
      hasError = true;
    } else {
      setEffectiveYearError('');
    }

    if (hasError) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        effective_school_year: `${startYear}-${endYear}`,
        program_id: programId ? Number(programId) : null,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
      <div className="bg-[#F7F4F0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex max-h-[calc(100dvh-2rem)] flex-col animate-in zoom-in-95 duration-200">
        <div className="p-5 flex shrink-0 justify-between items-center bg-[#4e0a10]">
          <h2 className="text-lg font-bold text-white font-display">
            {isEditMode ? 'Edit Curriculum' : 'Add New Curriculum'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <form id="curriculum-form" onSubmit={handleSubmit} noValidate className="p-6 space-y-4 min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Curriculum Name <span className="text-red-500">*</span>
              </label>
              <input
                id="curriculum-name-input"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
                placeholder="e.g. BS Computer Science 2024"
                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                  nameError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
                }`}
              />
              {nameError && <p className="text-xs text-red-500 mt-1 font-semibold">{nameError}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                CMO No. <span className="text-red-500">*</span>
              </label>
              <input
                id="curriculum-code-input"
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(''); }}
                placeholder="e.g. CMO 1 S 2026"
                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white font-mono transition-all ${
                  codeError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
                }`}
              />
              {codeError && <p className="text-xs text-red-500 mt-1 font-semibold">{codeError}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Effective School Year <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="curriculum-start-year-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                aria-label="Start year"
                value={startYear}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setStartYear(value);
                  // A school year spans consecutive years, so the second follows the first.
                  if (value.length === 4) setEndYear(String(Number(value) + 1));
                  setEffectiveYearError('');
                }}
                placeholder="2025"
                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                  effectiveYearError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
                }`}
              />
              <span className="text-gray-400 font-semibold">&ndash;</span>
              <input
                id="curriculum-end-year-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                aria-label="End year"
                value={endYear}
                onChange={(e) => { setEndYear(e.target.value.replace(/\D/g, '')); setEffectiveYearError(''); }}
                placeholder="2026"
                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                  effectiveYearError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
                }`}
              />
            </div>
            {effectiveYearError && <p className="text-xs text-red-500 mt-1 font-semibold">{effectiveYearError}</p>}
          </div>

          {canChooseProgram && departmentPrograms.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Program / Major
              </label>
              <select
                id="curriculum-program-select"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
              >
                <option value="">None</option>
                {departmentPrograms.map((program) => (
                  <option key={program.id} value={program.id}>
                    {programLabel(program)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div id="curriculum-form-actions" className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#4e0a10] hover:bg-[#C9952A] text-white font-semibold text-sm rounded-xl transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting && <LoadingSpinner className="w-4 h-4" />}
              {isEditMode ? 'Save Changes' : 'Create Curriculum'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
import LoadingSpinner from "../ui/LoadingSpinner";
