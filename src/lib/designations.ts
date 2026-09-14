import api from './api';

/**
 * An administrative designation an instructor may hold.
 *
 * Deliberately has no enum of names anywhere in the client: the list is
 * institution data maintained through the Designations screen, so a school can
 * add "Research Coordinator" without a code change.
 *
 * A designation may sit under one other, one level deep ("Director" over
 * "Networking Dev't"). A designation with sub-designations is a heading: it is
 * the sub-designations that instructors hold.
 */
export interface Designation {
  id: number;
  parent_id: number | null;
  name: string;
  /** "Director · Networking Dev't" for a sub-designation, the bare name otherwise. */
  label?: string;
  parent?: { id: number; name: string } | null;
  code: string | null;
  deload_units: number;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  /** How many instructors currently hold it; present on list/detail reads. */
  faculties_count?: number;
  /** How many sub-designations sit under it; a heading when above zero. */
  children_count?: number;
}

export interface DesignationInput {
  parent_id: number | null;
  name: string;
  code: string | null;
  deload_units: number;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
}

/** The server refuses a fourth; the pickers stop at the same number. */
export const MAX_DESIGNATIONS_PER_INSTRUCTOR = 3;

export const emptyDesignation = (): DesignationInput => ({
  parent_id: null,
  name: '',
  code: null,
  deload_units: 0,
  description: null,
  status: 'active',
  sort_order: 0,
});

/**
 * @param activeOnly pickers pass true so a retired designation cannot be newly
 *   assigned; the management screen passes false so it can still be edited.
 */
export const fetchDesignations = async (activeOnly = false): Promise<Designation[]> => {
  const { data } = await api.get<Designation[]>('/designations', {
    params: activeOnly ? { active_only: 1 } : undefined,
  });
  return Array.isArray(data) ? data : [];
};

export const createDesignation = async (input: DesignationInput): Promise<Designation> => {
  const { data } = await api.post<{ data: Designation }>('/designations', input);
  return data.data;
};

export const updateDesignation = async (
  id: number,
  input: Partial<DesignationInput>,
): Promise<{ designation: Designation; holdersUpdated: number }> => {
  const { data } = await api.patch<{ data: Designation; holders_updated: number }>(
    `/designations/${id}`,
    input,
  );
  return { designation: data.data, holdersUpdated: data.holders_updated ?? 0 };
};

export const deleteDesignation = async (id: number): Promise<void> => {
  await api.delete(`/designations/${id}`);
};

/** How a designation is shown and printed: "Director · Networking Dev't". */
export const designationLabel = (designation: Pick<Designation, 'name' | 'label' | 'parent'>): string =>
  designation.label ?? (designation.parent ? `${designation.parent.name} · ${designation.name}` : designation.name);

/** A designation with sub-designations is only a heading and cannot be held. */
export const isHeading = (designation: Designation, all: Designation[]): boolean =>
  (designation.children_count ?? 0) > 0 || all.some((other) => other.parent_id === designation.id);

/**
 * Designations arranged for a picker, in list order: a heading followed by the
 * sub-designations under it, or a stand-alone designation on its own.
 */
export interface DesignationGroup {
  heading: Designation | null;
  options: Designation[];
}

export const groupDesignations = (list: Designation[]): DesignationGroup[] => {
  const groups: DesignationGroup[] = [];
  const standalone: Designation[] = [];

  list.filter((designation) => designation.parent_id === null).forEach((top) => {
    const children = list.filter((designation) => designation.parent_id === top.id);
    if (children.length > 0 || isHeading(top, list)) {
      groups.push({ heading: top, options: children });
    } else {
      standalone.push(top);
    }
  });

  // A sub-designation whose parent is not in the list (an inactive heading, say)
  // is still offered, under its parent's name.
  const orphans = list.filter((designation) => (
    designation.parent_id !== null && !list.some((other) => other.id === designation.parent_id)
  ));

  return [
    ...(standalone.length > 0 ? [{ heading: null, options: standalone }] : []),
    ...groups,
    ...(orphans.length > 0 ? [{ heading: null, options: orphans }] : []),
  ];
};

/** The combined deload of the selected designations, as the server sums it. */
export const totalDeload = (selectedIds: string[], list: Designation[]): number =>
  selectedIds.reduce((sum, id) => sum + (list.find((designation) => String(designation.id) === id)?.deload_units ?? 0), 0);

/**
 * The Basic Load an instructor is left with once the designation's deload is
 * taken off — the same arithmetic SchedulingPolicy::facultyBasicLoad() applies
 * on the server, floored at zero so a deload larger than the ceiling reads as 0
 * rather than a negative.
 */
export const basicLoadAfterDeload = (maxUnits: number, deloadUnits: number): number =>
  Math.max(0, (maxUnits || 0) - (deloadUnits || 0));

/** "21 − 6 = 15 units", for the helper line under a designation picker. */
export const describeDeload = (maxUnits: number, deloadUnits: number): string => {
  if (!deloadUnits) return `Basic Load: ${maxUnits || 0} units`;
  return `Basic Load: ${maxUnits || 0} − ${deloadUnits} = ${basicLoadAfterDeload(maxUnits, deloadUnits)} units`;
};
