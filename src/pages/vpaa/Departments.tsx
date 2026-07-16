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
  Loader2
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
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';

interface Department {
  id: number;
  code: string;          // e.g. "CCS"
  name: string;          // e.g. "College of Computing Studies"
  dean: string | null;   // e.g. "Dr. Juan dela Cruz" or null
  facultyCount: number;  // number
  sectionsCount: number; // number
  createdAt: string;     // ISO date string
}

const MOCK_DEPARTMENTS: Department[] = [
  { id: 1, code: 'CAS', name: 'College of Arts and Sciences', dean: 'Dr. Juan dela Cruz', facultyCount: 15, sectionsCount: 8, createdAt: '2025-01-15T08:00:00Z' },
  { id: 2, code: 'CIT', name: 'College of Information Technology', dean: 'Engr. Maria Santos', facultyCount: 18, sectionsCount: 10, createdAt: '2025-01-20T09:30:00Z' },
  { id: 3, code: 'CED', name: 'College of Education', dean: 'Dr. Emily Watson', facultyCount: 22, sectionsCount: 12, createdAt: '2025-02-10T14:15:00Z' },
  { id: 4, code: 'CBA', name: 'College of Business Administration', dean: null, facultyCount: 25, sectionsCount: 15, createdAt: '2025-02-18T10:00:00Z' },
  { id: 5, code: 'CHM', name: 'College of Hospitality Management', dean: 'Chef Robert Davis', facultyCount: 8, sectionsCount: 4, createdAt: '2025-02-02T11:00:00Z' },
  { id: 6, code: 'CLIS', name: 'College of Library and Information Science', dean: null, facultyCount: 5, sectionsCount: 2, createdAt: '2025-02-20T09:00:00Z' },
  { id: 7, code: 'CCJPS', name: 'College of Criminal Justice and Public Safety', dean: 'Dr. Alan Walker', facultyCount: 12, sectionsCount: 6, createdAt: '2025-02-25T14:00:00Z' }
];

interface DepartmentsPageData {
  departments: Department[];
}

