import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, History, X } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import Skeleton from '../ui/Skeleton';

interface TeachingHistoryCourse {
  course_id: number;
  course_code: string;
  course_name: string;
  units: number;
  sections: string[];
}

interface TeachingHistorySemester {
  semester_id: number;
  academic_year: string;
  semester: string;
  is_active: boolean;
  total_units: number;
  section_count: number;
  courses: TeachingHistoryCourse[];
}

interface TeachingHistoryResponse {
  faculty_id: number;
  semesters: TeachingHistorySemester[];
}

interface TeachingHistoryModalProps {
  facultyId: number;
  facultyName: string;
  onClose: () => void;
}

/** One academic year's worth of semesters (1st, 2nd, summer) per page. */
const SEMESTERS_PER_PAGE = 3;

/**
 * The semesters an instructor has taught, newest first, with the courses and
 * sections they carried and the units that came to. Opened from the
 * instructor details modal, so it stacks above it.
 */
export default function TeachingHistoryModal({ facultyId, facultyName, onClose }: TeachingHistoryModalProps) {
  const [semesters, setSemesters] = useState<TeachingHistorySemester[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const pageCount = Math.max(1, Math.ceil(semesters.length / SEMESTERS_PER_PAGE));
  const start = pageIndex * SEMESTERS_PER_PAGE;
  const visibleSemesters = semesters.slice(start, start + SEMESTERS_PER_PAGE);
  const canPrevious = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;

  const goToPage = (index: number) => {
    setPageIndex(index);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // The user can close the modal mid-flight, so a late response must not
    // write to unmounted state.
    let active = true;

    const load = async () => {
      try {
        const res = await api.get<TeachingHistoryResponse>(`/faculties/${facultyId}/teaching-history`);
        if (!active) return;
        setSemesters(res.data?.semesters ?? []);
        setPageIndex(0);
        setLoadError('');
      } catch (err) {
        if (active) setLoadError(apiErrorMessage(err, 'Failed to load teaching history.'));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [facultyId]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="teaching-history-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl motion-safe:animate-modalIn"
      >
        <header className="flex shrink-0 items-center gap-3 bg-[#4e0a10] px-5 py-4 text-white">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
            <History className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="teaching-history-title" className="truncate font-display text-lg font-black leading-6">Teaching History</h2>
            <p className="truncate text-xs font-medium text-amber-100/75">{facultyName}</p>
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

        <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-parchment px-5 py-5">
          {isLoading ? (
            [0, 1].map((key) => (
              <div key={key} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))
          ) : loadError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-xs font-semibold text-red-700">{loadError}</p>
          ) : semesters.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-xs text-slate-500">
              No teaching assignments recorded for this instructor yet.
            </p>
          ) : (
            visibleSemesters.map((semester) => (
              <section key={semester.semester_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                  <h3 className="flex items-center gap-2 text-xs font-black text-slate-900">
                    {fullSemesterLabel(semester)}
                    {semester.is_active && (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Current</span>
                    )}
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {semester.total_units} unit{semester.total_units === 1 ? '' : 's'}
                    {' · '}
                    {semester.courses.length} course{semester.courses.length === 1 ? '' : 's'}
                    {' · '}
                    {semester.section_count} section{semester.section_count === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {semester.courses.map((course) => (
                    <li key={course.course_id} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="w-20 shrink-0 font-black text-slate-900">{course.course_code || '—'}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-600" title={course.course_name}>{course.course_name}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-500">
                          {course.units} unit{course.units === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[5.75rem]">
                        {course.sections.map((section, index) => (
                          <span key={`${section}-${index}`} className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                            {section}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {!isLoading && !loadError && semesters.length > 0 && (
          <footer className="flex shrink-0 flex-col items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row">
            <span className="text-xs font-semibold text-slate-500">
              Showing <span className="font-bold text-slate-700">{start + 1}-{start + visibleSemesters.length}</span> of{' '}
              <span className="font-bold text-slate-700">{semesters.length}</span> semester{semesters.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1">
              <PagerButton label="First page" onClick={() => goToPage(0)} disabled={!canPrevious}><ChevronsLeft size={15} /></PagerButton>
              <PagerButton label="Previous page" onClick={() => goToPage(pageIndex - 1)} disabled={!canPrevious}><ChevronLeft size={15} /></PagerButton>
              <span className="px-2 text-xs font-bold tabular-nums text-slate-500">{pageIndex + 1} / {pageCount}</span>
              <PagerButton label="Next page" onClick={() => goToPage(pageIndex + 1)} disabled={!canNext}><ChevronRight size={15} /></PagerButton>
              <PagerButton label="Last page" onClick={() => goToPage(pageCount - 1)} disabled={!canNext}><ChevronsRight size={15} /></PagerButton>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PagerButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
