import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, ChevronRight, X } from 'lucide-react';
import {
  MAX_DESIGNATIONS_PER_INSTRUCTOR,
  describeDeload,
  designationLabel,
  groupDesignations,
  totalDeload,
  type Designation,
} from '../../lib/designations';

interface DesignationPickerProps {
  /** Assignable designations, usually the active list. */
  designations: Designation[];
  /**
   * What the instructor holds now. Merged into the options so saving an
   * instructor who still holds an inactive designation does not drop it.
   */
  held?: Designation[];
  /** Selected designation ids, in the order they will be listed and printed. */
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** When given, the Basic Load the selection leaves is shown underneath. */
  maxUnits?: number;
  disabledHint?: string;
}

/**
 * Picks up to three designations for an instructor.
 *
 * The form shows only the current selection; clicking it opens a checklist
 * modal that edits a draft, so Cancel leaves the form untouched. Sub-designations
 * are listed under their heading ("Director" over "Networking Dev't"); the
 * heading itself cannot be picked. Selection order is kept, because it is the
 * order the teaching-load sheet prints them in.
 */
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
  const draftFull = draft.length >= MAX_DESIGNATIONS_PER_INSTRUCTOR;
  const draftDeload = totalDeload(draft, options);

  const openPicker = () => {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  };

  const toggleDraft = (id: string) => {
    if (draft.includes(id)) {
      setDraft(draft.filter((selectedId) => selectedId !== id));
    } else if (!draftFull) {
      setDraft([...draft, id]);
    }
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  // Escape closes only this modal, not the instructor form underneath it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const summary = (deloadUnits: number, full: boolean) => [
    `Up to ${MAX_DESIGNATIONS_PER_INSTRUCTOR} designations${full ? ' (limit reached)' : ''}.`,
    maxUnits !== undefined ? describeDeload(maxUnits, deloadUnits) : deloadUnits > 0 ? `Deloads ${deloadUnits} units in total.` : '',
  ].filter(Boolean).join(' ');

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
              {designation.deload_units > 0 && <span className="font-semibold text-[#8a6412]/80">(-{designation.deload_units}u)</span>}
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
        {disabled ? disabledHint : summary(deload, value.length >= MAX_DESIGNATIONS_PER_INSTRUCTOR)}
      </p>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 font-sans animate-in fade-in duration-200"
          onClick={(event) => {
            // Portal events still bubble to the trigger in the React tree.
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="designation-picker-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#F7F4F0] shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start gap-3 bg-[#4e0a10] p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#C9952A]">
                <BadgeCheck size={18} />
              </span>
              <div className="flex-1">
                <h2 id="designation-picker-title" className="text-base font-bold text-white">Select Designations</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-amber-100/75">
                  {draft.length} of {MAX_DESIGNATIONS_PER_INSTRUCTOR} selected
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <X size={18} />
              </button>
            </div>

            <div role="group" aria-label="Designations" className="min-h-0 flex-1 overflow-y-auto p-3">
              {groups.length === 0 && <p className="px-2 py-3 text-xs italic text-gray-400">No designations have been set up yet.</p>}
              {groups.map((group, groupIndex) => (
                <div
                  key={group.heading?.id ?? `standalone-${groupIndex}`}
                  className={`rounded-xl border border-gray-200 bg-white p-1.5 ${groupIndex > 0 ? 'mt-2' : ''}`}
                >
                  {group.heading && (
                    <p className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-500">{group.heading.name}</p>
                  )}
                  {group.options.map((designation) => {
                    const id = String(designation.id);
                    const checked = draft.includes(id);
                    const unavailable = !checked && draftFull;
                    return (
                      <label
                        key={designation.id}
                        className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${group.heading ? 'pl-4' : ''} ${unavailable ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-700 hover:bg-gray-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={unavailable}
                          onChange={() => toggleDraft(id)}
                          className="h-4 w-4 accent-[#5A1220]"
                        />
                        <span className="flex-1 truncate">{group.heading ? designation.name : designationLabel(designation)}</span>
                        {designation.status === 'inactive' && <span className="text-[10px] font-bold uppercase text-gray-400">Inactive</span>}
                        {designation.deload_units > 0 && <span className="shrink-0 text-xs font-semibold text-gray-500">-{designation.deload_units} units</span>}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white/60 p-4">
              <p className="mb-3 text-[11px] font-semibold text-gray-500">{summary(draftDeload, draftFull)}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="rounded-xl bg-[#5A1220] px-4 py-2 text-sm font-bold text-white hover:bg-[#4a0f1a]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
