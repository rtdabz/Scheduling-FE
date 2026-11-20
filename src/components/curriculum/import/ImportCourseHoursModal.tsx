import { useState } from 'react';
import Modal from '../../ui/Modal';
import { modalBody } from '../../ui/modalStyles';
import { ModalButton } from '../../ui/ModalForm';
import { formatHours, hoursLabel } from '../../../lib/curriculumHours';
import type { DraftRow, ImportSettings } from '../../../lib/curriculumImport/types';

interface ImportCourseHoursModalProps {
  row: DraftRow;
  settings: ImportSettings;
  onClose: () => void;
  /** Null rates mean the department default. */
  onSave: (rowId: string, patch: Pick<DraftRow, 'lecture_minutes_per_unit' | 'laboratory_minutes_per_unit'>) => void;
}

/** Rates are entered in hours per unit and kept in minutes. Blank or non-numeric text becomes NaN. */
const toMinutes = (hoursText: string) => (hoursText.trim() === '' ? Number.NaN : Math.round(Number(hoursText) * 60));

/**
 * Edit Hours per Unit for one course of the import draft, the same dialog the curriculum page offers after import.
 * Nothing is saved here: the rates go into the draft, are checked by Validate, and are stored as custom hours on import.
 */
export default function ImportCourseHoursModal({ row, settings, onClose, onSave }: ImportCourseHoursModalProps) {
  const lectureUnits = row.lecture_units ?? 0;
  const labUnits = row.lab_units ?? 0;
  const custom = row.lecture_minutes_per_unit != null || row.laboratory_minutes_per_unit != null;
  const currentLecture = row.lecture_minutes_per_unit ?? settings.lecture_minutes_per_unit;
  const currentLab = row.laboratory_minutes_per_unit ?? settings.laboratory_minutes_per_unit;
  const [lectureHours, setLectureHours] = useState(() => formatHours(currentLecture / 60));
  const [labHours, setLabHours] = useState(() => formatHours(currentLab / 60));

  const step = settings.slot_minutes;
  const stepHours = formatHours(step / 60);
  const maxHours = formatHours(settings.max_minutes_per_unit / 60);
  const lectureRate = toMinutes(lectureHours);
  const labRate = toMinutes(labHours);
  const rateError = (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > settings.max_minutes_per_unit) return `Use 0 to ${maxHours} hours.`;
    if (minutes % step !== 0) return `Use steps of ${stepHours} hour.`;
    return null;
  };
  // A component without units never uses its rate, so its rate cannot block the save.
  const lectureError = lectureUnits > 0 ? rateError(lectureRate) : null;
  const labError = labUnits > 0 ? rateError(labRate) : null;
  const effectiveLecture = lectureUnits > 0 ? lectureRate : currentLecture;
  const effectiveLab = labUnits > 0 ? labRate : currentLab;

  const currentTotal = lectureUnits * currentLecture + labUnits * currentLab;
  const newLecture = lectureUnits * (Number.isFinite(effectiveLecture) ? effectiveLecture : 0);
  const newLab = labUnits * (Number.isFinite(effectiveLab) ? effectiveLab : 0);
  const changed = newLecture + newLab !== currentTotal || effectiveLecture !== currentLecture || effectiveLab !== currentLab;
  const matchesDefault = effectiveLecture === settings.lecture_minutes_per_unit && effectiveLab === settings.laboratory_minutes_per_unit;

  const save = (useDefault: boolean) => {
    // Rates equal to the department's are not custom, so they are kept as the default.
    onSave(row.row_id, useDefault || matchesDefault
      ? { lecture_minutes_per_unit: null, laboratory_minutes_per_unit: null }
      : { lecture_minutes_per_unit: effectiveLecture, laboratory_minutes_per_unit: effectiveLab });
    onClose();
  };

  const rateInput = (id: string, label: string, units: number, value: string, setValue: (value: string) => void, error: string | null, total: number, departmentRate: number) => (
    <div className={`rounded-xl border bg-white p-4 ${units === 0 ? 'border-dashed border-border' : 'border-border'}`}>
      <label htmlFor={id} className="block text-[13px] font-bold text-text">{label}</label>
      <p className="text-xs text-muted">{units} {units === 1 ? 'unit' : 'units'} · hours per unit</p>
      <div className="mt-2 flex items-center gap-3">
        <div className={`flex h-10 items-center rounded-lg border bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 ${error ? 'border-red-300' : 'border-border'}`}>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            max={settings.max_minutes_per_unit / 60}
            step={step / 60}
            value={value}
            disabled={units === 0}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            onChange={(event) => setValue(event.target.value)}
            className="h-full w-16 rounded-l-lg bg-transparent pl-3 text-[15px] font-bold tabular-nums text-text focus:outline-none disabled:cursor-not-allowed disabled:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pr-3 text-xs text-muted">hr</span>
        </div>
        <span className="text-xs text-muted">= <strong className="tabular-nums text-text">{units === 0 ? '—' : hoursLabel(total)}</strong> a week</span>
      </div>
      <p id={`${id}-hint`} className={`mt-2 text-xs ${error ? 'font-semibold text-red-700' : 'text-muted'}`}>
        {error ?? (units === 0 ? `No ${label.toLowerCase()} units, so this rate is not used.` : toMinutes(value) === 0 ? `0 hours: the ${label.toLowerCase()} is not scheduled.` : `Department default: ${hoursLabel(departmentRate)} per unit.`)}
      </p>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit Hours per Unit"
      description={`${row.code.trim() || row.row_id} · ${row.title}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <ModalButton variant="ghost" onClick={() => save(true)} disabled={!custom}>
            Use department default
          </ModalButton>
          <div className="flex items-center gap-2">
            <ModalButton onClick={onClose}>Cancel</ModalButton>
            <ModalButton variant="primary" onClick={() => save(false)} disabled={Boolean(lectureError || labError) || !changed}>
              Apply hours
            </ModalButton>
          </div>
        </div>
      }
    >
      <div className={modalBody}>
        <p className="text-xs leading-5 text-muted">
          Set how many class hours each unit takes in this curriculum. The course keeps its{' '}
          <strong className="text-text">{lectureUnits + labUnits} academic {lectureUnits + labUnits === 1 ? 'unit' : 'units'}</strong>; the Schedule Generator,
          Manual Plotting and Scheduling Recommendations use the weekly hours below. Validate again after changing them.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {rateInput('import-lecture-hours-per-unit', 'Lecture', lectureUnits, lectureHours, setLectureHours, lectureError, newLecture, settings.lecture_minutes_per_unit)}
          {rateInput('import-laboratory-hours-per-unit', 'Laboratory', labUnits, labHours, setLabHours, labError, newLab, settings.laboratory_minutes_per_unit)}
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-white p-4 text-xs">
          <div>
            <dt className="text-muted">Required hours now</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-text">{hoursLabel(currentTotal)} a week</dd>
            <dd className="mt-0.5 text-[11px] text-muted">{custom ? 'Custom for this curriculum' : 'Department rates at import'}</dd>
          </div>
          <div>
            <dt className="text-muted">After applying</dt>
            <dd className={`mt-0.5 text-sm font-bold tabular-nums ${changed ? 'text-primary' : 'text-text'}`}>{hoursLabel(newLecture + newLab)} a week</dd>
            <dd className="mt-0.5 text-[11px] text-muted">{changed ? 'Class time changes' : 'No change to class time'}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}
