import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import NumberInput from '../../components/ui/NumberInput';
import { AlertTriangle, ArrowRight, Award, CornerDownRight, FolderTree, LayoutGrid, List, Pencil, Plus, Search, TrendingDown, Trash2, Users, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Skeleton from '../../components/ui/Skeleton';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import { hasStoredCapability } from '../../lib/storedUser';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import {
  basicLoadAfterDeload,
  createDesignation,
  deleteDesignation,
  designationLabel,
  emptyDesignation,
  fetchDesignations,
  updateDesignation,
  type Designation,
  type DesignationInput,
} from '../../lib/designations';

const MANAGE_CAPABILITY = 'faculty.manage_designations';

/** The common full-time maximum, used only to illustrate a deload's effect. */
const REFERENCE_MAX_UNITS = 21;

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || '?';

const unitsLabel = (units: number) => `${units} ${units === 1 ? 'unit' : 'units'}`;

/**
 * Maintains the administrative designations instructors may hold.
 *
 * Reached from the VPAA route alone -- a designation rewrites an instructor's
 * Basic Load, so the list is not delegated. The capability check below stays
 * as the second gate, so the screen degrades to read-only rather than
 * offering actions the API would refuse.
 */
export default function Designations() {
  const { toast } = useToast();
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [designationSearch, setDesignationSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const [editing, setEditing] = useState<Designation | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<DesignationInput>(emptyDesignation());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Designation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canManage = hasStoredCapability(MANAGE_CAPABILITY);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setDesignations(await fetchDesignations());
    } catch {
      toast.error('Could not load designations', 'Please refresh the page and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // Same initial-fetch pattern the other list screens use: the state this
    // sets is the fetch result, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Each top-level designation followed by the sub-designations under it, so a
  // heading reads as a group. Search matches the full "Director · Networking
  // Dev't" label, and keeps a matching sub-designation's heading in view.
  const visible = useMemo(() => {
    const ordered: Designation[] = [];
    designations.filter((d) => d.parent_id === null).forEach((top) => {
      ordered.push(top, ...designations.filter((d) => d.parent_id === top.id));
    });
    designations.forEach((d) => { if (!ordered.includes(d)) ordered.push(d); });

    const needle = designationSearch.trim().toLowerCase();
    if (!needle) return ordered;
    const matches = new Set(ordered.filter((d) => designationLabel(d).toLowerCase().includes(needle)).map((d) => d.id));
    return ordered.filter((d) => matches.has(d.id) || designations.some((child) => child.parent_id === d.id && matches.has(child.id)));
  }, [designations, designationSearch]);

  /** Top-level designations another may be placed under. */
  const parentOptions = useMemo(
    () => designations.filter((d) => d.parent_id === null && d.id !== editing?.id),
    [designations, editing],
  );
  const editingHasChildren = editing !== null && designations.some((d) => d.parent_id === editing.id);

  const openCreate = (parent: Designation | null = null) => {
    setEditing(null);
    setForm({ ...emptyDesignation(), parent_id: parent?.id ?? null });
    setFieldErrors({});
    setIsFormOpen(true);
  };

  const openEdit = useCallback((designation: Designation) => {
    setEditing(designation);
    setForm({
      parent_id: designation.parent_id ?? null,
      name: designation.name,
      code: designation.code,
      deload_units: designation.deload_units,
      description: designation.description,
      status: designation.status,
      sort_order: designation.sort_order,
    });
    setFieldErrors({});
    setIsFormOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<Designation>[]>(() => [
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Designation',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const designation = row.original;
        const isSub = designation.parent_id !== null;
        const subCount = designation.children_count ?? 0;
        return (
          <div className={`flex min-w-[14rem] items-center gap-3 ${isSub ? 'pl-8' : ''}`}>
            {isSub && <CornerDownRight size={16} aria-hidden="true" className="-ml-6 shrink-0 text-gray-300" />}
            <span
              aria-hidden="true"
              className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5A1220] to-[#8a2434] font-black tracking-wide text-white shadow-sm ${isSub ? 'h-8 w-8 text-[10px] opacity-80' : 'h-10 w-10 text-xs'}`}
            >
              {initialsOf(designation.name)}
            </span>
            <div className="min-w-0 flex-1">
              {/* Line 1: Designation Name (single line, no wrapping) */}
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 whitespace-nowrap">
                <span className="whitespace-nowrap font-bold text-gray-900" title={designation.name}>{designation.name}</span>
                {designation.code && (
                  <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-px font-mono text-[10px] font-bold uppercase text-gray-500">
                    {designation.code}
                  </span>
                )}
                {subCount > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#5A1220]/[0.07] px-2 py-px text-[10px] font-bold text-[#5A1220]">
                    <FolderTree size={10} /> Heading · {subCount} sub-designation{subCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {/* Line 2: Deload Units directly below */}
              <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold text-[#8a6412] whitespace-nowrap">
                <span>{unitsLabel(designation.deload_units)} deload</span>
                {isSub && (
                  <span className="text-gray-400 font-normal text-[11px] whitespace-nowrap">
                    (Under {designation.parent?.name ?? 'parent designation'})
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'deload',
      accessorKey: 'deload_units',
      header: 'Deload',
      cell: ({ row }) => {
        const units = row.original.deload_units;
        const share = Math.min(100, (units / REFERENCE_MAX_UNITS) * 100);
        return (
          <div className="w-36">
            <span className="inline-flex items-center gap-1 rounded-md border border-[#C9952A]/30 bg-[#C9952A]/10 px-2 py-0.5 text-xs font-black text-[#8a6412]">
              <TrendingDown size={12} />
              {unitsLabel(units)}
            </span>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
              role="img"
              aria-label={`${Math.round(share)}% of a ${REFERENCE_MAX_UNITS}-unit load`}
            >
              <div className="h-full rounded-full bg-gradient-to-r from-[#C9952A] to-[#e0b65a]" style={{ width: `${share}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      id: 'basic_load',
      accessorFn: (designation) => basicLoadAfterDeload(REFERENCE_MAX_UNITS, designation.deload_units),
      header: `Basic load (of ${REFERENCE_MAX_UNITS})`,
      cell: ({ getValue }) => {
        const remaining = getValue<number>();
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-gray-500">
            {REFERENCE_MAX_UNITS}
            <ArrowRight size={12} className="text-gray-300" />
            <span className={`font-black ${remaining === 0 ? 'text-red-600' : 'text-gray-900'}`}>{unitsLabel(remaining)}</span>
          </span>
        );
      },
    },
    {
      id: 'holders',
      accessorFn: (designation) => designation.faculties_count ?? 0,
      header: 'Holders',
      cell: ({ getValue }) => {
        const holders = getValue<number>();
        return holders > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#5A1220]/[0.07] px-2.5 py-1 text-xs font-bold text-[#5A1220]">
            <Users size={12} />
            {holders} {holders === 1 ? 'instructor' : 'instructors'}
          </span>
        ) : (
          <span className="text-xs font-medium italic text-gray-400">Not assigned yet</span>
        );
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const active = row.original.status !== 'inactive';
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {active ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    ...(canManage ? [{
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }: { row: { original: Designation } }) => (
        <div className="flex items-center justify-end gap-2">
          {row.original.parent_id === null && (row.original.faculties_count ?? 0) === 0 && (
            <TableActionButton label={`Add a sub-designation under ${row.original.name}`} variant="view" onClick={() => openCreate(row.original)}>
              <Plus size={15} />
            </TableActionButton>
          )}
          <TableActionButton label={`Edit ${row.original.name}`} variant="edit" onClick={() => openEdit(row.original)}>
            <Pencil size={15} />
          </TableActionButton>
          <TableActionButton label={`Archive ${row.original.name}`} variant="danger" onClick={() => setPendingDelete(row.original)}>
            <Trash2 size={15} />
          </TableActionButton>
        </div>
      ),
    } satisfies ColumnDef<Designation>] : []),
  // openCreate is rebuilt each render but only reads setters, so it is safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canManage, openEdit]);

  const table = useDataTable({ data: visible, columns, pageSize: 10, getRowId: (designation) => String(designation.id) });

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFieldErrors({ name: 'A designation name is required.' });
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    try {
      if (editing) {
        const { holdersUpdated } = await updateDesignation(editing.id, {
          name: form.name,
          deload_units: form.deload_units,
          parent_id: form.parent_id,
        });
        // The deload is copied onto each holder, so a changed figure moves real
        // teaching loads. Saying how many keeps that from being a silent edit.
        toast.success(
          'Designation updated',
          holdersUpdated > 0
            ? `${form.name} saved. ${holdersUpdated} instructor${holdersUpdated === 1 ? '' : 's'} had their deload updated.`
            : `${form.name} saved.`,
        );
      } else {
        await createDesignation(form);
        toast.success('Designation created', `${form.name} can now be assigned to instructors.`);
      }
      setIsFormOpen(false);
      await load();
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { errors?: Record<string, string[]>; message?: string } } }).response;
      if (response?.status === 422 && response.data?.errors) {
        setFieldErrors(
          Object.fromEntries(Object.entries(response.data.errors).map(([key, messages]) => [key, messages[0]])),
        );
      } else if (response?.status === 403) {
        toast.error('Not permitted', 'You do not have the Manage Designations capability.');
      } else {
        toast.error('Save failed', response?.data?.message ?? 'The designation could not be saved.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteDesignation(pendingDelete.id);
      toast.success('Designation archived', `${pendingDelete.name} was archived.`);
      setPendingDelete(null);
      await load();
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { message?: string } } }).response;
      // 409 means instructors still hold it — the server refuses rather than
      // silently changing their Basic Load.
      toast.error(
        response?.status === 409 ? 'Still in use' : 'Archive failed',
        response?.data?.message ?? 'The designation could not be archived.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const totalHolders = designations.reduce((sum, d) => sum + (d.faculties_count ?? 0), 0);
  const activeCount = designations.filter((d) => d.status !== 'inactive').length;
  const unitsReleased = designations.reduce((sum, d) => sum + d.deload_units * (d.faculties_count ?? 0), 0);
  const isSearching = designationSearch.trim() !== '';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* The page title is rendered by the layout's PageHeader. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Designations"
          value={designations.length}
          hint={`${activeCount} active`}
          icon={<Award size={16} />}
          isLoading={isLoading}
        />
        <StatCard
          label="Instructors holding one"
          value={totalHolders}
          hint="Across every designation"
          icon={<Users size={16} />}
          isLoading={isLoading}
        />
        <StatCard
          label="Units deloaded"
          value={unitsReleased}
          hint="Deload × holders, freed from teaching"
          icon={<TrendingDown size={16} />}
          isLoading={isLoading}
        />
      </div>

      {/* Standalone Dedicated Search Bar & Control Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-gray-200 rounded-2xl p-3.5 shadow-xs">
        {/* Reused search bar component style */}
        <div className="relative w-full sm:w-80">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={designationSearch}
            onChange={(event) => setDesignationSearch(event.target.value)}
            placeholder="Search designations..."
            aria-label="Search designations"
            className="w-full rounded-xl border border-gray-200 bg-gray-50/60 py-2 pl-9 pr-8 text-sm outline-none transition focus:border-[#C9952A] focus:bg-white focus:ring-2 focus:ring-[#C9952A]/20 font-sans font-semibold text-gray-800"
          />
          {designationSearch && (
            <button
              type="button"
              onClick={() => setDesignationSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          {/* View Mode Switcher (Grid / List) */}
          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#5A1220] text-white shadow-sm font-bold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#5A1220] text-white shadow-sm font-bold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5A1220] px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#4a0f1a] cursor-pointer"
            >
              <Plus size={16} />
              Add Designation
            </button>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {viewMode === 'grid' ? (
          <div className="p-4 font-sans">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-xs flex flex-col justify-between space-y-3 font-sans animate-pulse"
                  >
                    {/* Top accent line matching stat cards */}
                    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5A1220]/40 via-[#8a2434]/40 to-[#C9952A]/40" />

                    <div className="space-y-2.5 pt-0.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <Skeleton className="h-4 w-32 rounded" />
                            <Skeleton className="h-3 w-20 rounded" />
                          </div>
                        </div>
                        <Skeleton className="h-5 w-14 rounded-full shrink-0" />
                      </div>

                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Skeleton className="h-4 w-12 rounded" />
                        <Skeleton className="h-4 w-24 rounded-md" />
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between">
                      <Skeleton className="h-4 w-20 rounded" />
                      <div className="flex items-center gap-1">
                        <Skeleton className="h-6 w-6 rounded-lg" />
                        <Skeleton className="h-6 w-6 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="py-12 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-white">
                <p className="text-sm font-bold text-gray-800">
                  {isSearching ? `No designations match “${designationSearch.trim()}”.` : 'No designations yet.'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {isSearching ? 'Try adjusting your search criteria.' : 'Add your first designation to get started.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visible.map((d) => {
                  const isSub = d.parent_id !== null;
                  const subCount = d.children_count ?? 0;
                  const holders = d.faculties_count ?? 0;
                  const active = d.status !== 'inactive';

                  return (
                    <div
                      key={d.id}
                      className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-xs flex flex-col justify-between space-y-3 font-sans group hover:border-[#C9952A]/50 transition-all ${GRID_CARD_HOVER}`}
                    >
                      {/* Top accent line matching dashboard StatCards */}
                      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5A1220] via-[#8a2434] to-[#C9952A]" />

                      <div className="space-y-2 pt-0.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              aria-hidden="true"
                              className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5A1220] to-[#8a2434] font-black tracking-wide text-white shadow-xs ${
                                isSub ? 'h-9 w-9 text-[10px] opacity-85' : 'h-10 w-10 text-xs'
                              }`}
                            >
                              {initialsOf(d.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              {/* Line 1: Designation on Line 1 (single line, no wrapping) */}
                              <h3
                                className="text-sm font-bold text-gray-900 leading-tight whitespace-nowrap truncate"
                                title={d.name}
                              >
                                {d.name}
                              </h3>
                              {/* Line 2: Units on Line 2 directly below designation */}
                              <p className="mt-0.5 text-xs font-semibold text-[#8a6412] whitespace-nowrap">
                                {unitsLabel(d.deload_units)} deload
                              </p>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        {/* Hierarchical metadata & badges */}
                        {(d.code || isSub || subCount > 0) && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {d.code && (
                              <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-gray-500">
                                {d.code}
                              </span>
                            )}
                            {isSub && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 truncate max-w-full">
                                <CornerDownRight size={11} className="shrink-0 text-slate-400" />
                                <span className="truncate">Under {d.parent?.name ?? 'Parent'}</span>
                              </span>
                            )}
                            {subCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#5A1220]/[0.07] px-2 py-0.5 text-[10px] font-bold text-[#5A1220]">
                                <FolderTree size={10} /> Heading ({subCount})
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Footer / Metrics & Actions */}
                      <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Users size={13} className="text-gray-400" />
                          <span className="font-semibold text-gray-700">
                            {holders > 0 ? `${holders} holder${holders === 1 ? '' : 's'}` : 'Unassigned'}
                          </span>
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-1">
                            {d.parent_id === null && (d.faculties_count ?? 0) === 0 && (
                              <TableActionButton label={`Add sub-designation under ${d.name}`} variant="view" onClick={() => openCreate(d)}>
                                <Plus size={14} />
                              </TableActionButton>
                            )}
                            <TableActionButton label={`Edit ${d.name}`} variant="edit" onClick={() => openEdit(d)}>
                              <Pencil size={14} />
                            </TableActionButton>
                            <TableActionButton label={`Archive ${d.name}`} variant="danger" onClick={() => setPendingDelete(d)}>
                              <Trash2 size={14} />
                            </TableActionButton>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <DataTable
            table={table}
            variant="embedded"
            isLoading={isLoading}
            loadingRows={4}
            totalLabel="designations"
            ariaLabel="Designations"
            emptyState={
              <div className="mx-auto flex max-w-sm flex-col items-center py-8">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C9952A]/10 text-[#C9952A]">
                  {isSearching ? <Search size={22} /> : <Award size={22} />}
                </span>
                <p className="text-sm font-bold text-gray-800">
                  {isSearching ? `No designations match “${designationSearch.trim()}”.` : 'No designations yet.'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {isSearching
                    ? 'Check the spelling or clear the search to see every designation.'
                    : canManage
                      ? 'Add the posts your institution recognises — each with the units it deloads.'
                      : 'Ask the VPAA to add the designations your institution recognises.'}
                </p>
                {isSearching ? (
                  <button
                    type="button"
                    onClick={() => setDesignationSearch('')}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                  >
                    <X size={14} /> Clear search
                  </button>
                ) : canManage && (
                  <button
                    type="button"
                    onClick={() => openCreate()}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#5A1220] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#4a0f1a]"
                  >
                    <Plus size={14} /> Add the first designation
                  </button>
                )}
              </div>
            }
          />
        )}
      </section>
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : form.parent_id ? `Add a sub-designation under ${designations.find((d) => d.id === form.parent_id)?.name ?? 'the parent'}` : 'Add Designation'}
        description="The deload is what this post takes off an instructor's maximum units."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-xl bg-[#5A1220] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#4a0f1a] disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Create Designation'}
            </button>
          </div>
        }
      >
        {/* Modal renders children with no padding of its own, so the body
            supplies it -- matching the header and footer insets. */}
        <div className="space-y-4 p-5 sm:p-6">
          {/* Designation Details preview showing Designation on Line 1 and Units directly below */}
          {(editing || form.name.trim()) && (
            <div className="rounded-xl border border-gray-200/90 bg-gray-50/70 p-3 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#5A1220] to-[#8a2434] text-xs font-black text-white shadow-xs">
                {initialsOf(form.name.trim() || editing?.name || '')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-gray-900 whitespace-nowrap truncate" title={form.name.trim() || editing?.name}>
                  {form.name.trim() || editing?.name || 'New Designation'}
                </div>
                <div className="text-xs font-semibold text-[#8a6412] whitespace-nowrap">
                  {unitsLabel(form.deload_units)} deload
                </div>
              </div>
            </div>
          )}

          <Field label="Parent Designation" error={fieldErrors.parent_id}>
            <select
              value={form.parent_id ?? ''}
              disabled={editingHasChildren}
              onChange={(event) => setForm((prev) => ({ ...prev, parent_id: event.target.value ? Number(event.target.value) : null }))}
              className={`${inputClass(fieldErrors.parent_id)} disabled:bg-gray-50 disabled:text-gray-500`}
            >
              <option value="">None — a top-level designation</option>
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>{parent.name}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-500">
              {editingHasChildren
                ? 'This designation has sub-designations of its own, so it stays top-level.'
                : "Put it under a heading like Director to create a sub-designation, e.g. Director · Networking Dev't. A heading cannot itself be assigned."}
            </span>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="Designation Name" error={fieldErrors.name} required>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={form.parent_id ? "e.g. Networking Dev't" : 'e.g. Dean, Program Chairperson'}
                className={inputClass(fieldErrors.name)}
              />
            </Field>
            <Field label="Deload Units" error={fieldErrors.deload_units} required>
              <NumberInput
                min={0}
                value={form.deload_units}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, deload_units: Number(event.target.value) || 0 }))
                }
                className={inputClass(fieldErrors.deload_units)}
              />
            </Field>
          </div>

          {form.deload_units > 0 && (
            <p className="rounded-xl bg-[#C9952A]/10 px-3 py-2 text-xs text-[#7a5a10]">
              An instructor with a 21-unit maximum holding this designation carries a Basic Load of{' '}
              <strong>{Math.max(0, 21 - form.deload_units)} units</strong>.
            </p>
          )}

          {editing && (editing.faculties_count ?? 0) > 0 && form.deload_units !== editing.deload_units && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {editing.faculties_count} instructor{(editing.faculties_count ?? 0) === 1 ? '' : 's'} hold
                this designation. Saving will change their deload to {form.deload_units} units.
              </span>
            </p>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Archive designation?"
        message={
          pendingDelete
            ? `${pendingDelete.name} will no longer be assignable to instructors.`
            : ''
        }
        confirmLabel="Archive"
        variant="danger"
        isConfirming={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

const inputClass = (error?: string): string =>
  `w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
    error
      ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
      : 'border-gray-200 focus:border-[#C9952A] focus:ring-[#C9952A]/20'
  }`;

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </label>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  isLoading,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  isLoading: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-white p-3 shadow-xs">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5A1220] via-[#8a2434] to-[#C9952A]" />
      <div className="flex items-center justify-between gap-2.5 pt-0.5">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">{label}</p>
          {isLoading
            ? <Skeleton className="mt-1 h-6 w-10" />
            : <p className="mt-0.5 text-xl font-black tabular-nums text-[#5A1220]">{value}</p>}
          <p className="truncate text-[11px] text-gray-400 leading-tight">{hint}</p>
        </div>
        <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-[#C9952A]/10 text-[#C9952A]">{icon}</span>
      </div>
    </div>
  );
}
