import { createPortal } from 'react-dom';
import { AlertTriangle, } from 'lucide-react';
import {
  LOAD_TIER_BADGE_CLASSES,
  LOAD_TIER_LABELS,
} from '../../lib/facultyLoad';
import type { OverloadConfirmation, OverloadProjection } from '../../lib/overloadConfirmation';

interface OverloadConfirmationModalProps {
  confirmation: OverloadConfirmation;
  isSaving?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const tierLabel = (projection: OverloadProjection): string =>
  projection.tier_label || LOAD_TIER_LABELS[projection.tier] || projection.tier;

/**
 * The question the server asks before an assignment pushes an instructor past
 * their Basic Load.
 *
 * Assignment is not being refused — it continues into the overload allowance and
 * then pro bono — so the modal reports what the load becomes and lets the user
 * decide. Answering No sends nothing at all, which is why the assignment behind it
 * is left exactly as it was.
 */
export default function OverloadConfirmationModal({
  confirmation,
  isSaving = false,
  onConfirm,
  onCancel,
}: OverloadConfirmationModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-200 flex items-start gap-3 bg-amber-50/60">
          <span className="mt-0.5 shrink-0 w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <AlertTriangle size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#1A1410]">{confirmation.message}</h2>
            <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
              The assignment is allowed — it continues into the overload allowance, then pro bono.
            </p>
          </div>
        </div>

        <div className="p-5 space-y-3 max-h-[55vh] overflow-y-auto">
          {confirmation.instructors.map(projection => (
            <div
              key={`${projection.faculty_id}-${projection.assignment_label ?? ''}`}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#1A1410]">{projection.faculty_name}</p>
                  {projection.assignment_label && (
                    <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
                      Assigning {projection.assignment_label}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${
                    LOAD_TIER_BADGE_CLASSES[projection.tier] ?? LOAD_TIER_BADGE_CLASSES.overload
                  }`}
                >
                  {tierLabel(projection)}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 border border-gray-100 py-2">
                  <dt className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Basic Load
                  </dt>
                  <dd className="text-sm font-bold text-[#1A1410]">{projection.basic_load}</dd>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-100 py-2">
                  <dt className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Current
                  </dt>
                  <dd className="text-sm font-bold text-[#1A1410]">{projection.current_units}</dd>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 py-2">
                  <dt className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                    After
                  </dt>
                  <dd className="text-sm font-bold text-amber-800">
                    {projection.projected_units}
                    <span className="text-[10px] font-semibold text-amber-700">
                      {' '}
                      (+{projection.added_units})
                    </span>
                  </dd>
                </div>
              </dl>

              <p className="mt-2 text-[11px] text-gray-500 font-semibold">
                Allowances: {projection.overload_units} overload + {projection.probono_units} pro
                bono, for a {projection.unit_ceiling}-unit ceiling.
              </p>

              {projection.tier === 'beyond_ceiling' && (
                <p className="mt-2 text-[11px] font-bold text-rose-700">
                  This goes past the {projection.unit_ceiling}-unit ceiling by{' '}
                  {projection.projected_units - projection.unit_ceiling} unit
                  {projection.projected_units - projection.unit_ceiling === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-end gap-2 bg-gray-50/50">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            No
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-5 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving && <LoadingSpinner size={15} className="animate-spin" />}
            <span>Yes, Proceed</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
import LoadingSpinner from "../ui/LoadingSpinner";
