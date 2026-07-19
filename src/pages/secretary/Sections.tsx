import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import {
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
  Plus
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

  // Form state
  const [sectionName, setSectionName] = useState('');
  const [yearLevel, setYearLevel] = useState<'1' | '2' | '3' | '4'>('1');
  const [semester, setSemester] = useState<'1st' | '2nd' | 'summer'>('1st');
  const [departmentId, setDepartmentId] = useState('');
  const [termId, setTermId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error states
  const [nameError, setNameError] = useState('');
  const [departmentError, setDepartmentError] = useState('');
  const [termError, setTermError] = useState('');

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
    setSectionName(section.section_name);
    setYearLevel(section.year_level);
    setSemester(section.semester);
    setDepartmentId(section.department_id ? section.department_id.toString() : '');
    setTermId(section.term_id ? section.term_id.toString() : '');
    setStatus(section.status);
    setNameError('');
    setDepartmentError('');
    setTermError('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const trimmedName = sectionName.trim();

    if (!trimmedName) {
      setNameError('Section name is required');
      hasError = true;
    } else if (trimmedName.length > 100) {
      setNameError('Section name must not exceed 100 characters');
      hasError = true;
    } else {
      setNameError('');
    }

    const deptVal = isVpaa ? departmentId : (user?.department_id?.toString() || '');
    if (!deptVal) {
      setDepartmentError('Department is required');
      hasError = true;
    } else {
      setDepartmentError('');
    }

    if (!termId) {
      setTermError('Term is required');
      hasError = true;
    } else {
      setTermError('');
    }

    if (hasError) return;

    setIsSubmitting(true);
    const payload = {
      section_name: trimmedName,
      year_level: yearLevel,
      semester,
      department_id: Number(deptVal),
      term_id: Number(termId),
      status
    };

    try {
      if (isEditMode && editingId !== null) {
        const res = await api.put<ApiSection>(`/sections/${editingId}`, payload);
        const updatedSection = mapApiSection(res.data);
        setSections(prev => {
          const nextSections = prev.map(s => s.id === editingId ? updatedSection : s);
          setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, terms });
          return nextSections;
        });
        toast.success('Updated', 'Section updated successfully');
      } else {
        const res = await api.post<ApiSection>('/sections', payload);
        const createdSection = mapApiSection(res.data);
        setSections(prev => {
          const nextSections = [createdSection, ...prev];
          setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, terms });
          return nextSections;
        });
        toast.success('Created', 'Section created successfully');
      }
      setIsModalOpen(false);
    } catch {
      toast.error('Error', isEditMode ? 'Failed to update section' : 'Failed to create section');
    } finally {
      setIsSubmitting(false);
    }
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
              <div className="relative group">
                <button
                  onClick={() => handleEditClick(row.original)}
                  className="p-2 text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Pencil size={17} />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                  Edit
                </span>
              </div>
              <div className="relative group">
                <button
                  onClick={() => triggerDeleteConfirmation(row.original.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 size={17} />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
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
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div>
      {/* Top Bar Section */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
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
              setSectionName('');
              setYearLevel('1');
              setSemester('1st');
              setDepartmentId(isVpaa ? '' : (user?.department_id?.toString() || ''));
              
              const activeTerm = terms.find(t => t.is_active);
              setTermId(activeTerm ? activeTerm.id.toString() : '');
              
              setStatus('active');
              setNameError('');
              setDepartmentError('');
              setTermError('');
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden font-sans">
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

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-[#1A1410] font-display">
                {isEditMode ? 'Edit Section' : 'Add New Section'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                  Section Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sectionName}
                  onChange={(e) => {
                    setSectionName(e.target.value.toUpperCase());
                    setNameError('');
                  }}
                  placeholder="e.g. BSIT 4A"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                    nameError
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {nameError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{nameError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Year Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={yearLevel}
                    onChange={(e) => setYearLevel(e.target.value as '1' | '2' | '3' | '4')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                  >
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                    <option value="4">4th Year</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Semester <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value as '1st' | '2nd' | 'summer')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                  >
                    <option value="1st">1st Semester</option>
                    <option value="2nd">2nd Semester</option>
                    <option value="summer">Summer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white font-sans"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {isVpaa ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Assigned Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => {
                      setDepartmentId(e.target.value);
                      setDepartmentError('');
                    }}
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                      departmentError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id.toString()}>
                        {dept.department_code} - {dept.department_name}
                      </option>
                    ))}
                  </select>
                  {departmentError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{departmentError}</p>}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                    Department
                  </label>
                  <input
                    type="text"
                    disabled
                    value={
                      departments.find(d => d.id === user?.department_id)
                        ? `${departments.find(d => d.id === user?.department_id)?.department_code} - ${departments.find(d => d.id === user?.department_id)?.department_name}`
                        : 'No Department Assigned'
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-100 text-gray-500 text-sm outline-none cursor-not-allowed font-sans"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 font-sans">
                  Academic Term <span className="text-red-500">*</span>
                </label>
                <select
                  value={termId}
                  onChange={(e) => {
                    setTermId(e.target.value);
                    setTermError('');
                  }}
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all font-sans ${
                    termError
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                >
                  <option value="">Select Term</option>
                  {terms.map(t => (
                    <option key={t.id} value={t.id.toString()}>
                      A.Y. {t.academic_year} - {t.semester} Semester {t.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
                {termError && <p className="text-xs text-red-500 mt-1 font-semibold font-sans">{termError}</p>}
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200/80 bg-gray-50/50 -mx-6 -mb-6 p-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#4e0a10] hover:bg-[#C9952A] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 font-sans"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  <span>{isEditMode ? 'Save Changes' : 'Add Section'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-6 animate-in zoom-in-95 duration-200 font-sans">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 border border-red-100 animate-pulse">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-2">Delete Section</h3>
            <p className="text-gray-500 text-sm mb-6 font-sans">
              Are you sure you want to delete this section? This action cannot be undone and will permanently remove this record from the database.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteSection}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-sm font-sans"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
