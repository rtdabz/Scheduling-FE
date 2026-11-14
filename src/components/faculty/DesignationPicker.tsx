import { useMemo, useState } from 'react';
import { BadgeCheck, ChevronRight, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { ModalButton, ModalState } from '../ui/ModalForm';
import {
  describeDeload,
  designationLabel,
  groupDesignations,
  totalDeload,
  type Designation,
} from '../../lib/designations';

interface DesignationPickerProps {
  designations: Designation[];
  held?: Designation[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  maxUnits?: number;
  disabledHint?: string;
}

export default function DesignationPicker({
  designations,
  held = [],
  value,
  onChange,
  disabled = false,
  maxUnits,
  disabledHint = 'Requires the Manage Designations capability.',
}: DesignationPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);

  const options = useMemo(() => {
    const byId = new Map<number, Designation>();
    [...designations, ...held].forEach((designation) => {
      if (!byId.has(designation.id)) byId.set(designation.id, designation);
    });
    return [...byId.values()];
  }, [designations, held]);

  const groups = useMemo(() => groupDesignations(options), [options]);
  const selectedFrom = (ids: string[]) => ids
    .map((id) => options.find((designation) => String(designation.id) === id))
    .filter((designation): designation is Designation => designation !== undefined);

  const selected = selectedFrom(value);
  const deload = totalDeload(value, options);
  const draftDeload = totalDeload(draft, options);

  const openPicker = () => {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  };

  const blocked = (id: string) => maxUnits !== undefined
    && draftDeload + (options.find((designation) => String(designation.id) === id)?.deload_units ?? 0) > maxUnits;

  const toggleDraft = (id: string) => {
    if (draft.includes(id)) setDraft(draft.filter((selectedId) => selectedId !== id));
    else if (!blocked(id)) setDraft([...draft, id]);
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const summary = (deloadUnits: number) => {
    if (maxUnits === undefined) return deloadUnits > 0 ? `Deloads ${deloadUnits} units in total.` : '';
    const load = describeDeload(maxUnits, deloadUnits);
    if (deloadUnits > maxUnits) return `${load}. The deload is more than the ${maxUnits}-unit maximum; remove a designation.`;
    return deloadUnits === maxUnits ? `${load} (Basic Load used up).` : load;
  };

  return (
    <div>
      <div
        className={`flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 ${disabled ? 'opacity-60' : 'cursor-pointer hover:border-[#C9952A]/60'}`}
        onClick={openPicker}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-live="polite">
          {selected.length === 0 ? (
            <span className="text-sm text-gray-400">No designation</span>
          ) : selected.map((designation, index) => (
            <span
              key={designation.id}
              className="inline-flex items-center gap-1 rounded-lg border border-[#C9952A]/30 bg-[#C9952A]/10 py-1 pl-2 pr-1 text-xs font-bold text-[#7a5a10]"
            >
              <span className="tabular-nums text-[#C9952A]">{index + 1}.</span>
              {designationLabel(designation)}
              {designation.deload_units > 0 && <span className="font-semibold text-[#8a6412]/80">(-{designation.deload_units} {designation.deload_units === 1 ? "unit" : "units"})</span>}
              {!disabled && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(value.filter((id) => id !== String(designation.id)));
                  }}
                  aria-label={`Remove ${designationLabel(designation)}`}
                  className="ml-0.5 rounded p-0.5 text-[#8a6412] hover:bg-[#C9952A]/20"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openPicker();
            }}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-bold text-[#5A1220] hover:bg-[#5A1220]/5"
          >
            {selected.length === 0 ? 'Select' : 'Change'}
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <p className="mt-1 text-[10px] font-semibold text-gray-500">
        {disabled ? disabledHint : summary(deload)}
      </p>

      {/* The dialog is portalled, but its clicks still bubble here through React; keep them from reaching the trigger row. */}
      <div className="contents" onClick={(event) => event.stopPropagation()}>
        <Modal
          isOpen={open}
          onClose={() => setOpen(false)}
          title="Select Designations"
          description={`${draft.length} selected`}
          icon={<BadgeCheck size={18} />}
          footerClassName="!justify-between"
          footer={<>
            <p className="min-w-0 flex-1 text-xs leading-5 text-slate-500">{summary(draftDeload)}</p>
            <div className="flex gap-2.5">
              <ModalButton onClick={() => setOpen(false)}>Cancel</ModalButton>
              <ModalButton variant="primary" onClick={apply}>Done</ModalButton>
            </div>
          </>}
        >
          <div role="group" aria-label="Designations" className="space-y-2 px-4 py-4 sm:px-5">
            {groups.length === 0 && <ModalState title="No designations yet">Designations appear here once they have been set up.</ModalState>}
            {groups.map((group, groupIndex) => (
              <div
                key={group.heading?.id ?? `standalone-${groupIndex}`}
                className="rounded-xl border border-slate-200 bg-white p-1.5"
              >
                {group.heading && (
                  <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.heading.name}</p>
                )}
                {group.options.map((designation) => {
                  const id = String(designation.id);
                  const checked = draft.includes(id);
                  const unavailable = !checked && blocked(id);
                  return (
                    <label
                      key={designation.id}
                      className={`flex min-h-10 items-center gap-3 rounded-lg px-2 py-2 text-sm ${group.heading ? 'pl-4' : ''} ${unavailable ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700 hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={unavailable}
                        onChange={() => toggleDraft(id)}
                        className="h-4 w-4 accent-[#4e0a10]"
                      />
                      <span className="flex-1 truncate">{group.heading ? designation.name : designationLabel(designation)}</span>
                      {designation.status === 'inactive' && <span className="text-[10px] font-bold uppercase text-slate-400">Inactive</span>}
                      {designation.deload_units > 0 && <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">-{designation.deload_units} units</span>}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </Modal>
      </div>
    </div>
  );
}
