import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { ModalButton, ModalNotice } from '../ui/ModalForm';
import { modalBody, modalControl, modalError } from '../ui/modalStyles';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { FULL_DAY_NAMES, formatTime12h } from '../../lib/timeGrid';
import type { AvailabilityWindow } from './facultyAvailability';

interface FacultyAvailabilityEditorProps {
  facultyId: number;
  facultyName: string;
  employmentType: 'full-time' | 'part-time';
  windows: AvailabilityWindow[];
  /** The employment type's default week; added windows extend it. */
  standardWindows?: AvailabilityWindow[];
  openingTime: string;
  closingTime: string;
  onClose: () => void;
  onSaved: (windows: AvailabilityWindow[]) => void;
  onError: (message: string) => void;
}

interface DraftWindow {
  key: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
}

const toDraft = (windows: AvailabilityWindow[]): DraftWindow[] =>
  windows.map((window, index) => ({
    key: `saved-${window.id ?? index}`,
    dayIndex: window.day_index,
    startTime: window.start_time.slice(0, 5),
    endTime: window.end_time.slice(0, 5),
  }));

const overlaps = (a: DraftWindow, b: DraftWindow): boolean =>
  a.dayIndex === b.dayIndex && a.startTime < b.endTime && a.endTime > b.startTime;

