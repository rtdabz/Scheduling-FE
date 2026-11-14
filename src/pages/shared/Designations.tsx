import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import NumberInput from '../../components/ui/NumberInput';
import { AlertTriangle, ArrowRight, Award, CornerDownRight, Eye, FolderTree, LayoutGrid, List, Pencil, Plus, Search, TrendingDown, Users, X, Archive } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Skeleton from '../../components/ui/Skeleton';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import { hasStoredCapability } from '../../lib/storedUser';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import {
  basicLoadAfterDeload,
  createDesignation,
  deleteDesignation,
  designationLabel,
  emptyDesignation,
  fetchDesignationHolders,
  fetchDesignations,
  updateDesignation,
  type Designation,
  type DesignationHolder,
  type DesignationInput,
} from '../../lib/designations';
import { formatPersonListName } from '../../lib/personName';
import { modalControl, modalError, modalLabel } from '../../components/ui/modalStyles';
import { ModalButton } from '../../components/ui/ModalForm';

const MANAGE_CAPABILITY = 'faculty.manage_designations';

const REFERENCE_MAX_UNITS = 21;

const unitsLabel = (units: number) => `${units} ${units === 1 ? 'unit' : 'units'}`;

const DESIGNATIONS_CACHE_KEY = 'page:faculty:designations';

interface SubDesignationRow {
  id: string;
  name: string;
  deload_units: number;
  error?: string;
}

const newSubRow = (deload_units = 0): SubDesignationRow => ({
  id: `${Date.now()}${Math.random().toString().slice(2, 6)}`,
  name: '',
  deload_units,
});

const normalizeDesignationName = (name: string) => name.trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase();

const addSubBlockedReason = (d: Designation): string | null => {
  if (d.parent_id !== null) return `${d.name} is already a sub-designation. Sub-designations go one level deep.`;
  const holders = d.faculties_count ?? 0;
  if (holders > 0 && (d.children_count ?? 0) === 0) {
    return `${d.name} is held by ${holders} instructor${holders === 1 ? '' : 's'}. Clear it from them before adding sub-designations.`;
  }
  return null;
};

