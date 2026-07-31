import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Layers, Plus, Loader2 } from 'lucide-react';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface Term {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
}

interface Section {
  id: number;
  section_name: string;
  year_level: '1' | '2' | '3' | '4';
  semester: '1st' | '2nd' | 'summer';
  department_id: number;
  department: Department | null;
  term_id: number;
  term: Term | null;
  status: 'active' | 'inactive';
}

export interface SectionBatchRow {
  id: string;
  section_name: string;
  year_level: '1' | '2' | '3' | '4';
  error?: string;
}

interface SectionModalProps {
  isOpen: boolean;
  isEditMode: boolean;
  editingSection?: Section | null;
  activeTerm: Term | null;
  departments: Department[];
  userDepartmentId?: number | null;
  isVpaa: boolean;
  onClose: () => void;
  onSaveSingle: (sectionName: string, yearLevel: '1' | '2' | '3' | '4', departmentId: number) => Promise<void>;
  onSaveBatch: (sections: Array<{ section_name: string; year_level: '1' | '2' | '3' | '4' }>, departmentId: number) => Promise<void>;
}

export default function SectionModal({
  isOpen,
  isEditMode,
  editingSection,
  activeTerm,
  departments,
  userDepartmentId,
  isVpaa,
  onClose,
  onSaveSingle,
  onSaveBatch,
}: SectionModalProps) {
  const [sectionName, setSectionName] = useState('');
  const [yearLevel, setYearLevel] = useState<'1' | '2' | '3' | '4'>('1');
  const [departmentId, setDepartmentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [batchRows, setBatchRows] = useState<SectionBatchRow[]>([
    { id: '1', section_name: '', year_level: '1' },
  ]);

  const [nameError, setNameError] = useState('');
  const [departmentError, setDepartmentError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (isEditMode && editingSection) {
        setSectionName(editingSection.section_name);
        setYearLevel(editingSection.year_level);
        setDepartmentId(editingSection.department_id ? editingSection.department_id.toString() : '');
      } else {
        setSectionName('');
        setYearLevel('1');
        setDepartmentId(isVpaa ? '' : (userDepartmentId?.toString() || ''));
        setBatchRows([{ id: '1', section_name: '', year_level: '1' }]);
      }
      setNameError('');
      setDepartmentError('');
      setIsSubmitting(false);
    }
  }, [isOpen, isEditMode, editingSection, isVpaa, userDepartmentId]);

  if (!isOpen) return null;

  const addBatchRow = () => {
    setBatchRows((prev) => {
      const lastRow = prev[prev.length - 1];
      let nextName = '';
      if (lastRow && lastRow.section_name.trim()) {
        const match = lastRow.section_name.trim().match(/^(.*?)([A-Za-z]+)(\d*)$/);
        if (match) {
          const prefix = match[1];
          const letter = match[2];
          if (letter.length === 1) {
            const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
            nextName = `${prefix}${nextLetter}`;
          }
        }
      }
      return [
        ...prev,
        {
          id: Date.now().toString() + Math.random().toString().slice(2, 5),
          section_name: nextName,
          year_level: lastRow ? lastRow.year_level : '1',
        },
      ];
    });
  };

  const updateBatchRow = (id: string, field: keyof SectionBatchRow, value: any) => {
    setBatchRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value, error: field === 'section_name' ? '' : r.error } : r))
    );
  };

  const removeBatchRow = (id: string) => {
    if (batchRows.length <= 1) return;
    setBatchRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const deptVal = isVpaa ? departmentId : (userDepartmentId?.toString() || '');
    if (!deptVal) {
      setDepartmentError('Department is required');
      hasError = true;
    } else {
      setDepartmentError('');
    }

    if (isEditMode) {
      const trimmedName = sectionName.trim();
      if (!trimmedName) {
        setNameError('Section name is required');
        hasError = true;
      } else {
        setNameError('');
      }

      if (hasError) return;

      setIsSubmitting(true);
      try {
        await onSaveSingle(trimmedName, yearLevel, Number(deptVal));
        onClose();
      } catch {
        // error handled in parent
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Batch Create Mode
    const validatedRows = batchRows.map((row) => {
      const trimmed = row.section_name.trim().toUpperCase();
      return {
        ...row,
        section_name: trimmed,
        error: !trimmed ? 'Section name is required' : '',
      };
    });

    setBatchRows(validatedRows);

    if (validatedRows.some((r) => !!r.error)) {
      return;
    }

    if (hasError) return;

    setIsSubmitting(true);
    try {
      await onSaveBatch(
        validatedRows.map((row) => ({ section_name: row.section_name, year_level: row.year_level })),
        Number(deptVal)
      );
      onClose();
    } catch {
      // error handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150 font-sans">
      <div className="bg-white border border-slate-200/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header Banner */}
        <div className="p-5 sm:p-6 bg-[#4e0a10] text-white flex justify-between items-center relative">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#39060b] border border-[#C9952A]/40 flex items-center justify-center text-[#C9952A] shrink-0 shadow-inner">
              <Layers size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white font-display uppercase tracking-wide">
                  {isEditMode ? 'EDIT SECTION' : 'ADD SECTION'}
                </h2>
                {activeTerm?.academic_year && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-[#C9952A] text-slate-950 shadow-2xs">
                    A.Y. {activeTerm.academic_year}
                  </span>
                )}
                {activeTerm?.semester && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-white/15 text-slate-100 border border-white/20">
                    {activeTerm.semester} Semester
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-100/70 font-sans font-medium mt-0.5">
                Manually enter section details for this term card
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 ml-3"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Shared Top Settings: System-Controlled Department, Term & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/80 mb-2">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1 font-sans">
                Academic Term
              </label>
              <input
                type="text"
                disabled
                value={
                  activeTerm
                    ? `A.Y. ${activeTerm.academic_year} - ${activeTerm.semester} Semester (Active)`
                    : 'Active System Term'
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-100/90 text-gray-700 text-xs font-semibold outline-none cursor-not-allowed font-sans truncate"
              />
            </div>

            {isVpaa ? (
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1 font-sans">
                  Assigned Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    setDepartmentError('');
                  }}
                  className={`w-full px-3 py-2 border rounded-xl outline-none text-xs bg-white font-semibold transition-all font-sans ${
                    departmentError ? 'border-red-500 focus:ring-2 focus:ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-[#C9952A]'
                  }`}
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id.toString()}>
                      {dept.department_code} - {dept.department_name}
                    </option>
                  ))}
                </select>
                {departmentError && <p className="text-[10px] text-red-500 mt-0.5 font-bold font-sans">{departmentError}</p>}
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1 font-sans">
                  Department
                </label>
                <input
                  type="text"
                  disabled
                  value={
                    departments.find((d) => d.id === userDepartmentId)
                      ? `${departments.find((d) => d.id === userDepartmentId)?.department_code} - ${departments.find((d) => d.id === userDepartmentId)?.department_name}`
                      : 'No Department Assigned'
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-100/90 text-gray-700 text-xs font-semibold outline-none cursor-not-allowed font-sans truncate"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1 font-sans">
                Status
              </label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-100/90 text-gray-700 text-xs font-bold flex items-center gap-1.5 cursor-not-allowed font-sans">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Active</span>
              </div>
            </div>
          </div>

          {/* Form Body: Single Section Edit OR Dynamic Multi-Row Creation */}
          {isEditMode ? (
            <div className="p-4 bg-white border border-gray-200 rounded-2xl space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                  Section Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sectionName}
                  onChange={(e) => {
                    setSectionName(e.target.value.toUpperCase());
                    setNameError('');
                  }}
                  placeholder="e.g. BSIT 4A"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                    nameError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {nameError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{nameError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Year Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={yearLevel}
                    onChange={(e) => setYearLevel(e.target.value as '1' | '2' | '3' | '4')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                  >
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                    <option value="4">4th Year</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Semester
                  </label>
                  <input
                    type="text"
                    disabled
                    value={activeTerm ? `${activeTerm.semester} Semester` : '1st Semester'}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-100/90 text-gray-600 text-sm font-bold cursor-not-allowed font-sans"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Dynamic Multi-Row Section Creation List */
            <div className="space-y-3">
              {batchRows.map((row, index) => (
                <div
                  key={row.id}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3.5 bg-white border border-gray-200/90 rounded-2xl shadow-2xs transition-all hover:border-amber-200"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 font-extrabold text-gray-600 flex items-center justify-center text-xs shrink-0 font-mono">
                    {index + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
                      SECTION NAME <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={row.section_name}
                      onChange={(e) => updateBatchRow(row.id, 'section_name', e.target.value.toUpperCase())}
                      placeholder="e.g. BSIT 1A"
                      className={`w-full px-3.5 py-2 border rounded-xl outline-none text-xs bg-white transition-all font-semibold font-sans ${
                        row.error ? 'border-red-500 focus:ring-2 focus:ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-[#C9952A]'
                      }`}
                    />
                    {row.error && <p className="text-[10px] text-red-500 mt-0.5 font-bold">{row.error}</p>}
                  </div>

                  <div className="w-full sm:w-36 shrink-0">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
                      YEAR LEVEL <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={row.year_level}
                      onChange={(e) => updateBatchRow(row.id, 'year_level', e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none text-xs bg-white font-semibold focus:ring-2 focus:ring-[#C9952A]"
                    >
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                    </select>
                  </div>

                  <div className="w-full sm:w-36 shrink-0">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
                      SEMESTER
                    </label>
                    <input
                      type="text"
                      disabled
                      value={activeTerm ? `${activeTerm.semester} Semester` : '1st Semester'}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-100/90 text-gray-600 text-xs font-bold cursor-not-allowed font-sans"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeBatchRow(row.id)}
                    disabled={batchRows.length <= 1}
                    title="Remove Row"
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 shrink-0 self-end sm:self-center cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Form Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200/80 bg-gray-50/50 -mx-6 -mb-6 p-6 mt-4">
            {!isEditMode ? (
              <button
                type="button"
                onClick={addBatchRow}
                className="w-full sm:w-auto px-4 py-2.5 border-2 border-dashed border-[#C9952A] text-[#C9952A] hover:bg-amber-50 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer font-sans"
              >
                <Plus size={16} />
                <span>+ Add Another Section</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-bold text-xs hover:bg-gray-50 transition-all cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer flex items-center gap-2 disabled:opacity-50 font-sans"
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                <span>{isEditMode ? 'Save Changes' : 'Save Sections'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
