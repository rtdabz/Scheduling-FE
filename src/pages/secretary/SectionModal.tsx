import React, { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import { ModalButton } from '../../components/ui/ModalForm';
import { modalControl, modalError, modalLabel } from '../../components/ui/modalStyles';
import { Layers, Eye } from 'lucide-react';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import { useToast } from '../../context/ToastContext';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';
import { generateSectionNames, indexToSuffix, normalizeSectionName } from '../../lib/sectionNaming';

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
  existingSections?: Array<{ id: number; section_name: string; department_id: number | null; semester_id: number }>;
}

const YEAR_OPTIONS: Array<{ value: YearLevel; label: string }> = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

/** Mirrors the backend batch limit (BatchStoreSectionsRequest: sections max:50). */
const MAX_SECTIONS_PER_BATCH = 50;

const LABEL = modalLabel;

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
  const [baseName, setBaseName] = useState('');
  // Until the user types, the program name follows the selected program's code.
  const [nameEdited, setNameEdited] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [submitted, setSubmitted] = useState(false);
  // Names the server reported as taken that our (possibly stale) list didn't know about.
  const [serverTaken, setServerTaken] = useState<string[]>([]);
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
      setBaseName('');
      setNameEdited(false);
      setQuantity('1');
    }
    setSubmitted(false);
    setServerTaken([]);
    setNameError('');
    setDepartmentError('');
    setProgramError('');
    setIsSubmitting(false);
  }, [isOpen, isEditMode, editingSection, isVpaa, userDepartmentId]);

  if (!isOpen) return null;

  const effectiveDepartmentId = isVpaa ? departmentId : (userDepartmentId?.toString() || '');

  const targetSemesterId = isEditMode ? editingSection?.semester_id : activeSemester?.id;
  const takenNames = new Set(
    existingSections
      .filter((section) => String(section.department_id) === effectiveDepartmentId
        && Number(section.semester_id) === Number(targetSemesterId)
        && section.id !== editingSection?.id)
      .map((section) => normalizeSectionName(section.section_name))
      .concat(isEditMode ? [] : serverTaken),
  );
  const takenMessage = (name: string) => `${normalizeSectionName(name)} already exists in this department for this semester.`;

  const liveNameError = isEditMode && sectionName.trim() && takenNames.has(normalizeSectionName(sectionName))
    ? takenMessage(sectionName)
    : '';

  const departmentPrograms = programs.filter((program) => String(program.department_id) === effectiveDepartmentId);
  // One program in the department → it is the only valid choice, so select it automatically.
  // Several programs → the user must pick one explicitly.
  const singleProgram = departmentPrograms.length === 1 ? departmentPrograms[0] : null;
  const effectiveProgramId = singleProgram ? String(singleProgram.id) : programId;
  const selectedProgram = departmentPrograms.find((program) => String(program.id) === effectiveProgramId);
  const programNameValue = nameEdited ? baseName : (selectedProgram?.code ?? '').toUpperCase();

  // ---- Quantity-based generation (create mode) ----
  const quantityValue = /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : NaN;
  const quantityError = quantity.trim() === ''
    ? (submitted ? 'Enter how many sections to add' : '')
    : !Number.isInteger(quantityValue) || quantityValue < 1
      ? 'Enter a whole number of 1 or more'
      : quantityValue > MAX_SECTIONS_PER_BATCH
        ? `You can add up to ${MAX_SECTIONS_PER_BATCH} sections at a time`
        : '';
  const validQuantity = quantity.trim() !== '' && !quantityError;

  // Name format: [Program name] [Year number][Suffix] — the year number comes from Year Level,
  // and suffixes continue after the highest one already used (BSIT 3A, 3B exist → start at C).
  const programName = normalizeSectionName(programNameValue);
  const { base, names: generatedNames, lastExistingSuffix, startIndex } = generateSectionNames(
    programName ? `${programName} ${yearLevel}` : '',
    validQuantity ? quantityValue : 0,
    takenNames,
  );
  const generatedErrors = generatedNames.map((name) => (takenNames.has(name) ? takenMessage(name) : ''));
  const conflictCount = isEditMode ? (liveNameError ? 1 : 0) : generatedErrors.filter(Boolean).length;
  // e.g. "BSIT 3" or "BSIT 3A" — the year and letter are added automatically, so flag them.
  const programNameHasYear = /\s\d+[A-Z]*$/.test(programName);
  const baseNameError = submitted && !programName ? 'Program name is required' : '';

  const ownDepartment = departments.find((d) => d.id === userDepartmentId);
  const semesterText = activeSemester ? fullSemesterLabel(activeSemester) : 'No active semester';
  const yearLabel = YEAR_OPTIONS.find((o) => o.value === yearLevel)?.label ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || conflictCount > 0) return;

    let hasError = false;
    if (!effectiveDepartmentId) {
      setDepartmentError('Department is required');
      hasError = true;
    } else {
      setDepartmentError('');
    }
    if (!selectedProgram) {
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
        await onSaveSingle(trimmedName, yearLevel, Number(effectiveDepartmentId), Number(effectiveProgramId));
        onClose();
      } catch (error) {
        const fieldError = apiFieldErrors(error).section_name;
        if (fieldError) setNameError(fieldError);
        else toast.error('Section not saved', apiErrorMessage(error, 'Failed to save the section.'));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setSubmitted(true);
    if (hasError || generatedNames.length === 0) return;

    // Snapshot the list being sent so server errors map back to the right names.
    const namesToSave = generatedNames;
    setIsSubmitting(true);
    try {
      // The batch endpoint validates everything first and inserts inside one transaction,
      // so either every section is created or none are.
      await onSaveBatch(
        namesToSave.map((name) => ({ section_name: name, year_level: yearLevel })),
        Number(effectiveDepartmentId),
        Number(effectiveProgramId),
      );
      onClose();
    } catch (error) {
      const fieldErrors = apiFieldErrors(error);
      const conflicts = namesToSave.filter((_, index) => fieldErrors[`sections.${index}.section_name`]);
      if (conflicts.length > 0) {
        // Another user likely added sections since this page loaded; skip past them in the preview.
        setServerTaken((prev) => [...new Set([...prev, ...conflicts])]);
        toast.error('Sections not saved', `${conflicts.join(', ')} already exist${conflicts.length === 1 ? 's' : ''}. No sections were created — the preview has been updated, review it and save again.`);
      } else {
        toast.error('Sections not saved', apiErrorMessage(error, 'Failed to save the sections. No sections were created.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatedCount = generatedNames.length;
  const firstConflict = generatedErrors.find(Boolean);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEditMode ? 'Edit Section' : 'Add Sections'}
      description={`${semesterText}${!isVpaa && ownDepartment ? ` · ${ownDepartment.department_code}` : ''}`}
      icon={<Layers size={18} />}
      size="form"
      closeLabel="Close"
      closeOnOverlayClick={false}
      closeOnEscape={!isSubmitting}
      bodyClassName="flex flex-col"
    >
        <form id="section-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
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
                    className={`${modalControl(!!departmentError)}`}
                  >
                    <option value="">Select department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id.toString()}>
                        {dept.department_code} - {dept.department_name}
                      </option>
                    ))}
                  </select>
                  {departmentError && <p className={modalError}>{departmentError}</p>}
                </div>
              )}

              <div>
                <label htmlFor="section-program-select" className={LABEL}>
                  Program <span className="text-red-500">*</span>
                </label>
                <select
                  id="section-program-select"
                  value={effectiveProgramId}
                  onChange={(e) => {
                    setProgramId(e.target.value);
                    setProgramError('');
                  }}
                  disabled={!effectiveDepartmentId || Boolean(singleProgram)}
                  className={`${modalControl(!!programError)}`}
                >
                  <option value="">{effectiveDepartmentId ? 'Select program' : 'Select a department first'}</option>
                  {departmentPrograms.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.code}{program.name ? ` - ${program.name}` : ''}
                    </option>
                  ))}
                </select>
                {programError ? (
                  <p className={modalError}>{programError}</p>
                ) : (
                  effectiveDepartmentId && (departmentPrograms.length === 0 ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">This department has no programs yet.</p>
                  ) : singleProgram ? (
                    <p className="mt-1 text-xs text-slate-500">Selected automatically. This is the only program available.</p>
                  ) : null)
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
                    className={`${modalControl(!!(nameError || liveNameError))}`}
                  />
                  {(nameError || liveNameError) && <p className={modalError} role="alert">{nameError || liveNameError}</p>}
                </div>
                <div>
                  <label htmlFor="section-edit-year" className={LABEL}>
                    Year level <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="section-edit-year"
                    value={yearLevel}
                    onChange={(e) => setYearLevel(e.target.value as YearLevel)}
                    className={`${modalControl()}`}
                  >
                    {YEAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8.5rem_10rem]">
                  <div className="min-w-0">
                    <label htmlFor="section-base-name" className={LABEL}>
                      Program name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="section-base-name"
                      type="text"
                      value={programNameValue}
                      maxLength={240}
                      autoComplete="off"
                      onChange={(e) => {
                        setBaseName(e.target.value.toUpperCase());
                        setNameEdited(true);
                        }}
                      placeholder="e.g. BSIT"
                      aria-invalid={Boolean(baseNameError)}
                      aria-describedby="section-base-name-hint"
                      className={`${modalControl(!!baseNameError)}`}
                    />
                    {baseNameError ? (
                      <p className={modalError} role="alert">{baseNameError}</p>
                    ) : programNameHasYear ? (
                      <p id="section-base-name-hint" className="mt-1 text-xs font-medium text-amber-700">
                        Enter the program name only (e.g. BSIT). The year number and letter are added from the Year Level.
                      </p>
                    ) : (
                      <p id="section-base-name-hint" className="mt-1 text-xs text-slate-500">The year number and letters A, B, C… are added for you.</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="section-quantity" className={LABEL}>
                      How many <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="section-quantity"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_SECTIONS_PER_BATCH}
                      step={1}
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(e.target.value);
                        }}
                      aria-invalid={Boolean(quantityError)}
                      className={`${modalControl(!!quantityError)} tabular-nums`}
                    />
                    {quantityError && <p className={modalError} role="alert">{quantityError}</p>}
                  </div>

                  <div>
                    <label htmlFor="section-year-level" className={LABEL}>
                      Year level <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="section-year-level"
                      value={yearLevel}
                      onChange={(e) => setYearLevel(e.target.value as YearLevel)}
                      className={`${modalControl()}`}
                    >
                      {YEAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <section
                  id="section-preview"
                  aria-label="Sections to be created"
                  aria-live="polite"
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <Eye size={13} />
                      Preview
                    </span>
                    {generatedCount > 0 && (
                      <span className="text-xs text-slate-500">
                        <span className="font-bold text-slate-800 tabular-nums">{generatedCount}</span>
                        {` section${generatedCount === 1 ? '' : 's'} · ${yearLabel}`}
                      </span>
                    )}
                  </header>

                  {generatedCount === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-slate-500">
                      Enter a program name and how many to add to see the sections here.
                    </p>
                  ) : (
                    <div className="max-h-[min(14rem,32dvh)] overflow-y-auto px-3 py-3 [scrollbar-color:rgb(203_213_225)_transparent] [scrollbar-width:thin]">
                      {lastExistingSuffix && (
                        <p className="mb-2.5 text-xs text-slate-600">
                          <span className="font-semibold">{base}{lastExistingSuffix}</span> already exists, so naming continues from{' '}
                          <span className="font-semibold">{indexToSuffix(startIndex)}</span>.
                        </p>
                      )}
                      <ul className="flex flex-wrap gap-2">
                        {generatedNames.map((name, index) => {
                          const hasError = Boolean(generatedErrors[index]);
                          return (
                            <li
                              key={name}
                              title={generatedErrors[index] || undefined}
                              className={`rounded-full border px-2.5 py-1 font-mono text-xs font-bold uppercase ${
                                hasError
                                  ? 'border-red-300 bg-red-50 text-red-700 line-through'
                                  : 'border-[#C9952A]/20 bg-[#C9952A]/10 text-[#C9952A]'
                              }`}
                            >
                              {name}
                            </li>
                          );
                        })}
                      </ul>
                      {firstConflict && <p className={`${modalError} mt-2.5`} role="alert">{firstConflict}</p>}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-black/5 bg-[#F7F4F0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
            <p className={`text-xs ${conflictCount ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
              {conflictCount
                ? isEditMode
                  ? 'Rename the highlighted section to continue.'
                  : `${conflictCount === 1 ? '1 name is' : `${conflictCount} names are`} already taken. Change the section name to continue.`
                : isEditMode
                  ? 'Changes apply to this section only.'
                  : generatedCount > 0
                    ? `${generatedCount} section${generatedCount === 1 ? '' : 's'} will be created as active.`
                    : 'Sections are created as active.'}
            </p>
            <div className="flex justify-end gap-2.5">
              <ModalButton onClick={onClose} disabled={isSubmitting}>Cancel</ModalButton>
              <ModalButton
                id="section-save"
                type="submit"
                variant="primary"
                loading={isSubmitting}
                disabled={conflictCount > 0 || (!isEditMode && submitted && generatedCount === 0)}
              >
                {isEditMode
                  ? 'Save changes'
                  : generatedCount <= 1
                    ? 'Save section'
                    : `Save ${generatedCount} sections`}
              </ModalButton>
            </div>
          </footer>
        </form>
    </Modal>
  );
}
