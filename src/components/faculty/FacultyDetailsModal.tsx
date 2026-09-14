import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BookOpen, Pencil, UserRound, X } from 'lucide-react';
import FacultyAvailabilityPanel from './FacultyAvailabilityPanel';
import InstructorTeachingLoadButton from '../InstructorTeachingLoadButton';
import { LOAD_TIER_BADGE_CLASSES, LOAD_TIER_LABELS, loadTierForUnits } from '../../lib/facultyLoad';

/** The fields this modal reads; every role's Faculty page record satisfies it. */
export interface FacultyDetailsRecord {
  id: number;
  first_name: string;
  last_name: string;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  deload_units: number;
  overload_units: number;
  probono_units: number;
  assigned_units: number;
  required_units: number;
  unit_ceiling: number;
  assigned_subjects: { id: number; subject_code?: string; subject_name?: string; course_code?: string; course_name?: string }[];
  assigned_classes: { id: number; section_name: string }[];
  department: { department_code: string; department_name: string } | null;
  profile_picture?: string | null;
}

interface FacultyDetailsModalProps {
  faculty: FacultyDetailsRecord;
  onClose: () => void;
  /** Shown only when provided: the load editor for accounts that cannot edit the roster itself. */
  onEditLoad?: () => void;
  canEditAvailability: boolean;
  onNotify: (kind: 'success' | 'error', title: string, message: string) => void;
}

const BAR_CLASSES = {
  basic: 'bg-emerald-500',
  overload: 'bg-red-400',
  probono: 'bg-slate-400',
  beyond_ceiling: 'bg-rose-500',
} as const;

/**
 * Instructor details: load against Basic Load, what they teach this semester,
 * and their availability windows. Shared by the VPAA, dean, program head and
 * secretary Faculty pages, which each carried an identical copy.
 */
export default function FacultyDetailsModal({ faculty, onClose, onEditLoad, canEditAvailability, onNotify }: FacultyDetailsModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const name = `${faculty.first_name} ${faculty.last_name}`;
  const basicLoad = faculty.required_units;
  const assigned = faculty.assigned_units;
  const tier = basicLoad > 0
    ? loadTierForUnits({ basicLoad, overloadUnits: faculty.overload_units, probonoUnits: faculty.probono_units }, assigned)
    : null;
  const percent = basicLoad > 0 ? Math.min(100, (assigned / basicLoad) * 100) : 0;
  const remaining = basicLoad - assigned;
  const aboveCeiling = assigned > basicLoad + Math.max(0, faculty.overload_units);

  const allowances: { label: string; value: number; hint?: string }[] = [
    { label: 'Max units', value: faculty.max_units },
    { label: 'Deload', value: faculty.deload_units, hint: 'subtracted' },
    { label: 'Basic load', value: basicLoad },
    { label: 'Overload', value: faculty.overload_units, hint: 'allowance' },
    { label: 'Pro bono', value: faculty.probono_units, hint: 'allowance' },
    { label: 'Ceiling', value: faculty.unit_ceiling },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="faculty-details-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl motion-safe:animate-modalIn"
      >
        <header className="flex shrink-0 items-center gap-3 bg-[#4e0a10] px-5 py-4 text-white">
          {faculty.profile_picture ? (
            <img src={faculty.profile_picture} alt="" className="h-12 w-12 shrink-0 rounded-full border-2 border-white/20 object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
              <UserRound className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="faculty-details-title" className="truncate font-display text-lg font-black leading-6">{name}</h2>
            <p className="truncate text-xs font-medium text-amber-100/75">
              {faculty.department ? `${faculty.department.department_code} · ${faculty.department.department_name}` : 'No department'}
              {' · '}
              {faculty.employment_type === 'part-time' ? 'Part-time' : 'Full-time'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#C9952A]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-parchment px-5 py-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Teaching load this semester</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                  {assigned}
                  <span className="text-base font-semibold text-slate-400"> / {basicLoad} units</span>
                </p>
              </div>
              <span className={`rounded-md border px-2 py-1 text-xs font-bold ${tier ? LOAD_TIER_BADGE_CLASSES[tier] : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                {tier ? LOAD_TIER_LABELS[tier] : 'No load recorded'}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-[width] duration-500 ${tier ? BAR_CLASSES[tier] : 'bg-slate-300'}`} style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {basicLoad <= 0
                ? 'No Basic Load is configured for this instructor.'
                : remaining > 0
                  ? `${remaining} unit${remaining === 1 ? '' : 's'} left before Basic Load.`
                  : remaining === 0
                    ? 'Basic Load is exactly met.'
                    : `${-remaining} unit${remaining === -1 ? '' : 's'} past Basic Load.`}
            </p>

            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
              {allowances.map(({ label, value, hint }) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="truncate text-[11px] font-semibold text-slate-500">{label}</dt>
                  <dd className="text-sm font-black tabular-nums text-slate-900">
                    {value}
                    {hint && <span className="ml-1 text-[10px] font-medium text-slate-400">{hint}</span>}
                  </dd>
                </div>
              ))}
            </dl>

            {aboveCeiling && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Past the Basic Load and Overload allowances, so the extra units are pro bono.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                <BookOpen size={14} className="text-slate-400" /> Teaching
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {faculty.assigned_subjects.length} course{faculty.assigned_subjects.length === 1 ? '' : 's'}
                {' · '}
                {faculty.assigned_classes.length} section{faculty.assigned_classes.length === 1 ? '' : 's'}
              </span>
            </div>
            {faculty.assigned_subjects.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-xs text-slate-500">
                No classes assigned for this semester yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <ul className="divide-y divide-slate-100">
                  {faculty.assigned_subjects.map((subject) => (
                    <li key={subject.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className="w-20 shrink-0 font-black text-slate-900">{subject.subject_code ?? subject.course_code ?? '—'}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-600" title={subject.subject_name ?? subject.course_name}>{subject.subject_name ?? subject.course_name}</span>
                    </li>
                  ))}
                </ul>
                {faculty.assigned_classes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/70 px-3 py-2">
                    <span className="mr-1 text-[11px] font-semibold text-slate-500">Sections</span>
                    {faculty.assigned_classes.map((section) => (
                      <span key={section.id} className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                        {section.section_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <FacultyAvailabilityPanel
            facultyId={faculty.id}
            facultyName={name}
            employmentType={faculty.employment_type}
            canEdit={canEditAvailability}
            onNotify={onNotify}
          />
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          {onEditLoad && (
            <button
              type="button"
              onClick={onEditLoad}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil size={14} /> Edit load
            </button>
          )}
          <InstructorTeachingLoadButton facultyId={faculty.id} />
        </footer>
      </div>
    </div>,
    document.body,
  );
}
