import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive as ArchiveIcon, RotateCcw, Search } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { clearDataCache } from '../../lib/dataCache';
import { useToast } from '../../context/ToastContext';

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
  terms: 'Terms',
  sections: 'Sections',
  schedules: 'Schedules',
  'schedule-splits': 'Schedule splits',
  'timeslot-overrides': 'Timeslot overrides',
};

export default function Archive() {
  const { toast } = useToast();
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

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-500">Loading archived records...</div>
      ) : error ? (
        <div className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <button type="button" onClick={() => void loadArchive()} className="ml-3 font-bold underline">Retry</button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="py-16 text-center">
          <ArchiveIcon className="mx-auto mb-3 text-gray-300" size={36} />
          <p className="font-semibold text-gray-700">No archived records found</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Archived</th>
                <th className="w-24 px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.map((record) => {
                const key = `${record.type}:${record.id}`;
                const isRestoring = restoringKey === key;
                return (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{record.label}</td>
                    <td className="px-4 py-3 text-gray-600">{typeLabels[record.type] ?? record.type}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(record.deleted_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void restore(record)}
                        disabled={restoringKey !== null}
                        title={`Restore ${record.label}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#5A1220] hover:bg-[#5A1220]/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCcw size={17} className={isRestoring ? 'animate-spin' : ''} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
