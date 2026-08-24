import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import ConfirmModal from '../../components/ui/ConfirmModal';
import {
  Pencil,
  Trash2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  Layers
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
import { clearDataCache, getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import SectionModal from './SectionModal';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface Term {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
}

interface Section {
  id: number;
  section_name: string;
  year_level: '1' | '2' | '3' | '4';
  semester: '1st' | '2nd' | 'summer';
  department_id: number;
  department: Department | null;
  term_id: number;
  term: Term | null;
  status: 'active' | 'inactive';
  createdAt?: string;
}

interface ApiSection {
  id: number;
  section_name: string;
  year_level: '1' | '2' | '3' | '4';
  semester: '1st' | '2nd' | 'summer';
  department_id: number;
  department?: Department | null;
  term_id: number;
  term?: Term | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface SectionsPageData {
  sections: Section[];
  departments: Department[];
  terms: Term[];
}

const mapApiSection = (s: ApiSection): Section => ({
  id: s.id,
  section_name: s.section_name,
  year_level: s.year_level,
  semester: s.semester,
  department_id: s.department_id,
  department: s.department || null,
  term_id: s.term_id,
  term: s.term || null,
  status: s.status || 'active',
  createdAt: s.created_at
});

export default function SecretarySections() {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const sectionsCacheKey = `page:sections:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  const cachedSectionsData = getCachedData<SectionsPageData>(sectionsCacheKey);
  const [sections, setSections] = useState<Section[]>(cachedSectionsData?.sections ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedSectionsData?.departments ?? []);
  const [terms, setTerms] = useState<Term[]>(cachedSectionsData?.terms ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(sectionsCacheKey));

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const isDean = user?.role?.toLowerCase() === 'dean';
  const isSecretary = user?.role?.toLowerCase() === 'secretary';
  const isProgramHead = user?.role?.toLowerCase() === 'program_head';
  const canManageSections = isVpaa || isSecretary || isProgramHead;

  const activeTerm = useMemo(() => terms.find((t) => t.is_active) ?? terms[0], [terms]);

  const filteredSections = useMemo(() => {
    if (isVpaa) return sections;
    if (!user?.department_id) return [];
    return sections.filter(s => s.department_id !== null && Number(s.department_id) === Number(user.department_id));
  }, [sections, isVpaa, user?.department_id]);

  // Table States
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(sectionsCacheKey));
    try {
      const data = await loadCachedData<SectionsPageData>(sectionsCacheKey, async () => {
        const [sectionsRes, deptsRes, termsRes] = await Promise.all([
          api.get<ApiSection[]>('/sections'),
          api.get<Department[]>('/departments'),
          api.get<Term[]>('/terms')
        ]);
        return {
          sections: sectionsRes.data.map(mapApiSection),
          departments: deptsRes.data,
          terms: termsRes.data,
        };
      }, forceRefresh);
      setSections(data.sections);
      setDepartments(data.departments);
      setTerms(data.terms);
    } catch {
      toast.error('Error', 'Failed to load sections, departments, and terms data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (section: Section) => {
    setEditingId(section.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteSection = async () => {
    if (idToDelete !== null) {
      try {
        await api.delete(`/sections/${idToDelete}`);
        clearDataCache();
        setSections(prev => {
          const nextSections = prev.filter(s => s.id !== idToDelete);
          setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, terms });
          return nextSections;
        });
        toast.success('Deleted', 'Section removed successfully');
      } catch {
        toast.error('Error', 'Failed to delete section');
      } finally {
        setIsDeleteModalOpen(false);
        setIdToDelete(null);
      }
    }
  };

  const handleSaveSingle = async (
    secName: string,
    yrLevel: '1' | '2' | '3' | '4',
    deptId: number
  ) => {
    if (isEditMode && editingId !== null) {
      const payload = {
        section_name: secName,
        year_level: yrLevel,
        department_id: deptId,
      };
      const res = await api.put<ApiSection>(`/sections/${editingId}`, payload);
      const updatedSection = mapApiSection(res.data);
      clearDataCache();
      setSections((prev) => {
        const nextSections = prev.map((s) => (s.id === editingId ? updatedSection : s));
        setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, terms });
        return nextSections;
      });
      toast.success('Updated', 'Section updated successfully');
    }
  };

  const handleSaveBatch = async (
    batchSections: Array<{ section_name: string; year_level: '1' | '2' | '3' | '4' }>,
    deptId: number
  ) => {
    const batchPayload = {
      sections: batchSections.map((s) => ({
        section_name: s.section_name,
        year_level: s.year_level,
        department_id: deptId,
      })),
    };
    const res = await api.post<{ message: string; sections: ApiSection[] }>('/sections/batch', batchPayload);
    const createdSections = res.data.sections.map(mapApiSection);
    clearDataCache();
    setSections((prev) => {
      const nextSections = [...createdSections, ...prev];
      setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, terms });
      return nextSections;
    });
    toast.success('Sections Saved', res.data.message || `${createdSections.length} sections created successfully.`);
  };

  const columns = useMemo<ColumnDef<Section>[]>(
    () => {
      const cols: ColumnDef<Section>[] = [
        {
          accessorKey: 'section_name',
          header: 'Section Name',
          cell: info => (
            <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
              {info.getValue() as string}
            </span>
          )
        },
        {
          accessorKey: 'year_level',
          header: 'Year Level',
          cell: info => <span className="font-bold text-gray-800">Year {info.getValue() as string}</span>
        },
        {
          accessorKey: 'semester',
          header: 'Semester',
          cell: info => {
            const val = info.getValue() as string;
            return (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-200 font-sans">
                {val}
              </span>
            );
          }
        },
        {
          accessorKey: 'department',
          header: 'Department',
          cell: info => {
            const dept = info.getValue() as Department | null;
            return (
              <span className="text-gray-700 font-semibold text-xs">
                {dept ? `${dept.department_code} - ${dept.department_name}` : '—'}
              </span>
            );
          }
        },
        {
          accessorKey: 'term',
          header: 'Academic Term',
          cell: info => {
            const term = info.getValue() as Term | null;
            return (
              <span className="text-gray-700 font-semibold text-xs">
                {term ? `A.Y. ${term.academic_year} (${term.semester})` : '—'}
              </span>
            );
          }
        },
        {
          accessorKey: 'status',
          header: 'Status',
          cell: info => {
            const val = (info.getValue() as string) || 'active';
            const badgeColor = val === 'active'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200';
            return (
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                {val}
              </span>
            );
          }
        }
      ];

      if (canManageSections) {
        cols.push({
          id: 'actions',
          header: () => <div className="text-right">Actions</div>,
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1.5">
              <div className="relative group/tooltip">
                <button
                  onClick={() => handleEditClick(row.original)}
                  className="p-2 text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Pencil size={17} />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                  Edit
                </span>
              </div>
              <div className="relative group/tooltip">
                <button
                  onClick={() => triggerDeleteConfirmation(row.original.id)}
                  className="p-2 text-red-500 hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 size={17} />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                  Delete
                </span>
              </div>
            </div>
          )
        });
      }

      return cols;
    },
    [canManageSections]
  );

  const table = useReactTable<Section>({
    data: filteredSections,
    columns,
    state: {
      globalFilter,
      sorting,
      pagination
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  const sectionGuideSteps = useMemo(() => [
    { element: '#sections-toolbar', title: 'Find or create a section', description: 'Search existing sections or add the sections needed before starting Schedule Builder.', side: 'bottom' as const },
    { element: '#sections-table', title: 'Review section records', description: 'Check the section name, year level, term, and status before editing or scheduling it.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'sections', isReady: true, steps: sectionGuideSteps });

  return (
    <div>
      {/* Top Bar Section */}
      <div id="sections-toolbar" className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search section name, term, etc..."
            className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm shadow-sm bg-white"
          />
        </div>
        {canManageSections && (
          <button
            onClick={() => {
              setIsEditMode(false);
              setEditingId(null);
              setIsModalOpen(true);
            }}
            className="bg-[#4e0a10] text-white px-5 py-2.5 rounded-xl hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm cursor-pointer"
          >
            <Plus size={18} />
            <span>Add Section</span>
          </button>
        )}
      </div>

      {/* Table Container */}
      <WorkflowGuideButton guideId="sections" />
      <div id="sections-table" className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden font-sans">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="bg-gray-50/75 border-b border-gray-100">
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-gray-500 select-none font-sans"
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
                Array.from({ length: 6 }).map((_, index) => (
                  <tr 
                    key={`skeleton-row-${index}`} 
                    className={`h-12 border-b border-gray-100 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                    }`}
                  >
                    <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-12" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </td>
                    {canManageSections && (
                      <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-8 w-8 rounded-lg" />
                          <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : filteredSections.length === 0 ? (
                <tr>
                  <td colSpan={canManageSections ? 7 : 6} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-base font-semibold font-sans">No sections found.</p>
                      <p className="text-xs font-sans">Try adjusting your search criteria or add a new section.</p>
                    </div>
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
                      const isNoWrap = ['section_name', 'actions'].includes(cell.column.id);
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
        {!isLoading && table.getFilteredRowModel().rows.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/30">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 w-full sm:w-auto">
              <div className="text-xs font-semibold text-gray-500">
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length
                )} of {table.getFilteredRowModel().rows.length} sections
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-semibold">Show</span>
                <select
                  value={table.getState().pagination.pageSize}
                  onChange={e => {
                    table.setPageSize(Number(e.target.value));
                  }}
                  className="text-xs border border-gray-200 rounded-lg p-1 bg-white outline-none focus:ring-1 focus:ring-[#C9952A] font-sans"
                >
                  {[10, 25, 50].map(pageSize => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize}
                    </option>
                  ))}
                </select>
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
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600 font-sans"
              >
                Prev
              </button>
              <span className="text-xs font-bold text-gray-500 px-1 font-sans">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600 font-sans"
              >
                Next
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600 font-sans"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal (Portal Isolated for 0-lag typing) */}
      <SectionModal
        isOpen={isModalOpen}
        isEditMode={isEditMode}
        editingSection={sections.find((s) => s.id === editingId)}
        activeTerm={activeTerm ?? null}
        departments={departments}
        userDepartmentId={user?.department_id}
        isVpaa={isVpaa}
        onClose={() => setIsModalOpen(false)}
        onSaveSingle={handleSaveSingle}
        onSaveBatch={handleSaveBatch}
      />

      <ConfirmModal isOpen={isDeleteModalOpen} eyebrow="Permanent Action" title="Delete Section" message="Are you sure you want to delete this section? This action cannot be undone and will permanently remove this record from the database." confirmLabel="Delete" variant="danger" onCancel={() => setIsDeleteModalOpen(false)} onConfirm={confirmDeleteSection} />
    </div>
  );
}
import LoadingSpinner from "../../components/ui/LoadingSpinner";
