import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Plus, Trash2, X } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { FULL_DAY_NAMES, formatTime12h } from '../../lib/timeGrid';
import type { AvailabilityWindow } from './facultyAvailability';

interface FacultyAvailabilityEditorProps {
  facultyId: number;
  facultyName: string;
  employmentType: 'full-time' | 'part-time';
  windows: AvailabilityWindow[];
  openingTime: string;
  closingTime: string;
  onClose: () => void;
  onSaved: (windows: AvailabilityWindow[]) => void;
  onError: (message: string) => void;
}

/** A row being edited: no id yet, and times held as the `HH:MM` the input gives. */
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

/**
 * Weekly window editor. Saves with a whole-week replace, matching
 * `PUT /faculties/{id}/availabilities`: what the grid shows is what is stored.
 */
export default function FacultyAvailabilityEditor({
  facultyId,
  facultyName,
  employmentType,
  windows,
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

  // Mirrors the server's `after` validation so the reasons show up as the user
  // types rather than only on submit.
  const rowErrors = useMemo(() => {
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
      const clash = drafts.find((other, otherIndex) => otherIndex !== index && overlaps(draft, other));
      if (clash) {
        errors[draft.key] = `Overlaps another ${FULL_DAY_NAMES[draft.dayIndex] ?? 'same-day'} window.`;
      }
    });

    return errors;
  }, [drafts, openingShort, closingShort]);

  const hasErrors = Object.keys(rowErrors).length > 0;

  const addWindow = (dayIndex: number) => {
    setDrafts(prev => [
      ...prev,
      { key: `draft-${nextKey}`, dayIndex, startTime: openingShort, endTime: closingShort },
    ]);
    setNextKey(prev => prev + 1);
  };

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

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-base font-bold text-[#1A1410]">Teaching Availability</h2>
            <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
              {facultyName} &middot; {employmentType === 'part-time' ? 'Part-time' : 'Full-time'}
            </p>
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
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {employmentType === 'part-time'
                ? 'A part-time instructor can only be scheduled inside these windows, and a day with no window is treated as unavailable. Leaving the week empty makes them unassignable.'
                : 'Windows are advisory for a full-time instructor: the scheduler records them, but assignment is not blocked by them.'}
            </span>
          </div>

          {byDay.map(day => (
            <div key={day.dayIndex} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/70 border-b border-gray-100">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-600">{day.label}</span>
                <button
                  type="button"
                  onClick={() => addWindow(day.dayIndex)}
                  className="flex items-center gap-1 text-[11px] font-bold text-[#5A1220] hover:text-[#C9952A] transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                  Add window
                </button>
              </div>

              {day.rows.length === 0 ? (
                <p className="px-4 py-3 text-[11px] italic text-gray-400">
                  Unrestricted &mdash; any operating hour.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {day.rows.map(row => (
                    <div key={row.key} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={row.startTime}
                          step={300}
                          onChange={e => updateDraft(row.key, { startTime: e.target.value })}
                          className={`px-3 py-1.5 border rounded-lg outline-none text-xs bg-white font-semibold focus:ring-2 ${
                            rowErrors[row.key]
                              ? 'border-red-400 focus:ring-red-400'
                              : 'border-gray-200 focus:ring-[#C9952A]'
                          }`}
                        />
                        <span className="text-xs font-bold text-gray-400">to</span>
                        <input
                          type="time"
                          value={row.endTime}
                          step={300}
                          onChange={e => updateDraft(row.key, { endTime: e.target.value })}
                          className={`px-3 py-1.5 border rounded-lg outline-none text-xs bg-white font-semibold focus:ring-2 ${
                            rowErrors[row.key]
                              ? 'border-red-400 focus:ring-red-400'
                              : 'border-gray-200 focus:ring-[#C9952A]'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => removeDraft(row.key)}
                          aria-label={`Remove ${day.label} window`}
                          className="ml-auto text-gray-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {rowErrors[row.key] && (
                        <p className="text-[11px] font-semibold text-red-500">{rowErrors[row.key]}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-gray-200 bg-gray-50/50 flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={() => setDrafts([])}
            disabled={drafts.length === 0 || isSaving}
            className="text-xs font-bold text-gray-500 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear the week
          </button>
          <div className="flex gap-3">
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
              disabled={isSaving || hasErrors}
              className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-5 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving && <Loader2 size={15} className="animate-spin" />}
              <span>Save Availability</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