export default function Departments() {
  const { toast } = useToast();
  const departmentsCacheKey = 'page:departments';
  const cachedDepartmentsData = getCachedData<DepartmentsPageData>(departmentsCacheKey);
  const [departments, setDepartments] = useState<Department[]>(cachedDepartmentsData?.departments ?? MOCK_DEPARTMENTS);
  const [isLoading, setIsLoading] = useState(!hasCachedData(departmentsCacheKey));
  
  // Table States
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    if (hasCachedData(departmentsCacheKey)) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: MOCK_DEPARTMENTS });
      setIsLoading(false);
    }, 800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Input Validation
    let hasError = false;
    const trimmedCode = code.trim();
    const trimmedName = name.trim();

    if (!trimmedCode) {
      setCodeError('Department code is required');
      hasError = true;
    } else if (trimmedCode.length > 10) {
      setCodeError('Department code must not exceed 10 characters');
      hasError = true;
    } else {
      setCodeError('');
    }

    if (!trimmedName) {
      setNameError('Department name is required');
      hasError = true;
    } else if (trimmedName.length > 100) {
      setNameError('Department name must not exceed 100 characters');
      hasError = true;
    } else {
      setNameError('');
    }

    if (hasError) return;

    setIsSubmitting(true);
    
    setTimeout(() => {
      try {
        if (isEditMode && editingId !== null) {
          setDepartments(prev => {
            const nextDepartments = prev.map(dept => 
              dept.id === editingId 
                ? { ...dept, name: trimmedName, code: trimmedCode }
                : dept
            );
            setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
            return nextDepartments;
          });
          toast.success('Success', 'Department updated successfully');
        } else {
          const newDept: Department = {
            id: Date.now(),
            name: trimmedName,
            code: trimmedCode,
            dean: null,
            facultyCount: 0,
            sectionsCount: 0,
            createdAt: new Date().toISOString()
          };
          setDepartments(prev => {
            const nextDepartments = [newDept, ...prev];
            setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
            return nextDepartments;
          });
          toast.success('Success', 'Department created successfully');
        }
        
        setName('');
        setCode('');
        setCodeError('');
        setNameError('');
        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingId(null);
      } catch (error: any) {
        toast.error('Error', 'Failed to save department');
      } finally {
        setIsSubmitting(false);
      }
    }, 1000);
  };

  const handleEditClick = (dept: Department) => {
    setName(dept.name);
    setCode(dept.code);
    setEditingId(dept.id);
    setCodeError('');
    setNameError('');
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteDepartment = () => {
    if (idToDelete !== null) {
      setDepartments(prev => {
        const nextDepartments = prev.filter(dept => dept.id !== idToDelete);
        setCachedData<DepartmentsPageData>(departmentsCacheKey, { departments: nextDepartments });
        return nextDepartments;
      });
      toast.success('Deleted', 'Department removed');
      setIsDeleteModalOpen(false);
      setIdToDelete(null);
    }
  };

  // Define Columns for TanStack Table
  const columns = useMemo<ColumnDef<Department>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: info => (
          <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
            {info.getValue() as string}
          </span>
        )
      },
      {
        accessorKey: 'name',
        header: 'Department Name',
        cell: info => <span className="font-bold text-gray-800">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'dean',
        header: 'Dean',
        cell: info => {
          const val = info.getValue();
          return <span>{val ? (val as string) : '—'}</span>;
        }
      },
      {
        accessorKey: 'facultyCount',
        header: () => <div className="text-center">Faculty Count</div>,
        cell: info => <div className="text-center text-sm font-semibold text-gray-700">{info.getValue() as number}</div>
      },
      {
        accessorKey: 'sectionsCount',
        header: () => <div className="text-center">Sections Count</div>,
        cell: info => <div className="text-center text-sm font-semibold text-gray-700">{info.getValue() as number}</div>
      },
      {
        accessorKey: 'createdAt',
        header: 'Created At',
        cell: info => {
          const val = info.getValue() as string;
          if (!val) return '—';
          try {
            const date = new Date(val);
            return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          } catch {
            return '—';
          }
        }
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            {/* Edit Button */}
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
            {/* Delete Button */}
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
      }
    ],
    [departments]
  );

  // TanStack Table Instance
  const table = useReactTable<Department>({
    data: departments,
    columns,
    state: {
      globalFilter,
      sorting,
      pagination,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Departments</p>
      </div>

      {/* Top Bar Section */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search department name or code..."
            className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm shadow-sm bg-white"
          />
        </div>
        <button 
          onClick={() => {
            setIsEditMode(false);
            setEditingId(null);
            setName('');
            setCode('');
            setCodeError('');
            setNameError('');
            setIsModalOpen(true);
          }}
          className="bg-[#4e0a10] text-white px-5 py-2.5 rounded-xl hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm"
        >
          <span className="text-lg leading-none">+</span> Add Department
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                Array.from({ length: 6 }).map((_, index) => (
                  <tr 
                    key={`skeleton-row-${index}`} 
                    className={`h-12 border-b border-gray-100 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                    }`}
                  >
                    <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-48" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-8 mx-auto" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-8 mx-auto" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <Skeleton className="h-8 w-8 rounded-lg" />
                        <Skeleton className="h-8 w-8 rounded-lg" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-base font-semibold">No departments found.</p>
                      <p className="text-xs">Try adjusting your search criteria or add a new department.</p>
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
                      const isNoWrap = ['code', 'createdAt', 'actions'].includes(cell.column.id);
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
                )} of {table.getFilteredRowModel().rows.length} departments
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-semibold">Show</span>
                <select
                  value={table.getState().pagination.pageSize}
                  onChange={e => {
                    table.setPageSize(Number(e.target.value));
                  }}
                  className="text-xs border border-gray-200 rounded-lg p-1 bg-white outline-none focus:ring-1 focus:ring-[#C9952A]"
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

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-[#1A1410] font-display">
                {isEditMode ? 'Edit Department' : 'Add New Department'}
              </h2>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)} 
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Department Code <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setCodeError('');
                  }}
                  placeholder="e.g. CCS"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                    codeError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {codeError && <p className="text-xs text-red-500 mt-1 font-semibold">{codeError}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError('');
                  }}
                  placeholder="e.g. College of Computing Studies"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                    nameError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {nameError && <p className="text-xs text-red-500 mt-1 font-semibold">{nameError}</p>}
              </div>
              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4e0a10] text-white rounded-xl hover:bg-[#C9952A] transition-colors disabled:opacity-50 text-sm font-semibold cursor-pointer"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isSubmitting 
                    ? (isEditMode ? 'Saving...' : 'Creating...') 
                    : (isEditMode ? 'Save Changes' : 'Create Department')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-gray-800 font-display">Delete Department</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Are you sure you want to delete this department? This action is permanent and cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteDepartment}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
