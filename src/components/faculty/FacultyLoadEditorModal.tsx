import { useMemo, useState } from 'react';
import NumberInput from '../ui/NumberInput';
import Modal from '../ui/Modal';
import { ModalButton, ModalField, ModalNotice } from '../ui/ModalForm';
import { modalBody, modalControl } from '../ui/modalStyles';
import api from '../../lib/api';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';
import { formatPersonName, type PersonNameParts } from '../../lib/personName';

export interface FacultyLoadValues extends PersonNameParts {
  id: number;
  first_name: string;
  last_name: string;
  max_units: number;
  deload_units: number;
  overload_units: number;
  assigned_units: number;
}

interface FacultyLoadEditorModalProps {
  faculty: FacultyLoadValues;
  onClose: () => void;
  onSaved: (updated: unknown) => void;
  onError: (message: string) => void;
}

const FIELDS = [
  {
    key: 'max_units' as const,
    label: 'Basic Load (Max Units)',
    hint: 'The contracted teaching load before any adjustment.',
    readOnly: false,
  },
  {
    key: 'deload_units' as const,
    label: 'Deload Units',
    hint: "Set by the instructor's designations.",
    readOnly: true,
  },
  {
    key: 'overload_units' as const,
    label: 'Overload Units',
    hint: 'Paid units allowed above the basic load.',
    readOnly: false,
  },
];

export default function FacultyLoadEditorModal({
  faculty,
  onClose,
  onSaved,
  onError,
}: FacultyLoadEditorModalProps) {
  const [values, setValues] = useState({
    max_units: faculty.max_units,
    deload_units: faculty.deload_units,
    overload_units: faculty.overload_units,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const facultyName = formatPersonName(faculty);

  const derived = useMemo(() => {
    const required = Math.max(0, values.max_units - values.deload_units);
    return {
      required,
      ceiling: required + values.overload_units,
    };
  }, [values]);

  const localError = useMemo(() => {
    if (values.deload_units > values.max_units) {
      return 'Deload units cannot exceed the basic load.';
    }
    if (Object.values(values).some(value => !Number.isFinite(value) || value < 0)) {
      return 'Unit values cannot be negative.';
    }
    return '';
  }, [values]);

  const handleSave = async () => {
    if (localError) return;

    setIsSaving(true);
    setFieldErrors({});
    try {
      const res = await api.put(`/faculties/${faculty.id}`, {
        max_units: values.max_units,
        overload_units: values.overload_units,
      });
      onSaved(res.data);
      onClose();
    } catch (err) {
      setFieldErrors(apiFieldErrors(err));
      onError(apiErrorMessage(err, 'Failed to update the teaching load.'));
    } finally {
      setIsSaving(false);
    }
  };

  const overCeiling = faculty.assigned_units > derived.ceiling && derived.ceiling > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Teaching Load"
      description={facultyName}
      closeOnOverlayClick={false}
      closeOnEscape={!isSaving}
      footer={<>
        <ModalButton onClick={onClose} disabled={isSaving}>Cancel</ModalButton>
        <ModalButton variant="primary" onClick={handleSave} loading={isSaving} disabled={Boolean(localError)}>Save Load</ModalButton>
      </>}
    >
      <div className={modalBody}>
        <ModalNotice>
          Names, department, program and status belong to the VPAA. Your role maintains the
          unit allowances the scheduler plans against.
        </ModalNotice>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map(field => (
            <ModalField
              key={field.key}
              label={field.label}
              htmlFor={`load-${field.key}`}
              hint={field.hint}
              error={fieldErrors[field.key]}
            >
              {field.readOnly ? (
                <input
                  id={`load-${field.key}`}
                  type="text"
                  readOnly
                  value={values[field.key]}
                  className={`${modalControl()} cursor-not-allowed !bg-slate-100 !text-slate-500`}
                />
              ) : (
                <NumberInput
                  id={`load-${field.key}`}
                  min={0}
                  value={values[field.key]}
                  onChange={e =>
                    setValues(prev => ({ ...prev, [field.key]: Number(e.target.value) }))
                  }
                  aria-invalid={fieldErrors[field.key] ? true : undefined}
                  className={`${modalControl(Boolean(fieldErrors[field.key]))} tabular-nums`}
                />
              )}
            </ModalField>
          ))}
        </div>

        <dl className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Net required load</dt>
            <dd className="font-bold tabular-nums text-slate-800">{derived.required} units</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Ceiling with allowances</dt>
            <dd className="font-bold tabular-nums text-slate-800">{derived.ceiling} units</dd>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
            <dt className="text-slate-500">Currently assigned</dt>
            <dd className={`font-bold tabular-nums ${overCeiling ? 'text-red-600' : 'text-slate-800'}`}>
              {faculty.assigned_units} units
            </dd>
          </div>
        </dl>

        {overCeiling && (
          <ModalNotice tone="warning">
            This instructor already carries {faculty.assigned_units} units, above the{' '}
            {derived.ceiling}-unit ceiling these values set. The scheduler reports that as a
            warning rather than blocking it, so existing assignments stay put.
          </ModalNotice>
        )}

        {localError && <ModalNotice tone="error" role="alert">{localError}</ModalNotice>}
      </div>
    </Modal>
  );
}
