import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../ui/Modal';
import { apiErrorMessage, apiFieldErrors } from '../../../lib/apiError';
import { useToast } from '../../../context/ToastContext';
import { curriculumImportService } from '../../../services/curriculum/curriculumImportService';
import { normalizeCode } from '../../../lib/curriculumImport/normalize';
import type { ClassificationRule, ImportSettings } from '../../../lib/curriculumImport/types';

interface ImportSettingsModalProps {
  settings: ImportSettings;
  onClose: () => void;
  onSaved: (settings: ImportSettings) => void;
}

type DraftRule = ClassificationRule & { key: string };

const control = 'h-9 rounded-lg border border-border bg-white px-2.5 text-[13px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-parchment disabled:text-muted';

const KIND_LABELS: Record<ClassificationRule['match_kind'], string> = { prefix: 'Prefix', exact: 'Exact code' };

const hoursLabel = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const hours = minutes / 60;
  const text = hours.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${text} hour${hours === 1 ? '' : 's'}`;
};

let nextKey = 0;
const withKey = (rule: ClassificationRule): DraftRule => ({ ...rule, key: rule.id ? `saved-${rule.id}` : `new-${nextKey++}` });

export default function ImportSettingsModal({ settings, onClose, onSaved }: ImportSettingsModalProps) {
  const { confirm } = useToast();
  const [lecture, setLecture] = useState(settings.lecture_minutes_per_unit);
  const [laboratory, setLaboratory] = useState(settings.laboratory_minutes_per_unit);
  const [rules, setRules] = useState<DraftRule[]>(() => settings.rules.map(withKey));
  const [acknowledgeOverlaps, setAcknowledgeOverlaps] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valueInputs = useRef(new Map<string, HTMLInputElement>());
  const readOnly = !settings.can_manage;
  const step = settings.slot_minutes;

  // Mirrors the server's rule normalization so duplicates show before saving.
  const ruleErrors = useMemo(() => {
    const errors = new Map<string, string>();
    const seen = new Map<string, number>();
    rules.forEach((rule, index) => {
      const value = normalizeCode(rule.match_value);
      if (!value) {
        errors.set(rule.key, 'Enter a code or prefix.');
        return;
      }
      const identity = `${rule.match_kind}|${value}`;
      const first = seen.get(identity);
      if (first !== undefined) errors.set(rule.key, `Same as rule ${first + 1}.`);
      else seen.set(identity, index);
    });
    return errors;
  }, [rules]);

  const rateError = (value: number) => {
    if (!Number.isInteger(value) || value < step || value > settings.max_minutes_per_unit) return `Use ${step} to ${settings.max_minutes_per_unit} minutes.`;
    if (value % step !== 0) return `Use steps of ${step} minutes.`;
    return null;
  };
  const lectureError = rateError(lecture) ?? serverErrors.lecture_minutes_per_unit ?? null;
  const laboratoryError = rateError(laboratory) ?? serverErrors.laboratory_minutes_per_unit ?? null;
  const blocked = ruleErrors.size > 0 || rateError(lecture) !== null || rateError(laboratory) !== null;

  const updateRule = (key: string, patch: Partial<ClassificationRule>) => {
    setRules((current) => current.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)));
    setServerErrors({});
  };

  const addRule = () => {
    const rule = withKey({ match_kind: 'prefix', match_value: '', category: 'major', enabled: true });
    setRules((current) => [...current, rule]);
    window.setTimeout(() => valueInputs.current.get(rule.key)?.focus(), 0);
  };

  const removeRule = async (rule: DraftRule) => {
    if (rule.id !== undefined) {
      const label = normalizeCode(rule.match_value) || 'this rule';
      const confirmed = await confirm({
        title: 'Delete classification rule?',
        message: `The ${KIND_LABELS[rule.match_kind].toLowerCase()} rule "${label}" stops applying once you save. Existing courses and curricula keep their categories.`,
        confirmLabel: 'Delete rule',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    setRules((current) => current.filter((candidate) => candidate.key !== rule.key));
    setServerErrors({});
  };

  const save = async () => {
    if (blocked) return;
    setSaving(true);
    setServerErrors({});
    setMessage(null);
    try {
      const saved = await curriculumImportService.updateSettings({
        expected_revision: settings.revision,
        lecture_minutes_per_unit: lecture,
        laboratory_minutes_per_unit: laboratory,
        rules: rules.map(({ match_kind, match_value, category, enabled }) => ({ match_kind, match_value, category, enabled })),
        acknowledge_overlaps: acknowledgeOverlaps,
      });
      onSaved(saved);
    } catch (error) {
      const fieldErrors = apiFieldErrors(error);
      setServerErrors(fieldErrors);
      // Field errors are shown beside their rule or rate; the banner only points to them.
      setMessage(Object.keys(fieldErrors).length > 0 ? 'Check the highlighted fields.' : apiErrorMessage(error, 'The settings could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const conversion = (id: 'lecture_minutes_per_unit' | 'laboratory_minutes_per_unit', label: string, value: number, setValue: (value: number) => void, error: string | null) => (
    <div className="rounded-xl border border-border bg-white p-4">
      <label htmlFor={id} className="block text-[13px] font-bold text-text">{label}</label>
      <p className="text-xs text-muted">Minutes per unit</p>
      <div className="mt-2 flex items-center gap-3">
        <div className={`flex h-10 items-center rounded-lg border bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${error ? 'border-red-300' : 'border-border'}`}>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={step}
            max={settings.max_minutes_per_unit}
            step={step}
            value={Number.isFinite(value) ? value : ''}
            disabled={readOnly}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-equivalent${error ? ` ${id}-error` : ''}`}
            onChange={(event) => setValue(event.target.value === '' ? Number.NaN : Number(event.target.value))}
            className="h-full w-16 rounded-l-lg bg-transparent pl-3 text-[15px] font-bold tabular-nums text-text focus:outline-none disabled:cursor-not-allowed disabled:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pr-3 text-xs text-muted">min</span>
        </div>
        <p id={`${id}-equivalent`} className="rounded-lg bg-parchment px-3 py-2 text-[13px] text-text">
          = <span className="font-bold tabular-nums">{hoursLabel(value)}</span> per unit
        </p>
      </div>
      {error
        ? <p id={`${id}-error`} className="mt-2 text-xs font-semibold text-red-700">{error}</p>
        : <p className="mt-2 text-xs text-muted">Recorded with each imported course. Scheduling uses the course's Total Hours.</p>}
    </div>
  );

  const exampleLecture = Number.isFinite(lecture) ? 2 * lecture : 0;
  const exampleLab = Number.isFinite(laboratory) ? laboratory : 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Curriculum import settings"
      description="Defaults for future imports in your department. Saving never changes existing curricula, courses, or schedules."
      size="lg"
      footer={(
        <>
          {!readOnly && blocked && <p className="mr-auto text-xs font-semibold text-red-700" role="status">Fix the highlighted fields to save.</p>}
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-border bg-white px-4 text-[13px] font-bold text-text hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button type="button" onClick={() => void save()} disabled={saving || blocked} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-6 px-4 py-5 sm:px-5">
        {readOnly && <p className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-text">Only the department secretary can change these settings.</p>}
        {message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{message}</p>}

        <section aria-labelledby="conversion-heading">
          <h3 id="conversion-heading" className="text-[15px] font-semibold text-text">Credit-to-time conversion</h3>
          <p className="mt-0.5 text-[13px] text-muted">How many minutes of class each credit unit becomes in future imports.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {conversion('lecture_minutes_per_unit', 'Lecture', lecture, setLecture, lectureError)}
            {conversion('laboratory_minutes_per_unit', 'Laboratory', laboratory, setLaboratory, laboratoryError)}
          </div>
          <p className="mt-2 text-xs text-muted tabular-nums">
            Example: 2 lecture + 1 lab unit = {hoursLabel(exampleLecture)} + {hoursLabel(exampleLab)} = {hoursLabel(exampleLecture + exampleLab)} a week.
          </p>
        </section>

        <section aria-labelledby="rules-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="rules-heading" className="text-[15px] font-semibold text-text">
                Classification rules <span className="font-sans text-[13px] font-normal text-muted tabular-nums">{rules.length}</span>
              </h3>
              <p className="mt-0.5 text-[13px] text-muted">Suggest Major or Minor from the course code. An exact code beats a prefix.</p>
            </div>
            {!readOnly && (
              <button type="button" onClick={addRule} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-white px-3 text-[13px] font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <Plus size={15} aria-hidden="true" /> Add rule
              </button>
            )}
          </div>

          <div className="mt-3 max-h-[19rem] overflow-auto rounded-xl border border-border bg-white">
            <table className="w-full min-w-[34rem] text-[13px]">
              <thead className="sticky top-0 z-10 bg-parchment text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="w-36 px-3 py-2 font-semibold">Match type</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Code or prefix</th>
                  <th scope="col" className="w-32 px-3 py-2 font-semibold">Classification</th>
                  <th scope="col" className="w-32 px-3 py-2 font-semibold">Status</th>
                  <th scope="col" className="w-12 px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[13px] text-muted">
                      No rules yet. Every imported course will need its category chosen by hand.
                    </td>
                  </tr>
                )}
                {rules.map((rule, index) => {
                  const error = ruleErrors.get(rule.key) ?? serverErrors[`rules.${index}.match_value`] ?? null;
                  const dim = rule.enabled ? '' : 'opacity-60';
                  return (
                    <tr key={rule.key} className={`border-t border-border align-top ${rule.enabled ? '' : 'bg-parchment/60'}`}>
                      <td className={`px-3 py-2 ${dim}`}>
                        <select aria-label={`Match type for rule ${index + 1}`} value={rule.match_kind} disabled={readOnly} onChange={(event) => updateRule(rule.key, { match_kind: event.target.value as ClassificationRule['match_kind'] })} className={`${control} w-full`}>
                          <option value="prefix">Prefix</option>
                          <option value="exact">Exact code</option>
                        </select>
                      </td>
                      <td className={`px-3 py-2 ${dim}`}>
                        <input
                          ref={(element) => { if (element) valueInputs.current.set(rule.key, element); else valueInputs.current.delete(rule.key); }}
                          aria-label={`Code or prefix for rule ${index + 1}`}
                          aria-invalid={error ? true : undefined}
                          value={rule.match_value}
                          disabled={readOnly}
                          maxLength={64}
                          placeholder={rule.match_kind === 'prefix' ? 'e.g. IT' : 'e.g. IT 101'}
                          onChange={(event) => updateRule(rule.key, { match_value: event.target.value })}
                          className={`${control} w-full font-semibold uppercase placeholder:font-normal placeholder:normal-case ${error ? 'border-red-300 bg-red-50/60' : ''}`}
                        />
                        {error
                          ? <p className="mt-1 text-xs font-semibold text-red-700">{error}</p>
                          : rule.sample_matches && rule.sample_matches.length > 0 && <p className="mt-1 truncate text-xs text-muted">Matches {rule.sample_matches.join(', ')}</p>}
                      </td>
                      <td className={`px-3 py-2 ${dim}`}>
                        <select aria-label={`Classification for rule ${index + 1}`} value={rule.category} disabled={readOnly} onChange={(event) => updateRule(rule.key, { category: event.target.value as ClassificationRule['category'] })} className={`${control} w-full`}>
                          <option value="major">Major</option>
                          <option value="minor">Minor</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.enabled}
                          aria-label={`Rule ${index + 1} enabled`}
                          disabled={readOnly}
                          onClick={() => updateRule(rule.key, { enabled: !rule.enabled })}
                          className="flex h-9 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
                        >
                          <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${rule.enabled ? 'bg-primary' : 'bg-border'}`}>
                            <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${rule.enabled ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
                          </span>
                          <span className={`text-xs font-semibold ${rule.enabled ? 'text-text' : 'text-muted'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!readOnly && (
                          <button type="button" onClick={() => void removeRule(rule)} aria-label={`Delete rule ${index + 1}${rule.match_value ? `, ${normalizeCode(rule.match_value)}` : ''}`} title="Delete rule" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {settings.overlaps.length > 0 && (
            <div className="mt-3 rounded-lg border border-accent/40 bg-accent/[0.07] px-3 py-2 text-xs text-text">
              <p className="font-bold">Saved exceptions</p>
              <ul className="mt-0.5 list-disc pl-4">
                {settings.overlaps.map((overlap) => <li key={`${overlap.broader}-${overlap.specific}`}>{overlap.specific} is {overlap.specific_category}, overriding prefix {overlap.broader} ({overlap.broader_category})</li>)}
              </ul>
            </div>
          )}
          {!readOnly && (serverErrors.acknowledge_overlaps || settings.overlaps.length > 0) && (
            <label className="mt-3 flex items-start gap-2 text-xs text-text">
              <input type="checkbox" checked={acknowledgeOverlaps} onChange={(event) => setAcknowledgeOverlaps(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>{serverErrors.acknowledge_overlaps ?? 'I confirm the more specific rules above intentionally override broader prefixes.'}</span>
            </label>
          )}
        </section>
      </div>
    </Modal>
  );
}
