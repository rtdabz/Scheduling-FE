import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
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

interface User {
  id: number;
  name: string;        // e.g. "Juan dela Cruz"
  username: string;    // e.g. "jdelacruz"
  role: string;        // "Dean" | "Secretary" | "Program Head"
  department: string | null;  // e.g. "College of Computing Studies" or null
  status: 'Active' | 'Inactive';
  createdAt: string;   // ISO date string
}

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

const MOCK_DEPARTMENTS: Department[] = [
  { id: 1, department_code: 'CAS', department_name: 'College of Arts and Sciences' },
  { id: 2, department_code: 'CIT', department_name: 'College of Information Technology' },
  { id: 3, department_code: 'CED', department_name: 'College of Education' },
  { id: 4, department_code: 'CBA', department_name: 'College of Business Administration' },
  { id: 5, department_code: 'CHM', department_name: 'College of Hospitality Management' },
  { id: 6, department_code: 'CLIS', department_name: 'College of Library and Information Science' },
  { id: 7, department_code: 'CCJPS', department_name: 'College of Criminal Justice and Public Safety' }
];

const MOCK_USERS: User[] = [
  { id: 1, name: 'Juan dela Cruz', username: 'jdelacruz', role: 'Dean', department: 'College of Arts and Sciences', status: 'Active', createdAt: '2025-01-15T08:00:00Z' },
  { id: 2, name: 'Maria Santos', username: 'msantos', role: 'Secretary', department: 'College of Information Technology', status: 'Active', createdAt: '2025-01-20T09:30:00Z' },
  { id: 3, name: 'Sarah Jenkins', username: 'sjenkins', role: 'Dean', department: 'College of Education', status: 'Active', createdAt: '2025-02-02T11:00:00Z' },
  { id: 4, name: 'John Smith', username: 'jsmith', role: 'Secretary', department: 'College of Business Administration', status: 'Inactive', createdAt: '2025-02-10T14:15:00Z' },
  { id: 5, name: 'Robert Davis', username: 'rdavis', role: 'Dean', department: 'College of Hospitality Management', status: 'Active', createdAt: '2025-02-18T10:00:00Z' }
];

