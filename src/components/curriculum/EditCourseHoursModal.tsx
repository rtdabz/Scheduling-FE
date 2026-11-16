import { useState } from 'react';
import Modal from '../ui/Modal';
import { modalBody } from '../ui/modalStyles';
import { useToast } from '../../context/ToastContext';
import { apiErrorMessage, apiFieldErrors } from '../../lib/apiError';
import { curriculumService } from '../../services/curriculum/curriculumService';
import type { CurriculumCourse, CurriculumCourseHours, CurriculumHoursDefaults } from '../../types/curriculum';
import { formatHours, hoursLabel, legacyCourseHours } from '../../lib/curriculumHours';
import { ModalButton, ModalNotice } from '../ui/ModalForm';

interface EditCourseHoursModalProps {
  curriculumId: number | string;
  course: CurriculumCourse | null;
  defaults: CurriculumHoursDefaults;
  onClose: () => void;
  onSaved: (courseId: number, hours: CurriculumCourseHours) => void;
}

const FALLBACK_DEFAULTS: CurriculumHoursDefaults = {
  lecture_minutes_per_unit: 60,
  laboratory_minutes_per_unit: 180,
  slot_minutes: 30,
  max_minutes_per_unit: 600,
};

/** Rates are entered in hours per unit and stored in minutes. Blank or non-numeric text becomes NaN. */
const toMinutes = (hoursText: string) => (hoursText.trim() === '' ? Number.NaN : Math.round(Number(hoursText) * 60));

const SOURCE_LABELS: Record<CurriculumCourseHours['source'], string> = {
  legacy: 'Standard conversion (1 unit = 1 hour)',
  import: 'Department rates at import',
  department: 'Department default',
  custom: 'Custom for this curriculum',
};