export default function FacultyAvailabilityEditor({
  facultyId,
  facultyName,
  employmentType,
  windows,
  standardWindows = [],
  openingTime,
  closingTime,
  onClose,
  onSaved,
  onError,
}: FacultyAvailabilityEditorProps) {
  const [drafts, setDrafts] = useState<DraftWindow[]>(() => toDraft(windows));
  const [nextKey, setNextKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const openingShort = openingTime.slice(0, 5);
  const closingShort = closingTime.slice(0, 5);

  const defaultsFor = (dayIndex: number) =>
    standardWindows
      .filter(window => window.day_index === dayIndex)
      .map(window => ({ start: window.start_time.slice(0, 5), end: window.end_time.slice(0, 5) }))
      .sort((a, b) => a.start.localeCompare(b.start));

  /** The first stretch of the operating day not covered by the default, or null when it covers all of it. */
  const freeGap = (dayIndex: number): { start: string; end: string } | null => {
    let cursor = openingShort;
    for (const window of defaultsFor(dayIndex)) {
      if (window.start > cursor) return { start: cursor, end: window.start };
      if (window.end > cursor) cursor = window.end;
    }
    return cursor < closingShort ? { start: cursor, end: closingShort } : null;
  };

  const rowErrors = (() => {
    const errors: Record<string, string> = {};

    drafts.forEach((draft, index) => {
      if (!draft.startTime || !draft.endTime) {
        errors[draft.key] = 'Both a start and an end time are required.';
        return;
      }
      if (draft.startTime >= draft.endTime) {
        errors[draft.key] = 'The window must end after it starts.';
        return;
      }
      if (draft.startTime < openingShort || draft.endTime > closingShort) {
        errors[draft.key] =
          `Must fall inside operating hours (${formatTime12h(openingShort)} - ${formatTime12h(closingShort)}).`;
        return;
      }
      const coveredByDefault = defaultsFor(draft.dayIndex).find(
        window => draft.startTime < window.end && draft.endTime > window.start
      );
      if (coveredByDefault) {
        errors[draft.key] =
          `Overlaps the default hours (${formatTime12h(coveredByDefault.start)} - ${formatTime12h(coveredByDefault.end)}). Add only hours outside the default.`;
        return;
      }
      const clash = drafts.find((other, otherIndex) => otherIndex !== index && overlaps(draft, other));
      if (clash) {
        errors[draft.key] = `Overlaps another ${FULL_DAY_NAMES[draft.dayIndex] ?? 'same-day'} window.`;
      }
    });

    return errors;
  })();

  const hasErrors = Object.keys(rowErrors).length > 0;

  const addWindow = (dayIndex: number) => {
    const gap = freeGap(dayIndex);
    if (!gap) return;
    setDrafts(prev => [
      ...prev,
      { key: `draft-${nextKey}`, dayIndex, startTime: gap.start, endTime: gap.end },
    ]);
    setNextKey(prev => prev + 1);
  };

  const employmentLabel = employmentType === 'part-time' ? 'part-time' : 'full-time';

  const updateDraft = (key: string, patch: Partial<DraftWindow>) => {
    setDrafts(prev => prev.map(draft => (draft.key === key ? { ...draft, ...patch } : draft)));
  };

  const removeDraft = (key: string) => {
    setDrafts(prev => prev.filter(draft => draft.key !== key));
  };

  const handleSave = async () => {
    if (hasErrors) return;

    setIsSaving(true);
    try {
      const res = await api.put<{ availabilities: AvailabilityWindow[] }>(
        `/faculties/${facultyId}/availabilities`,
        {
          availabilities: drafts.map(draft => ({
            day_index: draft.dayIndex,
            start_time: draft.startTime,
            end_time: draft.endTime,
          })),
        }
      );
      onSaved(res.data?.availabilities ?? []);
      onClose();
    } catch (err) {
      onError(apiErrorMessage(err, 'Failed to save the availability windows.'));
    } finally {
      setIsSaving(false);
    }
  };

  const byDay = FULL_DAY_NAMES.map((label, dayIndex) => ({
    label,
    dayIndex,
    rows: drafts
      .filter(draft => draft.dayIndex === dayIndex)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Teaching Availability"
      description={`${facultyName} · ${employmentType === 'part-time' ? 'Part-time' : 'Full-time'}`}
      size="form"
      closeOnOverlayClick={false}
      closeOnEscape={!isSaving}
      footerClassName="!justify-between"
      footer={<>
        <ModalButton variant="ghost" onClick={() => setDrafts([])} disabled={drafts.length === 0 || isSaving}>Remove added windows</ModalButton>
        <div className="flex gap-2.5">
          <ModalButton onClick={onClose} disabled={isSaving}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={handleSave} loading={isSaving} disabled={hasErrors}>Save Availability</ModalButton>
        </div>
      </>}
    >
      <div className={modalBody}>
          <ModalNotice tone="warning">
            The default {employmentLabel} hours apply automatically. Add a window to extend them,
            for example a morning block for a part-time instructor. Classes must fit inside the
            default hours or an added window.
          </ModalNotice>

          {byDay.map(day => (
            <section key={day.dayIndex} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{day.label}</h3>
                <button
                  type="button"
                  onClick={() => addWindow(day.dayIndex)}
                  disabled={!freeGap(day.dayIndex)}
                  title={freeGap(day.dayIndex) ? undefined : 'The default hours already cover the whole operating day.'}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-[#4e0a10] transition-colors hover:bg-[#4e0a10]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={13} />
                  Add window
                </button>
              </div>

              <p className="px-4 py-2 text-xs text-slate-500">
                {defaultsFor(day.dayIndex).length === 0
                  ? 'Default: not available'
                  : `Default: ${defaultsFor(day.dayIndex).map(window => `${formatTime12h(window.start)} – ${formatTime12h(window.end)}`).join(', ')}`}
              </p>
              {day.rows.length > 0 && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {day.rows.map(row => (
                    <div key={row.key} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          aria-label={`${day.label} window start`}
                          value={row.startTime}
                          step={300}
                          onChange={e => updateDraft(row.key, { startTime: e.target.value })}
                          className={`${modalControl(Boolean(rowErrors[row.key]))} !w-auto tabular-nums`}
                        />
                        <span className="text-xs font-semibold text-slate-500">to</span>
                        <input
                          type="time"
                          aria-label={`${day.label} window end`}
                          value={row.endTime}
                          step={300}
                          onChange={e => updateDraft(row.key, { endTime: e.target.value })}
                          className={`${modalControl(Boolean(rowErrors[row.key]))} !w-auto tabular-nums`}
                        />
                        <button
                          type="button"
                          onClick={() => removeDraft(row.key)}
                          aria-label={`Remove ${day.label} window`}
                          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      {rowErrors[row.key] && (
                        <p className={modalError}>{rowErrors[row.key]}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
      </div>
    </Modal>
  );
}