export default function Users() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [departments] = useState<Department[]>(MOCK_DEPARTMENTS);
  const [isLoading, setIsLoading] = useState(false);

  // Table States
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: 'Secretary',
    department_id: '',
    status: 'Active' as 'Active' | 'Inactive'
  });

  const [nameError, setNameError] = useState('');
  const [deptError, setDeptError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-generate username and password based on role and department (only when creating)
  useEffect(() => {
    if (!isEditMode && formData.role && formData.department_id) {
      const dept = departments.find(d => d.id === parseInt(formData.department_id));
      if (dept) {
        const roleName = formData.role
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');
        
        const generatedUser = `${dept.department_code}${roleName}`;
        setFormData(prev => ({
          ...prev,
          username: generatedUser.toLowerCase(),
          password: `${dept.department_code.toLowerCase()}12345`
        }));
      }
    }
  }, [formData.role, formData.department_id, departments, isEditMode]);

  const fetchData = async () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 150);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    let hasError = false;
    if (!formData.name.trim()) {
      setNameError('Full name is required');
      hasError = true;
    } else if (formData.name.trim().length > 50) {
      setNameError('Full name must not exceed 50 characters');
      hasError = true;
    } else {
      setNameError('');
    }

    if (!formData.department_id) {
      setDeptError('Department assignment is required');
      hasError = true;
    } else {
      setDeptError('');
    }

    if (hasError) return;

    setIsSubmitting(true);
    
    setTimeout(() => {
      try {
        const selectedDept = departments.find(d => d.id === parseInt(formData.department_id));
        const departmentName = selectedDept ? selectedDept.department_name : null;

        if (isEditMode && editingId !== null) {
          setUsers(prev => prev.map(user => 
            user.id === editingId 
              ? { 
                  ...user, 
                  name: formData.name.trim(), 
                  role: formData.role, 
                  department: departmentName,
                  status: formData.status
                }
              : user
          ));
          toast.success('Success', 'User account updated successfully');
        } else {
          const newUser: User = {
            id: Date.now(),
            name: formData.name.trim(),
            username: formData.username,
            role: formData.role,
            department: departmentName,
            status: formData.status,
            createdAt: new Date().toISOString()
          };
          setUsers(prev => [newUser, ...prev]);
          toast.success('Success', 'User account created successfully');
        }
        
        // Reset and close
        setFormData({ name: '', username: '', password: '', role: 'Secretary', department_id: '', status: 'Active' });
        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingId(null);
      } catch (error) {
        toast.error('Error', 'Failed to save user account');
      } finally {
        setIsSubmitting(false);
      }
    }, 1000);
  };

  const handleEditClick = (user: User) => {
    const matchedDept = departments.find(d => d.department_name === user.department);
    setFormData({
      name: user.name,
      username: user.username,
      password: '••••••••',
      role: user.role,
      department_id: matchedDept ? matchedDept.id.toString() : '',
      status: user.status
    });
    setNameError('');
    setDeptError('');
    setEditingId(user.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteUser = () => {
    if (idToDelete !== null) {
      setUsers(prev => prev.filter(user => user.id !== idToDelete));
      toast.success('Deleted', 'User removed successfully');
      setIsDeleteModalOpen(false);
      setIdToDelete(null);
    }
  };

  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return 'U';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Define Columns for TanStack Table
  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: info => {
          const nameStr = info.getValue() as string;
          const initials = getInitials(nameStr);
          return (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4e0a10] to-[#C9952A] flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0">
                {initials}
              </div>
              <span className="font-bold text-gray-800">{nameStr}</span>
            </div>
          );
        }
      },
      {
        accessorKey: 'username',
        header: 'Username',
        cell: info => (
          <span className="font-mono text-xs text-gray-600 bg-gray-100/80 px-2 py-1 rounded border border-gray-200/50">
            {info.getValue() as string}
          </span>
        )
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: info => {
          const roleStr = info.getValue() as string;
          let badgeColor = 'bg-blue-100 text-blue-800 border border-blue-200/50';
          if (roleStr.toLowerCase() === 'secretary') {
            badgeColor = 'bg-green-100 text-green-800 border border-green-200/50';
          } else if (roleStr.toLowerCase() === 'program head') {
            badgeColor = 'bg-purple-100 text-purple-800 border border-purple-200/50';
          }
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${badgeColor}`}>
              {roleStr}
            </span>
          );
        }
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: info => {
          const deptVal = info.getValue();
          return <span className="text-gray-600 text-sm">{deptVal ? (deptVal as string) : '—'}</span>;
        }
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: info => {
          const statusVal = info.getValue() as string;
          const isActive = statusVal.toLowerCase() === 'active';
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
              isActive 
                ? 'bg-emerald-100 text-emerald-850 border-emerald-200/60' 
                : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}>
              {statusVal}
            </span>
          );
        }
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
    [users, departments]
  );

  // TanStack Table Instance
  const table = useReactTable<User>({
    data: users,
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
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / User Management</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">User Management</h1>
        <p className="text-muted text-sm mt-1">Manage accounts for Deans, Program Heads, and Secretaries</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>

      {/* Top Bar Section */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search name, username, or role..."
            className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm shadow-sm bg-white"
          />
        </div>
        <button 
          onClick={() => {
            setIsEditMode(false);
            setEditingId(null);
            setFormData({ name: '', username: '', password: '', role: 'Secretary', department_id: '', status: 'Active' });
            setNameError('');
            setDeptError('');
            setIsModalOpen(true);
          }}
          className="bg-[#4e0a10] text-white px-5 py-2.5 rounded-xl hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm"
        >
          <span className="text-lg leading-none">+</span> Add User
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
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 italic">
                    Loading users...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-base font-semibold">No users found.</p>
                      <p className="text-xs">Try adjusting your search criteria or add a new user.</p>
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
                      const isNoWrap = ['username', 'role', 'status', 'createdAt', 'actions'].includes(cell.column.id);
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
                )} of {table.getFilteredRowModel().rows.length} users
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

      {/* Creation / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-[#1A1410] font-display">
                {isEditMode ? 'Edit User Account' : 'Create New Account'}
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
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({...formData, name: e.target.value});
                    setNameError('');
                  }}
                  placeholder="e.g. Juan dela Cruz"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                    nameError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {nameError && <p className="text-xs text-red-500 mt-1 font-semibold">{nameError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Username
                  </label>
                  <input 
                    type="text" 
                    value={formData.username}
                    readOnly
                    placeholder={isEditMode ? '' : 'Auto-generated'}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed outline-none text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Password
                  </label>
                  <input 
                    type="text" 
                    value={formData.password}
                    readOnly
                    placeholder={isEditMode ? '' : 'Auto-generated'}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Role
                  </label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none bg-white text-sm cursor-pointer"
                  >
                    <option value="Dean">Dean</option>
                    <option value="Program Head">Program Head</option>
                    <option value="Secretary">Secretary</option>
                  </select>
                </div>

                {isEditMode && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                      Status
                    </label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as 'Active' | 'Inactive'})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none bg-white text-sm cursor-pointer"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Assigned Department <span className="text-red-500">*</span>
                </label>
                <select 
                  value={formData.department_id}
                  onChange={(e) => {
                    setFormData({...formData, department_id: e.target.value});
                    setDeptError('');
                  }}
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none bg-white text-sm cursor-pointer transition-all ${
                    deptError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                >
                  <option value="">Select a department...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
                {deptError && <p className="text-xs text-red-500 mt-1 font-semibold">{deptError}</p>}
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
                    : (isEditMode ? 'Save Changes' : 'Create Account')
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
                <h3 className="text-lg font-bold text-gray-800 font-display">Delete User Account</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Are you sure you want to delete this user account? This action is permanent and cannot be undone.
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
                  onClick={confirmDeleteUser}
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
