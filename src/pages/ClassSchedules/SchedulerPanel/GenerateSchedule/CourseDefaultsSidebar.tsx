import { useState } from "react";
import {
  BookOpen,
  CalendarRange,
  CheckCircle2,
  FlaskConical,
  Settings,
} from "lucide-react";
import { SLOT_MINUTES } from "../courseSlotPlan";
import type { CourseDefaults } from "./courseClassConfig";
import SlideOverPanel from "./SlideOverPanel";

type Hours = number | "";

const toHours = (minutes: number | null): Hours => (minutes === null ? "" : minutes / 60);

const hoursError = (hours: Hours): string | null =>
  hours === ""
    ? null
    : !Number.isFinite(hours) || hours <= 0
      ? "Enter hours above zero."
      : (hours * 60) % SLOT_MINUTES !== 0
        ? "Use whole half-hours, e.g. 1.5 or 2."
        : null;

const toMinutes = (hours: Hours): number | null => (hours === "" ? null : Math.round(hours * 60));

/**
 * Step 2's Default Settings, in the same right-hand sidebar as a course's
 * Configure panel. Set once, they apply to every course without Configure
 * settings of its own; a course's own Configure choice always wins. Changes
 * are a draft until Apply, like Configure.
 */
export default function CourseDefaultsSidebar({
  defaults,
  summarize,
  customizedCount,
  onResetCustomized,
  disabled,
  onClose,
  onApply,
}: {
  defaults: CourseDefaults;
  /** How many courses these defaults would set, and how many they do not fit. */
  summarize: (defaults: CourseDefaults) => { applied: number; skipped: number };
  /** Courses with their own Configure settings, which defaults skip. */
  customizedCount: number;
  onResetCustomized: () => void;
  disabled: boolean;
  onClose: () => void;
  onApply: (next: CourseDefaults) => void;
}) {
  const [lectureHours, setLectureHours] = useState<Hours>(toHours(defaults.lectureMinutes));
  const [laboratoryHours, setLaboratoryHours] = useState<Hours>(toHours(defaults.laboratoryMinutes));
  const [allowFridaySaturday, setAllowFridaySaturday] = useState(defaults.allowFridaySaturdaySplit);

  const lectureError = hoursError(lectureHours);
  const laboratoryError = hoursError(laboratoryHours);
  const draft: CourseDefaults = {
    lectureMinutes: lectureError ? defaults.lectureMinutes : toMinutes(lectureHours),
    laboratoryMinutes: laboratoryError ? defaults.laboratoryMinutes : toMinutes(laboratoryHours),
    allowFridaySaturdaySplit: allowFridaySaturday,
  };
  const hasDuration = draft.lectureMinutes !== null || draft.laboratoryMinutes !== null;
  const { applied, skipped } = summarize(draft);

  return (
    <SlideOverPanel
      ariaLabel="Default Settings"
      icon={<Settings className="h-5 w-5" />}
      heading={<h3 className="text-base font-black tracking-tight">Default Settings</h3>}
      subheading="Applies to every course without its own Configure settings"
      onClose={onClose}
      footer={(close) => (
        <>
          <button
            type="button"
            onClick={() => close()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled || lectureError !== null || laboratoryError !== null}
            onClick={() => close(() => onApply(draft))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white shadow-2xs transition hover:bg-[#34070a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Apply Defaults
          </button>
        </>
      )}
    >
      <DurationField
        id="default-lecture-duration"
        label="Lecture Duration"
        hint="Lecture courses and each Integrated lecture."
        Icon={BookOpen}
        hours={lectureHours}
        error={lectureError}
        disabled={disabled}
        onChange={setLectureHours}
      />
      <DurationField
        id="default-laboratory-duration"
        label="Laboratory Duration"
        hint="Laboratory courses and each Integrated laboratory."
        Icon={FlaskConical}
        hours={laboratoryHours}
        error={laboratoryError}
        disabled={disabled}
        onChange={setLaboratoryHours}
      />

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700">
          <CalendarRange className="h-4 w-4 text-slate-400" />
          Split Days
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50">
          <input
            type="checkbox"
            checked={allowFridaySaturday}
            disabled={disabled}
            aria-describedby="default-friday-saturday-help"
            onChange={(e) => setAllowFridaySaturday(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#4e0a10]"
          />
          <span className="text-xs font-bold text-slate-900">
            Allow Friday and Saturday as Paired Days
          </span>
        </label>
        <p
          id="default-friday-saturday-help"
          className="mt-1.5 text-[11px] font-semibold leading-snug text-slate-500"
        >
          Split courses may also meet Friday + Saturday. Mon/Wed and Tue/Thu are still tried first.
        </p>
      </div>

      {(hasDuration || customizedCount > 0) && (
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-600">
          {hasDuration && (
            <p>
              Sets the length of {applied} course{applied === 1 ? "" : "s"}.
            </p>
          )}
          {skipped > 0 && (
            <p className="text-amber-800">
              {skipped} course{skipped === 1 ? " keeps its" : "s keep their"} own length: the
              default is longer than {skipped === 1 ? "it meets" : "they meet"} a week.
            </p>
          )}
          {customizedCount > 0 && (
            <p>
              {customizedCount} course{customizedCount === 1 ? " has" : "s have"} its own
              Configure settings and {customizedCount === 1 ? "is" : "are"} skipped.
              <button
                type="button"
                disabled={disabled}
                onClick={onResetCustomized}
                className="ml-1 font-bold text-[#4e0a10] hover:underline disabled:opacity-50"
              >
                Use defaults for all
              </button>
            </p>
          )}
        </div>
      )}
    </SlideOverPanel>
  );
}

function DurationField({
  id,
  label,
  hint,
  Icon,
  hours,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  Icon: typeof BookOpen;
  hours: Hours;
  error: string | null;
  disabled: boolean;
  onChange: (hours: Hours) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700"
      >
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </label>
      <div
        className={`flex items-center overflow-hidden rounded-lg border bg-white shadow-2xs focus-within:ring-1 ${
          error
            ? "border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500"
            : "border-slate-300 focus-within:border-[#4e0a10] focus-within:ring-[#4e0a10]"
        }`}
      >
        <input
          id={id}
          type="number"
          step="0.5"
          min="0.5"
          inputMode="decimal"
          value={hours}
          disabled={disabled}
          placeholder="Course default"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          onChange={(e) => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))}
          className="w-full px-3 py-2 text-xs font-bold text-slate-800 placeholder:font-semibold placeholder:text-slate-400 focus:outline-hidden"
        />
        <span className="select-none whitespace-nowrap border-l border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
          hrs / week
        </span>
      </div>
      <p
        id={`${id}-help`}
        role={error ? "alert" : undefined}
        className={`mt-1.5 text-[11px] font-semibold leading-snug ${error ? "text-rose-700" : "text-slate-500"}`}
      >
        {error ?? `${hint} Leave blank to keep each course's own length.`}
      </p>
    </div>
  );
}
