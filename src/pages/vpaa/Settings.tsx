import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';

interface Term {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
  is_enabled: boolean;
}

interface ApiTerm {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ActivationHistoryEntry {
  id: number;
  semester: '1st' | '2nd' | 'summer';
  academic_year: string;
  is_active: boolean;
  activatedAt: string;
}

interface SettingsPageData {
  terms: Term[];
}

const mapApiTerm = (t: ApiTerm): Term => ({
  id: t.id,
  academic_year: t.academic_year,
  semester: t.semester,
  is_active: !!t.is_active,
  is_enabled: t.is_enabled !== undefined ? !!t.is_enabled : true
});

export default function Settings() {
  const { toast } = useToast();
  const defaultTerms: Term[] = [
    { id: 1, academic_year: '2026-2027', semester: '1st', is_active: true, is_enabled: true },
    { id: 2, academic_year: '2026-2027', semester: '2nd', is_active: false, is_enabled: true },
    { id: 3, academic_year: '2026-2027', semester: 'summer', is_active: false, is_enabled: false }
  ];
  const settingsCacheKey = 'page:settings';
  const cachedSettingsData = getCachedData<SettingsPageData>(settingsCacheKey);
  const [terms, setTerms] = useState<Term[]>(cachedSettingsData?.terms ?? defaultTerms);
  const [history, setHistory] = useState<ActivationHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(!hasCachedData(settingsCacheKey));

  // Table States
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  // Modal states
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [idToActivate, setIdToActivate] = useState<number | null>(null);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(settingsCacheKey));
    try {
      const data = await loadCachedData<SettingsPageData>(settingsCacheKey, async () => {
        const res = await api.get<ApiTerm[]>('/terms');
        return {
          terms: res.data && res.data.length > 0 ? res.data.map(mapApiTerm) : defaultTerms,
        };
      }, forceRefresh);
      setTerms(data.terms);
    } catch {
      toast.error('Error', 'Failed to load academic terms.');
    } finally {
      setIsLoading(false);
    }
  };

  const activeSemester = useMemo(() => {
    return terms.find(t => t.is_active)?.semester;
  }, [terms]);

  // Handle auto-disabling summer when 1st Semester is active
  useEffect(() => {
    if (activeSemester === '1st') {
      setTerms(prev =>
        {
          const nextTerms = prev.map(t =>
          t.semester === 'summer' && t.is_enabled
            ? { ...t, is_enabled: false }
            : t
          );
          setCachedData<SettingsPageData>(settingsCacheKey, { terms: nextTerms });
          return nextTerms;
        }
      );
    }
  }, [activeSemester]);

  const isSummerToggleEnabled = activeSemester === '2nd';

  const handleActivateClick = (id: number) => {
    setIdToActivate(id);
    setIsActivateModalOpen(true);
  };

  const confirmActivateTerm = async () => {
    if (idToActivate !== null) {
      try {
        await api.patch<{ term: ApiTerm }>(`/terms/${idToActivate}/activate`);
        
        // Map updated term and deactivate all other terms in local state
        setTerms(prev => {
          const nextTerms = prev.map(t => ({
            ...t,
            is_active: t.id === idToActivate ? true : false
          }));
          setCachedData<SettingsPageData>(settingsCacheKey, { terms: nextTerms });
          return nextTerms;
        });

        // Find the active term to add to history
        const termToActivate = terms.find(t => t.id === idToActivate);
        if (termToActivate) {
          const logEntry: ActivationHistoryEntry = {
            id: Date.now(),
            semester: termToActivate.semester,
            academic_year: termToActivate.academic_year,
            is_active: true,
            activatedAt: new Date().toLocaleString()
          };
          setHistory(prev => [
            logEntry,
            ...prev.map(h => ({ ...h, is_active: false }))
          ]);
        }

        toast.success('Activated', 'Academic term is now active');
      } catch {
        toast.error('Error', 'Failed to activate academic term');
      } finally {
        setIsActivateModalOpen(false);
        setIdToActivate(null);
      }
    }
  };

  const handleYearChange = (id: number, val: string) => {
    setTerms(prev => {
      const nextTerms = prev.map(t => t.id === id ? { ...t, academic_year: val } : t);
      setCachedData<SettingsPageData>(settingsCacheKey, { terms: nextTerms });
      return nextTerms;
    });
  };

  const handleToggleEnabled = (id: number, enabled: boolean) => {
    setTerms(prev => {
      const nextTerms = prev.map(t => t.id === id ? { ...t, is_enabled: enabled } : t);
      setCachedData<SettingsPageData>(settingsCacheKey, { terms: nextTerms });
      return nextTerms;
    });
  };

  const isValidYearFormat = (year: string) => {
    const trimmed = year.trim();
    if (!/^\d{4}-\d{4}$/.test(trimmed)) return false;
    const [start, end] = trimmed.split('-').map(Number);
    return end === start + 1;
  };

  const sortedTerms = useMemo(() => {
    const semesterOrder = { '1st': 1, '2nd': 2, 'summer': 3 };
    return [...terms].sort((a, b) => semesterOrder[a.semester] - semesterOrder[b.semester]);
  }, [terms]);

  const columns = useMemo<ColumnDef<ActivationHistoryEntry>[]>(
    () => [
      {
        accessorKey: 'semester',
        header: 'Term',
        cell: info => {
          const sem = info.getValue() as string;
          const label = sem === '1st' ? '1st Semester' : sem === '2nd' ? '2nd Semester' : 'Summer';
          return <span className="font-semibold text-gray-700">{label}</span>;
        }
      },
      {
        accessorKey: 'academic_year',
        header: 'Academic Year',
        cell: info => <span className="font-mono font-bold text-gray-800 text-sm">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: info => {
          const isActive = info.getValue() as boolean;
          return isActive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-green-700 bg-green-50 border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-gray-500 bg-gray-50 border border-gray-200">
              Inactive
            </span>
          );
        }
      },
      {
        accessorKey: 'activatedAt',
        header: 'Date Activated',
        cell: info => <span className="text-gray-600 text-sm">{info.getValue() as string}</span>
      }
    ],
    []
  );

  const table = useReactTable<ActivationHistoryEntry>({
    data: history,
    columns,
    state: {
      sorting,
      pagination
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Settings</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">Settings</h1>
        <p className="text-muted text-sm mt-1">Configure WICARS academic variables and features</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>

      <div className="space-y-6">
        {/* Three Term Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sortedTerms.map((term) => {
            const isSummer = term.semester === 'summer';
            const label =
              term.semester === '1st'
                ? '1st Semester'
                : term.semester === '2nd'
                ? '2nd Semester'
                : 'Summer';

            const isCardDisabled = isSummer && !term.is_enabled;

            return (
              <div
                key={term.id}
                className={`flex flex-col justify-between border rounded-2xl p-5 transition-all duration-200 shadow-sm ${
                  isCardDisabled
                    ? 'bg-gray-50/80 border-gray-200/60 opacity-75'
                    : 'bg-[#F7F4F0] border-slate-200/80'
                }`}
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-base text-gray-800 font-display">
                      {label}
                    </span>
                    {/* Toggle for Summer */}
                    {isSummer && (
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(term.id, !term.is_enabled)}
                        disabled={!isSummerToggleEnabled}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          !isSummerToggleEnabled
                            ? 'bg-gray-200 cursor-not-allowed opacity-50'
                            : term.is_enabled
                            ? 'bg-[#4e0a10]'
                            : 'bg-gray-300'
                        }`}
                        title={
                          !isSummerToggleEnabled
                            ? 'Summer term can only be managed when 2nd Semester is active'
                            : term.is_enabled
                            ? 'Disable Summer Term'
                            : 'Enable Summer Term'
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            term.is_enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  {/* Academic Year Input */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                      Academic Year
                    </label>
                    <input
                      type="text"
                      value={term.academic_year}
                      onChange={(e) => handleYearChange(term.id, e.target.value)}
                      disabled={isCardDisabled}
                      placeholder="2026-2027"
                      className={`w-full px-3 py-2 border rounded-xl outline-none text-sm bg-white transition-all ${
                        isCardDisabled
                          ? 'border-gray-200 text-gray-400 bg-gray-100/50 cursor-not-allowed'
                          : !isValidYearFormat(term.academic_year)
                          ? 'border-red-500 focus:ring-2 focus:ring-red-500 text-red-700'
                          : 'border-gray-200 focus:ring-2 focus:ring-[#C9952A]'
                      }`}
                    />
                    {!isValidYearFormat(term.academic_year) && term.academic_year.trim() !== '' ? (
                      <p className="text-[10px] text-red-500 mt-1 font-semibold">Format must be YYYY-YYYY (e.g. 2026-2027)</p>
                    ) : (
                      <p className="text-[10px] text-gray-400 mt-1">Must be in YYYY-YYYY format.</p>
                    )}
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        term.is_active && !isCardDisabled ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold ${
                        term.is_active && !isCardDisabled ? 'text-green-700' : 'text-gray-400'
                      }`}
                    >
                      {term.is_active && !isCardDisabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Action Area / Button */}
                <div className="mt-5 pt-3 border-t border-gray-100">
                  {isCardDisabled ? (
                    <p className="text-xs text-gray-500 italic py-2">
                      Summer term not offered this year
                    </p>
                  ) : term.is_active ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 bg-[#4e0a10]/10 border border-[#4e0a10]/30 text-[#4e0a10] rounded-xl text-xs font-semibold cursor-not-allowed"
                    >
                      Currently Active
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!isValidYearFormat(term.academic_year)}
                      onClick={() => handleActivateClick(term.id)}
                      className={`w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        !isValidYearFormat(term.academic_year) ? 'opacity-50 cursor-not-allowed hover:bg-white' : ''
                      }`}
                    >
                      Set as Active
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* History Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 font-display">Academic Term History</h3>
            <span className="text-xs text-gray-500 font-semibold">{history.length} activations logged</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="bg-gray-50/75 border-b border-gray-100">
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-gray-500 select-none"
                      >
                        {header.isPlaceholder ? null : (
                          <div className="flex items-center">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <button
                                onClick={header.column.getToggleSortingHandler()}
                                className="ml-1.5 text-gray-400 hover:text-gray-600 inline-flex items-center cursor-pointer"
                              >
                                {header.column.getIsSorted() === 'asc' ? (
                                  <ArrowUp size={13} className="text-[#C9952A]" />
                                ) : header.column.getIsSorted() === 'desc' ? (
                                  <ArrowDown size={13} className="text-[#C9952A]" />
                                ) : (
                                  <ArrowUpDown size={13} />
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`term-skeleton-${index}`} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 w-28 rounded bg-gray-200" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-gray-200" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-20 rounded-full bg-gray-200" /></td>
                      <td className="px-6 py-4"><div className="ml-auto h-8 w-24 rounded-lg bg-gray-200" /></td>
                    </tr>
                  ))
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-gray-400 font-medium font-sans">
                      No term activation history yet.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`transition-colors h-12 hover:bg-gray-50/70 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                      }`}
                    >
                      {row.getVisibleCells().map(cell => {
                        const isNoWrap = ['academic_year'].includes(cell.column.id);
                        return (
                          <td
                            key={cell.id}
                            className={`px-4 py-2.5 align-middle text-xs ${
                              isNoWrap ? 'whitespace-nowrap' : ''
                            }`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Section */}
          {table.getFilteredRowModel().rows.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/30">
              <div className="flex items-center gap-4">
                <div className="text-xs font-semibold text-gray-500">
                  Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                    table.getFilteredRowModel().rows.length
                  )} of {table.getFilteredRowModel().rows.length} entries
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  First
                </button>
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  Prev
                </button>
                <span className="text-xs font-bold text-gray-500 px-1">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
                </span>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  Next
                </button>
                <button
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activate Confirmation Modal */}
      {isActivateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-amber-50 text-[#C9952A] rounded-full flex items-center justify-center mx-auto border border-amber-100">
                <CheckCircle2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-gray-800 font-display">Activate Academic Term</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Are you sure you want to activate this academic term? This will set all other terms to inactive and apply this term system-wide.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsActivateModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmActivateTerm}
                  className="flex-1 px-4 py-2.5 bg-[#4e0a10] hover:bg-[#C9952A] text-white rounded-xl transition-colors text-xs font-semibold cursor-pointer"
                >
                  Confirm Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
