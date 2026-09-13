import LoadingSpinner from "../../components/ui/LoadingSpinner";
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Layers, Plus, Trash2 } from 'lucide-react';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import TableActionButton from '../../components/ui/TableActionButton';
import { useToast } from '../../context/ToastContext';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}
interface Program { id: number; code: string; name: string | null; department_id: number; }

interface Semester {
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
  program_id: number | null;
  department: Department | null;
  semester_id: number;
  academic_semester: Semester | null;
  status: 'active' | 'inactive';
}

type YearLevel = '1' | '2' | '3' | '4';

export interface SectionBatchRow {
  id: string;
  section_name: string;
  year_level: YearLevel;
  error?: string;
}

interface SectionModalProps {
  isOpen: boolean;
  isEditMode: boolean;
  editingSection?: Section | null;
  activeSemester: Semester | null;
  departments: Department[];
  programs: Program[];
  userDepartmentId?: number | null;
  isVpaa: boolean;
  onClose: () => void;
  onSaveSingle: (sectionName: string, yearLevel: YearLevel, departmentId: number, programId: number) => Promise<void>;
  onSaveBatch: (sections: Array<{ section_name: string; year_level: YearLevel }>, departmentId: number, programId: number) => Promise<void>;
  /** Every loaded section, so a taken name is flagged while it is typed rather than on save. */
  existingSections?: Array<{ id: number; section_name: string; department_id: number | null; semester_id: number }>;
}

const YEAR_OPTIONS: Array<{ value: YearLevel; label: string }> = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

const LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500';
const CONTROL =
  'h-10 w-full rounded-lg border bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const controlTone = (hasError: boolean) =>
  hasError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-[#C9952A] focus:ring-[#C9952A]/25';

/** Mirrors Sections::normalizeName() on the server: trimmed, spaces collapsed, upper-cased. */
const normalizeSectionName = (name: string) => name.trim().split(' ').filter(Boolean).join(' ').toUpperCase();

const newRow = (section_name = '', year_level: YearLevel = '1'): SectionBatchRow => ({
  id: `${Date.now()}${Math.random().toString().slice(2, 6)}`,
  section_name,
  year_level,
});

/** 'BSIT 1A' -> 'BSIT 1B'; anything that does not end in a single letter gets no suggestion. */
const suggestNextName = (name: string): string => {
  const match = name.trim().match(/^(.*?)([A-Za-z])(\d*)$/);
  if (!match || match[3] || /[A-Za-z]$/.test(match[1])) return '';
  return `${match[1]}${String.fromCharCode(match[2].charCodeAt(0) + 1)}`;
};

export default function SectionModal({
  isOpen,
  isEditMode,
  editingSection,
  activeSemester,
  departments,
  programs,
  userDepartmentId,
  isVpaa,
  onClose,
  onSaveSingle,
  onSaveBatch,
  existingSections = [],
}: SectionModalProps) {
  const { toast } = useToast();
  const [sectionName, setSectionName] = useState('');
  const [yearLevel, setYearLevel] = useState<YearLevel>('1');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchRows, setBatchRows] = useState<SectionBatchRow[]>([newRow()]);
  const [nameError, setNameError] = useState('');
  const [departmentError, setDepartmentError] = useState('');
  const [programError, setProgramError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (isEditMode && editingSection) {
      setSectionName(editingSection.section_name);
      setYearLevel(editingSection.year_level);
      setDepartmentId(editingSection.department_id ? editingSection.department_id.toString() : '');
      setProgramId(editingSection.program_id ? editingSection.program_id.toString() : '');
    } else {
      setSectionName('');
      setYearLevel('1');
      setDepartmentId(isVpaa ? '' : (userDepartmentId?.toString() || ''));
      setProgramId('');
      setBatchRows([newRow()]);
    }
    setNameError('');
    setDepartmentError('');
    setProgramError('');
    setIsSubmitting(false);
  }, [isOpen, isEditMode, editingSection, isVpaa, userDepartmentId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const effectiveDepartmentId = isVpaa ? departmentId : (userDepartmentId?.toString() || '');

  // The same scope the server enforces: live sections of this department in the
  // semester the section belongs to (the active one for new sections), minus
  // the section being edited.
  const targetSemesterId = isEditMode ? editingSection?.semester_id : activeSemester?.id;
  const takenNames = new Set(
    existingSections
      .filter((section) => String(section.department_id) === effectiveDepartmentId
        && Number(section.semester_id) === Number(targetSemesterId)
        && section.id !== editingSection?.id)
      .map((section) => normalizeSectionName(section.section_name)),
  );
  const takenMessage = (name: string) => `${normalizeSectionName(name)} already exists in this department for this semester.`;

  const liveNameError = isEditMode && sectionName.trim() && takenNames.has(normalizeSectionName(sectionName))
    ? takenMessage(sectionName)
    : '';
  const liveRowErrors = (() => {
    const seen = new Set<string>();
    return batchRows.map((row) => {
      const key = normalizeSectionName(row.section_name);
      if (!key) return '';
      const message = takenNames.has(key) ? takenMessage(row.section_name) : seen.has(key) ? 'Duplicate name in this list' : '';
      seen.add(key);
      return message;
    });
  })();
  const duplicateCount = isEditMode ? (liveNameError ? 1 : 0) : liveRowErrors.filter(Boolean).length;
  const ownDepartment = departments.find((d) => d.id === userDepartmentId);
  const departmentPrograms = programs.filter((program) => String(program.department_id) === effectiveDepartmentId);
  const semesterText = activeSemester ? fullSemesterLabel(activeSemester) : 'No active semester';

  const addBatchRow = () => {
    setBatchRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, newRow(last ? suggestNextName(last.section_name) : '', last?.year_level ?? '1')];
    });
  };

  const updateBatchRow = <K extends 'section_name' | 'year_level'>(id: string, field: K, value: SectionBatchRow[K]) => {
    setBatchRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value, error: field === 'section_name' ? '' : r.error } : r))
    );
  };

  const removeBatchRow = (id: string) => {
    setBatchRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || duplicateCount > 0) return;

    let hasError = false;
    if (!effectiveDepartmentId) {
      setDepartmentError('Department is required');
      hasError = true;
    } else {
      setDepartmentError('');
    }
    if (!departmentPrograms.some((program) => String(program.id) === programId)) {
      setProgramError('Select a program before adding sections');
      hasError = true;
    } else {
      setProgramError('');
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
        await onSaveSingle(trimmedName, yearLevel, Number(effectiveDepartmentId), Number(programId));
        onClose();
      } catch (error) {
        // A duplicate name comes back as a field error; show it on the input.
        const fieldError = apiFieldErrors(error).section_name;
        if (fieldError) setNameError(fieldError);
        else toast.error('Section not saved', apiErrorMessage(error, 'Failed to save the section.'));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const seen = new Set<string>();
    const validatedRows = batchRows.map((row) => {
      const trimmed = row.section_name.trim().toUpperCase();
      let error = '';
      if (!trimmed) error = 'Section name is required';
      else if (seen.has(trimmed)) error = 'Duplicate name in this list';
      seen.add(trimmed);
      return { ...row, section_name: trimmed, error };
    });
    setBatchRows(validatedRows);

    if (hasError || validatedRows.some((r) => r.error)) return;

    setIsSubmitting(true);
    try {
      await onSaveBatch(
        validatedRows.map((row) => ({ section_name: row.section_name, year_level: row.year_level })),
        Number(effectiveDepartmentId),
        Number(programId)
      );
      onClose();
    } catch (error) {
      // Per-row errors ("sections.2.section_name") land on their own rows.
      const fieldErrors = apiFieldErrors(error);
      const rowErrors = validatedRows.map((row, index) => ({ ...row, error: fieldErrors[`sections.${index}.section_name`] ?? '' }));
      if (rowErrors.some((row) => row.error)) setBatchRows(rowErrors);
      else toast.error('Sections not saved', apiErrorMessage(error, 'Failed to save the sections.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const sectionCount = batchRows.length;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-modal-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white animate-in zoom-in-95 duration-150"
      >
        <header className="flex shrink-0 items-center gap-3 bg-[#4e0a10] px-5 py-4 text-white">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C9952A]/40 bg-[#39060b] text-[#C9952A]">
            <Layers size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="section-modal-title" className="font-display text-lg font-black leading-6">
              {isEditMode ? 'Edit Section' : 'Add Sections'}
            </h2>
            <p className="truncate text-xs font-medium text-amber-100/75">
              {semesterText}
              {!isVpaa && ownDepartment && <> &middot; {ownDepartment.department_code}</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#C9952A]"
          >
            <X size={18} />
          </button>
        </header>

        <form id="section-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className={`grid gap-4 ${isVpaa ? 'sm:grid-cols-2' : ''}`}>
              {isVpaa && (
                <div>
                  <label htmlFor="section-department-select" className={LABEL}>
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="section-department-select"
                    value={departmentId}
                    onChange={(e) => {
                      setDepartmentId(e.target.value);
                      setProgramId('');
                      setDepartmentError('');
                    }}
                    className={`${CONTROL} ${controlTone(!!departmentError)}`}
                  >
                    <option value="">Select department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id.toString()}>
                        {dept.department_code} - {dept.department_name}
                      </option>
                    ))}
                  </select>
                  {departmentError && <p className="mt-1 text-xs font-semibold text-red-600">{departmentError}</p>}
                </div>
              )}

              <div>
                <label htmlFor="section-program-select" className={LABEL}>
                  Program <span className="text-red-500">*</span>
                </label>
                <select
                  id="section-program-select"
                  value={programId}
                  onChange={(e) => {
                    setProgramId(e.target.value);
                    setProgramError('');
                  }}
                  disabled={!effectiveDepartmentId}
                  className={`${CONTROL} ${controlTone(!!programError)}`}
                >
                  <option value="">{effectiveDepartmentId ? 'Select program' : 'Select a department first'}</option>
                  {departmentPrograms.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.code}{program.name ? ` - ${program.name}` : ''}
                    </option>
                  ))}
                </select>
                {programError ? (
                  <p className="mt-1 text-xs font-semibold text-red-600">{programError}</p>
                ) : (
                  effectiveDepartmentId && departmentPrograms.length === 0 && (
                    <p className="mt-1 text-xs font-medium text-amber-700">This department has no programs yet.</p>
                  )
                )}
              </div>
            </div>

            {isEditMode ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <div>
                  <label htmlFor="section-edit-name" className={LABEL}>
                    Section name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="section-edit-name"
                    type="text"
                    value={sectionName}
                    onChange={(e) => {
                      setSectionName(e.target.value.toUpperCase());
                      setNameError('');
                    }}
                    placeholder="e.g. BSIT 4A"
                    className={`${CONTROL} ${controlTone(!!(nameError || liveNameError))}`}
                  />
                  {(nameError || liveNameError) && <p className="mt-1 text-xs font-semibold text-red-600" role="alert">{nameError || liveNameError}</p>}
                </div>
                <div>
                  <label htmlFor="section-edit-year" className={LABEL}>
                    Year level <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="section-edit-year"
                    value={yearLevel}
                    onChange={(e) => setYearLevel(e.target.value as YearLevel)}
                    className={`${CONTROL} ${controlTone(false)}`}
                  >
                    {YEAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className={`${LABEL} mb-0`}>Sections</span>
                  <span className="text-xs text-slate-400">Names are saved in uppercase</span>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="hidden grid-cols-[2rem_minmax(0,1fr)_10rem_3.5rem] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
                    <span>#</span>
                    <span>Section name <span className="text-red-500">*</span></span>
                    <span>Year level <span className="text-red-500">*</span></span>
                    <span className="text-right">Actions</span>
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {batchRows.map((row, index) => (
                      <li
                        key={row.id}
                        className="grid grid-cols-[2rem_minmax(0,1fr)_3.5rem] items-start gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_10rem_3.5rem]"
                      >
                        <span className="flex h-10 items-center text-xs font-bold text-slate-400 tabular-nums">{index + 1}</span>

                        <div className="min-w-0">
                          <input
                            type="text"
                            aria-label={`Section ${index + 1} name`}
                            data-tour={index === 0 ? 'section-row-name' : undefined}
                            value={row.section_name}
                            onChange={(e) => updateBatchRow(row.id, 'section_name', e.target.value.toUpperCase())}
                            placeholder="e.g. BSIT 1A"
                            aria-invalid={Boolean(row.error || liveRowErrors[index])}
                            className={`${CONTROL} ${controlTone(!!(row.error || liveRowErrors[index]))}`}
                          />
                          {(row.error || liveRowErrors[index]) && <p className="mt-1 text-xs font-semibold text-red-600" role="alert">{row.error || liveRowErrors[index]}</p>}
                        </div>

                        <select
                          aria-label={`Section ${index + 1} year level`}
                          data-tour={index === 0 ? 'section-row-year' : undefined}
                          value={row.year_level}
                          onChange={(e) => updateBatchRow(row.id, 'year_level', e.target.value as YearLevel)}
                          className={`${CONTROL} ${controlTone(false)} col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto`}
                        >
                          {YEAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>

                        <div className="col-start-3 row-start-1 flex h-10 items-center justify-end sm:col-start-auto sm:row-start-auto">
                          <TableActionButton
                            label="Remove"
                            aria-label={`Remove section ${index + 1}`}
                            variant="danger"
                            onClick={() => removeBatchRow(row.id)}
                            disabled={sectionCount <= 1}
                          >
                            <Trash2 size={15} />
                          </TableActionButton>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={addBatchRow}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-semibold text-[#8a5a12] transition hover:bg-amber-50"
                  >
                    <Plus size={16} />
                    Add another section
                  </button>
                </div>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-xs ${duplicateCount ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
              {duplicateCount
                ? `Rename ${duplicateCount === 1 ? 'the highlighted section' : `the ${duplicateCount} highlighted sections`} to continue.`
                : isEditMode
                  ? 'Changes apply to this section only.'
                  : `${sectionCount} section${sectionCount === 1 ? '' : 's'} will be created as active.`}
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || duplicateCount > 0}
                className="flex h-10 items-center gap-2 rounded-lg bg-[#4e0a10] px-5 text-sm font-bold text-white transition hover:bg-[#6b0e17] disabled:opacity-60"
              >
                {isSubmitting && <LoadingSpinner size={16} className="animate-spin" />}
                {isEditMode ? 'Save changes' : sectionCount === 1 ? 'Save section' : `Save ${sectionCount} sections`}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
