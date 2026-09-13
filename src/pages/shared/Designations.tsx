import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Award, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Skeleton from '../../components/ui/Skeleton';
import TableActionButton from '../../components/ui/TableActionButton';
import { hasStoredCapability } from '../../lib/storedUser';
import {
  createDesignation,
  deleteDesignation,
  emptyDesignation,
  fetchDesignations,
  updateDesignation,
  type Designation,
  type DesignationInput,
} from '../../lib/designations';

const MANAGE_CAPABILITY = 'faculty.manage_designations';

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

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return designations;
    return designations.filter((d) =>
      [d.name, d.code ?? '', d.description ?? ''].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [designations, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyDesignation());
    setFieldErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (designation: Designation) => {
    setEditing(designation);
    setForm({
      name: designation.name,
      code: designation.code,
      deload_units: designation.deload_units,
      description: designation.description,
      status: designation.status,
      sort_order: designation.sort_order,
    });
    setFieldErrors({});
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFieldErrors({ name: 'A designation name is required.' });
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    try {
      if (editing) {
        const { holdersUpdated } = await updateDesignation(editing.id, form);
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

  return (
    <div className="space-y-6">
      {/* The page title is rendered by the layout's PageHeader. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Designations" value={designations.length} icon={<Award size={18} />} />
        <StatCard
          label="Active"
          value={designations.filter((d) => d.status === 'active').length}
          icon={<Award size={18} />}
        />
        <StatCard label="Instructors holding one" value={totalHolders} icon={<Users size={18} />} />
      </div>

      {/* Search and actions bar — the primary action sits with the filters,
          matching Users, Faculty, and Rooms. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search designations"
            aria-label="Search designations"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20"
          />
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5A1220] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4a0f1a]"
          >
            <Plus size={16} />
            Add Designation
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-gray-50/95">
              <tr className="border-b border-gray-200">
                {['Designation', 'Code', 'Deload', 'Holders', 'Status', ''].map((heading, index) => (
                  <th
                    key={heading || `actions-${index}`}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-gray-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    {Array.from({ length: 6 }).map((__, cell) => (
                      <td key={cell} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm font-bold text-gray-700">No designations yet.</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {canManage
                        ? 'Add the posts your institution recognises — each with the units it deloads.'
                        : 'Ask the VPAA to add the designations your institution recognises.'}
                    </p>
                  </td>
                </tr>
              ) : (
                visible.map((designation) => (
                  <tr key={designation.id} className="transition hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{designation.name}</p>
                      {designation.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{designation.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{designation.code ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md border border-[#C9952A]/30 bg-[#C9952A]/10 px-2 py-0.5 text-xs font-black text-[#8a6412]">
                        {designation.deload_units} {designation.deload_units === 1 ? 'unit' : 'units'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{designation.faculties_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          designation.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {designation.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <TableActionButton
                            label={`Edit ${designation.name}`}
                            variant="edit"
                            onClick={() => openEdit(designation)}
                          >
                            <Pencil size={15} />
                          </TableActionButton>
                          <TableActionButton
                            label={`Archive ${designation.name}`}
                            variant="danger"
                            onClick={() => setPendingDelete(designation)}
                          >
                            <Trash2 size={15} />
                          </TableActionButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add Designation'}
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
          <Field label="Designation Name" error={fieldErrors.name} required>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. Dean, Program Chairperson, Laboratory Head"
              className={inputClass(fieldErrors.name)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Short Code" error={fieldErrors.code}>
              <input
                type="text"
                value={form.code ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value || null }))}
                placeholder="Optional"
                className={inputClass(fieldErrors.code)}
              />
            </Field>

            <Field label="Deload Units" error={fieldErrors.deload_units} required>
              <input
                type="number"
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

          <Field label="Description" error={fieldErrors.description}>
            <input
              type="text"
              value={form.description ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value || null }))}
              placeholder="Optional note about this post"
              className={inputClass(fieldErrors.description)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" error={fieldErrors.status}>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as 'active' | 'inactive' }))
                }
                className={inputClass(fieldErrors.status)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>

            <Field label="Sort Order" error={fieldErrors.sort_order}>
              <input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(event) => setForm((prev) => ({ ...prev, sort_order: Number(event.target.value) || 0 }))}
                className={inputClass(fieldErrors.sort_order)}
              />
            </Field>
          </div>

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

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="text-[#C9952A]">{icon}</span>
        <span className="text-[10px] font-extrabold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-black text-[#5A1220]">{value}</p>
    </div>
  );
}
