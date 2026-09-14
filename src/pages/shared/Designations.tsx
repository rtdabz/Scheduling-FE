import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import NumberInput from '../../components/ui/NumberInput';
import { AlertTriangle, ArrowRight, Award, CornerDownRight, FolderTree, Pencil, Plus, Search, TrendingDown, Trash2, Users, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Skeleton from '../../components/ui/Skeleton';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import { hasStoredCapability } from '../../lib/storedUser';
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
  const [search, setSearch] = useState('');

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

    const needle = search.trim().toLowerCase();
    if (!needle) return ordered;
    const matches = new Set(ordered.filter((d) => designationLabel(d).toLowerCase().includes(needle)).map((d) => d.id));
    return ordered.filter((d) => matches.has(d.id) || designations.some((child) => child.parent_id === d.id && matches.has(child.id)));
  }, [designations, search]);

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
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <span className="truncate">{designation.name}</span>
                {designation.code && (
                  <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-px font-mono text-[10px] font-bold uppercase text-gray-500">
                    {designation.code}
                  </span>
                )}
                {subCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#5A1220]/[0.07] px-2 py-px text-[10px] font-bold text-[#5A1220]">
                    <FolderTree size={10} /> Heading · {subCount} sub-designation{subCount === 1 ? '' : 's'}
                  </span>
                )}
              </p>
              <p className="max-w-xs truncate text-xs font-medium text-gray-400">
                {isSub ? `Under ${designation.parent?.name ?? 'another designation'}` : designation.description || 'No description'}
              </p>
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
  const isSearching = search.trim() !== '';

  return (
    <div className="space-y-6">
      {/* The page title is rendered by the layout's PageHeader. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Designations"
          value={designations.length}
          hint={`${activeCount} active`}
          icon={<Award size={18} />}
          isLoading={isLoading}
        />
        <StatCard
          label="Instructors holding one"
          value={totalHolders}
          hint="Across every designation"
          icon={<Users size={18} />}
          isLoading={isLoading}
        />
        <StatCard
          label="Units deloaded"
          value={unitsReleased}
          hint="Deload × holders, freed from teaching"
          icon={<TrendingDown size={18} />}
          isLoading={isLoading}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Toolbar lives on the card, so the list and its controls read as one unit. */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="text-sm font-black text-gray-900">Designation register</h2>
            <p className="text-xs text-gray-500">
              Each post takes its deload off a holder&apos;s maximum units to give their Basic Load.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search designations"
                aria-label="Search designations"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/60 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#C9952A] focus:bg-white focus:ring-2 focus:ring-[#C9952A]/20"
              />
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => openCreate()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5A1220] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#4a0f1a]"
              >
                <Plus size={16} />
                Add Designation
              </button>
            )}
          </div>
        </div>

        <DataTable
          table={table}
          variant="embedded"
          isLoading={isLoading}
          loadingRows={4}
          totalLabel="designations"
          ariaLabel="Designations"
          emptyState={
            <div className="mx-auto flex max-w-sm flex-col items-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C9952A]/10 text-[#C9952A]">
                {isSearching ? <Search size={22} /> : <Award size={22} />}
              </span>
              <p className="text-sm font-bold text-gray-800">
                {isSearching ? `No designations match “${search.trim()}”.` : 'No designations yet.'}
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
                  onClick={() => setSearch('')}
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
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5A1220] via-[#8a2434] to-[#C9952A]" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">{label}</p>
          {isLoading
            ? <Skeleton className="mt-2 h-8 w-12" />
            : <p className="mt-1 text-3xl font-black tabular-nums text-[#5A1220]">{value}</p>}
          <p className="mt-1 truncate text-xs text-gray-400">{hint}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C9952A]/10 text-[#C9952A]">{icon}</span>
      </div>
    </div>
  );
}
