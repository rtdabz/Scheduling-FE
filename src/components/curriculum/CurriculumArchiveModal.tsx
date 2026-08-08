import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, RotateCcw, Archive, BookOpen } from 'lucide-react';
import type { Curriculum } from '../../types/curriculum';

interface CurriculumArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  curricula: Curriculum[];
  onRestore: (id: number, status: 'draft') => Promise<void>;
}

export default function CurriculumArchiveModal({
  isOpen,
  onClose,
  curricula,
  onRestore,
}: CurriculumArchiveModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);

  // Reset hiddenIds when modal opens
  useEffect(() => {
    if (isOpen) {
      setHiddenIds([]);
    }
  }, [isOpen]);

  const archivedCurricula = useMemo(() => {
    return curricula.filter((c) => {
      const isArchived = c.status === 'archived' && !hiddenIds.includes(c.id);
      const matchSearch =
        searchQuery === '' ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase());
      return isArchived && matchSearch;
    });
  }, [curricula, searchQuery, hiddenIds]);

  if (!isOpen) return null;

  const handleRestoreClick = async (id: number) => {
    setHiddenIds((prev) => [...prev, id]);
    try {
      await onRestore(id, 'draft');
    } catch {
      setHiddenIds((prev) => prev.filter((rid) => rid !== id));
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-[#4e0a10] px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#C9952A]/20 border border-[#C9952A]/30 flex items-center justify-center text-[#C9952A]">
              <Archive size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-wide uppercase">Archived Curricula</h2>
              <p className="text-xs text-gray-300 mt-0.5">
                View and restore previously archived curricula frameworks.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0">
          {/* Search bar */}
          <div className="relative mb-4 shrink-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search archived curriculum name or code..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#C9952A] bg-white shadow-sm"
            />
          </div>

          {/* Curricula List */}
          <div className="flex-1 overflow-y-auto min-h-0 border border-gray-100 rounded-xl bg-gray-50/20">
            {archivedCurricula.length === 0 ? (
              <div className="py-16 text-center">
                <BookOpen size={44} className="mx-auto text-gray-300 mb-3 animate-pulse" />
                <p className="text-sm font-bold text-gray-700 mb-1">No archived curricula found</p>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  {searchQuery ? 'Try searching for a different term or keyword.' : 'Curricula that you archive will appear here.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Code</th>
                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Curriculum Name</th>
                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Version</th>
                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Academic Year</th>
                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {archivedCurricula.map((item) => {
                    const isRestoring = hiddenIds.includes(item.id);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
                            {item.code}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-gray-700 text-xs">{item.name}</td>
                        <td className="px-5 py-3.5 text-gray-500 font-medium text-xs">
                          {item.curriculum_version || 'N/A'}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 font-medium text-xs">
                          {item.academic_year || 'N/A'}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleRestoreClick(item.id)}
                            disabled={isRestoring}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#4e0a10]/10 hover:bg-[#4e0a10] hover:text-white text-[#4e0a10] text-[10px] font-bold uppercase rounded-lg border border-[#4e0a10]/20 transition-all duration-200 cursor-pointer disabled:opacity-50"
                            title="Restore to Draft"
                          >
                            <RotateCcw size={11} className={isRestoring ? 'animate-spin' : ''} />
                            <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
