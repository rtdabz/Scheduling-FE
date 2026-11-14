import { useCallback, useState, useMemo, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { RotateCcw, Archive, BookOpen } from 'lucide-react';
import Modal from '../ui/Modal';
import { ModalButton, ModalState } from '../ui/ModalForm';
import DataTable from '../ui/DataTable';
import { useDataTable } from '../ui/useDataTable';
import type { Curriculum } from '../../types/curriculum';
import SearchInput from '../ui/SearchInput';

interface CurriculumArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  curriculumList: Curriculum[];
  canRestore: (curriculum: Curriculum) => boolean;
  onRestore: (id: number, status: 'deactivated') => Promise<void>;
}

export default function CurriculumArchiveModal({
  isOpen,
  onClose,
  curriculumList,
  onRestore,
  canRestore,
}: CurriculumArchiveModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen) {
      setHiddenIds([]);
    }
  }, [isOpen]);

  const archivedCurriculumList = useMemo(() => {
    return curriculumList.filter((c) => {
      const isArchived = c.status === 'archived' && !hiddenIds.includes(c.id);
      const matchSearch =
        searchQuery === '' ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase());
      return isArchived && matchSearch;
    });
  }, [curriculumList, searchQuery, hiddenIds]);

  const handleRestoreClick = useCallback(async (id: number) => {
    setHiddenIds((prev) => [...prev, id]);
    try {
      await onRestore(id, 'deactivated');
    } catch {
      setHiddenIds((prev) => prev.filter((rid) => rid !== id));
    }
  }, [onRestore]);

  const columns = useMemo<ColumnDef<Curriculum>[]>(() => [
    {
      id: 'code',
      accessorKey: 'code',
      header: 'Code',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
          {row.original.code}
        </span>
      ),
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Curriculum Name',
      meta: { cellClassName: 'font-bold text-gray-700' },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { align: 'right', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => canRestore(row.original) ? (
        <button
          type="button"
          onClick={() => handleRestoreClick(row.original.id)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#4e0a10]/10 hover:bg-[#4e0a10] hover:text-white text-[#4e0a10] text-[10px] font-bold uppercase rounded-lg border border-[#4e0a10]/20 transition-all duration-200 cursor-pointer disabled:opacity-50"
          title="Restore to Deactivated"
        >
          <RotateCcw size={11} />
          <span>Restore</span>
        </button>
      ) : null,
    },
  ], [handleRestoreClick, canRestore]);

  const table = useDataTable({
    data: archivedCurriculumList,
    columns,
    pageSize: false,
    getRowId: (item) => String(item.id),
  });

  return (
    <Modal
      id="curriculum-archive-dialog"
      isOpen={isOpen}
      onClose={onClose}
      title="Archived Curriculum"
      description="View and restore previously archived curricula."
      icon={<Archive size={18} />}
      size="lg"
      bodyClassName="flex flex-col px-4 py-4 sm:px-5 sm:py-5"
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      <SearchInput
        compact
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search archived curriculum name or code..."
        aria-label="Search archived curricula"
        containerClassName="relative mb-3 shrink-0 sm:max-w-sm"
      />

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <DataTable
          table={table}
          variant="embedded"
          ariaLabel="Archived curriculum"
          emptyState={
            <ModalState title="No archived curriculum found" icon={<BookOpen size={36} />}>
              {searchQuery ? 'Try a different curriculum name or code.' : 'Curriculum records that you archive will appear here.'}
            </ModalState>
          }
        />
      </div>
    </Modal>
  );
}
