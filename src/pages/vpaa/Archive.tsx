import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive as ArchiveIcon, RotateCcw, Search } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { clearDataCache } from '../../lib/dataCache';
import { useToast } from '../../context/ToastContext';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';

interface ArchivedRecord {
  id: number;
  type: string;
  label: string;
  deleted_at: string;
}

const typeLabels: Record<string, string> = {
  users: 'Users',
  departments: 'Departments',
  programs: 'Programs',
  rooms: 'Rooms',
  faculties: 'Faculty',
  courses: 'Courses',
  semesters: 'Semesters',
  sections: 'Sections',
  schedules: 'Schedules',
  'schedule-splits': 'Schedule splits',
  'timeslot-overrides': 'Timeslot overrides',
};

export default function Archive() {
  const { toast, confirm } = useToast();
  const [records, setRecords] = useState<ArchivedRecord[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: ArchivedRecord[] }>('/archives');
      setRecords(response.data.data);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Unable to load archived records.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadArchive(), 0);
    return () => window.clearTimeout(timer);
  }, [loadArchive]);

  const availableTypes = useMemo(
    () => Array.from(new Set(records.map((record) => record.type))).sort(),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesType = type === 'all' || record.type === type;
      const matchesSearch = query === '' || record.label.toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [records, search, type]);

  const restore = async (record: ArchivedRecord) => {
    const confirmed = await confirm({
      title: 'Restore Record',
      message: `${record.label} will be returned to the active lists and become usable again across the system.`,
      eyebrow: 'Confirmation Required',
      confirmLabel: 'Confirm Restore',
      variant: 'maroon',
    });
    if (!confirmed) return;

    const key = `${record.type}:${record.id}`;
    setRestoringKey(key);
    try {
      await api.post(`/archives/${record.type}/${record.id}/restore`);
      setRecords((current) => current.filter((item) => `${item.type}:${item.id}` !== key));
      clearDataCache();
      toast.success('Restored', `${record.label} is active again.`);
    } catch (requestError) {
      toast.error('Restore failed', apiErrorMessage(requestError, 'The record could not be restored.'));
    } finally {
      setRestoringKey(null);
    }
  };

  // Rebuilt each render: the restore cell reads the live restoringKey.
  const columns: ColumnDef<ArchivedRecord>[] = [
    { id: 'label', accessorKey: 'label', header: 'Record', meta: { cellClassName: 'text-sm font-semibold text-gray-900' } },
    {
      id: 'type',
      accessorFn: (record) => typeLabels[record.type] ?? record.type,
      header: 'Type',
      meta: { cellClassName: 'text-gray-600' },
    },
    {
      id: 'deleted_at',
      accessorKey: 'deleted_at',
      header: 'Archived',
      meta: { cellClassName: 'text-gray-600' },
      cell: ({ row }) => new Date(row.original.deleted_at).toLocaleString(),
    },
    {
      id: 'action',
      header: 'Action',
      size: 96,
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row: { original: record } }) => (
        <button
          type="button"
          onClick={() => void restore(record)}
          disabled={restoringKey !== null}
          title={`Restore ${record.label}`}
          aria-label={`Restore ${record.label}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#5A1220] hover:bg-[#5A1220]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={17} className={restoringKey === `${record.type}:${record.id}` ? 'animate-spin' : ''} />
        </button>
      ),
    },
  ];

  const table = useDataTable({
    data: filteredRecords,
    columns,
    pageSize: 25,
    initialSorting: [{ id: 'deleted_at', desc: true }],
    getRowId: (record) => `${record.type}:${record.id}`,
  });

  return (
    <div id="archive-page" className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[#5A1220]">
            <ArchiveIcon size={20} />
            <span className="text-xs font-bold uppercase text-gray-500">System records</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Archive</h1>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <label className="relative min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search archived records"
              className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#5A1220] focus:ring-2 focus:ring-[#5A1220]/10"
            />
          </label>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#5A1220] focus:ring-2 focus:ring-[#5A1220]/10"
          >
            <option value="all">All record types</option>
            {availableTypes.map((recordType) => (
              <option key={recordType} value={recordType}>{typeLabels[recordType] ?? recordType}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <button type="button" onClick={() => void loadArchive()} className="ml-3 font-bold underline">Retry</button>
        </div>
      ) : (
        <DataTable
          table={table}
          isLoading={loading}
          totalLabel="archived records"
          ariaLabel="Archived records"
          emptyState={
            <>
              <ArchiveIcon className="mx-auto mb-3 text-gray-300" size={36} />
              <p className="font-semibold text-gray-700">No archived records found</p>
            </>
          }
        />
      )}
    </div>
  );
}
