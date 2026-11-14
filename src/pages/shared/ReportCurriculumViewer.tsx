import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, ChevronDown } from 'lucide-react';
import Skeleton from '../../components/ui/Skeleton';
import SemesterCard from '../../components/curriculum/SemesterCard';
import SourceNotes from '../../components/curriculum/SourceNotes';
import { curriculumService } from '../../services/curriculum/curriculumService';
import { notesForTerm, noteScopeLabel } from '../../lib/curriculumImport/notes';
import { termsForYear, yearLevelStatsFor } from '../../lib/curriculumTerms';
import type { Curriculum, CurriculumDetail } from '../../types/curriculum';

interface ReportCurriculumViewerProps {
  departmentId: number;
  programId: number | null;
  /** Reports which curriculum is selected (null while none is available), e.g. for printing. */
  onSelectedChange?: (curriculumId: number | null) => void;
}

const noop = () => {};
const noopAsync = async () => {};

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; curricula: Curriculum[] };
type LoadedDetail = { id: number; status: 'error' } | { id: number; status: 'ready'; detail: CurriculumDetail };
type DetailState = { status: 'loading' } | LoadedDetail;

/** The Curriculum Module's read-only term viewer for the active curricula in a report's scope. */
export default function ReportCurriculumViewer({ departmentId, programId, onSelectedChange }: ReportCurriculumViewerProps) {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<LoadedDetail | null>(null);
  const [selectedYear, setSelectedYear] = useState(1);
  const [selectedSemester, setSelectedSemester] = useState(1);

  useEffect(() => {
    let cancelled = false;
    curriculumService.getActiveCurricula(departmentId)
      .then((curricula) => {
        if (cancelled) return;
        const inScope = programId === null ? curricula : curricula.filter((c) => c.program_id === programId);
        setList({ status: 'ready', curricula: inScope });
        setSelectedId(inScope[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setList({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [departmentId, programId]);

  useEffect(() => {
    onSelectedChange?.(list.status === 'ready' ? selectedId : null);
  }, [list.status, selectedId, onSelectedChange]);

  useEffect(() => {
    if (selectedId === null) return undefined;
    let cancelled = false;
    curriculumService.getCurriculumFull(selectedId)
      .then((data) => { if (!cancelled) setLoaded({ id: selectedId, status: 'ready', detail: data }); })
      .catch(() => { if (!cancelled) setLoaded({ id: selectedId, status: 'error' }); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const detail: DetailState = loaded && loaded.id === selectedId ? loaded : { status: 'loading' };
  const semesters = useMemo(
    () => (loaded?.status === 'ready' && loaded.id === selectedId ? loaded.detail.semesters ?? [] : []),
    [loaded, selectedId],
  );
  const yearLevelStats = useMemo(() => yearLevelStatsFor(semesters), [semesters]);
  const yearTerms = useMemo(() => termsForYear(semesters, selectedYear), [semesters, selectedYear]);

  if (list.status === 'loading') {
    return (
      <div role="status" aria-label="Loading curricula" className="space-y-4 p-4 sm:p-5">
        <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (list.status === 'error') {
    return <Message tone="error" title="Curricula could not be loaded" text="Close this report and open it again to retry." />;
  }

  if (list.curricula.length === 0) {
    return <Message title="No active curriculum" text="There is no active curriculum for this scope in the Curriculum Module." />;
  }

  const curriculum = detail.status === 'ready' ? detail.detail.curriculum : null;
  const notes = curriculum?.notes ?? [];
  const term = yearTerms.find((t) => t.semester === selectedSemester) ?? yearTerms[0];
  const termCourses = term?.courses ?? [];
  const termNotes = term
    ? notesForTerm(notes, selectedYear, term.semester, new Set(termCourses.map((course) => course.id)))
    : [];

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {list.curricula.length > 1 ? (
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Curriculum</span>
            <select
              value={selectedId ?? ''}
              onChange={(event) => {
                setSelectedId(Number(event.target.value));
                setSelectedYear(1);
                setSelectedSemester(1);
              }}
              className="h-9 w-full appearance-none truncate rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-xs font-bold text-[#4e0a10] shadow-sm outline-none transition-colors hover:border-[#C9952A] focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/10 cursor-pointer"
            >
              {list.curricula.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.code} · SY {c.effective_school_year}{c.lifecycle_label ? ` (${c.lifecycle_label})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </label>
        ) : (
          <p className="text-sm font-bold text-[#4e0a10]">{list.curricula[0].name}</p>
        )}
        {curriculum && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#C9952A]/20 bg-[#C9952A]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#C9952A]">{curriculum.code}</span>
            <span className="text-[11px] font-semibold text-gray-500">Effective SY {curriculum.effective_school_year}</span>
          </div>
        )}
      </div>

      {detail.status === 'loading' ? (
        <div role="status" aria-label="Loading curriculum">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : detail.status === 'error' ? (
        <Message tone="error" title="Curriculum could not be loaded" text="Choose the curriculum again or reopen this report to retry." />
      ) : (
        <>
          <SourceNotes notes={notes.filter((note) => note.scope.level === 'curriculum')} />
          <SourceNotes
            title="Notes for this term, from the curriculum document"
            notes={termNotes.map((note) => ({
              ...note,
              label: noteScopeLabel(note.scope, termCourses.find((course) => course.id === (note.scope as { course_id?: number }).course_id)?.code),
            }))}
          />
          {term && (
            <SemesterCard
              semester={term}
              curriculumSemesters={yearTerms}
              selectedYear={selectedYear}
              selectedSemester={selectedSemester}
              yearLevelStats={yearLevelStats}
              onSelectYear={(year) => {
                setSelectedYear(year);
                setSelectedSemester(1);
              }}
              onSelectSemester={setSelectedSemester}
              highlightedCourseId={null}
              removingCourseId={null}
              isRemoving={false}
              canEdit={false}
              onInitiateRemove={noop}
              onCancelRemove={noop}
              onConfirmRemove={noop}
              onAddCourseToSemester={noopAsync}
            />
          )}
        </>
      )}
    </div>
  );
}

function Message({ title, text, tone = 'empty' }: { title: string; text: string; tone?: 'empty' | 'error' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="flex flex-col items-center px-5 py-12 text-center">
      <span className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${tone === 'error' ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
        {tone === 'error' ? <AlertCircle size={23} /> : <BookOpen size={23} />}
      </span>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}