export default function Designations() {
  const { toast } = useToast();
  const [designations, setDesignations] = useState<Designation[]>(() => getCachedData<Designation[]>(DESIGNATIONS_CACHE_KEY) ?? []);
  const [isLoading, setIsLoading] = useState(() => !hasCachedData(DESIGNATIONS_CACHE_KEY));
  const [designationSearch, setDesignationSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [subsParentId, setSubsParentId] = useState<number | null>(null);

  const [editing, setEditing] = useState<Designation | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<DesignationInput>(emptyDesignation());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [subRows, setSubRows] = useState<SubDesignationRow[]>(() => [newSubRow()]);

  const [pendingDelete, setPendingDelete] = useState<Designation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [viewingHolders, setViewingHolders] = useState<Designation | null>(null);

  const canManage = hasStoredCapability(MANAGE_CAPABILITY);

  const load = useCallback(async () => {
    if (!hasCachedData(DESIGNATIONS_CACHE_KEY)) setIsLoading(true);
    try {
      const rows = await fetchDesignations();
      setCachedData(DESIGNATIONS_CACHE_KEY, rows);
      setDesignations(rows);
    } catch {
      toast.error('Could not load designations', 'Please refresh the page and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Sub-designations live in their heading's modal, so the page lists top-level designations
  // only (plus any sub-designation whose heading is missing, so it never disappears).
  const visible = useMemo(() => {
    const ids = new Set(designations.map((d) => d.id));
    const rows = designations.filter((d) => d.parent_id === null || !ids.has(d.parent_id));

    const needle = designationSearch.trim().toLowerCase();
    if (!needle) return rows;
    const matches = (d: Designation) => designationLabel(d).toLowerCase().includes(needle);
    return rows.filter((d) => matches(d) || designations.some((child) => child.parent_id === d.id && matches(child)));
  }, [designations, designationSearch]);

  const isSearching = designationSearch.trim() !== '';
  const subsParent = subsParentId === null ? null : designations.find((d) => d.id === subsParentId) ?? null;
  const subsOfParent = useMemo(
    () => (subsParentId === null ? [] : designations.filter((d) => d.parent_id === subsParentId)),
    [designations, subsParentId],
  );

  const parentOptions = useMemo(
    () => designations.filter((d) => d.parent_id === null && d.id !== editing?.id),
    [designations, editing],
  );
  const editingHasChildren = editing !== null && designations.some((d) => d.parent_id === editing.id);

  // Creating under a heading takes several sub-designations at once, like adding sections.
  const isBatchCreate = editing === null && form.parent_id !== null;
  const siblingNames = useMemo(
    () => new Set(designations.filter((d) => d.parent_id === form.parent_id).map((d) => normalizeDesignationName(d.name))),
    [designations, form.parent_id],
  );
  const liveSubRowErrors = (() => {
    const seen = new Set<string>();
    return subRows.map((row) => {
      const key = normalizeDesignationName(row.name);
      if (!key) return '';
      const message = siblingNames.has(key)
        ? `${row.name.trim()} already exists under this heading.`
        : seen.has(key) ? 'Duplicate name in this list' : '';
      seen.add(key);
      return message;
    });
  })();
  const subDuplicateCount = isBatchCreate ? liveSubRowErrors.filter(Boolean).length : 0;

  const addSubRow = () => setSubRows((prev) => [...prev, newSubRow(prev[prev.length - 1]?.deload_units ?? 0)]);
  const updateSubRow = (id: string, patch: Partial<Pick<SubDesignationRow, 'name' | 'deload_units'>>) =>
    setSubRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, error: '' } : r)));
  const removeSubRow = (id: string) => setSubRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

  const openCreate = (parent: Designation | null = null) => {
    setEditing(null);
    setForm({ ...emptyDesignation(), parent_id: parent?.id ?? null });
    setSubRows([newSubRow()]);
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
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 whitespace-nowrap">
                <span className="whitespace-nowrap font-bold text-gray-900" title={designation.name}>{designation.name}</span>
                {designation.code && (
                  <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-px font-mono text-[10px] font-bold uppercase text-gray-500">
                    {designation.code}
                  </span>
                )}
                {subCount > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#5A1220]/[0.07] px-2 py-0.5 text-[11px] font-semibold text-[#5A1220] whitespace-nowrap">
                    <FolderTree size={10} /> Heading · {subCount} sub-designation{subCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
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
      meta: { hideBelow: 'md' },
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
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
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
      cell: ({ row }: { row: { original: Designation } }) => {
        const isHeadingRow = (row.original.children_count ?? 0) > 0;
        return (
        <div className="flex items-center justify-end gap-2">
          {!isHeadingRow && (
            <TableActionButton label={`View instructors holding ${row.original.name}`} variant="view" onClick={() => setViewingHolders(row.original)}>
              <Eye size={15} />
            </TableActionButton>
          )}
          {row.original.parent_id === null && (
            <TableActionButton
              label={`Sub-designations under ${row.original.name}`}
              variant="neutral"
              aria-haspopup="dialog"
              onClick={() => setSubsParentId(row.original.id)}
            >
              <FolderTree size={15} />
            </TableActionButton>
          )}
          <TableActionButton label={`Edit ${row.original.name}`} variant="edit" onClick={() => openEdit(row.original)}>
            <Pencil size={15} />
          </TableActionButton>
          <TableActionButton label={`Archive ${row.original.name}`} variant="archive" onClick={() => setPendingDelete(row.original)}>
            <Archive size={15} />
          </TableActionButton>
        </div>
        );
      },
    } satisfies ColumnDef<Designation>] : []),
  ], [canManage, openEdit]);

  const table = useDataTable({ data: visible, columns, pageSize: 10, getRowId: (designation) => String(designation.id) });

  const applySaved = (saved: Designation, previousParentId: number | null) => {
    setDesignations((current) => {
      const exists = current.some((d) => d.id === saved.id);
      const next = (exists ? current.map((d) => (d.id === saved.id ? { ...d, ...saved } : d)) : [...current, saved]).map((d) => {
        let delta = 0;
        if (previousParentId !== saved.parent_id) {
          if (d.id === previousParentId) delta -= 1;
          if (d.id === saved.parent_id) delta += 1;
        }
        return delta === 0 ? d : { ...d, children_count: Math.max(0, (d.children_count ?? 0) + delta) };
      });
      return next.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    });
  };

  const handleSaveBatch = async () => {
    if (form.parent_id === null || subDuplicateCount > 0) return;
    const parentId = form.parent_id;
    const validated = subRows.map((row) => ({
      ...row,
      name: row.name.trim(),
      error: row.name.trim() ? '' : 'A designation name is required.',
    }));
    setSubRows(validated);
    if (validated.some((r) => r.error)) return;

    setIsSaving(true);
    setFieldErrors({});
    const failed: SubDesignationRow[] = [];
    let created = 0;
    for (const row of validated) {
      try {
        const saved = await createDesignation({ ...emptyDesignation(), parent_id: parentId, name: row.name, deload_units: row.deload_units });
        applySaved(saved, null);
        created += 1;
      } catch (error) {
        const response = (error as { response?: { status?: number; data?: { errors?: Record<string, string[]>; message?: string } } }).response;
        if (response?.status === 403) {
          toast.error('Not permitted', 'You do not have the Manage Designations capability.');
          setIsSaving(false);
          return;
        }
        if (response?.status === 422 && response.data?.errors) {
          if (response.data.errors.parent_id) setFieldErrors({ parent_id: response.data.errors.parent_id[0] });
        }
        const errors = response?.data?.errors;
        failed.push({
          ...row,
          error: errors?.name?.[0] ?? errors?.deload_units?.[0] ?? errors?.parent_id?.[0] ?? response?.data?.message ?? 'Could not be saved.',
        });
      }
    }
    setIsSaving(false);

    if (failed.length === 0) {
      toast.success(
        created === 1 ? 'Sub-designation created' : `${created} sub-designations created`,
        'They can now be assigned to instructors.',
      );
      setIsFormOpen(false);
      return;
    }
    setSubRows(failed);
    if (created > 0) {
      toast.error(`${created} saved, ${failed.length} not saved`, 'Fix the highlighted rows and try again.');
    }
  };

  const handleSave = async () => {
    if (isBatchCreate) {
      await handleSaveBatch();
      return;
    }
    if (!form.name.trim()) {
      setFieldErrors({ name: 'A designation name is required.' });
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    try {
      if (editing) {
        const { designation: saved, holdersUpdated } = await updateDesignation(editing.id, {
          name: form.name,
          deload_units: form.deload_units,
          parent_id: form.parent_id,
        });
        applySaved(saved, editing.parent_id);
        toast.success(
          'Designation updated',
          holdersUpdated > 0
            ? `${form.name} saved. ${holdersUpdated} instructor${holdersUpdated === 1 ? '' : 's'} had their deload updated.`
            : `${form.name} saved.`,
        );
      } else {
        applySaved(await createDesignation(form), null);
        toast.success('Designation created', `${form.name} can now be assigned to instructors.`);
      }
      setIsFormOpen(false);
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

  return (
    <div className="space-y-4 sm:space-y-5">
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

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-gray-200 rounded-2xl p-3.5 shadow-xs">
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
          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`selection-indicator p-1.5 sm:p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'grid'
                  ? 'shadow-sm font-bold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`selection-indicator p-1.5 sm:p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'list'
                  ? 'shadow-sm font-bold'
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
              className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={15} />
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
                      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5A1220] via-[#8a2434] to-[#C9952A]" />

                      <div className="space-y-2 pt-0.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="min-w-0 flex-1">
                              <h3
                                className="text-sm font-bold text-gray-900 leading-tight whitespace-nowrap truncate"
                                title={d.name}
                              >
                                {d.name}
                              </h3>
                              <p className="mt-0.5 text-xs font-semibold text-[#8a6412] whitespace-nowrap">
                                {unitsLabel(d.deload_units)} deload
                              </p>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                              active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

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
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#5A1220]/[0.07] px-2 py-0.5 text-[11px] font-semibold text-[#5A1220] whitespace-nowrap">
                                <FolderTree size={10} /> Heading ({subCount})
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Users size={13} className="text-gray-400" />
                          <span className="font-semibold text-gray-700">
                            {holders > 0 ? `${holders} holder${holders === 1 ? '' : 's'}` : 'Unassigned'}
                          </span>
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-1">
                            {subCount === 0 && (
                              <TableActionButton label={`View instructors holding ${d.name}`} variant="view" onClick={() => setViewingHolders(d)}>
                                <Eye size={14} />
                              </TableActionButton>
                            )}
                            {!isSub && (
                              <TableActionButton
                                label={`Sub-designations under ${d.name}`}
                                variant="neutral"
                                aria-haspopup="dialog"
                                onClick={() => setSubsParentId(d.id)}
                              >
                                <FolderTree size={14} />
                              </TableActionButton>
                            )}
                            <TableActionButton label={`Edit ${d.name}`} variant="edit" onClick={() => openEdit(d)}>
                              <Pencil size={14} />
                            </TableActionButton>
                            <TableActionButton label={`Archive ${d.name}`} variant="archive" onClick={() => setPendingDelete(d)}>
                              <Archive size={14} />
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
            onRowClick={canManage ? (designation) => ((designation.children_count ?? 0) > 0 ? setSubsParentId(designation.id) : setViewingHolders(designation)) : undefined}
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
          <>
            {isBatchCreate && (
              <p className={`mr-auto text-xs ${subDuplicateCount ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                {subDuplicateCount
                  ? `Rename ${subDuplicateCount === 1 ? 'the highlighted row' : `the ${subDuplicateCount} highlighted rows`} to continue.`
                  : `${subRows.length} sub-designation${subRows.length === 1 ? '' : 's'} will be created.`}
              </p>
            )}
            <ModalButton
              onClick={() => setIsFormOpen(false)}
            >
              Cancel
            </ModalButton>
            <ModalButton
              variant="primary"
              onClick={handleSave}
              disabled={isSaving || subDuplicateCount > 0}
            >
              {isSaving
                ? 'Saving…'
                : editing
                  ? 'Save Changes'
                  : isBatchCreate && subRows.length > 1
                    ? `Create ${subRows.length} Sub-designations`
                    : 'Create Designation'}
            </ModalButton>
          </>
        }
      >
        <div className="space-y-4 p-5 sm:p-6">
          {!isBatchCreate && (editing || form.name.trim()) && (
            <div className="rounded-xl border border-gray-200/90 bg-gray-50/70 p-3 flex items-center gap-3">
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

          {isBatchCreate ? (
            <div>
              <span className={modalLabel}>Sub-designations</span>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="max-h-[min(20rem,42dvh)] overflow-y-auto [scrollbar-width:thin]">
                  <div className="sticky top-0 z-10 hidden grid-cols-[1.5rem_minmax(0,1fr)_7rem_2.5rem] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 sm:grid">
                    <span>#</span>
                    <span>Designation name <span className="text-red-500">*</span></span>
                    <span>Deload units <span className="text-red-500">*</span></span>
                    <span className="sr-only">Actions</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {subRows.map((row, index) => {
                      const rowError = row.error || liveSubRowErrors[index];
                      return (
                        <li
                          key={row.id}
                          className="grid grid-cols-[1.5rem_minmax(0,1fr)_2.5rem] items-start gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[1.5rem_minmax(0,1fr)_7rem_2.5rem]"
                        >
                          <span className="flex h-10 items-center text-xs font-bold tabular-nums text-gray-400">{index + 1}</span>
                          <div className="min-w-0">
                            <input
                              type="text"
                              aria-label={`Sub-designation ${index + 1} name`}
                              value={row.name}
                              onChange={(event) => updateSubRow(row.id, { name: event.target.value })}
                              placeholder={index === 0 ? "e.g. Networking Dev't" : 'Another sub-designation'}
                              aria-invalid={Boolean(rowError)}
                              className={inputClass(rowError)}
                            />
                            {rowError && <span role="alert" className={`block ${modalError}`}>{rowError}</span>}
                          </div>
                          <NumberInput
                            min={0}
                            aria-label={`Sub-designation ${index + 1} deload units`}
                            value={row.deload_units}
                            onChange={(event) => updateSubRow(row.id, { deload_units: Number(event.target.value) || 0 })}
                            className={`${inputClass()} col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto`}
                          />
                          <div className="col-start-3 row-start-1 flex h-10 items-center justify-end sm:col-start-auto sm:row-start-auto">
                            <TableActionButton
                              label="Remove"
                              aria-label={`Remove sub-designation ${index + 1}`}
                              variant="remove"
                              onClick={() => removeSubRow(row.id)}
                              disabled={subRows.length <= 1}
                            >
                              <X size={15} />
                            </TableActionButton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={addSubRow}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm font-semibold text-[#8a5a12] transition hover:bg-amber-50"
                >
                  <Plus size={16} />
                  Add another sub-designation
                </button>
              </div>
              <span className="mt-1 block text-[11px] text-gray-500">
                With a {REFERENCE_MAX_UNITS}-unit maximum, an instructor's Basic Load is {REFERENCE_MAX_UNITS} minus the deload.
              </span>
            </div>
          ) : (
          <>
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
          </>
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

      <SubDesignationsModal
        parent={subsParent}
        subs={subsOfParent}
        canManage={canManage}
        highlight={designationSearch.trim().toLowerCase()}
        onClose={() => setSubsParentId(null)}
        onAdd={() => { if (subsParent) openCreate(subsParent); }}
        onEdit={openEdit}
        onArchive={setPendingDelete}
        onViewHolders={setViewingHolders}
      />

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

      <DesignationHoldersModal designation={viewingHolders} onClose={() => setViewingHolders(null)} />
    </div>
  );
}

function SubDesignationsModal({
  parent,
  subs,
  canManage,
  highlight,
  onClose,
  onAdd,
  onEdit,
  onArchive,
  onViewHolders,
}: {
  parent: Designation | null;
  subs: Designation[];
  canManage: boolean;
  highlight: string;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (designation: Designation) => void;
  onArchive: (designation: Designation) => void;
  onViewHolders: (designation: Designation) => void;
}) {
  const blocked = parent ? addSubBlockedReason(parent) : null;

  return (
    <Modal
      isOpen={parent !== null}
      onClose={onClose}
      title={parent ? `Sub-designations under ${parent.name}` : ''}
      description="A heading with sub-designations cannot itself be assigned; instructors hold one of its sub-designations."
      size="lg"
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {subs.length} sub-designation{subs.length === 1 ? '' : 's'}
          </p>
          {canManage && (
            <ModalButton
              variant="primary"
              onClick={onAdd}
              disabled={blocked !== null}
              title={blocked ?? undefined}
            >
              <Plus size={14} /> Add Sub-designation
            </ModalButton>
          )}
        </div>

        {canManage && blocked && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{blocked}</span>
          </p>
        )}

        {subs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C9952A]/10 text-[#C9952A]">
              <FolderTree size={20} />
            </span>
            <p className="text-sm font-bold text-gray-800">No sub-designations yet.</p>
            <p className="mt-1 px-4 text-xs text-gray-500">
              {canManage && !blocked
                ? `Add one to turn ${parent?.name ?? 'this designation'} into a heading, e.g. Director · Networking Dev't.`
                : 'Sub-designations added under this heading will appear here.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {subs.map((sub) => {
              const holders = sub.faculties_count ?? 0;
              const active = sub.status !== 'inactive';
              const isMatch = highlight !== '' && sub.name.toLowerCase().includes(highlight);
              return (
                <li key={sub.id} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${isMatch ? 'bg-[#C9952A]/[0.06]' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-gray-900" title={sub.name}>{sub.name}</span>
                      {sub.code && (
                        <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-px font-mono text-[10px] font-bold uppercase text-gray-500">
                          {sub.code}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <span className="font-semibold text-[#8a6412]">{unitsLabel(sub.deload_units)} deload</span>
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        <Users size={12} className="text-gray-400" />
                        {holders > 0 ? `${holders} ${holders === 1 ? 'instructor' : 'instructors'}` : 'Not assigned yet'}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <TableActionButton label={`View instructors holding ${sub.name}`} variant="view" onClick={() => onViewHolders(sub)}>
                      <Eye size={15} />
                    </TableActionButton>
                    {canManage && (
                      <>
                        <TableActionButton label={`Edit ${sub.name}`} variant="edit" onClick={() => onEdit(sub)}>
                          <Pencil size={15} />
                        </TableActionButton>
                        <TableActionButton label={`Archive ${sub.name}`} variant="archive" onClick={() => onArchive(sub)}>
                          <Archive size={15} />
                        </TableActionButton>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

const holderName = (h: DesignationHolder): string => formatPersonListName(h);

const holderColumns: ColumnDef<DesignationHolder>[] = [
  {
    id: 'name',
    accessorFn: holderName,
    header: 'Instructor',
    cell: ({ getValue }) => <span className="font-bold text-gray-900">{getValue<string>()}</span>,
  },
  {
    id: 'department',
    accessorFn: (h) => h.department?.department_code ?? h.department?.department_name ?? '',
    header: 'Department',
    cell: ({ row }) => (
      <span className="text-xs font-semibold text-gray-600" title={row.original.department?.department_name}>
        {row.original.department?.department_code ?? row.original.department?.department_name ?? '—'}
      </span>
    ),
  },
  {
    id: 'employment_type',
    accessorKey: 'employment_type',
    header: 'Type',
    cell: ({ getValue }) => (
      <span className="text-xs font-semibold capitalize text-gray-600">{getValue<string>()?.replace('-', ' ')}</span>
    ),
  },
  {
    id: 'deload',
    accessorKey: 'deload_units',
    header: 'Total deload',
    cell: ({ getValue }) => <span className="text-xs font-black text-[#8a6412]">{unitsLabel(getValue<number>())}</span>,
  },
];

function DesignationHoldersModal({ designation, onClose }: { designation: Designation | null; onClose: () => void }) {
  const { toast } = useToast();
  const [holders, setHolders] = useState<DesignationHolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const table = useDataTable({ data: holders, columns: holderColumns, pageSize: 10, getRowId: (h) => String(h.id) });

  useEffect(() => {
    if (!designation) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setHolders([]);
    fetchDesignationHolders(designation.id)
      .then((rows) => { if (!cancelled) setHolders(rows); })
      .catch(() => { if (!cancelled) toast.error('Could not load instructors', 'Please try again.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [designation, toast]);

  return (
    <Modal
      isOpen={designation !== null}
      onClose={onClose}
      title={designation ? `Instructors holding ${designationLabel(designation)}` : ''}
      description="Total deload is the sum across every designation the instructor holds."
      size="lg"
    >
      <DataTable
        table={table}
        variant="embedded"
        isLoading={isLoading}
        loadingRows={3}
        totalLabel="instructors"
        ariaLabel="Designation holders"
        emptyTitle="No instructors hold this designation yet."
      />
    </Modal>
  );
}

const inputClass = (error?: string): string => modalControl(Boolean(error));

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
      <span className={modalLabel}>
        {label}
        {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </span>
      {children}
      {error && <span className={`block ${modalError}`}>{error}</span>}
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