export default function EditCourseHoursModal({ curriculumId, course, defaults = FALLBACK_DEFAULTS, onClose, onSaved }: EditCourseHoursModalProps) {
  const { confirm, toast } = useToast();
  // The parent remounts this dialog per course (key), so the inputs start from that course's rates.
  const current = course ? course.hours ?? legacyCourseHours(course) : null;
  const [lectureHours, setLectureHours] = useState(() => (current ? formatHours(current.lecture_minutes_per_unit / 60) : ''));
  const [labHours, setLabHours] = useState(() => (current ? formatHours(current.laboratory_minutes_per_unit / 60) : ''));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!course || !current) return null;

  const step = defaults.slot_minutes;
  const stepHours = formatHours(step / 60);
  const maxHours = formatHours(defaults.max_minutes_per_unit / 60);
  const lectureRate = toMinutes(lectureHours);
  const labRate = toMinutes(labHours);
  const rateError = (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes < step || minutes > defaults.max_minutes_per_unit) return `Use ${stepHours} to ${maxHours} hours.`;
    if (minutes % step !== 0) return `Use steps of ${stepHours} hour.`;
    return null;
  };
  // A component without units never uses its rate, so its rate cannot block the save.
  const lectureError = current.lecture_units > 0 ? rateError(lectureRate) ?? serverErrors.lecture_minutes_per_unit ?? null : null;
  const labError = current.lab_units > 0 ? rateError(labRate) ?? serverErrors.laboratory_minutes_per_unit ?? null : null;
  const effectiveLectureRate = current.lecture_units > 0 ? lectureRate : current.lecture_minutes_per_unit;
  const effectiveLabRate = current.lab_units > 0 ? labRate : current.laboratory_minutes_per_unit;

  const newLecture = current.lecture_units * (Number.isFinite(effectiveLectureRate) ? effectiveLectureRate : 0);
  const newLab = current.lab_units * (Number.isFinite(effectiveLabRate) ? effectiveLabRate : 0);
  const changed = newLecture !== current.lecture_minutes || newLab !== current.laboratory_minutes;
  const matchesDefault = effectiveLectureRate === defaults.lecture_minutes_per_unit && effectiveLabRate === defaults.laboratory_minutes_per_unit;

  const save = async (useDefault: boolean) => {
    const payload = useDefault
      ? { use_department_default: true as const }
      : { lecture_minutes_per_unit: effectiveLectureRate, laboratory_minutes_per_unit: effectiveLabRate };
    setSaving(true);
    setMessage(null);
    setServerErrors({});
    try {
      let result;
      try {
        result = await curriculumService.updateCourseHours(curriculumId, course.id, payload);
      } catch (error) {
        const response = (error as { response?: { status?: number; data?: { requires_confirmation?: boolean; message?: string } } }).response;
        if (response?.status !== 409 || !response.data?.requires_confirmation) throw error;
        const proceed = await confirm({
          title: 'Draft classes use the current hours',
          message: response.data.message ?? 'Some draft classes were plotted with the current hours.',
          confirmLabel: 'Save new hours',
          variant: 'warning',
        });
        if (!proceed) return;
        result = await curriculumService.updateCourseHours(curriculumId, course.id, { ...payload, confirm_draft_changes: true });
      }
      onSaved(course.id, result.hours);
      toast.success('Hours Updated', result.message);
      onClose();
    } catch (error) {
      setServerErrors(apiFieldErrors(error));
      setMessage(apiErrorMessage(error, 'Failed to update hours per unit.'));
    } finally {
      setSaving(false);
    }
  };

  const rateInput = (id: string, label: string, units: number, value: string, setValue: (value: string) => void, error: string | null, total: number) => (
    <div className={`rounded-xl border bg-white p-4 ${units === 0 ? 'border-dashed border-gray-200' : 'border-gray-200'}`}>
      <label htmlFor={id} className="block text-[13px] font-bold text-gray-800">{label}</label>
      <p className="text-xs text-gray-500">{units} {units === 1 ? 'unit' : 'units'} · hours per unit</p>
      <div className="mt-2 flex items-center gap-3">
        <div className={`flex h-10 items-center rounded-lg border bg-white focus-within:border-[#4e0a10] focus-within:ring-2 focus-within:ring-[#4e0a10]/15 ${error ? 'border-red-300' : 'border-gray-200'}`}>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={step / 60}
            max={defaults.max_minutes_per_unit / 60}
            step={step / 60}
            value={value}
            disabled={saving || units === 0}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            onChange={(event) => setValue(event.target.value)}
            className="h-full w-16 rounded-l-lg bg-transparent pl-3 text-[15px] font-bold tabular-nums text-gray-800 focus:outline-none disabled:cursor-not-allowed disabled:text-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pr-3 text-xs text-gray-500">hr</span>
        </div>
        <span className="text-xs text-gray-600">= <strong className="tabular-nums">{units === 0 ? '—' : hoursLabel(total)}</strong> a week</span>
      </div>
      <p id={`${id}-hint`} className={`mt-2 text-xs ${error ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
        {error ?? (units === 0 ? `No ${label.toLowerCase()} units, so this rate is not used.` : `Department default: ${hoursLabel(label === 'Lecture' ? defaults.lecture_minutes_per_unit : defaults.laboratory_minutes_per_unit)} per unit.`)}
      </p>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={saving ? () => undefined : onClose}
      title="Edit Hours per Unit"
      description={`${course.code} · ${course.title}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <ModalButton
            variant="ghost"
            onClick={() => void save(true)}
            disabled={saving || (matchesDefault && current.source === 'department')}
          >
            Use department default
          </ModalButton>
          <div className="flex items-center gap-2">
            <ModalButton onClick={onClose} disabled={saving}>
              Cancel
            </ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => void save(false)}
              disabled={saving || Boolean(lectureError || labError) || (!changed && current.source === 'custom')}
            >
              {saving ? 'Saving…' : 'Save hours'}
            </ModalButton>
          </div>
        </div>
      }
    >
      <div className={modalBody}>
        <p className="text-xs leading-5 text-gray-600">
          Set how many class hours each unit takes in this curriculum. The course keeps its{' '}
          <strong>{course.total_units} academic {course.total_units === 1 ? 'unit' : 'units'}</strong>; the Schedule Generator,
          Manual Plotting and Scheduling Recommendations use the weekly hours below.
        </p>

        {message && (
          <ModalNotice tone="error" role="alert">{message}</ModalNotice>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {rateInput('lecture-hours-per-unit', 'Lecture', current.lecture_units, lectureHours, setLectureHours, lectureError, newLecture)}
          {rateInput('laboratory-hours-per-unit', 'Laboratory', current.lab_units, labHours, setLabHours, labError, newLab)}
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 text-xs">
          <div>
            <dt className="text-gray-500">Required hours now</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-gray-800">{hoursLabel(current.total_minutes)} a week</dd>
            <dd className="mt-0.5 text-[11px] text-gray-500">{SOURCE_LABELS[current.source]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">After saving</dt>
            <dd className={`mt-0.5 text-sm font-bold tabular-nums ${changed ? 'text-[#4e0a10]' : 'text-gray-800'}`}>{hoursLabel(newLecture + newLab)} a week</dd>
            <dd className="mt-0.5 text-[11px] text-gray-500">{changed ? 'Class time changes' : 'No change to class time'}</dd>
          </div>
        </dl>

        <p className="text-[11px] leading-4 text-gray-500">
          Courses with submitted or approved classes cannot change hours until those schedules are recalled or returned to revision.
        </p>
      </div>
    </Modal>
  );
}
