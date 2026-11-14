import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { ModalButton, ModalField } from '../ui/ModalForm';
import { modalBody, modalControl } from '../ui/modalStyles';
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
  const departmentId = isEditMode && curriculum?.department_id
    ? curriculum.department_id
    : getStoredUserDepartmentId();
  const departmentPrograms = programs.filter((program) => program.department_id === departmentId);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Curriculum' : 'Add New Curriculum'}
      description={isEditMode ? 'Update the curriculum name, CMO number, and effective school year.' : 'Create the curriculum record, then add or import its courses.'}
      closeOnOverlayClick={false}
      closeOnEscape={!isSubmitting}
      footer={<>
        <ModalButton onClick={onClose} disabled={isSubmitting}>Cancel</ModalButton>
        <ModalButton id="curriculum-save" type="submit" form="curriculum-form" variant="primary" loading={isSubmitting}>
          {isEditMode ? 'Save Changes' : 'Create Curriculum'}
        </ModalButton>
      </>}
    >
      <form id="curriculum-form" onSubmit={handleSubmit} noValidate className={modalBody}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ModalField label="Curriculum Name" htmlFor="curriculum-name-input" required error={nameError}>
            <input
              id="curriculum-name-input"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              placeholder="e.g. BS Computer Science 2024"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'curriculum-name-input-error' : undefined}
              className={modalControl(!!nameError)}
            />
          </ModalField>

          <ModalField label="CMO No." htmlFor="curriculum-code-input" required error={codeError}>
            <input
              id="curriculum-code-input"
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(''); }}
              placeholder="e.g. CMO 1 S 2026"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'curriculum-code-input-error' : undefined}
              className={`${modalControl(!!codeError)} font-mono`}
            />
          </ModalField>
        </div>

        <div id="curriculum-effective-year">
          <ModalField
            label="Effective School Year"
            htmlFor="curriculum-start-year-input"
            required
            error={effectiveYearError}
            hint="Enter the starting year; the ending year is the year after."
          >
            <div className="flex items-center gap-2">
              <input
                id="curriculum-start-year-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                aria-label="Start year"
                aria-invalid={effectiveYearError ? true : undefined}
                value={startYear}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setStartYear(value);
                  if (value.length === 4) setEndYear(String(Number(value) + 1));
                  setEffectiveYearError('');
                }}
                placeholder="2025"
                className={modalControl(!!effectiveYearError)}
              />
              <span className="font-semibold text-slate-400" aria-hidden="true">&ndash;</span>
              <input
                id="curriculum-end-year-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                aria-label="End year"
                aria-invalid={effectiveYearError ? true : undefined}
                value={endYear}
                onChange={(e) => { setEndYear(e.target.value.replace(/\D/g, '')); setEffectiveYearError(''); }}
                placeholder="2026"
                className={modalControl(!!effectiveYearError)}
              />
            </div>
          </ModalField>
        </div>

        {canChooseProgram && departmentPrograms.length > 0 && (
          <ModalField label="Program / Major" htmlFor="curriculum-program-select">
            <select
              id="curriculum-program-select"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className={modalControl()}
            >
              <option value="">None</option>
              {departmentPrograms.map((program) => (
                <option key={program.id} value={program.id}>
                  {programLabel(program)}
                </option>
              ))}
            </select>
          </ModalField>
        )}
      </form>
    </Modal>
  );
}
