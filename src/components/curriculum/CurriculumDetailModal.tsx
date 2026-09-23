import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { curriculumService } from '../../services/curriculum/curriculumService';
import { buildCurriculumPdf } from '../../lib/curriculumPrintable';
import type { Curriculum, Program } from '../../types/curriculum';

interface CurriculumDetailModalProps {
  isOpen: boolean;
  curriculumId: number | null;
  /** Used to title the printable; the program is looked up by the curriculum's program_id. */
  programs?: Program[];
  onClose: () => void;
}

type PdfState = { url: string | null; failed: boolean };

const NO_PROGRAMS: Program[] = [];

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  deactivated: 'bg-slate-100 text-slate-700 border-slate-300',
  archived: 'bg-red-50 text-red-700 border-red-200',
};

/**
 * The curriculum view is the printed curriculum itself, embedded the same way
 * the schedule approval preview embeds the printed schedule, so every role
 * reviews the document that Print produces.
 */
export default function CurriculumDetailModal({ isOpen, curriculumId, programs = NO_PROGRAMS, onClose }: CurriculumDetailModalProps) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [pdf, setPdf] = useState<PdfState>({ url: null, failed: false });

  useEffect(() => {
    if (!isOpen || !curriculumId) return undefined;
    let cancelled = false;
    let objectUrl: string | null = null;

    curriculumService.getCurriculumFull(curriculumId)
      .then(async (detail) => {
        if (cancelled) return;
        setCurriculum(detail.curriculum);
        const blob = await buildCurriculumPdf({
          curriculum: detail.curriculum,
          semesters: detail.semesters ?? [],
          program: programs.find((program) => program.id === detail.curriculum.program_id) ?? null,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdf({ url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setPdf({ url: null, failed: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setCurriculum(null);
      setPdf({ url: null, failed: false });
    };
  }, [isOpen, curriculumId, programs]);

  if (!isOpen) return null;
  const title = curriculum?.name ?? 'Curriculum';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3">
      <div className="flex h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-300 bg-[#F7F4F0] shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-300 bg-white px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate font-serif text-lg font-bold text-[#1A1410]">{title}</h2>
            {curriculum && (
              <>
                <span className="rounded-full border border-[#C9952A]/20 bg-[#C9952A]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#C9952A]">{curriculum.code}</span>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusColors[curriculum.status] ?? statusColors.deactivated}`}>{curriculum.status}</span>
              </>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-100">
          {pdf.failed ? (
            <p className="text-sm text-red-600">The curriculum document could not be generated.</p>
          ) : pdf.url ? (
            <iframe title={`${title} print preview`} src={pdf.url} className="h-full w-full border-0" />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500"><LoadingSpinner size={16} className="animate-spin" /> Preparing curriculum document…</div>
          )}
        </div>
        <div className="flex items-center justify-end border-t border-gray-300 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
