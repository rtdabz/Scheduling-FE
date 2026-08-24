import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';

export interface FacultyLoadValues {
  id: number;
  first_name: string;
  last_name: string;
  max_units: number;
  deload_units: number;
  overload_units: number;
  probono_units: number;
  assigned_units: number;
}

interface FacultyLoadEditorModalProps {
  faculty: FacultyLoadValues;
  onClose: () => void;
  onSaved: (updated: unknown) => void;
  onError: (message: string) => void;
}

/** The four allowances the secretary owns, in the order they build on each other. */
const FIELDS = [
  {
    key: 'max_units' as const,
    label: 'Basic Load (Max Units)',
    hint: 'The contracted teaching load before any adjustment.',
  },
  {
    key: 'deload_units' as const,
    label: 'Deload Units',
    hint: 'Units subtracted for administrative or designated duties.',
  },
  {
    key: 'overload_units' as const,
    label: 'Overload Units',
    hint: 'Paid units allowed above the basic load.',
  },
  {
    key: 'probono_units' as const,
    label: 'Pro Bono Units',
    hint: 'Unpaid units the instructor volunteers to carry.',
  },
];

/**
 * The secretary's write path into an instructor record. The API narrows a
 * secretary to these four columns, so the form offers exactly those and nothing
 * else: sending any other key comes back 403.
 */
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
    probono_units: faculty.probono_units,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const facultyName = `${faculty.first_name} ${faculty.last_name}`.trim();

  const derived = useMemo(() => {
    const required = Math.max(0, values.max_units - values.deload_units);
    return {
      required,
      ceiling: required + values.overload_units + values.probono_units,
    };
  }, [values]);

  const localError = useMemo(() => {
    if (values.max_units <= 0) return 'The basic load must be greater than 0.';
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
      const res = await api.put(`/faculties/${faculty.id}`, values);
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

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-base font-bold text-[#1A1410]">Teaching Load</h2>
            <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{facultyName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[11px] font-semibold text-slate-600">
            <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              Names, department, program and status belong to the VPAA. Your role maintains the
              unit allowances the scheduler plans against.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map(field => (
              <div key={field.key}>
                <label
                  htmlFor={`load-${field.key}`}
                  className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5"
                >
                  {field.label}
                </label>
                <input
                  id={`load-${field.key}`}
                  type="number"
                  min={0}
                  value={values[field.key]}
                  onChange={e =>
                    setValues(prev => ({ ...prev, [field.key]: Number(e.target.value) }))
                  }
                  className={`w-full px-4 py-2.5 border rounded-xl outline-none text-sm bg-white focus:ring-2 ${
                    fieldErrors[field.key]
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                <p className="mt-1 text-[10px] text-gray-400 font-semibold leading-snug">{field.hint}</p>
                {fieldErrors[field.key] && (
                  <p className="mt-1 text-[11px] font-semibold text-red-500">{fieldErrors[field.key]}</p>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-500">Net required load</span>
              <span className="font-bold text-gray-800">{derived.required} units</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-500">Ceiling with allowances</span>
              <span className="font-bold text-gray-800">{derived.ceiling} units</span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
              <span className="font-semibold text-gray-500">Currently assigned</span>
              <span className={`font-bold ${overCeiling ? 'text-red-600' : 'text-gray-800'}`}>
                {faculty.assigned_units} units
              </span>
            </div>
          </div>

          {overCeiling && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
              This instructor already carries {faculty.assigned_units} units, above the{' '}
              {derived.ceiling}-unit ceiling these values set. The scheduler reports that as a
              warning rather than blocking it, so existing assignments stay put.
            </p>
          )}

          {localError && (
            <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] font-semibold text-red-600">
              {localError}
            </p>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 bg-gray-50/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || Boolean(localError)}
            className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-5 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving && <LoadingSpinner size={15} />}
            <span>Save Load</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
import LoadingSpinner from "../ui/LoadingSpinner";
