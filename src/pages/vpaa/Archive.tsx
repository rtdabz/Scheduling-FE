import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive as ArchiveIcon, Filter, RotateCcw } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { clearDataCache } from '../../lib/dataCache';
import { useToast } from '../../context/ToastContext';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';
import SearchInput from '../../components/ui/SearchInput';
import TableActionButton from '../../components/ui/TableActionButton';

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
    {
      id: 'label',
      accessorKey: 'label',
      header: 'Record',
      meta: { cellClassName: 'text-sm font-semibold text-gray-900' },
    },
    {
      id: 'type',
      accessorFn: (record) => typeLabels[record.type] ?? record.type,
      header: 'Type',
      meta: { cellClassName: 'text-gray-600' },
      cell: ({ row }) => (
        <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 border border-gray-200">
          {typeLabels[row.original.type] ?? row.original.type}
        </span>
      ),
    },
    {
      id: 'deleted_at',
      accessorKey: 'deleted_at',
      header: 'Archived Date',
      meta: { cellClassName: 'text-gray-600' },
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 font-semibold whitespace-nowrap">
          {new Date(row.original.deleted_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Action',
      size: 80,
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row: { original: record } }) => (
        <div className="relative group/tooltip inline-block">
          <TableActionButton
            label={`Restore ${record.label}`}
            variant="neutral"
            onClick={() => void restore(record)}
            disabled={restoringKey !== null}
          >
            <RotateCcw size={15} className={restoringKey === `${record.type}:${record.id}` ? 'animate-spin' : ''} />
          </TableActionButton>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
            Restore
          </span>
        </div>
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
    <div id="archive-page" className="space-y-6 font-sans">
      {/* Search and Filters Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Search Input using reusable SearchInput component */}
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search archived records..."
        />

        {/* Record Type Filter */}
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-gray-400" />
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
          >
            <option value="all">All record types</option>
            {availableTypes.map((recordType) => (
              <option key={recordType} value={recordType}>{typeLabels[recordType] ?? recordType}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800 rounded-r-lg">
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
            <div className="py-12 text-center">
              <ArchiveIcon className="mx-auto mb-3 text-gray-300" size={36} />
              <p className="font-semibold text-gray-700 text-sm">No archived records found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your search query or filter selection.</p>
            </div>
          }
        />
      )}
    </div>
  );
}


